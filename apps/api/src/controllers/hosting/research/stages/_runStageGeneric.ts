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
        // If hard failures present + revision wasn't accepted → confidence
        // downgraded automatically; UI surfaces the banner from
        // qualityGate.hardFailures.
        if (critique && !critique.skipped) {
            output.qualityGate = {
                pass: critique.pass,
                hardFailures: critique.hardFailures,
                warnings: critique.warnings,
                revised: !!critique.revisedContent,
            }
            if (!critique.pass && critique.hardFailures.length > 0 && !critique.revisedContent) {
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