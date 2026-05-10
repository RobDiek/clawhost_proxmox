/**
 * Phase 2.2 — provision a new MATEH agent on an EXISTING VPS.
 *
 * Adds a secondary openclaw-gateway process running alongside the primary
 * agent on the same VPS. Each secondary agent gets:
 *   - its own working directory: /home/openclaw/agents/<agentId>/
 *   - its own loopback port: 18790 + N (primary owns 18789)
 *   - its own systemd unit:    openclaw-gateway-<short>.service
 *   - its own nginx vhost:     /etc/nginx/sites-available/openclaw-<short>
 *   - its own subdomain:       <brandSlug>.<vpsSubdomain>.clawflow.flowmatic.co.il
 *   - its own openclaw_token:  for gateway auth
 *   - its own brand folder:    workspace/brands/<brandSlug>/
 *
 * The existing primary agent (port 18789, default_server nginx config) is
 * not touched. Multiple secondaries can be added per VPS, bounded by RAM.
 *
 * Provisioning is best-effort with rollback on failure: if any step fails,
 * the partially-created systemd unit + nginx config + DB row are cleaned up.
 *
 * SSL: nginx vhost is created HTTP-only initially. Certbot --nginx is
 * triggered async (returns before completion) — agent works on HTTP
 * immediately, HTTPS becomes available once DNS propagates and cert issues.
 */

import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { sshExec, sshWriteFile } from '@/controllers/hosting/agentSetup'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import cloudflare from '@/services/cloudflare'

interface ProvisionInput {
    vpsInstanceId: string
    tenantId: string | null
    name: string             // Human-readable, e.g. "Storage Station SEO"
    brandSlug: string        // URL-safe folder name
    agentType: 'mateh' | 'oc' | 'bare'
}

interface ProvisionResult {
    agentId: string
    subdomain: string
    port: number
    openclawToken: string
    automationPassword: string
}

const SECONDARY_PORT_BASE = 18790
const ROOT_DOMAIN = 'clawflow.flowmatic.co.il'

/**
 * Allocates the next free loopback port on this VPS for a new agent.
 * Primary uses 18789. Secondaries use 18790 + N. Walks the existing
 * mateh_agents rows to find the highest used port and returns +1.
 */
async function allocatePort(vpsInstanceId: string): Promise<number> {
    const rows = await db
        .select({ port: matehAgents.gatewayPort })
        .from(matehAgents)
        .where(eq(matehAgents.vpsInstanceId, vpsInstanceId))
    const used = new Set<number>([18789])
    for (const r of rows) {
        if (typeof r.port === 'number') used.add(r.port)
    }
    let p = SECONDARY_PORT_BASE
    while (used.has(p)) p++
    return p
}

/**
 * Renders the systemd unit content for a secondary openclaw-gateway.
 * `short` is the 7-char tail of the agent id used in the unit name +
 * log filenames. Working dir is per-agent so OpenClaw uses its own
 * .openclaw config and brand workspace.
 */
function renderSystemdUnit(short: string, port: number, agentDir: string): string {
    return `[Unit]
Description=OpenClaw Gateway (secondary agent ${short})
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=${agentDir}
Environment=HOME=${agentDir}
Environment=NODE_ENV=production
ExecStart=/usr/bin/openclaw gateway --port ${port} --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway-${short}.log
StandardError=append:/var/log/openclaw-gateway-${short}.log

[Install]
WantedBy=multi-user.target
`
}

/**
 * Renders the nginx vhost content for a secondary agent's subdomain.
 * Mirrors the cloud-init primary config but binds to the specific
 * server_name and the agent's loopback port.
 */
function renderNginxVhost(subdomain: string, port: number): string {
    return `server {
    listen 80;
    listen [::]:80;
    server_name ${subdomain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
`
}

/**
 * Renders the openclaw.json that the secondary agent's gateway will
 * read on startup. Token is the auth secret returned to the user.
 */
function renderOpenclawConfig(token: string): string {
    return JSON.stringify({
        gateway: {
            mode: 'local',
            auth: { token },
            controlUi: { allowInsecureAuth: true },
            trustedProxies: ['127.0.0.1', '::1'],
        },
    }, null, 2)
}

/**
 * Provisions a new MATEH agent on an existing VPS. Returns the new
 * agentId + connection info. Throws on failure (with best-effort
 * rollback of partial state).
 */
