import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import telegram from '@/services/telegram'
import { resolveUserId, getOwnedInstance } from './authHelper'

interface HealthReport {
    cpu: number
    ram: number
    disk: number
    gateway: string
    qdrant: string
    automation: string
    sslDays: number
    version: string
    actions: string
    ts: number
}

// Rate limit health reports per instance (prevent spam)
const healthReportTimes = new Map<string, number>()
// Alert dedup: don't send same alert type more than once per 30 min
const lastAlertTimes = new Map<string, number>()

// POST /hosting/instances/:id/health-report (auth via instance token)
export const healthReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')

        // Validate instance exists
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return ok(c, null, 'ok') // silent — don't reveal instance existence

        // Auth: verify request comes from the actual VPS using OpenClaw token
        const authToken = c.req.header('x-health-token') || ''
        if (!instance.openclawToken || authToken !== instance.openclawToken) {
            return ok(c, null, 'ok') // silent reject — don't reveal auth failure
        }

        // Rate limit: max 1 report per 4 minutes per instance
        const lastReport = healthReportTimes.get(instanceId) || 0
        if (Date.now() - lastReport < 240000) {
            return ok(c, null, 'ok') // too frequent, silently ignore
        }
        healthReportTimes.set(instanceId, Date.now())

        const body = await c.req.json<HealthReport>()

        // Save report to DB
        await db.update(instances).set({
            lastHealthReport: body as any,
            lastHealthAt: new Date(),
        }).where(eq(instances.id, instanceId))

        // Evaluate alerts
        const alerts: string[] = []

        if (body.gateway === 'dead') alerts.push('🔴 OpenClaw Gateway לא מגיב')
        if (body.qdrant === 'dead') alerts.push('🟡 Qdrant (זיכרון) לא מגיב')
        if (body.automation === 'dead') alerts.push('🟡 כלי אוטומציה לא מגיב')
        if (body.disk > 95) alerts.push(`🔴 דיסק: ${body.disk}%`)
        if (body.ram > 95) alerts.push(`🟡 RAM: ${body.ram}%`)
        if (body.sslDays < 3 && body.sslDays !== 999) alerts.push(`🔴 SSL פג תוך ${body.sslDays} ימים`)

        // Report auto-actions taken
        if (body.actions) {
            alerts.push('🔧 פעולות אוטומטיות: ' + body.actions.replace(/,/g, ', '))
        }

        // Send alerts (with deduplication — max 1 per 30 min per instance)
        if (alerts.length > 0) {
            const alertKey = `${instanceId}:${alerts.map(a => a.slice(0, 10)).join(',')}`
            const lastAlert = lastAlertTimes.get(alertKey) || 0

            if (Date.now() - lastAlert > 1800000) { // 30 minutes
                lastAlertTimes.set(alertKey, Date.now())

                const subdomain = instance.subdomainName || instanceId
                const msg = `⚠️ *ClawFlow Alert*\n\n${alerts.join('\n')}\n\n` +
                    `Instance: ${subdomain}\n` +
                    `CPU: ${body.cpu}% · RAM: ${body.ram}% · Disk: ${body.disk}%`

                // Alert instance owner via Telegram
                if (instance.telegramChatId) {
                    try {
                        await telegram.sendMessage(instance.telegramChatId, msg, { parse_mode: 'Markdown' })
                    } catch { /* non-critical */ }
                }

                // Always alert admin
                await telegram.alertAdmin(msg).catch(() => {})
            }
        }

        return ok(c, null, 'ok')
    } catch (err) {
        console.error('healthReport error:', err)
        return ok(c, null, 'ok') // Don't fail — health daemon should not get errors
    }
}

// GET /hosting/instances/:id/health (for Dashboard — requires ownership)
export const getHealthStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Instance not found', 404)

        return ok(c, {
            report: instance.lastHealthReport || null,
            lastCheck: instance.lastHealthAt || null,
            autoHeal: instance.autoHeal !== false, // default true
        }, 'Health status')
    } catch (err) {
        console.error('getHealthStatus error:', err)
        return fail(c, 'Failed to get health', 500)
    }
}

// PATCH /hosting/instances/:id/auto-heal (toggle — requires ownership)
export const toggleAutoHeal = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ enabled: boolean }>()

        await db.update(instances).set({
            autoHeal: body.enabled,
        }).where(eq(instances.id, instanceId))

        return ok(c, { autoHeal: body.enabled }, body.enabled ? 'Auto-heal enabled' : 'Auto-heal disabled')
    } catch (err) {
        console.error('toggleAutoHeal error:', err)
        return fail(c, 'Failed to toggle', 500)
    }
}
