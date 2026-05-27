/**
 * Stage: paid_audit — Phase 2026.02 Block 4 playbook-grade rewrite.
 *
 * Replaces the legacy mazhirAudit-driven flow (which required paidProfile
 * filled via openPaidProfileModal — Path A onboarding only) with the
 * standard runStageGeneric pipeline backed by buildPaidAuditPrompt.
 *
 * The new prompt produces the 5-dim rubric (Structure / Targeting /
 * Creative / Measurement / Bidding) per playbook §4, deterministic
 * verdict per §5, and action plan with cited evidence per §6.5.
 *
 * Reads upstream from rd.results.*:
 *   - paid_data_inventory (tier + fork)
 *   - client_account_baseline (conv_value_quality, sqr, change history)
 *   - paid_competitor_landscape (saturated/whitespace, IL signals)
 *   - paid_keyword_research (ad groups, bid strategy gates)
 *
 * Legacy mazhirAudit.ts is left untouched — invoked only by the legacy
 * Path A widget (openPaidProfileModal) which is deprecated but kept for
 * tenants pre-2026.02 migration.
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'paid_audit')
}