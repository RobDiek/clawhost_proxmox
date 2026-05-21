/**
 * Phase 4.3-R — Onboarding Audit Orchestrator
 *
 * Single entry point that runs every audit check against a tenant and
 * returns a comprehensive report. Designed to be the LAST gate before
 * we promise a new client their pipeline is production-ready.
 *
 * Usage:
 *   const report = await runOnboardingAudit({ instanceId, agentId })
 *   if (report.overall !== 'ship_ready') { ...show findings... }
 *
 * Exposed via:
 *   POST /admin/audit/onboarding/:instanceId?agentId=mta_X
 */

import type { AuditFinding, AuditReport, AuditCategory, AuditContext } from './types'
import { schemaDriftCheck } from './schemaDriftCheck'
import { crossAgentCheck } from './crossAgentCheck'
import { groundTruthCheck } from './groundTruthCheck'
import { integrationCoherenceCheck } from './integrationCoherenceCheck'
import { pipelineHealthCheck } from './pipelineHealthCheck'
import { resolveAgentById, resolvePrimaryAgent } from '../agentContext'

const CATEGORIES: AuditCategory[] = [
    'schema_drift', 'cross_agent', 'integration', 'ground_truth',
    'pipeline_health', 'retry_resilience', 'render_determinism',
]

export interface AuditOpts {
    instanceId: string
    agentId?: string | null
    /** Cap on live HTTP fetches for ground-truth check. Default 8. */
    networkBudget?: number
    /** How many records per stage to deep-verify. Default 8. */
    sampleSize?: number
}

export async function runOnboardingAudit(opts: AuditOpts): Promise<AuditReport> {
    const startedAt = Date.now()
    const { instanceId, agentId, networkBudget = 8, sampleSize = 8 } = opts

    // Resolve agent (active or primary fallback for instance-only audits)
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)

    const ctx: AuditContext = {
        instanceId,
        agentId: agent?.id || null,
        activeAgentName: agent?.name || '(unknown)',
        activeBrandSlug: agent?.brandSlug || '',
        networkBudget: { maxHttpFetches: networkBudget, remaining: networkBudget },
        sampleSize,
    }

    // Run all checks. Each check is allowed to throw — its findings convert
    // to a single 'fail' entry so the report stays whole.
    const checks: Array<{ name: string; fn: () => Promise<AuditFinding[]> }> = [
        { name: 'schema_drift', fn: () => schemaDriftCheck(ctx) },
        { name: 'cross_agent', fn: () => crossAgentCheck(ctx) },
        { name: 'integration', fn: () => integrationCoherenceCheck(ctx) },
        { name: 'pipeline_health', fn: () => pipelineHealthCheck(ctx) },
        { name: 'ground_truth', fn: () => groundTruthCheck(ctx) },
    ]

    const allFindings: AuditFinding[] = []
    for (const c of checks) {
        try {
            const findings = await c.fn()
            allFindings.push(...findings)
        } catch (err) {
            allFindings.push({
                category: c.name as AuditCategory,
                id: `check_threw:${c.name}`,
                title: `Audit check "${c.name}" התרסק`,
                severity: 'fail',
                detail: `Check threw an exception: ${(err as Error).message}. Stack: ${(err as Error).stack?.slice(0, 400) || 'n/a'}. Treat as fail — fix the check or the underlying state.`,
                scope: { instanceId, agentId: ctx.agentId },
            })
        }
    }

    // Aggregate
    const counts = { pass: 0, warn: 0, fail: 0, info: 0 }
    const categorySummary = {} as Record<AuditCategory, { pass: number; warn: number; fail: number }>
    for (const cat of CATEGORIES) categorySummary[cat] = { pass: 0, warn: 0, fail: 0 }
    for (const f of allFindings) {
        counts[f.severity]++
        if (categorySummary[f.category] && (f.severity === 'pass' || f.severity === 'warn' || f.severity === 'fail')) {
            categorySummary[f.category][f.severity]++
        }
    }

    const overall: AuditReport['overall'] = counts.fail > 0
        ? 'has_blockers'
        : counts.warn > 0
            ? 'has_issues'
            : 'ship_ready'

    return {
        instanceId,
        agentId: ctx.agentId,
        agentName: ctx.activeAgentName,
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        overall,
        counts,
        findings: allFindings.sort(sortBySeverityThenCategory),
        categorySummary,
    }
}

const SEV_ORDER: Record<string, number> = { fail: 0, warn: 1, info: 2, pass: 3 }
function sortBySeverityThenCategory(a: AuditFinding, b: AuditFinding): number {
    const diff = SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
    if (diff !== 0) return diff
    return a.category.localeCompare(b.category)
}

/**
 * Convenience: human-readable summary of the report. Useful for CLI
 * output, Slack alerts, or pasting into a ticket.
 */
export function summarizeReport(report: AuditReport): string {
    const verdictHe = report.overall === 'ship_ready'
        ? '✅ מוכן לפרודקשן'
        : report.overall === 'has_issues'
            ? '⚠ יש אזהרות — סקרו לפני שיגור'
            : '🛑 יש חוסמים — אסור לשגר'
    const lines: string[] = [
        `# Onboarding Audit — ${report.agentName} (${report.agentId || 'no-agent'})`,
        `**Verdict**: ${verdictHe}`,
        `**Duration**: ${report.durationMs}ms · ${report.counts.fail} fail · ${report.counts.warn} warn · ${report.counts.pass} pass · ${report.counts.info} info`,
        '',
    ]
    for (const f of report.findings) {
        const sev = f.severity === 'fail' ? '🛑' : f.severity === 'warn' ? '⚠' : f.severity === 'pass' ? '✓' : 'ℹ'
        lines.push(`${sev} **[${f.category}]** ${f.title}`)
        lines.push(`    ${f.detail}`)
        if (f.fixHint) lines.push(`    *Fix*: ${f.fixHint}`)
        lines.push('')
    }
    return lines.join('\n')
}