import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import telegram from '@/services/telegram'

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

// POST /hosting/instances/:id/health-report (no auth — called from client VPS)
export const healthReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<HealthReport>()

        // Validate instance exists
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Unknown instance', 404)

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

        // Send alerts
        if (alerts.length > 0) {
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

        return ok(c, null, 'ok')
    } catch (err) {
        console.error('healthReport error:', err)
        return ok(c, null, 'ok') // Don't fail — health daemon should not get errors
    }
}

// GET /hosting/instances/:id/health (for Dashboard)
export const getHealthStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
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

// PATCH /hosting/instances/:id/auto-heal (toggle)
export const toggleAutoHeal = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
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
