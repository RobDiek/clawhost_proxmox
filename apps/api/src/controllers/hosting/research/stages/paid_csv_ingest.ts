/**
 * Stage: paid_csv_ingest (Phase 2026.02, NEW — stub)
 *
 * Path B-2 (has_history + no integration) only. Accepts 4 required CSV
 * exports + 2 optional per playbook §1.3:
 *   - google_ads_campaigns_90d.csv          (required if running Google)
 *   - google_ads_search_terms_90d.csv       (required if running Google)
 *   - meta_ads_campaigns_90d.csv            (required if running Meta)
 *   - ga4_landing_pages_90d.csv             (required for both)
 *   - google_ads_change_history.csv         (optional)
 *   - meta_ads_breakdown_demographics.csv   (optional)
 *
 * Own parser, no library. Validates schemas + filename hints. Rejects
 * non-CSV (PDF/PNG/XLSX) with explicit Hebrew error. Output writes to
 * rd.results.paid_csv_ingest with normalized schema downstream stages
 * can consume.
 *
 * Block 1D will implement the parser. For now returns 501.
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'paid_csv_ingest')
}