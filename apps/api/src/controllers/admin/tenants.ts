/**
 * Phase 1 — Tenant CRUD for the admin panel.
 *
 * Tenants are an org-level grouping between User and Instance, supporting
 * agencies that manage multiple clients on a single VPS (Sergei's master:
 * Flowmatic + ClientA's 3 MATEH all under one user but different tenants).
 *
 * Endpoints (mounted at /admin/tenants/*):
 *   GET    /admin/tenants              — list all tenants with instance counts
 *   GET    /admin/tenants/:id          — single tenant + assigned instances
 *   POST   /admin/tenants              — create a tenant (assigned to a user)
 *   PATCH  /admin/tenants/:id          — update name/desc/keys/MIFKADA flags
 *   DELETE /admin/tenants/:id          — delete (only if no instances)
 *   POST   /admin/tenants/:id/assign   — move an instance into this tenant
 *
 * Auth: all routes require requireAdmin2FA (mounted in routes/admin.ts).
 */

import type { Context } from 'hono'
import { eq, sql, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { tenants, instances, users, adminAudit } from '@/db/schema'

// Local response helpers (mirror admin/index.ts shape).
const ok = (c: Context, data: unknown, message = 'OK') =>
    c.json({ success: true, data, message })
const fail = (c: Context, message: string, status: number = 400) =>
    c.json({ success: false, message }, status as 400)

function getAdminEmail(c: Context): string {
    return (c.get('admin_email') as string) || 'unknown'
}

async function audit(_adminEmail: string, action: string, target: string, meta?: Record<string, unknown>): Promise<void> {
    try {
        await db.insert(adminAudit).values({
            action,
            targetType: 'tenant',
            targetId: target,
            details: (meta || null) as never,
        })
    } catch {
        // Audit failures should never block the action.
    }
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

// ─── List tenants ─────────────────────────────────────────────────────────

export const adminListTenants = async (c: Context) => {
    // Returns tenants with their managing-user email + count of assigned
    // instances. Useful for the admin UI list view.
    const rows = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            description: tenants.description,
            kind: tenants.kind,
            managedByUserId: tenants.managedByUserId,
            managedByEmail: users.email,
            mifkadaEnabled: tenants.mifkadaEnabled,
            mifkadaScope: tenants.mifkadaScope,
            isActive: tenants.isActive,
            hasDefaultAnthropicKey: sql<boolean>`${tenants.defaultAnthropicKey} IS NOT NULL`,
            hasDefaultOpenaiKey: sql<boolean>`${tenants.defaultOpenaiKey} IS NOT NULL`,
            instanceCount: sql<number>`(SELECT count(*) FROM ${instances} WHERE ${instances.tenantId} = ${tenants.id})`,
            createdAt: tenants.createdAt,
            updatedAt: tenants.updatedAt,
        })
        .from(tenants)
        .leftJoin(users, eq(users.id, tenants.managedByUserId))
        .orderBy(asc(tenants.createdAt))
    return ok(c, rows, 'Tenants listed.')
}

// ─── Get one tenant + its instances ───────────────────────────────────────

export const adminGetTenant = async (c: Context) => {
    const id = c.req.param('id')
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id))
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
        .where(eq(instances.tenantId, id))
        .orderBy(asc(instances.createdAt))

    return ok(c, { tenant: t, instances: tenantInstances }, 'Tenant fetched.')
}

// ─── Create tenant ────────────────────────────────────────────────────────

export const adminCreateTenant = async (c: Context) => {
    const raw = await c.req.json<JsonBody>().catch((): JsonBody => ({}))
    const managedByUserId = asString(raw.managedByUserId)
    const name = asString(raw.name)
    const description = asString(raw.description)
    const kind = asEnum(raw.kind, ['own', 'managed'] as const)
    const defaultAnthropicKey = asString(raw.defaultAnthropicKey)
    const defaultOpenaiKey = asString(raw.defaultOpenaiKey)
    const mifkadaEnabled = asBool(raw.mifkadaEnabled)
    const mifkadaScope = asEnum(raw.mifkadaScope, ['tenant', 'vps'] as const)

    if (!managedByUserId || !name) {
        return fail(c, 'managedByUserId and name are required.')
    }

    const [user] = await db.select().from(users).where(eq(users.id, managedByUserId))
    if (!user) return fail(c, 'Managing user not found.', 404)

    const tenantId = 'tn_' + nanoid(12)
    await db.insert(tenants).values({
        id: tenantId,
        managedByUserId,
        name,
        description: description ?? null,
        kind: kind ?? 'own',
        defaultAnthropicKey: defaultAnthropicKey ?? null,
        defaultOpenaiKey: defaultOpenaiKey ?? null,
        mifkadaEnabled: mifkadaEnabled ?? false,
        mifkadaScope: mifkadaScope ?? 'tenant',
        isActive: true,
    })

    await audit(getAdminEmail(c), 'tenant.create', tenantId, {
        managedByUserId, name, kind: kind ?? 'own',
    })

    const [created] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    return ok(c, created, 'Tenant created.')
}

