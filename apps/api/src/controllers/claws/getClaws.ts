import type { AuthenticatedContext } from '@/ts/Types'
import type { BillingPeriod } from '@/ts/Interfaces'

import { eq, desc, gt, and } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws, volumes, pendingClaws } from '@/db/schema'
import { sanitizeClaw, syncClawServers } from '@/controllers/claws/helpers'
import { subscriptions, checkouts } from '@/lib/polar'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getClaws = withErrorHandler('getClaws')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')

    const [userClaws, userVolumes, userPendingClaws] = await Promise.all([
        db
            .select()
            .from(claws)
            .where(eq(claws.userId, userId))
            .orderBy(desc(claws.createdAt)),
        db.select().from(volumes).where(eq(volumes.userId, userId)),
        db
            .select()
            .from(pendingClaws)
            .where(
                and(
                    eq(pendingClaws.userId, userId),
                    gt(pendingClaws.expiresAt, new Date())
                )
            )
    ])

    const syncedClaws = await syncClawServers(userClaws)

    const subIds = syncedClaws
        .filter((c) => c.polarSubscriptionId)
        .map((c) => c.polarSubscriptionId!)

    const subResults = await subscriptions.getMany(subIds)

    const subMap = new Map<string, BillingPeriod>()
    for (const [id, sub] of subResults) {
        subMap.set(id, {
            start: sub.currentPeriodStart?.toISOString(),
            end: sub.currentPeriodEnd?.toISOString()
        })
    }

    const volumeMap = new Map<string, typeof userVolumes>()
    for (const v of userVolumes) {
        if (!v.clawId) continue
        const arr = volumeMap.get(v.clawId) || []
        arr.push(v)
        volumeMap.set(v.clawId, arr)
    }

    const clawsWithVolumes = syncedClaws.map((claw) => {
        const billing = claw.polarSubscriptionId
            ? subMap.get(claw.polarSubscriptionId)
            : undefined
        return {
            ...claw,
            volumes: volumeMap.get(claw.id) || [],
            currentPeriodStart: billing?.start || null,
            currentPeriodEnd: billing?.end || null
        }
    })

    const validPending = await Promise.all(
        userPendingClaws.map(async (p) => {
            try {
                const checkout = await checkouts.get(p.checkoutId)
                if (checkout?.status === 'expired') {
                    await db
                        .delete(pendingClaws)
                        .where(eq(pendingClaws.id, p.id))
                    return null
                }
                const paid =
                    checkout?.status === 'succeeded' ||
                    checkout?.status === 'confirmed'
                return {
                    pending: p,
                    paid,
                    checkoutUrl: checkout?.url || null
                }
            } catch {
                return { pending: p, paid: false, checkoutUrl: null }
            }
        })
    )

    const pendingAsClaw = validPending
        .filter((v) => v !== null)
        .map(({ pending: p, paid, checkoutUrl }) => ({
            id: `pending-${p.id}`,
            name: p.name,
            status: paid ? clawStatus.creating : clawStatus.awaitingPayment,
            ip: null,
            planId: p.planId,
            location: p.location,
            sshKeyId: p.sshKeyId,
            providerServerId: null,
            subdomain: null,
            gatewayToken: null,
            subscriptionStatus: null,
            billingInterval: p.billingInterval || null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            volumes: [],
            deletionScheduledAt: null,
            checkoutUrl: paid ? null : checkoutUrl,
            createdAt: p.createdAt.toISOString()
        }))

    return ok(
        c,
        [...pendingAsClaw, ...clawsWithVolumes.map(sanitizeClaw)],
        t('api.clawsFetched')
    )
})

export default getClaws