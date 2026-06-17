/**
 * Re-render already-sent Telegram approval-queue messages in place, so existing
 * messages pick up the humanized formatMessage (no raw JSON for reports/briefs).
 *
 * Usage on prod:
 *   cd /opt/openclaw-hosting/apps/api
 *   pnpm tsx -e 'import "dotenv/config"; import("./src/scripts/rerender-telegram-messages.ts")' <instanceId> [typeSubstr]
 *
 * <instanceId>  required
 * [typeSubstr]  optional outputType filter (substring, case-insensitive). When
 *               omitted, re-renders every message that has a stored telegram id.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { updateApprovalQueueMessage } from '@/services/approvalQueueTelegram'

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const instanceId = args[0]
    const typeSubstr = (args[1] || '').toLowerCase()
    if (!instanceId) { console.error('usage: rerender-telegram-messages <instanceId> [typeSubstr]'); process.exit(1) }

    const rows = await db.select().from(agentOutputs).where(eq(agentOutputs.instanceId, instanceId)) as any[]
    let rerendered = 0, skipped = 0
    for (const r of rows) {
        const tg = (r.metadata as any)?.telegram
        if (!tg?.messageId) { skipped++; continue }
        if (typeSubstr && !String(r.outputType || '').toLowerCase().includes(typeSubstr)) { skipped++; continue }
        try {
            await updateApprovalQueueMessage(r.id)
            rerendered++
            console.log(`rerendered ${r.id} (${r.outputType})`)
        } catch (e) {
            console.warn(`failed ${r.id}: ${(e as Error).message}`)
        }
    }
    console.log(`\n=== done — rerendered ${rerendered}, skipped ${skipped} (of ${rows.length}) ===`)
    process.exit(0)
}

main().catch((e) => { console.error('crashed:', e); process.exit(1) })