export async function provisionSecondaryAgent(input: ProvisionInput): Promise<ProvisionResult> {
    const { vpsInstanceId, tenantId, name, brandSlug, agentType } = input

    // ── Validate VPS ──
    const [vps] = await db.select().from(instances).where(eq(instances.id, vpsInstanceId))
    if (!vps) throw new Error('VPS instance not found')
    if (!vps.ip) throw new Error('VPS has no IP — not yet provisioned?')
    if (vps.status === 'terminated' || vps.status === 'suspended') {
        throw new Error(`VPS is ${vps.status} — cannot add agent`)
    }

    // ── Validate brand_slug uniqueness on this VPS ──
    const [existingByBrand] = await db
        .select({ id: matehAgents.id })
        .from(matehAgents)
        .where(and(eq(matehAgents.vpsInstanceId, vpsInstanceId), eq(matehAgents.brandSlug, brandSlug)))
    if (existingByBrand) throw new Error(`brand_slug "${brandSlug}" is already used on this VPS`)

    const agentId = 'mta_' + nanoid(8)
    const short = agentId.slice(4)  // 8-char tail
    const port = await allocatePort(vpsInstanceId)
    const openclawToken = crypto.randomBytes(32).toString('hex')
    const automationPassword = crypto.randomBytes(12).toString('hex')
    const telegramWebhookSecret = crypto.randomBytes(16).toString('hex')

    // Subdomain: <brandSlug>.<vpsSubdomain>.<ROOT_DOMAIN>
    // vpsSubdomain comes from instances.subdomainName (the user's chosen
    // root subdomain, e.g. "demo"). Falls back to instance ID first 8.
    const vpsSubdomain = vps.subdomainName || vps.id.slice(0, 8)
    const subdomain = `${brandSlug}.${vpsSubdomain}.${ROOT_DOMAIN}`
    const subdomainShort = `${brandSlug}.${vpsSubdomain}`  // for cloudflare API (zone-relative)

    const agentDir = `/home/openclaw/agents/${agentId}`
    const ip = vps.ip
    const password = vps.rootPassword || undefined

    // ── 1. Insert DB row in 'provisioning' status (so client sees it immediately) ──
    await db.insert(matehAgents).values({
        id: agentId,
        vpsInstanceId,
        tenantId: tenantId || null,
        agentType,
        name,
        brandSlug,
        subdomainAgent: subdomain,
        gatewayPort: port,
        openclawToken,
        automationPassword,
        telegramWebhookSecret,
        status: 'provisioning',
        isPrimary: false,
        onboardingStep: 0,
        onboardingCompleted: false,
    })

    try {
        // ── 2. SSH: create dirs ──
        await sshExec(ip, `
            mkdir -p ${agentDir}/.openclaw
            mkdir -p ${agentDir}/workspace/brands/${brandSlug}
            mkdir -p ${agentDir}/workspace/memory
            ${agentType === 'mateh' ? `mkdir -p ${agentDir}/agents/{sayer,meater,maazin,menateach,et,yotzer,shaliach,migdalor,mekhayev,mazhir}/output` : ''}
            chown -R openclaw:openclaw ${agentDir}
        `, password)

        // ── 3. Write openclaw.json ──
        await sshWriteFile(ip, `${agentDir}/.openclaw/openclaw.json`, renderOpenclawConfig(openclawToken), password)

        // ── 4. Write minimal BRAND.md placeholder + USER.md placeholder ──
        // Real content gets generated when user runs onboarding/research on this agent.
        const brandStub = `# ${name}\n\nBrand placeholder. Generated on provisioning. Replace via onboarding flow.\n`
        const userStub = `# Account context\n\nProvisioned agent ${agentId} (${agentType}) on VPS ${vpsInstanceId}.\n`
        await sshWriteFile(ip, `${agentDir}/workspace/brands/${brandSlug}/BRAND.md`, brandStub, password)
        await sshWriteFile(ip, `${agentDir}/workspace/USER.md`, userStub, password)

        await sshExec(ip, `chown -R openclaw:openclaw ${agentDir}`, password)

        // ── 5. Systemd unit ──
        await sshWriteFile(
            ip,
            `/etc/systemd/system/openclaw-gateway-${short}.service`,
            renderSystemdUnit(short, port, agentDir),
            password,
        )
        await sshExec(ip, `
            systemctl daemon-reload
            systemctl enable openclaw-gateway-${short}
            systemctl restart openclaw-gateway-${short}
        `, password)

        // ── 6. Nginx vhost ──
        await sshWriteFile(
            ip,
            `/etc/nginx/sites-available/openclaw-${short}`,
            renderNginxVhost(subdomain, port),
            password,
        )
        // Run nginx -t separately so we get a clear error if config is bad
        // (e.g. invalid server_name from a poorly-sanitized subdomain).
        try {
            await sshExec(ip, `nginx -t 2>&1`, password)
        } catch (err) {
            throw new Error(`nginx -t failed (subdomain "${subdomain}" likely invalid): ${(err as Error).message}`)
        }
        await sshExec(ip, `
            ln -sf /etc/nginx/sites-available/openclaw-${short} /etc/nginx/sites-enabled/openclaw-${short}
            nginx -t && systemctl reload nginx
        `, password)

        // ── 7. Cloudflare DNS A record (best-effort — log if fails) ──
        try {
            await cloudflare.createDNSRecord(subdomainShort, ip)
        } catch (err) {
            console.warn(`[provisionSecondaryAgent/${agentId}] Cloudflare DNS create failed:`, (err as Error).message)
            // Continue — admin can set DNS manually if needed.
        }

        // ── 8. Cert via certbot (async — don't block on it; runs in background) ──
        // We fire-and-forget. Cert issues once DNS propagates; until then HTTP works.
        sshExec(ip, `
            certbot --nginx -d ${subdomain} --non-interactive --agree-tos -m devops@flowmatic.co.il --redirect 2>&1 | tee -a /var/log/certbot-${short}.log || true
        `, password).catch((err) => {
            console.warn(`[provisionSecondaryAgent/${agentId}] certbot async failed:`, (err as Error).message)
        })

        // ── 9. Two-layer health check ──
        // 1) gateway alive on local loopback port (process up)
        // 2) nginx routing via Host header → upstream (vhost wiring works)
        // Both must pass within ~30s for status=running.
        let gatewayHealthy = false
        let routingHealthy = false
        for (let i = 0; i < 6; i++) {
            try {
                const out1 = await sshExec(ip, `curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:${port} || true`, password)
                if (out1 && /^[23]\d\d/.test(out1.trim())) gatewayHealthy = true
                // Test nginx vhost routing via Host header on local 80
                const out2 = await sshExec(ip, `curl -s -o /dev/null -w '%{http_code}' -H 'Host: ${subdomain}' http://127.0.0.1/ || true`, password)
                if (out2 && /^[234]\d\d/.test(out2.trim())) routingHealthy = true
                if (gatewayHealthy && routingHealthy) break
            } catch { /* retry */ }
            await new Promise(r => setTimeout(r, 5000))
        }
        const healthy = gatewayHealthy && routingHealthy

        await db.update(matehAgents)
            .set({ status: healthy ? 'running' : 'failed', updatedAt: new Date() })
            .where(eq(matehAgents.id, agentId))

        if (!healthy) {
            console.warn(`[provisionSecondaryAgent/${agentId}] health check failed — gateway=${gatewayHealthy} routing=${routingHealthy}`)
        }

        return { agentId, subdomain, port, openclawToken, automationPassword }
    } catch (err) {
        // ── Rollback: best-effort cleanup ──
        console.error(`[provisionSecondaryAgent/${agentId}] failed:`, (err as Error).message)
        try {
            await sshExec(ip, `
                systemctl stop openclaw-gateway-${short} 2>/dev/null || true
                systemctl disable openclaw-gateway-${short} 2>/dev/null || true
                rm -f /etc/systemd/system/openclaw-gateway-${short}.service
                systemctl daemon-reload
                rm -f /etc/nginx/sites-enabled/openclaw-${short}
                rm -f /etc/nginx/sites-available/openclaw-${short}
                nginx -t && systemctl reload nginx 2>/dev/null || true
                rm -rf ${agentDir}
            `, password)
        } catch (cleanupErr) {
            console.error(`[provisionSecondaryAgent/${agentId}] cleanup also failed:`, (cleanupErr as Error).message)
        }
        await db.update(matehAgents)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(matehAgents.id, agentId))
        throw err
    }
}

