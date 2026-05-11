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
import { runHebrewCleanup } from '@/services/research/hebrewCleanup'
import { DfsError } from '@/services/research/dataforseo'
import { prefetchCompetitorLandscape } from './prefetch/competitor_landscape'
import { prefetchSeoKeywordResearch } from './prefetch/seo_keyword_research'
import { prefetchAudiencePersonas } from './prefetch/audience_personas'
import { prefetchLinkAudit } from './prefetch/link_audit'
import { prefetchInternalSeoAudit } from './prefetch/internal_seo_audit'
import { prefetchAeoVisibility } from './prefetch/aeo_visibility'
import { prefetchCostTimelineModeling } from './prefetch/cost_timeline_modeling'
import type { ResearchDataV2, StageId } from '@/services/research/types'
import type { SeoKeywordResearchDfsData } from './prefetch/seo_keyword_research'
import { searchVolume, keywordDifficulty, LOCATION_IL } from '@/services/research/dataforseo'
import { resolveActiveAgent, readResearchData } from '@/services/agentContext'

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

        const __agent = await resolveActiveAgent(c, instanceId)
        const rd = (await readResearchData(__agent, instanceId)) as unknown as ResearchDataV2
        const answers = { ...((rd.answers as Record<string, unknown>) || {}) }
        // validationMode is consumed by the validation prompt builder, so
        // surface it through `answers` (no schema bloat for one-off flags).
        if (body.validationMode) answers.validationMode = body.validationMode

        // Phase 2.3.H — integration gate (defense-in-depth). Rejects
        // direct API calls when mandatory integrations are missing for this
        // stage. Frontend SHOULD have already gated; this is the safety net
        // that prevents burning DFS budget / Anthropic credits on a guaranteed
        // failure / wrong-output scenario.
        try {
            const { buildPreflight } = await import('@/services/research/integrationGate')
            const { getAgentIntegrations, getPrimaryAgent } = await import('@/services/agentIntegrations')
            // Phase 2.3.K — load agent_integrations bundle for brave/wordpress
            // (stored as rows rather than typed columns on instances/mateh_agents).
            const __at = getPrimaryAgent((instance.selectedComponents as string[]) || [])
            const __rows = await getAgentIntegrations(instanceId, __at, __agent?.id)
            const __ints: Record<string, { connected: boolean; config?: Record<string, unknown> }> = {}
            for (const r of __rows) {
                __ints[r.integrationType] = { connected: r.status === 'connected', config: r.config }
            }
            const gate = buildPreflight(
                { instance, agent: __agent, integrations: __ints },
                answers as Record<string, string | undefined>,
                stageId,
            )
            if (!gate.canProceed) {
                releaseResearchLock(instanceId)
                const msg = `שלב זה דורש חיבור של: ${gate.missingMandatory.map(r => r.label_he).join(' · ')}. עברו ל-"אינטגרציות" וחברו לפני הרצה.`
                return fail(c, msg, 422)
            }
        } catch (gateErr) {
            // Don't block on a malfunction in the gate itself — log + continue.
            console.warn(`[research/${stageId}] integration gate threw, falling through:`, (gateErr as Error).message)
        }

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
            // Phase QA round-5 — server-side DFS enrichment of volume / CPC /
            // KD per record. Model previously left these null for ~85-95% of
            // records because: (a) it had to cross-reference two separate
            // tables in the prompt (ideas vs. difficulty), and (b) it
            // generated long-tail records that aren't literally in the DFS
            // data — so per "no fabrication" instruction it returned null.
            // The server has the prefetched DFS dataset (700 ideas + 100
            // calibrated KD) — we look up by normalized keyword and inject
            // authoritative values. If keyword not in DFS → leaves null
            // (legitimate working_hypothesis territory).
            if (dfsData) {
                const stats = enrichKeywordRecordsFromDfs(
                    parsed.records,
                    dfsData as SeoKeywordResearchDfsData,
                )
                console.log(`[research/seo_keyword_research] DFS enrichment pass-1 (prefetched): matched ${stats.matched}/${parsed.records.length} records (vol=${stats.filledVolume}, cpc=${stats.filledCpc}, kd=${stats.filledKd}, pos=${stats.filledPosition}) | sources: ideas=${stats.sourceBreakdown.ideas} ranked=${stats.sourceBreakdown.rankedKeywords} gsc=${stats.sourceBreakdown.gsc} | missing-in-all=${stats.missingInAllSources}`)
                // ─ Pass-2: live DFS lookup for the actual record keywords ─
                // Pass-1 sources were collected during prefetch with seeds derived
                // from product names + business name. For many businesses (like
                // Storage Station) those seeds yield 700 IRRELEVANT keyword ideas
                // because DFS' "related" surface drifts. So volume + KD coverage
                // from pass-1 is sparse. Pass-2 fixes this: take the ~24 keywords
                // the model emitted and call searchVolume + keywordDifficulty
                // ON THEM specifically. searchVolume is free; KD bulk costs
                // ~$0.01/100 keywords. Run async-best-effort — failure logged,
                // pipeline doesn't fail.
                const langCode = (dfsData as SeoKeywordResearchDfsData).languageCode || 'he'
                try {
                    const live = await enrichRecordsLiveFromDfs(
                        parsed.records,
                        instanceId,
                        langCode,
                    )
                    console.log(`[research/seo_keyword_research] DFS enrichment pass-2 (live): vol=${live.filledVolume}, kd=${live.filledKd}, cpc=${live.filledCpc}, cost=$${live.costUsd.toFixed(4)}`)
                    dfsCost += live.costUsd
                } catch (err) {
                    console.warn(`[research/seo_keyword_research] DFS enrichment pass-2 failed:`, (err as Error).message)
                }
            }
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

        // Phase QA round-4 — residual English-in-Hebrew monitor. Walks the
        // scrubbed final output looking for English tokens (≥3 chars) that are
        // NOT in our allowlist. Pure logging — output goes to server logs so we
        // can iterate the dictionary without waiting for the critic to flag it.
        const residualUnknown = findUnknownEnglishInHebrew(output.content, parsed.records)
        if (residualUnknown.length > 0) {
            console.warn(`[research/${stageId}] residual non-allowlisted English tokens after scrub (${residualUnknown.length}): ${residualUnknown.slice(0, 20).join(', ')}${residualUnknown.length > 20 ? '…' : ''}`)
        }

        // Phase QA round-9 — Hebrew final-pass cleanup via Sonnet 4.6.
        // Scrubber + critic chase a long tail of jargon and never converge.
        // This pass takes a different approach: a single Sonnet call that
        // REWRITES content + records into pure Hebrew, preserving JSON
        // structure, schema names, brand names, and SEO acronym allowlist.
        // Cost: ~$0.03-0.10 per stage. Adds ~20-40s runtime. Worth it —
        // stops the round-after-round dictionary expansion.
        try {
            const cleanup = await runHebrewCleanup({
                content: output.content,
                records: parsed.records ?? undefined,
                instanceId,
                stageId,
            })
            if (cleanup.applied) {
                output.content = cleanup.cleanedContent
                if (cleanup.cleanedRecords) {
                    parsed.records = cleanup.cleanedRecords
                    output.records = cleanup.cleanedRecords
                }
            }
        } catch (err) {
            console.warn(`[research/${stageId}] hebrewCleanup unexpectedly threw:`, (err as Error).message)
        }
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

        // Phase 4.0 — sync the markdown's embedded JSON code-block with the
        // canonical recomputed records + extras. Without this the prose report
        // shows the LLM's original totals (e.g. scorecard.total=79.50) while
        // records[] holds the corrected ones (79.25). UI shows two different
        // numbers depending on which renderer reads what.
        if (parsed.records && (stageId === 'competitor_landscape' || stageId === 'seo_keyword_research')) {
            output.content = syncContentJsonBlock(
                output.content,
                parsed.records,
                output.extras,
                output.confidence as string | undefined,
            )
        }
        if (dfsCost > 0) output.dfsCost = dfsCost
        // Phase 4.0 — persist raw prefetch data alongside LLM output so
        // downstream stages can read calibrated signals directly instead
        // of having to re-derive them from the synthesised markdown.
        if (dfsData) output.dfsData = dfsData
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
                    continue
                }
                // Phase QA round-5 — language_script_qa is ALWAYS demoted out
                // of hardFailures. Modern IL SEO content is inherently
                // code-switching (audience, brand, citation, comparison are
                // all legitimate jargon). The previous "scrubber resolves all
                // → autoCorrected, else hard" logic chased a long tail and
                // kept blocking legitimate content. Now: if scrubber resolved
                // everything → autoCorrected. Else → warning (NOT hard) with
                // the survived words logged so we can iterate the dictionary.
                // Critic's own severity in the prompt also dropped to warning;
                // this code is the defense-in-depth in case the LLM still
                // listed it under hard_failures despite the prompt change.
                if (/language_script_qa|hebrew.script|filler/i.test(f)) {
                    const result = checkLanguageScriptResolution(f, output.content, parsed.records || [])
                    if (result.allResolved) {
                        autoCorrected.push(`${f} → resolved server-side (scrubber + allowlist)`)
                    } else {
                        // Demote to warning instead of failing. Survived words logged.
                        critique.warnings.push(`${f} | survived: ${result.surviving.join(', ')}`)
                    }
                    continue
                }
                remainingHardFailures.push(f)
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

        await saveStageResult(instanceId, stageId, output, __agent?.id)
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
            // Phase 4.0(fix2) — explicit null/undefined check. Number(null)===0
            // which passes Number.isFinite, masking the "degraded scorecard"
            // case (model emitted null for unavailable components but recompute
            // saw them as 0 and computed a misleadingly small total).
            if (v === null || v === undefined) return NaN
            const n = typeof v === 'number' ? v : Number(v)
            return Number.isFinite(n) ? n : NaN
        }
        const so = num('serp_overlap')
        const ptf = num('page_type_fit')
        const atp = num('authority_trust_proof')
        const lpq = num('local_presence_quality')
        const csm = num('content_system_maturity')
        const al = num('asset_linkability')
        if (![so, ptf, atp, lpq, csm, al].every(Number.isFinite)) {
            // Phase 4.0 — degraded-scorecard rule. If any component is null
            // (model honoured "data_unavailable, do not guess") then total +
            // _formula_verification stay null too. Skip recompute, leave
            // marker in place for UI to render "data unavailable" badge.
            card.total = null
            card._formula_verification = 'data_unavailable — cannot score without enrichment'
            continue
        }
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
 * Phase 4.0 — replace the JSON code-block embedded in the markdown report
 * with the post-processed records + extras. Without this, the prose report
 * shows the LLM's first-draft numbers (e.g. scorecard.total=79.50) while
 * records[] holds the canonical recomputed ones (79.25). Users see two
 * different scores depending on which renderer reads what.
 *
 * Implementation: find the first \`\`\`json ... \`\`\` fence after the
 * `## רשומות מובנות` heading and replace its body with a freshly
 * stringified object made from { records, ...extras, confidence }.
 *
 * Defensive: if anything looks off (no fence found, JSON parse of original
 * fails, etc.) — return content unchanged. We never want a sync bug to
 * blank out the report.
 */
