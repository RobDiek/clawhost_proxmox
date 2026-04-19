/**
 * Creative Performance Controller (Phase B5)
 *
 * Endpoints:
 *   POST   .../creative/mappings                    — attach platform_creative_id to a render
 *   GET    .../creative/mappings                    — list all mappings for instance
 *   DELETE .../creative/mappings/:mappingId         — detach
 *   GET    .../creative/performance                  — aggregated performance (all renders)
 *   GET    .../creative/performance/:renderId       — time-series for one render
 *   POST   .../creative/performance/sync             — manual trigger (admin/debug)
 *   GET    .../creative/fatigue-alerts               — open fatigue alerts
 *   PATCH  .../creative/fatigue-alerts/:alertId      — dismiss alert with reason
 */

import type { Context } from 'hono'
import { randomBytes } from 'crypto'
import { and, eq, desc, gte, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
    creativePerformance,
    platformCreativeMappings,
    creativeFatigueAlerts,
    creativeRenders,
} from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

const genId = () => 'm_' + randomBytes(6).toString('hex')

// ═══════════════════════════════════════════════════════════════════════════
// Mappings
// ═══════════════════════════════════════════════════════════════════════════

// POST .../creative/mappings
// Body: { renderId, platform, platformCreativeId, platformAccountId, platformCampaignId?, notes? }
export const attachMapping = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            renderId: string
            platform: 'meta' | 'google_ads' | 'tiktok' | 'linkedin'
            platformCreativeId: string
            platformCampaignId?: string
            platformAccountId: string
            publishedAt?: string
            notes?: string
        }>()

        if (!body.renderId || !body.platform || !body.platformCreativeId || !body.platformAccountId) {
            return fail(c, 'renderId, platform, platformCreativeId, platformAccountId — all required', 400)
        }

        // Verify the render belongs to this instance
        const [render] = await db.select().from(creativeRenders)
            .where(and(eq(creativeRenders.id, body.renderId), eq(creativeRenders.instanceId, instanceId)))
        if (!render) return fail(c, 'Render not found for this instance', 404)

        const id = genId()
        try {
            await db.insert(platformCreativeMappings).values({
                id,
                instanceId,
                renderId: body.renderId,
                platform: body.platform,
                platformCreativeId: body.platformCreativeId,
                platformCampaignId: body.platformCampaignId || null,
                platformAccountId: body.platformAccountId,
                publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
                publishedBy: userId,
                notes: body.notes || null,
                isActive: true,
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
                return fail(c, 'Mapping already exists for this platform+creativeId', 409)
            }
            throw err
        }
        return ok(c, { id }, 'Mapping created.')
    } catch (err) {
        console.error('attachMapping error:', err)
        return fail(c, 'Attach failed', 500)
    }
}

export const listMappings = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const rows = await db.select().from(platformCreativeMappings)
            .where(eq(platformCreativeMappings.instanceId, instanceId))
            .orderBy(desc(platformCreativeMappings.createdAt))

        return ok(c, { mappings: rows, count: rows.length })
    } catch (err) {
        console.error('listMappings error:', err)
        return fail(c, 'List failed', 500)
    }
}

