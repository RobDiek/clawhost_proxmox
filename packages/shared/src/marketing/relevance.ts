// Relevance engine — given a user's intents + connected integrations, compute:
//   1. Tier per integration (essential / recommended / optional / not-relevant)
//   2. Pipeline status (locked / available / running / completed)
//   3. "What you're missing" recommendations
//
// Pure functions — no I/O. Lives in shared so frontend and backend agree.

import type { MarketingIntent } from './intents'
import { INTEGRATIONS, type IntegrationInfo } from './integrations'
import { PIPELINES, type PipelineDef } from './pipelines'

export type Tier = 'essential' | 'recommended' | 'optional' | 'not_relevant'

export interface IntegrationRelevance {
    integration: IntegrationInfo
    tier: Tier
    score: number                          // 0..100, used for ranking within a tier
    reasonsHe: string[]                    // human-readable reasons (RTL Hebrew)
    relevantIntents: MarketingIntent[]     // which intents trigger this relevance
}

export interface PipelineStatus {
    pipeline: PipelineDef
    state: 'locked' | 'available' | 'partial'   // locked: missing required integrations
    missingRequired: string[]                   // integration ids missing for required
    missingImproving: string[]                  // integration ids missing for improvesWith
    qualityScore: number                        // 0..100 — how data-rich the run will be
    relevantToCurrentIntents: boolean
}

const TIER_SCORE: Record<Tier, number> = {
    essential: 100,
    recommended: 60,
    optional: 30,
    not_relevant: 0,
}

// Compute tier of one integration against a set of active intents.
export function tierForIntegration(
    integration: IntegrationInfo,
    intents: MarketingIntent[]
): { tier: Tier; relevantIntents: MarketingIntent[] } {
    const set = new Set(intents)
    const essentialMatches = (integration.essentialFor || []).filter(i => set.has(i))
    if (essentialMatches.length > 0) return { tier: 'essential', relevantIntents: essentialMatches }
    const recommendedMatches = (integration.recommendedFor || []).filter(i => set.has(i))
    if (recommendedMatches.length > 0) return { tier: 'recommended', relevantIntents: recommendedMatches }
    const optionalMatches = (integration.optionalFor || []).filter(i => set.has(i))
    if (optionalMatches.length > 0) return { tier: 'optional', relevantIntents: optionalMatches }
    return { tier: 'not_relevant', relevantIntents: [] }
}

// Rank all available integrations against intents.
export function relevanceForIntegrations(intents: MarketingIntent[]): IntegrationRelevance[] {
    return INTEGRATIONS.filter(i => i.available).map(integration => {
        const { tier, relevantIntents } = tierForIntegration(integration, intents)
        const score = TIER_SCORE[tier] + (integration.cost === 'free' ? 5 : 0)
        const reasonsHe: string[] = []
        if (tier === 'essential') {
            reasonsHe.push('חיוני עבור: ' + relevantIntents.join(', '))
        } else if (tier === 'recommended') {
            reasonsHe.push('משפר את: ' + relevantIntents.join(', '))
        } else if (tier === 'optional') {
            reasonsHe.push('אופציונלי')
        }
        if (integration.cost === 'free') reasonsHe.push('חינם')
        else if (integration.cost === 'usage') reasonsHe.push(integration.costNote || 'תשלום לפי שימוש')
        return { integration, tier, score, reasonsHe, relevantIntents }
    }).sort((a, b) => b.score - a.score)
}

// Integrations that are INTERCHANGEABLE for the same capability — connecting any
// one satisfies the requirement, so the readiness gate must not ask for both.
// e.g. publish content to a WordPress site OR a Git-based static site (GitHub).
export const ALTERNATIVE_GROUPS: string[][] = [
    ['wordpress', 'github'],          // content publishing target (CMS vs Git/static)
    ['instagram', 'facebook_pages'],  // social publishing surface (both under Meta)
    ['shopify', 'woocommerce'],       // ecommerce catalog
]

export interface EssentialReadiness {
    ready: boolean
    // Each entry = one unmet ESSENTIAL requirement. `ids` are interchangeable
    // options (≥1 must be connected); `namesHe` are their display names.
    unmet: Array<{ ids: string[]; namesHe: string[]; intents: MarketingIntent[] }>
}

