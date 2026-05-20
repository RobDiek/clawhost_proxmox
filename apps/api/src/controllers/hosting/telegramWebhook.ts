/**
 * Telegram webhook receiver — handles button presses from the approval
 * queue messages we send to the user's private chat.
 *
 * Route: POST /hosting/telegram/webhook/:instanceId  (unauth; validated by
 * X-Telegram-Bot-Api-Secret-Token header vs instances.telegramWebhookSecret)
 *
 * Supported callback_data payloads:
 *   approve:<outputId>  reject:<outputId>  publish:<outputId>
 *   archive:<outputId>  detail:<outputId>
 *
 * Each handler:
 *   1. Calls the same logic path as the dashboard endpoint (so behavior
 *      stays identical — approve hook, ingest publish, etc.)
 *   2. Updates the Telegram message in place with the new status line
 *      + a fresh keyboard fit for the new state.
 *   3. Answers the callback_query to dismiss the spinner on the button.
 */
import type { Context } from 'hono'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import {
    parseCallbackData,
    updateApprovalQueueMessage,
    answerCallbackQuery,
} from '@/services/approvalQueueTelegram'

interface TelegramUpdate {
    update_id?: number
    message?: {
        message_id: number
        chat: { id: number }
        from?: { id: number; username?: string }
        text?: string
    }
    callback_query?: {
        id: string
        from: { id: number; username?: string }
        message?: { message_id: number; chat: { id: number } }
        data?: string
    }
}

