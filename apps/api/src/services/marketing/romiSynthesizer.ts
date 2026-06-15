/**
 * Archetype Strategy Framework — Phase 4: ROMI synthesizer + stack constraints.
 *
 * Combines the niche-grounded archetype (Layer 3) with the connected stack
 * (Layer 5) and the chosen budget scenario to produce the final, executable
 * ArchetypeStrategy:
 *   - each channel tagged fund / organic / connect_first / defer (integration-grounded),
 *   - prerequisites ("connect X") for channels whose integration is missing,
 *   - the deferredTactics set (archetype prior × locality fact × stack) that feeds
 *     rd.deferredTactics → gates runStructuredFillers (Phase-0 rule #3),
 *   - anti-patterns to enforce, KPI/ROMI framing, per-offer blend.
 *
 * Pure + deterministic. No LLM, no DB.
 */

import type { ConnectedStack } from '../connectedStack'
import { ARCHETYPES } from './archetypeRegistry'
import type { ArchetypeClassificationResult, OfferClassification } from './archetypeClassifier'
import type { GroundedStrategy, GroundedChannel, NicheFacts } from './nicheGrounding'
import type { Offer } from './offerExtractor'

/** A single offer paired with its fully-synthesized strategy (Phase 6). */
export interface OfferStrategy { offer: Offer; strategy: ArchetypeStrategy }

export type ChannelAction = 'fund' | 'organic' | 'connect_first' | 'defer'
export type IntegrationNeed = 'google_ads' | 'meta' | 'gbp' | 'publish' | 'whatsapp' | null

export interface RankedChannel {
    channel: string
    tier: GroundedChannel['tier']
    action: ChannelAction
    needs: IntegrationNeed
    rationale: string
    whenYes?: string     // for avoid-tier channels: the condition that flips it to "yes"
    notes: GroundedChannel['notes']
    blockedBy?: string   // Hebrew integration name when action='connect_first'
}

export interface Prerequisite {
    integration: string         // Hebrew name
    forChannels: string[]
    priority: 'P0' | 'P1'
}

export interface ArchetypeStrategy {
    archetype: ArchetypeClassificationResult['primaryArchetype']
    archetypeNameHe: string
    archetypeNameEn: string
    confidence: ArchetypeClassificationResult['confidence']
    modifiers: ArchetypeClassificationResult['modifiers']
    rankedChannels: RankedChannel[]
    budgetLogic: string
    funnelMotion: string
    primaryKpi: string
    romiModel: string
    leadMechanism: string
    antiPatterns: string[]
    deferredTactics: string[]
    prerequisites: Prerequisite[]
    /** GTM-motion guidance (Phase 6): how this offer is actually taken to market. */
    motionGuidance?: string
    offers: OfferClassification[]
    /** Phase 6 multi-offer: all offers + each offer's own strategy. Set only on
     *  the PRIMARY offer's strategy (the engine's top-level return). */
    allOffers?: Offer[]
    offerStrategies?: OfferStrategy[]
    facts: NicheFacts
    appliedOverrides: GroundedStrategy['appliedOverrides']
    overallConfidence: GroundedStrategy['overallConfidence']
    classificationRationale: string
}

const INTEGRATION_HE: Record<Exclude<IntegrationNeed, null>, string> = {
    google_ads: 'Google Ads',
    meta: 'Meta',
    gbp: 'Google Business Profile',
    publish: 'ערוץ פרסום (WordPress או GitHub)',
    whatsapp: 'WhatsApp Business',
}

/** Map a channel description → the integration it needs + whether it's a paid channel. */
function channelCapability(channel: string): { needs: IntegrationNeed; paid: boolean } {
    const c = channel.toLowerCase()
    // Organic social / owned channels first — no platform integration required.
    if (/organic short-video|organic social|tiktok|youtube|affiliate|webinar|masterclass|lead magnet|thought leadership|linkedin/.test(c)) return { needs: null, paid: false }
    if (/email/.test(c)) return { needs: null, paid: false }
    if (/whatsapp/.test(c)) return { needs: 'whatsapp', paid: false }
    if (/business profile|gbp|reviews engine|maps pack/.test(c)) return { needs: 'gbp', paid: false }
    if (/meta|facebook|instagram|advantage|dpa/.test(c)) return { needs: 'meta', paid: true }
    // Paid-search family. NOTE: `c` is lowercased — keep all tokens lowercase.
    if (/shopping|pmax|local services ads|paid search|google search|high-intent search|intent search|brand search|category.*search|geo-radius|google ads|retarget|roas bidding|feed/.test(c)) return { needs: 'google_ads', paid: true }
    if (/seo|content|bofu|comparison|authority|landing page|category|local seo/.test(c)) return { needs: 'publish', paid: false }
    return { needs: null, paid: false }
}

function isIntegrationConnected(need: IntegrationNeed, stack: ConnectedStack): boolean {
    switch (need) {
        case 'google_ads': return stack.googleAds
        case 'meta': return stack.meta
        case 'gbp': return stack.gbp
        case 'publish': return stack.publishChannel !== 'none'
        case 'whatsapp': return stack.whatsapp
        case null: return true
    }
}

