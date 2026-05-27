/**
 * Stage: media_plan — Phase 2026.02 Block 5 playbook-grade rewrite.
 *
 * Replaces the legacy mazhirMediaPlan-driven flow (required paidProfile +
 * mazhirAudit legacy fields) with the standard runStageGeneric pipeline
 * backed by buildMediaPlanPrompt.
 *
 * The new prompt reads upstream from rd.results.*:
 *   - paid_audit (extras.verdict + action_plan + 5 dim scores)
 *   - paid_keyword_research (records[] — ad groups, intent, bid gates)
 *   - paid_budget_scenarios (records[] — 3 tiers with phase allocation)
 *   - paid_competitor_landscape (records[] — saturated/whitespace angles)
 *   - audience_personas (records[] — JTBD, queries, WTP)
 *   - positioning (extras — brand voice)
 *   - client_account_baseline (extras.conv_value_quality + records[])
 *
 * Produces campaigns + ad_groups + budgets + KPIs + creative briefs aligned
 * with playbook §6: verdict-aware (tracking-first → phase 1 setup-only),
 * bid-strategy-gated (manual_cpc until measurement clean), IL senior bar
 * (mobile-first ≥1 item, sGTM mandatory T2+ IL).
 *
 * Legacy mazhirMediaPlan.ts service kept untouched — invoked only via
 * the legacy openPaidProfileModal Path A flow for tenants pre-2026.02.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'media_plan')
}