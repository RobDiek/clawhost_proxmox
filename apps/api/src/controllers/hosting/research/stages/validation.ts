/**
 * Stage: validation — KPI realism check + blindspot detection on the
 * generated strategy. Two modes:
 *   - ai_sim (default): role-play 3 personas critiquing the strategy
 *   - real_interviews: produce a Mom-Test customer-discovery script
 *
 * Mode chosen via POST body { validationMode: 'ai_sim' | 'real_interviews' }.
 *
 * Lifted from agentSetup.ts:buildResearchPrompt(stage=5). When upstream
 * stages were 'degraded', Phase 5 will aggregate warnings here and propagate
 * them onto strategy view via plan.status[validation].degradedReasons.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'validation')
}