export function synthesizeStrategy(
    classification: ArchetypeClassificationResult,
    grounded: GroundedStrategy,
    stack: ConnectedStack,
    rd: any,
): ArchetypeStrategy {
    const playbook = ARCHETYPES[classification.primaryArchetype]

    const prereqMap = new Map<string, Prerequisite>()
    const rankedChannels: RankedChannel[] = grounded.channels.map(gc => {
        const { needs, paid } = channelCapability(gc.channel)
        let action: ChannelAction
        let blockedBy: string | undefined
        if (gc.tier === 'avoid') {
            action = 'defer'
        } else if (needs && !isIntegrationConnected(needs, stack)) {
            action = 'connect_first'
            blockedBy = INTEGRATION_HE[needs]
            const priority: Prerequisite['priority'] = needs === 'google_ads' ? 'P0' : 'P1'
            const existing = prereqMap.get(needs)
            if (existing) existing.forChannels.push(gc.channel)
            else prereqMap.set(needs, { integration: INTEGRATION_HE[needs], forChannels: [gc.channel], priority })
        } else if (needs && paid) {
            action = 'fund'
        } else {
            action = 'organic'
        }
        return { channel: gc.channel, tier: gc.tier, action, needs, rationale: gc.rationale, whenYes: gc.whenYes, notes: gc.notes, blockedBy }
    })

    // ── deferredTactics: archetype prior × locality fact × motion × stack ────
    const deferred = new Set<string>(playbook.deferTacticsPrior)
    const loc = classification.modifiers.locality
    const motion = classification.modifiers.motion
    // Locality fact dominates the prior: a non-local OFFER should not spawn city
    // pages — EXCEPT a done-for-you / sales-assisted offer, whose CLIENTS are often
    // local SMBs, so local tactics stay on the table for that offer.
    if ((loc === 'national' || loc === 'global') && motion !== 'done_for_you' && motion !== 'sales_assisted') {
        deferred.add('city_pages')
    }
    // A genuinely local offer un-defers city pages even if its archetype prior deferred it
    // (e.g. a local ecommerce / hybrid_local_ecom) — facts > priors.
    if ((loc === 'local' || loc === 'regional') || classification.modifiers.hybrid === 'hybrid_local_ecom') {
        if (grounded.facts.serp.localPack || classification.signals.hasPhysicalLocation) deferred.delete('city_pages')
    }
    // Done-for-you / sales-assisted offers acquire local SMB clients → local tactics
    // stay on the table even if the archetype prior defers them.
    if (motion === 'done_for_you' || motion === 'sales_assisted') deferred.delete('city_pages')
    // Honor any pre-existing explicit deferrals already in research_data.
    const existingDeferrals: string[] = Array.isArray(rd?.deferredTactics) ? rd.deferredTactics : []
    for (const t of existingDeferrals) if (typeof t === 'string') deferred.add(t.toLowerCase())

    // ── anti-patterns: archetype + stack-derived guardrails ─────────────────
    const antiPatterns = [...playbook.antiPatterns]
    if (stack.googleAds) {
        const acct = stack.googleAdsOperatingCustomerId || stack.googleAdsCustomerId
        antiPatterns.push(`never propose opening a NEW Google Ads account — operate inside the connected account ${acct}`)
    }
    if (stack.publishChannel === 'github') {
        antiPatterns.push('no WordPress/CMS-plugin steps — author content via git/markdown (the connected publish channel is GitHub)')
    }

    // ── motion guidance (Phase 6): how THIS offer is taken to market ────────
    let motionGuidance: string | undefined
    switch (motion) {
        case 'self_serve':
            motionGuidance = 'Product-led (self-serve): lead magnet / free guide → trial/signup → in-product ACTIVATION → self-serve conversion. Emphasize content + SEO authority, email nurture, pricing-page CRO, and the signup/activation funnel (instrument trial-start + activation events). Lower-touch — no heavy sales-assist.'
            break
        case 'done_for_you':
        case 'sales_assisted':
            motionGuidance = 'High-touch (done-for-you / sales-assisted): LinkedIn (ICP targeting + founder thought leadership) + result-led case studies + referral/JV + high-intent search + demo/consult CTA. The CLIENTS are often local SMBs → local channels (Google Business Profile, "[service] [city]" search) ARE relevant for acquiring them. Low volume, high ACV — qualify hard.'
            break
        case 'transactional':
            motionGuidance = 'Transactional: feed-driven prospecting (Shopping/PMax + Advantage+) → dynamic retargeting → email lifecycle for repeat/LTV.'
            break
    }
    if (classification.modifiers.recurring) {
        antiPatterns.push('recurring revenue — do NOT ignore onboarding/activation, churn/win-back, and expansion/upsell: retention compounds LTV')
        motionGuidance = (motionGuidance ? motionGuidance + ' ' : '') + 'RECURRING revenue: include onboarding/activation, retention/win-back, and expansion/upsell tasks.'
    }

    // ── budget logic, annotated with the chosen scenario if present ─────────
    const scenarioKey = (typeof rd?.chosenScenario === 'object' ? rd?.chosenScenario?.scenario : rd?.chosenScenario)
    const budgetLogic = scenarioKey
        ? `${playbook.budgetLogic}. Calibrated to the chosen "${scenarioKey}" scenario budget (read cost_timeline_modeling verbatim).`
        : playbook.budgetLogic

    return {
        archetype: classification.primaryArchetype,
        archetypeNameHe: playbook.nameHe,
        archetypeNameEn: playbook.nameEn,
        confidence: classification.confidence,
        modifiers: classification.modifiers,
        rankedChannels,
        budgetLogic,
        funnelMotion: playbook.funnelMotion,
        primaryKpi: playbook.primaryKpi,
        romiModel: playbook.romiModel,
        leadMechanism: playbook.leadMechanism,
        antiPatterns,
        deferredTactics: [...deferred],
        prerequisites: [...prereqMap.values()],
        motionGuidance,
        offers: classification.offers,
        facts: grounded.facts,
        appliedOverrides: grounded.appliedOverrides,
        overallConfidence: grounded.overallConfidence,
        classificationRationale: classification.rationale,
    }
}