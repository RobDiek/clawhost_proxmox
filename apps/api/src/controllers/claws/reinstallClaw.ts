import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws, sshKeys, volumes } from '@/db/schema'
import { getProvider } from '@/services/provider'
import cloudflare from '@/services/cloudflare'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import {
    findUserClaw,
    generateCloudInit,
    generatePassword,
    generateServerName,
    generateToken,
    DOMAIN
} from '@/controllers/claws/helpers'

const REINSTALL_WINDOW = 86_400_000

const reinstallClaw = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const existing = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!existing) return fail(c, t('api.clawNotFound'), 404)

        const nonReinstallableStatuses: string[] = [
            clawStatus.creating,
            clawStatus.deleting
        ]

        if (nonReinstallableStatuses.includes(existing.status)) {
            return fail(c, t('api.clawBusy'), 400)
        }

        if (!c.get('isAdmin') && existing.lastReinstalledAt) {
            const elapsed = Date.now() - existing.lastReinstalledAt.getTime()
            if (elapsed < REINSTALL_WINDOW)
                return fail(c, t('api.reinstallRateLimited'), 429)
        }

        const provider = getProvider()

        await db
            .update(claws)
            .set({ status: clawStatus.creating })
            .where(eq(claws.id, id))

        const [clawVolumes, sshKeyResult] = await Promise.all([
            db.select().from(volumes).where(eq(volumes.clawId, id)),
            existing.sshKeyId
                ? db
                      .select()
                      .from(sshKeys)
                      .where(eq(sshKeys.id, existing.sshKeyId))
                      .limit(1)
                : Promise.resolve(null)
        ])

        await Promise.allSettled([
            ...clawVolumes
                .filter((vol) => vol.providerVolumeId)
                .map(async (vol) => {
                    await provider.detachVolume(vol.providerVolumeId!)
                    await provider.deleteVolume(vol.providerVolumeId!)
                }),
            existing.subdomain
                ? cloudflare
                      .findDNSRecord(existing.subdomain)
                      .then((rec) =>
                          rec ? cloudflare.deleteDNSRecord(rec.id) : null
                      )
                : Promise.resolve(),
            existing.providerServerId
                ? provider.deleteServer(existing.providerServerId)
                : Promise.resolve()
        ])

        const newPassword = generatePassword()
        const newGatewayToken = generateToken()

        let providerSshKeyIds: number[] | undefined
        if (sshKeyResult?.[0]) {
            if (sshKeyResult[0].providerKeyId) {
                providerSshKeyIds = [sshKeyResult[0].providerKeyId]
            }
        }

        const cloudInitScript = generateCloudInit(
            newPassword,
            existing.subdomain!,
            DOMAIN,
            newGatewayToken
        )

        const { serverId, ip } = await provider.createServer(
            generateServerName(existing.name, id),
            existing.planId,
            existing.location!,
            newPassword,
            providerSshKeyIds,
            '',
            cloudInitScript
        )

        await Promise.all([
            cloudflare
                .createDNSRecord(existing.subdomain!, ip)
                .catch((dnsError) => console.error('reinstallClaw', dnsError)),
            db
                .update(claws)
                .set({
                    providerServerId: serverId.toString(),
                    status: clawStatus.configuring,
                    ip,
                    rootPassword: newPassword,
                    gatewayToken: newGatewayToken,
                    lastReinstalledAt: new Date()
                })
                .where(eq(claws.id, id))
        ])

        await Promise.allSettled(
            clawVolumes.map(async (vol) => {
                const providerVolume = await provider.createVolume(
                    vol.name,
                    vol.size,
                    vol.location,
                    serverId
                )
                await db
                    .update(volumes)
                    .set({
                        providerVolumeId: providerVolume.id,
                        status: 'available'
                    })
                    .where(eq(volumes.id, vol.id))
            })
        )

        return ok(c, null, t('api.reinstallSuccess'))
    } catch (error) {
        console.error('reinstallClaw', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToReinstallClaw'),
            500
        )
    }
}

export default reinstallClaw