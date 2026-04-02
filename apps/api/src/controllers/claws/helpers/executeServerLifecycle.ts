import type { ClawRow } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider, updateCachedServerStatus } from '@/services/provider'

const LIFECYCLE_CONFIG = {
    start: {
        transitionalStatus: 'starting',
        providerMethod: 'startServer'
    },
    stop: {
        transitionalStatus: 'stopping',
        providerMethod: 'stopServer'
    },
    restart: {
        transitionalStatus: 'restarting',
        providerMethod: 'restartServer'
    }
} as const

const executeServerLifecycle = async (
    claw: ClawRow,
    operation: 'start' | 'stop' | 'restart'
): Promise<{ success: boolean; status: string }> => {
    const config = LIFECYCLE_CONFIG[operation]
    const previousStatus = claw.status

    await db
        .update(claws)
        .set({ status: config.transitionalStatus })
        .where(eq(claws.id, claw.id))

    try {
        const provider = getProvider()
        await provider[config.providerMethod](claw.providerServerId!)
        updateCachedServerStatus(
            claw.providerServerId!,
            config.transitionalStatus
        )
        return { success: true, status: config.transitionalStatus }
    } catch {
        await db
            .update(claws)
            .set({ status: previousStatus })
            .where(eq(claws.id, claw.id))
        return { success: false, status: previousStatus }
    }
}

export default executeServerLifecycle