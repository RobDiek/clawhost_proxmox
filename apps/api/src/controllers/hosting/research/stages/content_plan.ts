/**
 * Stage: content_plan — 3-month editorial calendar, topics, platforms,
 * publishing cadence. Existing logic in services/planDraftRunner.ts and
 * regenerateContentPlan handler; Phase 3 makes content_plan a thin
 * dispatcher that triggers the existing runner with intent-aware inputs.
 */

import type { Context } from 'hono'
import { notImplementedYet } from './_stub'

export async function run(c: Context): Promise<Response> {
    return notImplementedYet(c, 'content_plan')
}