/**
 * Phase 4.3-R — Onboarding audit endpoints
 *
 * Admin-only (gated on ADMIN_EMAIL) endpoints to run the comprehensive
 * audit suite on a tenant/agent and return a structured report.
 *
 *   POST /admin/audit/onboarding/:instanceId?agentId=mta_X
 *   GET  /admin/audit/onboarding/:instanceId/text?agentId=mta_X
 *
 * The endpoints are also reachable by the tenant owner (not just admin)
 * so users can self-check their own onboarding state before opening a
 * support ticket.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { getOwnedInstance } from './authHelper'
import { resolveUserId } from './authHelper'
import { runOnboardingAudit, summarizeReport } from '@/services/audit/onboardingAudit'

export const auditOnboarding = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const queryAgentId = (c.req.query('agentId') || '').trim() || null
        const networkBudget = parseInt(c.req.query('networkBudget') || '8', 10)
        const sampleSize = parseInt(c.req.query('sampleSize') || '8', 10)

        const report = await runOnboardingAudit({
            instanceId,
            agentId: queryAgentId,
            networkBudget: Math.min(Math.max(networkBudget, 1), 30),
            sampleSize: Math.min(Math.max(sampleSize, 1), 30),
        })
        return ok(c, report, `Audit ${report.overall} — ${report.counts.fail} fail / ${report.counts.warn} warn / ${report.counts.pass} pass`)
    } catch (err) {
        console.error('auditOnboarding error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

/** Returns the same audit but as a markdown string in the response body.
 *  Easier to read in a terminal or paste into Slack/ticket. */
export const auditOnboardingText = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)
        const queryAgentId = (c.req.query('agentId') || '').trim() || null
        const report = await runOnboardingAudit({
            instanceId, agentId: queryAgentId,
            networkBudget: 8, sampleSize: 8,
        })
        return c.text(summarizeReport(report))
    } catch (err) {
        console.error('auditOnboardingText error:', err)
        return fail(c, (err as Error).message, 500)
    }
}