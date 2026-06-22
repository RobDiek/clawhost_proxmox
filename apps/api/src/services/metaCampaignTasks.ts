/**
 * Sync Meta/IG funnel (mediaPlan.metaCampaigns) → actionable monthly-plan tasks.
 *
 * The Meta funnel is generated into the media plan (metaCampaigns: awareness /
 * lead_magnet / retargeting + per-product offer creatives + video scripts), but
 * the approval queue + calendar read monthlyPlan.tasks + agent_outputs — so Meta
 * was invisible there (only 2 thin pre-existing tasks). This makes each Meta
 * campaign a first-class task (channel='meta') with its creative scripts in the
 * actionPlan, written to BOTH stores. Idempotent: re-running replaces the
 * previously-synced Meta-campaign tasks (marked metaCampaignTask=true) instead of
 * duplicating. Called at media-plan generation + as a backfill.
 */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'crypto'

const TIER_HE: Record<string, string> = {
    awareness: 'מודעות (קהל קר)',
    lead_magnet: 'מגנט לידים (חימום)',
    retargeting: 'ריטרגטינג (המרה)',
}
const TIER_PRIO: Record<string, string> = { awareness: 'P1', lead_magnet: 'P1', retargeting: 'P2' }
const TIER_WEEK: Record<string, number> = { awareness: 1, lead_magnet: 1, retargeting: 2 }
const TIER_DAYOFFSET: Record<string, number> = { awareness: 1, lead_magnet: 3, retargeting: 8 }

function buildActionPlan(m: any): Array<{ step: string; done: boolean; estMinutes?: number }> {
    const steps: Array<{ step: string; done: boolean; estMinutes?: number }> = []
    const aud = m.audience || {}
    steps.push({ step: `קהל יעד: ${aud.definition || aud.type || '—'} · placements: ${m.placements || 'advantage_plus'} · אופטימיזציה: ${m.optimization || 'lowest_cost'} · שיוך 7d-click/1d-view`, done: false, estMinutes: 15 })
    for (const cc of (m.creativeConcepts || [])) {
        const kind = cc.kind === 'offer_product' ? `קריאייטיב הצעה — ${cc.forProduct || 'מוצר'}` : 'קריאייטיב מגנט לידים'
        steps.push({ step: `${kind} (${cc.format || 'video_reel'}): הוק — ${cc.hook || ''}${cc.headline ? ' · כותרת: ' + cc.headline : ''}${cc.cta ? ' · CTA: ' + cc.cta : ''}`, done: false, estMinutes: 30 })
        if (cc.primaryText) steps.push({ step: `טקסט ראשי: ${cc.primaryText}`, done: false })
        if (cc.leadMagnet) steps.push({ step: `מגנט לידים: ${cc.leadMagnet}`, done: false })
        for (const beat of (cc.videoScript || [])) steps.push({ step: `תסריט: ${beat}`, done: false })
    }
    return steps
}

export interface MetaTaskSyncResult { tasksUpserted: number; outputsCreated: number }

export async function syncMetaCampaignsToTasks(
    instanceId: string,
    agentId: string | null | undefined,
    mediaPlan?: any,
): Promise<MetaTaskSyncResult> {
    const { resolvePrimaryAgent, resolveAgentById, readResearchData, mutateResearchData } =
        await import('@/services/agentContext')
    const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const plan = mediaPlan || rd.mediaPlan
    const metaCampaigns: any[] = (plan && plan.metaCampaigns) || []
    if (metaCampaigns.length === 0) return { tasksUpserted: 0, outputsCreated: 0 }

    const nowIso = new Date().toISOString()
    const genAt = (rd.monthlyPlan && rd.monthlyPlan.generatedAt) || nowIso

    // Build the Meta-campaign tasks (stable ids → idempotent).
    const builtTasks = metaCampaigns.map((m: any, i: number) => {
        const tier = String(m.funnelTier || 'awareness')
        const sched = new Date(); sched.setDate(sched.getDate() + (TIER_DAYOFFSET[tier] ?? (1 + i * 3)))
        return {
            id: `tsk_meta_camp_${tier}`,
            type: 'paid_campaign',
            title: `קמפיין Meta — ${TIER_HE[tier] || tier}: ${m.name || ''}`.slice(0, 120),
            summary: `${m.objective || ''} · תקציב ₪${m.dailyBudgetIls || 0}/יום · ${(m.creativeConcepts || []).length} קריאייטיבים. ${m.rationale || ''}`.slice(0, 400),
            channel: 'meta',
            priority: TIER_PRIO[tier] || 'P1',
            weekOfMonth: TIER_WEEK[tier] || 1,
            scheduledFor: sched.toISOString(),
            estimatedEffort: '1_day',
            expectedImpact: { metric: 'leads', value: 0, horizon: '30d', confidence: 'medium', rationale: 'Meta full-funnel — ערוץ העלות-תועלת המוביל ל-SMB/SaaS בישראל.' },
            sources: [{ type: 'other', ref: 'mediaPlan.metaCampaigns', excerpt: `${tier} · ${m.name || ''}` }],
            actionPlan: buildActionPlan(m),
            dependsOn: [],
            status: 'proposed',
            metaCampaignTask: true,
        }
    })
    const builtIds = new Set(builtTasks.map(t => t.id))

    // 1. Upsert into research_data.monthlyPlan.tasks (replace prior synced ones).
    await mutateResearchData(agent, instanceId, (r: any) => {
        r.monthlyPlan = r.monthlyPlan || { generatedAt: nowIso, tasks: [] }
        const kept = (r.monthlyPlan.tasks || []).filter((t: any) => !(t && t.metaCampaignTask) && !builtIds.has(t?.id))
        r.monthlyPlan.tasks = [...kept, ...builtTasks]
        return r
    })

    // 2. Sync agent_outputs (queue). Remove prior synced Meta-campaign rows, insert fresh pending_review.
    const existing = await db.select().from(agentOutputs).where(and(
        eq(agentOutputs.instanceId, instanceId),
        eq(agentOutputs.outputType, 'monthly_task'),
    )) as any[]
    for (const row of existing) {
        const md: any = row.metadata || {}
        if (md.metaCampaignTask === true || builtIds.has(md.taskId)) {
            await db.delete(agentOutputs).where(eq(agentOutputs.id, row.id))
        }
    }
    let outputsCreated = 0
    for (const task of builtTasks) {
        await db.insert(agentOutputs).values({
            id: 'mt_' + randomBytes(6).toString('hex'),
            instanceId,
            agentId: agent?.id || null,
            agentRole: 'mazhir',
            outputType: 'monthly_task',
            platform: 'meta',
            status: 'pending_review',
            title: `${task.priority} · ${task.title}`.slice(0, 200),
            content: JSON.stringify({
                summary: task.summary, type: task.type, channel: task.channel, priority: task.priority,
                estimatedEffort: task.estimatedEffort, expectedImpact: task.expectedImpact,
                sources: task.sources, actionPlan: task.actionPlan, dependsOn: task.dependsOn,
            }, null, 2).slice(0, 12000),
            scheduledFor: task.scheduledFor ? new Date(task.scheduledFor) : null,
            metadata: {
                taskId: task.id, type: task.type, channel: task.channel, priority: task.priority,
                weekOfMonth: task.weekOfMonth, scheduledFor: task.scheduledFor, dependsOn: task.dependsOn,
                monthlyPlanGeneratedAt: genAt, metaCampaignTask: true,
            } as any,
        })
        outputsCreated++
    }
    return { tasksUpserted: builtTasks.length, outputsCreated }
}