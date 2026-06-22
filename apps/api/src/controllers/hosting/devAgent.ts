/**
 * Claude Developer agent — connection management (roadmap/15, Phase 1).
 *
 * Per-instance (VPS-level) BYO Claude auth for the on-VPS coding agent. The
 * secret — an Anthropic API key OR a Claude OAuth token (from `claude
 * setup-token`, the subscription path) — is stored in the DB (same plaintext
 * pattern as aiProviderKey) AND written to a developer-owned env file on the
 * VPS. The Phase 2 WS bridge sources that file when launching `claude`.
 */
import type { Context } from 'hono'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { sshExec } from './agentSetup'

const ENV_FILE = '/home/developer/.config/dev-agent.env'
const WORKSPACE = '/home/developer/workspace'

// Systemic rollout (2026-06-22): the Claude Developer agent is available to ALL
// tenants. It is BYO-key, runs as a non-root `developer` user jailed to the
// tenant's OWN single-tenant VPS (ownership enforced on every WS bridge; no
// cross-tenant secrets on the box), and the VPS is self-provisioned lazily on
// first connect (ensureDevAgentSetup) — so existing VPSes need no separate
// backfill and new ones work even before any cloud-init change lands.
function devAvailable(_instance: { id: string; planKey?: string | null; status?: string | null }): boolean {
    return true
}

/**
 * Idempotently prepare a tenant VPS for the Claude Developer agent: a non-root
 * `developer` user + workspace + config dir, Node 18+ (for claude-code), and the
 * `@anthropic-ai/claude-code` CLI installed globally. Safe to re-run. No
 * passwordless sudo is granted (workspace-scoped by default — a guarded sudo
 * rule is a later refinement per roadmap/15). Returns the last lines for debug.
 */
async function ensureDevAgentSetup(ip: string, password: string | null): Promise<{ ok: boolean; detail: string }> {
    const script = [
        'set +e',
        'id developer >/dev/null 2>&1 || useradd -m -s /bin/bash developer',
        `mkdir -p ${WORKSPACE} /home/developer/.config`,
        'chown -R developer:developer /home/developer',
        // Node 18+ is required by claude-code; install Node 20 from NodeSource if missing/old.
        'NODE_MAJOR=$(node -v 2>/dev/null | sed "s/v//; s/\\..*//")',
        'if ! command -v node >/dev/null 2>&1 || [ "${NODE_MAJOR:-0}" -lt 18 ]; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1; fi',
        // Install the Claude Code CLI globally (skip if already present).
        'command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code >/dev/null 2>&1',
        'if command -v claude >/dev/null 2>&1; then echo "SETUP_OK node=$(node -v 2>/dev/null) claude=$(claude --version 2>/dev/null | head -c 40)"; else echo "SETUP_FAIL node=$(node -v 2>/dev/null)"; fi',
    ].join('\n')
    const cmd = `bash -lc ${shSingleQuote(script)}`
    const out = (await sshExec(ip, cmd, password || undefined, 240000)).trim()
    return { ok: /SETUP_OK/.test(out), detail: out.slice(-300) }
}

function envVarFor(authType: string): string {
    return authType === 'subscription' ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY'
}

