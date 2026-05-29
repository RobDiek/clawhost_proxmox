/**
 * Generic deferred actions scheduler — K15.
 *
 * Runs daily. For every tenant × every action in 'active' state:
 *   1. Check if recovery window elapsed
 *   2. If deferUntil is set → respect it
 *   3. Call handler.validateBeforeRestore() (optional) — may defer again
 *   4. Otherwise call handler.buildFollowupTask() → persist as monthly_task
 *   5. Mark state='followup_generated'
 *
 * Replaces the bidding-only biddingRecoveryScheduler. That module remains
 * for backwards compat (no longer registered in cron).
 */

import { db } from '@/db'
import { matehAgents, agentOutputs, instances } from '@/db/schema'
import { eq, ne } from 'drizzle-orm'
import { getHandler, listRegisteredKinds } from './registry'
import type { DeferredAction, FollowupTaskDescriptor } from './types'
import './handlers/index'   // ensure all handlers registered before scheduler runs

export interface SchedulerStats {
    instancesScanned: number
    agentsScanned: number
    actionsScanned: number
    eligibleForFollowup: number
    tasksCreated: number
    deferred: number
    handlerMissing: number
    errors: number
}

export async function runDeferredActionsScheduler(): Promise<SchedulerStats> {
    const stats: SchedulerStats = {
        instancesScanned: 0,
        agentsScanned: 0,
        actionsScanned: 0,
        eligibleForFollowup: 0,
        tasksCreated: 0,
        deferred: 0,
        handlerMissing: 0,
        errors: 0,
    }

    const registered = listRegisteredKinds()
    if (registered.length === 0) {
        console.log('[deferredActions] no handlers registered — skipping scan')
        return stats
    }

    const allInstances = await db.select({ id: instances.id }).from(instances).where(ne(instances.status, 'terminated'))
    for (const inst of allInstances) {
        stats.instancesScanned++
        const agents = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, inst.id))
        for (const agent of agents) {
            stats.agentsScanned++
            const rd = (agent.researchData as Record<string, unknown>) || {}
            const actions: DeferredAction[] = Array.isArray(rd.deferredActions) ? (rd.deferredActions as DeferredAction[]) : []
            if (actions.length === 0) continue

            const now = Date.now()
            for (const action of actions) {
                stats.actionsScanned++
                if (action.state !== 'active') continue

                // Honor deferUntil (set by previous validateBeforeRestore())
                if (action.deferUntil && new Date(action.deferUntil).getTime() > now) continue

                const recoveryDeadline = new Date(action.appliedAt).getTime() + action.recoveryDays * 86400 * 1000
                if (now < recoveryDeadline) continue

                stats.eligibleForFollowup++
                const handler = getHandler(action.kind)
                if (!handler) {
                    stats.handlerMissing++
                    console.warn(`[deferredActions] no handler for kind=${action.kind} (action=${action.id})`)
                    continue
                }

                try {
                    // Optional pre-check — may defer
                    if (handler.validateBeforeRestore) {
                        const validation = await handler.validateBeforeRestore(
                            { instanceId: inst.id, agentId: agent.id, tokens: { refreshToken: ((agent.googleTokens as Record<string, string> | null)?.refreshToken) || '' } },
                            action,
                        )
                        if (validation.decision === 'defer') {
                            const deferDays = validation.deferDays || 7
                            const newDeferUntil = new Date(now + deferDays * 86400 * 1000).toISOString()
                            const { updateDeferredAction } = await import('./store')
                            await updateDeferredAction(inst.id, agent.id, action.id, {
                                deferUntil: newDeferUntil,
                                deferReason: validation.reason,
                                deferCount: (action.deferCount || 0) + 1,
                            })
                            stats.deferred++
                            console.log(`[deferredActions] deferred ${action.id} kind=${action.kind} for ${deferDays}d (${validation.reason})`)
                            continue
                        }
                    }

                    // Build follow-up task descriptor + persist as monthly_task
                    const descriptor = handler.buildFollowupTask(action)
                    await persistFollowupTask(inst.id, agent.id, action, descriptor)

                    // Mark as followup_generated
                    const { updateDeferredAction } = await import('./store')
                    await updateDeferredAction(inst.id, agent.id, action.id, {
                        state: 'followup_generated',
                        followupGeneratedAt: new Date().toISOString(),
                    })
                    stats.tasksCreated++
                } catch (e) {
                    stats.errors++
                    console.error(`[deferredActions] error for ${action.id}:`, (e as Error).message)
                }
            }
        }
    }

    console.log(`[deferredActions] daily check done: ${JSON.stringify(stats)}`)
    return stats
}

async function persistFollowupTask(
    instanceId: string,
    agentId: string | null,
    action: DeferredAction,
    descriptor: FollowupTaskDescriptor,
): Promise<void> {
    // 1. agent_output row (so it shows in dashboard "review" queue)
    await db.insert(agentOutputs).values({
        id: descriptor.outputId,
        instanceId,
        agentId: agentId || undefined,
        agentRole: 'mateh',
        outputType: 'monthly_task',
        title: descriptor.titleHe,
        content: descriptor.summaryHe,
        status: 'pending_review',
        metadata: {
            taskId: descriptor.taskId,
            deferredActionId: action.id,
            deferredActionKind: action.kind,
            ...descriptor.metadata,
        },
    }).onConflictDoNothing()

    // 2. monthlyPlan.tasks[] mirror
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('@/services/agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd) => {
        const cast = rd as Record<string, unknown>
        const plan = (cast.monthlyPlan as Record<string, unknown> | undefined) || {}
        const tasks = Array.isArray(plan.tasks) ? (plan.tasks as Array<Record<string, unknown>>) : []
        const existingIdx = tasks.findIndex(t => t.id === descriptor.taskId)
        const task = {
            id: descriptor.taskId,
            title: descriptor.titleHe,
            summary: descriptor.summaryHe,
            type: 'paid_optimization',
            channel: 'google_ads',
            priority: descriptor.priority,
            weekOfMonth: 1,
            status: 'proposed',
            actionPlan: descriptor.actionPlan.map(s => ({
                step: s.step,
                automated: s.automated,
                estimatedMinutes: s.estimatedMinutes,
            })),
            sources: [{
                type: 'deferred_action',
                ref: action.id,
                excerpt: `${action.kind} applied ${action.appliedAt} — recovery due now.`,
            }],
            expectedImpact: descriptor.expectedImpact,
            estimatedEffort: '10_min',
        }
        if (existingIdx >= 0) tasks[existingIdx] = task
        else tasks.push(task)
        cast.monthlyPlan = { ...plan, tasks }
        return rd
    })
}