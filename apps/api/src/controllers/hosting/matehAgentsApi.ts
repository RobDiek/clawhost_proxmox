/**
 * Phase 2.4 — user-facing endpoints for multi-MATEH agent management.
 *
 * All endpoints require JWT auth + user.agency_mode_enabled = true (gated
 * by requireAgency helper). Allows agency users to:
 *   - GET    /hosting/me/agents               list ALL my agents (across VPS+tenants)
 *   - GET    /hosting/me/agents/:agentId      single agent + tenant + VPS info
 *   - POST   /hosting/me/agents               create new MATEH on existing VPS
 *   - DELETE /hosting/me/agents/:agentId      terminate (rejects primary)
 *
 * Scoping: agents are owned (transitively) via instances.userId. We join
 * mateh_agents → instances → users to filter by JWT user. No way to access
 * other users' agents from this surface.
 */

import type { Context } from 'hono'
import { eq, and, asc, sql } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from '@/db'
import { matehAgents, instances, users, tenants } from '@/db/schema'
import { provisionSecondaryAgent, terminateSecondaryAgent } from '@/services/matehAgentProvisioner'

const jwtSecret = process.env.JWT_SECRET || ''

const ok = (c: Context, data: unknown, message = 'OK') =>
    c.json({ success: true, data, message })
const fail = (c: Context, message: string, status: number = 400) =>
    c.json({ success: false, message }, status as 400)

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try { return JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { return null }
}

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
    if (!u.enabled) return { error: fail(c, 'Agency mode is not enabled for your account.', 403) }
    return { userId }
}

// ─── List all my agents ───────────────────────────────────────────────────

export const listMyAgents = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error

    const rows = await db
        .select({
            id: matehAgents.id,
            vpsInstanceId: matehAgents.vpsInstanceId,
            tenantId: matehAgents.tenantId,
            tenantName: tenants.name,
            agentType: matehAgents.agentType,
            name: matehAgents.name,
            brandSlug: matehAgents.brandSlug,
            subdomainAgent: matehAgents.subdomainAgent,
            gatewayPort: matehAgents.gatewayPort,
            status: matehAgents.status,
            isPrimary: matehAgents.isPrimary,
            hasOwnAiKey: sql<boolean>`${matehAgents.aiProviderKey} IS NOT NULL`,
            createdAt: matehAgents.createdAt,
        })
        .from(matehAgents)
        .innerJoin(instances, eq(instances.id, matehAgents.vpsInstanceId))
        .leftJoin(tenants, eq(tenants.id, matehAgents.tenantId))
        .where(eq(instances.userId, r.userId))
        .orderBy(asc(matehAgents.createdAt))

    return ok(c, rows, 'Agents listed.')
}

// ─── Get single agent ────────────────────────────────────────────────────

export const getMyAgent = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('agentId')

    const [row] = await db
        .select({
            agent: matehAgents,
            instance: instances,
            tenant: tenants,
        })
        .from(matehAgents)
        .innerJoin(instances, eq(instances.id, matehAgents.vpsInstanceId))
        .leftJoin(tenants, eq(tenants.id, matehAgents.tenantId))
        .where(and(eq(matehAgents.id, id), eq(instances.userId, r.userId)))

    if (!row) return fail(c, 'Agent not found', 404)
    return ok(c, row, 'Agent fetched.')
}

// ─── Create new agent ────────────────────────────────────────────────────

export const createMyAgent = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const raw = await c.req.json().catch(() => ({})) as Record<string, unknown>

    const vpsInstanceId = typeof raw.vpsInstanceId === 'string' ? raw.vpsInstanceId : null
    const tenantId = typeof raw.tenantId === 'string' ? raw.tenantId : null
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null
    const brandSlugRaw = typeof raw.brandSlug === 'string' ? raw.brandSlug : null
    const agentType = (raw.agentType === 'oc' || raw.agentType === 'bare') ? raw.agentType : 'mateh'

    if (!vpsInstanceId) return fail(c, 'vpsInstanceId is required')
    if (!name) return fail(c, 'name is required')

    // Validate VPS belongs to user
    const [vps] = await db.select().from(instances).where(eq(instances.id, vpsInstanceId))
    if (!vps) return fail(c, 'VPS not found', 404)
    if (vps.userId !== r.userId) return fail(c, 'VPS not yours', 403)

    // Validate tenant if given
    if (tenantId) {
        const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
        if (!t) return fail(c, 'Tenant not found', 404)
        if (t.managedByUserId !== r.userId) return fail(c, 'Tenant not yours', 403)
    }

    // Sanitize brand slug — applied to BOTH user-provided and auto-derived
    // input. Whatever the user typed (URL, Hebrew, slashes, dots) is forced
    // to lowercase a-z0-9 + dashes, capped at 32 chars. Empty result falls
    // back to 'agent'. This is what becomes part of the subdomain + nginx
    // server_name + filesystem path → must be strict.
    function slugify(input: string): string {
        let s = input.toLowerCase().trim()
        // Strip URL scheme if user pasted a URL
        s = s.replace(/^https?:\/\//, '')
        // Replace non-alphanum runs with single dash
        s = s.replace(/[^a-z0-9]+/g, '-')
        // Trim leading/trailing dashes
        s = s.replace(/^-+|-+$/g, '')
        // Cap length (DNS labels max 63, leave headroom)
        s = s.substring(0, 32).replace(/-+$/g, '')
        return s
    }
    const brandSlug = slugify(brandSlugRaw || name) || 'agent'
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(brandSlug)) {
        return fail(c, `Invalid brand slug "${brandSlug}" — must be a-z0-9 with dashes only.`)
    }

    // Run provisioner — fire and forget would be nice, but we want to
    // return the agent id and initial state. Provisioner runs ~30-60s; we
    // wait for it to finish and return the result. Frontend shows a
    // pending card via _pendingAgents UI helper while this is running.
    try {
        const result = await provisionSecondaryAgent({
            vpsInstanceId,
            tenantId,
            name,
            brandSlug,
            agentType: agentType as 'mateh' | 'oc' | 'bare',
        })
        return ok(c, result, 'Agent provisioning kicked off (poll status for completion).')
    } catch (err) {
        return fail(c, `Provisioning failed: ${(err as Error).message}`, 500)
    }
}

