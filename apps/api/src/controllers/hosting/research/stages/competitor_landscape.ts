/**
 * Stage: competitor_landscape — direct competitors, SERP positions, digital
 * presence, content gaps, timing. Universal across intents.
 *
 * Lifted from agentSetup.ts:buildResearchPrompt(stage=1). Logic is now in
 * services/research/{prompts,stageExecutor}; this file is just the route.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'competitor_landscape')
}