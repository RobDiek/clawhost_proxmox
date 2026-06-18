/**
 * Foundation Task Generator — Layer 3 of the Campaign Foundation Engine (roadmap/24).
 *
 * Turns a DeltaPlan into ONE approval task (agent_outputs, pending_review,
 * outputType 'ads_foundation_review') with a readable Hebrew card in
 * content.displayHe and the machine-applicable deltas in metadata. Delivers it
 * to the tenant's Telegram via the shared approvalQueue sender — the same
 * pattern every other output creator uses.
 *
 * Idempotent (§0.10): the deltas are already delta-only (reconcile proposes
 * nothing that already exists); on top of that we skip creating a second task
 * while one is still pending_review, so the weekly runner never spams.
 *
 * NOTHING is written to Google Ads here — that happens only on approval
 * (foundationApplier.applyFoundationFromTask), and creates land PAUSED.
 */
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { buildAccountSnapshot } from '@/services/adsAccountSnapshot'
import { reconcileForAgent, type DeltaPlan, type FoundationDelta } from '@/services/foundationReconciler'

const ICON: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', info: 'ℹ️' }

function buildDisplayHe(plan: DeltaPlan): string {
    const lines: string[] = []
    lines.push(`## בניית בסיס הקמפיינים — ${plan.brand}`)
    lines.push('')
    lines.push(`**בשלות נתונים:** ${plan.maturity.conversions14d} המרות ב-14 ימים · ${plan.maturity.mature ? 'בשל ✅' : 'עדיין נצבר ⏳'}`)
    lines.push(`_${plan.maturity.reason}_`)
    if (plan.budget.capIls != null) {
        lines.push(`**תקציב:** ~₪${plan.budget.proposedMonthlyIls.toLocaleString()}/חודש מול תקרה ₪${plan.budget.capIls.toLocaleString()} → ${plan.budget.withinCap ? 'תקין' : 'חורג ⚠'}`)
    }
    if (plan.blockers.length) lines.push(`**⚠ לתשומת לב:** זוהתה אי-יציבות בחשבון — מומלץ ליישם בהדרגה.`)
    lines.push('')
    lines.push(`**סיכום:** ${plan.deltas.length} שינויים מוצעים (${plan.summary.critical}🔴 ${plan.summary.high}🟠 ${plan.summary.medium}🟡). כל היצירות נוצרות במצב מושהה (PAUSED) — שום דבר לא עולה לאוויר ללא אישורכם.`)
    lines.push('')
    lines.push('### פירוט השינויים')
    for (const d of plan.deltas) {
        lines.push(`${ICON[d.severity] || '•'} **${d.after}**`)
        lines.push(`   ${d.rationaleHe}`)
    }
    return lines.join('\n')
}

export interface FoundationTaskResult { ok: boolean; error?: string; taskId?: string; deltaCount: number; skipped?: string }

