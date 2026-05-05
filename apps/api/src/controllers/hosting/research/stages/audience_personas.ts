/**
 * Stage: audience_personas — 1-3 personas with demographics, pain points,
 * triggers, channel preferences, expected CAC. Universal stage — runs for
 * every intent. Synthesis from researchData.answers + GA4 demographics
 * (when GA4 connected) + Anthropic.
 *
 * Phase 3 lifts the prompt + extraction logic from
 * agentSetup.buildResearchPrompt(stage=3).
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'audience_personas')
}