import type { InitiateClawPurchaseBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { eq, and, count, lt } from 'drizzle-orm'
import { inputValidation, billingInterval } from '@openclaw/shared'
import { db } from '@/db'
import { users, sshKeys, claws, pendingClaws } from '@/db/schema'
import { checkouts, customers } from '@/lib/polar'
import {
    generatePassword,
    generateClawName,
    getPolarProductId
} from '@/controllers/agents/helpers'
import { getProvider } from '@/services/provider'
import { encrypt } from '@/lib/encryption'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import { getEnvironment } from '@/lib/environment'
import withErrorHandler from '@/lib/withErrorHandler'

let lastPendingCleanup = 0
const CLEANUP_INTERVAL = 60 * 60 * 1000

const initiateClawPurchase = withErrorHandler(
    'initiateClawPurchase',
    'api.failedToInitiatePurchase'
)(async (c: AuthenticatedContext) => {
    if (Date.now() - lastPendingCleanup > CLEANUP_INTERVAL) {
        await db
            .delete(pendingClaws)
            .where(lt(pendingClaws.expiresAt, new Date()))
        lastPendingCleanup = Date.now()
    }

    const userId = c.get('userId')
    const {
        name: rawName,
        planId,
        location,
        password,
        gatewayToken,
        sshKeyId,
        volumeSize,
        priceMonthly,
        billingInterval: rawBillingInterval
    } = await c.req.json<InitiateClawPurchaseBody>()

    const billingCycle =
        rawBillingInterval === billingInterval.YEAR
            ? billingInterval.YEAR
            : billingInterval.MONTH

    if (!planId || !location || !priceMonthly)
        return fail(c, t('api.missingRequiredFields'), 400)

    const provider = getProvider()
    const [serverTypes, locations] = await Promise.all([
        provider.getServerTypes(),
        provider.getLocations()
    ])

    const selectedPlan = serverTypes.find((st) => st.name === planId)

    if (!selectedPlan) return fail(c, t('api.invalidPlan'), 400)

    if (selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN)
        return fail(c, t('api.planBelowMinimumMemory'), 400)

    const selectedLocation = locations.find((l) => l.id === location)
    if (!selectedLocation || selectedLocation.disabled)
        return fail(c, t('api.invalidLocation'), 400)

    if (provider.getRawServerTypes && provider.getDatacenters) {
        const [rawTypes, datacenters] = await Promise.all([
            provider.getRawServerTypes(),
            provider.getDatacenters()
        ])
        const serverTypeId = rawTypes.find((st) => st.name === planId)?.id
        if (serverTypeId) {
            const available = datacenters.some(
                (dc) =>
                    dc.locationName === location &&
                    dc.availableServerTypeIds.includes(serverTypeId)
            )
            if (!available)
                return fail(c, t('api.planNotAvailableAtLocation'), 400)
        }
    }

    const name = rawName || generateClawName()

    if (
        volumeSize !== undefined &&
        (volumeSize < inputValidation.VOLUME_SIZE.MIN ||
            volumeSize > inputValidation.VOLUME_SIZE.MAX)
    ) {
        return fail(
            c,
            t('api.volumeSizeInvalid', {
                min: inputValidation.VOLUME_SIZE.MIN,
                max: inputValidation.VOLUME_SIZE.MAX
            }),
            400
        )
    }

    const [clawCountResult, userResult, sshKeyResult] = await Promise.all([
        db
            .select({ value: count() })
            .from(claws)
            .where(eq(claws.userId, userId)),
        db.select().from(users).where(eq(users.id, userId)).limit(1),
        sshKeyId
            ? db
                  .select()
                  .from(sshKeys)
                  .where(
                      and(eq(sshKeys.id, sshKeyId), eq(sshKeys.userId, userId))
                  )
                  .limit(1)
            : Promise.resolve(null)
    ])

    if (clawCountResult[0].value >= inputValidation.CLAWS_PER_ACCOUNT.MAX) {
        return fail(
            c,
            t('api.clawLimitReached', {
                max: inputValidation.CLAWS_PER_ACCOUNT.MAX
            }),
            400
        )
    }

    if (!userResult[0]) return fail(c, t('api.userNotFound'), 404)

    if (sshKeyId && (!sshKeyResult || !sshKeyResult[0])) {
        return fail(c, t('api.sshKeyNotFound'), 404)
    }

    let polarCustomerId = userResult[0].polarCustomerId

    if (!polarCustomerId) {
        const customer = await customers.getOrCreate({
            email: userResult[0].email,
            name: userResult[0].name || undefined,
            externalId: userId
        })
        polarCustomerId = customer.id

        await db
            .update(users)
            .set({ polarCustomerId })
            .where(eq(users.id, userId))
    }

    const productId = getPolarProductId(planId, billingCycle)
    if (!productId) return fail(c, t('api.paymentNotConfigured'), 400)

    const pendingId = crypto.randomUUID()
    const finalPassword = password || generatePassword()
    const referralCode = c.req.header('X-Referral-Code') || null

    const checkout = await checkouts.create({
        productId,
        customerEmail: userResult[0].email,
        customerId: polarCustomerId,
        metadata: {
            pendingClawId: pendingId,
            userId,
            planId,
            location,
            name,
            billingInterval: billingCycle,
            environment: getEnvironment(c),
            ...(referralCode ? { referralCode } : {})
        }
    })

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await db.insert(pendingClaws).values({
        id: pendingId,
        userId,
        checkoutId: checkout.id,
        name,
        planId,
        location,
        rootPassword: encrypt(finalPassword),
        gatewayToken: gatewayToken ? encrypt(gatewayToken) : null,
        sshKeyId: sshKeyId || null,
        volumeSize: volumeSize || null,
        priceMonthly: Math.round(priceMonthly * 100),
        billingInterval: billingCycle,
        referralCode,
        expiresAt
    })

    return ok(
        c,
        {
            checkoutUrl: checkout.url,
            checkoutId: checkout.id,
            pendingClawId: pendingId,
            expiresAt: expiresAt.toISOString()
        },
        t('api.clawPurchaseInitiated')
    )
})

export default initiateClawPurchase