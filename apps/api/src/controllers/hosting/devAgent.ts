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
        if (!instance.ip) return fail(c, 'ה-VPS עדיין לא מוכן', 409)

        const body = await c.req.json<{ authType?: string; secret?: string }>().catch(() => ({} as { authType?: string; secret?: string }))
        const authType = body.authType === 'subscription' ? 'subscription' : 'apikey'
        const secret = (body.secret || '').trim()
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