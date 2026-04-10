import type {
    ProvisionClawParams,
    ProvisionClawResponse
} from '@/ts/Interfaces'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { clawStatus, inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { subscriptionStatus } from '@/lib/constants'
import { claws, pendingClaws, sshKeys, volumes } from '@/db/schema'
import { getProvider } from '@/services/provider'
import cloudflare from '@/services/cloudflare'
import {
    generateSlug,
    generateServerName,
    generateToken,
    generateCloudInit,
    DOMAIN
} from '@/controllers/claws/helpers'
import { encrypt, decrypt } from '@/lib/encryption'
import { t } from '@openclaw/i18n'

const provisionClaw = async (
    params: ProvisionClawParams
): Promise<ProvisionClawResponse> => {
    try {
        const existingClaw = await db
            .select()
            .from(claws)
            .where(eq(claws.polarSubscriptionId, params.subscriptionId))
            .limit(1)

        if (existingClaw[0])
            return { success: true, clawId: existingClaw[0].id }

        const claimed = await db
            .delete(pendingClaws)
            .where(eq(pendingClaws.id, params.pendingClawId))
            .returning()

        if (!claimed[0])
            return { success: false, error: t('api.pendingClawNotFound') }

        const pending = claimed[0]

        const provider = getProvider()

        const [serverTypes, sshKeyResult] = await Promise.all([
            provider.getServerTypes(),
            pending.sshKeyId
                ? db
                      .select()
                      .from(sshKeys)
                      .where(eq(sshKeys.id, pending.sshKeyId))
                      .limit(1)
                : Promise.resolve(null)
        ])

        const selectedPlan = serverTypes.find(
            (st) => st.name === pending.planId
        )

        if (
            !selectedPlan ||
            selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN
        )
            return { success: false, error: t('api.planBelowMinimumMemory') }

        const id = crypto.randomUUID()
        const subdomain = generateSlug(id)
        const gatewayToken = generateToken()

        let providerSshKeyIds: number[] | undefined
        if (sshKeyResult && sshKeyResult[0]) {
            if (sshKeyResult[0].providerKeyId) {
                providerSshKeyIds = [sshKeyResult[0].providerKeyId]
            }
        }

        if (!pending.rootPassword)
            return { success: false, error: t('api.failedToProvisionClaw') }

        const plainRootPassword = decrypt(pending.rootPassword)

        const cloudInitScript = generateCloudInit(
            plainRootPassword,
            subdomain,
            DOMAIN,
            gatewayToken
        )

        await db.insert(claws).values({
            id,
            userId: pending.userId,
            name: pending.name,
            status: clawStatus.creating,
            planId: pending.planId,
            location: pending.location,
            rootPassword: pending.rootPassword,
            sshKeyId: pending.sshKeyId,
            subdomain,
            gatewayToken: encrypt(gatewayToken),
            polarSubscriptionId: params.subscriptionId,
            polarProductId: params.productId,
            polarCustomerId: params.customerId,
            subscriptionStatus: subscriptionStatus.active,
            billingInterval: pending.billingInterval
        })

        let serverId: number
        let ip: string

        try {
            const serverName = generateServerName(pending.name, id)
            const server = await provider.createServer(
                serverName,
                pending.planId,
                pending.location,
                plainRootPassword || undefined,
                providerSshKeyIds,
                '',
                cloudInitScript
            )
            serverId = server.serverId
            ip = server.ip
        } catch (providerErr) {
            await db.delete(claws).where(eq(claws.id, id))
            throw providerErr
        }

        await Promise.all([
            cloudflare
                .createDNSRecord(subdomain, ip)
                .catch((dnsError) => console.error('provisionClaw', dnsError)),
            db
                .update(claws)
                .set({
                    providerServerId: serverId.toString(),
                    status: clawStatus.configuring,
                    ip
                })
                .where(eq(claws.id, id))
        ])

        if (
            pending.volumeSize &&
            pending.volumeSize >= inputValidation.VOLUME_SIZE.MIN
        ) {
            try {
                const volumeId = crypto.randomUUID()
                const providerVolume = await provider.createVolume(
                    `${pending.name}-vol-${volumeId.slice(0, 8)}`,
                    pending.volumeSize,
                    pending.location,
                    serverId
                )

                await db.insert(volumes).values({
                    id: volumeId,
                    userId: pending.userId,
                    clawId: id,
                    name: `${pending.name}-storage`,
                    size: pending.volumeSize,
                    providerVolumeId: providerVolume.id,
                    location: pending.location,
                    status: 'available'
                })
            } catch (volumeError) {
                console.error('provisionClaw', volumeError)
            }
        }

        return { success: true, clawId: id, referralCode: pending.referralCode }
    } catch (error) {
        console.error('provisionClaw', error)
        return {
            success: false,
            error: t('api.failedToProvisionClaw')
        }
    }
}

export default provisionClaw