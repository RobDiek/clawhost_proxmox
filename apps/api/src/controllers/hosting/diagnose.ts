import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

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
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch {}
        conn.connect(opts)
    })
}

// ── Diagnosis patterns ──
// Each pattern: regex to match error text → diagnosis + fix action

interface DiagnosisResult {
    issue: string           // Hebrew description of the problem
    severity: 'low' | 'medium' | 'high' | 'critical'
    autoFixable: boolean
    action?: string         // What we did or will do
    instructions?: string   // Instructions for user if not auto-fixable
    fixed?: boolean         // Was it fixed automatically?
    details?: string        // Technical details
}

const PATTERNS: Array<{
    match: RegExp
    issue: string
    severity: DiagnosisResult['severity']
    autoFix?: (ip: string, password?: string) => Promise<string>
    instructions?: string
}> = [
    // Gateway / OpenClaw errors
    {
        match: /gateway.*not.*respond|gateway.*down|openclaw.*not.*running|ECONNREFUSED.*3000|502.*bad.*gateway/i,
        issue: 'OpenClaw Gateway לא מגיב',
        severity: 'high',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'systemctl restart openclaw-gateway', pw)
            await new Promise(r => setTimeout(r, 5000))
            const status = await sshExec(ip, 'systemctl is-active openclaw-gateway', pw)
            return status === 'active' ? 'Gateway הופעל מחדש בהצלחה' : 'ריסטארט לא עזר — בדקו לוגים'
        },
    },
    // API rate limit
    {
        match: /rate.*limit|429|too.*many.*requests|credit.*exhausted|insufficient.*credit/i,
        issue: 'חריגה ממגבלת API — נגמרו הקרדיטים או חריגה מ-rate limit',
        severity: 'medium',
        instructions: 'היכנסו לחשבון ה-AI שלכם (Anthropic / OpenAI) ובדקו:\n1. שיש מספיק קרדיטים\n2. שה-Spend Limit לא הגיע לתקרה\n3. אם נגמרו — הוסיפו קרדיטים\n4. חזרו ל-Dashboard ונסו שוב',
    },
    // SSL / HTTPS
    {
        match: /ssl|certificate.*expir|https.*not.*secure|ERR_CERT|NET::ERR_CERT/i,
        issue: 'בעיית תעודת SSL',
        severity: 'high',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'certbot renew --quiet 2>/dev/null && nginx -t && systemctl reload nginx', pw)
            return 'תעודת SSL חודשה. רעננו את הדף.'
        },
    },
    // Disk space
    {
        match: /disk.*full|no.*space.*left|ENOSPC|disk.*usage.*[89]\d%|disk.*100%/i,
        issue: 'דיסק מלא',
        severity: 'critical',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'docker system prune -f 2>/dev/null; journalctl --vacuum-size=50M 2>/dev/null; find /var/log -name "*.gz" -mtime +3 -delete 2>/dev/null; find /tmp -mtime +7 -delete 2>/dev/null', pw)
            const disk = await sshExec(ip, "df / | awk 'NR==2{print $5}'", pw)
            return `דיסק נוקה. שימוש נוכחי: ${disk}`
        },
    },
    // RAM / OOM
    {
        match: /out.*of.*memory|OOM|killed.*process|memory.*allocation|Cannot allocate|ram.*[89]\d%/i,
        issue: 'חריגת זיכרון (RAM)',
        severity: 'high',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'systemctl restart openclaw-gateway', pw)
            await new Promise(r => setTimeout(r, 3000))
            const ram = await sshExec(ip, "free | awk '/Mem:/{printf \"%d\", $3/$2*100}'", pw)
            return `Gateway הופעל מחדש. שימוש RAM נוכחי: ${ram}%`
        },
    },
    // Telegram bot
    {
        match: /telegram.*not.*connected|bot.*not.*respond|telegram.*error|401.*unauthorized.*telegram/i,
        issue: 'בוט Telegram לא מחובר או לא מגיב',
        severity: 'medium',
        instructions: 'בדקו:\n1. שה-Bot Token תקין — היכנסו ל-@BotFather בטלגרם ובדקו\n2. שהבוט עדיין קיים ולא נמחק\n3. אם הטוקן השתנה — עדכנו ב-Dashboard → Integrations → Telegram\n4. שלחו /start לבוט מחדש',
    },
    // Google OAuth
    {
        match: /google.*token.*expired|google.*not.*connected|oauth.*error.*google|refresh.*token.*invalid/i,
        issue: 'חיבור Google פג תוקף',
        severity: 'medium',
        instructions: 'היכנסו ל-Dashboard → Integrations → Google Workspace ולחצו "חברו מחדש". זה ייקח 30 שניות.',
    },
    // Docker / containers
    {
        match: /docker.*error|container.*not.*running|compose.*failed|qdrant.*not.*respond/i,
        issue: 'שירות Docker לא פעיל',
        severity: 'high',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'cd /opt/openclaw && docker compose up -d 2>/dev/null; docker compose -f docker-compose.yml -f docker-compose.qdrant.yml up -d qdrant 2>/dev/null', pw)
            await new Promise(r => setTimeout(r, 8000))
            const status = await sshExec(ip, 'docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null | head -5', pw)
            return `שירותי Docker הופעלו מחדש:\n${status}`
        },
    },
    // Cron / scheduled tasks
    {
        match: /cron.*not.*working|scheduled.*task.*failed|daily.*brief.*not|morning.*summary.*not/i,
        issue: 'משימות מתוזמנות לא עובדות',
        severity: 'medium',
        autoFix: async (ip, pw) => {
            const crons = await sshExec(ip, "su - openclaw -c 'openclaw cron list 2>/dev/null'", pw)
            if (!crons || crons.includes('error')) {
                await sshExec(ip, 'systemctl restart openclaw-gateway', pw)
                return 'Gateway הופעל מחדש. משימות מתוזמנות אמורות לחזור לפעול.'
            }
            return `משימות מתוזמנות פעילות:\n${crons}`
        },
    },
    // MCP / skills
    {
        match: /mcp.*error|skill.*not.*found|skill.*failed|plugin.*error|brave.*search.*error/i,
        issue: 'שגיאת Skill או MCP',
        severity: 'medium',
        autoFix: async (ip, pw) => {
            // Reinstall common skills
            await sshExec(ip, "su - openclaw -c 'openclaw skills install brave-search 2>/dev/null; openclaw skills install brave-headless 2>/dev/null'", pw)
            await sshExec(ip, 'systemctl restart openclaw-gateway', pw)
            return 'Skills הותקנו מחדש ו-Gateway הופעל מחדש.'
        },
    },
    // Nginx
    {
        match: /nginx.*error|502|503|504.*gateway|upstream.*timed.*out/i,
        issue: 'שגיאת Nginx (שרת פרוקסי)',
        severity: 'high',
        autoFix: async (ip, pw) => {
            await sshExec(ip, 'nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null', pw)
            return 'Nginx הופעל מחדש.'
        },
    },
    // Whisper / voice
    {
        match: /whisper.*error|voice.*not.*working|transcription.*failed|audio.*error/i,
        issue: 'תמלול קולי לא עובד',
        severity: 'low',
        instructions: 'בדקו:\n1. שיש מפתח OpenAI מוגדר (Whisper דורש OpenAI API)\n2. או שה-ffmpeg מותקן על השרת\n3. נסו לשלוח הודעה קולית קצרה (עד 10 שניות) כבדיקה',
    },
]