export const deleteMapping = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const mappingId = c.req.param('mappingId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        await db.delete(platformCreativeMappings).where(and(
            eq(platformCreativeMappings.id, mappingId),
            eq(platformCreativeMappings.instanceId, instanceId),
        ))
        return ok(c, null, 'Deleted.')
    } catch (err) {
        console.error('deleteMapping error:', err)
        return fail(c, 'Delete failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance reads
// ═══════════════════════════════════════════════════════════════════════════

// GET .../creative/performance?days=14
// Aggregate by render (sum spend/impressions, weighted-avg CTR/CPM, avg ROAS).
// Returns array of { renderId, totals } sorted by spend desc.
export const listPerformance = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const days = Math.min(parseInt(c.req.query('days') || '14', 10), 90)
        const sinceDate = new Date()
        sinceDate.setDate(sinceDate.getDate() - days)
        const sinceStr = sinceDate.toISOString().slice(0, 10)

        // Group by render_id, sum totals
        const rows = await db
            .select({
                renderId: creativePerformance.renderId,
                totalSpend: sql<string>`COALESCE(SUM(${creativePerformance.spend}), 0)`,
                totalImpressions: sql<string>`COALESCE(SUM(${creativePerformance.impressions}), 0)`,
                totalClicks: sql<string>`COALESCE(SUM(${creativePerformance.clicks}), 0)`,
                totalConversions: sql<string>`COALESCE(SUM(${creativePerformance.conversions}), 0)`,
                totalConversionValue: sql<string>`COALESCE(SUM(${creativePerformance.conversionValue}), 0)`,
                avgRoas: sql<string>`
                    CASE
                      WHEN COALESCE(SUM(${creativePerformance.spend}), 0) > 0
                      THEN COALESCE(SUM(${creativePerformance.conversionValue}), 0) / SUM(${creativePerformance.spend})
                      ELSE NULL
                    END
                `,
                avgCtr: sql<string>`
                    CASE
                      WHEN COALESCE(SUM(${creativePerformance.impressions}), 0) > 0
                      THEN COALESCE(SUM(${creativePerformance.clicks}), 0)::numeric / SUM(${creativePerformance.impressions})
                      ELSE NULL
                    END
                `,
                daysActive: sql<string>`COUNT(DISTINCT ${creativePerformance.measurementDate})`,
            })
            .from(creativePerformance)
            .where(and(
                eq(creativePerformance.instanceId, instanceId),
                gte(creativePerformance.measurementDate, sinceStr),
            ))
            .groupBy(creativePerformance.renderId)

        // Sort by spend desc client-side (small set)
        const sorted = rows
            .map(r => ({
                ...r,
                totalSpend: parseFloat(r.totalSpend),
                totalImpressions: parseInt(r.totalImpressions, 10),
                totalClicks: parseInt(r.totalClicks, 10),
                totalConversions: parseFloat(r.totalConversions),
                totalConversionValue: parseFloat(r.totalConversionValue),
                avgRoas: r.avgRoas ? parseFloat(r.avgRoas) : null,
                avgCtr: r.avgCtr ? parseFloat(r.avgCtr) : null,
                daysActive: parseInt(r.daysActive, 10),
            }))
            .sort((a, b) => b.totalSpend - a.totalSpend)

        return ok(c, { performance: sorted, days, sinceDate: sinceStr })
    } catch (err) {
        console.error('listPerformance error:', err)
        return fail(c, 'List failed', 500)
    }
}

// GET .../creative/performance/:renderId
// Time-series daily rows for one render (all platforms).
export const getRenderPerformance = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const renderId = c.req.param('renderId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const rows = await db.select().from(creativePerformance)
            .where(and(
                eq(creativePerformance.renderId, renderId),
                eq(creativePerformance.instanceId, instanceId),
            ))
            .orderBy(desc(creativePerformance.measurementDate))
            .limit(90)

        return ok(c, { renderId, daily: rows, count: rows.length })
    } catch (err) {
        console.error('getRenderPerformance error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}

// POST .../creative/performance/sync — manual trigger
export const triggerPerformanceSync = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        // Lazy import — keep service out of cold-start path when unused
        const { syncInstancePerformance } = await import('@/services/creativePerformanceSync')
        const result = await syncInstancePerformance(instanceId)
        return ok(c, result, 'Sync done.')
    } catch (err) {
        console.error('triggerPerformanceSync error:', err)
        return fail(c, err instanceof Error ? err.message : 'Sync failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fatigue alerts
// ═══════════════════════════════════════════════════════════════════════════

export const listFatigueAlerts = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const statusFilter = c.req.query('status')   // 'open' | 'refresh_drafted' | 'dismissed' | null=all
        const conds = [eq(creativeFatigueAlerts.instanceId, instanceId)]
        if (statusFilter) conds.push(eq(creativeFatigueAlerts.status, statusFilter))

        const rows = await db.select().from(creativeFatigueAlerts)
            .where(and(...conds))
            .orderBy(desc(creativeFatigueAlerts.detectedAt))
            .limit(100)

        return ok(c, { alerts: rows, count: rows.length })
    } catch (err) {
        console.error('listFatigueAlerts error:', err)
        return fail(c, 'List failed', 500)
    }
}

// PATCH .../creative/fatigue-alerts/:alertId
// Body: { action: 'dismiss'|'mark_drafted', reason?, refreshRenderId? }
export const updateFatigueAlert = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const alertId = c.req.param('alertId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            action: 'dismiss' | 'mark_drafted'
            reason?: string
            refreshRenderId?: string
        }>()

        const patch: Record<string, unknown> = {}
        if (body.action === 'dismiss') {
            patch.status = 'dismissed'
            patch.dismissedReason = body.reason || null
        } else if (body.action === 'mark_drafted') {
            patch.status = 'refresh_drafted'
            patch.refreshRenderId = body.refreshRenderId || null
        } else {
            return fail(c, 'action must be dismiss or mark_drafted', 400)
        }

        await db.update(creativeFatigueAlerts).set(patch).where(and(
            eq(creativeFatigueAlerts.id, alertId),
            eq(creativeFatigueAlerts.instanceId, instanceId),
        ))

        return ok(c, { alertId, ...patch }, 'Alert updated.')
    } catch (err) {
        console.error('updateFatigueAlert error:', err)
        return fail(c, 'Update failed', 500)
    }
}