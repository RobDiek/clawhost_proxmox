/**
 * Trial Manager — runs every hour on management server
 *
 * Day 5: sends Telegram reminder "trial ends in 2 days"
 * Day 7: AllPay auto-charges (we don't need to do anything)
 * Day 7+: if payment fails → suspend VPS
 * Day 14: if still suspended → terminate
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and, lt, lte, gte } from 'drizzle-orm'
import telegram from '@/services/telegram'
import provisioner from '@/services/provisioner'

export async function runTrialManager() {
    const now = new Date()

    // ── Day 5 reminder: trial ends in 2 days ──
    const reminderThreshold = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
    const reminderStart = new Date(now.getTime() + 1.5 * 24 * 60 * 60 * 1000)   // 1.5 days (avoid double-send)

    const aboutToExpire = await db.select().from(instances)
        .where(and(
            eq(instances.status, 'trial'),
            lte(instances.trialEndsAt, reminderThreshold),
            gte(instances.trialEndsAt, reminderStart),
        ))

    for (const inst of aboutToExpire) {
        if (inst.telegramChatId) {
            const daysLeft = Math.ceil((new Date(inst.trialEndsAt!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            try {
                await telegram.sendMessage(inst.telegramChatId,
                    `⏰ *תזכורת: תקופת הניסיון מסתיימת בעוד ${daysLeft} ימים*\n\n` +
                    `אחרי סיום הניסיון, התשלום יחויב אוטומטית לפי הכרטיס שהזנתם.\n` +
                    `אם תרצו לבטל — היכנסו לדשבורד → הגדרות → ביטול.\n\n` +
                    `[פתחו את הדשבורד](https://clawflow.flowmatic.co.il/dashboard)`,
                    { parse_mode: 'Markdown' }
                )
            } catch { /* non-critical */ }
        }
    }

    // ── Expired trials: suspend if payment didn't go through ──
    // AllPay auto-charges on day 7. If subscriptionStatus is still 'trial'
    // after trialEndsAt → payment failed or wasn't processed
    const expired = await db.select().from(instances)
        .where(and(
            eq(instances.status, 'trial'),
            lt(instances.trialEndsAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)) // 1 day grace after trial end
        ))

    for (const inst of expired) {
        console.log(`Trial expired for instance ${inst.id} — suspending`)

        if (inst.hetznerServerId) {
            try {
                await provisioner.suspend(inst.hetznerServerId)
            } catch (err) {
                console.error(`Failed to suspend ${inst.id}:`, err)
            }
        }

        await db.update(instances).set({
            status: 'trial_expired',
            suspendedAt: new Date(),
        }).where(eq(instances.id, inst.id))

        if (inst.telegramChatId) {
            try {
                await telegram.sendMessage(inst.telegramChatId,
                    `⚠️ *תקופת הניסיון הסתיימה*\n\n` +
                    `התשלום לא עבר — השרת הוקפא.\n` +
                    `הנתונים שלכם שמורים למשך 7 ימים.\n\n` +
                    `[חדשו את המנוי בדשבורד](https://clawflow.flowmatic.co.il/dashboard)`,
                    { parse_mode: 'Markdown' }
                )
            } catch { /* non-critical */ }
        }

        await telegram.alertAdmin(`⏰ Trial expired: ${inst.id} (${inst.subdomainName}) — suspended`).catch(() => {})
    }

    // ── Terminate suspended trials after 7 more days ──
    const terminateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const toTerminate = await db.select().from(instances)
        .where(and(
            eq(instances.status, 'trial_expired'),
            lt(instances.suspendedAt, terminateThreshold)
        ))

    for (const inst of toTerminate) {
        console.log(`Terminating abandoned trial instance ${inst.id}`)
        if (inst.hetznerServerId) {
            try {
                await provisioner.terminate(inst.id, inst.hetznerServerId, inst.subdomainAgent || undefined, inst.subdomainFlows || undefined)
            } catch (err) {
                console.error(`Failed to terminate ${inst.id}:`, err)
            }
        }
        await db.update(instances).set({ status: 'terminated' }).where(eq(instances.id, inst.id))
        await telegram.alertAdmin(`🗑️ Terminated abandoned trial: ${inst.id}`).catch(() => {})
    }

    console.log(`Trial manager: ${aboutToExpire.length} reminders, ${expired.length} suspended, ${toTerminate.length} terminated`)
}
