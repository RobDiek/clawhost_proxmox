import 'dotenv/config'

import type { PolarSubscriptionRaw, PolarItemsResult } from '@/ts/Interfaces'

import { eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import getPolarClient from '@/lib/polar/getPolarClient'
import getPolarConfig from '@/lib/polar/getPolarConfig'

const shouldFix = process.argv.includes('--fix')

const run = async () => {
    const polar = getPolarClient()
    const config = getPolarConfig()

    console.log('Fetching all active subscriptions from Polar...\n')

    const allSubs: PolarSubscriptionRaw[] = []
    let page = 1
    const limit = 100

    while (true) {
        const result = await polar.subscriptions.list({
            organizationId: config.organizationId,
            active: true,
            page,
            limit
        })

        const data =
            'result' in result
                ? result.result
                : (result as unknown as PolarItemsResult)

        const subs = (data.items || []) as PolarSubscriptionRaw[]
        allSubs.push(...subs)

        if (subs.length < limit) break
        page++
    }

    console.log(`Found ${allSubs.length} active subscription(s)\n`)

    if (allSubs.length === 0) return

    const pendingCancellation = allSubs.filter((s) => s.cancelAtPeriodEnd)

    console.log(
        `${pendingCancellation.length} subscription(s) are set to cancel at period end\n`
    )

    if (pendingCancellation.length === 0) {
        console.log(
            'No mismatches possible — no subscriptions pending cancellation.'
        )
        return
    }

    const dbClaws = await db
        .select({
            id: claws.id,
            name: claws.name,
            polarSubscriptionId: claws.polarSubscriptionId,
            subscriptionStatus: claws.subscriptionStatus,
            deletionScheduledAt: claws.deletionScheduledAt
        })
        .from(claws)
        .where(isNotNull(claws.polarSubscriptionId))

    const clawBySubId = new Map(
        dbClaws
            .filter((c) => c.polarSubscriptionId)
            .map((c) => [c.polarSubscriptionId, c])
    )

    let mismatches = 0
    let fixed = 0

    for (const sub of pendingCancellation) {
        const claw = clawBySubId.get(sub.id)

        if (!claw) continue

        const polarDate = sub.currentPeriodEnd
            ? new Date(sub.currentPeriodEnd)
            : null

        if (!polarDate) continue

        if (claw.deletionScheduledAt) continue

        console.log(`  [MISMATCH] Claw "${claw.name}" (${claw.id})`)
        console.log(`    Subscription: ${sub.id}`)
        console.log(`    canceledAt: ${sub.canceledAt || 'not set'}`)
        console.log(`    currentPeriodEnd: ${polarDate.toISOString()}`)
        console.log(`    Claw subscriptionStatus: ${claw.subscriptionStatus}`)
        console.log(`    Claw deletionScheduledAt: null`)

        if (shouldFix) {
            await db
                .update(claws)
                .set({
                    deletionScheduledAt: polarDate,
                    subscriptionStatus: 'canceled'
                })
                .where(eq(claws.id, claw.id))
            console.log(
                `    ✓ Fixed: deletionScheduledAt → ${polarDate.toISOString()}, subscriptionStatus → canceled`
            )
            fixed++
        }

        console.log()
        mismatches++
    }

    if (mismatches === 0) {
        console.log(
            'All subscriptions pending cancellation have matching claw deletion schedules.'
        )
    } else {
        console.log(`Found ${mismatches} mismatch(es) that need attention.`)
        if (shouldFix) {
            console.log(`Fixed ${fixed} claw(s).`)
        } else {
            console.log(
                'Run with --fix to update claws to match their subscriptions.'
            )
        }
    }
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})