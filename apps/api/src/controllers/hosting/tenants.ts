/**
 * Phase 1.5 — User-facing tenant management.
 *
 * When user.agency_mode_enabled = true, the user can manage their own
 * tenants from their dashboard (create/list/edit/delete + assign their
 * own instances). All these endpoints check the flag and return 403 if
 * the user is not an agency.
 *
 * Endpoints (mounted at /hosting/me/tenants/* with JWT auth):
 *   GET    /hosting/me/tenants                — list MY tenants
 *   GET    /hosting/me/tenants/:id            — single tenant + instances
 *   POST   /hosting/me/tenants                — create
 *   PATCH  /hosting/me/tenants/:id            — update
 *   DELETE /hosting/me/tenants/:id            — delete (only if empty)
 *   POST   /hosting/me/tenants/:id/assign     — move my instance into tenant
 *
 * Scoping: all queries filter by tenant.managedByUserId == jwtUser.id.
 * No way to access other users' tenants from this surface.
 */

import type { Context } from 'hono'
import { eq, sql, asc, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import { db } from '@/db'
import { tenants, instances, users } from '@/db/schema'

const jwtSecret = process.env.JWT_SECRET || ''

// Inline HMAC-SHA256 JWT verifier — mirrors hosting/auth.ts pattern. Kept
// local to avoid circular imports between controllers/hosting/*.ts.
function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try { return JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { return null }
}

const ok = (c: Context, data: unknown, message = 'OK') =>
    c.json({ success: true, data, message })
const fail = (c: Context, message: string, status: number = 400) =>
    c.json({ success: false, message }, status as 400)

async function requireAgency(c: Context): Promise<{ userId: string } | { error: Response }> {
    const auth = c.req.header('Authorization') || ''
    if (!auth.startsWith('Bearer ')) return { error: fail(c, 'Unauthorized', 401) }
    const payload = verifyJwt(auth.slice(7), jwtSecret)
    if (!payload || !payload.sub) return { error: fail(c, 'Invalid token', 401) }
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
        return { error: fail(c, 'Token expired', 401) }
    }
    const userId = payload.sub as string
    const [u] = await db.select({ enabled: users.agencyModeEnabled }).from(users).where(eq(users.id, userId))
    if (!u) return { error: fail(c, 'User not found', 404) }
    if (!u.enabled) return { error: fail(c, 'Agency mode is not enabled for your account. Contact support.', 403) }
    return { userId }
}

type JsonBody = Record<string, unknown>
function asString(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined
}
function asStringOrNull(v: unknown): string | null | undefined {
    if (v === null) return null
    return asString(v)
}
function asBool(v: unknown): boolean | undefined {
    return typeof v === 'boolean' ? v : undefined
}
function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

// ─── List my tenants ──────────────────────────────────────────────────────

export const listMyTenants = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error

    const rows = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            description: tenants.description,
            kind: tenants.kind,
            mifkadaEnabled: tenants.mifkadaEnabled,
            mifkadaScope: tenants.mifkadaScope,
            isActive: tenants.isActive,
            hasDefaultAnthropicKey: sql<boolean>`${tenants.defaultAnthropicKey} IS NOT NULL`,
            instanceCount: sql<number>`(SELECT count(*) FROM ${instances} WHERE ${instances.tenantId} = ${tenants.id})`,
            createdAt: tenants.createdAt,
            updatedAt: tenants.updatedAt,
        })
        .from(tenants)
        .where(eq(tenants.managedByUserId, r.userId))
        .orderBy(asc(tenants.createdAt))
    return ok(c, rows, 'Tenants listed.')
}

// ─── Get one of my tenants + my instances inside it ──────────────────────

export const getMyTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('id')

    const [t] = await db.select().from(tenants).where(and(eq(tenants.id, id), eq(tenants.managedByUserId, r.userId)))
    if (!t) return fail(c, 'Tenant not found.', 404)

    const tenantInstances = await db
        .select({
            id: instances.id,
            status: instances.status,
            planKey: instances.planKey,
            ip: instances.ip,
            subdomainAgent: instances.subdomainAgent,
            isMaster: instances.isMaster,
            hasOwnAiKey: sql<boolean>`${instances.aiProviderKey} IS NOT NULL`,
            createdAt: instances.createdAt,
        })
        .from(instances)
        .where(and(eq(instances.tenantId, id), eq(instances.userId, r.userId)))
        .orderBy(asc(instances.createdAt))

    return ok(c, { tenant: t, instances: tenantInstances }, 'Tenant fetched.')
}

// ─── Create a tenant under my user ───────────────────────────────────────

