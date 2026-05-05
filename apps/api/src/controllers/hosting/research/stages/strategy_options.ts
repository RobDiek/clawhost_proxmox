/**
 * Stage: strategy_options — Smart (low-comp / lean budget) vs All-In (head
 * terms / aggressive) scenarios with KPIs, monthly trajectories, link-
 * building budgets, content production budgets. Universal stage — every
 * intent ends here before commit.
 *
 * Phase 3 lifts logic from agentSetup buildStrategyScenarios + relevant
 * sections of buildResearchPrompt(stage=4). Existing chosenScenario flow
 * (commitStrategyScenario) stays untouched — that's the user's choice
 * between options, not the option-generation itself.
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'strategy_options')
}