function syncContentJsonBlock(
    content: string,
    records: unknown[],
    extras: Record<string, unknown> | undefined,
    confidence: string | undefined,
): string {
    try {
        // Find the JSON fence. Match both ```json and ``` (model is inconsistent).
        const fenceRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/m
        const match = content.match(fenceRegex)
        if (!match || !match[0] || !match[1]) return content

        // Compose the canonical JSON: records FIRST (UI parsers find them
        // by position), then sibling extras, then top-level confidence.
        const obj: Record<string, unknown> = { records }
        if (extras) {
            for (const k of Object.keys(extras)) obj[k] = extras[k]
        }
        if (confidence) obj.confidence = confidence

        const replacement = '```json\n' + JSON.stringify(obj, null, 2) + '\n```'
        return content.replace(fenceRegex, replacement)
    } catch (err) {
        console.warn(`[syncContentJsonBlock] failed — keeping original content:`, (err as Error).message)
        return content
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
 * Phase QA round-5 — DFS enrichment for seo_keyword_research records.
 *
 * Server-side authoritative volume/CPC/KD injection from the prefetched
 * DFS dataset. Replaces the previous implicit contract (model copies
 * values from a markdown table) with an explicit one (server looks up by
 * normalized keyword and overrides).
 *
 * **Multi-source lookup** (round-5 expansion). For many businesses the
 * DFS keyword_ideas endpoint returns mostly-irrelevant data because the
 * seeds (auto-derived from product names + business name) yield broad
 * "related" results that don't match the actual SEO surface area. The
 * GOLD data lives in:
 *
 *   - `rankedKeywords` — DFS' authoritative data for keywords this
 *     specific domain ranks on, with volume + KD straight from Google.
 *   - `gsc.queries` — Google's own impressions / clicks / position for
 *     real organic queries. No volume, but `current_position` + traffic
 *     signal beats DFS estimation by miles when GSC is connected.
 *
 * Lookup priority per field (first hit wins):
 *   volume:  ideas → rankedKeywords (no GSC fallback — GSC has no volume)
 *   CPC:     ideas → rankedKeywords
 *   KD:      bulk_difficulty → ideas embedded → rankedKeywords embedded
 *   current_position: GSC → rankedKeywords (GSC is more accurate)
 *
 * If keyword still not in any source → leaves whatever the model emitted
 * (null + working_hypothesis). That's the correct outcome — signals
 * "model invention" honestly to UI / downstream consumers.
 */
interface DfsEnrichmentStats {
    matched: number
    missingInAllSources: number
    filledVolume: number
    filledCpc: number
    filledKd: number
    filledPosition: number
    sourceBreakdown: { ideas: number; rankedKeywords: number; gsc: number }
}
function enrichKeywordRecordsFromDfs(
    records: unknown[],
    dfsData: SeoKeywordResearchDfsData,
): DfsEnrichmentStats {
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

    // ─ Build lookup maps from each source ──
    const ideasByKw = new Map<string, SeoKeywordResearchDfsData['ideas'][number]>()
    for (const i of dfsData.ideas) {
        if (i.keyword) ideasByKw.set(norm(i.keyword), i)
    }
    const calibratedKdByKw = new Map<string, number>()
    for (const d of dfsData.difficulty) {
        if (d.keyword && typeof d.keyword_difficulty === 'number') {
            calibratedKdByKw.set(norm(d.keyword), d.keyword_difficulty)
        }
    }
    interface RankedSnapshot { volume: number | null; cpc: number | null; kd: number | null; position: number | null }
    const rankedByKw = new Map<string, RankedSnapshot>()
    for (const r of dfsData.rankedKeywords) {
        const kw = r.keyword_data?.keyword
        if (!kw) continue
        const ki = r.keyword_data?.keyword_info
        const pos = r.ranked_serp_element?.serp_item?.rank_absolute
        rankedByKw.set(norm(kw), {
            volume: typeof ki?.search_volume === 'number' ? ki.search_volume : null,
            cpc: typeof ki?.cpc === 'number' ? ki.cpc : null,
            kd: typeof ki?.keyword_difficulty === 'number' ? ki.keyword_difficulty : null,
            position: typeof pos === 'number' ? pos : null,
        })
    }
    interface GscSnapshot { position: number; impressions: number; clicks: number }
    const gscByKw = new Map<string, GscSnapshot>()
    for (const q of dfsData.gsc.queries) {
        if (q.query) gscByKw.set(norm(q.query), { position: q.position, impressions: q.impressions, clicks: q.clicks })
    }

    const stats: DfsEnrichmentStats = {
        matched: 0, missingInAllSources: 0,
        filledVolume: 0, filledCpc: 0, filledKd: 0, filledPosition: 0,
        sourceBreakdown: { ideas: 0, rankedKeywords: 0, gsc: 0 },
    }
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const kwRaw = typeof rec.keyword === 'string' ? rec.keyword : null
        if (!kwRaw) continue
        const key = norm(kwRaw)
        const idea = ideasByKw.get(key)
        const ranked = rankedByKw.get(key)
        const gsc = gscByKw.get(key)
        const calibratedKd = calibratedKdByKw.get(key)

        const anySource = idea || ranked || gsc || calibratedKd !== undefined
        if (!anySource) {
            stats.missingInAllSources++
            continue
        }
        stats.matched++
        if (idea) stats.sourceBreakdown.ideas++
        if (ranked) stats.sourceBreakdown.rankedKeywords++
        if (gsc) stats.sourceBreakdown.gsc++

        // volume — ideas first, then rankedKeywords
        let vol: number | null = null
        if (idea?.keyword_info && typeof idea.keyword_info.search_volume === 'number') {
            vol = idea.keyword_info.search_volume
        } else if (ranked?.volume !== null && ranked?.volume !== undefined) {
            vol = ranked.volume
        }
        if (vol !== null) {
            rec.volume_monthly = vol
            stats.filledVolume++
        }

        // CPC — ideas first, then rankedKeywords
        let cpc: number | null = null
        if (idea?.keyword_info && typeof idea.keyword_info.cpc === 'number') {
            cpc = idea.keyword_info.cpc
        } else if (ranked?.cpc !== null && ranked?.cpc !== undefined) {
            cpc = ranked.cpc
        }
        if (cpc !== null) {
            rec.cpc_ils = Math.round(cpc * 100) / 100
            stats.filledCpc++
        }

        // KD — calibrated bulk KD wins, else ideas embedded, else rankedKeywords embedded
        let kd: number | null = null
        if (typeof calibratedKd === 'number') {
            kd = calibratedKd
        } else if (typeof idea?.keyword_properties?.keyword_difficulty === 'number') {
            kd = idea.keyword_properties.keyword_difficulty
        } else if (typeof idea?.keyword_info?.keyword_difficulty === 'number') {
            kd = idea.keyword_info.keyword_difficulty
        } else if (ranked?.kd !== null && ranked?.kd !== undefined) {
            kd = ranked.kd
        }
        if (kd !== null) {
            rec.difficulty_0_100 = kd
            stats.filledKd++
        }

        // current_position — GSC's actual avg position beats DFS rank_absolute snapshot
        let pos: number | null = null
        if (gsc) {
            pos = Math.round(gsc.position * 10) / 10
        } else if (ranked?.position !== null && ranked?.position !== undefined) {
            pos = ranked.position
        }
        if (pos !== null) {
            rec.current_position = pos
            stats.filledPosition++
        }
    }
    return stats
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
        const baseAgency = (baseline as Record<string, unknown>).agency_comparison_ils as Record<string, unknown> | undefined
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

        // Overwrite financial fields — Phase QA round-8 platform-DIY breakdown
        if (baseMb) {
            rec.monthly_budget_ils = baseMb.total
            rec.monthly_budget_breakdown_ils = {
                platform_subscription: baseMb.platform_subscription,
                anthropic_api: baseMb.anthropic_api,
                backlink_acquisition: baseMb.backlink_acquisition,
                paid_ads: baseMb.paid_ads,
                external_tooling: baseMb.external_tooling,
            }
        }
        // Agency comparison side-block (round-8) — narrative-only, server-authoritative
        if (baseAgency) {
            rec.agency_comparison_ils = {
                content_production: baseAgency.content_production,
                link_outreach_labor: baseAgency.link_outreach_labor,
                technical_seo: baseAgency.technical_seo,
                seo_strategist: baseAgency.seo_strategist,
                tooling_subscriptions: baseAgency.tooling_subscriptions,
                total_monthly: baseAgency.total_monthly,
                total_program: baseAgency.total_program,
                savings_vs_diy_total: baseAgency.savings_vs_diy_total,
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

/**
 * Phase QA round-5 pass-2 — live DFS lookup for the actual record keywords.
 *
 * The prefetch (pass-1) gathers data using seeds DERIVED from product names
 * and business name. For many businesses (Storage Station was the canary)
 * those seeds yield "related" ideas that drift far from the SEO surface area
 * the model actually generates records for — so volume / KD coverage in
 * pass-1 is poor (4/24 in our test).
 *
 * Pass-2 inverts the contract: take the keywords the MODEL emitted, batch
 * them into a single searchVolume (free) + a single keywordDifficulty bulk
 * (cheap) call, inject. This guarantees coverage matches what's actually
 * shipped to the user.
 *
 * Strategy:
 *   - searchVolume up to 1000 keywords/call → volume + CPC + competition
 *   - keywordDifficulty up to 1000 keywords/call → calibrated KD
 *   - Both endpoints are cached (params keyed) → re-runs are $0.
 *   - Fail-safe: errors logged, pass-2 results merged best-effort.
 */
interface LiveEnrichmentStats {
    filledVolume: number
    filledKd: number
    filledCpc: number
    costUsd: number
}
async function enrichRecordsLiveFromDfs(
    records: unknown[],
    instanceId: string,
    languageCode: 'he' | 'en',
): Promise<LiveEnrichmentStats> {
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const keywordsRaw = records
        .map(r => (r && typeof r === 'object' && typeof (r as Record<string, unknown>).keyword === 'string')
            ? ((r as Record<string, unknown>).keyword as string).trim()
            : null)
        .filter((k): k is string => !!k && k.length > 0)
    const keywordsUnique = Array.from(new Set(keywordsRaw))
    const out: LiveEnrichmentStats = { filledVolume: 0, filledKd: 0, filledCpc: 0, costUsd: 0 }
    if (keywordsUnique.length === 0) return out

    // ─ searchVolume (free) — volume + CPC + competition ──
    const svByKw = new Map<string, { search_volume: number | null; cpc: number | null }>()
    try {
        const sv = await searchVolume(instanceId, keywordsUnique, {
            location_code: LOCATION_IL,
            language_code: languageCode,
        })
        out.costUsd += sv.cost
        for (const item of sv.items) {
            if (item.keyword) {
                svByKw.set(norm(item.keyword), {
                    search_volume: typeof item.search_volume === 'number' ? item.search_volume : null,
                    cpc: typeof item.cpc === 'number' ? item.cpc : null,
                })
            }
        }
    } catch (err) {
        console.warn(`[research/seo_keyword_research] live searchVolume failed:`, (err as Error).message)
    }

    // ─ keywordDifficulty bulk — calibrated KD ──
    const kdByKw = new Map<string, number>()
    try {
        const kd = await keywordDifficulty(instanceId, keywordsUnique, {
            location_code: LOCATION_IL,
            language_code: languageCode,
        })
        out.costUsd += kd.cost
        for (const item of kd.items) {
            if (item.keyword && typeof item.keyword_difficulty === 'number') {
                kdByKw.set(norm(item.keyword), item.keyword_difficulty)
            }
        }
    } catch (err) {
        console.warn(`[research/seo_keyword_research] live keywordDifficulty failed:`, (err as Error).message)
    }

    // ─ Merge into records ──
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const kwRaw = typeof rec.keyword === 'string' ? rec.keyword : null
        if (!kwRaw) continue
        const key = norm(kwRaw)

        const sv = svByKw.get(key)
        if (sv) {
            // Only overwrite if currently null/missing — preserve any earlier
            // pass-1 values that came from rankedKeywords (which is more
            // domain-authoritative than search_volume Google Ads estimate).
            if (rec.volume_monthly == null && typeof sv.search_volume === 'number') {
                rec.volume_monthly = sv.search_volume
                out.filledVolume++
            }
            if (rec.cpc_ils == null && typeof sv.cpc === 'number') {
                rec.cpc_ils = Math.round(sv.cpc * 100) / 100
                out.filledCpc++
            }
        }

        const kdVal = kdByKw.get(key)
        if (rec.difficulty_0_100 == null && typeof kdVal === 'number') {
            rec.difficulty_0_100 = kdVal
            out.filledKd++
        }
    }

    return out
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
    // Phase QA round-2 — words critic caught on stage 3 (seo_keyword_research).
    // These leaked through despite HEBREW_ONLY_BLOCK — the model uses them as
    // filler verbs/nouns inside Hebrew prose. Conservative regex anchors to
    // avoid mangling URLs (e.g. example.com/push-notifications) or code
    // identifiers (e.g. push_method).
    [/(?<![\w_/-])push(?![\w_-])/gi, 'דחיפה'],
    [/(?<![\w_])angle(?![\w_-])/gi, 'זווית'],
    [/(?<![\w_])variants?(?![\w_-])/gi, 'וריאציות'],
    [/(?<![\w_])flag(?![\w_-])/gi, 'סימון'],
    [/(?<![\w_])rebuild(?![\w_-])/gi, 'בנייה מחדש'],
    [/(?<![\w_])hub(?![\w_-])/gi, 'מרכז'],
    [/(?<![\w_])sub-section(?![\w_-])/gi, 'תת-סעיף'],
    [/(?<![\w_])fog(?![\w_-])/gi, 'ערפל'],
    [/(?<![\w_])happens(?![\w_-])/gi, 'מתרחש'],
    [/(?<![\w_])variants(?![\w_-])/gi, 'וריאציות'],
    [/\bmarketing fog\b/gi, 'ערפל שיווקי'],
    [/\bconversion\s+happens\b/gi, 'המרה מתרחשת'],
    [/\bdomain authority\b/gi, 'authority של הדומיין'],  // keep "authority" as allowed jargon
    // Phase QA round-3 — words critic caught on stage 3 re-run.
    [/\bfast win\b/gi, 'ניצחון מהיר'],
    [/\bpain point\b/gi, 'נקודת כאב'],
    [/\bvideo tour\b/gi, 'סיור וידאו'],
    [/\bglossary section\b/gi, 'מילון מונחים'],
    [/\bacquisition pathway\b/gi, 'מסלול לקוח'],
    [/(?<![\w_])duplicate(?![\w_-])/gi, 'כפיל'],
    [/(?<![\w_])thin(?![\w_-])/gi, 'דק'],
    [/(?<![\w_])bridge(?![\w_-])/gi, 'גשר'],
    // Phase QA round-6 — AEO/founder-readability scrubs. Schema names
    // (Organization, FAQPage, BlogPosting, etc) MUST stay in English (JSON-LD
    // literals). But common SEO/marketing jargon in the executive narrative
    // is translatable and should be Hebrew so a non-pro business owner can
    // actually read the dashboard. Keep the recommendation actionable for
    // the developer/SEO lead via record fields, but make the summary human.
    [/\bextractability gap\b/gi, 'פער חילוץ נתונים'],
    [/\bextractability\b/gi, 'יכולת חילוץ'],
    [/\bentity disambiguation\b/gi, 'זיהוי ישות'],
    [/\bcitation magnets?\b/gi, 'מגנטי ציטוט'],
    [/\banswer-?blocks?\b/gi, 'בלוקי תשובה'],
    [/\bTL;DR\b/gi, 'תקציר'],
    [/\btable of contents\b/gi, 'תוכן עניינים'],
    [/\banchor links?\b/gi, 'קישורי עוגן'],
    [/\bsummary paragraph\b/gi, 'פסקת סיכום'],
    [/\bpre-?requisite\b/gi, 'תנאי מקדים'],
    [/\bquick wins?\b/gi, 'ניצחונות מהירים'],
    // Phase QA round-4 — words critic caught on stage 3 re-run after round-3.
    // Multi-word phrases first (replaced before unigrams to avoid clobbering).
    [/\bfast optimization\b/gi, 'אופטימיזציה מהירה'],
    [/\bflag risk\b/gi, 'סימון סיכון'],
    [/\bentry point\b/gi, 'נקודת כניסה'],
    [/\bunit size matrix\b/gi, 'מטריצת גדלי יחידות'],
    [/\bsize matrix interactive\b/gi, 'מחשבון גדלים אינטראקטיבי'],
    [/\bsize matrix\b/gi, 'מטריצת גדלים'],
    // Unigrams — careful with `distance`: keep the SEO term "striking distance"
    // intact via a negative-lookbehind on "striking ".
    [/(?<!striking )(?<![\w_])distance(?![\w_-])/gi, 'מרחק'],
    [/(?<![\w_])minimum(?![\w_-])/gi, 'מינימום'],
    [/(?<![\w_])address(?![\w_-])/gi, 'כתובת'],
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

// ────────────────────────────────────────────────────────────────────────────
// Phase QA round-4 — regex-based residual English-in-Hebrew detector +
// language_script_qa resolution check.
//
// Two structures:
//
//   ALLOWLIST  — single English tokens (lowercase) that are LEGITIMATE jargon
//                in modern SEO/marketing/tech writing and must NOT be flagged.
//                We accept them in Hebrew prose because translating them
//                ("CTR" → "אחוז הקלקות") is awkward and harms readability for
//                the target audience (Israeli marketers / SEO pros).
//
//   ALLOWPHRASES — multi-word English phrases (lowercase) that are intact
//                  technical terms ("striking distance", "money page", etc).
//                  We mask these in the haystack BEFORE unigram scanning so a
//                  word like "distance" inside "striking distance" is not
//                  flagged in isolation.
//
// findUnknownEnglishInHebrew → returns english tokens in the haystack that
// pass NEITHER allowlist NOR allowphrase masking. Used for monitoring
// (console.warn) so we can iterate the dictionary based on what the model
// actually generates, instead of waiting for the critic to reject a run.
//
// checkLanguageScriptResolution → given a critic failure message + the
// post-scrub final content, parses the single-quoted offending phrases and
// for each: (1) extract the English subspan, (2) check allowlist hit
// (allowed jargon → considered resolved), (3) check haystack presence
// (scrubber removed it → considered resolved). Returns { allResolved,
// surviving } so qualityGate can decide hard-failure vs autoCorrected.

const HEBREW_PROSE_ALLOWLIST = new Set<string>([
    // SEO acronyms — universally allowed in IL SEO writing
    'seo', 'sem', 'serp', 'serps', 'aeo', 'geo', 'gsc', 'gmb', 'gbp', 'ymyl',
    'eat', 'eeat', 'ctr', 'cpc', 'cpm', 'cpa', 'roi', 'kpi', 'kpis', 'roas',
    'aov', 'ltv', 'cac', 'mrr', 'arr', 'jtbd', 'icp', 'ux', 'ui', 'cro',
    // Search/ranking jargon
    'rank', 'ranking', 'rankings', 'keyword', 'keywords', 'longtail', 'shorttail',
    'snippet', 'snippets', 'lcp', 'cls', 'fid', 'inp',
    'authority', 'anchor', 'anchors', 'pillar', 'cluster', 'clusters',
    'evergreen', 'listicle', 'silo', 'siloing', 'crawl', 'crawler', 'crawling',
    'index', 'indexed', 'indexable', 'redirect', 'redirects',
    // Schema / HTML / web standards
    'schema', 'jsonld', 'microdata', 'opengraph', 'rdfa',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'alt', 'meta', 'noindex', 'nofollow',
    'dofollow', 'canonical', 'hreflang', 'sitemap', 'robots', 'rel',
    'breadcrumb', 'breadcrumbs', 'faq', 'faqpage', 'localbusiness',
    'organization', 'product', 'review', 'aggregaterating',
    // E-commerce / marketing funnel
    'cta', 'ctas', 'mof', 'tof', 'bof', 'awareness', 'consideration', 'decision',
    'leakage', 'leakages', 'funnel', 'funnels', 'cohort', 'cohorts',
    'churn', 'retention', 'activation', 'acquisition', 'conversion', 'conversions',
    'upsell', 'cross-sell', 'crossell', 'bundle', 'bundles',
    // Tech / protocols
    'http', 'https', 'html', 'css', 'json', 'xml', 'csv',
    'pdf', 'cdn', 'dns', 'ssl', 'tls', 'tcp', 'url', 'urls', 'utm', 'utms',
    'cms', 'crm', 'erp', 'saas', 'paas', 'iaas', 'b2b', 'b2c', 'smb', 'd2c',
    'api', 'apis', 'rest', 'webhook', 'webhooks', 'oauth',
    // Brands / tools / platforms
    'google', 'bing', 'yandex', 'chatgpt', 'claude', 'perplexity', 'gemini',
    'copilot', 'anthropic', 'openai', 'meta', 'facebook', 'instagram',
    'youtube', 'tiktok', 'linkedin', 'twitter', 'whatsapp', 'telegram',
    'wordpress', 'shopify', 'woocommerce', 'wix', 'squarespace', 'webflow',
    'ahrefs', 'semrush', 'moz', 'frog', 'screaming',
    'dataforseo', 'searchconsole', 'analytics',
    // Common loanwords used freely in IL marketing
    'webinar', 'webinars', 'podcast', 'podcasts', 'newsletter', 'newsletters',
    'whitepaper', 'whitepapers', 'ebook', 'ebooks', 'infographic', 'infographics',
    'landing', 'page', 'pages', 'homepage', 'about', 'contact', 'pricing',
    // Storage / units (false positives in cost data)
    'gb', 'mb', 'kb', 'tb',
])

const HEBREW_PROSE_ALLOWPHRASES = [
    'striking distance', 'domain authority', 'page authority',
    'money page', 'money pages', 'topical authority',
    'featured snippet', 'rich snippet', 'rich snippets',
    'rich results', 'rich result',
    'knowledge panel', 'knowledge graph', 'people also ask', 'related searches',
    'core web vitals', 'web vitals', 'crawl budget', 'render budget',
    'search intent', 'user intent', 'transactional intent', 'commercial intent',
    'informational intent', 'navigational intent',
    'long tail', 'short tail', 'fat head', 'mid tail',
    'zero click', 'click through rate',
    'striking distance keyword', 'striking distance keywords',
    'evergreen content', 'pillar page', 'pillar content',
    'topic cluster', 'content hub', 'content silo',
    'link building', 'link velocity', 'link earning', 'link bait',
    'inbound link', 'inbound links', 'outbound link', 'outbound links',
    'internal link', 'internal links', 'external link', 'external links',
    'best practice', 'best practices', 'use case', 'use cases',
]

function findUnknownEnglishInHebrew(content: string, records: unknown): string[] {
    let haystack = String(content || '').toLowerCase()
    if (records && typeof records === 'object') {
        haystack += ' ' + JSON.stringify(records).toLowerCase()
    }
    // Mask allowphrases first so unigram scanning skips them.
    for (const phrase of HEBREW_PROSE_ALLOWPHRASES) {
        haystack = haystack.split(phrase).join(' ___allowed___ ')
    }
    const matches = haystack.match(/\b[a-z][a-z'-]{2,}\b/g) || []
    const unknown = new Set<string>()
    for (const m of matches) {
        if (m === '___allowed___') continue
        if (HEBREW_PROSE_ALLOWLIST.has(m)) continue
        unknown.add(m)
    }
    return [...unknown].sort()
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface LanguageScriptCheck {
    allResolved: boolean
    surviving: string[]
}

function checkLanguageScriptResolution(
    failure: string,
    finalContent: string,
    finalRecords: unknown[],
): LanguageScriptCheck {
    // Critic's failure message format includes single-quoted offenders, e.g.
    //   "language_script_qa: מילים אסורות: 'fast win', 'AOV גבוה', 'address מדויק'"
    const flaggedRaw = failure.match(/'([^']{1,80})'/g) || []
    if (flaggedRaw.length === 0) {
        // No quoted phrases — can't verify. Conservative: keep as hard failure.
        return { allResolved: false, surviving: [] }
    }
    const haystack = (finalContent + ' ' + JSON.stringify(finalRecords)).toLowerCase()
    const surviving: string[] = []
    for (const raw of flaggedRaw) {
        const phrase = raw.slice(1, -1).trim()
        // Extract first English run from the phrase (critic includes Hebrew context).
        const englishMatch = phrase.match(/[A-Za-z][A-Za-z\s'-]{1,}[A-Za-z]/) || phrase.match(/[A-Za-z]+/)
        const english = englishMatch ? englishMatch[0].trim().toLowerCase() : null
        if (!english) continue  // pure-Hebrew flag — drop
        // Allowlist hit → considered resolved (over-flag by critic).
        if (HEBREW_PROSE_ALLOWLIST.has(english)) continue
        if (HEBREW_PROSE_ALLOWPHRASES.includes(english)) continue
        // Haystack hit → still present in final output, scrubber didn't remove it.
        if (new RegExp(`\\b${escapeRegex(english)}\\b`, 'i').test(haystack)) {
            surviving.push(english)
        }
    }
    return { allResolved: surviving.length === 0, surviving }
}