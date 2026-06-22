/**
 * Approval-Queue ↔ Telegram sync (bi-directional).
 *
 * Every pending_review agent_output sends a Telegram message to the
 * instance owner's private chat with inline action buttons:
 *   [✅ אישור]  [✏️ עריכה]  [🗑 דחייה]  [🔗 לוח בקרה]
 *
 * Press a button → Telegram posts a callback_query to our webhook:
 *   POST /hosting/telegram/webhook/:instanceId
 * Webhook verifies secret (stored per-instance), calls the existing
 * approve/reject logic, and edits the message in place to reflect the
 * new status.
 *
 * On dashboard actions (approve / reject / edit / publish / archive),
 * updateApprovalQueueMessage() is called to mutate the same Telegram
 * message so both surfaces stay in sync.
 *
 * Message identity stored in agent_outputs.metadata.telegram:
 *   { chatId: string, messageId: number, sentAt: iso }
 *
 * Webhook secret stored in instances.telegramWebhookSecret (random 24-byte
 * hex generated when the bot is first connected). Telegram's setWebhook
 * accepts a `secret_token` which gets sent back as the
 * X-Telegram-Bot-Api-Secret-Token header on every update — we compare that.
 */
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { buildDisplayHe } from '@/services/userDisplayHe'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.flowmatic.co.il'
const API_URL = process.env.API_URL || 'https://api.clawflow.flowmatic.co.il'

// ─── Hebrew channel/output-type labels ─────────────────────────────────────
const CHANNEL_HE: Record<string, string> = {
    facebook: 'פייסבוק', instagram: 'אינסטגרם', blog: 'בלוג', email: 'ניוזלטר',
    youtube: 'יוטיוב', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
    google_ads: 'גוגל אדס', meta_ads: 'מטא אדס', reddit: 'רדיט', twitter: 'טוויטר',
    whatsapp: 'וואטסאפ', newsletter: 'ניוזלטר',
}
const OUTPUT_TYPE_HE: Record<string, string> = {
    blog_article: 'מאמר לבלוג',
    content_post: 'פוסט',
    weekly_ops_brief: 'דוח ביצועים שבועי',
    weekly_creative_report: 'דוח קריאייטיב שבועי',
    creative_final_draft: 'טיוטת קריאייטיב',
    google_ads_campaign: 'קמפיין Google Ads',
}

// ─── Telegram low-level API wrapper ────────────────────────────────────────
async function tgApi(token: string, method: string, body: Record<string, unknown>): Promise<any> {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        })
        const json = await res.json() as { ok: boolean; result?: any; description?: string }
        return json
    } catch (err) {
        console.warn(`[approvalTg] ${method} failed:`, (err as Error).message)
        return { ok: false, error: (err as Error).message }
    }
}

// ─── Format message text ───────────────────────────────────────────────────
function formatMessage(output: {
    title: string | null
    content: string | null
    platform: string | null
    outputType: string
    agentRole: string
    scheduledFor: Date | null
    metadata: unknown
    status: string
}): string {
    const md = (output.metadata as Record<string, unknown> | null) || {}
    const channelLabel = output.platform ? (CHANNEL_HE[output.platform] || output.platform) : ''
    const typeLabel = OUTPUT_TYPE_HE[output.outputType] || output.outputType
    const pillar = (md.pillar as string) || ''
    const persona = (md.persona as string) || ''
    const schedLine = output.scheduledFor
        ? `📅 ${new Date(output.scheduledFor).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : ''

    // Body preview — NEVER dump raw JSON. Structured content (weekly reports,
    // ops briefs…) is rendered to clean Hebrew via displayHe / buildDisplayHe;
    // plain text passes through. Then strip markdown + cap.
    const bodyRaw = humanBody(output.content).replace(/[*_`#>]/g, '').replace(/\n+/g, ' ').trim()
    const bodyPreview = bodyRaw.length > 280 ? bodyRaw.substring(0, 277) + '…' : bodyRaw

    const statusLine = statusLineFor(output.status)
    const header = statusLine ? `${statusLine}\n\n` : ''

    return `${header}🔔 <b>${escapeHtml(typeLabel)}</b> ${channelLabel ? `· ${channelLabel}` : ''}\n` +
        `<b>${escapeHtml(output.title || '—')}</b>\n\n` +
        (bodyPreview ? `${escapeHtml(bodyPreview)}\n\n` : '') +
        (pillar ? `🎯 ${escapeHtml(pillar)}\n` : '') +
        (persona ? `👤 ${escapeHtml(persona)}\n` : '') +
        (schedLine ? `${schedLine}\n` : '')
}

