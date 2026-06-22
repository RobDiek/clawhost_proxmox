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
    const apiKey = agent.aiProviderKey
    // Anthropic-only for now (the recommended + default provider). If the agent
    // uses another provider or has no key, fall back to a polite holding reply.
    if (!apiKey || (agent.aiProviderType && agent.aiProviderType !== 'anthropic')) {
        await tgSend(botToken, chatId, 'קיבלנו את ההודעה 🙏 — נחזור אליכם דרך הדשבורד.')
        return
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
        const history: ChatTurn[] = Array.isArray(rd.telegramChats?.[chatId]) ? rd.telegramChats[chatId].slice(-MAX_TURNS) : []

        const system = `אתם הסוכן השיווקי החכם של "${businessName}" בפלטפורמת Flowmatic. אתם משוחחים עם בעל/ת העסק בטלגרם.
ענו תמיד בעברית, בפנייה בלשון רבים (אתם/תוכלו/לכם), בטון מקצועי, חם ותמציתי — 2-5 משפטים אלא אם ביקשו פירוט.
יש לכם הקשר מלא על העסק (למטה). אל תמציאו נתונים — אם משהו לא ידוע, אמרו זאת בכנות.
אם המשתמש מבקש שינוי או פעולה (קמפיין, תוכן, תקציב, אתר וכו') — אשרו שהבנתם, הסבירו בקצרה מה תעשו, וציינו שזה יופיע כמשימה לאישור ב"משימות פעילות" בדשבורד (כל שינוי עובר אישור).

== הקשר העסק ==
${context}`

        await tgTyping(botToken, chatId)

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
            console.warn(`[telegramAgentChat] ${agent.id} anthropic ${res.status}`)
            await tgSend(botToken, chatId, 'מצטערים, הייתה תקלה רגעית. נסו שוב בעוד רגע 🙏')
            return
        }
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const reply = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        if (!reply) { await tgSend(botToken, chatId, 'מצטערים, לא הצלחנו לנסח תשובה. נסו לנסח מחדש 🙏'); return }

        await tgSend(botToken, chatId, reply)
        // Mirror the live conversation (user msg + agent reply) into the in-app
        // "צ'אט עם סוכן" feed so it matches Telegram exactly.
        const { recordAgentChatFeed } = await import('@/services/agentChatFeed')
        await recordAgentChatFeed(instanceId, agent.id, text, { kind: 'agent', direction: 'in' })
        await recordAgentChatFeed(instanceId, agent.id, reply, { kind: 'agent', direction: 'out' })

        // Persist conversation history on the agent (dual-write safe).
        await mutateResearchData(agent, instanceId, (r: any) => {
            const tc = (r.telegramChats && typeof r.telegramChats === 'object') ? r.telegramChats : {}
            const h: ChatTurn[] = Array.isArray(tc[chatId]) ? tc[chatId] : []
            h.push({ role: 'user', text: clip(text, 1500) }, { role: 'assistant', text: clip(reply, 2000) })
            tc[chatId] = h.slice(-MAX_TURNS * 2)
            r.telegramChats = tc
            return r
        })
    } catch (err) {
        console.warn(`[telegramAgentChat] ${agent.id} error:`, (err as Error).message)
        await tgSend(botToken, chatId, 'מצטערים, הייתה תקלה. נסו שוב מאוחר יותר 🙏')
    }
}