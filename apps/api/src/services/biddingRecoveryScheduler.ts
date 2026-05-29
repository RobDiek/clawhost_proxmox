/**
 * Bidding Recovery Scheduler — Phase 2026.02 Block 6 K14
 *
 * Daily cron that scans tenants for applied bidding strategies past their
 * recovery window (Conservative=14d, Moderate=14d, Aggressive=30d) and
 * generates a follow-up monthly_task. The task carries full context:
 *   - which strategy was applied + when
 *   - exact previousState (budgets, bidding, status to restore)
 *   - one-click "restore to original" auto-fix action
 *
 * Systemic: ANY tenant who runs a temporary platform action gets an
 * automatic reminder when its window expires. No manual calendar tracking.
 */

import { db } from '@/db'
import { matehAgents, agentOutputs, instances } from '@/db/schema'
import { eq, ne } from 'drizzle-orm'

interface AdsBiddingHistoryEntry {
    id: string
    appliedAt: string
    appliedBy: string
    strategy: 'conservative' | 'moderate' | 'aggressive'
    recoveryDays: number
    customerId: string
    loginCustomerId: string
    previousState: Array<{
        campaignId: string
        campaignName: string
        status: string
        bidding: string
        channel: string
        budgetMicros: number
        budgetResourceName: string
    }>
    newState: Array<{ campaignId: string; campaignName: string; status: string; bidding: string; budgetMicros: number }>
    actionsApplied: Array<{ campaignId: string; campaignName: string; change: string }>
    followupGenerated: boolean
    followupGeneratedAt: string | null
    restored: boolean
    restoredAt: string | null
}

/** Run the daily check across all instances + agents. */
export async function runBiddingRecoveryCheck(): Promise<{
    scanned: number
    eligible: number
    tasksCreated: number
    errors: number
}> {
    const stats = { scanned: 0, eligible: 0, tasksCreated: 0, errors: 0 }

    const allInstances = await db.select({ id: instances.id }).from(instances).where(ne(instances.status, 'terminated'))
    for (const inst of allInstances) {
        const agents = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, inst.id))
        for (const agent of agents) {
            stats.scanned++
            const rd = (agent.researchData as any) || {}
            const history: AdsBiddingHistoryEntry[] = Array.isArray(rd.adsBiddingHistory) ? rd.adsBiddingHistory : []
            if (history.length === 0) continue

            const now = Date.now()
            for (const entry of history) {
                if (entry.followupGenerated || entry.restored) continue
                const appliedTime = new Date(entry.appliedAt).getTime()
                const elapsedDays = Math.floor((now - appliedTime) / (1000 * 60 * 60 * 24))
                if (elapsedDays < entry.recoveryDays) continue

                stats.eligible++
                try {
                    await generateFollowupTask(inst.id, agent.id, entry)
                    // Mark as followup_generated in research_data
                    const { mutateResearchData } = await import('./agentContext')
                    await mutateResearchData(agent, inst.id, (rdInner: any) => {
                        const hist: AdsBiddingHistoryEntry[] = rdInner.adsBiddingHistory || []
                        const idx = hist.findIndex((h) => h.id === entry.id)
                        if (idx >= 0) {
                            hist[idx].followupGenerated = true
                            hist[idx].followupGeneratedAt = new Date().toISOString()
                        }
                        rdInner.adsBiddingHistory = hist
                        return rdInner
                    })
                    stats.tasksCreated++
                } catch (e) {
                    stats.errors++
                    console.error(`[biddingRecovery] follow-up gen failed for ${inst.id}/${agent.id}/${entry.id}:`, (e as Error).message)
                }
            }
        }
    }

    console.log(`[biddingRecovery] daily check done: scanned=${stats.scanned} eligible=${stats.eligible} tasksCreated=${stats.tasksCreated} errors=${stats.errors}`)
    return stats
}

