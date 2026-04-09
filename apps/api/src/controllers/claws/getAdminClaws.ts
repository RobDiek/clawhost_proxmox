import type { AuthenticatedContext } from '@/ts/Types'
import type { BillingPeriod } from '@/ts/Interfaces'

import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users, volumes } from '@/db/schema'
import { sanitizeClaw, syncClawServers } from '@/controllers/claws/helpers'
import { subscriptions } from '@/lib/polar'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const getAdminClaws = withErrorHandler('getAdminClaws')(async (
    c: AuthenticatedContext
) => {
    const [allClaws, allVolumes, allUsers] = await Promise.all([
        db.select().from(claws).orderBy(desc(claws.createdAt)),
        db.select().from(volumes),
        db.select({ id: users.id, email: users.email }).from(users)
    ])

    const userMap = new Map(allUsers.map((u) => [u.id, u.email]))

    const syncedClaws = await syncClawServers(allClaws)

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

    const volumeMap = new Map<string, typeof allVolumes>()
    for (const v of allVolumes) {
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
            ownerEmail: userMap.get(claw.userId) || null,
            volumes: volumeMap.get(claw.id) || [],
            currentPeriodStart: billing?.start || null,
            currentPeriodEnd: billing?.end || null
        }
    })

    return ok(c, clawsWithVolumes.map(sanitizeClaw), t('api.clawsFetched'))
})

export default getAdminClaws