// Derive a human-readable Hebrew body from an output's stored content. JSON
// content (weekly reports / ops briefs) is rendered via the shared displayHe
// layer instead of being dumped raw; plain text passes through unchanged.
function humanBody(content: string | null): string {
    const s = (content || '').trim()
    if (!s) return ''
    if (s.charAt(0) === '{' || s.charAt(0) === '[') {
        try {
            const obj = JSON.parse(s)
            if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.displayHe === 'string' && obj.displayHe.trim()) {
                return obj.displayHe
            }
            const he = buildDisplayHe(obj)
            if (he.trim()) return he
        } catch {
            // Truncated / invalid JSON (e.g. oversized content cut mid-structure).
            // NEVER dump raw JSON to the user — salvage a displayHe field via regex
            // if the producer set one; otherwise drop the body (title + buttons
            // still render). This is the systemic guarantee: no scenario leaks JSON.
            const m = s.match(/"displayHe"\s*:\s*"((?:[^"\\]|\\.)*)"/)
            if (m) { try { return JSON.parse(`"${m[1]}"`) } catch { return m[1] } }
        }
        // JSON-shaped content we could not humanize → never return the raw braces.
        return ''
    }
    return s
}

function statusLineFor(status: string): string {
    switch (status) {
        case 'approved': return '✅ <b>אושר</b>'
        case 'rejected': return '🗑 <b>נדחה</b>'
        case 'published': return '🚀 <b>פורסם</b>'
        case 'archived': return '📦 <b>ארכיון</b>'
        case 'pending_review': return '⏳ <b>ממתין לאישור</b>'
        default: return ''
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Inline keyboard builders ──────────────────────────────────────────────
function buildKeyboard(outputId: string, status: string, detailUrl: string) {
    if (status === 'pending_review') {
        return {
            inline_keyboard: [
                [
                    { text: '✅ אישור', callback_data: `approve:${outputId}` },
                    { text: '🗑 דחייה', callback_data: `reject:${outputId}` },
                ],
                [
                    { text: '✏️ עריכה בלוח', url: detailUrl },
                    { text: '🔗 פרטים', callback_data: `detail:${outputId}` },
                ],
            ],
        }
    }
    if (status === 'approved') {
        return {
            inline_keyboard: [
                [
                    { text: '🚀 פרסום עכשיו', callback_data: `publish:${outputId}` },
                    { text: '📦 ארכוב', callback_data: `archive:${outputId}` },
                ],
                [{ text: '🔗 לוח בקרה', url: detailUrl }],
            ],
        }
    }
    return {
        inline_keyboard: [
            [{ text: '🔗 לוח בקרה', url: detailUrl }],
        ],
    }
}

function detailUrlFor(instanceId: string, outputId: string): string {
    return `${FRONTEND_URL}/dashboard#tab=home&approval=${outputId}`
}

// ─── Public: send initial message ──────────────────────────────────────────
export async function sendApprovalQueueMessage(outputId: string): Promise<void> {
    const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
    if (!output) return

    // Agent-scoped: route to the OUTPUT's agent bot + chat, not instance-level
    // (instance routing broke notifications for secondary agents).
    const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
    const agent = output.agentId
        ? (await resolveAgentById(output.instanceId, output.agentId)) || (await resolvePrimaryAgent(output.instanceId))
        : await resolvePrimaryAgent(output.instanceId)
    const [instance] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
    const botToken = agent?.telegramBotToken || instance?.telegramBotToken
    const chatId = agent?.telegramChatId || instance?.telegramChatId
    if (!botToken || !chatId) return

    // Don't double-send if already sent
    const md = (output.metadata as Record<string, unknown>) || {}
    if (md.telegram && (md.telegram as any).messageId) return

    const text = formatMessage(output as any)
    const keyboard = buildKeyboard(outputId, output.status, detailUrlFor(output.instanceId, outputId))

    const res = await tgApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard,
    })

    if (res.ok && res.result?.message_id) {
        await db.update(agentOutputs).set({
            metadata: {
                ...md,
                telegram: {
                    chatId: chatId,
                    messageId: res.result.message_id,
                    sentAt: new Date().toISOString(),
                },
            } as any,
            updatedAt: new Date(),
        }).where(eq(agentOutputs.id, outputId))
    } else {
        console.warn(`[approvalTg] sendApprovalQueueMessage ${outputId} failed:`, res.description || res.error)
    }

    // Mirror into the in-app agent chat feed so "צ'אט עם סוכן" shows the exact
    // same message as Telegram (HTML stripped to plain text for the feed).
    if (res.ok) {
        const { recordAgentChatFeed } = await import('@/services/agentChatFeed')
        await recordAgentChatFeed(output.instanceId, output.agentId, text.replace(/<[^>]+>/g, ''), { kind: 'approval', outputId })
    }
}

