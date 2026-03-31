import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { PLANS } from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import provisioner from '@/services/provisioner'
import telegram from '@/services/telegram'

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
            automationTool: instance.automationTool,
            selectedComponents: instance.selectedComponents,
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

// POST /hosting/instances/:id/upgrade-plan
export const upgradePlan = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const instanceId = c.req.param('id')
        const { targetPlan } = await c.req.json<{ targetPlan: string }>()

        if (!targetPlan) return fail(c, 'targetPlan is required.', 400)

        const targetPlanInfo = PLANS.find(p => p.key === targetPlan)
        if (!targetPlanInfo) return fail(c, 'Invalid plan.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (instance.status !== 'running') return fail(c, 'Instance must be running to upgrade.', 400)

        const currentPlan = PLANS.find(p => p.key === instance.planKey)
        if (!currentPlan) return fail(c, 'Current plan not found.', 500)

        // Only allow upgrades, not downgrades
        if (targetPlanInfo.ram <= currentPlan.ram) {
            return fail(c, 'Can only upgrade to a higher plan.', 400)
        }

        if (!instance.hetznerServerId) {
            return fail(c, 'No server to upgrade.', 400)
        }

        // Update status to upgrading
        await db.update(instances)
            .set({ status: 'upgrading' })
            .where(eq(instances.id, instanceId))

        // Notify user
        if (instance.telegramChatId) {
            await telegram.sendMessage(instance.telegramChatId,
                `⬆️ *משדרג לתוכנית ${targetPlanInfo.nameHe}*\n` +
                `השרת ייכבה לרגע ויחזור עם ${targetPlanInfo.ram}GB RAM.\n` +
                `זה ייקח ~2-3 דקות 🕐`
            )
        }

        // Perform Hetzner server type change (background)
        const provider = getProvider('hetzner') as typeof import('@/services/hetzner').default
        provider.changeServerType(instance.hetznerServerId, targetPlanInfo.hetznerType)
            .then(async () => {
                await db.update(instances).set({
                    status: 'running',
                    planKey: targetPlan,
                    priceIls: String(targetPlanInfo.priceIls),
                }).where(eq(instances.id, instanceId))

                if (instance.telegramChatId) {
                    await telegram.sendMessage(instance.telegramChatId,
                        `✅ *שדרוג הושלם!*\n` +
                        `תוכנית: ${targetPlanInfo.nameHe} (${targetPlanInfo.ram}GB RAM)\n` +
                        `השרת חזר לפעילות.`
                    )
                }
                await telegram.alertAdmin(`⬆️ Instance ${instanceId} upgraded: ${currentPlan.key} → ${targetPlan}`)
            })
            .catch(async (err) => {
                console.error('Upgrade failed:', err)
                await db.update(instances).set({ status: 'running' }).where(eq(instances.id, instanceId))
                await telegram.alertAdmin(`❌ Upgrade FAILED for ${instanceId}: ${(err as Error).message}`)
            })

        return ok(c, {
            from: currentPlan.key,
            to: targetPlan,
            newPrice: targetPlanInfo.priceIls,
            newRam: targetPlanInfo.ram,
        }, 'Upgrade started. Server will restart in ~2-3 minutes.')
    } catch (err) {
        console.error('Upgrade plan error:', err)
        return fail(c, 'Failed to upgrade plan.', 500)
    }
}

// POST /hosting/instances/:id/add-storage
export const addStorage = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const instanceId = c.req.param('id')
        const { addonId } = await c.req.json<{ addonId: string }>()

        const STORAGE_MAP: Record<string, number> = {
            storage_20: 20,
            storage_100: 100,
            storage_500: 500,
        }

        const sizeGb = STORAGE_MAP[addonId]
        if (!sizeGb) return fail(c, 'Invalid storage addon.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.hetznerServerId) return fail(c, 'Instance not found or not provisioned.', 404)

        const provider = getProvider('hetzner')

        // Create Hetzner volume and attach to server
        const volume = await provider.createVolume(
            `vol-${instanceId}-${Date.now()}`,
            sizeGb,
            process.env.HETZNER_DATACENTER || 'hel1',
            Number(instance.hetznerServerId)
        )

        // Update storage in DB
        const currentStorage = instance.storageGb || 0
        await db.update(instances).set({
            storageGb: currentStorage + sizeGb,
        }).where(eq(instances.id, instanceId))

        await telegram.alertAdmin(`💾 Storage added: ${instanceId} +${sizeGb}GB (volume: ${volume.id})`)

        return ok(c, {
            volumeId: volume.id,
            sizeGb,
            totalStorageGb: currentStorage + sizeGb,
        }, `${sizeGb}GB storage added.`)
    } catch (err) {
        console.error('addStorage error:', err)
        return fail(c, 'Failed to add storage.', 500)
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