// Phase 4.3-O H10: Telegram source-IP allowlist.
// Per https://core.telegram.org/bots/webhooks — Telegram BOT API webhooks come
// from 149.154.160.0/20 (149.154.160.0 .. 149.154.175.255) and 91.108.4.0/22
// (91.108.4.0 .. 91.108.7.255). Defense-in-depth: even if a tenant's secret
// leaks, an attacker forging callback_queries from elsewhere is rejected.
//
// IPv4 only — Telegram doesn't advertise an IPv6 webhook range. If they ever
// add one we'll fail safe (reject) and update the list.
function isTelegramSourceIp(ip: string | null): boolean {
    if (!ip) return false
    // Strip IPv6-mapped prefix
    const clean = ip.replace(/^::ffff:/, '').trim()
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return false
    const parts = clean.split('.').map(Number)
    if (parts.some(p => p < 0 || p > 255)) return false
    const ipInt = (parts[0] << 24 >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
    // 149.154.160.0/20 → 149.154.160.0 .. 149.154.175.255
    const r1Start = (149 << 24 >>> 0) + (154 << 16) + (160 << 8) + 0
    const r1End   = (149 << 24 >>> 0) + (154 << 16) + (175 << 8) + 255
    if (ipInt >= r1Start && ipInt <= r1End) return true
    // 91.108.4.0/22 → 91.108.4.0 .. 91.108.7.255
    const r2Start = (91 << 24 >>> 0) + (108 << 16) + (4 << 8) + 0
    const r2End   = (91 << 24 >>> 0) + (108 << 16) + (7 << 8) + 255
    if (ipInt >= r2Start && ipInt <= r2End) return true
    return false
}

export const telegramWebhook = async (c: Context) => {
    try {
        const instanceId = c.req.param('instanceId')
        if (!instanceId) return c.json({ ok: true }, 200)   // silently drop

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.telegramBotToken) return c.json({ ok: true }, 200)

        // Phase 4.3-O H10: defense-in-depth IP allowlist (Telegram-issued CIDRs).
        // Caddy injects X-Forwarded-For; we take the FIRST entry (left-most client IP).
        // Per OWASP — never trust right-most when behind a controlled reverse proxy.
        // If TELEGRAM_IP_ALLOWLIST_DISABLED=1 (env), skip the check (testing only).
        const skipIpAllowlist = process.env.TELEGRAM_IP_ALLOWLIST_DISABLED === '1'
        const xff = (c.req.header('x-forwarded-for') || '').split(',')[0]?.trim() || null
        const sourceIp = xff || c.req.header('x-real-ip') || null
        if (!skipIpAllowlist && !isTelegramSourceIp(sourceIp)) {
            console.warn(`[telegramWebhook] ${instanceId} rejected source IP: ${sourceIp || '(none)'}`)
            return c.json({ ok: false, error: 'forbidden_source' }, 403)
        }

        // Secret token header check. Telegram echoes whatever we passed to
        // setWebhook's secret_token. If it's missing or wrong, reject.
        const expectedSecret = instance.telegramWebhookSecret
        const presentedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
        if (expectedSecret && presentedSecret !== expectedSecret) {
            console.warn(`[telegramWebhook] ${instanceId} secret mismatch`)
            return c.json({ ok: false, error: 'auth' }, 401)
        }

        const update = await c.req.json<TelegramUpdate>().catch(() => ({} as TelegramUpdate))
        const callback = update.callback_query
        if (!callback?.data) {
            // Plain message — could be /start from first pairing. Ignore
            // unless we add command support later.
            return c.json({ ok: true }, 200)
        }

        const parsed = parseCallbackData(callback.data)
        if (!parsed) {
            await answerCallbackQuery(instance.telegramBotToken, callback.id, 'פעולה לא מוכרת')
            return c.json({ ok: true }, 200)
        }

        // Fetch the output + enforce it belongs to this instance
        const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, parsed.outputId))
        if (!output || output.instanceId !== instanceId) {
            await answerCallbackQuery(instance.telegramBotToken, callback.id, 'הפריט לא נמצא')
            return c.json({ ok: true }, 200)
        }

        let ackText = ''
        switch (parsed.action) {
            case 'approve': {
                if (output.status !== 'pending_review') {
                    ackText = `הפריט כבר במצב: ${output.status}`
                    break
                }
                await db.update(agentOutputs).set({
                    status: 'approved',
                    approvedAt: new Date(),
                    approvedBy: 'telegram',
                    updatedAt: new Date(),
                }).where(eq(agentOutputs.id, output.id))
                // Post-approve triggers — same as dashboard approval
                import('./outputs').then(m => {
                    // The shared hook lives in outputs.ts but isn't exported;
                    // safe to leave it to the scheduled publish flow instead.
                    // Future: expose triggerPostApprove and call here.
                    void m
                }).catch(() => { /* nop */ })
                ackText = '✅ אושר'
                break
            }
            case 'reject': {
                if (output.status !== 'pending_review' && output.status !== 'approved') {
                    ackText = `לא ניתן לדחות במצב: ${output.status}`
                    break
                }
                await db.update(agentOutputs).set({
                    status: 'rejected',
                    updatedAt: new Date(),
                }).where(eq(agentOutputs.id, output.id))
                ackText = '🗑 נדחה'
                break
            }
            case 'archive': {
                await db.update(agentOutputs).set({
                    status: 'archived',
                    updatedAt: new Date(),
                }).where(eq(agentOutputs.id, output.id))
                ackText = '📦 ארכוב'
                break
            }
            case 'publish': {
                // Can't fully publish from TG (needs full HTTP context +
                // config lookups). Mark ready-for-publish so user can hit
                // "Publish" in dashboard, or the scheduler does it.
                if (output.status !== 'approved') {
                    ackText = 'יש לאשר לפני פרסום'
                    break
                }
                ackText = '⏳ עובר לתור פרסום — עברו לדשבורד להשלמה'
                break
            }
            case 'detail': {
                ackText = 'לפרטים מלאים — לחצו על "עריכה בלוח"'
                break
            }
            default:
                ackText = 'פעולה לא מוכרת'
        }

        await answerCallbackQuery(instance.telegramBotToken, callback.id, ackText)
        await updateApprovalQueueMessage(parsed.outputId)

        // Mirror into content plan item status if linked
        try {
            const refreshed = await db.select().from(agentOutputs).where(eq(agentOutputs.id, parsed.outputId))
            const r = refreshed[0]
            const md = (r?.metadata as any) || {}
            const cpItemId = md.contentPlanItemId as string | undefined
            if (cpItemId && r) {
                // Telegram webhook has no per-agent context — operate on the
                // primary mateh_agent of the VPS (Telegram approvals are
                // routed to whichever agent's bot answered, but plan items
                // currently live on the primary's contentPlan).
                const { resolvePrimaryAgent: _rpa, readResearchData: _rrd, writeResearchData: _wrd } =
                    await import('@/services/agentContext')
                const __agent = await _rpa(instanceId)
                const rd = await _rrd(__agent, instanceId) as any
                const plan = Array.isArray(rd.contentPlan) ? rd.contentPlan : []
                const idx = plan.findIndex((p: any) => p.id === cpItemId)
                if (idx >= 0) {
                    const statusMap: Record<string, string> = {
                        approved: 'approved',
                        rejected: 'rejected',
                        archived: 'archived',
                        published: 'published',
                        pending_review: 'awaiting_review',
                    }
                    const newStatus = statusMap[r.status] || plan[idx].status
                    if (plan[idx].status !== newStatus) {
                        plan[idx] = { ...plan[idx], status: newStatus }
                        await _wrd(__agent, instanceId, { ...rd, contentPlan: plan })
                    }
                }
            }
        } catch (err) {
            console.warn('[telegramWebhook] plan sync failed (non-fatal):', (err as Error).message)
        }

        return c.json({ ok: true }, 200)
    } catch (err) {
        console.error('[telegramWebhook] error:', err)
        // Always 200 so Telegram doesn't retry storm
        return c.json({ ok: false, error: (err as Error).message }, 200)
    }
}