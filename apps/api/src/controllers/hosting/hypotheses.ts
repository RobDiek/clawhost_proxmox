/**
 * Creative Hypotheses Controller (Phase B6)
 *
 * Endpoints:
 *   POST   .../creative/hypotheses                    — create (draft or pre-register)
 *   GET    .../creative/hypotheses                    — list
 *   GET    .../creative/hypotheses/:id                — detail
 *   PATCH  .../creative/hypotheses/:id/pre-register   — move draft → pre_registered
 *   PATCH  .../creative/hypotheses/:id/add-variant    — add renderId to variants
 *   POST   .../creative/hypotheses/:id/analyze        — manual analyze trigger
 *   PATCH  .../creative/hypotheses/:id/abandon        — abandon (e.g. changed strategy)
 *
 * Rules:
 *   - Max 4 variants
 *   - Cannot add variants after pre_registered status (integrity)
 *   - Cannot pre-register with < 2 variants
 *   - Pre-registration is mandatory before any variant launches (manually enforced — UI pops warning)
 */

import type { Context } from 'hono'
import { randomBytes } from 'crypto'
import { and, eq, desc } from 'drizzle-orm'

import { db } from '@/db'
import { creativeHypotheses, creativeRenders } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

const genId = () => 'h_' + randomBytes(6).toString('hex')

interface VariantInput {
    renderId: string
    label?: string
    predictedLift?: number
}