// Are all ESSENTIAL integrations for the chosen intents connected? Group-aware:
// wordpress|github (etc.) count as satisfied when ANY member is connected. Builtin
// / auto-connected integrations (telegram, pagespeed, …) are excluded — they need
// no user action. This drives the "connect your channels' tools before research"
// onboarding gate, so research runs on real data, not LLM fallback.
export function essentialReadiness(
    intents: MarketingIntent[],
    connectedIntegrations: string[]
): EssentialReadiness {
    const connected = new Set(connectedIntegrations)
    const essential = INTEGRATIONS
        .filter(i => i.available && i.auth !== 'builtin')
        .map(i => ({ i, t: tierForIntegration(i, intents) }))
        .filter(x => x.t.tier === 'essential')

    const groups: Array<{ ids: string[]; intents: MarketingIntent[] }> = []
    const grouped = new Set<string>()
    for (const grp of ALTERNATIVE_GROUPS) {
        const members = essential.filter(x => grp.includes(x.i.id))
        if (members.length === 0) continue
        members.forEach(x => grouped.add(x.i.id))
        groups.push({ ids: grp, intents: Array.from(new Set(members.flatMap(x => x.t.relevantIntents))) })
    }
    for (const x of essential) {
        if (grouped.has(x.i.id)) continue
        groups.push({ ids: [x.i.id], intents: x.t.relevantIntents })
    }

    const unmet = groups
        .filter(g => !g.ids.some(id => connected.has(id)))
        .map(g => ({
            ids: g.ids,
            namesHe: g.ids.map(id => INTEGRATIONS.find(i => i.id === id)?.nameHe || id),
            intents: g.intents,
        }))
    return { ready: unmet.length === 0, unmet }
}

// Resolve `requires` strings — supports `'a|b|c'` meaning "any of a, b, c".
function resolveRequirement(req: string, connected: Set<string>): boolean {
    if (req.includes('|')) return req.split('|').some(r => connected.has(r.trim()))
    return connected.has(req)
}

// For each pipeline: locked vs available vs partial, what's missing, quality score.
export function pipelineStatuses(
    intents: MarketingIntent[],
    connectedIntegrations: string[]
): PipelineStatus[] {
    const intentSet = new Set(intents)
    const connected = new Set(connectedIntegrations)
    return PIPELINES.map(pipeline => {
        const relevantToCurrentIntents = pipeline.intents.some(i => intentSet.has(i))
        const missingRequired = pipeline.requires.filter(r => !resolveRequirement(r, connected))
        const missingImproving = pipeline.improvesWith.filter(r => !connected.has(r))

        let state: PipelineStatus['state']
        if (missingRequired.length > 0) state = 'locked'
        else if (missingImproving.length === 0) state = 'available'
        else state = 'partial'

        // Quality score: 100 if all (required + improvesWith) connected, else linearly degraded
        const totalSlots = pipeline.requires.length + pipeline.improvesWith.length
        const filledSlots = (pipeline.requires.length - missingRequired.length) + (pipeline.improvesWith.length - missingImproving.length)
        const qualityScore = totalSlots === 0 ? 100 : Math.round((filledSlots / totalSlots) * 100)

        return { pipeline, state, missingRequired, missingImproving, qualityScore, relevantToCurrentIntents }
    })
}

// Pre-launch check for a given pipeline: returns blockers (missingRequired) and
// warnings (missingImproving). Used by UI for soft warnings before "Run".
export interface PreLaunchCheck {
    canLaunch: boolean
    blockersHe: string[]
    warningsHe: string[]
    qualityScore: number
}

export function checkPipelineLaunch(
    pipelineId: string,
    intents: MarketingIntent[],
    connectedIntegrations: string[]
): PreLaunchCheck | null {
    const status = pipelineStatuses(intents, connectedIntegrations).find(s => s.pipeline.id === pipelineId)
    if (!status) return null
    const blockersHe = status.missingRequired.map(r => {
        if (r.includes('|')) {
            const opts = r.split('|').map(id => INTEGRATIONS.find(i => i.id === id.trim())?.nameHe || id).filter(Boolean)
            return 'חסר חיבור — נדרש אחד מ: ' + opts.join(' / ')
        }
        const info = INTEGRATIONS.find(i => i.id === r)
        return 'חסר חיבור: ' + (info?.nameHe || r)
    })
    const warningsHe = status.missingImproving
        .map(r => {
            const info = INTEGRATIONS.find(i => i.id === r)
            return info ? `איכות תפחת בלי ${info.nameHe}` : `${r} לא מחובר`
        })
    return {
        canLaunch: status.state !== 'locked',
        blockersHe,
        warningsHe,
        qualityScore: status.qualityScore,
    }
}

