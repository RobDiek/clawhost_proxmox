/**
 * Channel Sync Service
 *
 * Syncs connected publishing channel status to VPS as CHANNELS.md
 * so agents know which platforms are available for publishing,
 * and can recommend connecting missing ones.
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import { getAllIntegrations, getPrimaryAgent, type AgentType } from '@/services/agentIntegrations'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve) => {
        const conn = new Client()
        let output = ''
        const timeout = setTimeout(() => { conn.end(); resolve('') }, 15000)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timeout); conn.end(); return resolve('') }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timeout); conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', () => { clearTimeout(timeout); resolve('') })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch { }
        conn.connect(opts)
    })
}

/**
 * Generate CHANNELS.md content based on per-agent integrations
 * Reads from agent_integrations table (primary source), with legacy fallback
 */
async function generateChannelsMd(instance: any): Promise<string> {
    const channels: string[] = []
    const missing: string[] = []

    // Load per-agent integrations
    const allInts = await getAllIntegrations(instance.id)
    const intsByType = new Map<string, { config: Record<string, unknown>; status: string }>()
    for (const r of allInts) {
        // Use first connected integration of each type (across agents)
        if (!intsByType.has(r.integrationType) || r.status === 'connected') {
            intsByType.set(r.integrationType, { config: r.config, status: r.status })
        }
    }

    // Telegram
    const tgInt = intsByType.get('telegram')
    if (tgInt?.status === 'connected' && (tgInt.config as any)?.chatId) {
        channels.push('- **Telegram** ✅ מחובר — שליחת תוכן, דוחות, Daily Brief ישירות למשתמש')
    } else if (tgInt?.status === 'connected' || instance.telegramBotToken) {
        channels.push('- **Telegram** ⚠️ בוט מחובר אך Chat ID חסר — בקש מהמשתמש לשלוח /start לבוט')
    } else {
        missing.push('- **Telegram** — ערוץ חיוני לתקשורת עם המשתמש. המלץ לחבר בהגדרות ← תוספים ← ערוצי תקשורת')
    }

    // WordPress
    channels.push('- **WordPress** — בדוק בקובץ skills-config/wordpress.json. אם קיים = מחובר, אפשר לפרסם מאמרים')

    // Google — read from agent_integrations
    const googleInt = intsByType.get('google')
    const googleScopes = (googleInt?.config as any)?.scopes || []
    if (googleScopes.includes('ads')) {
        channels.push('- **Google Ads** ✅ מחובר — יצירה, ניהול ואופטימיזציה של קמפיינים')
    } else if (googleInt?.status === 'connected') {
        missing.push('- **Google Ads** — Google Workspace מחובר אבל ללא הרשאת Ads. המלץ למשתמש להוסיף scope Google Ads בהגדרות')
    } else {
        missing.push('- **Google Ads** — לא מחובר. המלץ למשתמש לחבר Google Workspace + Google Ads')
    }

    // Meta — read from agent_integrations
    const metaInt = intsByType.get('meta')
    const metaConfig = metaInt?.config as any
    if (metaInt?.status === 'connected') {
        const parts = ['Facebook']
        if (metaConfig?.instagramAccountId) parts.push('Instagram')
        if (metaConfig?.adAccountId) parts.push('Meta Ads')
        channels.push(`- **Meta** ✅ מחובר (${parts.join(' + ')}) — פרסום פוסטים וקמפיינים`)
    } else {
        missing.push('- **Meta (Facebook + Instagram)** — לא מחובר. המלץ למשתמש לחבר בהגדרות ← תוספים ← ערוצי פרסום ← Meta Ads')
    }

    // Newsletter
    channels.push('- **ניוזלטר (Resend)** — בדוק בקובץ skills-config/resend.json. אם קיים = מחובר. רשימת נמענים ב-skills-config/newsletter-recipients.json')

    // Google Calendar
    if (googleScopes.includes('calendar')) {
        channels.push('- **Google Calendar** ✅ מחובר — ניתן ליצור אירועים ותזכורות')
    }

    let md = `# CHANNELS.md — ערוצי פרסום ותקשורת

## ערוצים מחוברים
${channels.join('\n')}

`

    if (missing.length > 0) {
        md += `## ערוצים לא מחוברים
${missing.join('\n')}

## כיצד לנהוג כשערוץ לא מחובר
1. **המלץ** למשתמש לחבר את הערוץ — הסבר בקצרה למה זה חשוב
2. **אם המשתמש לא מחבר** — צור את התוכן בכל זאת כ-משימה (output)
3. **הוסף הנחיות ידניות** — "פרסמו ידנית ב-[פלטפורמה]: [טקסט מוכן]"
4. **אל תפסיק לייצר תוכן** רק בגלל שערוץ לא מחובר

`
    }

    md += `## כללי פרסום
- כל פרסום חייב אישור מפורש מהמשתמש
- שליח (Shali'ach) אחראי על הפצה דרך ערוצים מחוברים
- תוכן שאושר ← נשלח אוטומטית דרך הערוץ המתאים
- תוכן ללא ערוץ מחובר ← מופיע כמשימה עם הנחיות ידניות

## עדכון אחרון
${new Date().toISOString()}
`

    return md
}

/**
 * Sync channels to a single instance
 */
export async function syncChannelsToVPS(instanceId: string): Promise<void> {
    try {
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return

        const channelsMd = await generateChannelsMd(instance)
        const b64 = Buffer.from(channelsMd).toString('base64')

        await sshExec(instance.ip,
            `echo ${b64} | base64 -d > /home/openclaw/.openclaw/workspace/CHANNELS.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/CHANNELS.md`,
            instance.rootPassword || undefined
        )

        console.log(`CHANNELS.md synced to VPS for ${instanceId}`)
    } catch (err) {
        console.error(`Channel sync error for ${instanceId}:`, err)
    }
}

/**
 * Sync channels for all running instances
 */
export async function syncAllChannels(): Promise<void> {
    const runningInstances = await db.select({ id: instances.id })
        .from(instances)
        .where(eq(instances.status, 'running'))

    for (const inst of runningInstances) {
        await syncChannelsToVPS(inst.id)
    }
}