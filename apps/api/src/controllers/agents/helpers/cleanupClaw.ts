import type { ClawCleanupData } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, volumes } from '@/db/schema'
import { getProvider } from '@/services/provider'
import cloudflare from '@/services/cloudflare'
import hostKeyStore from '@/services/hostKeyStore'

const cleanupClaw = async (
    clawId: string,
    claw: ClawCleanupData
): Promise<void> => {
    const provider = getProvider()

    if (claw.ip) hostKeyStore.clear(claw.ip)

    const clawVolumes = await db
        .select()
        .from(volumes)
        .where(eq(volumes.clawId, clawId))

    await Promise.allSettled([
        ...clawVolumes
            .filter((vol) => vol.providerVolumeId)
            .map(async (vol) => {
                await provider.detachVolume(vol.providerVolumeId!)
                await provider.deleteVolume(vol.providerVolumeId!)
            }),
        claw.subdomain
            ? cloudflare
                  .findDNSRecord(claw.subdomain)
                  .then((rec) =>
                      rec ? cloudflare.deleteDNSRecord(rec.id) : null
                  )
            : Promise.resolve(),
        claw.providerServerId
            ? provider.deleteServer(claw.providerServerId)
            : Promise.resolve()
    ])

    await db.delete(volumes).where(eq(volumes.clawId, clawId))
    await db.delete(claws).where(eq(claws.id, clawId))
}

export default cleanupClaw