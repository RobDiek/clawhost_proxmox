/**
 * Executor Capability Registry + Plan Coverage Report.
 *
 * Single source of truth for "what can the executor actually do autonomously
 * after approval". Each capability declares its match criteria + autonomy
 * level + integration prerequisites. Two uses:
 *
 *   1. computePlanCoverage(plan) — classify every task in a monthly plan as
 *      auto / partial / propose / manual, so we can SHOW a per-tenant autonomy
 *      score before approval (the honest, measurable answer to "can the agent
 *      do this"). Replaces guessing.
 *
 *   2. (next) feed the registry to the plan generator so Opus tags each task
 *      with capabilityId up-front, and route the executor by that tag instead
 *      of brittle text regex.
 *
 * This module is ADDITIVE — it mirrors the executor's current routing without
 * changing it. As new capabilities ship, add an entry here; coverage updates.
 */
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'
import { isSeoMetaBatchTask, isSeoSchemaTask, isInternalLinksTask, isSlugProposeTask, isImageAltTask, isLlmsTxtTask } from '@/services/monthlyTaskExecutor'

export type Autonomy =
    | 'auto_write'      // performs a real external mutation (verified)
    | 'auto_partial'    // real mutation for common cases; falls back to a brief for the rest
    | 'propose_only'    // generates concrete suggestions; user applies (no external write)
    | 'manual'          // produces a brief only — human executes

export interface ExecutorCapability {
    id: string
    label_he: string
    autonomy: Autonomy
    requires: string[]                 // integration prerequisites (informational)
    match: (task: MonthlyTask) => boolean
}

const PAID_TYPES = new Set(['paid_optimization', 'keyword_expansion', 'audience_expansion', 'creative_refresh', 'experiment'])
const TRACKING_TYPES = new Set(['tracking_setup', 'measurement_gap'])

// Order matters — first match wins (mirrors executor dispatch: SEO detectors
// run BEFORE the type switch).
export const CAPABILITIES: ExecutorCapability[] = [
    { id: 'seo.meta', label_he: 'תיאורי מטא (batch)', autonomy: 'auto_write', requires: ['wordpress|github'], match: isSeoMetaBatchTask },
    { id: 'seo.schema', label_he: 'סכמת JSON-LD (batch)', autonomy: 'auto_write', requires: ['wordpress|github'], match: isSeoSchemaTask },
    { id: 'seo.internal_links', label_he: 'קישורים פנימיים', autonomy: 'auto_write', requires: ['wordpress|github'], match: isInternalLinksTask },
    { id: 'seo.slug', label_he: 'תעתיק slug + 301 (הצעה)', autonomy: 'propose_only', requires: ['wordpress|github'], match: isSlugProposeTask },
    { id: 'seo.image_alt', label_he: 'טקסט חלופי לתמונות (batch)', autonomy: 'auto_write', requires: ['wordpress'], match: isImageAltTask },
    { id: 'aeo.llms_txt', label_he: 'llms.txt למנועי AI', autonomy: 'auto_write', requires: ['wordpress|github'], match: isLlmsTxtTask },
    { id: 'paid.google_ads', label_he: 'אופטימיזציית Google Ads', autonomy: 'auto_partial', requires: ['google_ads'], match: t => PAID_TYPES.has(t.type) },
    { id: 'tracking.setup', label_he: 'מדידה — GTM/GA4/Pixel', autonomy: 'auto_partial', requires: ['gtm', 'ga4'], match: t => TRACKING_TYPES.has(t.type) },
    { id: 'content.create', label_he: 'יצירת תוכן (טיוטה)', autonomy: 'auto_write', requires: ['api_key'], match: t => t.type === 'content_creation' },
]

export function classifyTask(task: MonthlyTask): { capabilityId: string; autonomy: Autonomy } {
    for (const cap of CAPABILITIES) {
        try { if (cap.match(task)) return { capabilityId: cap.id, autonomy: cap.autonomy } } catch { /* skip */ }
    }
    return { capabilityId: 'manual', autonomy: 'manual' }
}

export interface PlanCoverage {
    total: number
    byAutonomy: Record<Autonomy, number>
    byCapability: Record<string, number>
    autoPct: number          // (auto_write + auto_partial) / total, rounded
    manualTasks: Array<{ id: string; title: string; type: string; channel: string }>
}

export function computePlanCoverage(tasks: MonthlyTask[]): PlanCoverage {
    const byAutonomy: Record<Autonomy, number> = { auto_write: 0, auto_partial: 0, propose_only: 0, manual: 0 }
    const byCapability: Record<string, number> = {}
    const manualTasks: PlanCoverage['manualTasks'] = []
    for (const t of tasks) {
        const { capabilityId, autonomy } = classifyTask(t)
        byAutonomy[autonomy]++
        byCapability[capabilityId] = (byCapability[capabilityId] || 0) + 1
        if (autonomy === 'manual') manualTasks.push({ id: t.id, title: (t.title || '').slice(0, 70), type: t.type, channel: t.channel })
    }
    const total = tasks.length
    const auto = byAutonomy.auto_write + byAutonomy.auto_partial
    return { total, byAutonomy, byCapability, autoPct: total ? Math.round((auto / total) * 100) : 0, manualTasks }
}