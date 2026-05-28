/**
 * sGTM (Server-Side Google Tag Manager) auto-provisioning — Phase 2026.02 Block 6 Pattern G
 *
 * Deploys Google's official gtm-cloud-image Docker container on the client's
 * VPS, exposed at `sgtm.{vpsSubdomain}.${ROOT_DOMAIN}`. Handles the 95% of
 * work that can be automated:
 *   - Allocate port (8090 default, single sGTM per VPS for now)
 *   - SSH: create /opt/openclaw/sgtm directory + docker-compose.yml + .env
 *     with PLACEHOLDER CONTAINER_CONFIG (sGTM container won't run yet,
 *     but the infrastructure is in place)
 *   - SSH: write nginx vhost + reload
 *   - Cloudflare: create A record for sgtm subdomain
 *   - SSH: certbot --nginx for SSL (async — runs once DNS propagates)
 *
 * The 5% that REQUIRES user manual action (Google's hard limit):
 *   - CONTAINER_CONFIG string generation. Google does NOT expose this via
 *     public API by design — it's a credential generated only when the user
 *     visits GTM UI → Container → Tagging Server → "Manually provision"
 *     and inputs the URL we provisioned for them.
 *
 * Hybrid flow:
 *   1. provisionSgtm(instanceId, agentId)
 *      → returns { sgtmUrl, status: 'awaiting_config' }
 *      → surfaces clear Hebrew instructions to user with the sgtmUrl
 *   2. User visits GTM UI, pastes our sgtmUrl, copies the generated config
 *   3. applyContainerConfig(instanceId, agentId, configString)
 *      → SSH update /opt/openclaw/sgtm/.env + docker compose restart
 *      → polls /healthy endpoint; on 200 → ok
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import cloudflare from './cloudflare'
import { sshExec, sshWriteFile } from '@/controllers/hosting/agentSetup'

const ROOT_DOMAIN = 'clawflow.flowmatic.co.il'
const SGTM_PORT = 8090
const SGTM_DIR = '/opt/openclaw/sgtm'
const SGTM_IMAGE = 'gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable'

export interface SgtmProvisionResult {
    sgtmUrl: string                    // https://sgtm.{vpsSubdomain}.{ROOT_DOMAIN}
    sgtmSubdomain: string              // sgtm.{vpsSubdomain}.{ROOT_DOMAIN}
    awaitingConfig: boolean            // true until user pastes CONTAINER_CONFIG
    placeholderActive: boolean         // true if Docker container running with placeholder (preview mode)
    dnsCreated: boolean
    nginxConfigured: boolean
    certbotQueued: boolean
}

export interface SgtmApplyConfigResult {
    healthy: boolean                   // /healthy returned 200
    sgtmUrl: string
    version?: string                   // gtm version from /healthy if present
    error?: string
}

function renderDockerCompose(): string {
    return `services:
  sgtm:
    image: ${SGTM_IMAGE}
    restart: unless-stopped
    container_name: openclaw-sgtm
    ports:
      - "127.0.0.1:${SGTM_PORT}:8080"
    env_file: .env
    environment:
      - PORT=8080
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/healthy"]
      interval: 30s
      timeout: 5s
      retries: 3
`
}

// Placeholder CONTAINER_CONFIG. Google's gtm-cloud-image refuses to start
// without ANY value but accepts a clearly-fake string (it'll fail to
// connect to Google's Tag Manager API and log errors, which is expected
// behavior until user pastes the real config). We can't run a true
// no-op preview container without a real config.
const PLACEHOLDER_ENV = `CONTAINER_CONFIG=PLACEHOLDER_NEEDS_REAL_CONFIG_FROM_GTM_UI
`

function renderNginxVhost(subdomain: string): string {
    return `server {
    listen 80;
    listen [::]:80;
    server_name ${subdomain};

    location / {
        proxy_pass http://127.0.0.1:${SGTM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # GTM server-side container expects POST + headers passthrough
        client_max_body_size 1m;
    }

    location /healthy {
        proxy_pass http://127.0.0.1:${SGTM_PORT}/healthy;
        access_log off;
    }
}
`
}

/**
 * Step 1 of the hybrid flow: pre-provision DNS + Docker + nginx + certbot.
 * Idempotent — safe to re-run; existing services are reused.
 *
 * Returns the URL the user must paste into GTM UI's "Tagging Server →
 * Manually provision" form.
 */
