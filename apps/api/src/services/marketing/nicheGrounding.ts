/**
 * Archetype Strategy Framework — Phase 3: niche-grounding engine (Layer 3).
 *
 * Takes the archetype PRIOR (registry playbook) and bends it with live niche
 * FACTS collected by the research stages — competitor ad-presence, search
 * demand/CPC, SERP features, ROAS benchmarks. Facts > priors: where evidence
 * exists it overrides the default channel weighting. Every adjustment carries
 * its evidence pointer + a confidence, exactly like the research stages.
 *
 * Pure + deterministic: reads research_data, emits a grounded view. No LLM, no DB.
 */

import type { ArchetypeClassificationResult } from './archetypeClassifier'
import { ARCHETYPES, type ChannelRec } from './archetypeRegistry'

export type Confidence = 'high' | 'medium' | 'low'
export type Direction = 'boost' | 'suppress' | 'confirm'

export interface EvidenceNote {
    note: string
    evidence: string
    confidence: Confidence
    direction: Direction
}

export interface GroundedChannel {
    tier: 'primary' | 'secondary' | 'avoid'
    channel: string
    rationale: string
    whenYes?: string
    notes: EvidenceNote[]
}

export interface NicheFacts {
    competitorPlatforms: { googleAdvertisers: number; metaAdvertisers: number; sample: string[]; hasData: boolean }
    searchDemand: { totalVolume: number; avgCpcIls: number | null; thin: boolean; highCpc: boolean; hasData: boolean }
    serp: { localPack: boolean; aiOverview: boolean; shopping: boolean; hasData: boolean }
    roas: { value: number | null; hasData: boolean }
}

export interface GroundedStrategy {
    channels: GroundedChannel[]
    facts: NicheFacts
    appliedOverrides: Array<{ factSignal: string; adjustment: string; evidence: string; confidence: Confidence }>
    overallConfidence: Confidence
}

// ─── Fact detectors (pure, from research_data) ─────────────────────────────
function detectCompetitorPlatforms(rd: any): NicheFacts['competitorPlatforms'] {
    const records: any[] = rd?.results?.paid_competitor_landscape?.records || []
    let google = 0, meta = 0
    const sample: string[] = []
    for (const r of records) {
        const onGoogle = (r?.active_ads_google || 0) > 0 || (Array.isArray(r?.platforms_active) && r.platforms_active.some((p: string) => /google|search|shopping/i.test(p)))
        const onMeta = (r?.active_ads_meta || 0) > 0 || (Array.isArray(r?.platforms_active) && r.platforms_active.some((p: string) => /meta|facebook|instagram/i.test(p)))
        if (onGoogle) google++
        if (onMeta) meta++
        if (r?.domain && sample.length < 5) sample.push(String(r.domain))
    }
    return { googleAdvertisers: google, metaAdvertisers: meta, sample, hasData: records.length > 0 }
}

function detectSearchDemand(rd: any): NicheFacts['searchDemand'] {
    const seo: any[] = rd?.results?.seo_keyword_research?.records || []
    const paid: any[] = rd?.results?.paid_keyword_research?.records || []
    const all = [...seo, ...paid]
    if (all.length === 0) return { totalVolume: 0, avgCpcIls: null, thin: false, highCpc: false, hasData: false }
    let totalVolume = 0, cpcSum = 0, cpcN = 0
    for (const r of all) {
        const v = Number(r?.volume_monthly ?? r?.search_volume ?? 0)
        if (!isNaN(v)) totalVolume += v
        const cpc = Number(r?.cpc_ils ?? r?.cpc ?? NaN)
        if (!isNaN(cpc) && cpc > 0) { cpcSum += cpc; cpcN++ }
    }
    const avgCpcIls = cpcN > 0 ? Math.round((cpcSum / cpcN) * 100) / 100 : null
    // "thin" = low aggregate demand relative to record count; "highCpc" = avg CPC ≥ ₪15 (IL heuristic)
    const thin = totalVolume > 0 && totalVolume < all.length * 100
    const highCpc = avgCpcIls !== null && avgCpcIls >= 15
    return { totalVolume, avgCpcIls, thin, highCpc, hasData: true }
}

