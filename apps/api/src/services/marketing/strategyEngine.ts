/**
 * Archetype Strategy Framework — Phase 5: engine orchestrator + prompt directive.
 *
 * resolveArchetypeStrategy() runs the three deterministic layers in sequence:
 *   classify (Layer 2 prior) → groundToNiche (Layer 3 facts) → synthesize (Layers 4-5)
 * and returns the executable ArchetypeStrategy.
 *
 * buildArchetypeStrategyDirective() renders it as the strategic spine injected
 * into the skeleton + detailer prompts — the deterministic strategy the LLM
 * passes operationalize (instead of re-deriving a blended template each month).
 */

import type { ConnectedStack } from '../connectedStack'
import { classifyArchetypes } from './archetypeClassifier'
import { groundToNiche } from './nicheGrounding'
import { synthesizeStrategy, type ArchetypeStrategy } from './romiSynthesizer'

export type { ArchetypeStrategy } from './romiSynthesizer'

/** Run the full engine. Pure (no DB/LLM) — reads research_data + the resolved stack. */
export function resolveArchetypeStrategy(rd: any, stack: ConnectedStack, nowIso?: string): ArchetypeStrategy {
    const classification = classifyArchetypes(rd, stack, nowIso)
    const grounded = groundToNiche(classification, rd)
    return synthesizeStrategy(classification, grounded, stack, rd)
}

const ACTION_HE: Record<string, string> = {
    fund: 'FUND (paid)', organic: 'DO (organic/owned)', connect_first: 'CONNECT FIRST', defer: 'AVOID/LATER',
}

function notesToStr(notes: ArchetypeStrategy['rankedChannels'][number]['notes']): string {
    if (!notes.length) return ''
    return ' [' + notes.map(n => `${n.direction}: ${n.note} (${n.confidence}; ${n.evidence})`).join(' | ') + ']'
}

/** Render the strategy as the prompt directive (English prompt, Hebrew task output). */
export function buildArchetypeStrategyDirective(s: ArchetypeStrategy): string {
    const L: string[] = []
    L.push('═══ BUSINESS ARCHETYPE STRATEGY — THE PLAN\'S STRATEGIC SPINE (NON-NEGOTIABLE) ═══')
    L.push(`Archetype: ${s.archetypeNameEn} (${s.archetypeNameHe}) · confidence ${s.confidence} · ${s.modifiers.b2x}/${s.modifiers.locality}/${s.modifiers.intent}${s.modifiers.hybrid ? `/${s.modifiers.hybrid}` : ''}`)
    L.push(`Classification: ${s.classificationRationale}`)
    L.push(`Funnel motion: ${s.funnelMotion}`)
    L.push(`Primary KPI: ${s.primaryKpi}`)
    L.push(`ROMI model: ${s.romiModel}`)
    L.push(`Lead mechanism: ${s.leadMechanism}`)
    L.push(`Budget logic: ${s.budgetLogic}`)

    const byTier = (t: string) => s.rankedChannels.filter(c => c.tier === t)
    L.push('\nCHANNEL PRIORITIES — build the month around these in order. Tag = recommended action:')
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
    L.push('\nNICHE FACTS (facts > priors — these override the archetype default where present):')
    if (f.competitorPlatforms.hasData) L.push(`  · Competitor ad presence: ${f.competitorPlatforms.googleAdvertisers} on Google, ${f.competitorPlatforms.metaAdvertisers} on Meta (${f.competitorPlatforms.sample.slice(0, 3).join(', ')})`)
    if (f.searchDemand.hasData) L.push(`  · Search demand: total ${f.searchDemand.totalVolume}/mo, avg CPC ${f.searchDemand.avgCpcIls !== null ? '₪' + f.searchDemand.avgCpcIls : 'n/a'}${f.searchDemand.thin ? ', THIN' : ''}${f.searchDemand.highCpc ? ', HIGH-CPC' : ''}`)
    if (f.serp.hasData) L.push(`  · SERP features: ${[f.serp.localPack && 'local_pack', f.serp.aiOverview && 'ai_overview', f.serp.shopping && 'shopping'].filter(Boolean).join(', ') || 'none notable'}`)
    if (f.roas.hasData) L.push(`  · ROAS benchmark: ${f.roas.value}`)
    if (s.appliedOverrides.length) for (const o of s.appliedOverrides) L.push(`  · Applied override: "${o.factSignal}" → ${o.adjustment} (${o.confidence}; ${o.evidence})`)
    if (!f.competitorPlatforms.hasData && !f.searchDemand.hasData && !f.serp.hasData) L.push('  · (no structured niche data yet — using the archetype prior; confidence low)')

    if (s.prerequisites.length) {
        L.push('\nPREREQUISITES — these integrations are NOT connected. For each, emit ONE explicit prerequisite task "לחבר X" (do NOT assume the channel works, do NOT propose creating a new account):')
        for (const p of s.prerequisites) L.push(`  · ${p.integration} (${p.priority}) — needed for: ${p.forChannels.join(', ')}`)
    }

    L.push('\nANTI-PATTERNS — never do these:')
    for (const a of s.antiPatterns) L.push(`  · ${a}`)

    if (s.deferredTactics.length) {
        L.push(`\nDEFERRED TACTICS (decided against upstream — do NOT add tasks for these): ${s.deferredTactics.join(', ')}`)
    }

    L.push('\nRULES: (1) Build the month around PRIMARY channels first; SECONDARY amplify; AVOID only on the stated condition. (2) Per-offer, never a copy-paste blend. (3) Every paid task respects the ROMI model + the chosen scenario budget. (4) For a CONNECT-FIRST channel the task is the "לחבר" prerequisite, not execution. (5) Honor the niche facts over the archetype prior.')

    return L.join('\n')
}