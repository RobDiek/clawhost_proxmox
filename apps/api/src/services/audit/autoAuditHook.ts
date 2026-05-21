/**
 * Phase 4.3-S — Auto-audit hook after high-value research stages.
 *
 * When a stage that's likely to surface bugs completes (internal_seo_audit
 * being the most fertile because it makes deterministic claims about
 * dozens of pages), we run the full onboardingAudit and persist its
 * findings as a `audit_findings` agent_output in pending_review status.
 *
 * The output uses the plain-language renderer so the user sees:
 *   "המערכת טעתה: דווח 'חסרה כותרת H1' אבל הכותרת קיימת"
 * instead of:
 *   "false_missing_h1: claim missing_h1 but live HTML contains 2 H1 tags"
 *
 * IDempotency: a single audit_findings task per (instance, agent) — if
 * one exists in pending_review status, we UPDATE it in-place instead of
 * spawning a duplicate. Approved/archived tasks stay for history.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { nanoid } from 'nanoid'
import { runOnboardingAudit } from './onboardingAudit'
import { buildPlainLanguageReport } from './humanReadable'

const STAGES_THAT_TRIGGER_AUDIT = new Set([
    'internal_seo_audit',
    // Future: add other deterministic-claim-heavy stages here
    // 'aeo_visibility',
    // 'paid_audit',
])

/**
 * Run on completion of any research stage. Cheap fast-path returns if
 * stage isn't in the audit-worthy list. For audit-worthy stages, runs
 * the full audit asynchronously (caller doesn't block).
 */
export async function maybeAutoAuditAfterStage(
    instanceId: string,
    agentId: string | null,
    stageId: string,
): Promise<void> {
    if (!STAGES_THAT_TRIGGER_AUDIT.has(stageId)) return
    // Fire-and-forget — audit takes 5-15s with live URL fetches.
    // We don't want to slow down the stage-completion response.
    void runAndPersistAudit(instanceId, agentId, `post_stage:${stageId}`)
        .catch(err => {
            console.error(`[auto-audit] post-stage ${stageId} failed for ${instanceId}/${agentId}:`, (err as Error).message)
        })
}

/**
 * Runs the audit and writes findings to agent_outputs. Used by both the
 * post-stage hook and any explicit "run audit now" endpoint.
 *
 * @param trigger — short string describing why audit ran (logs + task metadata)
 */
export async function runAndPersistAudit(
    instanceId: string,
    agentId: string | null,
    trigger: string,
): Promise<{ outputId: string; overall: string; counts: Record<string, number> }> {
    const report = await runOnboardingAudit({
        instanceId,
        agentId,
        networkBudget: 12,
        sampleSize: 10,
    })

    const body = buildPlainLanguageReport(report)
    const title = report.overall === 'ship_ready'
        ? `✅ בדיקת איכות — ${report.agentName} מוכן`
        : report.overall === 'has_issues'
            ? `⚠ בדיקת איכות — ${report.agentName} (${report.counts.warn} אזהרות)`
            : `🛑 בדיקת איכות — ${report.agentName} (${report.counts.fail} חוסמים)`

    // Pending_review status only when there's something the user needs to
    // act on. Otherwise we still write the row but as `approved` so it
    // shows in history without nagging the user.
    const userActionNeeded = report.counts.fail > 0 || report.counts.warn > 0
    const status = userActionNeeded ? 'pending_review' : 'approved'

    // Idempotent: replace existing pending_review row for same (instance, agent).
    const existing = await db
        .select({ id: agentOutputs.id })
        .from(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, instanceId),
            eq(agentOutputs.outputType, 'audit_findings'),
            eq(agentOutputs.status, 'pending_review'),
            ...(agentId ? [eq(agentOutputs.agentId, agentId)] : []),
        ))
        .limit(1)

    let outputId: string
    if (existing.length > 0) {
        outputId = existing[0].id
        await db.update(agentOutputs)
            .set({
                title,
                content: body,
                status,
                metadata: { report, trigger } as never,
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, outputId))
    } else {
        outputId = nanoid(12)
        await db.insert(agentOutputs).values({
            id: outputId,
            instanceId,
            agentId,
            agentRole: 'mazhir',
            outputType: 'audit_findings',
            status,
            title,
            content: body,
            metadata: { report, trigger } as never,
            createdAt: new Date(),
        } as never)
    }

    return { outputId, overall: report.overall, counts: report.counts }
}