function detectSerp(rd: any): NicheFacts['serp'] {
    const seo: any[] = rd?.results?.seo_keyword_research?.records || []
    const aeo = rd?.results?.aeo_visibility
    const blob = JSON.stringify(seo.slice(0, 200)) + ' ' + JSON.stringify(aeo || {})
    const localPack = /local_pack|local pack|map.?pack|חבילה מקומית/i.test(blob)
    const aiOverview = /ai_overview|ai overview|sge|מבט כללי של ai/i.test(blob)
    const shopping = /shopping_carousel|shopping carousel|product.?listing|קרוסל.?ת קניות/i.test(blob)
    return { localPack, aiOverview, shopping, hasData: seo.length > 0 || !!aeo }
}

function detectRoas(rd: any): NicheFacts['roas'] {
    const baseline = rd?.results?.client_account_baseline || rd?.clientBaseline
    const ads = baseline?.dfsData?.googleAds?.accountMetrics || baseline?.accountMetrics || {}
    let roas = Number(ads?.roas ?? NaN)
    if ((isNaN(roas) || !isFinite(roas)) && Number(ads?.cost) > 0 && ads?.conversionValue != null) {
        roas = Number(ads.conversionValue) / Number(ads.cost)
    }
    if (!isNaN(roas) && isFinite(roas) && roas > 0) return { value: Math.round(roas * 100) / 100, hasData: true }
    return { value: null, hasData: false }
}

function channelMatches(channel: string, re: RegExp): boolean { return re.test(channel) }

