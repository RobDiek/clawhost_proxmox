import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'

const run = async () => {
    const allClaws = await db.select().from(claws)
    const paidClaws = allClaws.filter((c) => c.polarSubscriptionId)

    let revokedCount = 0
    let dbUpdatedCount = 0
    let errors = 0

    for (const claw of paidClaws) {
        const sub = await subscriptions.get(claw.polarSubscriptionId!)

        if (!sub) {
            console.log(
                `[SKIP] Claw ${claw.id} (${claw.name}) - subscription not found in Polar`
            )
            continue
        }

        if (sub.status === claw.subscriptionStatus) continue

        if (claw.subscriptionStatus === 'canceled' && sub.status === 'active') {
            console.log(
                `[REVOKING] Claw ${claw.id} (${claw.name}) - DB: canceled, Polar: active → revoking Polar subscription`
            )
            try {
                await subscriptions.revoke(claw.polarSubscriptionId!)
                console.log(`  ✓ Revoked ${claw.polarSubscriptionId}`)
                revokedCount++
            } catch (error) {
                console.error(
                    `  ✗ Failed to revoke ${claw.polarSubscriptionId}`,
                    error
                )
                errors++
            }
        } else if (
            claw.subscriptionStatus === 'active' &&
            (sub.status === 'canceled' || sub.status === 'revoked')
        ) {
            console.log(
                `[UPDATING DB] Claw ${claw.id} (${claw.name}) - DB: active, Polar: ${sub.status} → updating DB`
            )
            try {
                await db
                    .update(claws)
                    .set({ subscriptionStatus: sub.status })
                    .where(eq(claws.id, claw.id))
                console.log(`  ✓ Updated DB to ${sub.status}`)
                dbUpdatedCount++
            } catch (error) {
                console.error(`  ✗ Failed to update DB`, error)
                errors++
            }
        } else if (
            claw.subscriptionStatus === 'revoked' &&
            sub.status === 'canceled'
        ) {
            console.log(
                `[UPDATING DB] Claw ${claw.id} (${claw.name}) - DB: revoked, Polar: canceled → updating DB`
            )
            try {
                await db
                    .update(claws)
                    .set({ subscriptionStatus: 'canceled' })
                    .where(eq(claws.id, claw.id))
                console.log(`  ✓ Updated DB to canceled`)
                dbUpdatedCount++
            } catch (error) {
                console.error(`  ✗ Failed to update DB`, error)
                errors++
            }
        } else {
            console.log(
                `[UNKNOWN] Claw ${claw.id} (${claw.name}) - DB: ${claw.subscriptionStatus}, Polar: ${sub.status}`
            )
        }
    }

    console.log(`\n=== SYNC COMPLETE ===`)
    console.log(`Polar subscriptions revoked: ${revokedCount}`)
    console.log(`DB records updated: ${dbUpdatedCount}`)
    console.log(`Errors: ${errors}`)

    process.exit(0)
}

run()