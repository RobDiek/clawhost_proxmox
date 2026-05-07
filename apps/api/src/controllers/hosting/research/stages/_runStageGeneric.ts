/**
 * Generic per-stage controller — wraps the repetitive pattern shared across
 * every research-pipeline stage that uses the prompt builders + executor:
 *
 *   1. Acquire research lock (per-instance mutex)
 *   2. Load instance + answers + historical-assets block
 *   3. Build prompt via prompts.ts (per stageId)
 *   4. Run via stageExecutor.executeStage
 *   5. Persist result via stageExecutor.saveStageResult
 *   6. Release lock and return ok/fail
 *
 * Per-stage controllers (stages/<id>.ts) just call:
 *
 *   export const run = (c) => runStageGeneric(c, 'audience_personas')
 *
 * Stages with bespoke logic (paid_audit wrapper, content_plan wrapper,
 * future Phase 4 live-integration stages) implement run(c) directly and
 * skip this helper.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { getSubAgentModel, formatHistoricalAssets, getAvailableTools } from '../../agentSetup'
import {
    executeStage,
    saveStageResult,
    acquireResearchLock,
    releaseResearchLock,
} from '@/services/research/stageExecutor'
import { buildPromptForStage } from '@/services/research/prompts'
import { parseHybridResponse, rollupConfidence } from '@/services/research/hybridParser'
import { runSelfCritique } from '@/services/research/selfCritique'
import { DfsError } from '@/services/research/dataforseo'
import { prefetchCompetitorLandscape } from './prefetch/competitor_landscape'
import { prefetchSeoKeywordResearch } from './prefetch/seo_keyword_research'
import { prefetchAudiencePersonas } from './prefetch/audience_personas'
import { prefetchLinkAudit } from './prefetch/link_audit'
import { prefetchInternalSeoAudit } from './prefetch/internal_seo_audit'
import { prefetchAeoVisibility } from './prefetch/aeo_visibility'
import { prefetchCostTimelineModeling } from './prefetch/cost_timeline_modeling'
import type { ResearchDataV2, StageId } from '@/services/research/types'

/**
 * Per-stage DFS prefetch registry. Stages registered here run their
 * prefetcher BEFORE the prompt builder is invoked; the result is passed
 * as `dfsData` into PromptOpts. Stages without an entry skip the prefetch
 * entirely (current behavior unchanged).
 */
type Prefetcher = (instanceId: string, rd: ResearchDataV2) => Promise<unknown>

const STAGE_PREFETCHERS: Partial<Record<StageId, Prefetcher>> = {
    competitor_landscape: prefetchCompetitorLandscape,
    seo_keyword_research: prefetchSeoKeywordResearch,
    audience_personas:    prefetchAudiencePersonas,
    link_audit:           prefetchLinkAudit,
    internal_seo_audit:   prefetchInternalSeoAudit,
    aeo_visibility:       prefetchAeoVisibility,
    cost_timeline_modeling: prefetchCostTimelineModeling,
}

/**
 * Run a stage that has a registered prompt builder. Returns null on validation
 * failure (so the controller can short-circuit) — caller must `return` it.
 */
