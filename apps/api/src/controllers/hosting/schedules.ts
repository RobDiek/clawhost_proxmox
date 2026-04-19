/**
 * Schedule Management — save/get agent scheduled tasks
 *
 * Persists schedule config (times, days, enabled state) to DB
 * and updates HEARTBEAT.md on the client VPS via SSH.
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
const DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

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

// GET /instances/:id/schedules
export const getSchedules = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        return ok(c, instance.schedules || {}, 'Schedules')
    } catch (err) {
        console.error('getSchedules error:', err)
        return fail(c, 'Failed to get schedules', 500)
    }
}

// POST /instances/:id/schedules
export const saveSchedules = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            bundleId: string
            schedules: Record<string, {
                enabled: boolean
                time?: string
                days?: number[]
                weekday?: number
                monthday?: number
            }>
        }>()

        if (!body.bundleId || !body.schedules) {
            return fail(c, 'bundleId and schedules required', 400)
        }

        // Merge with existing schedules
        const current = (instance.schedules as Record<string, unknown>) || {}
        current[body.bundleId] = body.schedules

        await db.update(instances)
            .set({ schedules: current as any })
            .where(eq(instances.id, instanceId))

        // Update HEARTBEAT.md on VPS
        if (instance.ip) {
            try {
                const heartbeat = generateHeartbeatMd(current)
                const b64 = Buffer.from(heartbeat).toString('base64')
                await sshExec(instance.ip,
                    `echo '${b64}' | base64 -d > /home/openclaw/.openclaw/workspace/HEARTBEAT.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/HEARTBEAT.md`,
                    instance.rootPassword || undefined
                )
                console.log(`HEARTBEAT.md updated for instance ${instanceId}`)
            } catch (deployErr) {
                console.error('Failed to update HEARTBEAT.md:', deployErr)
            }
        }

        return ok(c, current, 'Schedules saved.')
    } catch (err) {
        console.error('saveSchedules error:', err)
        return fail(c, 'Failed to save schedules', 500)
    }
}

// Generate HEARTBEAT.md from schedule config
function generateHeartbeatMd(allSchedules: Record<string, unknown>): string {
    const core = (allSchedules as any).core || {}
    const seo = (allSchedules as any).seo || {}

    let md = '# HEARTBEAT — משימות מתוזמנות\n\n'
    md += '> ⚙️ קובץ זה מנוהל אוטומטית דרך לוח הבקרה. שינויים ידניים יידרסו.\n\n'

    // Core: Daily Brief
    const daily = core.daily_brief || { enabled: true, time: '07:00', days: [0,1,2,3,4] }
    if (daily.enabled !== false) {
        const dayStr = (daily.days || [0,1,2,3,4]).map((d: number) => DAYS_HE[d] || '?').join('-')
        md += `## יומי (${dayStr}, ${daily.time || '07:00'} שעון ישראל)\n`
        md += '**Daily Brief**\n'
        md += '- מודל: haiku (חסכוני)\n'
        md += '- ערוץ: Telegram\n'
        md += '- תוכן:\n'
        md += '  - סדר היום — פגישות ואירועים\n'
        md += '  - אימיילים שמחכים למענה\n'
        md += '  - 3 משימות עדיפות ליום\n'
        md += '  - חדשות רלוונטיות לתחום (אם יש)\n\n'
    }

    // Core: Weekly Competitive Report
    const weekly = core.weekly_competitive || { enabled: true, time: '08:00', weekday: 1 }
    if (weekly.enabled !== false) {
        const weekdayStr = DAYS_HE[weekly.weekday || 1] || 'ב'
        md += `## שבועי (יום ${weekdayStr}, ${weekly.time || '08:00'} שעון ישראל)\n`
        md += '**Full Competitive Report**\n'
        md += '- שרשרת: מטה → סייר + מאזין (במקביל) → מנתח → עט → Telegram לאישור\n'
        md += '- מודל: sonnet\n'
        md += '- תוכן:\n'
        md += '  - מה המתחרים עשו השבוע\n'
        md += '  - שינויים במחירים/features\n'
        md += '  - שיחות רלוונטיות ברשתות\n'
        md += '  - הזדמנויות תוכן מדורגות (1-10)\n'
        md += '  - 2-3 הצעות פוסטים\n\n'
    }

    // SEO: Daily GSC Check
    const gscDaily = seo.gsc_daily_check || {}
    if (gscDaily.enabled) {
        const dayStr = (gscDaily.days || [0,1,2,3,4]).map((d: number) => DAYS_HE[d] || '?').join('-')
        md += `## יומי — SEO (${dayStr}, ${gscDaily.time || '07:30'} שעון ישראל)\n`
        md += '**GSC Daily Check**\n'
        md += '- סוכן: מגדלור\n'
        md += '- מודל: haiku\n'
        md += '- תוכן:\n'
        md += '  - ירידות > 3 מיקומים ב-queries עיקריים\n'
        md += '  - impressions ללא קליקים (הזדמנויות)\n'
        md += '  - שגיאות אינדוקס חדשות\n'
        md += '  - אם יש ירידה משמעותית → התראה ב-Telegram\n\n'
    }

    // SEO: Weekly Digest
    const seoWeekly = seo.gsc_weekly_digest || {}
    if (seoWeekly.enabled) {
        const weekdayStr = DAYS_HE[seoWeekly.weekday || 3] || 'ד'
        md += `## שבועי — SEO (יום ${weekdayStr}, ${seoWeekly.time || '09:00'} שעון ישראל)\n`
        md += '**SEO Weekly Digest**\n'
        md += '- שרשרת: מגדלור (GSC data) → מנתח (trends) → עט (summary)\n'
        md += '- מודל: sonnet\n'
        md += '- תוכן:\n'
        md += '  - טופ 10 queries + שינויים מהשבוע הקודם\n'
        md += '  - דפים חדשים שנכנסו לאינדוקס\n'
        md += '  - הזדמנויות תוכן (impressions בלי קליקים)\n'
        md += '  - 2-3 המלצות ספציפיות לשיפור\n\n'
    }

    // SEO: Monthly AEO Audit (requires DataForSEO)
    const aeoAudit = seo.aeo_deep_audit || {}
    if (aeoAudit.enabled) {
        md += `## חודשי — AEO Deep Audit (${aeoAudit.monthday || 15} לחודש, ${aeoAudit.time || '10:00'})\n`
        md += '**AI Visibility Audit**\n'
        md += '- סוכן: מגדלור + סייר\n'
        md += '- מודל: sonnet\n'
        md += '- תוכן:\n'
        md += '  - ציטוטים ב-ChatGPT, Perplexity, Claude, Gemini (DataForSEO AI Visibility)\n'
        md += '  - entity consensus check — האם AI אומר עלינו דברים נכונים?\n'
        md += '  - llms.txt — עדכון אוטומטי אם צריך\n'
        md += '  - ציון AEO: 1-100\n'
        md += '  - השוואה למתחרים\n'
        md += '  - תוכנית פעולה\n\n'
    }

    // SEO: Monthly Technical Audit (requires Firecrawl)
    const techAudit = seo.tech_audit || {}
    if (techAudit.enabled) {
        md += `## חודשי — ביקורת טכנית (${techAudit.monthday || 1} לחודש, ${techAudit.time || '10:00'})\n`
        md += '**Technical SEO Audit**\n'
        md += '- סוכן: מאתר\n'
        md += '- מודל: haiku\n'
        md += '- תוכן:\n'
        md += '  - קישורים שבורים, דפים איטיים, Schema.org\n'
        md += '  - Core Web Vitals (LCP, FID, CLS)\n'
        md += '  - llms.txt — קיים? מעודכן?\n'
        md += '  - רשימת תיקונים מדורגת לפי חשיבות\n\n'
    }

    md += '## הערות\n'
    md += '- כל המשימות ב-timezone: Asia/Jerusalem\n'
    md += '- אם משימה נכשלת — התראה ב-Telegram + retry אחרי 30 דקות\n'
    md += '- אין משימות בשבת (שישי אחה"צ — שבת ערב)\n'

    return md
}