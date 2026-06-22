/**
 * Platform-side conversational reply for an agent's Telegram bot.
 *
 * The agent's OpenClaw gateway isn't network-reachable from the management
 * server (private VPS port, non-public subdomain), so we answer free-text
 * Telegram messages HERE — grounded in the agent's FULL business context
 * (onboarding answers + positioning + chosen strategy + monthly plan + recent
 * activity) plus per-chat conversation history — via the agent's own Claude
 * key. Hebrew, 2nd-person plural.
 *
 * Fire-and-forget from the webhook: the webhook returns 200 immediately
 * (Telegram needs a fast ack) and this runs async, sending the reply when ready.
 */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { mutateResearchData, type MatehAgentRow } from '@/services/agentContext'

const CHAT_MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 12   // keep last N exchanges per chat

interface ChatTurn { role: 'user' | 'assistant'; text: string }

async function tgSend(botToken: string, chatId: string, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15000),
    }).catch(() => { /* best effort */ })
}

async function tgTyping(botToken: string, chatId: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        signal: AbortSignal.timeout(8000),
    }).catch(() => { /* best effort */ })
}

function clip(s: unknown, n: number): string {
    return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
}

function buildContextBlock(rd: any, recent: Array<{ title: string | null; outputType: string | null; status: string | null }>): string {
    const a = rd?.answers || {}
    const res = rd?.results || {}
    const lines: string[] = []
    lines.push(`שם העסק: ${a.businessName || a.brandName || '—'}`)
    if (a.businessDesc || a.description) lines.push(`תיאור: ${clip(a.businessDesc || a.description, 400)}`)
    if (a.productsFunnel) lines.push(`מוצרים/שירותים: ${clip(a.productsFunnel, 400)}`)
    if (a.websiteUrl) lines.push(`אתר: ${a.websiteUrl}`)
    // Positioning narrative (the brand's strategic identity)
    const pos = res.positioning?.content || res.positioning?.records
    if (pos) lines.push(`מיצוב: ${clip(typeof pos === 'string' ? pos : JSON.stringify(pos), 700)}`)
    // Chosen strategy scenario + budget
    const cs = rd?.chosenScenario
    if (cs) lines.push(`אסטרטגיה נבחרת: ${cs.scenario_label_he || cs.scenario || '—'}`)
    // Monthly plan snapshot
    const mp = rd?.monthlyPlan
    if (mp?.tasks?.length) {
        const theme = mp.overview?.keyTheme || mp.overview?.hebrew
        lines.push(`תוכנית חודשית: ${mp.tasks.length} משימות${theme ? ` · נושא: ${clip(theme, 160)}` : ''}`)
    }
    if (recent.length) {
        lines.push('פעילות אחרונה: ' + recent.map(r => `${clip(r.title, 50)} (${r.status})`).join(' · '))
    }
    return lines.join('\n').slice(0, 3000)
}

export async function handleAgentChatMessage(opts: {
    agent: MatehAgentRow | null
    instanceId: string
    chatId: string
    text: string
    botToken: string
}): Promise<void> {
    const { agent, instanceId, chatId, text, botToken } = opts
    if (!agent) return
    await tgTyping(botToken, chatId)
    const r = await generateAgentReply({ agent, instanceId, text, chatKey: chatId })
    if (!r.ok || !r.reply) {
        const msg = r.error === 'no_key'
            ? 'קיבלנו את ההודעה 🙏 — נחזור אליכם דרך הדשבורד.'
            : 'מצטערים, הייתה תקלה. נסו שוב מאוחר יותר 🙏'
        await tgSend(botToken, chatId, msg)
        return
    }
    await tgSend(botToken, chatId, r.reply)
}

/**
 * Generate the agent's conversational reply — the SINGLE engine behind BOTH the
 * Telegram bot and the in-app dashboard chat, so the two surfaces behave
 * identically (same business context, Hebrew 2nd-person-plural, approval-flow
 * wording) and SHARE one conversation history (keyed by chatKey — pass the
 * Telegram chatId so the dashboard and Telegram are literally one conversation).
 * Does NOT deliver anywhere — the caller sends the reply. Records both turns into
 * the agent chat feed + the shared history.
 */
