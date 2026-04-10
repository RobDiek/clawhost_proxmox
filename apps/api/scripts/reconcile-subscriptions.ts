import 'dotenv/config'

import { eq, isNotNull } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { getProvider } from '@/services/provider'
import cleanupClaw from '@/controllers/claws/helpers/cleanupClaw'

interface Issue {
    clawId: string
    clawName: string
    type: string
    detail: string
    fix?: string
}

interface ClawRow {
    id: string
    name: string
    status: string
    providerServerId: string | null
    subdomain: string | null
    polarSubscriptionId: string | null
    polarProductId: string | null
    polarCustomerId: string | null
    subscriptionStatus: string | null
    deletionScheduledAt: Date | null
}

const DRY_RUN = !process.argv.includes('--fix')

const log = (msg: string) => process.stdout.write(`${msg}\n`)

const stopServer = async (claw: ClawRow) => {
    if (!claw.providerServerId) return
    try {
        const provider = getProvider()
        await provider.stopServer(claw.providerServerId)
        await db
            .update(claws)
            .set({ status: clawStatus.stopped })
            .where(eq(claws.id, claw.id))
        log(`    → Stopped server for ${claw.name}`)
    } catch (error) {
        console.error('stopServer', error)
        log(`    → Failed to stop server for ${claw.name}`)
    }
}

const startServer = async (claw: ClawRow) => {
    if (!claw.providerServerId) return
    try {
        const provider = getProvider()
        await provider.startServer(claw.providerServerId)
        await db
            .update(claws)
            .set({ status: clawStatus.running })
            .where(eq(claws.id, claw.id))
        log(`    → Started server for ${claw.name}`)
    } catch (error) {
        console.error('startServer', error)
        log(`    → Failed to start server for ${claw.name}`)
    }
}

