/**
 * Telegram chat_id backfill cron.
 *
 * The agent gateway owns Telegram long-polling and CONSUMES the user's /start
 * update before setup.ts's connect-time getUpdates can read it (and Telegram
 * deletes confirmed updates → they are not replayable via an offset rollback).
 * So for any tenant who messages the bot AFTER connecting, the platform's
 * instances.telegram_chat_id stays empty → no platform push notifications
 * (instance ready / payment failed / health) and no Telegram approval-queue
 * prompts (approvalQueueTelegram reads agent?.telegramChatId || instance?.*).
 *
 * The chat_id IS present in the agent's on-VPS session once the user has
 * messaged the bot (stored as `telegram:<chatId>`). This cron backfills it:
 * for running instances with a Telegram bot configured but no chat_id, it
 * SSH-reads the primary agent's session file and extracts the chat id.
 *
 * Runs every 10 min (wired in index.ts). No-op when nothing is missing.
 */
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import executeSSH from '@/services/ssh'

// Primary agent session; secondary agents keep their own chat under a different
// path — out of scope here (the orchestrator the user connects Telegram to is
// always the primary, and notifications fall back to the instance row).
const SESSION_PATH = '/home/openclaw/.openclaw/agents/main/sessions/sessions.json'

/**
 * Extract the Telegram chat id from a serialized agent session. The session
 * stores the peer as `telegram:<chatId>`. Bot ids appear only inside the bot
 * token (`<botId>:<secret>`) and are never prefixed with `telegram:`, so this
 * cannot mistake the bot id for the chat id.
 */
export function extractTelegramChatId(sessionJson: string): string | null {
    const m = sessionJson.match(/telegram["':/ ]+(-?\d{6,})/)
    return m ? m[1] : null
}

export async function backfillTelegramChatId(): Promise<void> {
    const rows = await db
        .select({ id: instances.id, ip: instances.ip, rootPassword: instances.rootPassword })
        .from(instances)
        .where(and(
            eq(instances.status, 'running'),
            isNotNull(instances.telegramBotToken),
            isNull(instances.telegramChatId),
        ))
    if (rows.length === 0) return
    console.log(`[telegramChatIdBackfill] ${rows.length} instance(s) telegram-configured but missing chat_id`)

    for (const r of rows) {
        const ip = r.ip as unknown as string
        const pw = (r.rootPassword as unknown as string | null) || undefined
        if (!ip || !pw) continue
        try {
            const out = await executeSSH(ip, pw, `cat ${SESSION_PATH} 2>/dev/null || echo ''`, 10_000)
            const chatId = extractTelegramChatId(out)
            if (!chatId) continue
            await db.update(instances).set({ telegramChatId: chatId }).where(eq(instances.id, r.id))
            await db.update(matehAgents)
                .set({ telegramChatId: chatId })
                .where(and(eq(matehAgents.vpsInstanceId, r.id), eq(matehAgents.isPrimary, true)))
            console.log(`[telegramChatIdBackfill] ${r.id}: captured chat_id from agent session`)
        } catch (err) {
            console.warn(`[telegramChatIdBackfill] ${r.id} failed: ${(err as Error).message}`)
        }
    }
}

export function startTelegramChatIdBackfill(): void {
    setTimeout(
        () => { backfillTelegramChatId().catch(err => console.error('[telegramChatIdBackfill] first run error:', err)) },
        90_000,
    )
    setInterval(
        () => { backfillTelegramChatId().catch(err => console.error('[telegramChatIdBackfill] cron error:', err)) },
        10 * 60 * 1000,
    )
}