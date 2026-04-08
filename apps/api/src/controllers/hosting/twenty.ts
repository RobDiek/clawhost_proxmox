/**
 * Twenty CRM — Install on existing VPS
 *
 * POST /hosting/instances/:id/integrations/twenty/install
 * Deploys Twenty CRM Docker containers on user's VPS
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

function sshExec(ip: string, command: string, password?: string, timeoutMs = 300000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch {}
        conn.connect(opts)
    })
}

export const installTwenty = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const components = (instance.selectedComponents as string[]) || []
        if (components.includes('tw')) {
            const subdomain = instance.subdomainName || instance.id
            return ok(c, { url: `https://crm.${subdomain}.clawflow.flowmatic.co.il` }, 'Twenty CRM already installed')
        }

        const subdomain = instance.subdomainName || instance.id
        const openclawToken = instance.openclawToken || 'twenty-secret'
        const automationPassword = instance.automationPassword || 'twenty-pass'

        // Generate APP_SECRET
        const appSecret = require('crypto').randomBytes(32).toString('hex')

        // Deploy Twenty CRM via SSH
        await sshExec(instance.ip, `
            # Create docker-compose for Twenty
            cat > /opt/openclaw/docker-compose.twenty.yml << 'TWEOF'
services:
  twenty:
    image: twentycrm/twenty:latest
    restart: unless-stopped
    ports: ["127.0.0.1:3080:3000"]
    depends_on:
      twenty-db:
        condition: service_healthy
      twenty-redis:
        condition: service_started
    environment:
      - SERVER_URL=https://crm.${subdomain}.clawflow.flowmatic.co.il
      - FRONT_BASE_URL=https://crm.${subdomain}.clawflow.flowmatic.co.il
      - PG_DATABASE_URL=postgresql://twenty:twenty@twenty-db:5432/twenty
      - REDIS_URL=redis://twenty-redis:6379
      - STORAGE_TYPE=local
      - STORAGE_LOCAL_PATH=/app/.local-storage
      - ACCESS_TOKEN_SECRET=${openclawToken}
      - LOGIN_TOKEN_SECRET=${automationPassword}
      - APP_SECRET=${appSecret}
      - IS_BILLING_ENABLED=false
      - DEFAULT_SUBDOMAIN=twenty

    volumes:
      - /opt/openclaw/data/twenty:/app/.local-storage

  twenty-db:
    image: twentycrm/twenty-postgres:latest
    restart: unless-stopped
    volumes:
      - /opt/openclaw/data/twenty-db:/bitnami/postgresql
    environment:
      - POSTGRESQL_USERNAME=twenty
      - POSTGRESQL_PASSWORD=twenty
      - POSTGRESQL_DATABASE=twenty
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U twenty -d twenty"]
      interval: 5s
      timeout: 5s
      retries: 10

  twenty-redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - /opt/openclaw/data/twenty-redis:/data
TWEOF
            mkdir -p /opt/openclaw/data/twenty /opt/openclaw/data/twenty-db /opt/openclaw/data/twenty-redis
            chown -R 1001:1001 /opt/openclaw/data/twenty-db
            cd /opt/openclaw && docker compose -f docker-compose.twenty.yml up -d
        `, instance.rootPassword || undefined, 300000)

        // Add nginx config
        await sshExec(instance.ip, `
            cat >> /etc/nginx/sites-available/openclaw << 'TWNGX'

server {
    listen 80;
    server_name crm.${subdomain}.clawflow.flowmatic.co.il;
    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_read_timeout 300s;
    }
}
TWNGX
            nginx -t && systemctl reload nginx
        `, instance.rootPassword || undefined)

        // Create DNS record
        try {
            const { default: cloudflare } = await import('@/services/cloudflare')
            await cloudflare.createDNSRecord(`crm.${subdomain}.clawflow`, instance.ip)
        } catch (err) {
            console.error('Failed to create Twenty DNS record:', err)
        }

        // SSL (background — may take a minute)
        sshExec(instance.ip, `
            for i in $(seq 1 20); do
              certbot --nginx \
                -d crm.${subdomain}.clawflow.flowmatic.co.il \
                --non-interactive --agree-tos \
                -m devops@flowmatic.co.il && break
              sleep 15
            done
        `, instance.rootPassword || undefined, 600000).catch(err => {
            console.error('Twenty SSL setup failed:', err)
        })

        // Install MCP server
        sshExec(instance.ip, 'npm install -g @iflow-mcp/oumnya-twenty-mcp-server 2>/dev/null || true',
            instance.rootPassword || undefined).catch(() => {})

        // Update components in DB
        const newComponents = [...components, 'tw']
        await db.update(instances).set({
            selectedComponents: newComponents as any,
        }).where(eq(instances.id, instanceId))

        const crmUrl = `https://crm.${subdomain}.clawflow.flowmatic.co.il`
        console.log(`Twenty CRM installed on ${instanceId}: ${crmUrl}`)

        return ok(c, { url: crmUrl }, 'Twenty CRM installed')
    } catch (err) {
        console.error('installTwenty error:', err)
        return fail(c, 'Failed to install Twenty CRM', 500)
    }
}
