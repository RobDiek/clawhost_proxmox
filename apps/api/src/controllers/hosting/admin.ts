import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { instances, payments } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import provisioner from '@/services/provisioner'

export const adminGetInstances = async (c: Context<HonoEnv>) => {
    try {
        const isAdmin = c.get('isAdmin')
        if (!isAdmin) return fail(c, 'Unauthorized.', 403)

        const result = await db.select().from(instances).orderBy(desc(instances.createdAt))
        return ok(c, result, 'All instances retrieved.')
    } catch (err) {
        console.error('Admin get instances error:', err)
        return fail(c, 'Failed to get instances.', 500)
    }
}

export const adminGetRevenue = async (c: Context<HonoEnv>) => {
    try {
        const isAdmin = c.get('isAdmin')
        if (!isAdmin) return fail(c, 'Unauthorized.', 403)

        const activeInstances = await db.select()
            .from(instances)
            .where(eq(instances.status, 'running'))

        const mrr = activeInstances.reduce((sum, i) => sum + parseFloat(i.priceIls || '0'), 0)
        const totalPayments = await db.select({ total: sql<number>`count(*)` })
            .from(payments)
            .where(eq(payments.status, 'paid'))

        return ok(c, {
            mrr,
            activeInstances: activeInstances.length,
            totalPayments: totalPayments[0]?.total || 0
        }, 'Revenue data retrieved.')
    } catch (err) {
        console.error('Admin revenue error:', err)
        return fail(c, 'Failed to get revenue.', 500)
    }
}

export const adminSuspendInstance = async (c: Context<HonoEnv>) => {
    try {
        const isAdmin = c.get('isAdmin')
        if (!isAdmin) return fail(c, 'Unauthorized.', 403)

        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.hetznerServerId) return fail(c, 'Instance not found.', 404)

        await provisioner.suspend(instance.hetznerServerId)
        await db.update(instances)
            .set({ status: 'suspended', suspendedAt: new Date() })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Instance suspended.')
    } catch (err) {
        console.error('Admin suspend error:', err)
        return fail(c, 'Failed to suspend.', 500)
    }
}

export const adminTerminateInstance = async (c: Context<HonoEnv>) => {
    try {
        const isAdmin = c.get('isAdmin')
        if (!isAdmin) return fail(c, 'Unauthorized.', 403)

        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance) return fail(c, 'Instance not found.', 404)

        if (instance.hetznerServerId) {
            await provisioner.terminate(instanceId, instance.hetznerServerId)
        }

        await db.update(instances)
            .set({ status: 'terminated' })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Instance terminated.')
    } catch (err) {
        console.error('Admin terminate error:', err)
        return fail(c, 'Failed to terminate.', 500)
    }
}
