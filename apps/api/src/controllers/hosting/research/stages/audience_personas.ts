/**
 * Stage: audience_personas — 1-3 personas with demographics, pains, triggers,
 * channel preferences, WTP/pricing-validation. Universal stage.
 *
 * Lifted from agentSetup.ts:buildResearchPrompt(stage=3). When GA4 is wired
 * in (Phase 4), this stage will inject demographic data into the prompt
 * before sayer runs.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'audience_personas')
}