export async function runStageGeneric(c: Context, stageId: StageId): Promise<Response> {
    const instanceId = c.req.param('id')
    const lock = acquireResearchLock(instanceId)
    if (!lock.acquired) {
        return fail(c, `שלב מחקר כבר רץ כרגע. נסו שוב בעוד ${lock.secondsLeft} שניות, או המתינו לסיום.`, 429)
    }

    try {
        // Optional body — feedback for re-runs, validationMode for the
        // validation stage (ai_sim vs real_interviews). Fail-safe to {}.
        const body = await c.req.json<{ feedback?: string; validationMode?: 'ai_sim' | 'real_interviews' }>()
            .catch(() => ({} as { feedback?: string; validationMode?: 'ai_sim' | 'real_interviews' }))

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) {
            releaseResearchLock(instanceId)
            return fail(c, 'Instance not found.', 404)
        }

        const rd = (instance.researchData as ResearchDataV2 | null) || {}
        const answers = { ...((rd.answers as Record<string, unknown>) || {}) }
        // validationMode is consumed by the validation prompt builder, so
        // surface it through `answers` (no schema bloat for one-off flags).
        if (body.validationMode) answers.validationMode = body.validationMode

        const businessName = (answers.businessName as string) || 'העסק'
        const businessDesc = (answers.businessDescription as string) || ''

        const tools = await getAvailableTools(instance.ip, instance.rootPassword || undefined)
        const historicalAssetsBlock = formatHistoricalAssets(rd)

        // ─── DFS prefetch (manager goes to market) ──
        // Stages registered in STAGE_PREFETCHERS run their server-side
        // DataForSEO calls BEFORE the prompt is built — the prompt builder
        // (chef) gets ingredients ready, never has to estimate. DfsError
        // bubbles up with user-friendly Hebrew message; we map to 502.
        let dfsData: unknown = undefined
        let dfsCost = 0
        const prefetcher = STAGE_PREFETCHERS[stageId]
        if (prefetcher) {
            try {
                dfsData = await prefetcher(instanceId, rd)
                if (dfsData && typeof dfsData === 'object' && 'totalCostUsd' in dfsData) {
                    dfsCost = (dfsData as { totalCostUsd: number }).totalCostUsd
                }
            } catch (err) {
                releaseResearchLock(instanceId)
                if (err instanceof DfsError) {
                    return fail(c, err.userMessage, 502)
                }
                console.error(`[research/${stageId}] prefetch error:`, err)
                return fail(c, `שגיאה בשליפת נתוני DataForSEO: ${(err as Error).message}`, 502)
            }
        }

        const promptResult = buildPromptForStage(stageId, {
            businessName, businessDesc, answers, rd, feedback: body.feedback,
            tools, historicalAssetsBlock, dfsData,
        })
        if (!promptResult) {
            releaseResearchLock(instanceId)
            return fail(c, `Stage ${stageId} has no prompt builder`, 500)
        }

        const model = await getSubAgentModel(instanceId, promptResult.agentId)
        console.log(`[research/${stageId}] ${businessName} — agent=${promptResult.agentId} model=${model} useDirectApi=${promptResult.useDirectApi}`)

        const output = await executeStage({
            instanceId,
            instance: {
                ip: instance.ip,
                rootPassword: instance.rootPassword,
                researchData: rd,
            },
            stageId,
            prompt: promptResult.prompt,
            agentId: promptResult.agentId,
            useDirectApi: promptResult.useDirectApi,
            minLength: promptResult.minLength,
            model,
        })

        if (!output.content) {
            releaseResearchLock(instanceId)
            return fail(c, output.errorMessage || 'Stage failed', (output.httpCode || 500) as 400 | 500)
        }

        // ─── Self-critique gate (Phase 3.5e) ──
        // 2nd Anthropic call audits content against 10 quality_gate checks.
        // On hard failures (math/script/intent/source), critic produces a
        // revised version which we ship in place of the original. Warnings
        // are flagged but don't block. Critic call failures fall through
        // (skipped=true) — never blocks the pipeline on infra hiccups.
        let critique: Awaited<ReturnType<typeof runSelfCritique>> | null = null
        try {
            critique = await runSelfCritique({
                content: output.content,
                stageId,
                originalPrompt: promptResult.prompt,
                model,
                instanceId,
                businessName,
            })
            if (critique.revisedContent) {
                console.log(`[research/${stageId}] critic produced revision (${output.content.length} → ${critique.revisedContent.length} chars)`)
                output.content = critique.revisedContent
            }
        } catch (err) {
            // Should never throw (runSelfCritique catches), but defensive belt:
            console.warn(`[research/${stageId}] self-critique unexpectedly threw:`, (err as Error).message)
        }

        // ─── Parse hybrid response (JSON code-block + markdown narrative) ──
        // Per playbook §17 — structured records are JSON-first, narrative is
        // embedded markdown. Records get persisted alongside content for fast
        // downstream consumption (no re-parse on every read).
        const parsed = parseHybridResponse(output.content)
        // Phase 3.12 — server-side scorecard.total recomputation for
        // competitor_landscape. Model reliably emits scorecard components +
        // _formula_verification trail with correct arithmetic, but the
        // standalone `total` field disagrees (independent eyeballing, not
        // chain-of-thought). We compute the authoritative value from
        // components and overwrite both `total` and `_formula_verification`
        // so they're internally consistent. Ditto if model omits the field.
        if (stageId === 'competitor_landscape' && parsed.records) {
            recomputeCompetitorScorecards(parsed.records)
        }
        // Phase 3.17d — same problem on seo_keyword_research: model emits
        // opportunity.{components} + _formula_verification trail with correct
        // arithmetic, but the standalone `opportunity.total` and `aeo.total`
        // disagree. Server recomputes both from authoritative components.
        if (stageId === 'seo_keyword_research' && parsed.records) {
            recomputeKeywordScores(parsed.records)
        }
        // Phase E3 defense-in-depth — cost_timeline_modeling has its own
        // calibrated baselines computed in prefetch from IL constants. The
        // prompt tells the AI not to alter them, but as a safety net we
        // overwrite the financial fields back to the prefetch values. The AI
        // keeps its narrative (best_for, what_could_go_wrong, etc).
        if (stageId === 'cost_timeline_modeling' && parsed.records && dfsData) {
            recomputeCostTimelineRecords(parsed.records, dfsData)
        }
        // Phase 3.21b — Hebrew filler scrubber. After research stages produce
        // records, sweep through the Hebrew-prose text fields and substitute
        // common English filler that the model keeps reaching for despite
        // HEBREW_ONLY_BLOCK + critic enforcement. This is a SAFETY NET, not the
        // primary defense — prompt + critic should still catch most cases.
        if (parsed.records) {
            scrubEnglishFillerInRecords(parsed.records)
        }
        // Also scrub the markdown body since the model uses the same filler there.
        output.content = scrubEnglishFillerInText(output.content)
        if (parsed.records) output.records = parsed.records
        // Capture non-records JSON sibling fields (Phase 3.10b: our_link_profile,
        // link_gap_targets, cross_validation_matrix, etc.). UI per-stage
        // renderers read these to show structured panels beyond records[].
        if (parsed.rawJson && typeof parsed.rawJson === 'object') {
            const root = parsed.rawJson as Record<string, unknown>
            const extras: Record<string, unknown> = {}
            for (const k of Object.keys(root)) {
                if (k === 'records' || k === 'confidence') continue
                extras[k] = root[k]
            }
            if (Object.keys(extras).length > 0) output.extras = extras
        }
        if (dfsCost > 0) output.dfsCost = dfsCost
        const recRollup = parsed.records
            ? rollupConfidence(parsed.records as Array<{ confidence?: string }>)
            : undefined
        const finalConfidence = parsed.confidence || recRollup
        if (finalConfidence) output.confidence = finalConfidence
        if (parsed.jsonBlockMalformed) {
            console.warn(`[research/${stageId}] response had JSON block but it was malformed — content saved without records`)
        }

        // Persist quality gate metadata into the output for save + response.
        // Phase 3.14 — when server-side post-processing resolves a hard failure
        // (math_sanity for competitor_landscape, since recomputeCompetitorScorecards
        // already authoritatively fixed `total`), strip it from hardFailures and
        // file it under `autoCorrected` for the audit trail. This way pass=true
        // when the SHIPPED state is actually clean, even if the model's first
        // draft tripped a check.
        if (critique && !critique.skipped) {
            const remainingHardFailures: string[] = []
            const autoCorrected: string[] = []
            for (const f of critique.hardFailures) {
                // Math sanity is auto-corrected for stages where server-side
                // recompute owns the totals: competitor_landscape (scorecard)
                // and seo_keyword_research (opportunity + aeo).
                const stageHasRecompute = stageId === 'competitor_landscape'
                    || stageId === 'seo_keyword_research'
                    || stageId === 'cost_timeline_modeling'
                if (stageHasRecompute && /math_sanity|formula_verification|scorecard.*total|opportunity.*total|aeo.*total|monthly_budget|total_program|duration_months|monthly_kpi/i.test(f)) {
                    autoCorrected.push(f)
                } else {
                    remainingHardFailures.push(f)
                }
            }
            const stillHasHardFailures = remainingHardFailures.length > 0
            output.qualityGate = {
                pass: !stillHasHardFailures,
                hardFailures: remainingHardFailures,
                warnings: critique.warnings,
                revised: !!critique.revisedContent,
                ...(autoCorrected.length ? { autoCorrected } : {}),
            }
            if (stillHasHardFailures && !critique.revisedContent) {
                // Couldn't auto-fix → step the confidence down so UI flags it.
                if (output.confidence === 'high') output.confidence = 'medium'
                else if (output.confidence === 'medium') output.confidence = 'working_hypothesis'
            }
        } else if (critique?.skipped) {
            output.qualityGate = { pass: true, hardFailures: [], warnings: [], revised: false, skipped: true }
        }

        await saveStageResult(instanceId, stageId, output)
        console.log(`[research/${stageId}] complete: ${output.content.length} chars, source=${output.source}, records=${parsed.records?.length ?? 0}, dfsCost=$${dfsCost.toFixed(4)}, confidence=${finalConfidence ?? 'n/a'}, qualityGate=${output.qualityGate ? (output.qualityGate.pass ? 'pass' : `fail(${output.qualityGate.hardFailures.length}h/${output.qualityGate.warnings.length}w)`) : 'n/a'}`)

        releaseResearchLock(instanceId)
        return ok(c, {
            stageId,
            content: output.content,
            source: output.source,
            integrationsUsed: output.integrationsUsed,
            status: output.status,
            records: parsed.records ?? null,
            extras: output.extras,
            dfsCost: dfsCost || undefined,
            confidence: finalConfidence,
            qualityGate: output.qualityGate,
        }, `Stage ${stageId} complete.`)
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`runStageGeneric(${stageId}) error:`, err)
        return fail(c, `שלב המחקר נכשל`, 500)
    }
}