export async function provisionSgtm(
    instanceId: string,
    _agentId?: string | null,    // reserved for multi-tenant per-agent sGTM
): Promise<SgtmProvisionResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    if (!inst.ip) throw new Error('Instance has no IP — VPS not yet provisioned')
    if (!inst.rootPassword) throw new Error('Instance rootPassword missing — cannot SSH')

    const vpsSubdomain = inst.subdomainName || inst.id.slice(0, 8)
    const sgtmSubdomain = `sgtm.${vpsSubdomain}.${ROOT_DOMAIN}`
    // CRITICAL: Cloudflare zone is `flowmatic.co.il` (not `clawflow.flowmatic.co.il`),
    // so the record name relative to zone MUST include the `clawflow` segment.
    // Passing `sgtm.{vpsSubdomain}` would create `sgtm.{vpsSubdomain}.flowmatic.co.il`
    // (NXDOMAIN against the intended FQDN). The full FQDN form survives both
    // possible zone configurations.
    const sgtmSubdomainShort = sgtmSubdomain  // pass FQDN; Cloudflare strips zone suffix automatically
    const sgtmUrl = `https://${sgtmSubdomain}`
    const ip = inst.ip
    const password = inst.rootPassword

    const result: SgtmProvisionResult = {
        sgtmUrl,
        sgtmSubdomain,
        awaitingConfig: true,
        placeholderActive: false,
        dnsCreated: false,
        nginxConfigured: false,
        certbotQueued: false,
    }

    // ── 1. SSH: ensure /opt/openclaw/sgtm exists with docker-compose + .env ──
    await sshExec(ip, `mkdir -p ${SGTM_DIR}`, password, 30000)
    await sshWriteFile(ip, `${SGTM_DIR}/docker-compose.yml`, renderDockerCompose(), password)
    // Only write placeholder .env if file doesn't already exist — preserve
    // user's pasted real config across re-runs.
    await sshExec(ip, `[ -f ${SGTM_DIR}/.env ] || echo '${PLACEHOLDER_ENV.replace(/\n/g, '\\n')}' > ${SGTM_DIR}/.env`, password, 30000)

    // ── 2. SSH: docker compose up (only does actual work first time) ──
    try {
        await sshExec(ip, `cd ${SGTM_DIR} && docker compose up -d 2>&1`, password, 120000)
        result.placeholderActive = true
    } catch (err) {
        console.warn(`[sgtmProvisioner] docker compose up failed (non-fatal):`, (err as Error).message)
        // Continue — user can still paste real config later, which triggers restart.
    }

    // ── 3. SSH: nginx vhost ──
    await sshWriteFile(ip, `/etc/nginx/sites-available/sgtm-${vpsSubdomain}`, renderNginxVhost(sgtmSubdomain), password)
    await sshExec(ip, `nginx -t 2>&1`, password, 15000)
    await sshExec(ip, `
        ln -sf /etc/nginx/sites-available/sgtm-${vpsSubdomain} /etc/nginx/sites-enabled/sgtm-${vpsSubdomain}
        nginx -t && systemctl reload nginx
    `, password, 30000)
    result.nginxConfigured = true

    // ── 4. Cloudflare DNS A record ──
    try {
        const existing = await cloudflare.findDNSRecord(sgtmSubdomainShort)
        if (existing) {
            if (existing.ip !== ip) {
                await cloudflare.updateDNSRecord(existing.id, sgtmSubdomainShort, ip)
            }
            result.dnsCreated = true
        } else {
            await cloudflare.createDNSRecord(sgtmSubdomainShort, ip)
            result.dnsCreated = true
        }
    } catch (err) {
        console.warn(`[sgtmProvisioner] Cloudflare DNS failed (non-fatal):`, (err as Error).message)
    }

    // ── 5. Certbot async (fire-and-forget — DNS propagation takes minutes) ──
    sshExec(ip, `
        certbot --nginx -d ${sgtmSubdomain} --non-interactive --agree-tos -m devops@flowmatic.co.il --redirect 2>&1 | tee -a /var/log/certbot-sgtm.log || true
    `, password, 120000).catch((err) => {
        console.warn(`[sgtmProvisioner] certbot async failed:`, (err as Error).message)
    })
    result.certbotQueued = true

    return result
}

/**
 * Step 2 of the hybrid flow: user pasted the CONTAINER_CONFIG string from
 * GTM UI. Update the Docker env file, restart the sGTM container, verify
 * /healthy returns 200 (the container only achieves healthy state when
 * CONTAINER_CONFIG is valid).
 */
export async function applyContainerConfig(
    instanceId: string,
    containerConfig: string,
): Promise<SgtmApplyConfigResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    if (!inst.ip) throw new Error('Instance has no IP')
    if (!inst.rootPassword) throw new Error('Instance rootPassword missing')

    const vpsSubdomain = inst.subdomainName || inst.id.slice(0, 8)
    const sgtmSubdomain = `sgtm.${vpsSubdomain}.${ROOT_DOMAIN}`
    const sgtmUrl = `https://${sgtmSubdomain}`
    const ip = inst.ip
    const password = inst.rootPassword

    // Basic sanity check — GTM container configs are base64-encoded JWTs,
    // typically 100-500 chars. Reject obvious junk early.
    const trimmed = containerConfig.trim()
    if (trimmed.length < 50 || /[\s<>{}]/.test(trimmed)) {
        return {
            healthy: false,
            sgtmUrl,
            error: 'CONTAINER_CONFIG looks invalid (too short or contains whitespace/HTML). Paste the string from GTM Container Settings → Tagging Server → Manually provision exactly as shown.',
        }
    }

    // Write new .env (overwrite — single key file)
    await sshWriteFile(ip, `${SGTM_DIR}/.env`, `CONTAINER_CONFIG=${trimmed}\n`, password)

    // Restart container with new config
    await sshExec(ip, `cd ${SGTM_DIR} && docker compose restart sgtm 2>&1`, password, 60000)

    // Poll /healthy on local loopback (avoid waiting for DNS+SSL while testing)
    let healthy = false
    let lastError = ''
    for (let i = 0; i < 6; i++) {
        try {
            const out = await sshExec(
                ip,
                `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${SGTM_PORT}/healthy || true`,
                password,
                10000,
            )
            const code = out.trim()
            if (code === '200') {
                healthy = true
                break
            } else {
                lastError = `healthy returned HTTP ${code}`
            }
        } catch (err) {
            lastError = (err as Error).message
        }
        await new Promise(r => setTimeout(r, 5000))
    }

    if (!healthy) {
        return {
            healthy: false,
            sgtmUrl,
            error: `Container did not become healthy within 30s. Last: ${lastError}. Common causes: (1) invalid CONTAINER_CONFIG string, (2) GTM Tagging Server URL in the config doesn't match our subdomain (must be ${sgtmUrl}), (3) docker logs sgtm shows the root cause.`,
        }
    }

    return { healthy: true, sgtmUrl }
}