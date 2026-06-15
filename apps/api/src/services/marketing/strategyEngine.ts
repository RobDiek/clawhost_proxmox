/**
 * Archetype Strategy Framework — Phase 5/6: engine orchestrator + prompt directive.
 *
 * resolveArchetypeStrategy() runs the deterministic layers:
 *   extractOffers → per-offer [classify (L2 prior) → groundToNiche (L3 facts) →
 *   synthesize (L4-5)] → multi-offer aggregation.
 * A single-offer tenant behaves exactly as before; a multi-offer tenant gets a
 * distinct strategy per offer (roadmap/22 rule 5: per-offer, not blend), with
 * deferredTactics = INTERSECTION (defer only what every offer defers) and
 * prerequisites/anti-patterns = UNION across offers.
 *
 * buildArchetypeStrategyDirective() renders it as the strategic spine injected
 * into the skeleton + detailer prompts.
 */

import type { ConnectedStack } from '../connectedStack'
import { classifyArchetypes } from './archetypeClassifier'
import { groundToNiche } from './nicheGrounding'
import { synthesizeStrategy, type ArchetypeStrategy } from './romiSynthesizer'
import { extractOffers } from './offerExtractor'

export type { ArchetypeStrategy } from './romiSynthesizer'

/** Run the full engine. Pure (no DB/LLM) — reads research_data + the resolved stack. */
export function resolveArchetypeStrategy(rd: any, stack: ConnectedStack, nowIso?: string): ArchetypeStrategy {
    const offers = extractOffers(rd)

    // Single offer → legacy single-strategy behavior.
    if (offers.length <= 1) {
        const classification = classifyArchetypes(rd, stack, nowIso, offers[0])
        const grounded = groundToNiche(classification, rd)
        const s = synthesizeStrategy(classification, grounded, stack, rd)
        s.allOffers = offers
        return s
    }

    // Multi-offer → classify + synthesize each independently.
    const perOffer = offers.map(offer => {
        const classification = classifyArchetypes(rd, stack, nowIso, offer)
        const grounded = groundToNiche(classification, rd)
        return { offer, strategy: synthesizeStrategy(classification, grounded, stack, rd) }
    })

    const primaryEntry = perOffer.find(p => p.offer.isPrimary) || perOffer[0]
    // SHALLOW COPY for the top-level aggregate — must NOT be one of the per-offer
    // strategy objects, otherwise primary.offerStrategies[i].strategy === primary
    // and research_data serialization hits a circular structure. The per-offer
    // entries stay plain (no offerStrategies of their own).
    const primary: ArchetypeStrategy = { ...primaryEntry.strategy }
    primary.allOffers = offers
    primary.offerStrategies = perOffer

    // deferredTactics = INTERSECTION — defer a tactic only if EVERY offer defers it
    // (so a local done-for-you offer keeps city pages even when the self-serve
    // offer is national).
    const deferSets = perOffer.map(p => new Set(p.strategy.deferredTactics))
    primary.deferredTactics = [...deferSets[0]].filter(t => deferSets.every(s => s.has(t)))

    // prerequisites = UNION (dedup by integration, merge channels).
    const prereqMap = new Map<string, { integration: string; forChannels: string[]; priority: 'P0' | 'P1' }>()
    for (const p of perOffer) {
        for (const pre of p.strategy.prerequisites) {
            const ex = prereqMap.get(pre.integration)
            if (ex) {
                ex.forChannels = [...new Set([...ex.forChannels, ...pre.forChannels])]
                if (pre.priority === 'P0') ex.priority = 'P0'
            } else {
                prereqMap.set(pre.integration, { integration: pre.integration, forChannels: [...pre.forChannels], priority: pre.priority })
            }
        }
    }
    primary.prerequisites = [...prereqMap.values()]

    // anti-patterns = UNION (dedup).
    primary.antiPatterns = [...new Set(perOffer.flatMap(p => p.strategy.antiPatterns))]

    return primary
}

const ACTION_HE: Record<string, string> = {
    fund: 'FUND (paid)', organic: 'DO (organic/owned)', connect_first: 'CONNECT FIRST', defer: 'AVOID/LATER',
}

function notesToStr(notes: ArchetypeStrategy['rankedChannels'][number]['notes']): string {
    if (!notes.length) return ''
    return ' [' + notes.map(n => `${n.direction}: ${n.note} (${n.confidence}; ${n.evidence})`).join(' | ') + ']'
}

