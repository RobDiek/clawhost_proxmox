import 'dotenv/config'

import { eq, and, isNotNull, or, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'

const run = async () => {
    const apply = process.argv.includes('--apply')

    if (apply) {
        console.log('LIVE RUN — changes will be written to the database.\n')
    } else {
        console.log('DRY RUN — no changes will be made.')
        console.log('Pass --apply to actually update the database.\n')
    }

    const affectedClaws = await db
        .select({
            id: claws.id,
            name: claws.name,
            polarSubscriptionId: claws.polarSubscriptionId,
            polarProductId: claws.polarProductId,
            polarCustomerId: claws.polarCustomerId
        })
        .from(claws)
        .where(
            and(
                isNotNull(claws.polarSubscriptionId),
                or(isNull(claws.polarProductId), isNull(claws.polarCustomerId))
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
        console.log(`    Current productId: ${claw.polarProductId || 'NULL'}`)
        console.log(`    Current customerId: ${claw.polarCustomerId || 'NULL'}`)

        let sub
        try {
            sub = await subscriptions.get(subId)
        } catch (error) {
            console.error('backfillPolarIds', error)
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

        const productChanged = !claw.polarProductId && sub.productId
        const customerChanged = !claw.polarCustomerId && sub.customerId

        if (!productChanged && !customerChanged) {
            console.log('    SKIPPED — nothing to update')
            skipped++
            console.log()
            continue
        }

        const newProductId = claw.polarProductId || sub.productId
        const newCustomerId = claw.polarCustomerId || sub.customerId

        console.log(`    Will set productId: ${newProductId}`)
        console.log(`    Will set customerId: ${newCustomerId}`)

        if (apply) {
            await db
                .update(claws)
                .set({
                    ...(productChanged ? { polarProductId: newProductId } : {}),
                    ...(customerChanged ? { polarCustomerId: newCustomerId } : {})
                })
                .where(eq(claws.id, claw.id))
            console.log('    UPDATED')
        } else {
            console.log('    WOULD UPDATE (dry run)')
        }

        updated++
        console.log()
    }

    console.log('Summary:')
    console.log(`  ${apply ? 'Updated' : 'Would update'}: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Failed: ${failed}`)

    if (!apply && updated > 0) {
        console.log('\nRun with --apply to write changes.')
    }

    process.exit(0)
}

run().catch((error) => {
    console.error('backfillPolarIds', error)
    process.exit(1)
})