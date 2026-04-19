/**
 * Yotzer Trigger (Phase E)
 *
 * Dashboard-side invocation of yotzer agent — user enters a brief, backend
 * calls `openclaw agent --agent yotzer -m "{brief}"` via SSH on tenant VPS.
 *
 * Yotzer will:
 *   1. Auto-read BRAND_BOOK.json + CREATIVE_REFERENCES.json (plugin does this)
 *   2. Query fact graph for personas + prior winners
 *   3. Draft creative_concept_draft (Gate 1) into session output
 *   4. outputSync picks up the draft → shows in approval queue
 *
 * Endpoint:
 *   POST .../creative/yotzer/trigger
 *     Body: { brief, goal, platform, tier, formatType, callToAction?, rationale? }
 *     Response: { ok, sessionId, message? }
 *
 * Non-blocking: spawns ssh in background; returns immediately with sessionId.
 */

import type { Context } from 'hono'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExecDetached(ip: string, command: string, password?: string): Promise<string> {
    // Fire and forget — start ssh session, don't wait. Returns connection id.
    return new Promise((resolve, reject) => {
        const conn = new Client()
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH start timeout')) }, 15000)
        conn.on('ready', () => {
            // Launch command in background via nohup — agent sessions run long (30-120s for Gate 1)
            conn.exec(`nohup bash -c '${command.replace(/'/g, "'\\''")}' > /tmp/_yotzer_trigger.log 2>&1 & echo SPAWNED`, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', () => { /* ignore */ })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve('spawned') })
            })
        }).on('error', err => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

export const triggerYotzer = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst?.ip) return fail(c, 'Instance not ready (no IP)', 400)

        const body = await c.req.json<{
            brief: string
            goal: 'awareness' | 'leads' | 'sales' | 'engagement' | 'app_install' | 'retention'
            platform: string
            tier: 'draft' | 'standard' | 'premium'
            formatType: 'image' | 'video' | 'carousel' | 'audio'
            callToAction?: string
            rationale?: string
            targetAudience?: string
        }>()

        if (!body.brief || body.brief.trim().length < 10) {
            return fail(c, 'brief חייב להיות לפחות 10 תווים', 400)
        }
        if (!['awareness', 'leads', 'sales', 'engagement', 'app_install', 'retention'].includes(body.goal)) {
            return fail(c, 'goal לא חוקי', 400)
        }
        if (!['draft', 'standard', 'premium'].includes(body.tier)) {
            return fail(c, 'tier לא חוקי', 400)
        }
        if (!['image', 'video', 'carousel', 'audio'].includes(body.formatType)) {
            return fail(c, 'formatType לא חוקי', 400)
        }

        const sessionId = `yotzer-${Date.now()}-${randomBytes(3).toString('hex')}`

        // Build the prompt. Yotzer reads BRAND_BOOK.json + CREATIVE_REFERENCES.json
        // automatically via openclaw-creative plugin. We give it the high-level task.
        const promptParts: string[] = []
        promptParts.push(`אתה יוצר (yotzer). המשתמש מבקש לטייטת creative חדש דרך הדשבורד.`)
        promptParts.push('')
        promptParts.push(`**Brief:** ${body.brief.trim()}`)
        promptParts.push(`**Goal:** ${body.goal}`)
        promptParts.push(`**Platform:** ${body.platform}`)
        promptParts.push(`**Tier:** ${body.tier}`)
        promptParts.push(`**Format:** ${body.formatType}`)
        if (body.callToAction) promptParts.push(`**CTA:** ${body.callToAction}`)
        if (body.targetAudience) promptParts.push(`**Target:** ${body.targetAudience}`)
        if (body.rationale) promptParts.push(`**Rationale:** ${body.rationale}`)
        promptParts.push('')
        promptParts.push('**המשימה שלך:**')
        promptParts.push('1. בדוק עם get_brand_book() שיש brand book מאושר')
        promptParts.push('2. בדוק עם get_references({limit: 5}) אם יש מתחרים לניתוח')
        promptParts.push('3. שלוף פרסונות עם entity_list({type: "persona"}) ו-facts רלוונטיים')
        promptParts.push('4. הפעל draft_concept(...) — Gate 1. מלא rationale מבוסס על persona pain + references DNA')
        promptParts.push('5. **עצור** — אל תתקדם ל-Gate 2 אוטומטית. המשתמש יאשר בדשבורד ואז יפעיל המשך.')
        promptParts.push('')
        promptParts.push('אם BRAND_BOOK.json חסר — דווח למשתמש והפסק.')

        const prompt = promptParts.join('\n')
        const b64Prompt = Buffer.from(prompt).toString('base64')

        // Fire the agent. Session timeout 5min (image tiers faster, safety buffer).
        // --json so outputSync can parse result.
        const sshCommand = `su - openclaw -c 'timeout 300 openclaw agent --agent yotzer --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json >> /tmp/yotzer-${sessionId}.log 2>&1'`

        try {
            await sshExecDetached(inst.ip, sshCommand, inst.rootPassword || undefined)
        } catch (err) {
            console.error(`[yotzerTrigger] SSH start failed for ${instanceId}:`, err)
            return fail(c, 'לא הצלחתי להפעיל את יוצר — בדוק SSH/VPS', 500)
        }

        return ok(c, {
            sessionId,
            message: 'Yotzer הופעל. תוך 30-120 שניות הטיוטה תופיע בתור האישורים.',
            expectedLatencySec: body.formatType === 'video' ? 120 : 60,
        }, 'Yotzer triggered.')
    } catch (err) {
        console.error('triggerYotzer error:', err)
        return fail(c, err instanceof Error ? err.message : 'Trigger failed', 500)
    }
}