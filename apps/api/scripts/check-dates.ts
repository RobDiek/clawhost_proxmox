import { db } from '@/db'
import agents from '@/db/schema/agents'
import users from '@/db/schema/users'
import getPolarClient from '@/lib/polar/getPolarClient'
import mapSubscription from '@/lib/polar/subscriptions/mapSubscription'
import { isNotNull, eq, inArray } from 'drizzle-orm'

import type { PolarSubscription } from '@/ts/Interfaces'

const run = async () => {
    console.log('=== Checking all deletionScheduledAt vs Polar currentPeriodEnd ===\n')

    const allAgents = await db
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
        .where(isNotNull(agents.polarSubscriptionId))

    const userIds = [...new Set(allAgents.map((a) => a.userId))]
    const allUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))

    const userMap = new Map(allUsers.map((u) => [u.id, u]))
    const polar = getPolarClient()

    let checked = 0
    let inSync = 0
    let mismatched = 0
    let missingInDb = 0
    let missingInPolar = 0
    let errors = 0

    for (const agent of allAgents) {
        checked++
        if (checked % 10 === 0) console.log(`  Checked ${checked}/${allAgents.length}...`)

        const user = userMap.get(agent.userId)

        let polarSub: PolarSubscription | null = null
        try {
            const raw = await polar.subscriptions.get({ id: agent.polarSubscriptionId! })
            polarSub = mapSubscription(raw as never)
        } catch {
            errors++
            continue
        }

        if (!polarSub) {
            errors++
            continue
        }

        const dbDate = agent.deletionScheduledAt
        const polarDate = polarSub.cancelAtPeriodEnd ? polarSub.currentPeriodEnd : null

        if (!dbDate && !polarDate) {
            inSync++
            continue
        }

        if (!dbDate && polarDate) {
            missingInDb++
            console.log(`\n[MISSING IN DB] ${agent.name} (${agent.id})`)
            console.log(`  User: ${user?.email ?? 'unknown'}`)
            console.log(`  DB subscriptionStatus: ${agent.subscriptionStatus}`)
            console.log(`  DB deletionScheduledAt: null`)
            console.log(`  Polar status: ${polarSub.status}`)
            console.log(`  Polar cancelAtPeriodEnd: ${polarSub.cancelAtPeriodEnd}`)
            console.log(`  Polar currentPeriodEnd: ${polarDate.toISOString()}`)
            continue
        }

        if (dbDate && !polarDate) {
            missingInPolar++
            console.log(`\n[DB HAS DATE, POLAR DOES NOT] ${agent.name} (${agent.id})`)
            console.log(`  User: ${user?.email ?? 'unknown'}`)
            console.log(`  DB subscriptionStatus: ${agent.subscriptionStatus}`)
            console.log(`  DB deletionScheduledAt: ${dbDate.toISOString()}`)
            console.log(`  Polar status: ${polarSub.status}`)
            console.log(`  Polar cancelAtPeriodEnd: ${polarSub.cancelAtPeriodEnd}`)
            continue
        }

        if (dbDate && polarDate) {
            const diffMs = Math.abs(dbDate.getTime() - polarDate.getTime())
            const diffMin = Math.round(diffMs / 60000)

            if (diffMin <= 5) {
                inSync++
            } else {
                mismatched++
                console.log(`\n[DATE MISMATCH] ${agent.name} (${agent.id})`)
                console.log(`  User: ${user?.email ?? 'unknown'}`)
                console.log(`  DB deletionScheduledAt:  ${dbDate.toISOString()}`)
                console.log(`  Polar currentPeriodEnd:  ${polarDate.toISOString()}`)
                console.log(`  Difference: ${diffMin} minutes`)
            }
        }
    }

    console.log('\n=== SUMMARY ===\n')
    console.log(`Total checked: ${checked}`)
    console.log(`In sync (or within 5 min): ${inSync}`)
    console.log(`Missing in DB: ${missingInDb}`)
    console.log(`DB has date, Polar doesn't: ${missingInPolar}`)
    console.log(`Date mismatch: ${mismatched}`)
    console.log(`Errors: ${errors}`)
    process.exit(0)
}

run()