// ─── Update agent (rename, switch tenant, set keys, telegram) ─────────────
//
// Settings panel for a secondary mateh_agent. Caller is the agency user
// who owns the underlying VPS. Allows editing:
//   - name (display name in dashboard)
//   - tenantId (move between tenants — must be one of user's tenants)
//   - aiProviderKey (per-agent override; null = use tenant default)
//   - telegramBotToken / telegramChatId
//   - autoHeal toggle
//
// Sensitive values: when input is empty string we clear (set null);
// when input is omitted (undefined) we keep current; non-empty replaces.

export const updateMyAgent = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('agentId')
    const raw = await c.req.json().catch(() => ({})) as Record<string, unknown>

    // Verify ownership
    const [row] = await db
        .select({ agent: matehAgents, instanceUserId: instances.userId })
        .from(matehAgents)
        .innerJoin(instances, eq(instances.id, matehAgents.vpsInstanceId))
        .where(eq(matehAgents.id, id))
    if (!row) return fail(c, 'Agent not found', 404)
    if (row.instanceUserId !== r.userId) return fail(c, 'Agent not yours', 403)

    const updates: Partial<typeof matehAgents.$inferInsert> = { updatedAt: new Date() }

    if (typeof raw.name === 'string' && raw.name.trim()) {
        updates.name = raw.name.trim()
    }
    if (raw.tenantId !== undefined) {
        if (raw.tenantId === null || raw.tenantId === '') {
            updates.tenantId = null
        } else if (typeof raw.tenantId === 'string') {
            // Validate tenant ownership
            const [t] = await db.select().from(tenants).where(eq(tenants.id, raw.tenantId))
            if (!t) return fail(c, 'Tenant not found', 404)
            if (t.managedByUserId !== r.userId) return fail(c, 'Tenant not yours', 403)
            updates.tenantId = raw.tenantId
        }
    }
    // Sensitive keys: '' clears, undefined keeps, value replaces.
    for (const k of ['aiProviderKey', 'telegramBotToken', 'telegramChatId'] as const) {
        if (raw[k] !== undefined) {
            const v = raw[k]
            if (v === null || v === '') updates[k] = null
            else if (typeof v === 'string') updates[k] = v
        }
    }
    if (typeof raw.autoHeal === 'boolean') updates.autoHeal = raw.autoHeal

    await db.update(matehAgents).set(updates).where(eq(matehAgents.id, id))
    const [updated] = await db.select().from(matehAgents).where(eq(matehAgents.id, id))
    return ok(c, updated, 'Agent updated.')
}

// ─── Delete agent ────────────────────────────────────────────────────────

export const deleteMyAgent = async (c: Context) => {
    const r = await requireAgency(c)
    if ('error' in r) return r.error
    const id = c.req.param('agentId')

    const [row] = await db
        .select({ agent: matehAgents, instanceUserId: instances.userId })
        .from(matehAgents)
        .innerJoin(instances, eq(instances.id, matehAgents.vpsInstanceId))
        .where(eq(matehAgents.id, id))

    if (!row) return fail(c, 'Agent not found', 404)
    if (row.instanceUserId !== r.userId) return fail(c, 'Agent not yours', 403)
    if (row.agent.isPrimary) {
        return fail(c, 'Cannot delete primary agent — terminate the VPS instead.', 409)
    }

    try {
        await terminateSecondaryAgent(id)
        return ok(c, { id }, 'Agent terminated.')
    } catch (err) {
        return fail(c, `Termination failed: ${(err as Error).message}`, 500)
    }
}