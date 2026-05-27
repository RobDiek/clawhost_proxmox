/**
 * Stage: client_account_baseline — pull Google Ads + GA4 historical reality
 * data once per research session. Every downstream paid stage reads from
 * `rd.results.client_account_baseline` instead of refetching.
 *
 * Phase 4.2.1. See [client_account_baseline.ts](./prefetch/client_account_baseline.ts)
 * for the prefetcher that does the actual API work.
 *
 * Wraps runStageGeneric — prefetch + prompt + executor + persist + critique
 * all happen via the generic flow. This stage's prompt is intentionally
 * minimal — its primary value is the prefetch result, not Opus analysis.
 *
 * Phase 2026.02 post-hook: extract conv_value_quality_subscore_0_100 +
 * rationale_he from the stored content JSON and promote to top-level
 * result.extras. Downstream stages (paid_keyword_research, paid_audit)
 * read these via extras (cheap JSON access) — without this promotion
 * they default to "subscore not supplied from upstream" and waste the
 * Mom-Test detection done in this stage.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { runStageGeneric } from './_runStageGeneric'
import { parseHybridResponse } from '@/services/research/hybridParser'

export async function run(c: Context): Promise<Response> {
    const result = await runStageGeneric(c, 'client_account_baseline')
    // After generic ran, promote conv_value_quality fields to top-level extras
    // so downstream stages can read them directly via rd.results...extras.
    await promoteConvValueQualityToExtras(c.req.param('id'), c)
    return result
}

async function promoteConvValueQualityToExtras(instanceId: string, c: import('hono').Context): Promise<void> {
    try {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) return
        const { resolveActiveAgent, readResearchData, writeResearchData } = await import('@/services/agentContext')
        const agent = await resolveActiveAgent(c, instanceId)
        const rd = await readResearchData(agent, instanceId) as Record<string, unknown>
        const results = (rd.results as Record<string, Record<string, unknown>> | undefined) || {}
        const stageResult = results.client_account_baseline as Record<string, unknown> | undefined
        if (!stageResult || typeof stageResult.content !== 'string') return

        const parsed = parseHybridResponse(stageResult.content)
        if (!parsed.rawJson || typeof parsed.rawJson !== 'object') return
        const root = parsed.rawJson as Record<string, unknown>

        // Build/merge extras with conv_value_quality fields + any other non-records siblings.
        const existingExtras = (stageResult.extras as Record<string, unknown> | undefined) || {}
        const nextExtras: Record<string, unknown> = { ...existingExtras }
        for (const k of Object.keys(root)) {
            if (k === 'records' || k === 'confidence') continue
            nextExtras[k] = root[k]
        }
        if (Object.keys(nextExtras).length === 0) return

        // Persist back atomically.
        const nextResult = { ...stageResult, extras: nextExtras }
        const nextResults = { ...results, client_account_baseline: nextResult }
        await writeResearchData(agent, instanceId, { ...rd, results: nextResults })
        console.log(`[client_account_baseline] extras promoted (${Object.keys(nextExtras).length} keys including conv_value_quality)`)
    } catch (err) {
        console.warn('[client_account_baseline] extras promotion failed (non-fatal):', (err as Error).message)
    }
}