export async function generateAgentReply(opts: {
    agent: MatehAgentRow | null
    instanceId: string
    text: string
    chatKey: string
}): Promise<{ ok: boolean; reply?: string; error?: string }> {
    const { agent, instanceId, text, chatKey } = opts
    if (!agent) return { ok: false, error: 'no_agent' }
    const apiKey = agent.aiProviderKey
    // Anthropic-only for now (the recommended + default provider).
    if (!apiKey || (agent.aiProviderType && agent.aiProviderType !== 'anthropic')) {
        return { ok: false, error: 'no_key' }
    }
    try {
        const rd: any = (agent.researchData as any) || {}
        const businessName = rd.answers?.businessName || agent.brandSlug || 'העסק'

        // Recent activity (last 3 outputs) for situational awareness.
        let recent: Array<{ title: string | null; outputType: string | null; status: string | null }> = []
        try {
            recent = await db.select({ title: agentOutputs.title, outputType: agentOutputs.outputType, status: agentOutputs.status })
                .from(agentOutputs)
                .where(eq(agentOutputs.agentId, agent.id))
                .orderBy(desc(agentOutputs.createdAt))
                .limit(3) as any
        } catch { /* non-fatal */ }

        const context = buildContextBlock(rd, recent)
        const history: ChatTurn[] = Array.isArray(rd.telegramChats?.[chatKey]) ? rd.telegramChats[chatKey].slice(-MAX_TURNS) : []

        const system = `אתם הסוכן השיווקי החכם של "${businessName}" בפלטפורמת Flowmatic. אתם משוחחים עם בעל/ת העסק.
ענו תמיד בעברית, בפנייה בלשון רבים (אתם/תוכלו/לכם), בטון מקצועי, חם ותמציתי — 2-5 משפטים אלא אם ביקשו פירוט.
יש לכם הקשר מלא על העסק (למטה). אל תמציאו נתונים — אם משהו לא ידוע, אמרו זאת בכנות.
אם המשתמש מבקש שינוי או פעולה (קמפיין, תוכן, תקציב, אתר וכו') — אשרו שהבנתם, הסבירו בקצרה מה תעשו, וציינו שזה יופיע כמשימה לאישור ב"משימות פעילות" בדשבורד (כל שינוי עובר אישור).

== הקשר העסק ==
${context}`

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: CHAT_MODEL,
                max_tokens: 800,
                system,
                messages: [...history.map(h => ({ role: h.role, content: h.text })), { role: 'user', content: text }],
            }),
            signal: AbortSignal.timeout(60000),
        })
        if (!res.ok) {
            console.warn(`[agentChat] ${agent.id} anthropic ${res.status}`)
            return { ok: false, error: 'anthropic_' + res.status }
        }
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const reply = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        if (!reply) return { ok: false, error: 'empty' }

        // Mirror both turns into the in-app feed.
        const { recordAgentChatFeed } = await import('@/services/agentChatFeed')
        await recordAgentChatFeed(instanceId, agent.id, text, { kind: 'agent', direction: 'in' })
        await recordAgentChatFeed(instanceId, agent.id, reply, { kind: 'agent', direction: 'out' })

        // Persist conversation history (dual-write safe) under the shared key.
        await mutateResearchData(agent, instanceId, (rr: any) => {
            const tc = (rr.telegramChats && typeof rr.telegramChats === 'object') ? rr.telegramChats : {}
            const h: ChatTurn[] = Array.isArray(tc[chatKey]) ? tc[chatKey] : []
            h.push({ role: 'user', text: clip(text, 1500) }, { role: 'assistant', text: clip(reply, 2000) })
            tc[chatKey] = h.slice(-MAX_TURNS * 2)
            rr.telegramChats = tc
            return rr
        })
        return { ok: true, reply }
    } catch (err) {
        console.warn(`[agentChat] ${agent.id} error:`, (err as Error).message)
        return { ok: false, error: (err as Error).message }
    }
}