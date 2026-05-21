/**
 * Phase 4.3-R — Pipeline health check
 *
 * Verifies the research pipeline state is coherent. Flags:
 *   - stage marked "completed" with no `results.<stageId>` populated
 *   - stage marked "running" but lock expired (zombie state)
 *   - records with NULL agent_id that should belong to this agent
 *   - draft mappings older than 24h waiting for approval
 *   - mateh_agents.onboarding_step out of sync with actual state
 */

import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import type { AuditFinding, AuditContext } from './types'
import { readResearchData, resolveAgentById } from '../agentContext'

export const pipelineHealthCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []
    if (!ctx.agentId) return findings

    const agent = await resolveAgentById(ctx.instanceId, ctx.agentId)
    if (!agent) return findings

    const rd = (await readResearchData(agent, ctx.instanceId)) as Record<string, unknown>
    const plan = (rd.plan as { status?: Record<string, { state?: string; runAt?: string }> } | undefined)
    const results = (rd.results as Record<string, unknown> | undefined) || {}
    const planStatus = plan?.status || {}

    // 1) Stage states vs results
    for (const [stageId, st] of Object.entries(planStatus)) {
        const state = st?.state
        const hasResult = stageId in results
        if (state === 'completed' && !hasResult) {
            findings.push({
                category: 'pipeline_health',
                id: `completed_no_result:${stageId}`,
                title: `שלב ${stageId} מסומן completed אבל אין תוצאה`,
                severity: 'fail',
                detail: `plan.status.${stageId}.state='completed' but results.${stageId} is empty/missing. Could be: result wipe by subsequent patch, schema migration issue, or write failure.`,
                fixHint: `Re-run stage via /research/stage/${stageId}. If still missing after re-run, check mutateResearchData logs for the patch that wiped it.`,
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId },
            })
        }
        if (state === 'running' && st?.runAt) {
            const runAtMs = new Date(st.runAt).getTime()
            const ageMs = Date.now() - runAtMs
            if (ageMs > 30 * 60 * 1000) {
                findings.push({
                    category: 'pipeline_health',
                    id: `zombie_running:${stageId}`,
                    title: `שלב ${stageId} ב-running יותר מ-30 דקות`,
                    severity: 'fail',
                    detail: `Stage was marked running at ${st.runAt} (${Math.round(ageMs / 60000)} min ago). Likely a crash or terminated stream without lock release.`,
                    fixHint: `Manually clear plan.status.${stageId} via SQL or re-run the stage; subsequent runs will overwrite. Check the recent commit on stream retry — Phase 4.3-Q.`,
                    scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId },
                })
            }
        }
    }

    // 2) NULL agent_id in agent_outputs that should belong to primary
    //    (already handled in outputs.ts filter, but flag here for visibility)
    const orphanRows = await db.select({ id: agentOutputs.id, outputType: agentOutputs.outputType, createdAt: agentOutputs.createdAt })
        .from(agentOutputs)
        .where(and(eq(agentOutputs.instanceId, ctx.instanceId), isNull(agentOutputs.agentId)))
        .limit(20)

    if (orphanRows.length > 0) {
        findings.push({
            category: 'pipeline_health',
            id: 'null_agent_id_outputs',
            title: `${orphanRows.length}+ agent_outputs ללא agent_id`,
            severity: agent.isPrimary ? 'info' : 'warn',
            detail:
                `Found ${orphanRows.length} agent_outputs rows with agent_id=NULL on this VPS. ` +
                (agent.isPrimary
                    ? `For PRIMARY agent these are visible via the outputs.ts NULL-fallback. Safe but should be backfilled.`
                    : `For SECONDARY agent these are INVISIBLE in משימות פעילות. If they belong to this secondary, they're orphaned.`),
            fixHint: `Backfill: UPDATE agent_outputs SET agent_id='${agent.id}' WHERE agent_id IS NULL AND instance_id='${ctx.instanceId}' ... (verify ownership first).`,
            evidence: { sampleRows: orphanRows.slice(0, 5).map(r => ({ id: r.id, type: r.outputType, at: r.createdAt })) },
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    // 3) Stale draft mappings (conversion_mapping_proposal not approved >24h)
    const oldDrafts = await db.select({ id: agentOutputs.id, createdAt: agentOutputs.createdAt, status: agentOutputs.status })
        .from(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, ctx.instanceId),
            eq(agentOutputs.agentId, ctx.agentId),
            eq(agentOutputs.outputType, 'conversion_mapping_proposal'),
            eq(agentOutputs.status, 'pending_review'),
            sql`${agentOutputs.createdAt} < now() - interval '24 hours'`,
        ))
        .limit(5)

    if (oldDrafts.length > 0) {
        findings.push({
            category: 'pipeline_health',
            id: 'stale_conversion_drafts',
            title: `${oldDrafts.length} הצעות מיפוי פעולות המרה מחכות יותר מ-24 שעות`,
            severity: 'warn',
            detail: `Conversion mapping proposals pending review for >24h. User likely abandoned the picker UI or didn't notice the task in משימות פעילות.`,
            fixHint: 'Surface a notification or auto-archive after N days.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    // 4) Onboarding step coherence
    const onbStep = agent.onboardingStep || 0
    const hasResearch = Object.keys(results).length > 0
    const hasBrandSpecific = !!(rd.answers && (rd.answers as { businessName?: string }).businessName)
    if (onbStep === 0 && (hasResearch || hasBrandSpecific)) {
        findings.push({
            category: 'pipeline_health',
            id: 'onboarding_step_behind',
            title: `onboarding_step=0 בעוד שיש כבר נתונים`,
            severity: 'info',
            detail: `Agent has research data and/or brand info but onboarding_step is 0 — UI may show "first run" panel inappropriately.`,
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    if (findings.filter(f => f.severity === 'fail' || f.severity === 'warn').length === 0) {
        findings.push({
            category: 'pipeline_health',
            id: 'pipeline_healthy',
            title: 'מצב ה-pipeline תקין',
            severity: 'pass',
            detail: 'Plan/results states consistent, no zombie stages, no orphan outputs blocking visibility.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    return findings
}