import { db } from '@/db'
import agents from '@/db/schema/agents'
import users from '@/db/schema/users'
import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { isNotNull } from 'drizzle-orm'

import type { PolarSubscription } from '@/ts/Interfaces'

interface Discrepancy {
    agentId: string
    agentName: string
    userId: string
    userEmail: string
    polarSubscriptionId: string
    field: string
    dbValue: string | null
    polarValue: string | null
    action: string
}

const run = async () => {
    console.log('=== Polar Sync Dry Run ===\n')

    const allAgents = await db
        .select({
            id: agents.id,
            name: agents.name,
            userId: agents.userId,
            planId: agents.planId,
            billingInterval: agents.billingInterval,
            polarSubscriptionId: agents.polarSubscriptionId,
            polarProductId: agents.polarProductId,
            polarCustomerId: agents.polarCustomerId,
            subscriptionStatus: agents.subscriptionStatus,
            deletionScheduledAt: agents.deletionScheduledAt,
            status: agents.status,
            createdAt: agents.createdAt
        })
        .from(agents)
        .where(isNotNull(agents.polarSubscriptionId))

    const allUsers = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(isNotNull(users.id))

    const userMap = new Map(allUsers.map((u) => [u.id, u]))

    console.log(`Found ${allAgents.length} agents with Polar subscriptions`)
    console.log(`Fetching subscription data from Polar...\n`)

    const discrepancies: Discrepancy[] = []
    const errors: { agentId: string; agentName: string; error: string }[] = []
    let checked = 0

    for (const agent of allAgents) {
        checked++
        if (checked % 10 === 0) {
            console.log(`  Checked ${checked}/${allAgents.length}...`)
        }

        const user = userMap.get(agent.userId)
        const userEmail = user?.email ?? 'unknown'

        let polarSub: PolarSubscription | null = null
        try {
            const polar = getPolarClient()
            const raw = await polar.subscriptions.get({ id: agent.polarSubscriptionId! })
            polarSub = mapSubscription(raw as never)
        } catch (error) {
            errors.push({
                agentId: agent.id,
                agentName: agent.name,
                error: `Failed to fetch subscription ${agent.polarSubscriptionId}: ${error}`
            })
            continue
        }

        if (!polarSub) {
            errors.push({
                agentId: agent.id,
                agentName: agent.name,
                error: `Subscription ${agent.polarSubscriptionId} not found in Polar`
            })
            continue
        }

        if (agent.subscriptionStatus !== polarSub.status) {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'subscriptionStatus',
                dbValue: agent.subscriptionStatus,
                polarValue: polarSub.status,
                action: getStatusAction(agent.subscriptionStatus, polarSub.status)
            })
        }

        if (polarSub.status === 'canceled' && polarSub.cancelAtPeriodEnd && !agent.deletionScheduledAt && polarSub.currentPeriodEnd) {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'deletionScheduledAt',
                dbValue: null,
                polarValue: polarSub.currentPeriodEnd.toISOString(),
                action: 'SET deletionScheduledAt to subscription period end'
            })
        }

        if (agent.subscriptionStatus === 'canceled' && agent.deletionScheduledAt && polarSub.status === 'active' && !polarSub.cancelAtPeriodEnd) {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'deletionScheduledAt',
                dbValue: agent.deletionScheduledAt.toISOString(),
                polarValue: null,
                action: 'CLEAR deletionScheduledAt (subscription was uncanceled)'
            })
        }

        if (polarSub.status === 'revoked' && agent.status !== 'revoked') {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'status (revoked)',
                dbValue: agent.status,
                polarValue: 'revoked',
                action: 'Agent should be revoked/cleaned up'
            })
        }

        if (agent.polarProductId !== polarSub.productId) {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'polarProductId',
                dbValue: agent.polarProductId,
                polarValue: polarSub.productId,
                action: 'UPDATE polarProductId to match Polar'
            })
        }

        if (agent.polarCustomerId !== polarSub.customerId) {
            discrepancies.push({
                agentId: agent.id,
                agentName: agent.name,
                userId: agent.userId,
                userEmail,
                polarSubscriptionId: agent.polarSubscriptionId!,
                field: 'polarCustomerId',
                dbValue: agent.polarCustomerId,
                polarValue: polarSub.customerId,
                action: 'UPDATE polarCustomerId to match Polar'
            })
        }
    }

    console.log('\n=== RESULTS ===\n')
    console.log(`Total agents checked: ${checked}`)
    console.log(`Discrepancies found: ${discrepancies.length}`)
    console.log(`Errors: ${errors.length}`)

    if (errors.length > 0) {
        console.log('\n--- ERRORS ---\n')
        for (const err of errors) {
            console.log(`  Agent: "${err.agentName}" (${err.agentId})`)
            console.log(`    ${err.error}\n`)
        }
    }

    if (discrepancies.length > 0) {
        console.log('\n--- DISCREPANCIES ---\n')

        const grouped = new Map<string, Discrepancy[]>()
        for (const d of discrepancies) {
            const key = `${d.agentId}`
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)!.push(d)
        }

        for (const [agentId, items] of grouped) {
            const first = items[0]
            console.log(`Agent: "${first.agentName}" (${agentId})`)
            console.log(`  User: ${first.userEmail} (${first.userId})`)
            console.log(`  Subscription: ${first.polarSubscriptionId}`)
            for (const d of items) {
                console.log(`  [${d.field}]`)
                console.log(`    DB:    ${d.dbValue ?? '(null)'}`)
                console.log(`    Polar: ${d.polarValue ?? '(null)'}`)
                console.log(`    Action: ${d.action}`)
            }
            console.log('')
        }

        console.log('\n--- SUMMARY BY ACTION TYPE ---\n')
        const actionCounts = new Map<string, number>()
        for (const d of discrepancies) {
            const key = d.field
            actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1)
        }
        for (const [field, count] of actionCounts) {
            console.log(`  ${field}: ${count} mismatch(es)`)
        }
    }

    if (discrepancies.length === 0 && errors.length === 0) {
        console.log('\nAll agents are in sync with Polar!')
    }

    console.log('\n=== DRY RUN COMPLETE (no changes made) ===')
    process.exit(0)
}

const getStatusAction = (
    dbStatus: string | null,
    polarStatus: string
): string => {
    if (polarStatus === 'canceled' && dbStatus === 'active') {
        return 'UPDATE status to canceled (missed subscription.canceled webhook)'
    }
    if (polarStatus === 'active' && dbStatus === 'canceled') {
        return 'UPDATE status to active (missed subscription.uncanceled webhook)'
    }
    if (polarStatus === 'revoked') {
        return 'UPDATE status to revoked (missed subscription.revoked webhook)'
    }
    return `UPDATE subscriptionStatus from "${dbStatus}" to "${polarStatus}"`
}

run()