// Capability groups for UI Hub display.
export type CapabilityGroup =
    | 'search_intelligence'
    | 'paid_ads'
    | 'analytics'
    | 'cms_site'
    | 'social'
    | 'email_crm'
    | 'creative'
    | 'comms'

export const CAPABILITY_GROUP_LABELS_HE: Record<CapabilityGroup, string> = {
    search_intelligence: 'מודיעין חיפוש (SEO/PPC)',
    paid_ads:            'קמפיינים ממומנים',
    analytics:           'אנליטיקס וביצועים',
    cms_site:            'אתר / CMS',
    social:              'רשתות חברתיות',
    email_crm:           'Email ו-CRM',
    creative:            'קריאייטיב',
    comms:               'תקשורת ולידים',
}

// Map IntegrationCapability enum to UI group buckets.
export function groupForIntegration(integration: IntegrationInfo): CapabilityGroup {
    const caps = integration.capabilities
    if (caps.some(c => ['search_intelligence', 'keyword_research', 'serp_analysis', 'web_crawling'].includes(c))) return 'search_intelligence'
    if (caps.some(c => ['paid_ads_search', 'paid_ads_social', 'tag_management', 'ads_competitive', 'offline_conversions'].includes(c))) return 'paid_ads'
    if (caps.some(c => ['web_analytics', 'page_speed'].includes(c))) return 'analytics'
    if (caps.includes('cms') || caps.includes('ecommerce_catalog')) return 'cms_site'
    if (caps.includes('social_publishing')) return 'social'
    if (caps.includes('email_delivery') || caps.includes('crm')) return 'email_crm'
    if (caps.includes('creative_design')) return 'creative'
    if (caps.includes('messaging')) return 'comms'
    return 'analytics'
}

// Build the Hub structure: capability groups → integrations with tiers + status.
export interface HubGroupView {
    group: CapabilityGroup
    labelHe: string
    // `coveredByAlternative`: this integration isn't connected itself, but an
    // interchangeable ALTERNATIVE_GROUPS member is (e.g. WordPress is "covered"
    // once GitHub is connected). Callers must treat connected||coveredByAlternative
    // as satisfied — so an either/or requirement never blocks once one is done.
    integrations: Array<IntegrationRelevance & { connected: boolean; coveredByAlternative: boolean }>
    isRelevantToIntents: boolean         // true if any integration in group has tier != not_relevant
}

export function buildHub(
    intents: MarketingIntent[],
    connectedIntegrations: string[]
): HubGroupView[] {
    const connected = new Set(connectedIntegrations)
    // Mark integrations covered by a connected alternative (either/or groups).
    const covered = new Set<string>()
    for (const grp of ALTERNATIVE_GROUPS) {
        if (grp.some(id => connected.has(id))) {
            for (const id of grp) if (!connected.has(id)) covered.add(id)
        }
    }
    const relevance = relevanceForIntegrations(intents)
    const byGroup = new Map<CapabilityGroup, Array<IntegrationRelevance & { connected: boolean; coveredByAlternative: boolean }>>()
    for (const r of relevance) {
        const g = groupForIntegration(r.integration)
        const arr = byGroup.get(g) || []
        arr.push({ ...r, connected: connected.has(r.integration.id), coveredByAlternative: covered.has(r.integration.id) })
        byGroup.set(g, arr)
    }
    const groupOrder: CapabilityGroup[] = ['search_intelligence', 'paid_ads', 'analytics', 'cms_site', 'social', 'email_crm', 'creative', 'comms']
    return groupOrder.map(g => {
        const integrations = (byGroup.get(g) || []).sort((a, b) => b.score - a.score)
        return {
            group: g,
            labelHe: CAPABILITY_GROUP_LABELS_HE[g],
            integrations,
            isRelevantToIntents: integrations.some(i => i.tier !== 'not_relevant'),
        }
    }).filter(g => g.integrations.length > 0)
}
