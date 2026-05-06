/**
 * Stage: aeo_visibility — Phase E1.1.
 *
 * Measures our brand's visibility in AI-search ecosystem (Claude / ChatGPT /
 * Perplexity / Google AI Overview) plus content extractability for LLMs.
 *
 * Reads upstream from internal_seo_audit (schema coverage + URL inventory)
 * and seo_keyword_research (priority queries to probe). Calls Anthropic
 * citation probes for top 5 priority queries — does an LLM recommend us
 * when asked about our category?
 *
 * Outputs feed strategy_options (AEO investment priority) and content_plan
 * (which pages need schema/extractability upgrades first).
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'aeo_visibility')
}