export async function generateFoundationTask(agent: MatehAgentRow, opts: { createTask?: boolean; force?: boolean } = {}): Promise<FoundationTaskResult> {
    const snap = await buildAccountSnapshot(agent)
    if (!snap.ok) return { ok: false, error: snap.error || 'snapshot_failed', deltaCount: 0 }
    const plan = await reconcileForAgent(agent, snap)
    const deltaCount = plan.deltas.length

    // Persist latest plan on the agent for the dashboard + audit trail.
    try {
        const { mutateResearchData } = await import('./agentContext')
        await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
            const c = cur || {}
            c.foundationPlan = { generatedAt: plan.generatedAt, summary: plan.summary, maturity: plan.maturity, budget: plan.budget, blockers: plan.blockers, deltaCount }
            return c
        })
    } catch { /* best-effort */ }

    if (deltaCount === 0) return { ok: true, deltaCount: 0, skipped: 'no_deltas' }
    if (!opts.createTask) return { ok: true, deltaCount }

    // Idempotent: don't stack a second task while one is pending.
    if (!opts.force) {
        const existing = await db.select().from(agentOutputs).where(and(
            eq(agentOutputs.agentId, agent.id),
            eq(agentOutputs.outputType, 'ads_foundation_review'),
            eq(agentOutputs.status, 'pending_review'),
        ))
        if (existing.length) return { ok: true, deltaCount, skipped: 'pending_task_exists', taskId: existing[0].id }
    }

    const applicable: FoundationDelta[] = plan.deltas.filter(d => d.apply)   // only these get applied on approval
    const displayHe = buildDisplayHe(plan)
    const [row] = await db.insert(agentOutputs).values({
        id: 'fnd_' + randomBytes(6).toString('hex'),
        instanceId: agent.vpsInstanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'ads_foundation_review',
        platform: 'google_ads',
        status: 'pending_review',
        title: `בניית בסיס קמפיינים — ${plan.summary.critical}🔴 ${plan.summary.high}🟠 ${plan.summary.medium}🟡 (${deltaCount} שינויים)`,
        // content stays SMALL + valid JSON (displayHe + rollups). The full delta
        // list lives in metadata (applied on approval) — same discipline as
        // adsRecommendationsEvaluator (over-stuffing content blew the 12k cap).
        content: JSON.stringify({ displayHe, summary: plan.summary, maturity: plan.maturity, budget: plan.budget }, null, 2),
        metadata: {
            kind: 'ads_foundation_review',
            generatedAt: plan.generatedAt,
            searchCampaignIds: plan.searchCampaignIds,
            blockers: plan.blockers,
            deltas: applicable,                 // apply set (each has an `apply` hint)
            advisoryDeltas: plan.deltas.filter(d => !d.apply).map(d => ({ kind: d.kind, after: d.after })),
        } as never,
    }).returning()

    if (row?.id) {
        import('@/services/approvalQueueTelegram')
            .then(m => m.sendApprovalQueueMessage(row.id))
            .catch((err: Error) => console.warn('[foundationTaskGen] telegram send failed:', err.message))
    }
    return { ok: true, deltaCount, taskId: row?.id }
}

// ─── Systemic weekly runner (sweeps every Ads-connected agent) ────────────────

const RUN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
let started = false

export async function runAllFoundation(): Promise<{ agents: number; tasks: number; errors: number }> {
    let agents = 0, tasks = 0, errors = 0
    let rows: MatehAgentRow[] = []
    try { rows = await db.select().from(matehAgents) as MatehAgentRow[] }
    catch (e) { console.error('[foundationRunner] load agents failed:', (e as Error).message); return { agents, tasks, errors: 1 } }

    for (const agent of rows) {
        const cfg: any = agent.googleAdsConfig || {}
        if (!cfg.customerId || !cfg.developerToken) continue
        agents++
        try {
            const r = await generateFoundationTask(agent, { createTask: true })
            if (r.error) { errors++; console.warn(`[foundationRunner] ${agent.id}: ${r.error}`); continue }
            if (r.taskId && !r.skipped) tasks++
        } catch (e) { errors++; console.error(`[foundationRunner] ${agent.id} threw:`, (e as Error).message) }
    }
    console.log(`[foundationRunner] swept ${agents} Ads agents · ${tasks} new foundation tasks · errors ${errors}`)
    return { agents, tasks, errors }
}

export function startFoundationRunner(): void {
    if (started) return
    started = true
    console.log(`[foundationRunner] starting (interval ${RUN_INTERVAL_MS / 3600_000}h)`)
    setTimeout(() => { runAllFoundation().catch(() => { /* logged inside */ }) }, 12 * 60 * 1000)
    setInterval(() => { runAllFoundation().catch(() => { /* logged inside */ }) }, RUN_INTERVAL_MS)
}

/** Script/cron convenience. */
export async function runFoundationForAgent(agentId: string, opts: { createTask?: boolean; force?: boolean } = {}): Promise<FoundationTaskResult> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ok: false, error: `agent_not_found:${agentId}`, deltaCount: 0 }
    return generateFoundationTask(agent as MatehAgentRow, opts)
}