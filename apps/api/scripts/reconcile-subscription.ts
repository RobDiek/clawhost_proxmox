import 'dotenv/config'

import { eq } from 'drizzle-orm'
import { clawStatus, inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { getProvider } from '@/services/provider'
import cloudflare from '@/services/cloudflare'
import provisionClaw from '@/controllers/claws/provisionClaw'
import {
    generateSlug,
    generateToken,
    generatePassword,
    generateCloudInit,
    DOMAIN
} from '@/controllers/claws/helpers'

const run = async () => {
    const subscriptionId = process.argv[2]

    if (!subscriptionId) {
        console.error(
            'Usage: tsx scripts/reconcile-subscription.ts <subscription-id> [--plan <plan-id>] [--location <location-id>]'
        )
        process.exit(1)
    }

    const getArg = (flag: string): string | null => {
        const idx = process.argv.indexOf(flag)
        return idx !== -1 ? process.argv[idx + 1] : null
    }

    const planArg = getArg('--plan')
    const locationArg = getArg('--location')

    console.log(`Fetching subscription ${subscriptionId} from Polar...`)

    const [subscription, existingClaw] = await Promise.all([
        subscriptions.get(subscriptionId),
        db
            .select()
            .from(claws)
            .where(eq(claws.polarSubscriptionId, subscriptionId))
            .limit(1)
    ])

    if (!subscription) {
        console.error('Subscription not found in Polar')
        process.exit(1)
    }

    console.log(`Status: ${subscription.status}`)
    console.log(`Product ID: ${subscription.productId}`)
    console.log(`Customer ID: ${subscription.customerId}`)
    console.log(`Metadata: ${JSON.stringify(subscription.metadata)}`)

    if (subscription.status !== 'active') {
        console.error(
            `Subscription is not active (status: ${subscription.status}), cannot provision`
        )
        process.exit(1)
    }

    if (existingClaw[0]) {
        console.log(`\nClaw already exists for this subscription:`)
        console.log(`  ID: ${existingClaw[0].id}`)
        console.log(`  Name: ${existingClaw[0].name}`)
        console.log(`  Status: ${existingClaw[0].status}`)
        console.log(`  IP: ${existingClaw[0].ip || 'none'}`)
        process.exit(0)
    }

    const metadata = subscription.metadata
    const pendingClawId = metadata?.pendingClawId
    const userId = metadata?.userId
    const planId = planArg || metadata?.planId
    const location = locationArg || metadata?.location
    const name = metadata?.name

    if (planArg) {
        console.log(`\nOverriding plan: ${metadata?.planId} -> ${planArg}`)
    }
    if (locationArg) {
        console.log(
            `Overriding location: ${metadata?.location} -> ${locationArg}`
        )
    }

    if (!userId || !planId || !location) {
        console.error(
            '\nMissing required metadata on subscription (userId, planId, location)'
        )
        console.error('Cannot auto-provision without this data')
        process.exit(1)
    }

    if (pendingClawId) {
        const pending = await db
            .select()
            .from(pendingClaws)
            .where(eq(pendingClaws.id, pendingClawId))
            .limit(1)

        if (pending[0]) {
            console.log(
                '\nPending claw found, provisioning via standard path...'
            )

            const result = await provisionClaw({
                pendingClawId,
                subscriptionId,
                customerId: subscription.customerId,
                productId: subscription.productId
            })

            if (result.success) {
                console.log(`Claw provisioned: ${result.clawId}`)
            } else {
                console.error(`Provisioning failed: ${result.error}`)
                process.exit(1)
            }

            return
        }

        console.log(
            '\nPending claw expired/deleted, proceeding with manual provisioning...'
        )
    }

    const provider = getProvider()
    const [serverTypes, rawTypes, datacenters] = await Promise.all([
        provider.getServerTypes(),
        provider.getRawServerTypes
            ? provider.getRawServerTypes()
            : Promise.resolve(null),
        provider.getDatacenters
            ? provider.getDatacenters()
            : Promise.resolve(null)
    ])
    const selectedPlan = serverTypes.find((st) => st.name === planId)

    if (!selectedPlan) {
        console.error(`Plan "${planId}" not found`)
        process.exit(1)
    }

    if (selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN) {
        console.error(
            `Plan "${planId}" does not meet minimum memory requirement`
        )
        process.exit(1)
    }

    if (rawTypes && datacenters) {
        const serverTypeId = rawTypes.find((st) => st.name === planId)?.id
        if (serverTypeId) {
            const locationDcs = datacenters.filter(
                (dc) => dc.locationName === location
            )

            if (locationDcs.length === 0) {
                console.error(`\nLocation "${location}" has no datacenters`)
                const validLocations = [
                    ...new Set(
                        datacenters
                            .filter((dc) =>
                                dc.availableServerTypeIds.includes(serverTypeId)
                            )
                            .map((dc) => dc.locationName)
                    )
                ]
                console.error(
                    `Valid locations for ${planId}: ${validLocations.join(', ')}`
                )
                process.exit(1)
            }

            const available = locationDcs.some((dc) =>
                dc.availableServerTypeIds.includes(serverTypeId)
            )

            if (!available) {
                console.error(
                    `\nPlan "${planId}" is NOT available in location "${location}"`
                )
                const validLocations = [
                    ...new Set(
                        datacenters
                            .filter((dc) =>
                                dc.availableServerTypeIds.includes(serverTypeId)
                            )
                            .map((dc) => dc.locationName)
                    )
                ]
                console.error(
                    `Valid locations for ${planId}: ${validLocations.join(', ')}`
                )
                process.exit(1)
            }

            console.log(
                `\nAvailability check passed: ${planId} is available in ${location}`
            )
        }
    }

    const id = crypto.randomUUID()
    const subdomain = generateSlug(id)
    const gatewayToken = generateToken()
    const rootPassword = generatePassword()
    const clawName = name || `reconciled-${id.slice(0, 8)}`

    console.log(`\nProvisioning manually:`)
    console.log(`  Plan: ${planId}`)
    console.log(`  Location: ${location}`)
    console.log(`  Name: ${clawName}`)
    console.log(`  Claw ID: ${id}`)

    const cloudInitScript = generateCloudInit(
        rootPassword,
        subdomain,
        DOMAIN,
        gatewayToken
    )

    await db.insert(claws).values({
        id,
        userId,
        name: clawName,
        status: clawStatus.creating,
        planId,
        location,
        rootPassword,
        subdomain,
        gatewayToken,
        polarSubscriptionId: subscriptionId,
        polarProductId: subscription.productId,
        polarCustomerId: subscription.customerId,
        subscriptionStatus: 'active'
    })

    console.log('Claw record created, creating server...')

    try {
        const serverName = `${clawName}-${id.slice(0, 8)}`.replace(
            /[^a-zA-Z0-9-]/g,
            '-'
        )
        const server = await provider.createServer(
            serverName,
            planId,
            location,
            rootPassword,
            undefined,
            '',
            cloudInitScript
        )

        console.log(`Server created: ID=${server.serverId}, IP=${server.ip}`)

        await Promise.all([
            cloudflare
                .createDNSRecord(subdomain, server.ip)
                .then(() =>
                    console.log(`DNS record created: ${subdomain}.${DOMAIN}`)
                )
                .catch((err) =>
                    console.error('DNS record failed (non-fatal):', err)
                ),
            db
                .update(claws)
                .set({
                    providerServerId: server.serverId.toString(),
                    status: clawStatus.configuring,
                    ip: server.ip
                })
                .where(eq(claws.id, id))
        ])

        console.log(`\nDone! Claw provisioned successfully.`)
        console.log(`  ID: ${id}`)
        console.log(`  Subdomain: ${subdomain}.${DOMAIN}`)
        console.log(`  IP: ${server.ip}`)
        console.log(`  Root password: ${rootPassword}`)
    } catch (err) {
        console.error(
            'Server creation failed, rolling back claw record...',
            err
        )
        await db.delete(claws).where(eq(claws.id, id))
        process.exit(1)
    }
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})