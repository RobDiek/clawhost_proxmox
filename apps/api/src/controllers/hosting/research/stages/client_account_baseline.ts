/**
 * Stage: client_account_baseline — pull Google Ads + GA4 historical reality
 * data once per research session. Every downstream paid stage reads from
 * `rd.results.client_account_baseline` instead of refetching.
 *
 * Phase 4.2.1. See [client_account_baseline.ts](./prefetch/client_account_baseline.ts)
 * for the prefetcher that does the actual API work.
 *
 * Wraps runStageGeneric — prefetch + prompt + executor + persist + critique
 * all happen via the generic flow. This stage's prompt is intentionally
 * minimal — its primary value is the prefetch result, not Opus analysis.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'client_account_baseline')
}