// ─── Grounding ─────────────────────────────────────────────────────────────
export function groundToNiche(classification: ArchetypeClassificationResult, rd: any): GroundedStrategy {
    const playbook = ARCHETYPES[classification.primaryArchetype]
    const facts: NicheFacts = {
        competitorPlatforms: detectCompetitorPlatforms(rd),
        searchDemand: detectSearchDemand(rd),
        serp: detectSerp(rd),
        roas: detectRoas(rd),
    }

    const toGrounded = (recs: ChannelRec[], tier: GroundedChannel['tier']): GroundedChannel[] =>
        recs.map(r => ({ tier, channel: r.channel, rationale: r.rationale, whenYes: r.whenYes, notes: [] as EvidenceNote[] }))

    const channels: GroundedChannel[] = [
        ...toGrounded(playbook.primaryChannels, 'primary'),
        ...toGrounded(playbook.secondaryChannels, 'secondary'),
        ...toGrounded(playbook.laterOrAvoid, 'avoid'),
    ]

    const note = (chFilter: RegExp, n: EvidenceNote) => {
        for (const c of channels) if (channelMatches(c.channel, chFilter)) c.notes.push(n)
    }

    const appliedOverrides: GroundedStrategy['appliedOverrides'] = []

    // ── Generic evidence rules (apply across archetypes) ────────────────────
    const cp = facts.competitorPlatforms
    if (cp.hasData) {
        if (cp.metaAdvertisers >= 2 && cp.metaAdvertisers > cp.googleAdvertisers) {
            note(/meta|facebook|instagram|reels|short.?video|advantage/i, {
                note: 'Competitors concentrate on Meta — validated paid-social demand; weight Meta up.',
                evidence: `paid_competitor_landscape: ${cp.metaAdvertisers} competitors active on Meta vs ${cp.googleAdvertisers} on Google (${cp.sample.slice(0, 3).join(', ')})`,
                confidence: 'high', direction: 'boost',
            })
        }
        if (cp.googleAdvertisers >= 2 && cp.googleAdvertisers > cp.metaAdvertisers) {
            note(/search|google|shopping|pmax/i, {
                note: 'Competitors concentrate on Google paid — validated search demand; weight paid search up.',
                evidence: `paid_competitor_landscape: ${cp.googleAdvertisers} competitors active on Google vs ${cp.metaAdvertisers} on Meta (${cp.sample.slice(0, 3).join(', ')})`,
                confidence: 'high', direction: 'boost',
            })
        }
    }

    const sd = facts.searchDemand
    if (sd.hasData) {
        if (sd.thin) {
            note(/search|google|seo|content/i, {
                note: 'Thin aggregate search demand — temper paid-search/SEO expectations; lean on social/content demand-gen.',
                evidence: `keyword research: total monthly volume ${sd.totalVolume} across ${'sampled'} keywords`,
                confidence: 'medium', direction: 'suppress',
            })
        }
        if (sd.highCpc) {
            note(/search|google|shopping|pmax/i, {
                note: `High average CPC (₪${sd.avgCpcIls}) — protect efficiency, prioritize high-intent terms + organic.`,
                evidence: `keyword research: avg CPC ₪${sd.avgCpcIls}`,
                confidence: 'medium', direction: 'suppress',
            })
        }
    }

    if (facts.serp.hasData && facts.serp.localPack) {
        note(/local|gbp|business profile|maps|services ads/i, {
            note: 'SERP shows a local pack — local/GBP is a must-capture surface.',
            evidence: 'SERP features: local_pack present in keyword research',
            confidence: 'high', direction: 'boost',
        })
    }
    if (facts.serp.hasData && facts.serp.aiOverview) {
        note(/seo|content|authority|bofu/i, {
            note: 'AI Overviews present — AEO-grade content (fact density, citations) needed to be surfaced/cited.',
            evidence: 'SERP features: AI Overview present in keyword research',
            confidence: 'medium', direction: 'confirm',
        })
    }

    // ── Archetype-specific evidence overrides (from the registry priors) ────
    for (const ov of playbook.evidenceOverrides) {
        const f = ov.factSignal.toLowerCase()
        // "thin local search but heavy competitor Meta-local" / "thin search demand → Meta"
        if ((/thin/.test(f) && /search|local/.test(f)) && (cp.metaAdvertisers > cp.googleAdvertisers || sd.thin)) {
            note(/meta|facebook|instagram|reels|case|short.?video/i, {
                note: ov.adjustment, evidence: `override: "${ov.factSignal}" — competitorsMeta=${cp.metaAdvertisers} > competitorsGoogle=${cp.googleAdvertisers}, thinDemand=${sd.thin}`,
                confidence: 'medium', direction: 'boost',
            })
            appliedOverrides.push({ factSignal: ov.factSignal, adjustment: ov.adjustment, evidence: `competitorsMeta=${cp.metaAdvertisers}, thinDemand=${sd.thin}`, confidence: 'medium' })
        }
        // "high CPC + thin volume → lean organic+referral"
        if (/high cpc/.test(f) && sd.highCpc && sd.thin) {
            note(/seo|content|organic|referral|gbp|local/i, {
                note: ov.adjustment, evidence: `override: "${ov.factSignal}" — avgCpc=₪${sd.avgCpcIls}, thinDemand=${sd.thin}`,
                confidence: 'medium', direction: 'boost',
            })
            appliedOverrides.push({ factSignal: ov.factSignal, adjustment: ov.adjustment, evidence: `avgCpc=₪${sd.avgCpcIls}, thin=${sd.thin}`, confidence: 'medium' })
        }
        // "competitors winning on LinkedIn → raise LinkedIn" — no structured LinkedIn signal yet; skip honestly.
        // "category CPC + Shopping competition" (ecommerce)
        if (/shopping/.test(f) && facts.serp.shopping) {
            note(/shopping|pmax|feed/i, {
                note: ov.adjustment, evidence: `override: "${ov.factSignal}" — shopping carousel present in SERP`,
                confidence: 'medium', direction: 'confirm',
            })
            appliedOverrides.push({ factSignal: ov.factSignal, adjustment: ov.adjustment, evidence: 'shopping carousel in SERP', confidence: 'medium' })
        }
    }

    // Overall confidence = strongest available structured signal.
    const anyHigh = channels.some(c => c.notes.some(n => n.confidence === 'high'))
    const anyData = facts.competitorPlatforms.hasData || facts.searchDemand.hasData || facts.serp.hasData
    const overallConfidence: Confidence = anyHigh ? 'high' : anyData ? 'medium' : 'low'

    return { channels, facts, appliedOverrides, overallConfidence }
}