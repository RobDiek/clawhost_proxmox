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

    await writeResearchData(agent, instanceId, { ...rd, chosenScenario })
    console.log(`[research/chooseScenario] ${instanceId} agent=${agent?.id} → scenario=${scenario}`)
    return ok(c, { scenario, chosenScenario }, 'תרחיש נשמר.')
}