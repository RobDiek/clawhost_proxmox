import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import crypto from 'crypto'
import { randomBytes } from 'crypto'
import { db } from '@/db'
import { instances, payments } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { PLANS } from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import provisioner from '@/services/provisioner'
import telegram from '@/services/telegram'

/** Extract userId from JWT or HonoEnv middleware */
function resolveUserId(c: Context<HonoEnv>): string | null {
    // Try HonoEnv middleware first
    try { const id = c.get('userId'); if (id) return id; } catch {}
    // Fallback: parse JWT from Authorization header
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    const parts = auth.slice(7).split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const secret = process.env.JWT_SECRET || ''
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

export const getInstances = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
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
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
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
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(userId ? and(eq(instances.id, instanceId), eq(instances.userId, userId)) : eq(instances.id, instanceId))

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
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
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
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
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

        // Record upgrade — price difference will be reflected in next billing cycle
        // TODO: integrate AllPay subscription update for pro-rated charge
        // For now: record as pending, Hetzner upgrade proceeds, billing adjusted next month
        const priceDiff = targetPlanInfo.priceIls - currentPlan.priceIls
        await db.insert(payments).values({
            id: randomBytes(5).toString('hex'),
            instanceId,
            allpayOrderId: `upgrade-${instanceId}-${Date.now()}`,
            amountIls: String(priceDiff),
            status: 'pending_billing_update',
            paidAt: null,
        })

        // Alert admin to manually update AllPay subscription amount
        await telegram.alertAdmin(
            `⬆️ Plan upgrade: ${instanceId}\n` +
            `${currentPlan.key} (₪${currentPlan.priceIls}) → ${targetPlan} (₪${targetPlanInfo.priceIls})\n` +
            `Diff: ₪${priceDiff}/month\n` +
            `⚠️ Update AllPay subscription manually!`
        ).catch(() => {})

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
        const provider = getProvider('hetzner')
        if (!provider.changeServerType) {
            return fail(c, 'Provider does not support server type change.', 400)
        }
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
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')
        const { addonId } = await c.req.json<{ addonId: string }>()

        const STORAGE_OPTIONS: Record<string, { size: number; price: number }> = {
            storage_20: { size: 20, price: 9 },
            storage_100: { size: 100, price: 39 },
            storage_500: { size: 500, price: 199 },
        }

        const option = STORAGE_OPTIONS[addonId]
        if (!option) return fail(c, 'Invalid storage addon.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.hetznerServerId) return fail(c, 'Instance not found or not provisioned.', 404)
        if (instance.status !== 'running') return fail(c, 'Instance must be running.', 400)

        // Record payment
        await db.insert(payments).values({
            id: randomBytes(5).toString('hex'),
            instanceId,
            allpayOrderId: `storage-${instanceId}-${Date.now()}`,
            amountIls: String(option.price),
            status: 'paid',
            paidAt: new Date(),
        })

        const provider = getProvider('hetzner')

        // Create Hetzner volume (automount + ext4 formatted)
        const volume = await provider.createVolume(
            `vol-${instanceId}-${Date.now()}`,
            option.size,
            process.env.HETZNER_DATACENTER || 'hel1',
            Number(instance.hetznerServerId)
        )

        // Symlink volume mount to openclaw extra-storage dir
        if (instance.ip) {
            try {
                const { Client } = await import('ssh2')
                const { readFileSync } = await import('fs')
                const sshKey = readFileSync(process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master')
                await new Promise<void>((resolve, reject) => {
                    const conn = new Client()
                    conn.on('ready', () => {
                        conn.exec(
                            `MOUNT=$(lsblk -o MOUNTPOINT -n /dev/disk/by-id/scsi-0HC_Volume_${volume.id} 2>/dev/null | head -1) && ` +
                            `if [ -n "$MOUNT" ]; then ` +
                            `  mkdir -p /home/openclaw/.openclaw/extra-storage && ` +
                            `  ln -sf "$MOUNT" /home/openclaw/.openclaw/extra-storage/vol-${volume.id} && ` +
                            `  chown -R openclaw:openclaw /home/openclaw/.openclaw/extra-storage; ` +
                            `fi`,
                            (err) => { conn.end(); if (err) reject(err); else resolve() }
                        )
                    }).on('error', reject)
                    const opts: Record<string, unknown> = { host: instance.ip, port: 22, username: 'root', privateKey: sshKey }
                    if (instance.rootPassword) opts.password = instance.rootPassword
                    conn.connect(opts)
                })
            } catch (e) {
                console.error('Volume symlink failed (non-critical):', e)
            }
        }

        // Update storage in DB
        const currentStorage = instance.storageGb || 0
        await db.update(instances).set({
            storageGb: currentStorage + option.size,
        }).where(eq(instances.id, instanceId))

        await telegram.alertAdmin(`💾 Storage added: ${instanceId} +${option.size}GB (₪${option.price}/mo, volume: ${volume.id})`)

        return ok(c, {
            volumeId: volume.id,
            sizeGb: option.size,
            priceIls: option.price,
            totalStorageGb: currentStorage + option.size,
        }, `${option.size}GB אחסון נוסף נוסף בהצלחה!`)
    } catch (err) {
        console.error('addStorage error:', err)
        return fail(c, 'Failed to add storage.', 500)
    }
}

export const deleteInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        // Cancel AllPay recurring payment
        if (instance.allpayOrderId) {
            try {
                const allpay = (await import('@/services/allpay')).default
                await allpay.cancelSubscription(instance.allpayOrderId)
            } catch (e) {
                console.error(`Failed to cancel AllPay for ${instanceId}:`, e)
            }
        }

        // Delete Hetzner volumes
        if (instance.hetznerServerId) {
            try {
                const provider = getProvider('hetzner')
                const volumes = await provider.getVolumes?.(Number(instance.hetznerServerId))
                if (volumes && Array.isArray(volumes)) {
                    for (const vol of volumes) {
                        try { await provider.deleteVolume(vol.id) } catch {}
                    }
                }
            } catch {}
        }

        if (instance.hetznerServerId) {
            await provisioner.terminate(instanceId, instance.hetznerServerId, instance.subdomainAgent || undefined, instance.subdomainFlows || undefined)
        }

        await db.update(instances)
            .set({ status: 'terminated', subscriptionStatus: 'cancelled' })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Instance terminated.')
    } catch (err) {
        console.error('Delete instance error:', err)
        return fail(c, 'Failed to terminate instance.', 500)
    }
}