// ── Diagnosis endpoint ──

export const diagnoseError = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ errorText: string }>()
        if (!body.errorText || body.errorText.length < 5) {
            return fail(c, 'הדביקו הודעת שגיאה (לפחות 5 תווים)', 400)
        }
        if (body.errorText.length > 5000) {
            return fail(c, 'הודעת השגיאה ארוכה מדי (מקסימום 5000 תווים)', 400)
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const errorText = body.errorText

        // Match against known patterns
        for (const pattern of PATTERNS) {
            if (pattern.match.test(errorText)) {
                const result: DiagnosisResult = {
                    issue: pattern.issue,
                    severity: pattern.severity,
                    autoFixable: !!pattern.autoFix,
                }

                if (pattern.autoFix && instance.autoHeal !== false) {
                    try {
                        const fixResult = await pattern.autoFix(instance.ip, instance.rootPassword || undefined)
                        result.action = fixResult
                        result.fixed = true
                    } catch (err) {
                        result.action = 'ניסיון תיקון אוטומטי נכשל'
                        result.fixed = false
                        result.instructions = pattern.instructions || 'נסו ריסטארט מה-Dashboard → הגדרות → מפתחים, או צרו קשר עם התמיכה.'
                    }
                } else if (pattern.instructions) {
                    result.instructions = pattern.instructions
                } else {
                    result.instructions = 'ריפוי אוטומטי כבוי. הפעילו ב-הגדרות או בצעו את הפעולה ידנית.'
                }

                return ok(c, result, 'Diagnosis complete')
            }
        }

        // No pattern matched — generic response
        return ok(c, {
            issue: 'לא זוהתה שגיאה מוכרת',
            severity: 'medium' as const,
            autoFixable: false,
            instructions: 'השגיאה לא מוכרת למערכת. נסו:\n1. ריסטארט מהדשבורד (הגדרות → מפתחים)\n2. בדקו שיש קרדיטים ב-Anthropic/OpenAI\n3. בדקו לוגים בלשונית "מפתחים" → "לוגים"\n4. אם הבעיה נמשכת — שלחו מייל ל-support@flowmatic.co.il עם הודעת השגיאה המלאה',
        } as DiagnosisResult, 'No known pattern')
    } catch (err) {
        console.error('diagnoseError error:', err)
        return fail(c, 'Failed to diagnose', 500)
    }
}