// ─── Update tenant ────────────────────────────────────────────────────────

export const adminUpdateTenant = async (c: Context) => {
    const id = c.req.param('id')
    const raw = await c.req.json<JsonBody>().catch((): JsonBody => ({}))

    const [existing] = await db.select().from(tenants).where(eq(tenants.id, id))
    if (!existing) return fail(c, 'Tenant not found.', 404)

    const updates: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() }
    const name = asString(raw.name); if (name !== undefined) updates.name = name
    const description = asString(raw.description); if (description !== undefined) updates.description = description
    const kind = asEnum(raw.kind, ['own', 'managed'] as const); if (kind !== undefined) updates.kind = kind
    const dak = asStringOrNull(raw.defaultAnthropicKey); if (dak !== undefined) updates.defaultAnthropicKey = dak
    const dok = asStringOrNull(raw.defaultOpenaiKey); if (dok !== undefined) updates.defaultOpenaiKey = dok
    const me = asBool(raw.mifkadaEnabled); if (me !== undefined) updates.mifkadaEnabled = me
    const ms = asEnum(raw.mifkadaScope, ['tenant', 'vps'] as const); if (ms !== undefined) updates.mifkadaScope = ms
    const ia = asBool(raw.isActive); if (ia !== undefined) updates.isActive = ia

    await db.update(tenants).set(updates).where(eq(tenants.id, id))

    // Mask key values in audit (log presence flag, not actual key).
    const auditMeta: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(updates)) {
        if (k === 'defaultAnthropicKey' || k === 'defaultOpenaiKey') {
            auditMeta[`set_${k}`] = v !== null
        } else {
            auditMeta[k] = v
        }
    }
    await audit(getAdminEmail(c), 'tenant.update', id, auditMeta)

    const [updated] = await db.select().from(tenants).where(eq(tenants.id, id))
    return ok(c, updated, 'Tenant updated.')
}

// ─── Delete tenant ────────────────────────────────────────────────────────

export const adminDeleteTenant = async (c: Context) => {
    const id = c.req.param('id')

    const [t] = await db.select().from(tenants).where(eq(tenants.id, id))
    if (!t) return fail(c, 'Tenant not found.', 404)

    // Block delete if any instances are still assigned.
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(instances)
        .where(eq(instances.tenantId, id))
    if (count > 0) {
        return fail(c, `Cannot delete: ${count} instance(s) still assigned. Reassign them first.`, 409)
    }

    await db.delete(tenants).where(eq(tenants.id, id))
    await audit(getAdminEmail(c), 'tenant.delete', id, { name: t.name })
    return ok(c, { id }, 'Tenant deleted.')
}

// ─── Assign instance to tenant ────────────────────────────────────────────

export const adminAssignInstanceToTenant = async (c: Context) => {
    const tenantId = c.req.param('id')
    const raw = await c.req.json().catch(() => ({}))
    const instanceId = typeof raw?.instanceId === 'string' ? raw.instanceId : null
    if (!instanceId) return fail(c, 'instanceId is required.')

    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    if (!t) return fail(c, 'Tenant not found.', 404)
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return fail(c, 'Instance not found.', 404)

    // Sanity: the tenant's managing user should own (or have access to) this
    // instance. For now we enforce that the instance.userId == tenant.managedByUserId.
    // In a future "admin transfer between users" flow this could relax.
    if (inst.userId !== t.managedByUserId) {
        return fail(c, `Instance owner (${inst.userId}) ≠ tenant manager (${t.managedByUserId}). Reassign instance to user first if intentional.`, 409)
    }

    const previousTenantId = inst.tenantId
    await db.update(instances).set({ tenantId }).where(eq(instances.id, instanceId))
    await audit(getAdminEmail(c), 'tenant.assign_instance', tenantId, {
        instanceId,
        previousTenantId,
    })

    return ok(c, { instanceId, tenantId, previousTenantId }, 'Instance assigned to tenant.')
}

// ─── List unassigned instances (for picking in admin UI) ──────────────────

export const adminListUnassignedInstances = async (c: Context) => {
    const userId = c.req.query('userId')
    if (!userId) return fail(c, 'userId query param required.')

    const rows = await db
        .select({
            id: instances.id,
            status: instances.status,
            planKey: instances.planKey,
            ip: instances.ip,
            subdomainAgent: instances.subdomainAgent,
            tenantId: instances.tenantId,
            currentTenantName: tenants.name,
            createdAt: instances.createdAt,
        })
        .from(instances)
        .leftJoin(tenants, eq(tenants.id, instances.tenantId))
        .where(eq(instances.userId, userId))
        .orderBy(asc(instances.createdAt))
    return ok(c, rows, 'User instances listed.')
}