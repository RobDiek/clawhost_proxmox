/**
 * Stage: client_account_baseline_csv (Phase 2026.02, NEW — stub)
 *
 * Path B-2 only. Mirrors client_account_baseline.ts but reads parsed CSV
 * (from paid_csv_ingest) instead of live Google Ads + GA4 APIs. Output
 * normalized to the same schema so downstream stages
 * (paid_competitor_landscape, paid_keyword_research, paid_budget_scenarios,
 * paid_audit) don't have to know where the data came from.
 *
 * Block 1D will implement this alongside the CSV parser. Returns 501 for now.
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'client_account_baseline_csv')
}