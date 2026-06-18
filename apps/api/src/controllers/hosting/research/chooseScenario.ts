/**
 * POST /hosting/instances/:id/research/scenario/choose
 *
 * Phase 2026.01 — explicit user choice between Smart vs Aggressive scenarios
 * produced by strategy_options stage. Replaces the prior auto-select fallback
 * in content_plan.ts (which is now gated to require this commit first).
 *
 * Body: { scenario: 'smart' | 'aggressive' }
 * Writes: research_data.chosenScenario = { ...matchingRecord, chosenByUser, chosenAt }
 */

import type { Context } from 'hono'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../authHelper'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'

type ScenarioRecord = Record<string, unknown> & { scenario?: string }

export async function chooseScenario(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const body = await c.req.json<{ scenario?: string }>().catch(() => ({} as { scenario?: string }))
    const scenario = body.scenario
    if (scenario !== 'smart' && scenario !== 'aggressive') {
        return fail(c, 'יש לבחור תרחיש אסטרטגיה: smart או aggressive', 400)
    }

    const agent = await resolveActiveAgent(c, instanceId)
    const rd = await readResearchData(agent, instanceId) as Record<string, unknown>
    const results = (rd.results as Record<string, { records?: ScenarioRecord[] }> | undefined) || {}
    const stratRecords = results.strategy_options?.records
    if (!Array.isArray(stratRecords) || stratRecords.length === 0) {
        return fail(c, 'תחילה הריצו את שלב אסטרטגיה (strategy_options) — בלעדיו אין תרחישים לבחירה.', 422)
    }

    const match = stratRecords.find(r => r.scenario === scenario)
    if (!match) {
        return fail(c, `התרחיש "${scenario}" לא נמצא בפלט strategy_options. הריצו את השלב מחדש או בחרו תרחיש קיים.`, 422)
    }

    const chosenScenario = {
        ...match,
        chosenByUser: true,
        chosenAt: new Date().toISOString(),
        _autoSelected: false,
    }

    // Picking a scenario IS the decision that makes the strategy fresh — clear
    // the staleness markers that the strategy_options run cascaded onto its
    // dependent wrappers (chosenScenario, marketingIntents, …). Otherwise the
    // "שלבים שיש לרענן" banner lingers after a deliberate choice even though
    // nothing actually needs refreshing. (Mirrors scripts/pick-scenario.ts.)
    const rdNext = { ...rd, chosenScenario } as Record<string, unknown>
    const fr = rdNext._artifactFreshness as Record<string, { stale?: { sourceStage?: string } }> | undefined
    if (fr) {
        for (const k of Object.keys(fr)) {
            if (fr[k]?.stale?.sourceStage === 'strategy_options') delete fr[k].stale
        }
    }
    const plan = rdNext.plan as { stale?: Record<string, { stale?: unknown }>; staleWrappers?: Record<string, { stale?: unknown }> } & Record<string, { stale?: unknown }> | undefined
    for (const holder of [plan?.stale, plan?.staleWrappers, plan]) {
        if (!holder || typeof holder !== 'object') continue
        for (const key of ['chosenScenario', 'marketingIntents']) {
            const h = holder as Record<string, { stale?: unknown }>
            if (h[key]?.stale) delete h[key].stale
        }
    }

    await writeResearchData(agent, instanceId, rdNext)
    console.log(`[research/chooseScenario] ${instanceId} agent=${agent?.id} → scenario=${scenario}`)
    return ok(c, { scenario, chosenScenario }, 'תרחיש נשמר.')
}