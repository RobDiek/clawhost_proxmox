/**
 * Annual renewal reminder cron (S3 step 3).
 *
 * Annual plans are one-time yearly charges (AllPay has no yearly auto-renew), so
 * ~14 days before next_billing_at we email the customer to re-subscribe before
 * their agent lapses. Idempotent: renewal_reminder_sent_at gates one send per
 * cycle; the billing webhook clears it on the next payment.
 *
 * Runs daily (wired in index.ts). No-op when no annual instances are expiring.
 */
import { and, eq, gt, lte, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { sendRenewalReminder } from '@/services/renewalReminderEmail'

const REMIND_WINDOW_DAYS = 14

export async function runRenewalReminder(): Promise<void> {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + REMIND_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const due = await db
        .select({ id: instances.id })
        .from(instances)
        .where(
            and(
                eq(instances.billingPeriod, 'annual'),
                eq(instances.status, 'running'),
                isNull(instances.renewalReminderSentAt),
                gt(instances.nextBillingAt, now), // not already lapsed
                lte(instances.nextBillingAt, windowEnd) // within the reminder window
            )
        )

    if (due.length === 0) return
    console.log(`[renewalReminder] ${due.length} annual instance(s) due for a renewal reminder`)
    for (const row of due) {
        try {
            const res = await sendRenewalReminder(row.id)
            if (res.sent) {
                await db
                    .update(instances)
                    .set({ renewalReminderSentAt: new Date() })
                    .where(eq(instances.id, row.id))
            } else {
                console.warn(`[renewalReminder] ${row.id} not sent: ${res.reason}`)
            }
        } catch (err) {
            console.error(`[renewalReminder] ${row.id} failed:`, (err as Error).message)
        }
    }
}