/**
 * Creative Generation Controller (Phase B2)
 *
 * Endpoints:
 *   POST .../integrations/creative/save      — save fal.ai + ElevenLabs BYOK keys
 *   GET  .../integrations/creative/status    — check connection + key presence
 *   POST .../integrations/creative/disconnect — remove keys
 *   POST .../instances/:id/creative/render    — manual trigger (admin/debug)
 *   GET  .../instances/:id/creative/renders   — list render history
 *   GET  .../instances/:id/creative/renders/:renderId — single render details
 *
 * Approval hook: when user approves a creative_final_draft output in the
 * approval queue (outputs/approve PATCH), we auto-trigger executeCreativeRender
 * from the outputs controller — see outputs.ts integration point.
 */

import type { Context } from 'hono'
import { eq, desc, and } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'

import { db } from '@/db'
import { instances, creativeRenders } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
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
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/integrations/creative/save
// Body: { falApiKey?: string, elevenlabsApiKey?: string }
// At least one key required. Validates fal.ai key if provided.
// ═══════════════════════════════════════════════════════════════════════════
export const saveCreativeKeys = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ falApiKey?: string; elevenlabsApiKey?: string }>()
        const falKey = (body.falApiKey || '').trim()
        const elKey = (body.elevenlabsApiKey || '').trim()

        if (!falKey && !elKey) {
            return fail(c, 'לפחות מפתח אחד נדרש (fal.ai או ElevenLabs)', 400)
        }

        // Validate fal.ai key format if provided.
        // fal.ai keys look like: "abcdef12-3456-7890-abcd-ef1234567890:xxxxxxxx"
        // Some older keys are just hex strings. Accept both shapes generously.
        if (falKey && !/^[a-f0-9-]{8,}:?[a-zA-Z0-9]*$/i.test(falKey) && falKey.length < 20) {
            return fail(c, 'פורמט fal.ai key נראה שגוי — מצפה לטוקן ארוך', 400)
        }

        // Optional live validation of fal.ai key: make a cheap list-models request
        if (falKey) {
            try {
                const valRes = await fetch('https://fal.run/fal-ai/fast-sdxl', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Key ${falKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ prompt: 'test', enable_safety_checker: true, num_images: 1, num_inference_steps: 1 }),
                    signal: AbortSignal.timeout(8000),
                })
                // We don't care about actual result — we just check auth
                if (valRes.status === 401 || valRes.status === 403) {
                    return fail(c, 'fal.ai key לא תקף (401/403)', 401)
                }
                // Other statuses (200/422/etc) mean auth passed, just the test request was
                // (intentionally) malformed or rate-limited — that's fine.
            } catch {
                // Network error — save anyway, don't block user
            }
        }

        // Persist to DB
        const patch: Record<string, unknown> = {}
        if (falKey) patch.falApiKey = falKey
        if (elKey) patch.elevenlabsApiKey = elKey
        await db.update(instances).set(patch).where(eq(instances.id, instanceId))

        // Push keys into openclaw-creative plugin config on tenant VPS
        if (instance.ip && (falKey || elKey)) {
            try {
                await updatePluginConfig(instance.ip, instance.rootPassword || undefined, {
                    falApiKey: falKey || null,
                    elevenLabsApiKey: elKey || null,
                })
                console.log(`[creative/save] plugin config updated on ${instance.ip}`)
            } catch (cfgErr) {
                console.error('Failed to update creative plugin config (non-fatal):', cfgErr)
                // Key is in DB — next render attempt will retry from DB
            }
        }

        return ok(c, {
            falConnected: !!falKey,
            elevenlabsConnected: !!elKey,
            falMasked: falKey ? falKey.slice(0, 8) + '****' : null,
            elMasked: elKey ? elKey.slice(0, 8) + '****' : null,
        }, 'Keys saved.')
    } catch (err) {
        console.error('saveCreativeKeys error:', err)
        return fail(c, 'Save failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/integrations/creative/status
// ═══════════════════════════════════════════════════════════════════════════
export const getCreativeStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const falKey = (instance as any).falApiKey || ''
        const elKey = (instance as any).elevenlabsApiKey || ''

        return ok(c, {
            falConnected: !!falKey,
            elevenlabsConnected: !!elKey,
            falMasked: falKey ? falKey.slice(0, 8) + '****' : null,
            elMasked: elKey ? elKey.slice(0, 8) + '****' : null,
        }, 'Status.')
    } catch (err) {
        console.error('getCreativeStatus error:', err)
        return fail(c, 'Status fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/integrations/creative/disconnect
// Body: { provider: 'fal' | 'elevenlabs' | 'all' }
// ═══════════════════════════════════════════════════════════════════════════
export const disconnectCreativeKey = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ provider?: 'fal' | 'elevenlabs' | 'all' }>()
        const provider = body.provider || 'all'

        const patch: Record<string, unknown> = {}
        if (provider === 'fal' || provider === 'all') patch.falApiKey = null
        if (provider === 'elevenlabs' || provider === 'all') patch.elevenlabsApiKey = null

        await db.update(instances).set(patch).where(eq(instances.id, instanceId))

        if (instance.ip) {
            try {
                await updatePluginConfig(instance.ip, instance.rootPassword || undefined, {
                    falApiKey: provider === 'fal' || provider === 'all' ? null : undefined,
                    elevenLabsApiKey: provider === 'elevenlabs' || provider === 'all' ? null : undefined,
                })
            } catch (cfgErr) {
                console.error('Failed to clear creative plugin config (non-fatal):', cfgErr)
            }
        }

        return ok(c, { disconnected: provider }, 'Disconnected.')
    } catch (err) {
        console.error('disconnectCreativeKey error:', err)
        return fail(c, 'Disconnect failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/creative/renders
// List render history for this instance, newest first.
// ═══════════════════════════════════════════════════════════════════════════
export const listCreativeRenders = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
        const rows = await db.select().from(creativeRenders)
            .where(eq(creativeRenders.instanceId, instanceId))
            .orderBy(desc(creativeRenders.createdAt))
            .limit(limit)

        return ok(c, { renders: rows })
    } catch (err) {
        console.error('listCreativeRenders error:', err)
        return fail(c, 'List failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/creative/renders/:renderId
// ═══════════════════════════════════════════════════════════════════════════
export const getCreativeRender = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const renderId = c.req.param('renderId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const [row] = await db.select().from(creativeRenders)
            .where(and(eq(creativeRenders.id, renderId), eq(creativeRenders.instanceId, instanceId)))
        if (!row) return fail(c, 'Render not found', 404)

        return ok(c, { render: row })
    } catch (err) {
        console.error('getCreativeRender error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/creative/render
// Manual trigger — used for testing or re-render. Normally the approval hook
// on outputs controller triggers renders automatically.
// Body: { outputId: string } — an approved creative_final_draft agent_output
// ═══════════════════════════════════════════════════════════════════════════
export const triggerCreativeRender = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ outputId: string }>()
        if (!body.outputId) return fail(c, 'outputId required', 400)

        // Lazy import to avoid circular — creativeExecutor is loaded only when used
        const { executeCreativeRender } = await import('@/services/creativeExecutor')
        const result = await executeCreativeRender({
            instanceId,
            outputId: body.outputId,
            instance,
        })

        return ok(c, result, 'Render queued.')
    } catch (err) {
        console.error('triggerCreativeRender error:', err)
        return fail(c, err instanceof Error ? err.message : 'Trigger failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update openclaw-creative plugin config on tenant VPS.
 * Writes the new config fields into openclaw.json and restarts gateway.
 */
async function updatePluginConfig(
    ip: string,
    password: string | undefined,
    cfg: { falApiKey?: string | null; elevenLabsApiKey?: string | null; tenantStoragePath?: string },
): Promise<void> {
    // Use python to surgically edit openclaw.json — only update the keys we pass.
    const cfgPayload: Record<string, unknown> = {}
    if (cfg.falApiKey !== undefined) cfgPayload.falApiKey = cfg.falApiKey || ''
    if (cfg.elevenLabsApiKey !== undefined) cfgPayload.elevenLabsApiKey = cfg.elevenLabsApiKey || ''
    if (cfg.tenantStoragePath !== undefined) cfgPayload.tenantStoragePath = cfg.tenantStoragePath

    const cfgB64 = Buffer.from(JSON.stringify(cfgPayload)).toString('base64')

    const script = `
import json, base64, sys
update = json.loads(base64.b64decode("${cfgB64}").decode())
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
entries = d.setdefault('plugins', {}).setdefault('entries', {})
entry = entries.setdefault('openclaw-creative', {
    'enabled': True,
    'config': { 'tenantStoragePath': '/opt/openclaw/creatives' }
})
cfg = entry.setdefault('config', {})
for k, v in update.items():
    if v == '' or v is None:
        cfg.pop(k, None)  # explicit removal
    else:
        cfg[k] = v
allow = d['plugins'].setdefault('allow', [])
if 'openclaw-creative' not in allow: allow.append('openclaw-creative')
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('creative plugin config updated')
`
    const b64 = Buffer.from(script).toString('base64')
    await sshExec(
        ip,
        `echo '${b64}' | base64 -d > /tmp/_creative_cfg.py && chown openclaw:openclaw /tmp/_creative_cfg.py && ` +
        `systemctl stop openclaw-gateway 2>/dev/null; ` +
        `su - openclaw -c 'python3 /tmp/_creative_cfg.py' && ` +
        `rm -f /tmp/_creative_cfg.py && ` +
        `systemctl start openclaw-gateway`,
        password, 30000,
    )
}