/**
 * Authoritative competitor-threat-scorecard recomputation.
 * Formula (per CLAUDE.md SEO playbook + prompts.ts §17):
 *   Total = 0.25·serp_overlap + 0.20·page_type_fit + 0.15·authority_trust_proof
 *         + 0.15·local_presence_quality + 0.15·content_system_maturity
 *         + 0.10·asset_linkability
 * Replaces both `total` and `_formula_verification` so the two are
 * internally consistent. Logs the discrepancy when the model's number
 * was off by > 0.5 — useful as an inline math-sanity signal that we
 * can't rely on the LLM to do this on its own.
 */
function recomputeCompetitorScorecards(records: unknown[]): void {
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const sc = rec.scorecard
        if (!sc || typeof sc !== 'object') continue
        const card = sc as Record<string, unknown>
        const num = (k: string): number => {
            const v = card[k]
            const n = typeof v === 'number' ? v : Number(v)
            return Number.isFinite(n) ? n : NaN
        }
        const so = num('serp_overlap')
        const ptf = num('page_type_fit')
        const atp = num('authority_trust_proof')
        const lpq = num('local_presence_quality')
        const csm = num('content_system_maturity')
        const al = num('asset_linkability')
        if (![so, ptf, atp, lpq, csm, al].every(Number.isFinite)) continue
        const computed = 0.25 * so + 0.20 * ptf + 0.15 * atp + 0.15 * lpq + 0.15 * csm + 0.10 * al
        const rounded = Math.round(computed * 100) / 100
        const reported = num('total')
        if (Number.isFinite(reported) && Math.abs(rounded - reported) > 0.5) {
            console.warn(`[research/competitor_landscape] scorecard.total drift: model=${reported} computed=${rounded} (record="${rec.name ?? 'unknown'}") — overriding`)
        }
        card.total = rounded
        card._formula_verification = `0.25·${so} + 0.20·${ptf} + 0.15·${atp} + 0.15·${lpq} + 0.15·${csm} + 0.10·${al} = ${(0.25 * so).toFixed(2)}+${(0.20 * ptf).toFixed(2)}+${(0.15 * atp).toFixed(2)}+${(0.15 * lpq).toFixed(2)}+${(0.15 * csm).toFixed(2)}+${(0.10 * al).toFixed(2)} = ${rounded}`
    }
}

