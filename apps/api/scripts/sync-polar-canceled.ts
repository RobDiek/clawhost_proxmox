import { db } from '@/db'
import agents from '@/db/schema/agents'
import users from '@/db/schema/users'
import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { eq, inArray } from 'drizzle-orm'

import type { PolarSubscription } from '@/ts/Interfaces'

const DRY_RUN = !process.argv.includes('--apply')

const targetAgentIds = [
    '0e4205c6-53ad-4c7d-971c-0d28036e23a0',
    'ff5f9831-7289-49c9-a5c3-5bd13120de45',
    '1842c0d9-b13c-4f68-8762-047f1c5d0c8a',
    'ca58f003-8fa9-4178-9b53-fd8a7c8293d7',
    'edd5a74a-a279-4efd-a236-66ce806d7941',
    '92c735ba-4bc0-4663-8912-d1592749b3e8',
    '94811b43-1dd9-44a5-9e46-cf7ec6263ec2',
    '126a86d0-fe46-4a2a-bdfe-b625c58c3b9b',
    '3e69eb99-539e-4366-b7a1-983ac23e2dd0',
    'a9aca104-4131-4869-94ff-e01b000a63d3',
    '094f1b6c-e07c-493d-868e-f18368fd4f86',
    '66ec438d-f21c-4bcc-8841-47ca215388eb',
    'bd78a333-ba2b-405d-9563-95183b3c62c4',
    '198e8e27-03a8-4cb1-9161-de8ae997f071'
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
            status: agents.status
        })
        .from(agents)
        .where(inArray(agents.id, targetAgentIds))

    const userIds = [...new Set(targetAgents.map((a) => a.userId))]
    const allUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))

    const userMap = new Map(allUsers.map((u) => [u.id, u]))

    console.log(`Found ${targetAgents.length}/${targetAgentIds.length} agents\n`)

    const polar = getPolarClient()
    const now = new Date()

    for (const agent of targetAgents) {
        const user = userMap.get(agent.userId)
        console.log(`--- ${agent.name} (${agent.id}) ---`)
        console.log(`  User: ${user?.email ?? 'unknown'}`)
        console.log(`  DB status: ${agent.subscriptionStatus}`)
        console.log(`  DB deletionScheduledAt: ${agent.deletionScheduledAt?.toISOString() ?? 'null'}`)

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

        const updates: Record<string, unknown> = {}

        if (agent.subscriptionStatus !== polarSub.status) {
            updates.subscriptionStatus = polarSub.status
        }

        if (!agent.deletionScheduledAt && polarSub.currentPeriodEnd) {
            updates.deletionScheduledAt = polarSub.currentPeriodEnd
        }

        if (Object.keys(updates).length === 0) {
            console.log('  Already in sync\n')
            continue
        }

        const periodEnd = polarSub.currentPeriodEnd
        const overdue = periodEnd && periodEnd < now
        const daysOverdue = periodEnd ? Math.floor((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)) : 0

        console.log(`  Changes:`)
        if (updates.subscriptionStatus) {
            console.log(`    subscriptionStatus: "${agent.subscriptionStatus}" -> "${updates.subscriptionStatus}"`)
        }
        if (updates.deletionScheduledAt) {
            console.log(`    deletionScheduledAt: null -> "${(updates.deletionScheduledAt as Date).toISOString()}"`)
        }
        if (overdue) {
            console.log(`    ⚠ OVERDUE by ${daysOverdue} day(s) — cleanup should run after sync`)
        }

        if (DRY_RUN) {
            console.log(`  WOULD UPDATE`)
        } else {
            await db.update(agents).set(updates).where(eq(agents.id, agent.id))
            console.log('  UPDATED')
        }

        console.log('')
    }

    console.log(DRY_RUN ? '=== DRY RUN COMPLETE (no changes made) ===' : '=== SYNC COMPLETE ===')
    process.exit(0)
}

run()