/**
 * Admin → Models — model registry health, linkage, and "apply without deploy".
 *
 * GET  /admin/models            → tiers (registry vs effective override), per-agent
 *                                 linkage, /v1/models discovery, availability health
 * POST /admin/models/apply-tier → set a tier → modelId override (no code deploy);
 *                                 all new provisioning follows immediately
 * POST /admin/models/clear-tier → revert a tier to the compiled registry default
 * POST /admin/models/refresh    → force a /v1/models discovery pass now
 *
 * Detect + alert + 1-click apply: modelMonitor surfaces newer models via /v1/models;
 * the admin reviews and applies here. We never auto-switch a tier — choosing which
 * tier a brand-new model belongs to is a human judgment call.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { adminUsers } from '@/db/schema'
import { writeAudit } from '@/services/adminAuth'
import { TIER_MODELS, ROLE_TIERS, MODEL_REGISTRY } from '@openclaw/shared'
import { getTierOverrides, setTierOverride, clearTierOverride } from '@/services/modelOverrides'
import { getModelHealth, getModelDiscovery, refreshModelDiscovery } from '@/services/modelMonitor'

const ok = (c: Context, data: any, message = 'OK') => c.json({ success: true, data, message })
const fail = (c: Context, message: string, status = 400) => c.json({ success: false, message }, status as any)
function getIp(c: Context): string {
    return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

const TIERS = ['opus', 'sonnet', 'haiku'] as const
type TierKey = typeof TIERS[number]

const TIER_LABEL: Record<TierKey, string> = {
    opus: 'Opus — מודל מתקדם (אסטרטגיה / AEO)',
    sonnet: 'Sonnet — מומלץ (מחקר / תוכן / אורקסטרציה)',
    haiku: 'Haiku — חסכוני (תיאום / הפצה)',
}

// Hebrew display names for the sub-agent roles (matches dashboard).
const ROLE_LABEL_HE: Record<string, string> = {
    mateh: 'מטה — מנהל-על',
    sayer: 'סייר — מחקר אינטרנט',
    meater: 'מאתר — מחקר SERP',
    maazin: 'מאזין — האזנה חברתית',
    menateach: 'מנתח — אסטרטגיה',
    et: 'עט — כתיבת תוכן',
    yotzer: 'יוצר — קריאייטיב',
    shaliach: 'שליח — הפצה',
    migdalor: 'מגדלור — AEO',
    mekhayev: 'מכייב — מיתוג',
    mazhir: 'מזהיר — פרסום ממומן',
}

export const adminModels = async (c: Context) => {
    try {
        const overrides = await getTierOverrides()

        const tiers = TIERS.map(tier => {
            const registryId = TIER_MODELS[tier]
            const effectiveId = overrides[tier] || registryId
            return {
                tier,
                label: TIER_LABEL[tier],
                registryId,
                effectiveId,
                overridden: !!overrides[tier] && overrides[tier] !== registryId,
                registryLabel: MODEL_REGISTRY[registryId]?.label || registryId,
            }
        })

        const roles = Object.entries(ROLE_TIERS).map(([role, tier]) => {
            const effectiveId = overrides[tier] || TIER_MODELS[tier]
            return {
                role,
                labelHe: ROLE_LABEL_HE[role] || role,
                tier,
                modelId: effectiveId,
                modelLabel: MODEL_REGISTRY[effectiveId]?.label || effectiveId,
            }
        })

        const discovery = getModelDiscovery()
        const health = getModelHealth()

        return ok(c, { tiers, roles, discovery, health })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminApplyModelTier = async (c: Context) => {
    try {
        const adminId = c.get('adminId' as any) as string
        const body = await c.req.json<{ tier?: string; modelId?: string }>().catch(() => ({} as any))
        const tier = (body.tier || '').trim()
        const modelId = (body.modelId || '').trim()
        if (!TIERS.includes(tier as TierKey)) return fail(c, `tier must be one of ${TIERS.join(', ')}`, 400)
        if (!modelId || !/^claude-/.test(modelId)) return fail(c, 'modelId required (Anthropic claude-* id)', 400)

        const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId))
        await setTierOverride(tier, modelId, admin?.email)
        await writeAudit({
            adminId, action: 'admin.model.apply_tier',
            targetType: 'model_tier', targetId: tier,
            details: { modelId }, ip: getIp(c),
        })
        return ok(c, { tier, modelId }, `Tier "${tier}" → ${modelId}. New provisioning follows immediately.`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminClearModelTier = async (c: Context) => {
    try {
        const adminId = c.get('adminId' as any) as string
        const body = await c.req.json<{ tier?: string }>().catch(() => ({} as any))
        const tier = (body.tier || '').trim()
        if (!TIERS.includes(tier as TierKey)) return fail(c, `tier must be one of ${TIERS.join(', ')}`, 400)
        await clearTierOverride(tier)
        await writeAudit({
            adminId, action: 'admin.model.clear_tier',
            targetType: 'model_tier', targetId: tier, ip: getIp(c),
        })
        return ok(c, { tier, modelId: TIER_MODELS[tier as TierKey] }, `Tier "${tier}" reverted to registry default.`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adminRefreshModels = async (c: Context) => {
    try {
        const discovery = await refreshModelDiscovery()
        return ok(c, discovery, 'Discovery refreshed.')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}