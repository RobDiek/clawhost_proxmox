import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import getProvider from '@/services/provider/getProvider'
import provisioner from '@/services/provisioner'

export const getInstances = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const result = await db.select()
            .from(instances)
            .where(eq(instances.userId, userId))

        const sanitized = result.map(i => ({
            id: i.id,
            planKey: i.planKey,
            priceIls: i.priceIls,
            status: i.status,
            selectedComponents: i.selectedComponents,
            automationTool: i.automationTool,
            subdomainAgent: i.subdomainAgent,
            subdomainFlows: i.subdomainFlows,
            openclawToken: i.openclawToken,
            onboardingStep: i.onboardingStep,
            onboardingCompleted: i.onboardingCompleted,
            subscriptionStatus: i.subscriptionStatus,
            createdAt: i.createdAt
        }))

        return ok(c, sanitized, 'Instances retrieved.')
    } catch (err) {
        console.error('Get instances error:', err)
        return fail(c, 'Failed to get instances.', 500)
    }
}

export const getInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        return ok(c, {
            ...instance,
            rootPassword: undefined
        }, 'Instance retrieved.')
    } catch (err) {
        console.error('Get instance error:', err)
        return fail(c, 'Failed to get instance.', 500)
    }
}

export const getInstanceStatus = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(eq(instances.id, instanceId))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        let serverStatus = instance.status
        if (instance.hetznerServerId) {
            try {
                const provider = getProvider('hetzner')
                const status = await provider.getServer(instance.hetznerServerId)
                serverStatus = status.status
            } catch {
                serverStatus = 'unreachable'
            }
        }

        return ok(c, {
            status: instance.status,
            serverStatus,
            ip: instance.ip,
            subdomainAgent: instance.subdomainAgent,
            subdomainFlows: instance.subdomainFlows,
            onboardingStep: instance.onboardingStep,
            onboardingCompleted: instance.onboardingCompleted
        }, 'Status retrieved.')
    } catch (err) {
        console.error('Get instance status error:', err)
        return fail(c, 'Failed to get status.', 500)
    }
}

export const restartInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.hetznerServerId) {
            return fail(c, 'Instance not found or not provisioned.', 404)
        }

        const provider = getProvider('hetzner')
        await provider.restartServer(instance.hetznerServerId)

        return ok(c, null, 'Instance restarting.')
    } catch (err) {
        console.error('Restart error:', err)
        return fail(c, 'Failed to restart instance.', 500)
    }
}

export const deleteInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        if (instance.hetznerServerId) {
            await provisioner.terminate(instanceId, instance.hetznerServerId)
        }

        await db.update(instances)
            .set({ status: 'terminated' })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Instance terminated.')
    } catch (err) {
        console.error('Delete instance error:', err)
        return fail(c, 'Failed to terminate instance.', 500)
    }
}