/**
 * Authoritative recomputation for seo_keyword_research records.
 * Mirrors recomputeCompetitorScorecards but for the two scoring blocks in
 * each keyword record: opportunity (7 components) and aeo (5 components).
 *
 * Opportunity formula (per CLAUDE.md SEO playbook + prompts.ts):
 *   Total = 0.25·business_value + 0.20·win_probability + 0.15·qualified_demand
 *         + 0.15·click_yield + 0.10·aeo_fit + 0.10·cluster_leverage
 *         + 0.05·operational_ease
 *
 * AEO formula:
 *   Total = 0.30·synthesis_need + 0.25·fact_density + 0.20·follow_up_likelihood
 *         + 0.15·entity_specificity + 0.10·citation_value
 */
function recomputeKeywordScores(records: unknown[]): void {
    let oppDriftCount = 0
    let aeoDriftCount = 0
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const num = (obj: Record<string, unknown>, k: string): number => {
            const v = obj[k]
            const n = typeof v === 'number' ? v : Number(v)
            return Number.isFinite(n) ? n : NaN
        }
        // ─ opportunity (7 components) ─
        const opp = rec.opportunity
        if (opp && typeof opp === 'object') {
            const o = opp as Record<string, unknown>
            const bv = num(o, 'business_value')
            const wp = num(o, 'win_probability')
            const qd = num(o, 'qualified_demand')
            const cy = num(o, 'click_yield')
            const af = num(o, 'aeo_fit')
            const cl = num(o, 'cluster_leverage')
            const oe = num(o, 'operational_ease')
            if ([bv, wp, qd, cy, af, cl, oe].every(Number.isFinite)) {
                const computed = 0.25 * bv + 0.20 * wp + 0.15 * qd + 0.15 * cy + 0.10 * af + 0.10 * cl + 0.05 * oe
                const rounded = Math.round(computed * 100) / 100
                const reported = num(o, 'total')
                if (Number.isFinite(reported) && Math.abs(rounded - reported) > 0.5) oppDriftCount++
                o.total = rounded
                o._formula_verification = `0.25·${bv} + 0.20·${wp} + 0.15·${qd} + 0.15·${cy} + 0.10·${af} + 0.10·${cl} + 0.05·${oe} = ${(0.25 * bv).toFixed(2)}+${(0.20 * wp).toFixed(2)}+${(0.15 * qd).toFixed(2)}+${(0.15 * cy).toFixed(2)}+${(0.10 * af).toFixed(2)}+${(0.10 * cl).toFixed(2)}+${(0.05 * oe).toFixed(2)} = ${rounded}`
            }
        }
        // ─ aeo (5 components) ─
        const aeo = rec.aeo
        if (aeo && typeof aeo === 'object') {
            const a = aeo as Record<string, unknown>
            const sn = num(a, 'synthesis_need')
            const fd = num(a, 'fact_density')
            const fu = num(a, 'follow_up_likelihood')
            const es = num(a, 'entity_specificity')
            const cv = num(a, 'citation_value')
            if ([sn, fd, fu, es, cv].every(Number.isFinite)) {
                const computed = 0.30 * sn + 0.25 * fd + 0.20 * fu + 0.15 * es + 0.10 * cv
                const rounded = Math.round(computed * 100) / 100
                const reported = num(a, 'total')
                if (Number.isFinite(reported) && Math.abs(rounded - reported) > 0.5) aeoDriftCount++
                a.total = rounded
                a._formula_verification = `0.30·${sn} + 0.25·${fd} + 0.20·${fu} + 0.15·${es} + 0.10·${cv} = ${(0.30 * sn).toFixed(2)}+${(0.25 * fd).toFixed(2)}+${(0.20 * fu).toFixed(2)}+${(0.15 * es).toFixed(2)}+${(0.10 * cv).toFixed(2)} = ${rounded}`
            }
        }
    }
    if (oppDriftCount > 0 || aeoDriftCount > 0) {
        console.warn(`[research/seo_keyword_research] math drift overridden: opportunity=${oppDriftCount}/${records.length}, aeo=${aeoDriftCount}/${records.length}`)
    }
}

