/**
 * Stage: paid_competitor_landscape — paid-specific competitor research.
 *
 * Phase 4.2.1 — parallel to the organic `competitor_landscape` but focused
 * on paid signals: Meta Ad Library + Google Ads Transparency Center + LP
 * CRO audits. Output feeds paid_keyword_research, paid_budget_scenarios,
 * paid_audit + media_plan downstream.
 *
 * Wraps runStageGeneric — prefetch + prompt + executor + persist + critique
 * all happen via the generic flow.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'paid_competitor_landscape')
}