// ─── Public: update existing message (after status change) ─────────────────
export async function updateApprovalQueueMessage(outputId: string): Promise<void> {
    const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
    if (!output) return
    const md = (output.metadata as Record<string, unknown>) || {}
    const tgMeta = md.telegram as { chatId: string; messageId: number } | undefined
    if (!tgMeta?.messageId) return

    const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
    const agent = output.agentId
        ? (await resolveAgentById(output.instanceId, output.agentId)) || (await resolvePrimaryAgent(output.instanceId))
        : await resolvePrimaryAgent(output.instanceId)
    const [instance] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
    const botToken = agent?.telegramBotToken || instance?.telegramBotToken
    if (!botToken) return

    const text = formatMessage(output as any)
    const keyboard = buildKeyboard(outputId, output.status, detailUrlFor(output.instanceId, outputId))

    await tgApi(botToken, 'editMessageText', {
        chat_id: tgMeta.chatId,
        message_id: tgMeta.messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard,
    })

    // Keep the in-app feed in sync with the edited Telegram message.
    const { recordAgentChatFeed } = await import('@/services/agentChatFeed')
    await recordAgentChatFeed(output.instanceId, output.agentId, text.replace(/<[^>]+>/g, ''), { kind: 'approval', outputId })
}

// ─── Public: answer a callback_query (removes the loading spinner) ─────────
export async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
    await tgApi(botToken, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text || '',
        show_alert: false,
    })
}

// ─── Public: register webhook on bot connect ───────────────────────────────
// Called from setupTelegram once the user pastes the bot token.
export async function registerTelegramWebhook(
    botToken: string,
    instanceId: string,
    secret: string,
): Promise<{ ok: boolean; error?: string }> {
    const webhookUrl = `${API_URL}/hosting/telegram/webhook/${instanceId}`
    const res = await tgApi(botToken, 'setWebhook', {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['callback_query', 'message'],
        drop_pending_updates: false,
        max_connections: 40,
    })
    if (!res.ok) {
        console.warn(`[approvalTg] setWebhook failed for ${instanceId}:`, res.description)
        return { ok: false, error: res.description || 'setWebhook failed' }
    }
    return { ok: true }
}

// ─── Public: callback_query resolver (used by webhook handler) ─────────────
export interface CallbackAction {
    action: 'approve' | 'reject' | 'publish' | 'archive' | 'detail' | string
    outputId: string
}

export function parseCallbackData(data: string): CallbackAction | null {
    const [action, outputId] = data.split(':')
    if (!action || !outputId) return null
    return { action, outputId }
}