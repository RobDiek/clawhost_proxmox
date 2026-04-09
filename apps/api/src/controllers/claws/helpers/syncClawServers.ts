import type { ClawRow } from '@/ts/Types'
import type { ServerStatus } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import cloudflare from '@/services/cloudflare'
import checkSubdomainReady from '@/controllers/claws/helpers/checkSubdomainReady'

const transitionCompletedBy: Record<string, string[]> = {
    [clawStatus.stopping]: [clawStatus.stopped],
    [clawStatus.starting]: [clawStatus.running],
    [clawStatus.creating]: [clawStatus.running],
    [clawStatus.initializing]: [clawStatus.running],
    [clawStatus.migrating]: [clawStatus.running],
    [clawStatus.rebuilding]: [clawStatus.running],
    [clawStatus.restarting]: [clawStatus.running]
}

const syncClawServers = async (clawList: ClawRow[]): Promise<ClawRow[]> => {
    let serverMap = new Map<string, ServerStatus>()

    try {
        serverMap = await getProvider().getServers()
    } catch (error) {
        console.error('syncClawServers', error)
    }

    const syncedClaws = await Promise.all(
        clawList.map(async (claw) => {
            if (!claw.providerServerId) return claw

            const live = serverMap.get(claw.providerServerId)
            if (!live) return claw

            if (claw.status === clawStatus.configuring) {
                if (
                    live.ip &&
                    claw.subdomain &&
                    (!claw.ip || claw.ip !== live.ip)
                ) {
                    await Promise.all([
                        cloudflare
                            .findDNSRecord(claw.subdomain)
                            .then(async (existing) => {
                                if (existing && existing.ip !== live.ip) {
                                    await cloudflare.updateDNSRecord(
                                        existing.id,
                                        claw.subdomain!,
                                        live.ip!
                                    )
                                } else if (!existing) {
                                    await cloudflare.createDNSRecord(
                                        claw.subdomain!,
                                        live.ip!
                                    )
                                }
                            })
                            .catch((error) => {
                                console.error('syncClawServers', error)
                            }),
                        db
                            .update(claws)
                            .set({ ip: live.ip })
                            .where(eq(claws.id, claw.id))
                    ])
                }

                if (live.status === clawStatus.running && claw.subdomain) {
                    const ready = await checkSubdomainReady(claw.subdomain)
                    if (ready) {
                        await db
                            .update(claws)
                            .set({
                                status: clawStatus.running,
                                ip: live.ip
                            })
                            .where(eq(claws.id, claw.id))
                        return {
                            ...claw,
                            status: clawStatus.running,
                            ip: live.ip
                        }
                    }
                }
                return { ...claw, ip: live.ip }
            }

            if (claw.status === clawStatus.unreachable)
                return { ...claw, ip: live.ip }

            const completionStates = transitionCompletedBy[claw.status]
            if (completionStates && !completionStates.includes(live.status)) {
                return { ...claw, ip: live.ip }
            }

            if (claw.status !== live.status) {
                await db
                    .update(claws)
                    .set({ status: live.status, ip: live.ip })
                    .where(eq(claws.id, claw.id))
            }

            return { ...claw, status: live.status, ip: live.ip }
        })
    )

    return syncedClaws
}

export default syncClawServers