// DELETE /hosting/account — delete user account + all instances + volumes + subscriptions
export const deleteAccount = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)

        const { users, payments: paymentsTable, instanceAddons, agentOutputs } = await import('@/db/schema')
        const allpay = (await import('@/services/allpay')).default

        // Get all user instances
        const userInstances = await db.select()
            .from(instances)
            .where(eq(instances.userId, userId))

        const provider = getProvider('hetzner')

        for (const inst of userInstances) {
            // 1. Cancel AllPay recurring payment
            if (inst.allpayOrderId) {
                try {
                    await allpay.cancelSubscription(inst.allpayOrderId)
                    console.log(`[deleteAccount] AllPay cancelled: ${inst.id}`)
                } catch (e) {
                    console.error(`[deleteAccount] AllPay cancel failed for ${inst.id}:`, e)
                }
            }

            // 2. Delete Hetzner volumes attached to this server
            if (inst.hetznerServerId) {
                try {
                    const volumes = await provider.getVolumes?.(Number(inst.hetznerServerId))
                    if (volumes && Array.isArray(volumes)) {
                        for (const vol of volumes) {
                            try { await provider.deleteVolume(vol.id) } catch {}
                        }
                    }
                } catch (e) {
                    console.error(`[deleteAccount] Volume cleanup failed for ${inst.id}:`, e)
                }
            }

            // 3. Terminate Hetzner VPS + DNS
            if (inst.hetznerServerId && inst.status !== 'terminated') {
                try {
                    await provisioner.terminate(inst.id, inst.hetznerServerId, inst.subdomainAgent || undefined, inst.subdomainFlows || undefined)
                    console.log(`[deleteAccount] VPS terminated: ${inst.id}`)
                } catch (e) {
                    console.error(`[deleteAccount] VPS terminate failed for ${inst.id}:`, e)
                }
            }

            // 4. Delete DB child records (explicit, don't rely on cascade)
            try { await db.delete(agentOutputs).where(eq(agentOutputs.instanceId, inst.id)) } catch {}
            try { await db.delete(paymentsTable).where(eq(paymentsTable.instanceId, inst.id)) } catch {}
            try { await db.delete(instanceAddons).where(eq(instanceAddons.instanceId, inst.id)) } catch {}

            // 5. Delete instance record
            await db.delete(instances).where(eq(instances.id, inst.id))
            console.log(`[deleteAccount] Instance deleted from DB: ${inst.id}`)
        }

        // 6. Delete user record
        await db.delete(users).where(eq(users.id, userId))
        console.log(`[deleteAccount] User deleted: ${userId}`)

        await telegram.alertAdmin(`🗑️ Account fully deleted: ${userId} (${userInstances.length} instances, VPS+volumes+subscriptions cleaned)`)

        return ok(c, null, 'Account deleted.')
    } catch (err) {
        console.error('deleteAccount error:', err)
        return fail(c, 'Failed to delete account.', 500)
    }
}