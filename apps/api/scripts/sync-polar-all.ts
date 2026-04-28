import { db } from '@/db'
import agents from '@/db/schema/agents'
import users from '@/db/schema/users'
import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { eq, inArray } from 'drizzle-orm'

import type { PolarSubscription } from '@/ts/Interfaces'

const DRY_RUN = !process.argv.includes('--apply')

const dateMismatchIds = [
    '3f40cf2e-1ba2-4ec6-ac49-bb02b8c34e4f',
    '77e833d3-c07d-4035-af09-1bd0682ea05a',
    'd86862a9-1a96-4b42-b638-576a4228612d',
    '4cdc8674-9b34-4684-9ee2-a3d238023ff6',
    '06ddbaf0-93ec-4f3f-98fb-332bc4b6d1d9',
    '179224c4-c3ee-4634-a942-14876bc9acd1'
]

const missingInDbIds = [
    '1842c0d9-b13c-4f68-8762-047f1c5d0c8a',
    'edd5a74a-a279-4efd-a236-66ce806d7941',
    '92c735ba-4bc0-4663-8912-d1592749b3e8',
    '94811b43-1dd9-44a5-9e46-cf7ec6263ec2',
    '126a86d0-fe46-4a2a-bdfe-b625c58c3b9b',
    '094f1b6c-e07c-493d-868e-f18368fd4f86',
    'f9063bba-d6c0-44f8-a32d-0df44c5d6efe',
    '3fe230cc-e8da-48bc-9abf-adcfd14e8ad0',
    '0d0872fc-a8e6-4309-a9d5-a9b13ca4bba9',
    'ff5f9831-7289-49c9-a5c3-5bd13120de45',
    '0e4205c6-53ad-4c7d-971c-0d28036e23a0',
    '3e69eb99-539e-4366-b7a1-983ac23e2dd0',
    'a9aca104-4131-4869-94ff-e01b000a63d3',
    'bd78a333-ba2b-405d-9563-95183b3c62c4',
    '66ec438d-f21c-4bcc-8841-47ca215388eb',
    '198e8e27-03a8-4cb1-9161-de8ae997f071'
]

const allIds = [...new Set([...dateMismatchIds, ...missingInDbIds])]

const run = async () => {
    console.log(DRY_RUN ? '=== DRY RUN (pass --apply to execute) ===\n' : '=== APPLYING CHANGES ===\n')

    const targetAgents = await db
        .select({
            id: agents.id,
            name: agents.name,
            userId: agents.userId,
            polarSubscriptionId: agents.polarSubscriptionId,
            subscriptionStatus: agents.subscriptionStatus,
            deletionScheduledAt: agents.deletionScheduledAt,
            status: agents.status
        })
        .from(agents)
        .where(inArray(agents.id, allIds))

    const userIds = [...new Set(targetAgents.map((a) => a.userId))]
    const allUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))

    const userMap = new Map(allUsers.map((u) => [u.id, u]))
    const polar = getPolarClient()
    const now = new Date()

    let synced = 0
    let skipped = 0
    let errored = 0

    for (const agent of targetAgents) {
        const user = userMap.get(agent.userId)
        console.log(`--- ${agent.name} (${agent.id}) ---`)
        console.log(`  User: ${user?.email ?? 'unknown'}`)

        let polarSub: PolarSubscription | null = null
        try {
            const raw = await polar.subscriptions.get({ id: agent.polarSubscriptionId! })
            polarSub = mapSubscription(raw as never)
        } catch (error) {
            console.log(`  ERROR: Could not fetch subscription: ${error}\n`)
            errored++
            continue
        }

        if (!polarSub) {
            console.log('  ERROR: Subscription not found in Polar\n')
            errored++
            continue
        }

        const updates: Record<string, unknown> = {}
        const changes: string[] = []

        const expectedStatus = polarSub.cancelAtPeriodEnd ? 'canceled' : polarSub.status
        if (agent.subscriptionStatus !== expectedStatus) {
            updates.subscriptionStatus = expectedStatus
            changes.push(`subscriptionStatus: "${agent.subscriptionStatus}" -> "${expectedStatus}"`)
        }

        const expectedDate = polarSub.cancelAtPeriodEnd && polarSub.currentPeriodEnd
            ? polarSub.currentPeriodEnd
            : null

        if (expectedDate) {
            const dbDate = agent.deletionScheduledAt
            if (!dbDate) {
                updates.deletionScheduledAt = expectedDate
                changes.push(`deletionScheduledAt: null -> "${expectedDate.toISOString()}"`)
            } else {
                const diffMs = Math.abs(dbDate.getTime() - expectedDate.getTime())
                if (diffMs > 300000) {
                    updates.deletionScheduledAt = expectedDate
                    changes.push(`deletionScheduledAt: "${dbDate.toISOString()}" -> "${expectedDate.toISOString()}" (was ${Math.round(diffMs / 60000)}min off)`)
                }
            }
        }

        if (changes.length === 0) {
            console.log('  Already in sync\n')
            skipped++
            continue
        }

        for (const change of changes) console.log(`  ${change}`)

        if (expectedDate && expectedDate < now) {
            const daysOverdue = Math.floor((now.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24))
            console.log(`  * OVERDUE by ${daysOverdue} day(s)`)
        }

        if (DRY_RUN) {
            console.log('  -> WOULD UPDATE\n')
        } else {
            await db.update(agents).set(updates).where(eq(agents.id, agent.id))
            console.log('  -> UPDATED\n')
        }
        synced++
    }

    console.log('=== SUMMARY ===\n')
    console.log(`Synced: ${synced}`)
    console.log(`Already in sync: ${skipped}`)
    console.log(`Errors: ${errored}`)
    console.log(DRY_RUN ? '\n=== DRY RUN COMPLETE (no changes made) ===' : '\n=== SYNC COMPLETE ===')
    process.exit(0)
}

run()