/**
 * Phase E3 defense-in-depth — recompute cost_timeline_modeling records'
 * financial fields back to the prefetch baselines. Even though the prompt
 * tells the model "don't change numbers", we don't trust LLMs with money.
 *
 * Per-record (matched by `scenario`):
 *   - monthly_budget_ils + breakdown overwritten from baseline.monthly_budget_ils
 *   - duration_months overwritten
 *   - total_program_ils overwritten
 *   - monthly_kpi_projection overwritten (12-month curve)
 *   - deliverables_summary overwritten from baseline.inputs
 * Model retains: best_for, what_could_go_wrong, early_warning_signs,
 * confidence, evidence, label_he, scenario.
 */
function recomputeCostTimelineRecords(records: unknown[], dfsData: unknown): void {
    if (!dfsData || typeof dfsData !== 'object') return
    const ctm = dfsData as { scenarios?: { smart?: Record<string, unknown>; aggressive?: Record<string, unknown> } }
    const baselines = ctm.scenarios
    if (!baselines) return

    let driftCount = 0
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const scenario = String(rec.scenario || '')
        if (scenario !== 'smart' && scenario !== 'aggressive') continue
        const baseline = baselines[scenario]
        if (!baseline) continue

        const baseMb = (baseline as Record<string, unknown>).monthly_budget_ils as Record<string, unknown> | undefined
        const baseDuration = (baseline as Record<string, unknown>).duration_months
        const baseTotal = (baseline as Record<string, unknown>).total_program_ils
        const baseKpi = (baseline as Record<string, unknown>).monthly_kpis
        const baseInputs = (baseline as Record<string, unknown>).inputs as Record<string, unknown> | undefined

        // Detect drift before overwrite — log if model deviated
        const reportedTotal = typeof rec.monthly_budget_ils === 'number' ? rec.monthly_budget_ils : null
        const baselineTotal = baseMb && typeof baseMb.total === 'number' ? baseMb.total : null
        if (reportedTotal !== null && baselineTotal !== null && Math.abs(reportedTotal - baselineTotal) > 50) {
            driftCount++
        }

        // Overwrite financial fields with calibrated baselines
        if (baseMb) {
            rec.monthly_budget_ils = baseMb.total
            rec.monthly_budget_breakdown_ils = {
                content_production: baseMb.content_production,
                link_outreach: baseMb.link_outreach,
                technical_seo: baseMb.technical_seo,
                seo_strategist: baseMb.seo_strategist,
                tooling_subscriptions: baseMb.tooling_subscriptions,
            }
        }
        if (baseDuration) rec.duration_months = baseDuration
        if (baseTotal !== undefined) rec.total_program_ils = baseTotal
        if (baseKpi) rec.monthly_kpi_projection = baseKpi
        if (baseInputs) {
            rec.deliverables_summary = {
                target_top_3_keywords: baseInputs.target_top_3_keyword_count,
                content_pieces_total: baseInputs.content_pieces_total,
                links_total: baseInputs.links_total,
                tech_seo_hours: baseInputs.tech_seo_hours,
            }
        }
    }
    if (driftCount > 0) {
        console.warn(`[research/cost_timeline_modeling] financial drift overridden in ${driftCount}/${records.length} records`)
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3.21b — Hebrew filler scrubber. Substitutes English filler words the
// model keeps inserting into Hebrew prose, despite HEBREW_ONLY_BLOCK + critic.
//
// The substitution table is conservative — only words that we observed in
// real production output AND have an unambiguous Hebrew translation that
// keeps the meaning intact. Whitespace + word-boundary aware so we don't
// mangle URLs, schema names (e.g. "FAQ schema"), or the allowlist (SEO,
// SERP, AEO, JTBD, schema markup, content hub, etc).
//
// This is a SAFETY NET, not the primary defense — prompt + critic should
// still catch most cases. Anything past those still gets scrubbed before
// reaching the user.

const FORBID_LIST_REPLACEMENTS: Array<[RegExp, string]> = [
    // Whole-word case-insensitive replacements with Hebrew equivalents.
    // Word boundaries handle Hebrew context — \b matches at the start/end of
    // a word, and Hebrew adjacent characters count as word characters via \w
    // in the unicode mode.
    [/\bRefresh\b/g, 'רענון'],
    [/\bBacklog\b/g, 'המתנה'],
    [/\bDefense play\b/gi, 'מהלך הגנתי'],
    [/\bpickup-only\b/gi, 'איסוף בלבד'],
    [/\bcross-sell\b/gi, 'מכירה צולבת'],
    [/\bupsell\b/gi, 'מכירה משדרגת'],
    [/\bentry product\b/gi, 'מוצר כניסה'],
    [/\bsynonym\b/gi, 'מילה נרדפת'],
    // "target" only when used as an English filler ("AEO target חזק", "featured_snippet target")
    // — preserve when part of a code identifier (target_keywords, ad_target, etc).
    [/(?<![\w_])target(?![\w_-])/g, 'מטרה'],
    // "section" only as a standalone English filler word inside Hebrew prose.
    [/(?<![\w_])section(?![\w_-])/g, 'סעיף'],
]

function scrubEnglishFillerInText(text: string): string {
    if (!text) return text
    let out = text
    for (const [pattern, replacement] of FORBID_LIST_REPLACEMENTS) {
        out = out.replace(pattern, replacement)
    }
    return out
}

const SCRUBBABLE_RECORD_FIELDS = [
    // ─ legacy + competitor_landscape + seo_keyword_research + personas + positioning ─
    'recommended_action',
    'cluster',
    'topical_authority_venn',
    'site_architecture_depth',
    'link_profile_depth',
    'page_type',
    'outreach_angle',
    'segment_definition',
    'mission',
    'positioning_statement',
    'brand_promise',
    'first_win_channel',
    'specific_action',
    // ─ Phase E1.2 internal_seo_audit ─
    'priority_action',
    'current_state',
    // ─ Phase E1.1 aeo_visibility ─
    'rationale',
    // ─ Phase E3 cost_timeline_modeling narrative fields ─
    'best_for',
    'label_he',
    // ─ Phase E2.4 reviews_intel narrative ─
    'what_we_learn',
] as const

function scrubEnglishFillerInRecords(records: unknown[]): void {
    let touched = 0
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        for (const field of SCRUBBABLE_RECORD_FIELDS) {
            const v = rec[field]
            if (typeof v === 'string') {
                const scrubbed = scrubEnglishFillerInText(v)
                if (scrubbed !== v) { rec[field] = scrubbed; touched++ }
            }
        }
        // Nested intent.jtbd
        if (rec.intent && typeof rec.intent === 'object') {
            const intent = rec.intent as Record<string, unknown>
            if (typeof intent.jtbd === 'string') {
                const scrubbed = scrubEnglishFillerInText(intent.jtbd)
                if (scrubbed !== intent.jtbd) { intent.jtbd = scrubbed; touched++ }
            }
        }
        // Arrays of strings — threats_to_us, content_gaps_at_competitor,
        // must_include_entities, plus Phase E3 cost_timeline_modeling narrative
        // arrays (what_could_go_wrong, early_warning_signs, risk_factors).
        for (const arrField of [
            'threats_to_us', 'content_gaps_at_competitor',
            'must_include_data_points', 'must_include_entities',
            'what_could_go_wrong', 'early_warning_signs', 'risk_factors',
        ]) {
            const arr = rec[arrField]
            if (Array.isArray(arr)) {
                for (let i = 0; i < arr.length; i++) {
                    if (typeof arr[i] === 'string') {
                        const scrubbed = scrubEnglishFillerInText(arr[i])
                        if (scrubbed !== arr[i]) { arr[i] = scrubbed; touched++ }
                    }
                }
            }
        }
    }
    if (touched > 0) {
        console.log(`[research] Hebrew filler scrubber: ${touched} substitutions across ${records.length} records`)
    }
}