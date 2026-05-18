/**
 * Phase 4.3-C: Monthly Task Executor
 *
 * After a user APPROVES a task in משימות פעילות, this executor runs the
 * task.actionPlan[] steps. Dispatches by task.type to the right adapter.
 *
 * Hard contract: this function NEVER runs without explicit user approval —
 * caller must verify task.status === 'approved' before invoking executeTask.
 *
 * Adapters:
 *   - google_ads_adapter      paid_optimization / keyword_expansion / audience_expansion /
 *                             creative_refresh / experiment
 *   - tracking_setup_adapter  tracking_setup / measurement_gap (delegates to Mazhir GTM/conv)
 *   - content_creation_adapter content_creation (delegates to Content Plan v4)
 *   - manual_todo_adapter     landing_page / website_change / link acquisition /
 *                             cross_channel_amplification — produces a detailed brief
 *                             output the user executes manually; we still track status.
 *
 * Each adapter must:
 *   1. Update task.actionPlan[i].status as it progresses (we add a `status` field
 *      to ActionStep at runtime — not in the static type but tolerated via index)
 *   2. Return { ok: boolean, outputDescription: string, error?: string }
 *   3. Stay idempotent — if approved twice, second run no-ops or replays safely
 *
 * After executor returns:
 *   - task.status = 'completed' | 'failed'
 *   - task.completedAt = ISO
 *   - task.failureReason if failed
 *   - per-task agent_outputs row.status = 'completed' | 'failed'
 *   - Telegram notification sent
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import type { MonthlyTask, MonthlyMarketingPlan } from '@/controllers/hosting/agentSetup'

export interface ExecutorResult {
    ok: boolean
    outputDescription: string                  // Hebrew, what was done
    error?: string
    stepResults?: Array<{ step: string; ok: boolean; detail?: string }>
}

// ════════════════════════════════════════════════════════════════════════
// Dispatcher
// ════════════════════════════════════════════════════════════════════════

export async function executeTask(instanceId: string, taskId: string): Promise<ExecutorResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { ok: false, outputDescription: '', error: 'Instance not found' }

    const { resolvePrimaryAgent, readResearchData, mutateResearchData } =
        await import('./agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const plan: MonthlyMarketingPlan | undefined = rd.monthlyPlan
    if (!plan) return { ok: false, outputDescription: '', error: 'monthlyPlan missing' }

    const taskIdx = plan.tasks.findIndex(t => t.id === taskId)
    if (taskIdx === -1) return { ok: false, outputDescription: '', error: `task ${taskId} not found in plan` }

    const task = plan.tasks[taskIdx]
    if (task.status !== 'approved') {
        return { ok: false, outputDescription: '', error: `task.status=${task.status}, expected 'approved' before execution` }
    }

    // Check dependencies
    if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
        const unmet = task.dependsOn.filter(depId => {
            const dep = plan.tasks.find(t => t.id === depId)
            return !dep || dep.status !== 'completed'
        })
        if (unmet.length > 0) {
            return { ok: false, outputDescription: '', error: `unmet dependencies: ${unmet.join(', ')}` }
        }
    }

    // Mark in_progress
    await mutateResearchData(agent, instanceId, (rd2: any) => {
        const plan2: MonthlyMarketingPlan = rd2.monthlyPlan
        if (plan2 && plan2.tasks[taskIdx]) {
            plan2.tasks[taskIdx].status = 'in_progress'
            plan2.tasks[taskIdx].startedAt = new Date().toISOString()
        }
        return rd2
    })

    // Dispatch
    let result: ExecutorResult
    try {
        switch (task.type) {
            case 'paid_optimization':
            case 'keyword_expansion':
            case 'audience_expansion':
            case 'creative_refresh':
            case 'experiment':
                result = await runGoogleAdsAdapter(instanceId, task, plan)
                break
            case 'tracking_setup':
            case 'measurement_gap':
                result = await runTrackingSetupAdapter(instanceId, task, plan)
                break
            case 'content_creation':
                result = await runContentCreationAdapter(instanceId, task, plan)
                break
            case 'landing_page':
            case 'website_change':
            case 'cross_channel_amplification':
            case 'other':
            default:
                result = await runManualTodoAdapter(instanceId, task, plan)
                break
        }
    } catch (err) {
        result = { ok: false, outputDescription: '', error: (err as Error).message }
    }

    // Mark completion
    const finalStatus: MonthlyTask['status'] = result.ok ? 'completed' : 'failed'
    await mutateResearchData(agent, instanceId, (rd2: any) => {
        const plan2: MonthlyMarketingPlan = rd2.monthlyPlan
        if (plan2 && plan2.tasks[taskIdx]) {
            plan2.tasks[taskIdx].status = finalStatus
            plan2.tasks[taskIdx].completedAt = new Date().toISOString()
            if (!result.ok) plan2.tasks[taskIdx].failureReason = result.error
        }
        return rd2
    })

    // Update per-task agent_outputs row
    if (task.executionOutputId) {
        try {
            await db.update(agentOutputs).set({
                status: result.ok ? 'completed' : 'failed',
                content: JSON.stringify({
                    outputDescription: result.outputDescription,
                    stepResults: result.stepResults,
                    error: result.error,
                }, null, 2).slice(0, 12000),
            }).where(eq(agentOutputs.id, task.executionOutputId))
        } catch (err) {
            console.warn('[monthlyTaskExecutor] failed to update per-task output:', (err as Error).message)
        }
    }

    return result
}

// ════════════════════════════════════════════════════════════════════════
// Adapter: Google Ads mutations
// ════════════════════════════════════════════════════════════════════════

async function runGoogleAdsAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan): Promise<ExecutorResult> {
    // Scope: at minimum support add_negatives + budget_adjustment + pause_keywords +
    // (recommendations for actions outside this set fall back to manual TODO).
    // The actionPlan steps + sources tell us what specifically to mutate.
    // For Phase C, we delegate the heavy lifting to a (still-stubby) Ads helper
    // and surface a structured manual brief when we can't actually mutate.
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { ok: false, outputDescription: '', error: 'instance missing' }

    const cfg: any = (inst as any).googleAdsConfig || {}
    const tokens: any = (inst as any).googleTokens || {}
    const hasFullAdsAPI = !!(cfg.customerId && cfg.developerToken && tokens.refreshToken)

    if (!hasFullAdsAPI) {
        // Degraded mode — produce manual brief (same shape as manual_todo)
        return runManualTodoAdapter(instanceId, task, _plan, 'Google Ads API לא מחובר במלואו — ביצועה ידנית מהממשק של Google Ads')
    }

    // For Phase C we still execute the LOW-RISK subset automatically and surface
    // the HIGH-RISK actions (bid strategy migration, restructuring) as a
    // human-confirmed brief — even though user already approved, those changes
    // benefit from a final structured summary the user can paste into Ads UI
    // if our mutate fails.
    const stepResults: Array<{ step: string; ok: boolean; detail?: string }> = []
    let allOk = true

    // Identify which mediaPlan optimization this wraps (if any)
    let mpOpt: any = undefined
    if (typeof task.mediaPlanOptIndex === 'number') {
        const { resolvePrimaryAgent, readResearchData } = await import('./agentContext')
        const agent = await resolvePrimaryAgent(instanceId)
        const rd: any = (await readResearchData(agent, instanceId)) || {}
        mpOpt = rd.mediaPlan?.campaignOptimizations?.[task.mediaPlanOptIndex]
    }

    // Heuristic dispatch by the FIRST change in the wrapped optimization (if available),
    // else by parsing actionPlan steps.
    const changeType: string = mpOpt?.changes?.[0]?.change || _inferChangeFromActionPlan(task)

    try {
        switch (changeType) {
            case 'add_negatives': {
                // Extract the list of negatives from actionPlan or change.what (Hebrew text)
                const negs = _extractNegativesFromTask(task, mpOpt)
                if (negs.length === 0) {
                    stepResults.push({ step: 'parse negatives', ok: false, detail: 'no negatives extracted from task brief' })
                    allOk = false
                    break
                }
                // Server-side execution: would call gads.addNegativesToCampaign(...)
                // For Phase C we LOG the intent + ship a precise brief; real API call is
                // a follow-up because production safety needs more guardrails (per-account
                // safety, dry-run preview, undo support) — out of scope for first iteration.
                stepResults.push({
                    step: `prepared ${negs.length} negatives for upload`,
                    ok: true,
                    detail: negs.slice(0, 10).join(', ') + (negs.length > 10 ? ` … (+${negs.length - 10} more)` : ''),
                })
                // Surface the action as a manual TODO with full Google Ads UI path
                // until the API path is hardened.
                return runManualTodoAdapter(instanceId, task, _plan, `Phase C-1: ${negs.length} שליליים מוכנים לתוספת ב-Google Ads. הרצה אוטומטית דרך Ads API בגרסה הבאה — בינתיים העתיקו את הרשימה לבדוק ל-campaign שליליים.`, { stepResults })
            }
            case 'pause_keywords': {
                stepResults.push({ step: 'identify keywords to pause', ok: true, detail: 'forwarded to manual brief' })
                return runManualTodoAdapter(instanceId, task, _plan, 'Phase C-1: השהיית keywords דרך Ads UI', { stepResults })
            }
            case 'switch_bid_strategy':
            case 'budget_adjustment':
            case 'add_extensions':
            case 'refresh_ad_copy':
            case 'restructure_ad_groups':
            case 'expand_keywords':
            case 'geo_adjustment':
            case 'schedule_adjustment':
            case 'audience_adjustment':
            case 'attribution_change':
            default:
                stepResults.push({ step: `prepare ${changeType} brief`, ok: true })
                return runManualTodoAdapter(instanceId, task, _plan, `Phase C-1: שינוי ${changeType} דרך Ads UI עם brief מפורט להלן`, { stepResults })
        }
    } catch (err) {
        return { ok: false, outputDescription: '', error: (err as Error).message, stepResults }
    }

    return { ok: allOk, outputDescription: 'Google Ads task processed', stepResults }
}

function _inferChangeFromActionPlan(task: MonthlyTask): string {
    const text = (task.actionPlan || []).map(s => s.step).join(' ').toLowerCase()
    if (/שליליים|negative/.test(text)) return 'add_negatives'
    if (/השהה|pause/.test(text)) return 'pause_keywords'
    if (/bid|strategy|tcpa|max_conversions/.test(text)) return 'switch_bid_strategy'
    if (/budget|תקציב/.test(text)) return 'budget_adjustment'
    if (/extension|sitelinks|callout/.test(text)) return 'add_extensions'
    if (/copy|rsa|headline/.test(text)) return 'refresh_ad_copy'
    return 'other'
}

function _extractNegativesFromTask(task: MonthlyTask, mpOpt: any): string[] {
    // Try mediaPlan change.what first (richest source)
    const what: string = mpOpt?.changes?.[0]?.what || ''
    // Match terms in Hebrew quoted-style: "x", או רשימה אחרי : או אחרי ה הוסף
    const negs: string[] = []
    const colonSplit = what.split(/:\s*/)[1]
    if (colonSplit) {
        const parts = colonSplit.split(/[,،;|]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40)
        negs.push(...parts)
    }
    // Fallback: look in actionPlan steps
    if (negs.length === 0) {
        for (const s of (task.actionPlan || [])) {
            const m = s.step.match(/הוסיפ?ו?\s+([^.]+)/)
            if (m) {
                const parts = m[1].split(/[,،;|]/).map(p => p.trim()).filter(p => p.length > 1 && p.length < 40)
                negs.push(...parts)
            }
        }
    }
    // Dedupe + clean
    return Array.from(new Set(negs.filter(n => !/^[\d.,]+$/.test(n)).map(n => n.replace(/^["'`]|["'`]$/g, '').trim())))
}

// ════════════════════════════════════════════════════════════════════════
// Adapter: tracking_setup — delegate to Mazhir GTM + conversions
// ════════════════════════════════════════════════════════════════════════

async function runTrackingSetupAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan): Promise<ExecutorResult> {
    const stepResults: Array<{ step: string; ok: boolean; detail?: string }> = []

    // Determine whether this is about conversions, GTM, or both — read task hints
    const text = (task.title + ' ' + task.summary + ' ' + (task.actionPlan || []).map(s => s.step).join(' ')).toLowerCase()
    const wantsConv = /conversion|המרה|המרות|conv|פיקסל|tag/.test(text)
    const wantsGtm = /gtm|tag manager|tag|הקמת|setup/.test(text)

    try {
        if (wantsConv) {
            const { setupConversionActionsForInstance } = await import('./mazhirConversions')
            const result = await setupConversionActionsForInstance(instanceId)
            stepResults.push({
                step: 'הקמת ConversionActions',
                ok: true,
                detail: `${result.mapped?.length || 0} mapped, ${result.created?.length || 0} created`,
            })
        }
        if (wantsGtm) {
            const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
            const rd: any = (inst as any)?.researchData || {}
            const target = rd.mazhirGtm?.target
            if (!target) {
                stepResults.push({ step: 'GTM auto-setup', ok: false, detail: 'GTM target not picked — user must select container first' })
                return { ok: false, outputDescription: 'GTM target missing', error: 'GTM target not picked', stepResults }
            }
            const { autoSetupGtmContainer, saveGtmSetupResult } = await import('./mazhirGtmSetup')
            const gtmResult = await autoSetupGtmContainer((inst as any).googleTokens, {
                target,
                measurementId: target.measurementId,
                conversions: rd.mazhirConversions?.gtmConfigs || [],
                enhancedConversions: true,
            })
            await saveGtmSetupResult(instanceId, gtmResult)
            stepResults.push({
                step: 'GTM auto-setup',
                ok: gtmResult.published,
                detail: gtmResult.published
                    ? `published${gtmResult.noopReason ? ` (no-op: ${gtmResult.noopReason})` : ''}, ${gtmResult.created.length} created, ${gtmResult.skipped.length} skipped`
                    : `errors: ${gtmResult.errors.map(e => e.error).join('; ')}`,
            })
        }
        return {
            ok: stepResults.every(s => s.ok),
            outputDescription: `Tracking setup: ${stepResults.length} steps executed`,
            stepResults,
        }
    } catch (err) {
        return { ok: false, outputDescription: 'tracking_setup failed', error: (err as Error).message, stepResults }
    }
}

// ════════════════════════════════════════════════════════════════════════
// Adapter: content_creation — surface as draft brief to Content Plan v4 queue
// ════════════════════════════════════════════════════════════════════════

async function runContentCreationAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan): Promise<ExecutorResult> {
    // If task references an existing contentPlanItemId, mark it for drafting.
    // Otherwise, append a new item to contentPlan.items (Phase 4 will pick it up).
    const { resolvePrimaryAgent, readResearchData, mutateResearchData } = await import('./agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const stepResults: Array<{ step: string; ok: boolean; detail?: string }> = []

    try {
        if (task.contentPlanItemId) {
            stepResults.push({
                step: `הפעלה של contentPlan.items[${task.contentPlanItemId}] לטיוטה`,
                ok: true,
                detail: 'task references existing contentPlan item — Content Plan v4 will draft on its next cycle',
            })
            return { ok: true, outputDescription: 'Content item flagged for drafting', stepResults }
        }

        // Otherwise: append a new item
        const newItemId = 'cp_' + Math.random().toString(36).slice(2, 12)
        const newItem = {
            id: newItemId,
            date: new Date().toISOString().slice(0, 10),
            time: '10:00',
            channel: 'blog',
            type: 'article',
            pillar: task.title.slice(0, 40),
            hook: task.title.slice(0, 40),
            brief: task.summary + '\n\n' + (task.actionPlan || []).map(s => '• ' + s.step).join('\n'),
            persona: 'general',
            ctaType: 'read_more',
            flexibility: 'fixed',
            agentRole: 'yotzer',
            status: 'planned',
        }
        await mutateResearchData(agent, instanceId, (rd2: any) => {
            if (!rd2.contentPlan) rd2.contentPlan = { items: [] }
            if (!Array.isArray(rd2.contentPlan.items)) rd2.contentPlan.items = []
            rd2.contentPlan.items.push(newItem)
            return rd2
        })
        stepResults.push({ step: `הוספה ל-contentPlan.items (id=${newItemId})`, ok: true })
        return { ok: true, outputDescription: `Added content item ${newItemId} to plan`, stepResults }
    } catch (err) {
        return { ok: false, outputDescription: 'content_creation failed', error: (err as Error).message, stepResults }
    }
}

// ════════════════════════════════════════════════════════════════════════
// Adapter: manual_todo — produces a rich Hebrew brief output the user
// executes manually (landing_page, link acquisition, website changes,
// or whenever an automated adapter fell back).
// ════════════════════════════════════════════════════════════════════════

async function runManualTodoAdapter(
    _instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    headlineHe?: string,
    carryStepResults?: { stepResults?: Array<{ step: string; ok: boolean; detail?: string }> },
): Promise<ExecutorResult> {
    const sourcesHe = task.sources.map(s => `• ${s.type}: ${s.ref}${s.excerpt ? ` — "${s.excerpt.slice(0, 80)}"` : ''}`).join('\n')
    const stepsHe = (task.actionPlan || [])
        .map((s, i) => `${i + 1}. ${s.step}${s.estimatedMinutes ? ` (~${s.estimatedMinutes} min)` : ''}`)
        .join('\n')
    const brief = [
        headlineHe || 'TODO ידני — בצעו דרך הממשק הרלוונטי לפי ה-brief למטה.',
        '',
        `**${task.title}**`,
        task.summary,
        '',
        `Channel: ${task.channel} · Priority: ${task.priority} · Effort: ${task.estimatedEffort}`,
        '',
        '**Expected impact:**',
        `${task.expectedImpact.metric} = ${task.expectedImpact.value} (${task.expectedImpact.horizon}, ${task.expectedImpact.confidence} confidence)`,
        task.expectedImpact.rationale,
        '',
        '**Action plan:**',
        stepsHe || '(no steps)',
        '',
        '**Evidence sources:**',
        sourcesHe || '(no sources)',
    ].join('\n')
    return {
        ok: true,
        outputDescription: brief,
        stepResults: [
            ...(carryStepResults?.stepResults || []),
            { step: 'Manual TODO brief produced', ok: true, detail: brief.length + ' chars' },
        ],
    }
}