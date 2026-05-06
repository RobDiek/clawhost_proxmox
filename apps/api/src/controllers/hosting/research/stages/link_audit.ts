/**
 * Stage: link_audit — deep backlinks audit + lost-link recovery + link gap
 * outreach roadmap. Phase (b) of the SEO depth upgrade.
 *
 * Requires DataForSEO Backlinks API subscription. Stage hard-fails with a
 * clear Hebrew "activate the subscription" message when subscription is off,
 * because there's no fallback that produces meaningful link analysis without
 * real data.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'link_audit')
}