// ═══════════════════════════════════════════════════════════════════════════
// POST .../creative/hypotheses
// Body: { statement, reasoning?, primaryMetric, successDirection?,
//         variants: [{renderId, label?, predictedLift?}],
//         controlRenderId?, minSpendIls?, minDaysRunning?, preRegister? }
// ═══════════════════════════════════════════════════════════════════════════
export const createHypothesis = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            statement: string
            reasoning?: string
            primaryMetric: 'ctr' | 'roas' | 'hook_rate' | 'conversion_rate'
            successDirection?: 'higher' | 'lower'
            variants: VariantInput[]
            controlRenderId?: string
            minSpendIls?: number
            minDaysRunning?: number
            maxVariants?: number
            preRegister?: boolean
        }>()

        if (!body.statement || body.statement.trim().length < 10) {
            return fail(c, 'statement חייב להיות עשיר (מינימום 10 תווים)', 400)
        }
        if (!['ctr', 'roas', 'hook_rate', 'conversion_rate'].includes(body.primaryMetric)) {
            return fail(c, 'primaryMetric לא חוקי', 400)
        }
        if (!Array.isArray(body.variants) || body.variants.length < 2) {
            return fail(c, 'נדרשים לפחות 2 variants', 400)
        }
        const maxVariants = body.maxVariants || 4
        if (body.variants.length > maxVariants) {
            return fail(c, `מקסימום ${maxVariants} variants — יותר זה fragmentation`, 400)
        }

        // Verify all variants' renderIds belong to this instance
        const renderIds = body.variants.map(v => v.renderId)
        const foundRenders = await db.select({ id: creativeRenders.id })
            .from(creativeRenders)
            .where(eq(creativeRenders.instanceId, instanceId))
        const validIds = new Set(foundRenders.map(r => r.id))
        const missing = renderIds.filter(id => !validIds.has(id))
        if (missing.length > 0) {
            return fail(c, `Renders not found in this instance: ${missing.join(', ')}`, 400)
        }
        if (body.controlRenderId && !validIds.has(body.controlRenderId)) {
            return fail(c, `controlRenderId not found: ${body.controlRenderId}`, 400)
        }
        if (body.controlRenderId && !renderIds.includes(body.controlRenderId)) {
            return fail(c, 'controlRenderId must be one of the variants', 400)
        }

        const id = genId()
        await db.insert(creativeHypotheses).values({
            id,
            instanceId,
            statement: body.statement.trim(),
            reasoning: body.reasoning?.trim() || null,
            primaryMetric: body.primaryMetric,
            successDirection: body.successDirection || 'higher',
            variants: body.variants.map((v, i) => ({
                renderId: v.renderId,
                label: v.label || `variant_${i + 1}`,
                predictedLift: v.predictedLift ?? null,
            })),
            controlRenderId: body.controlRenderId || null,
            minSpendIls: String(body.minSpendIls ?? 200),
            minDaysRunning: body.minDaysRunning ?? 7,
            maxVariants,
            preRegisteredAt: body.preRegister ? new Date() : null,
            registeredBy: body.preRegister ? userId : null,
            status: body.preRegister ? 'pre_registered' : 'draft',
        })

        // Tag renders with hypothesisId + variantLabel for lineage
        for (const v of body.variants) {
            const label = v.label || null
            await db.update(creativeRenders)
                .set({ hypothesisId: id, variantLabel: label })
                .where(and(eq(creativeRenders.id, v.renderId), eq(creativeRenders.instanceId, instanceId)))
        }

        return ok(c, { id, status: body.preRegister ? 'pre_registered' : 'draft' }, 'Hypothesis created.')
    } catch (err) {
        console.error('createHypothesis error:', err)
        return fail(c, err instanceof Error ? err.message : 'Create failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/hypotheses
// ═══════════════════════════════════════════════════════════════════════════
export const listHypotheses = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const statusFilter = c.req.query('status')
        const conds = [eq(creativeHypotheses.instanceId, instanceId)]
        if (statusFilter) conds.push(eq(creativeHypotheses.status, statusFilter))

        const rows = await db.select().from(creativeHypotheses)
            .where(and(...conds))
            .orderBy(desc(creativeHypotheses.createdAt))
            .limit(100)

        return ok(c, { hypotheses: rows, count: rows.length })
    } catch (err) {
        console.error('listHypotheses error:', err)
        return fail(c, 'List failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/hypotheses/:id
// ═══════════════════════════════════════════════════════════════════════════
export const getHypothesis = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hypId = c.req.param('hypId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const [row] = await db.select().from(creativeHypotheses)
            .where(and(eq(creativeHypotheses.id, hypId), eq(creativeHypotheses.instanceId, instanceId)))
        if (!row) return fail(c, 'Hypothesis not found', 404)

        return ok(c, { hypothesis: row })
    } catch (err) {
        console.error('getHypothesis error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH .../creative/hypotheses/:id/pre-register
// Locks variant list + timestamps pre_registered_at.
// ═══════════════════════════════════════════════════════════════════════════
export const preRegisterHypothesis = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hypId = c.req.param('hypId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const [h] = await db.select().from(creativeHypotheses)
            .where(and(eq(creativeHypotheses.id, hypId), eq(creativeHypotheses.instanceId, instanceId)))
        if (!h) return fail(c, 'Hypothesis not found', 404)
        if (h.status !== 'draft') return fail(c, `Cannot pre-register from status ${h.status}`, 400)

        const variants = h.variants as unknown[]
        if (!Array.isArray(variants) || variants.length < 2) {
            return fail(c, 'Need at least 2 variants before pre-register', 400)
        }

        await db.update(creativeHypotheses)
            .set({
                status: 'pre_registered',
                preRegisteredAt: new Date(),
                registeredBy: userId,
                updatedAt: new Date(),
            })
            .where(eq(creativeHypotheses.id, hypId))

        return ok(c, { id: hypId, preRegisteredAt: new Date() }, 'Pre-registered — variants locked.')
    } catch (err) {
        console.error('preRegisterHypothesis error:', err)
        return fail(c, 'Pre-register failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH .../creative/hypotheses/:id/add-variant
// Body: { renderId, label?, predictedLift? }
// Only allowed in 'draft' status.
// ═══════════════════════════════════════════════════════════════════════════
export const addHypothesisVariant = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hypId = c.req.param('hypId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const [h] = await db.select().from(creativeHypotheses)
            .where(and(eq(creativeHypotheses.id, hypId), eq(creativeHypotheses.instanceId, instanceId)))
        if (!h) return fail(c, 'Hypothesis not found', 404)
        if (h.status !== 'draft') return fail(c, 'Variants locked after pre-register', 400)

        const body = await c.req.json<VariantInput>()
        const variants = (h.variants as VariantInput[] || [])
        if (variants.length >= (h.maxVariants || 4)) {
            return fail(c, `Already at maxVariants (${h.maxVariants})`, 400)
        }
        if (variants.some(v => v.renderId === body.renderId)) {
            return fail(c, 'Variant renderId already in hypothesis', 400)
        }

        // Verify render belongs to instance
        const [render] = await db.select().from(creativeRenders)
            .where(and(eq(creativeRenders.id, body.renderId), eq(creativeRenders.instanceId, instanceId)))
        if (!render) return fail(c, 'Render not found', 404)

        const newVariants = [
            ...variants,
            {
                renderId: body.renderId,
                label: body.label || `variant_${variants.length + 1}`,
                predictedLift: body.predictedLift ?? null,
            },
        ]

        await db.update(creativeHypotheses)
            .set({ variants: newVariants, updatedAt: new Date() })
            .where(eq(creativeHypotheses.id, hypId))

        // Tag the render
        await db.update(creativeRenders)
            .set({ hypothesisId: hypId, variantLabel: body.label || `variant_${variants.length + 1}` })
            .where(eq(creativeRenders.id, body.renderId))

        return ok(c, { id: hypId, variantCount: newVariants.length }, 'Variant added.')
    } catch (err) {
        console.error('addHypothesisVariant error:', err)
        return fail(c, 'Add variant failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST .../creative/hypotheses/:id/analyze
// ═══════════════════════════════════════════════════════════════════════════
export const analyzeHypothesisEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hypId = c.req.param('hypId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        // Verify ownership
        const [h] = await db.select().from(creativeHypotheses)
            .where(and(eq(creativeHypotheses.id, hypId), eq(creativeHypotheses.instanceId, instanceId)))
        if (!h) return fail(c, 'Hypothesis not found', 404)

        const { analyzeHypothesis } = await import('@/services/hypothesisAnalyzer')
        const result = await analyzeHypothesis(hypId)

        return ok(c, result, 'Analysis complete.')
    } catch (err) {
        console.error('analyzeHypothesisEndpoint error:', err)
        return fail(c, err instanceof Error ? err.message : 'Analyze failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH .../creative/hypotheses/:id/abandon
// ═══════════════════════════════════════════════════════════════════════════
export const abandonHypothesis = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hypId = c.req.param('hypId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ reason?: string }>()

        const [h] = await db.select().from(creativeHypotheses)
            .where(and(eq(creativeHypotheses.id, hypId), eq(creativeHypotheses.instanceId, instanceId)))
        if (!h) return fail(c, 'Hypothesis not found', 404)
        if (h.status === 'concluded') return fail(c, 'Cannot abandon concluded hypothesis', 400)

        await db.update(creativeHypotheses)
            .set({
                status: 'abandoned',
                abandonedReason: body.reason || null,
                updatedAt: new Date(),
            })
            .where(eq(creativeHypotheses.id, hypId))

        return ok(c, { id: hypId, status: 'abandoned' }, 'Abandoned.')
    } catch (err) {
        console.error('abandonHypothesis error:', err)
        return fail(c, 'Abandon failed', 500)
    }
}