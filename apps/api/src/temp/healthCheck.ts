import 'dotenv/config'
import { db } from '@/db'
import { claws, pendingClaws, users } from '@/db/schema'
import { eq, isNotNull, isNull } from 'drizzle-orm'
import { subscriptions } from '@/lib/polar'
import { getProvider } from '@/services/provider'

const run = async () => {
    const provider = getProvider()
    const allClaws = await db.select().from(claws)
    const allPending = await db.select().from(pendingClaws)

    console.log(`\n=== CLAWHOST HEALTH CHECK ===`)
    console.log(`Total claws in DB: ${allClaws.length}`)
    console.log(`Total pending claws: ${allPending.length}`)

    const paidClaws = allClaws.filter((c) => c.polarSubscriptionId)
    const freeClaws = allClaws.filter((c) => !c.polarSubscriptionId)
    console.log(`Paid claws: ${paidClaws.length}`)
    console.log(`Free claws: ${freeClaws.length}`)

    console.log(`\n--- 1. CHECKING POLAR SUBSCRIPTION STATUS ---`)
    let polarIssues = 0
    for (const claw of paidClaws) {
        const sub = await subscriptions.get(claw.polarSubscriptionId!)
        if (!sub) {
            console.log(
                `[MISSING IN POLAR] Claw ${claw.id} (${claw.name}) - subscriptionId ${claw.polarSubscriptionId} not found in Polar`
            )
            polarIssues++
            continue
        }
        if (sub.status !== claw.subscriptionStatus) {
            console.log(
                `[STATUS MISMATCH] Claw ${claw.id} (${claw.name}) - DB: ${claw.subscriptionStatus}, Polar: ${sub.status}`
            )
            polarIssues++
        }
        if (sub.status === 'revoked' || sub.status === 'canceled') {
            const endedAt = sub.endedAt || sub.canceledAt
            console.log(
                `[CANCELED/REVOKED] Claw ${claw.id} (${claw.name}) - Polar status: ${sub.status}, ended: ${endedAt}`
            )
            polarIssues++
        }
    }
    if (polarIssues === 0)
        console.log('All paid claws have valid Polar subscriptions.')

    console.log(`\n--- 2. CHECKING HETZNER SERVER STATUS ---`)
    const hetznerServers = await provider.getServers()
    let hetznerIssues = 0

    const clawsWithServerId = allClaws.filter((c) => c.providerServerId)
    for (const claw of clawsWithServerId) {
        const serverStatus = hetznerServers.get(claw.providerServerId!)
        if (!serverStatus) {
            console.log(
                `[MISSING IN HETZNER] Claw ${claw.id} (${claw.name}) - serverId ${claw.providerServerId} not found in Hetzner`
            )
            hetznerIssues++
        }
    }

    const dbServerIds = new Set(
        clawsWithServerId.map((c) => c.providerServerId!)
    )
    for (const [serverId] of hetznerServers) {
        if (!dbServerIds.has(serverId)) {
            console.log(
                `[ORPHAN IN HETZNER] Server ${serverId} exists in Hetzner but has no matching claw in DB`
            )
            hetznerIssues++
        }
    }

    const clawsWithoutServer = allClaws.filter(
        (c) => !c.providerServerId && c.status !== 'creating'
    )
    for (const claw of clawsWithoutServer) {
        console.log(
            `[NO SERVER] Claw ${claw.id} (${claw.name}) - status: ${claw.status}, no providerServerId`
        )
        hetznerIssues++
    }
    if (hetznerIssues === 0)
        console.log('All claws have matching Hetzner servers.')

    console.log(`\n--- 3. CHECKING USER REFERENCES ---`)
    let userIssues = 0
    const userIds = [...new Set(allClaws.map((c) => c.userId))]
    for (const userId of userIds) {
        const user = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
        if (!user[0]) {
            const orphanClaws = allClaws.filter((c) => c.userId === userId)
            console.log(
                `[ORPHAN USER] userId ${userId} has ${orphanClaws.length} claw(s) but no user record`
            )
            userIssues++
        }
    }
    if (userIssues === 0) console.log('All claws reference valid users.')

    console.log(`\n--- 4. CHECKING CLAWS WITH ISSUES ---`)
    let clawIssues = 0

    const stuckCreating = allClaws.filter((c) => {
        if (c.status !== 'creating') return false
        const age = Date.now() - new Date(c.createdAt).getTime()
        return age > 30 * 60 * 1000
    })
    for (const claw of stuckCreating) {
        const ageMin = Math.round(
            (Date.now() - new Date(claw.createdAt).getTime()) / 60000
        )
        console.log(
            `[STUCK CREATING] Claw ${claw.id} (${claw.name}) - stuck in 'creating' for ${ageMin} minutes`
        )
        clawIssues++
    }

    const noIp = allClaws.filter((c) => !c.ip && c.status !== 'creating')
    for (const claw of noIp) {
        console.log(
            `[NO IP] Claw ${claw.id} (${claw.name}) - status: ${claw.status}, no IP address`
        )
        clawIssues++
    }

    const noSubdomain = allClaws.filter((c) => !c.subdomain)
    for (const claw of noSubdomain) {
        console.log(
            `[NO SUBDOMAIN] Claw ${claw.id} (${claw.name}) - missing subdomain`
        )
        clawIssues++
    }
    if (clawIssues === 0) console.log('No claw integrity issues found.')

    console.log(`\n--- 5. CHECKING EXPIRED PENDING CLAWS ---`)
    const now = new Date()
    const expired = allPending.filter(
        (p) => p.expiresAt && new Date(p.expiresAt) < now
    )
    if (expired.length > 0) {
        for (const p of expired) {
            const ageHours = Math.round(
                (now.getTime() - new Date(p.expiresAt!).getTime()) / 3600000
            )
            console.log(
                `[EXPIRED PENDING] id: ${p.id}, user: ${p.userId}, plan: ${p.planId}, expired ${ageHours}h ago`
            )
        }
    } else {
        console.log('No expired pending claws.')
    }

    const activePending = allPending.filter(
        (p) => !p.expiresAt || new Date(p.expiresAt) >= now
    )
    if (activePending.length > 0) {
        console.log(`Active pending claws: ${activePending.length}`)
    }

    console.log(`\n--- 6. CHECKING DB STATUS vs HETZNER STATUS ---`)
    let statusMismatches = 0
    for (const claw of clawsWithServerId) {
        const serverStatus = hetznerServers.get(claw.providerServerId!)
        if (!serverStatus) continue

        const hetznerState = serverStatus.status
        const dbStatus = claw.status

        if (dbStatus === 'running' && hetznerState !== 'running') {
            console.log(
                `[STATUS DRIFT] Claw ${claw.id} (${claw.name}) - DB: ${dbStatus}, Hetzner: ${hetznerState}`
            )
            statusMismatches++
        }
        if (dbStatus === 'stopped' && hetznerState !== 'off') {
            console.log(
                `[STATUS DRIFT] Claw ${claw.id} (${claw.name}) - DB: ${dbStatus}, Hetzner: ${hetznerState}`
            )
            statusMismatches++
        }
    }
    if (statusMismatches === 0) console.log('All claw statuses match Hetzner.')

    const totalIssues =
        polarIssues +
        hetznerIssues +
        userIssues +
        clawIssues +
        expired.length +
        statusMismatches
    console.log(`\n=== SUMMARY: ${totalIssues} issue(s) found ===\n`)

    process.exit(0)
}

run()