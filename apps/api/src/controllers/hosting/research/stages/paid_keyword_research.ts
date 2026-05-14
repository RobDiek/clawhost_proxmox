/**
 * Stage: paid_keyword_research (Phase 4.2.2 — stub, full implementation pending).
 *
 * Will pull paid-search keyword landscape via DataForSEO endpoints
 * (keywords_for_site on competitors, ads_search for SERP density,
 * keyword_difficulty for cost calibration) + Google Ads Keyword Planner
 * once the user has OAuth + Developer Token.
 *
 * Until implemented, returns a clear 501 so the pipeline doesn't appear
 * "stuck" with no error. Quality gate downstream treats this stage as
 * optional (stages can be skipped if upstream confidence is high).
 */

import type { Context } from 'hono'
import { fail } from '@/lib/response'

export async function run(c: Context): Promise<Response> {
    return fail(
        c,
        'paid_keyword_research not yet implemented (Phase 4.2.2 — coming after paid_competitor_landscape ships).',
        501,
    )
}