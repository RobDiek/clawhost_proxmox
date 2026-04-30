/**
 * admin.flowmatic.co.il controllers — single-file barrel.
 * Routes mounted at /admin/* by routes/admin.ts. All non-/admin/auth/*
 * routes require requireAdmin2FA() middleware.
 */

import type { Context, Next } from 'hono'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from '@/db'
import { instances, users, payments, adminAudit, adminSnapshots, adminUsers } from '@/db/schema'
import {
    sendEmailOtp, verifyEmailOtp, generateTotpSetup, confirmTotpSetup,
    verifyTotp, verifyAdminJwt, revokeSession, writeAudit, listAudit, ADMIN_EMAIL,
} from '@/services/adminAuth'

// ─── Response helpers ────────────────────────────────────────────────────
const ok = (c: Context, data: any, message = 'OK') => c.json({ success: true, data, message })
const fail = (c: Context, message: string, status = 400) => c.json({ success: false, message }, status as any)

function getIp(c: Context): string {
    return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

// ─── Middleware ──────────────────────────────────────────────────────────

export const requireAdmin2FA = async (c: Context, next: Next) => {
    const auth = c.req.header('authorization') || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    if (!token) return c.json({ success: false, message: 'No admin token' }, 401)
    const r = await verifyAdminJwt(token, getIp(c))
    if (!r.ok) return c.json({ success: false, message: r.reason || 'Unauthorized' }, 401)
    c.set('adminId' as any, r.adminId)
    c.set('adminToken' as any, token)
    await next()
}

// ─── Auth flow ───────────────────────────────────────────────────────────

export const adminSendOtp = async (c: Context) => {
    try {
        const body = await c.req.json<{ email?: string }>().catch(() => ({} as any))
        if (!body.email) return fail(c, 'email required', 400)
        await sendEmailOtp(body.email)
        return ok(c, { sent: true }, 'If email is whitelisted, code was sent.')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminVerifyOtp = async (c: Context) => {
    try {
        const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({} as any))
        if (!body.email || !body.code) return fail(c, 'email + code required', 400)
        const r = await verifyEmailOtp(body.email, body.code)
        if (!r.ok) return fail(c, r.reason || 'Verification failed', 401)
        return ok(c, {
            needsTotpSetup: r.needsTotpSetup,
            totpRequired: r.totpRequired,
            intermediateToken: r.intermediateToken,
        })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminTotpSetupQr = async (c: Context) => {
    try {
        const body = await c.req.json<{ intermediateToken?: string }>().catch(() => ({} as any))
        if (!body.intermediateToken) return fail(c, 'intermediateToken required', 400)
        const r = await generateTotpSetup(body.intermediateToken)
        if (!r.ok) return fail(c, r.reason || 'Setup failed', 401)
        return ok(c, {
            otpauthUri: r.otpauthUri,
            qrDataUrl: r.qrDataUrl,
            secret: r.secret,  // user can manually paste if QR scanner won't read
        })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminTotpSetupConfirm = async (c: Context) => {
    try {
        const body = await c.req.json<{ intermediateToken?: string; code?: string }>().catch(() => ({} as any))
        if (!body.intermediateToken || !body.code) return fail(c, 'intermediateToken + code required', 400)
        const ip = getIp(c); const ua = c.req.header('user-agent') || ''
        const r = await confirmTotpSetup(body.intermediateToken, body.code, ip, ua)
        if (!r.ok) return fail(c, r.reason || 'Setup verification failed', 401)
        return ok(c, { jwt: r.jwt })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminTotpVerify = async (c: Context) => {
    try {
        const body = await c.req.json<{ intermediateToken?: string; code?: string }>().catch(() => ({} as any))
        if (!body.intermediateToken || !body.code) return fail(c, 'intermediateToken + code required', 400)
        const ip = getIp(c); const ua = c.req.header('user-agent') || ''
        const r = await verifyTotp(body.intermediateToken, body.code, ip, ua)
        if (!r.ok) return fail(c, r.reason || 'TOTP verification failed', 401)
        return ok(c, { jwt: r.jwt })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminLogout = async (c: Context) => {
    try {
        const token = c.get('adminToken' as any) as string
        const adminId = c.get('adminId' as any) as string
        if (token) await revokeSession(token)
        await writeAudit({ adminId, action: 'admin.logout', ip: getIp(c) })
        return ok(c, { loggedOut: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminMe = async (c: Context) => {
    try {
        const adminId = c.get('adminId' as any) as string
        const [a] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId))
        if (!a) return fail(c, 'admin not found', 404)
        return ok(c, { id: a.id, email: a.email, lastLoginAt: a.lastLoginAt })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// ─── Dashboard / KPIs ────────────────────────────────────────────────────

export const adminDashboard = async (c: Context) => {
    try {
        // KPI counts
        const allInstances = await db.select().from(instances)
        const running = allInstances.filter(i => i.status === 'running').length
        const initializing = allInstances.filter(i => i.status === 'initializing' || i.status === 'provisioning').length
        const suspended = allInstances.filter(i => i.status === 'suspended').length
        const failed = allInstances.filter(i => i.status === 'failed').length
        const terminated = allInstances.filter(i => i.status === 'terminated').length

        // MRR — sum priceIls of running instances (approx — assumes priceIls in instance row)
        const mrrRows = await db.execute(sql`
            SELECT COALESCE(SUM(price_ils::numeric), 0) AS mrr
            FROM instances
            WHERE status IN ('running', 'initializing', 'provisioning')
        `)
        const mrr = Number((mrrRows as any).rows?.[0]?.mrr || 0)

        // Recent payments (last 24h)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const recentPayments = await db.select().from(payments)
            .where(gte(payments.createdAt, yesterday))
            .orderBy(desc(payments.createdAt))
            .limit(20)

        // Recent failed installs
        const failedInstances = allInstances.filter(i => i.status === 'failed').slice(0, 10)

        return ok(c, {
            kpi: {
                runningInstances: running,
                initializingInstances: initializing,
                suspendedInstances: suspended,
                failedInstances: failed,
                terminatedInstances: terminated,
                totalUsers: (await db.select({ id: users.id }).from(users)).length,
                mrrIls: mrr,
                hetznerEstCostEur: running * 5,  // rough avg €5/instance/mo
            },
            recentPayments,
            failedInstances,
        })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// ─── Clients ─────────────────────────────────────────────────────────────

export const adminListClients = async (c: Context) => {
    try {
        const q = c.req.query('q') || ''
        const status = c.req.query('status') || ''
        const limit = Math.min(parseInt(c.req.query('limit') || '200'), 500)

        const rows = await db.select({
            instance: instances,
            user: users,
        }).from(instances)
            .leftJoin(users, eq(users.id, instances.userId))
            .orderBy(desc(instances.createdAt))
            .limit(limit)

        const filtered = rows.filter(r => {
            if (status && r.instance.status !== status) return false
            if (!q) return true
            const ql = q.toLowerCase()
            return (
                (r.user?.email || '').toLowerCase().includes(ql) ||
                (r.instance.id || '').toLowerCase().includes(ql) ||
                (r.user?.name || '').toLowerCase().includes(ql) ||
                (r.instance.subdomainName || '').toLowerCase().includes(ql)
            )
        })
        return ok(c, { clients: filtered, total: filtered.length })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminClientDetail = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)
        const [user] = inst.userId ? await db.select().from(users).where(eq(users.id, inst.userId)) : [null]
        const pays = await db.select().from(payments)
            .where(eq(payments.instanceId, id))
            .orderBy(desc(payments.createdAt))
            .limit(50)

        // Hetzner metrics (best-effort)
        let metrics: any = null
        if (inst.hetznerServerId) {
            try {
                const r = await fetch(`https://api.hetzner.cloud/v1/servers/${inst.hetznerServerId}`, {
                    headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
                })
                if (r.ok) metrics = await r.json()
            } catch { /* ignore */ }
        }

        return ok(c, { instance: inst, user, payments: pays, hetzner: metrics })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// ─── Lifecycle actions ───────────────────────────────────────────────────

async function hetznerAction(serverId: string | number, action: 'poweron' | 'poweroff' | 'shutdown' | 'reset' | 'reboot'): Promise<any> {
    const r = await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}/actions/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
    })
    if (!r.ok) throw new Error(`Hetzner ${action}: ${r.status} ${await r.text()}`)
    return await r.json()
}

async function hetznerCreateSnapshot(serverId: string | number, description: string): Promise<number> {
    const r = await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}/actions/create_image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'snapshot', description }),
    })
    if (!r.ok) throw new Error(`Snapshot: ${r.status} ${await r.text()}`)
    const j = await r.json() as any
    return j.image?.id
}

async function hetznerDeleteServer(serverId: string | number): Promise<void> {
    const r = await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}` },
    })
    if (!r.ok) throw new Error(`Delete server: ${r.status} ${await r.text()}`)
}

export const adminRestartInstance = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const adminId = c.get('adminId' as any) as string
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)
        if (!inst.hetznerServerId) return fail(c, 'No Hetzner server', 400)
        await hetznerAction(inst.hetznerServerId, 'reboot')
        await writeAudit({ adminId, action: 'admin.instance.restart', targetType: 'instance', targetId: id, ip: getIp(c) })
        return ok(c, { restarted: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminSuspendInstance = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const adminId = c.get('adminId' as any) as string
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)
        if (inst.hetznerServerId) await hetznerAction(inst.hetznerServerId, 'poweroff')
        await db.update(instances).set({ status: 'suspended', suspendedAt: new Date() } as any).where(eq(instances.id, id))
        await writeAudit({ adminId, action: 'admin.instance.suspend', targetType: 'instance', targetId: id, ip: getIp(c) })
        return ok(c, { suspended: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminResumeInstance = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const adminId = c.get('adminId' as any) as string
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)
        if (inst.hetznerServerId) await hetznerAction(inst.hetznerServerId, 'poweron')
        await db.update(instances).set({ status: 'running', suspendedAt: null } as any).where(eq(instances.id, id))
        await writeAudit({ adminId, action: 'admin.instance.resume', targetType: 'instance', targetId: id, ip: getIp(c) })
        return ok(c, { resumed: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminTerminateInstance = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const body = await c.req.json<{ confirm?: string; reason?: string; skipSnapshot?: boolean }>().catch(() => ({} as any))
        if (body.confirm !== id) return fail(c, 'Confirmation must equal the instance id', 400)
        const adminId = c.get('adminId' as any) as string
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)

        let snapshotId: number | null = null
        if (inst.hetznerServerId && !body.skipSnapshot) {
            try {
                snapshotId = await hetznerCreateSnapshot(
                    inst.hetznerServerId,
                    `pre-terminate ${id} by admin ${new Date().toISOString()}`,
                )
                await db.insert(adminSnapshots).values({
                    instanceId: id,
                    hetznerImageId: snapshotId,
                    reason: 'pre-terminate',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    createdBy: adminId,
                })
                // Wait briefly to ensure snapshot started before delete
                await new Promise(r => setTimeout(r, 5000))
            } catch (e) {
                console.warn('[admin.terminate] snapshot failed:', (e as Error).message)
            }
        }

        if (inst.hetznerServerId) {
            try { await hetznerDeleteServer(inst.hetznerServerId) }
            catch (e) { console.warn('[admin.terminate] delete server failed:', (e as Error).message) }
        }

        await db.update(instances).set({ status: 'terminated' } as any).where(eq(instances.id, id))

        await writeAudit({
            adminId,
            action: 'admin.instance.terminate',
            targetType: 'instance',
            targetId: id,
            details: { snapshotId, reason: body.reason || '', skipSnapshot: !!body.skipSnapshot },
            ip: getIp(c),
        })

        return ok(c, { terminated: true, snapshotId })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminResetCredentials = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const adminId = c.get('adminId' as any) as string
        const newToken = crypto.randomBytes(32).toString('hex')
        const newAutoPwd = crypto.randomBytes(12).toString('base64').replace(/[/+=]/g, '').slice(0, 16)
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst) return fail(c, 'Instance not found', 404)
        await db.update(instances).set({
            openclawToken: newToken,
            automationPassword: newAutoPwd,
        } as any).where(eq(instances.id, id))
        await writeAudit({
            adminId, action: 'admin.instance.reset_credentials',
            targetType: 'instance', targetId: id, ip: getIp(c),
        })
        return ok(c, { newToken, newAutomationPassword: newAutoPwd })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminSendCustomEmail = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const body = await c.req.json<{ subject?: string; bodyHtml?: string; bodyText?: string }>().catch(() => ({} as any))
        if (!body.subject || (!body.bodyHtml && !body.bodyText)) return fail(c, 'subject + body required', 400)
        const adminId = c.get('adminId' as any) as string
        const [inst] = await db.select().from(instances).where(eq(instances.id, id))
        if (!inst?.userId) return fail(c, 'Instance/user not found', 404)
        const [user] = await db.select().from(users).where(eq(users.id, inst.userId))
        if (!user?.email) return fail(c, 'No user email', 404)

        const { getResend, FROM_EMAIL } = await import('@/services/resend')
        await getResend().emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: body.subject,
            html: body.bodyHtml || (body.bodyText || '').replace(/\n/g, '<br>'),
            text: body.bodyText || (body.bodyHtml || '').replace(/<[^>]+>/g, ''),
        })
        await writeAudit({ adminId, action: 'admin.instance.send_email', targetType: 'instance', targetId: id, details: { to: user.email, subject: body.subject }, ip: getIp(c) })
        return ok(c, { sent: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// ─── Revenue ─────────────────────────────────────────────────────────────

export const adminListPayments = async (c: Context) => {
    try {
        const days = parseInt(c.req.query('days') || '90')
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        const rows = await db.select().from(payments)
            .where(gte(payments.createdAt, since))
            .orderBy(desc(payments.createdAt))
            .limit(500)
        return ok(c, { payments: rows })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminRefundPayment = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const body = await c.req.json<{ confirm?: string; reason?: string }>().catch(() => ({} as any))
        if (body.confirm !== id) return fail(c, 'Confirmation required (echo payment id)', 400)
        const adminId = c.get('adminId' as any) as string

        const [pay] = await db.select().from(payments).where(eq(payments.id, id))
        if (!pay) return fail(c, 'Payment not found', 404)
        if (pay.status === 'refunded') return fail(c, 'Already refunded', 400)
        if (!pay.allpayOrderId) return fail(c, 'No AllPay orderId on this payment', 400)

        // AllPay refund — best-effort (some sandboxes return 200 with 'pending')
        try {
            const { AllPayService } = await import('@/services/allpay')
            const svc = new AllPayService()
            await svc.refund(pay.allpayOrderId, Number(pay.amountIls || 0))
        } catch (e) {
            console.warn('[admin.refund] AllPay error:', (e as Error).message)
            // Continue — mark as refunded in DB regardless so we don't double-refund on retry
        }

        await db.update(payments).set({ status: 'refunded' } as any).where(eq(payments.id, id))
        await writeAudit({
            adminId, action: 'admin.payment.refund',
            targetType: 'payment', targetId: id,
            details: { reason: body.reason || '', amount: pay.amountIls },
            ip: getIp(c),
        })
        return ok(c, { refunded: true })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// ─── Audit ───────────────────────────────────────────────────────────────

export const adminListAudit = async (c: Context) => {
    try {
        const limit = Math.min(parseInt(c.req.query('limit') || '200'), 1000)
        const rows = await listAudit(limit)
        return ok(c, { audit: rows })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}
