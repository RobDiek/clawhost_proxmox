import 'dotenv/config'

import type { PolarSubscriptionRaw, PolarItemsResult } from '@/ts/Interfaces'

import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import getPolarClient from '@/lib/polar/getPolarClient'
import getPolarConfig from '@/lib/polar/getPolarConfig'

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

    const subIds = allSubs.map((s) => s.id)
    const existingClaws = await db
        .select({
            polarSubscriptionId: claws.polarSubscriptionId
        })
        .from(claws)
        .where(inArray(claws.polarSubscriptionId, subIds))

    const clawSubIds = new Set(existingClaws.map((c) => c.polarSubscriptionId))

    const orphans = allSubs.filter((s) => !clawSubIds.has(s.id))

    if (orphans.length === 0) {
        console.log('All active subscriptions have a matching claw.')
        return
    }

    console.log(`Found ${orphans.length} subscription(s) WITHOUT a claw:\n`)

    for (const sub of orphans) {
        const meta = sub.metadata as Record<string, string> | undefined
        console.log(`  Subscription: ${sub.id}`)
        console.log(`    Status: ${sub.status}`)
        console.log(`    Customer: ${sub.customerId}`)
        console.log(`    Product: ${sub.productId}`)
        console.log(`    User: ${meta?.userId || 'unknown'}`)
        console.log(`    Plan: ${meta?.planId || 'unknown'}`)
        console.log(`    Location: ${meta?.location || 'unknown'}`)
        console.log(`    Name: ${meta?.name || 'unknown'}`)
        console.log()
    }

    console.log('To reconcile, run:')
    console.log(
        '  tsx scripts/reconcile-subscription.ts <subscription-id> [--provider hetzner]'
    )
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})