async function generateFollowupTask(instanceId: string, agentId: string, entry: AdsBiddingHistoryEntry): Promise<void> {
    const taskId = `tsk_restore_bidding_${entry.id}`
    const outputId = `mt_restore_bid_${entry.id}`

    const previousBudgetTotalIls = entry.previousState.reduce((s, p) => s + (p.budgetMicros / 1_000_000), 0)
    const newBudgetTotalIls = entry.newState.reduce((s, p) => s + (p.budgetMicros / 1_000_000), 0)
    const dailySavedIls = previousBudgetTotalIls - newBudgetTotalIls

    const campaignList = entry.previousState
        .map(p => `${p.campaignName} (${p.bidding}, ₪${(p.budgetMicros / 1_000_000).toFixed(0)})`)
        .join(' · ')

    const titleHe = `החזרת בידינג למצב מלא — ${entry.recoveryDays} ימים מאז ${strategyHeLabel(entry.strategy)} הסתיימו`
    const summaryHe = `לפני ${entry.recoveryDays} ימים יישמת אסטרטגיית ${strategyHeLabel(entry.strategy)} — ` +
        `${entry.actionsApplied.length} פעולות. כעת ה-tracking signal אמור להיות נקי (${entry.recoveryDays * 30}+ רכישות מאז). ` +
        `מומלץ לחזור למצב המקורי: ${campaignList}. החזרה תוסיף ₪${dailySavedIls.toFixed(0)}/יום לתקציב.`

    // 1. Create agent_output entry (pending_review)
    await db.insert(agentOutputs).values({
        id: outputId,
        instanceId,
        agentId,
        agentType: 'mt',
        outputType: 'monthly_task',
        title: titleHe,
        content: summaryHe,
        status: 'pending_review',
        metadata: {
            taskId,
            biddingHistoryId: entry.id,
            strategy: entry.strategy,
            recoveryDays: entry.recoveryDays,
            previousBudgetTotalIls,
            newBudgetTotalIls,
            dailySavedIls,
            previousState: entry.previousState,
        } as any,
        approvedBy: null,
        approvedAt: null,
        editedAt: null,
        publishedAt: null,
        rejectedAt: null,
        rejectReason: null,
        publishUrl: null,
    } as any).onConflictDoNothing()

    // 2. Insert into monthlyPlan.tasks[]
    const { mutateResearchData, resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd: any) => {
        if (!rd.monthlyPlan) rd.monthlyPlan = { tasks: [] }
        if (!Array.isArray(rd.monthlyPlan.tasks)) rd.monthlyPlan.tasks = []
        const existing = rd.monthlyPlan.tasks.findIndex((t: any) => t.id === taskId)
        const task = {
            id: taskId,
            title: titleHe,
            summary: summaryHe,
            type: 'paid_optimization',
            channel: 'google_ads',
            priority: 'P1',
            weekOfMonth: 1,
            status: 'proposed',
            actionPlan: [
                {
                    step: `נסקור את ביצועי הקמפיינים מאז ${strategyHeLabel(entry.strategy)} לפני ${entry.recoveryDays} ימים`,
                    automated: false,
                    estimatedMinutes: 5,
                },
                {
                    step: 'אם conv_value_quality מעל 70 — להחיל "Restore to original" אוטומטית מ-UI',
                    automated: true,
                    estimatedMinutes: 1,
                },
                {
                    step: 'מעקב 7 ימים אחרי החזרה — לוודא שהביצועים חוזרים לרמה צפויה',
                    automated: false,
                    estimatedMinutes: 5,
                },
            ],
            sources: [
                {
                    type: 'platform_history',
                    ref: 'bidding_history.' + entry.id,
                    excerpt: `Strategy "${entry.strategy}" applied ${entry.appliedAt} — ${entry.actionsApplied.length} actions, recovery due now.`,
                },
            ],
            expectedImpact: {
                metric: 'daily_spend_capacity',
                value: dailySavedIls,
                horizon: 'immediate',
                rationale: `החזרה למצב מקורי תפנה ₪${dailySavedIls.toFixed(0)}/יום לתקציב, נחזיר את הקמפיינים ל-100% כוח.`,
                confidence: 'high',
            },
            estimatedEffort: '10_min',
        }
        if (existing >= 0) rd.monthlyPlan.tasks[existing] = task
        else rd.monthlyPlan.tasks.push(task)
        return rd
    })

    console.log(`[biddingRecovery] follow-up task created: instance=${instanceId} agent=${agentId} task=${taskId}`)
}

function strategyHeLabel(s: string): string {
    if (s === 'conservative') return 'שמרני (Conservative)'
    if (s === 'moderate') return 'מאוזן (Moderate)'
    if (s === 'aggressive') return 'אגרסיבי (Aggressive)'
    return s
}