/** Single-quote a string for safe embedding in a bash -lc '...' command. */
function shSingleQuote(s: string): string {
    return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Write the credential to a 0600 developer-owned env file on the VPS. */
async function writeVpsEnv(ip: string, password: string | null, authType: string, secret: string): Promise<void> {
    const line = `${envVarFor(authType)}=${secret}\n`
    const b64 = Buffer.from(line, 'utf-8').toString('base64')   // avoids any shell-escaping of the secret
    const cmd = [
        'mkdir -p /home/developer/.config',
        `echo ${b64} | base64 -d > ${ENV_FILE}`,
        `chmod 600 ${ENV_FILE}`,
        'chown -R developer:developer /home/developer/.config',
    ].join(' && ')
    await sshExec(ip, cmd, password || undefined, 20000)
}

/** Launch claude headless as the developer user, sourcing the env file. */
async function testClaude(ip: string, password: string | null): Promise<{ ok: boolean; detail: string }> {
    const inner = `cd /home/developer/workspace && set -a && . ${ENV_FILE} && set +a && timeout 90 claude -p "Reply with exactly: PONG" --output-format text 2>&1 | head -c 400`
    const cmd = `sudo -u developer bash -lc ${shSingleQuote(inner)}`
    const out = (await sshExec(ip, cmd, password || undefined, 100000)).trim()
    return { ok: /PONG/i.test(out), detail: out.slice(0, 300) }
}

// POST /hosting/instances/:id/dev/connect  { authType: 'apikey'|'subscription', secret }
export const devConnect = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, resolveUserId(c))
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!devAvailable(instance)) return fail(c, 'התכונה אינה זמינה בתוכנית שלכם', 403)
        if (!instance.ip) return fail(c, 'ה-VPS עדיין לא מוכן', 409)

        // Lazily provision the developer user + Claude Code CLI on this VPS
        // (idempotent; systemic — works for any existing or new VPS).
        const setup = await ensureDevAgentSetup(instance.ip, instance.rootPassword)
        if (!setup.ok) return fail(c, `הכנת סביבת המפתח על ה-VPS נכשלה — נסו שוב. (${setup.detail.slice(0, 140)})`, 500)

        const body = await c.req.json<{ authType?: string; secret?: string }>().catch(() => ({} as { authType?: string; secret?: string }))
        // 'existing' → reuse the Anthropic key already connected in the AI card
        // (server-side; the frontend never sees the key).
        const authType = body.authType === 'subscription' ? 'subscription' : 'apikey'
        let secret = (body.secret || '').trim()
        if (body.authType === 'existing') {
            secret = (instance.aiProviderKey || '').trim()
            if (!secret) return fail(c, 'אין מפתח Anthropic מחובר בכרטיס ה-AI', 400)
        }
        if (!secret) return fail(c, 'חסר מפתח / טוקן', 400)

        await writeVpsEnv(instance.ip, instance.rootPassword, authType, secret)
        const test = await testClaude(instance.ip, instance.rootPassword)
        if (!test.ok) {
            return fail(c, `החיבור נכשל — בדקו את המפתח/טוקן. (${test.detail.slice(0, 120)})`, 422)
        }

        await db.update(instances).set({
            devAuthType: authType,
            devAuthSecret: secret,
            devConnectedAt: new Date(),
        }).where(eq(instances.id, instanceId))
        return ok(c, { connected: true, authType }, 'Claude Developer מחובר.')
    } catch (err) {
        console.error('devConnect error:', err)
        return fail(c, `שגיאה: ${(err as Error).message}`, 500)
    }
}

// GET /hosting/instances/:id/dev/status
export const devStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, resolveUserId(c))
        if (!instance) return fail(c, 'Instance not found', 404)
        return ok(c, {
            available: devAvailable(instance),
            connected: !!instance.devAuthType,
            authType: instance.devAuthType || null,
            connectedAt: instance.devConnectedAt || null,
        }, 'ok')
    } catch (err) {
        return fail(c, (err as Error).message, 500)
    }
}

// POST /hosting/instances/:id/dev/disconnect
export const devDisconnect = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, resolveUserId(c))
        if (!instance) return fail(c, 'Instance not found', 404)
        try {
            if (instance.ip) await sshExec(instance.ip, `rm -f ${ENV_FILE}`, instance.rootPassword || undefined, 15000)
        } catch { /* best effort */ }
        await db.update(instances).set({ devAuthType: null, devAuthSecret: null, devConnectedAt: null }).where(eq(instances.id, instanceId))
        return ok(c, { connected: false }, 'נותק.')
    } catch (err) {
        return fail(c, (err as Error).message, 500)
    }
}