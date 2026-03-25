import 'dotenv/config'

import { eq, and, isNotNull, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'

const run = async () => {
    const dryRun = !process.argv.includes('--apply')

    if (dryRun) {
        console.log('DRY RUN — no changes will be made.')
        console.log('Pass --apply to actually update the database.\n')
    } else {
        console.log('LIVE RUN — changes will be written to the database.\n')
    }

    const affectedClaws = await db
        .select({
            id: claws.id,
            name: claws.name,
            polarSubscriptionId: claws.polarSubscriptionId,
            billingInterval: claws.billingInterval
        })
        .from(claws)
        .where(
            and(
                isNotNull(claws.polarSubscriptionId),
                isNull(claws.billingInterval)
            )
        )

    if (affectedClaws.length === 0) {
        console.log('No claws need backfilling.')
        return
    }

    console.log(`Found ${affectedClaws.length} claw(s) to backfill:\n`)

    let updated = 0
    let skipped = 0
    let failed = 0

    for (const claw of affectedClaws) {
        const subId = claw.polarSubscriptionId!

        console.log(`  Claw: ${claw.id} (${claw.name})`)
        console.log(`    Subscription: ${subId}`)

        let sub
        try {
            sub = await subscriptions.get(subId)
        } catch (err) {
            console.log(`    FAILED to fetch subscription: ${err}`)
            failed++
            console.log()
            continue
        }

        if (!sub) {
            console.log('    SKIPPED — subscription not found in Polar')
            skipped++
            console.log()
            continue
        }

        let interval = 'month'

        if (sub.metadata?.billingInterval) {
            interval = sub.metadata.billingInterval
        } else if (sub.currentPeriodStart && sub.currentPeriodEnd) {
            const diffMs =
                sub.currentPeriodEnd.getTime() -
                sub.currentPeriodStart.getTime()
            const diffDays = diffMs / (1000 * 60 * 60 * 24)
            interval = diffDays > 60 ? 'year' : 'month'
        }

        console.log(`    Detected interval: ${interval}`)

        if (!dryRun) {
            await db
                .update(claws)
                .set({ billingInterval: interval })
                .where(eq(claws.id, claw.id))
            console.log('    UPDATED')
        } else {
            console.log('    WOULD UPDATE (dry run)')
        }

        updated++
        console.log()
    }

    console.log('Summary:')
    console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Failed: ${failed}`)

    if (dryRun && updated > 0) {
        console.log('\nRun with --apply to write changes.')
    }
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})