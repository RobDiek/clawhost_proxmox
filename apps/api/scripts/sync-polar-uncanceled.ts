import { db } from '@/db'
import agents from '@/db/schema/agents'
import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { eq, inArray } from 'drizzle-orm'

import type { PolarSubscription } from '@/ts/Interfaces'

const DRY_RUN = !process.argv.includes('--apply')

const targetAgentIds = [
    '3f40cf2e-1ba2-4ec6-ac49-bb02b8c34e4f',
    '77e833d3-c07d-4035-af09-1bd0682ea05a',
    'd86862a9-1a96-4b42-b638-576a4228612d',
    '4cdc8674-9b34-4684-9ee2-a3d238023ff6',
    '06ddbaf0-93ec-4f3f-98fb-332bc4b6d1d9',
    '179224c4-c3ee-4634-a942-14876bc9acd1'
]

const run = async () => {
    console.log(DRY_RUN ? '=== DRY RUN (pass --apply to execute) ===\n' : '=== APPLYING CHANGES ===\n')

    const targetAgents = await db
        .select({
            id: agents.id,
            name: agents.name,
            userId: agents.userId,
            polarSubscriptionId: agents.polarSubscriptionId,
            polarProductId: agents.polarProductId,
            polarCustomerId: agents.polarCustomerId,
            subscriptionStatus: agents.subscriptionStatus,
            deletionScheduledAt: agents.deletionScheduledAt,
            billingInterval: agents.billingInterval,
            status: agents.status
        })
        .from(agents)
        .where(inArray(agents.id, targetAgentIds))

    console.log(`Found ${targetAgents.length}/${targetAgentIds.length} agents\n`)

    const polar = getPolarClient()

    for (const agent of targetAgents) {
        console.log(`--- ${agent.name} (${agent.id}) ---`)

        let polarSub: PolarSubscription | null = null
        try {
            const raw = await polar.subscriptions.get({ id: agent.polarSubscriptionId! })
            polarSub = mapSubscription(raw as never)
        } catch (error) {
            console.log(`  ERROR: Could not fetch subscription: ${error}`)
            continue
        }

        if (!polarSub) {
            console.log('  ERROR: Subscription not found in Polar')
            continue
        }

        console.log(`  Polar status: ${polarSub.status}`)
        console.log(`  Polar cancelAtPeriodEnd: ${polarSub.cancelAtPeriodEnd}`)
        console.log(`  Polar currentPeriodEnd: ${polarSub.currentPeriodEnd?.toISOString() ?? 'null'}`)
        console.log(`  Polar productId: ${polarSub.productId}`)
        console.log(`  Polar customerId: ${polarSub.customerId}`)

        if (polarSub.status !== 'active') {
            console.log(`  SKIP: Polar status is "${polarSub.status}", not "active" — manual review needed`)
            continue
        }

        const updates: Record<string, unknown> = {}

        if (agent.subscriptionStatus !== 'active') {
            updates.subscriptionStatus = 'active'
            console.log(`  subscriptionStatus: "${agent.subscriptionStatus}" -> "active"`)
        }

        if (agent.deletionScheduledAt) {
            updates.deletionScheduledAt = null
            console.log(`  deletionScheduledAt: "${agent.deletionScheduledAt.toISOString()}" -> null`)
        }

        if (agent.polarProductId !== polarSub.productId) {
            updates.polarProductId = polarSub.productId
            console.log(`  polarProductId: "${agent.polarProductId}" -> "${polarSub.productId}"`)
        }

        if (agent.polarCustomerId !== polarSub.customerId) {
            updates.polarCustomerId = polarSub.customerId
            console.log(`  polarCustomerId: "${agent.polarCustomerId}" -> "${polarSub.customerId}"`)
        }

        if (polarSub.cancelAtPeriodEnd && polarSub.currentPeriodEnd) {
            updates.subscriptionStatus = 'canceled'
            updates.deletionScheduledAt = polarSub.currentPeriodEnd
            console.log(`  NOTE: cancelAtPeriodEnd is true — setting canceled + deletionScheduledAt=${polarSub.currentPeriodEnd.toISOString()}`)
        }

        if (Object.keys(updates).length === 0) {
            console.log('  Already in sync')
            continue
        }

        if (DRY_RUN) {
            console.log(`  WOULD UPDATE: ${JSON.stringify(updates)}`)
        } else {
            await db.update(agents).set(updates).where(eq(agents.id, agent.id))
            console.log('  UPDATED')
        }

        console.log('')
    }

    console.log(DRY_RUN ? '\n=== DRY RUN COMPLETE (no changes made) ===' : '\n=== SYNC COMPLETE ===')
    process.exit(0)
}

run()