export const createMyTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const raw = await c.req.json<JsonBody>().catch((): JsonBody => ({}))

    const name = asString(raw.name)
    if (!name) return fail(c, 'name is required.')

    const description = asString(raw.description)
    const kind = asEnum(raw.kind, ['own', 'managed'] as const)
    const defaultAnthropicKey = asString(raw.defaultAnthropicKey)
    const defaultOpenaiKey = asString(raw.defaultOpenaiKey)
    const mifkadaEnabled = asBool(raw.mifkadaEnabled)
    const mifkadaScope = asEnum(raw.mifkadaScope, ['tenant'] as const) // user can only set 'tenant', 'vps' is admin-only

    const tenantId = 'tn_' + nanoid(12)
    await db.insert(tenants).values({
        id: tenantId,
        managedByUserId: r.userId,
        name,
        description: description ?? null,
        kind: kind ?? 'managed',
        defaultAnthropicKey: defaultAnthropicKey ?? null,
        defaultOpenaiKey: defaultOpenaiKey ?? null,
        mifkadaEnabled: mifkadaEnabled ?? false,
        mifkadaScope: mifkadaScope ?? 'tenant',
        isActive: true,
    })

    const [created] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    return ok(c, created, 'Tenant created.')
}

// ─── Update my tenant ─────────────────────────────────────────────────────

export const updateMyTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('id')
    const raw = await c.req.json<JsonBody>().catch((): JsonBody => ({}))

    const [existing] = await db.select().from(tenants).where(and(eq(tenants.id, id), eq(tenants.managedByUserId, r.userId)))
    if (!existing) return fail(c, 'Tenant not found.', 404)

    const updates: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() }
    const name = asString(raw.name); if (name !== undefined) updates.name = name
    const description = asString(raw.description); if (description !== undefined) updates.description = description
    const kind = asEnum(raw.kind, ['own', 'managed'] as const); if (kind !== undefined) updates.kind = kind
    const dak = asStringOrNull(raw.defaultAnthropicKey); if (dak !== undefined) updates.defaultAnthropicKey = dak
    const dok = asStringOrNull(raw.defaultOpenaiKey); if (dok !== undefined) updates.defaultOpenaiKey = dok
    const me = asBool(raw.mifkadaEnabled); if (me !== undefined) updates.mifkadaEnabled = me
    // User can NOT set mifkada_scope='vps' — only admin can promote to vps scope.
    const ms = asEnum(raw.mifkadaScope, ['tenant'] as const); if (ms !== undefined) updates.mifkadaScope = ms
    const ia = asBool(raw.isActive); if (ia !== undefined) updates.isActive = ia

    await db.update(tenants).set(updates).where(eq(tenants.id, id))
    const [updated] = await db.select().from(tenants).where(eq(tenants.id, id))
    return ok(c, updated, 'Tenant updated.')
}

// ─── Delete my tenant ─────────────────────────────────────────────────────

export const deleteMyTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('id')

    const [t] = await db.select().from(tenants).where(and(eq(tenants.id, id), eq(tenants.managedByUserId, r.userId)))
    if (!t) return fail(c, 'Tenant not found.', 404)

    const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(instances)
        .where(eq(instances.tenantId, id))
    if (count > 0) {
        return fail(c, `Cannot delete: ${count} instance(s) still assigned. Reassign them first.`, 409)
    }

    await db.delete(tenants).where(eq(tenants.id, id))
    return ok(c, { id }, 'Tenant deleted.')
}

// ─── Assign my instance to my tenant ─────────────────────────────────────

export const assignInstanceToMyTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const tenantId = c.req.param('id')
    const raw = await c.req.json().catch(() => ({}))
    const instanceId = typeof raw?.instanceId === 'string' ? raw.instanceId : null
    if (!instanceId) return fail(c, 'instanceId is required.')

    const [t] = await db.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.managedByUserId, r.userId)))
    if (!t) return fail(c, 'Tenant not found.', 404)

    const [inst] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, r.userId)))
    if (!inst) return fail(c, 'Instance not found or not yours.', 404)

    const previousTenantId = inst.tenantId
    await db.update(instances).set({ tenantId }).where(eq(instances.id, instanceId))

    return ok(c, { instanceId, tenantId, previousTenantId }, 'Instance assigned.')
}

// ─── List MY instances (helper for the dashboard tenant filter + assign UI) ──
//
// Returns: every instance the user owns, with their current tenant info.
// Used to populate the assign-modal picker and the dashboard tenant filter.

export const listMyInstancesWithTenant = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error

    const rows = await db
        .select({
            id: instances.id,
            status: instances.status,
            planKey: instances.planKey,
            subdomainAgent: instances.subdomainAgent,
            tenantId: instances.tenantId,
            tenantName: tenants.name,
            createdAt: instances.createdAt,
        })
        .from(instances)
        .leftJoin(tenants, eq(tenants.id, instances.tenantId))
        .where(eq(instances.userId, r.userId))
        .orderBy(asc(instances.createdAt))

    return ok(c, rows, 'Instances listed.')
}