/** Render ONE offer's strategy body (no top header). */
function renderOne(s: ArchetypeStrategy): string {
    const L: string[] = []
    L.push(`Archetype: ${s.archetypeNameEn} (${s.archetypeNameHe}) · confidence ${s.confidence} · ${s.modifiers.b2x}/${s.modifiers.locality}/${s.modifiers.intent}${s.modifiers.hybrid ? `/${s.modifiers.hybrid}` : ''}${s.modifiers.motion ? `/${s.modifiers.motion}` : ''}${s.modifiers.recurring ? '/recurring' : ''}`)
    L.push(`Classification: ${s.classificationRationale}`)
    if (s.motionGuidance) L.push(`Go-to-market motion: ${s.motionGuidance}`)
    L.push(`Funnel motion: ${s.funnelMotion}`)
    L.push(`Primary KPI: ${s.primaryKpi}`)
    L.push(`ROMI model: ${s.romiModel}`)
    L.push(`Lead mechanism: ${s.leadMechanism}`)
    L.push(`Budget logic: ${s.budgetLogic}`)

    const byTier = (t: string) => s.rankedChannels.filter(c => c.tier === t)
    L.push('CHANNEL PRIORITIES — build the month around these in order. Tag = recommended action:')
    L.push('  PRIMARY (the backbone of the plan):')
    for (const c of byTier('primary')) L.push(`    · ${c.channel} — ${ACTION_HE[c.action]}${c.blockedBy ? ` (needs ${c.blockedBy})` : ''} — ${c.rationale}${notesToStr(c.notes)}`)
    L.push('  SECONDARY (amplify once primary is moving):')
    for (const c of byTier('secondary')) L.push(`    · ${c.channel} — ${ACTION_HE[c.action]}${c.blockedBy ? ` (needs ${c.blockedBy})` : ''} — ${c.rationale}${notesToStr(c.notes)}`)
    const avoid = byTier('avoid')
    if (avoid.length) {
        L.push('  AVOID / LATER (do NOT build tasks for these unless the "when yes" condition is met):')
        for (const c of avoid) L.push(`    · ${c.channel}${c.whenYes ? ` — only if: ${c.whenYes}` : ''}`)
    }

    const f = s.facts
    L.push('NICHE FACTS (facts > priors — these override the archetype default where present):')
    if (f.competitorPlatforms.hasData) L.push(`  · Competitor ad presence: ${f.competitorPlatforms.googleAdvertisers} on Google, ${f.competitorPlatforms.metaAdvertisers} on Meta (${f.competitorPlatforms.sample.slice(0, 3).join(', ')})`)
    if (f.searchDemand.hasData) L.push(`  · Search demand: total ${f.searchDemand.totalVolume}/mo, avg CPC ${f.searchDemand.avgCpcIls !== null ? '₪' + f.searchDemand.avgCpcIls : 'n/a'}${f.searchDemand.thin ? ', THIN' : ''}${f.searchDemand.highCpc ? ', HIGH-CPC' : ''}`)
    if (f.serp.hasData) L.push(`  · SERP features: ${[f.serp.localPack && 'local_pack', f.serp.aiOverview && 'ai_overview', f.serp.shopping && 'shopping'].filter(Boolean).join(', ') || 'none notable'}`)
    if (f.roas.hasData) L.push(`  · ROAS benchmark: ${f.roas.value}`)
    if (s.appliedOverrides.length) for (const o of s.appliedOverrides) L.push(`  · Applied override: "${o.factSignal}" → ${o.adjustment} (${o.confidence}; ${o.evidence})`)
    if (!f.competitorPlatforms.hasData && !f.searchDemand.hasData && !f.serp.hasData) L.push('  · (no structured niche data yet — using the archetype prior; confidence low)')

    if (s.prerequisites.length) {
        L.push('PREREQUISITES — these integrations are NOT connected. For each, emit ONE explicit prerequisite task "לחבר X" + a first-use task (do NOT assume the channel works, do NOT propose creating a new account):')
        for (const p of s.prerequisites) L.push(`  · ${p.integration} (${p.priority}) — needed for: ${p.forChannels.join(', ')}`)
    }

    L.push('ANTI-PATTERNS — never do these:')
    for (const a of s.antiPatterns) L.push(`  · ${a}`)

    if (s.deferredTactics.length) L.push(`DEFERRED TACTICS (decided against upstream — do NOT add tasks for these): ${s.deferredTactics.join(', ')}`)
    return L.join('\n')
}

/** Render the strategy as the prompt directive (English prompt, Hebrew task output). */
export function buildArchetypeStrategyDirective(s: ArchetypeStrategy): string {
    const RULES = '\nRULES: (1) Build the month around PRIMARY channels first; SECONDARY amplify; AVOID only on the stated condition. (2) Every PRIMARY channel must be operationalized — if it is CONNECT-FIRST, emit a "לחבר X" prerequisite AND a first-use task with a concrete description; do not silently drop it. (3) Every paid task respects the ROMI model + the chosen scenario budget. (4) Honor the niche facts over the archetype prior.'

    if (s.offerStrategies && s.offerStrategies.length > 1) {
        const head = [
            `═══ MULTI-OFFER STRATEGY — ${s.offerStrategies.length} DISTINCT OFFERS, EACH ITS OWN PLAN PATH (NON-NEGOTIABLE) ═══`,
            `This tenant sells ${s.offerStrategies.length} offers with different go-to-market motions. Build a DISTINCT set of tasks per offer below — do NOT blend them into one generic plan. Where a task serves a specific offer, make that clear in its title/summary.`,
        ].join('\n')
        const sections = s.offerStrategies.map((os, i) =>
            `\n━━━ OFFER ${i + 1}${os.offer.isPrimary ? ' (PRIMARY)' : ''}: ${os.offer.name}${os.offer.priceIls ? ` — ₪${os.offer.priceIls}${os.offer.recurring ? '/mo' : ''}` : ''} ━━━\n` + renderOne(os.strategy))
        return [head, ...sections, RULES].join('\n')
    }

    return '═══ BUSINESS ARCHETYPE STRATEGY — THE PLAN\'S STRATEGIC SPINE (NON-NEGOTIABLE) ═══\n' + renderOne(s) + RULES
}