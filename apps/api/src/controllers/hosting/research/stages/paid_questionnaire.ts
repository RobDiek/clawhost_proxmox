/**
 * Stage: paid_questionnaire (Phase 2026.02, NEW — stub)
 *
 * Path A (no_history) only. Collects 12 fields per playbook §1.2 — feeds
 * setup_roadmap downstream. Pure form, no LLM call.
 *
 * Block 1C will implement the real handler. For now returns 501 so the
 * UI surfaces a clear "(coming soon)" state.
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'paid_questionnaire')
}