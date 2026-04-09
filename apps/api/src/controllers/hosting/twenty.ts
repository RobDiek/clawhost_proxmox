/**
 * Twenty CRM — Install on existing VPS
 *
 * POST /hosting/instances/:id/integrations/twenty/install
 * Deploys Twenty CRM Docker containers on user's VPS
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, users } from '@/db/schema'
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

/**
 * Wait for Twenty to be ready, then create admin account via GraphQL.
 * Uses signUpInWorkspace which creates both user AND workspace.
 * Runs in background — if it fails, user can still register manually.
 */
async function autoSetupTwentyAdmin(ip: string, instanceId: string, userId: string | null, sshPassword?: string) {
    // Get user email from DB
    let email = 'admin@clawflow.co.il'
    if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (user?.email) email = user.email
    }

    // Generate a password for the Twenty admin
    const twentyPassword = randomBytes(12).toString('base64url')
    const twentyUrl = 'http://127.0.0.1:3080'

    // Fix storage permissions (Twenty runs as node user)
    await sshExec(ip, 'chmod 777 /opt/openclaw/data/twenty', sshPassword, 10000)

    // Wait for Twenty to become healthy (up to 3 min)
    const healthCmd = `for i in $(seq 1 36); do curl -sf -o /dev/null ${twentyUrl}/metadata -H 'Content-Type: application/json' -d '{"query":"{__typename}"}' && break; echo "waiting $i..."; sleep 5; done`
    await sshExec(ip, healthCmd, sshPassword, 210000)

    // signUpInWorkspace creates user + workspace in one call
    const safeEmail = email.replace(/["\\]/g, '')
    const safePass = twentyPassword.replace(/["\\]/g, '')
    const mutation = `mutation { signUpInWorkspace(email: "${safeEmail}", password: "${safePass}") { __typename } }`
    const payload = JSON.stringify({ query: mutation })
    const signupCmd = `curl -s -X POST ${twentyUrl}/metadata -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}'`
    const result = await sshExec(ip, signupCmd, sshPassword, 30000)
    console.log(`Twenty auto-setup for ${instanceId}: ${result}`)

    // Generate API key for MCP integration (agents need this)
    let twentyApiKey = ''
    try {
        // Wait for workspace to become ACTIVE (signUpInWorkspace sets PENDING_CREATION initially)
        const waitWsCmd = `for i in $(seq 1 12); do WS=$(PGPASSWORD=twenty docker exec -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty -t -A -c "SELECT id FROM core.workspace WHERE \\"activationStatus\\"='ACTIVE' LIMIT 1;"); [ -n "$WS" ] && echo "$WS" && exit 0; sleep 5; done; PGPASSWORD=twenty docker exec -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty -t -A -c "SELECT id FROM core.workspace LIMIT 1;"`
        const wsId = (await sshExec(ip, waitWsCmd, sshPassword, 90000)).trim()

        if (wsId) {
            // Generate API key via Twenty CLI (NODE_ENV=development unlocks the command)
            const apiKeyCmd = `docker exec -e NODE_ENV=development openclaw-twenty-1 node dist/command/command workspace:generate-api-key --workspace-id ${wsId} 2>&1 | grep "TOKEN:" | sed "s/.*TOKEN://"`
            twentyApiKey = (await sshExec(ip, apiKeyCmd, sshPassword, 60000)).trim()
            console.log(`Twenty API key generated for ${instanceId}: ${twentyApiKey ? 'OK' : 'EMPTY'}`)
        }

        // Configure MCP server in OpenClaw
        if (twentyApiKey) {
            // Use sed-based approach to avoid heredoc interpolation issues
            const escapedKey = twentyApiKey.replace(/[/\\&]/g, '\\$&')
            const mcpConfigCmd = `
CFG=$(find /home -name openclaw.json -path "*/.openclaw/*" 2>/dev/null | head -1)
[ -z "$CFG" ] && CFG=$(find /root -name openclaw.json -path "*/.openclaw/*" 2>/dev/null | head -1)
[ -z "$CFG" ] && CFG="/home/openclaw/.openclaw/openclaw.json"
mkdir -p "$(dirname "$CFG")"
[ ! -f "$CFG" ] && echo '{}' > "$CFG"
python3 -c "
import json, sys
cfg = json.load(open('$CFG'))
cfg.setdefault('mcp',{}).setdefault('servers',{})
cfg['mcp']['servers']['twenty-crm'] = {
  'command': 'npx',
  'args': ['-y', '@iflow-mcp/oumnya-twenty-mcp-server'],
  'env': {'TWENTY_API_KEY': sys.argv[1], 'TWENTY_API_URL': 'http://127.0.0.1:3080'}
}
json.dump(cfg, open('$CFG','w'), indent=2)
print('MCP configured:', '$CFG')
" '${escapedKey}'`
            await sshExec(ip, mcpConfigCmd, sshPassword, 15000)
            console.log(`Twenty MCP server configured for ${instanceId}`)
        }
    } catch (mcpErr) {
        console.error('Twenty MCP setup failed (non-critical):', mcpErr)
    }

    // Create sub-agent users if MATEH is installed
    const [currentInstance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const comps = (currentInstance?.selectedComponents as string[]) || []
    if (comps.includes('mt')) {
        try {
            await createMatehAgentUsers(ip, sshPassword)
            console.log(`MATEH sub-agents created in Twenty for ${instanceId}`)
        } catch (agentErr) {
            console.error('MATEH agent users creation failed (non-critical):', agentErr)
        }
    }

    // Save Twenty credentials to instance (merge into researchData)
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const existing = (typeof inst?.researchData === 'object' && inst.researchData) ? inst.researchData as Record<string, unknown> : {}
    await db.update(instances).set({
        researchData: {
            ...existing,
            twentyEmail: email,
            twentyPassword: twentyPassword,
            ...(twentyApiKey ? { twentyApiKey } : {}),
        } as any,
    }).where(eq(instances.id, instanceId))
}

/** MATEH sub-agents as CRM users — each agent gets its own identity in Twenty */
const MATEH_AGENTS = [
    { id: 'sayer',     firstName: 'סייר',    lastName: 'סוכן' },
    { id: 'meater',    firstName: 'מאתר',    lastName: 'סוכן' },
    { id: 'maazin',    firstName: 'מאזין',   lastName: 'סוכן' },
    { id: 'menateach', firstName: 'מנתח',    lastName: 'סוכן' },
    { id: 'et',        firstName: 'עט',      lastName: 'סוכן' },
    { id: 'yotzer',    firstName: 'יוצר',    lastName: 'סוכן' },
    { id: 'shaliach',  firstName: 'שליח',    lastName: 'סוכן' },
    { id: 'migdalor',  firstName: 'מגדלור',  lastName: 'סוכן' },
]

async function createMatehAgentUsers(ip: string, sshPassword?: string) {
    // Build SQL for all agents in one batch
    const sqlParts = MATEH_AGENTS.map(a => {
        const email = `${a.id}@agent.clawflow.local`
        return `
DO $$ DECLARE
  uid UUID; wsid UUID; wschema TEXT; uwid UUID := gen_random_uuid(); wmid UUID := gen_random_uuid();
BEGIN
  -- Get workspace
  SELECT id INTO wsid FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1;
  SELECT schema INTO wschema FROM core."dataSource" WHERE "workspaceId"=wsid LIMIT 1;
  IF wsid IS NULL OR wschema IS NULL THEN RETURN; END IF;

  -- Create user
  INSERT INTO core."user" (id, "firstName", "lastName", email, "isEmailVerified", disabled, "canImpersonate", "canAccessFullAdminPanel", locale, "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), '${a.firstName}', '${a.lastName}', '${email}', true, false, false, false, 'he', NOW(), NOW())
  ON CONFLICT (email) WHERE "deletedAt" IS NULL DO NOTHING;

  SELECT id INTO uid FROM core."user" WHERE email='${email}' AND "deletedAt" IS NULL LIMIT 1;

  -- Link to workspace
  INSERT INTO core."userWorkspace" (id, "userId", "workspaceId", "createdAt", "updatedAt")
  VALUES (uwid, uid, wsid, NOW(), NOW()) ON CONFLICT DO NOTHING;

  -- Create workspace member
  EXECUTE format('INSERT INTO %I."workspaceMember" (id, "userId", "nameFirstName", "nameLastName", "userEmail", locale, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING', wschema)
  USING wmid, uid, '${a.firstName}', '${a.lastName}', '${email}', 'he';
END $$;`
    }).join('\n')

    const cmd = `PGPASSWORD=twenty docker exec -i -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty << 'SQEOF'\n${sqlParts}\nSQEOF`
    await sshExec(ip, cmd, sshPassword, 30000)
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
        const appSecret = randomBytes(32).toString('hex')

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
            chmod 777 /opt/openclaw/data/twenty
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

        // Auto-create admin account (background — Twenty needs ~30s to start)
        const userId = resolveUserId(c)
        autoSetupTwentyAdmin(instance.ip, instanceId, userId, instance.rootPassword || undefined).catch(err => {
            console.error('Twenty auto-setup failed (user can still register manually):', err)
        })

        return ok(c, { url: crmUrl }, 'Twenty CRM installed')
    } catch (err) {
        console.error('installTwenty error:', err)
        return fail(c, 'Failed to install Twenty CRM', 500)
    }
}