/**
 * Tear down a secondary agent on its VPS + delete the DB row.
 * Refuses to terminate the primary agent (use VPS-level terminate flow).
 */
export async function terminateSecondaryAgent(agentId: string): Promise<void> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) throw new Error('Agent not found')
    if (agent.isPrimary) throw new Error('Cannot terminate primary agent — terminate the VPS instead')

    const [vps] = await db.select().from(instances).where(eq(instances.id, agent.vpsInstanceId))
    if (!vps?.ip) throw new Error('VPS not reachable')

    const short = agent.id.slice(4)
    const agentDir = `/home/openclaw/agents/${agent.id}`
    const password = vps.rootPassword || undefined

    try {
        await sshExec(vps.ip, `
            systemctl stop openclaw-gateway-${short} 2>/dev/null || true
            systemctl disable openclaw-gateway-${short} 2>/dev/null || true
            rm -f /etc/systemd/system/openclaw-gateway-${short}.service
            systemctl daemon-reload
            rm -f /etc/nginx/sites-enabled/openclaw-${short}
            rm -f /etc/nginx/sites-available/openclaw-${short}
            nginx -t && systemctl reload nginx 2>/dev/null || true
            rm -rf ${agentDir}
        `, password)
    } catch (err) {
        console.warn(`[terminateSecondaryAgent/${agentId}] SSH cleanup partial failure:`, (err as Error).message)
        // Continue with DB delete — admin can SSH to clean up residue if needed.
    }

    // Cloudflare DNS — try delete by lookup
    try {
        if (agent.subdomainAgent) {
            const fullName = agent.subdomainAgent
            const subdomainShort = fullName.replace(`.${ROOT_DOMAIN}`, '')
            const found = await cloudflare.findDNSRecord(subdomainShort)
            if (found?.id) await cloudflare.deleteDNSRecord(found.id)
        }
    } catch { /* best-effort */ }

    await db.delete(matehAgents).where(eq(matehAgents.id, agentId))
}