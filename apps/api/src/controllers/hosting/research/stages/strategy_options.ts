/**
 * Stage: strategy_options — channel strategy with FIRST WIN focus, KPIs,
 * 30-day plan, budget allocation, risks. Universal stage — every intent
 * ends here before chosenScenario commit.
 *
 * Lifted from agentSetup.ts:buildResearchPrompt(stage=4). Reads competitor_
 * landscape + seo_keyword_research + audience_personas + positioning as
 * inputs. The chosenScenario flow (commitStrategyScenario) stays untouched
 * — that's the user's choice between Smart vs All-In, not the generation.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'strategy_options')
}