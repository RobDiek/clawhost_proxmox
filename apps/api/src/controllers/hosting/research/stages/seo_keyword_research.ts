/**
 * Stage: seo_keyword_research — 15+ keywords with SERP analysis. Currently
 * runs through the openclaw CLI sayer agent which uses DataForSEO/Brave/
 * Firecrawl MCPs when available, falls back to estimates otherwise.
 *
 * Phase 4 will replace this with a server-side direct DataForSEO call so we
 * get deterministic real volume/CPC/difficulty (not subject to agent
 * flakiness) and a 'degraded' badge when DataForSEO isn't connected.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'seo_keyword_research')
}