const reconcile = async () => {
    log(
        `\n=== Polar ↔ DB Reconciliation (${DRY_RUN ? 'DRY RUN' : 'LIVE FIX'}) ===\n`
    )

    const allClaws = await db
        .select({
            id: claws.id,
            name: claws.name,
            status: claws.status,
            providerServerId: claws.providerServerId,
            subdomain: claws.subdomain,
            polarSubscriptionId: claws.polarSubscriptionId,
            polarProductId: claws.polarProductId,
            polarCustomerId: claws.polarCustomerId,
            subscriptionStatus: claws.subscriptionStatus,
            deletionScheduledAt: claws.deletionScheduledAt
        })
        .from(claws)
        .where(isNotNull(claws.polarSubscriptionId))

    log(`Found ${allClaws.length} claws with Polar subscriptions`)

    const subIds = allClaws
        .map((c) => c.polarSubscriptionId)
        .filter((id): id is string => id !== null)

    log(`Fetching ${subIds.length} subscriptions from Polar...\n`)

    const polarSubs = await subscriptions.getMany(subIds)

    log(`Retrieved ${polarSubs.size} subscriptions from Polar\n`)

    const issues: Issue[] = []

    for (const claw of allClaws) {
        if (!claw.polarSubscriptionId) continue

        const sub = polarSubs.get(claw.polarSubscriptionId)

        if (!sub) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'MISSING_IN_POLAR',
                detail: `Subscription ${claw.polarSubscriptionId} not found in Polar (DB status: ${claw.subscriptionStatus})`
            })
            continue
        }

        if (claw.subscriptionStatus !== sub.status) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'STATUS_MISMATCH',
                detail: `DB: ${claw.subscriptionStatus} → Polar: ${sub.status}`,
                fix: `Sync to '${sub.status}' with side effects`
            })
        }

        if (
            sub.status === 'canceled' &&
            sub.currentPeriodEnd &&
            !claw.deletionScheduledAt
        ) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'MISSING_DELETION_SCHEDULE',
                detail: `Subscription canceled, period ends ${sub.currentPeriodEnd.toISOString()} but no deletionScheduledAt set`,
                fix: `Set deletionScheduledAt to ${sub.currentPeriodEnd.toISOString()}`
            })
        }

        if (sub.status === 'active' && claw.deletionScheduledAt) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'STALE_DELETION_SCHEDULE',
                detail: `Subscription is active but deletionScheduledAt is ${claw.deletionScheduledAt.toISOString()}`,
                fix: 'Clear deletionScheduledAt'
            })
        }

        if (
            claw.polarProductId &&
            sub.productId &&
            claw.polarProductId !== sub.productId
        ) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'PRODUCT_MISMATCH',
                detail: `DB productId: ${claw.polarProductId} → Polar: ${sub.productId}`,
                fix: `Update DB polarProductId to '${sub.productId}'`
            })
        }

        if (
            claw.polarCustomerId &&
            sub.customerId &&
            claw.polarCustomerId !== sub.customerId
        ) {
            issues.push({
                clawId: claw.id,
                clawName: claw.name,
                type: 'CUSTOMER_MISMATCH',
                detail: `DB customerId: ${claw.polarCustomerId} → Polar: ${sub.customerId}`,
                fix: `Update DB polarCustomerId to '${sub.customerId}'`
            })
        }
    }

    const expiredPending = await db
        .select({
            id: pendingClaws.id,
            name: pendingClaws.name,
            checkoutId: pendingClaws.checkoutId,
            expiresAt: pendingClaws.expiresAt
        })
        .from(pendingClaws)
        .where(isNotNull(pendingClaws.expiresAt))

    const now = new Date()
    for (const pending of expiredPending) {
        if (pending.expiresAt < now) {
            issues.push({
                clawId: pending.id,
                clawName: pending.name,
                type: 'EXPIRED_PENDING',
                detail: `Pending claw expired at ${pending.expiresAt.toISOString()} (checkout: ${pending.checkoutId})`,
                fix: 'Delete expired pending claw'
            })
        }
    }

    if (issues.length === 0) {
        log('No issues found — everything is in sync!')
        return
    }

    log(`Found ${issues.length} issue(s):\n`)

    for (const issue of issues) {
        log(`[${issue.type}] ${issue.clawName} (${issue.clawId})`)
        log(`  ${issue.detail}`)
        if (issue.fix) log(`  Fix: ${issue.fix}`)
        log('')
    }

    if (!DRY_RUN) {
        log('Applying fixes...\n')

        for (const issue of issues) {
            try {
                const claw = allClaws.find((c) => c.id === issue.clawId)
                const sub = claw?.polarSubscriptionId
                    ? polarSubs.get(claw.polarSubscriptionId)
                    : undefined

                switch (issue.type) {
                    case 'STATUS_MISMATCH': {
                        if (!sub || !claw) break
                        await db
                            .update(claws)
                            .set({ subscriptionStatus: sub.status })
                            .where(eq(claws.id, issue.clawId))
                        log(
                            `  ✓ Set subscriptionStatus to '${sub.status}' for ${issue.clawName}`
                        )

                        if (
                            sub.status === 'active' &&
                            claw.status === clawStatus.stopped
                        ) {
                            await startServer(claw)
                        }

                        if (sub.status === 'revoked') {
                            if (claw.deletionScheduledAt) {
                                log(
                                    `    → Running cleanup for ${issue.clawName}`
                                )
                                await cleanupClaw(claw.id, {
                                    providerServerId: claw.providerServerId,
                                    subdomain: claw.subdomain
                                })
                                log(`    → Cleaned up ${issue.clawName}`)
                            } else if (claw.status === clawStatus.running) {
                                await stopServer(claw)
                            }
                        }

                        if (sub.status === 'canceled' && sub.currentPeriodEnd) {
                            await db
                                .update(claws)
                                .set({
                                    deletionScheduledAt: sub.currentPeriodEnd
                                })
                                .where(eq(claws.id, issue.clawId))
                            log(
                                `    → Set deletionScheduledAt for ${issue.clawName}`
                            )
                        }

                        if (
                            sub.status === 'active' &&
                            claw.deletionScheduledAt
                        ) {
                            await db
                                .update(claws)
                                .set({ deletionScheduledAt: null })
                                .where(eq(claws.id, issue.clawId))
                            log(
                                `    → Cleared deletionScheduledAt for ${issue.clawName}`
                            )
                        }

                        break
                    }
                    case 'MISSING_DELETION_SCHEDULE': {
                        if (!sub?.currentPeriodEnd) break
                        await db
                            .update(claws)
                            .set({ deletionScheduledAt: sub.currentPeriodEnd })
                            .where(eq(claws.id, issue.clawId))
                        log(`  ✓ Set deletionScheduledAt for ${issue.clawName}`)
                        break
                    }
                    case 'STALE_DELETION_SCHEDULE': {
                        await db
                            .update(claws)
                            .set({ deletionScheduledAt: null })
                            .where(eq(claws.id, issue.clawId))
                        log(
                            `  ✓ Cleared deletionScheduledAt for ${issue.clawName}`
                        )
                        break
                    }
                    case 'PRODUCT_MISMATCH': {
                        if (!sub) break
                        await db
                            .update(claws)
                            .set({ polarProductId: sub.productId })
                            .where(eq(claws.id, issue.clawId))
                        log(`  ✓ Fixed productId for ${issue.clawName}`)
                        break
                    }
                    case 'CUSTOMER_MISMATCH': {
                        if (!sub) break
                        await db
                            .update(claws)
                            .set({ polarCustomerId: sub.customerId })
                            .where(eq(claws.id, issue.clawId))
                        log(`  ✓ Fixed customerId for ${issue.clawName}`)
                        break
                    }
                    case 'EXPIRED_PENDING': {
                        await db
                            .delete(pendingClaws)
                            .where(eq(pendingClaws.id, issue.clawId))
                        log(
                            `  ✓ Deleted expired pending claw ${issue.clawName}`
                        )
                        break
                    }
                    default:
                        log(
                            `  ⚠ No auto-fix for ${issue.type} on ${issue.clawName}`
                        )
                }
            } catch (error) {
                console.error('reconcileIssue', error)
                log(`  ✗ Failed to fix ${issue.type} for ${issue.clawName}`)
            }
        }

        log('\nDone!')
    } else {
        log('Run with --fix to apply these changes.')
    }
}

reconcile().catch((error) => {
    console.error('reconcile', error)
    process.exit(1)
})