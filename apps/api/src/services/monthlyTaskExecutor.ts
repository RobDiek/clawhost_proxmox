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
import { randomBytes } from 'crypto'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import type { MonthlyTask, MonthlyMarketingPlan } from '@/controllers/hosting/agentSetup'

export interface ExecutorResult {
    ok: boolean
    outputDescription: string                  // Hebrew, what was done
    error?: string
    stepResults?: Array<{ step: string; ok: boolean; detail?: string }>
    // Phase 2026.02 Block 6 Pattern F: task is NOT a failure — auto-execute
    // did what it could (e.g. surfaced manual instructions with our help)
    // but the final step requires user action. Maps to agent_outputs.status
    // = 'awaiting_manual'. User clicks "✓ ביצעתי ידנית" in UI to flip
    // status → 'completed'.
    awaitingManual?: boolean
    // K31 — Error UX taxonomy. Differentiates outcomes that look the same on
    // the surface but mean very different things to the founder:
    //   • completed              — real mutation performed (default for ok:true)
    //   • awaiting_user_action   — adapter produced brief; founder clicks "סיימתי"
    //   • integration_missing    — adapter blocked by missing OAuth / pixel / token.
    //                              Surfaces in notifications widget with "connect X" CTA.
    //                              Task remains in queue with 🔌 badge.
    //   • systemic_bug           — adapter threw / unhandled exception.
    //                              Telegram alert to OWNER (Sergei) — code fix needed.
    //   • not_implemented        — adapter routing missed (ok:true + stepResults.length===0).
    //                              Same severity as systemic_bug; OWNER alert.
    //   • completed_idempotent_noop — adapter ran but state already correct (e.g. K31:
    //                                 GTM check found all 10 tags already present).
    //                                 Distinguished from not_implemented to avoid false alarms.
    errorCategory?: 'completed' | 'awaiting_user_action' | 'integration_missing'
                  | 'systemic_bug' | 'not_implemented' | 'completed_idempotent_noop'
    // For integration_missing — payload that powers the notifications widget.
    userAction?: {
        title_he: string         // "GA4 לא מחובר — נדרשת התחברות"
        cta_he: string           // "התחברו ל-GA4 →"
        action_path?: string     // "/dashboard#integrations/ga4" — relative URL
        integrationKey?: string  // "ga4" | "gtm" | "meta" | etc.
    }
}

// ════════════════════════════════════════════════════════════════════════
// Dispatcher
// ════════════════════════════════════════════════════════════════════════

export async function executeTask(
    instanceId: string,
    taskId: string,
    agentId?: string | null,    // Phase 2026.02 Block 6: multi-agent VPS support.
    //                            When agent owning the plan is SECONDARY (e.g. Packing
    //                            Station mta_Un9jXRuf vs primary Storage Station),
    //                            resolvePrimaryAgent reads Storage's research_data and
    //                            finds no monthlyPlan → 'monthlyPlan missing' error.
    //                            Caller (triggerPostApprove) passes output.agentId.
): Promise<ExecutorResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { ok: false, outputDescription: '', error: 'Instance not found' }

    const { resolvePrimaryAgent, resolveAgentById, readResearchData, mutateResearchData } =
        await import('./agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const plan: MonthlyMarketingPlan | undefined = rd.monthlyPlan
    if (!plan) return { ok: false, outputDescription: '', error: 'monthlyPlan missing' }

    const taskIdx = plan.tasks.findIndex(t => t.id === taskId)
    if (taskIdx === -1) return { ok: false, outputDescription: '', error: `task ${taskId} not found in plan` }

    const task = plan.tasks[taskIdx]
    // K20: allow 'failed' as a re-entry status when retryCount < 3, so the
    // failedTaskRetryRunner cron can re-dispatch without first flipping the
    // status (which would create a confusing 'approved' intermediate state).
    const isRetryAttempt = task.status === 'failed' && ((task as any).retryCount || 0) < 3
    if (task.status !== 'approved' && !isRetryAttempt) {
        return { ok: false, outputDescription: '', error: `task.status=${task.status}, expected 'approved' or 'failed' with retries remaining` }
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
                result = await runTrackingSetupAdapter(instanceId, task, plan, agent)
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

    // Mark completion + capture executionOutcome (Phase 4.3-N v8)
    // K31 — Error UX taxonomy. Classify result BEFORE deciding status so we
    // catch silent skips (ok:true + stepResults empty) as not_implemented,
    // distinguish integration_missing from systemic_bug, and route to the
    // right surface (Telegram OWNER vs notifications widget).
    if (!result.errorCategory) {
        const stepCount = Array.isArray(result.stepResults) ? result.stepResults.length : 0
        const errStr = String(result.error || '').toLowerCase()
        const isIntegrationError = /\b(oauth|token|not connected|missing|pixel|api key|developer token|refresh token|scope)\b/i.test(errStr)
        const isStackTrace = /typeerror|undefined|cannot read|null reference|stack/i.test(errStr)
        if (result.awaitingManual) {
            result.errorCategory = 'awaiting_user_action'
        } else if (result.ok && stepCount === 0) {
            // Silent skip — adapter routing missed this task type. CRITICAL.
            // Coerce ok→false so downstream failure path fires (Telegram OWNER).
            result.errorCategory = 'not_implemented'
            result.ok = false
            result.error = result.error || `silent skip detected — adapter returned ok:true with 0 steps for type=${task.type}/channel=${task.channel}`
        } else if (!result.ok && isIntegrationError) {
            result.errorCategory = 'integration_missing'
        } else if (!result.ok && isStackTrace) {
            result.errorCategory = 'systemic_bug'
        } else if (!result.ok) {
            // ok:false без явных integration/stack маркеров — assume systemic.
            result.errorCategory = 'systemic_bug'
        } else {
            // ok:true with steps — real completion (or idempotent noop if all
            // stepResults indicate "already exists" / "no-op").
            const allNoop = stepCount > 0 && (result.stepResults || []).every(s => {
                const det = String(s.detail || '').toLowerCase()
                return /no-op|already exists|already present|preserved|skipped|fully idempotent/.test(det)
            })
            result.errorCategory = allNoop ? 'completed_idempotent_noop' : 'completed'
        }
    }

    // Map errorCategory → agent_outputs.status. blocked_integration is a NEW
    // status that keeps task in queue (still actionable by founder) but with
    // an integration-missing badge instead of completed/failed states.
    const finalStatus: any = (() => {
        switch (result.errorCategory) {
            case 'awaiting_user_action':       return 'awaiting_manual'
            case 'integration_missing':        return 'blocked_integration'
            case 'systemic_bug':               return 'failed'
            case 'not_implemented':            return 'failed'   // surface as failure; OWNER alert
            case 'completed':
            case 'completed_idempotent_noop':  return 'completed'
            default:                           return result.awaitingManual ? 'awaiting_manual' : (result.ok ? 'completed' : 'failed')
        }
    })()
    const completedAt = new Date().toISOString()
    // K20: failure retry book-keeping. Computed BEFORE the mutate so we can
    // reason about whether to spawn an investigate child task at max retries.
    const MAX_RETRIES = 3
    const RETRY_BACKOFF_HOURS = [1, 4, 24]   // hours after each failure
    let spawnedChildTaskId: string | undefined
    let isFinalFailure = false
    // K31: only retry recoverable failures. NOT retry-worthy:
    //   - integration_missing: user must connect; retrying without won't help
    //   - not_implemented:     code fix needed (silent skip); retry would loop
    //   - systemic_bug:        code fix needed; retry would loop
    // Only transient failures (network glitches, rate limits) deserve retry.
    const noRetryCategories = new Set(['integration_missing', 'not_implemented', 'systemic_bug'])
    const shouldRetry = !result.ok && !noRetryCategories.has(result.errorCategory || '')
    if (shouldRetry) {
        const prevRetryCount = (task as any).retryCount || 0
        const nextRetryCount = prevRetryCount + 1
        if (nextRetryCount >= MAX_RETRIES) {
            isFinalFailure = true
            spawnedChildTaskId = 'tsk_inv_' + randomBytes(5).toString('hex')
        }
    }
    await mutateResearchData(agent, instanceId, (rd2: any) => {
        const plan2: MonthlyMarketingPlan = rd2.monthlyPlan
        if (plan2 && plan2.tasks[taskIdx]) {
            plan2.tasks[taskIdx].status = finalStatus
            plan2.tasks[taskIdx].completedAt = completedAt
            if (!result.ok) {
                plan2.tasks[taskIdx].failureReason = result.error
                // K20+K31: only increment retry counters when retry is appropriate.
                // integration_missing doesn't retry (user must connect first).
                const cur: any = plan2.tasks[taskIdx]
                cur.errorCategory = result.errorCategory   // persist for UI
                if (result.userAction) cur.userAction = result.userAction
                if (!shouldRetry) {
                    // integration_missing path — no retry scheduling, no child task.
                    // Stays in queue (status='blocked_integration') for user to act.
                } else {
                    cur.retryCount = (cur.retryCount || 0) + 1
                    cur.lastRetryError = String(result.error || '').slice(0, 200)
                    if (cur.retryCount < MAX_RETRIES) {
                        const hours = RETRY_BACKOFF_HOURS[cur.retryCount - 1] || 24
                        cur.nextRetryAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()
                    } else if (spawnedChildTaskId) {
                        cur.retryChildTaskId = spawnedChildTaskId
                        cur.childTaskIds = Array.isArray(cur.childTaskIds) ? [...cur.childTaskIds, spawnedChildTaskId] : [spawnedChildTaskId]
                        // Spawn the investigate task inline so monthlyReauditRunner sees it next month
                        // and the dashboard can link to it immediately.
                        const investigateTask: MonthlyTask = {
                            id: spawnedChildTaskId,
                            type: 'measurement_gap',
                            title: `חקירת תקלה חוזרת: ${(cur.title || '').slice(0, 60)}`,
                            summary: `המשימה נכשלה ${MAX_RETRIES} פעמים. נדרשת בדיקה ידנית של הסיבה לפני ניסיון נוסף.`,
                            channel: cur.channel || 'cross',
                            priority: cur.priority === 'P0' ? 'P0' : 'P1',
                            estimatedEffort: '1_hour',
                            expectedImpact: {
                                metric: 'other',
                                value: 1,
                                horizon: '7d',
                                confidence: 'high',
                                rationale: 'חקירת שורש לכשל חוזר במשימה האב',
                            },
                            sources: [{ type: 'other', ref: `parent_task:${cur.id}`, excerpt: `שגיאה אחרונה: ${String(result.error || '').slice(0, 100)}` }],
                            dependsOn: [],
                            actionPlan: [
                                { step: `בדקו את ה-error log עבור המשימה ${cur.id}`, automated: false, estimatedMinutes: 10 },
                                { step: 'אבחנו אם השגיאה ניתנת לפתרון אוטומטי (rate limit / network) או דורשת תיקון הגדרות', automated: false, estimatedMinutes: 15 },
                                { step: 'אם ניתן לפתרון — חזרו לכרטיס המקור ולחצו "נסה שוב". אחרת — תקנו את ההגדרות הבסיסיות ויצרו משימה חדשה', automated: false, estimatedMinutes: 20 },
                                { step: 'תעדו את שורש הבעיה לטובת חקירה עתידית של דפוסי כשל', automated: false, estimatedMinutes: 5 },
                            ],
                            status: 'proposed',
                            proposedAt: new Date().toISOString(),
                            scheduledFor: new Date().toISOString().slice(0, 10),
                            weekOfMonth: cur.weekOfMonth,
                        }
                        plan2.tasks.push(investigateTask)
                    }
                }
                // K31: integration_missing → push notification entry into
                // research_data.notifications[] so dashboard widget surfaces
                // "connect X" CTA. Idempotent: skip if same task already has
                // a notification entry.
                if (!shouldRetry && result.errorCategory === 'integration_missing' && result.userAction) {
                    const notifs = Array.isArray(rd2.notifications) ? rd2.notifications : []
                    const exists = notifs.some((n: any) => n?.taskId === cur.id && n?.type === 'integration_missing')
                    if (!exists) {
                        notifs.push({
                            id: `notif_${randomBytes(4).toString('hex')}`,
                            type: 'integration_missing',
                            taskId: cur.id,
                            outputId: task.executionOutputId,
                            title_he: result.userAction.title_he,
                            cta_he: result.userAction.cta_he,
                            action_path: result.userAction.action_path,
                            integrationKey: result.userAction.integrationKey,
                            createdAt: new Date().toISOString(),
                            dismissed: false,
                        })
                        rd2.notifications = notifs
                    }
                }
            }
            // Phase 4.3-N v8: persistent executionOutcome — what was actually done.
            // Read by NEXT month's monthlyPlanGenerator to inform "stop / replicate / iterate"
            // decisions. actualImpact (real Google Ads metrics delta) is populated later by
            // K18's TaskOutcomeAttribution cron (services/taskOutcomeAttribution.ts).
            ;(plan2.tasks[taskIdx] as any).executionOutcome = {
                completedAt,
                completedMethod: result.awaitingManual ? 'auto_pre_provision_manual_followup' : 'automated',
                outputDescription: result.outputDescription,
                stepResults: result.stepResults || [],
                error: result.error,
            }
        }
        return rd2
    })

    // K20+K31: Telegram alert routing by error category.
    // - integration_missing  → NO alert (user-actionable; surfaces in dashboard notifications)
    // - awaiting_user_action → NO alert (task stays in queue with "סיימתי" button)
    // - systemic_bug + not_implemented → IMMEDIATE OWNER alert with full trace
    // - failed (other reasons) → K20 retry escalation (existing logic)
    if (!result.ok) {
        try {
            const telegram = (await import('./telegram')).default
            const titleShort = (task.title || '').slice(0, 60)
            const errShort = String(result.error || result.outputDescription || 'no detail').slice(0, 200)
            if (result.errorCategory === 'integration_missing') {
                // no-op — surfaced in dashboard notifications widget
            } else if (result.errorCategory === 'systemic_bug' || result.errorCategory === 'not_implemented') {
                // OWNER alert — code fix needed. Includes adapter routing hint.
                const adapterHint = result.errorCategory === 'not_implemented'
                    ? 'silent skip — adapter routing missed this task type'
                    : 'unhandled exception / TypeError in executor'
                const msg = `🐛 *Systemic bug — owner attention required*\n\n` +
                    `Instance: \`${instanceId}\`\n` +
                    `Task: \`${task.id}\`\n` +
                    `Type/Channel: ${task.type}/${task.channel}\n` +
                    `Title: ${titleShort}\n\n` +
                    `Category: \`${result.errorCategory}\`\n` +
                    `Hint: _${adapterHint}_\n\n` +
                    `Error: ${errShort}`
                await telegram.alertAdmin(msg)
                console.log(`[monthlyTaskExecutor] K31 OWNER alert sent for ${task.id} (${result.errorCategory})`)
            } else if (isFinalFailure) {
                const msg = `🚨 *משימה נכשלה ${MAX_RETRIES} פעמים* · ${instanceId}\n\n` +
                    `${titleShort}\n\n` +
                    `שגיאה אחרונה: _${errShort}_\n\n` +
                    `נוצרה משימת חקירה חדשה: ${spawnedChildTaskId || ''}\n` +
                    `_פתחו את הדאשבורד כדי לחקור או לנסות מחדש ידנית_`
                await telegram.alertAdmin(msg)
            } else {
                const retryNum = ((task as any).retryCount || 0) + 1
                const msg = `❌ ${titleShort} נכשלה (ניסיון ${retryNum}/${MAX_RETRIES}) · ${instanceId}\n_${errShort}_\nניסיון חוזר אוטומטי יבוצע בקרוב.`
                await telegram.alertAdmin(msg)
            }
        } catch (err) {
            console.warn('[monthlyTaskExecutor] K20+K31 failure alert failed:', (err as Error).message)
        }
    }

    // Update per-task agent_outputs row
    if (task.executionOutputId) {
        try {
            await db.update(agentOutputs).set({
                status: finalStatus,
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

async function runTrackingSetupAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent?: any,    // Phase 2026.02 Block 6: agent-scoped reads (multi-agent VPS).
                    // Resolved upstream in executeTask; we use it for
                    // research_data reads (mazhirGtm.target etc.) and writes.
): Promise<ExecutorResult> {
    const stepResults: Array<{ step: string; ok: boolean; detail?: string }> = []

    // Determine whether this is about conversions, GTM, or both — read task hints.
    // Phase 2026.02 Block 6: tightened regex. Old `/conv/` matched 'consent'
    // (false positive on tsk_consent_mode_v2). Old `/tag/` matched any 'tag'
    // word. Now:
    //   - wantsConv = explicit conversion-creation signal (paid_profile flow).
    //     Skipped entirely for tracking_setup/measurement_gap (Path B-1
    //     tenants don't have paidProfile — they use the wantsPrimaryReconcile
    //     branch and autoSetupGtmContainer instead).
    //   - wantsGtm = GTM tag publish signal, includes consent/enhanced_conversions
    //     variants used by tracking-foundation Mission #1.
    const text = (task.title + ' ' + task.summary + ' ' + (task.actionPlan || []).map(s => s.step).join(' ')).toLowerCase()
    const wantsConv = task.type !== 'tracking_setup' && task.type !== 'measurement_gap'
        && /\bconversion\b|המרה|המרות|פיקסל|conversionaction|פעולות[\s-]*ערך/i.test(text)
    // sGTM (server-side container deploy on Cloud Run / VPS) is NOT
    // autoSetupGtmContainer's job — autoSetupGtmContainer publishes
    // CLIENT-side tags into the existing GTM workspace. Treat sGTM as
    // its own manual-brief track until we wire VPS auto-deploy.
    const wantsSgtm = /\bsgtm\b|server[-\s]*side[-\s]*gtm|server[-\s]*side[-\s]*container|sgtm[-\s]*container|cloud[-\s]*run/i.test(text)
    // GA4 → BigQuery export — requires user GCP project + billing + IAM grant
    // for firebase-measurement service account. Cannot fully auto without
    // expanded OAuth scopes (cloudbilling/serviceusage/iam/resourcemanager).
    // For now surfaces a manual brief via Pattern F awaiting_manual.
    const wantsGa4BigQuery = /bigquery|big[-\s]*query|bq[-\s]*export|ga4.*bigquery|ga4.*bq/i.test(text)
    // K31: detect GA4 reconnect / OAuth-status tasks. Pre-K31 these fell
    // through to the silent-skip path; now we explicitly check OAuth state
    // and return integration_missing (dashboard notification, not Telegram).
    const wantsGa4Reconnect = !wantsGa4BigQuery
        && task.channel === 'ga4'
        && /reconnect|חיבור[\s-]*מחדש|reconnect|נותק|disconnect|OAuth/i.test(text)
    // K31: detect Meta pixel/CAPI tasks similarly — adapter had no Meta path.
    const wantsMetaPixel = task.channel === 'meta'
        && /pixel|פיקסל|capi|conversion[\s-]*api|ממשק[\s-]*api|meta.*track/i.test(text)
    const wantsGtm = !wantsSgtm && !wantsGa4BigQuery && !wantsGa4Reconnect && !wantsMetaPixel && /\bgtm\b|מנהל[\s-]*התגיות|tag[\s-]*manager|consent[\s-]*mode|enhanced[\s-]*conversions/i.test(text)
    // Phase 2026.02 Block 6: detect "mark primary / demote others" tasks
    // (tsk_cr_validation archetype). measurement_gap + Hebrew/English "primary"
    // keywords route to reconcilePrimaryConversionActions instead of full
    // setupConversionActionsForInstance (which would CREATE new actions; we
    // want to DEMOTE existing phantom-signal primaries and PROMOTE the real
    // conversion category).
    const wantsPrimaryReconcile = task.type === 'measurement_gap'
        && /ראשית|primary[\s-]*(for[\s-]*goal|conversion|action)|מסומן|סימון.{0,40}(רכישה|primary)/i.test(text)

    // ─── K31: GA4 reconnect path ──────────────────────────────────────
    if (wantsGa4Reconnect) {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        // Per-agent integration check (Packing Station = secondary on this VPS)
        let ga4ScopePresent = false
        try {
            const { getAgentIntegration } = await import('./agentIntegrations')
            const ga4Int = await getAgentIntegration(instanceId, 'mt' as any, 'google' as any, agent?.id || null)
            const scopes: string[] = Array.isArray((ga4Int?.config as any)?.scopes) ? (ga4Int!.config as any).scopes : []
            ga4ScopePresent = scopes.some(s => /analytics\.readonly|analytics\.edit|analytics$/.test(String(s)))
            if (!ga4ScopePresent) {
                const tokens = (inst as any)?.googleTokens || {}
                ga4ScopePresent = Array.isArray(tokens.scopes) && tokens.scopes.some((s: string) => /analytics/.test(s))
            }
        } catch { /* fall through to missing */ }

        if (!ga4ScopePresent) {
            return {
                ok: false,
                outputDescription: 'GA4 OAuth scope missing — user must reconnect via Integrations',
                error: 'GA4 not connected — OAuth scope analytics.readonly absent',
                stepResults: [{ step: 'GA4 OAuth scope check', ok: false, detail: 'No google analytics scope found in agent_integrations or instance.googleTokens' }],
                errorCategory: 'integration_missing',
                userAction: {
                    title_he: 'GA4 לא מחובר — נדרשת התחברות מחדש',
                    cta_he: 'התחברו ל-GA4 →',
                    action_path: '#integrations/google',
                    integrationKey: 'ga4',
                },
            }
        }
        // OAuth scope present → mark verified (no actual reconnect needed,
        // OAuth refresh tokens stay valid as long as we use them periodically)
        return {
            ok: true,
            outputDescription: 'GA4 OAuth verified — connection healthy',
            stepResults: [{ step: 'GA4 OAuth scope check', ok: true, detail: 'analytics.readonly scope confirmed in tokens' }],
            errorCategory: 'completed',
        }
    }

    // ─── K31: Meta Pixel + CAPI path ──────────────────────────────────
    if (wantsMetaPixel) {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const metaTokens: any = (inst as any)?.metaTokens || {}
        const hasMetaToken = !!(metaTokens.accessToken || metaTokens.userAccessToken || metaTokens.pageAccessToken)
        const hasMetaPixel = !!metaTokens.pixelId
        if (!hasMetaToken || !hasMetaPixel) {
            return {
                ok: false,
                outputDescription: 'Meta token / pixel missing — user must connect Meta in Integrations',
                error: `Meta not fully connected: token=${hasMetaToken} pixel=${hasMetaPixel}`,
                stepResults: [{ step: 'Meta pixel + token check', ok: false, detail: `accessToken=${hasMetaToken} pixelId=${hasMetaPixel}` }],
                errorCategory: 'integration_missing',
                userAction: {
                    title_he: 'Meta Pixel + CAPI לא מחוברים',
                    cta_he: 'חברו את Meta →',
                    action_path: '#integrations/meta',
                    integrationKey: 'meta',
                },
            }
        }
        return runManualTodoAdapter(instanceId, task, _plan, 'Meta connected — אמתו ש-Pixel + Conversion API פעילים דרך Events Manager', { stepResults: [{ step: 'Meta token check', ok: true, detail: `pixelId=${metaTokens.pixelId}` }] })
    }

    try {
        if (wantsPrimaryReconcile) {
            const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
            // Phase 2026.02 Block 6: prefer mateh_agent.googleAdsConfig (multi-agent
            // VPS) over legacy instances.googleAdsConfig — agent owns scope.
            // `agent` is passed in from executeTask (post agentId resolution).
            let cfg: any = (agent as any)?.googleAdsConfig || {}
            let tokens: any = (agent as any)?.googleTokens || {}
            if (!cfg.customerId || !tokens.refreshToken) {
                cfg = (inst as any).googleAdsConfig || {}
                tokens = (inst as any).googleTokens || {}
            }

            if (!cfg.customerId || !cfg.developerToken || !tokens.refreshToken) {
                stepResults.push({ step: 'primary reconcile pre-check', ok: false, detail: 'Google Ads API tokens incomplete' })
                return runManualTodoAdapter(instanceId, task, _plan, 'Google Ads API לא מחובר במלואו — סימון "ראשית" ידנית מ-Google Ads → Goals', { stepResults })
            }

            // CRITICAL: in MCC topologies, conversion actions live on the
            // OPERATING sub-account (scope.operatingCustomerId), NOT on the
            // login MCC (customerId). Querying the MCC returns either empty
            // results or "Manager accounts can't have conversion actions" —
            // and our reconcile reported "demoted 0" because the API was
            // pointed at the wrong customer. Always use operatingCustomerId
            // when present (= the sub-account), with customerId as the
            // OAuth login_customer_id header.
            const operatingCustomerId: string = cfg.scope?.operatingCustomerId
                || cfg.operatingCustomerId
                || cfg.customerId
            const loginCustomerId: string = cfg.loginCustomerId
                || cfg.customerId
                || operatingCustomerId
            stepResults.push({
                step: 'resolve MCC topology',
                ok: true,
                detail: `operating=${operatingCustomerId}, login=${loginCustomerId}`,
            })

            // Infer desired primary category from task text.
            // For Packing Station: רכישה → PURCHASE. For a SaaS lead: → LEAD/SUBMIT_LEAD_FORM.
            // Defaults to PURCHASE which matches the most common eCom playbook.
            const desiredCategory: 'PURCHASE' | 'LEAD' | 'SUBMIT_LEAD_FORM' | 'PHONE_CALL_LEAD' | 'QUALIFIED_LEAD' =
                /רכישה|purchase|order|הזמנה/i.test(text) ? 'PURCHASE'
                : /טופס|form/i.test(text) ? 'SUBMIT_LEAD_FORM'
                : /qualified|מוסמך/i.test(text) ? 'QUALIFIED_LEAD'
                : 'LEAD'

            const { listConversionActions, ensureConversionAction, reconcilePrimaryConversionActions } =
                await import('./mazhirConversions')

            // 1. Check existence — create missing desired action.
            const existing = await listConversionActions(operatingCustomerId, tokens, cfg.developerToken, loginCustomerId)
            stepResults.push({
                step: 'list conversion actions',
                ok: true,
                detail: `total=${existing.length}, primary=${existing.filter(a => a.primaryForGoal).length}, by_category=${[...new Set(existing.map(a => a.category))].join(',')}`,
            })
            const hasDesired = existing.some(a => a.category === desiredCategory)
            if (!hasDesired) {
                const actionKey = desiredCategory === 'PURCHASE' ? 'purchase'
                    : desiredCategory === 'SUBMIT_LEAD_FORM' ? 'form_submit'
                    : desiredCategory === 'QUALIFIED_LEAD' ? 'qualified_lead'
                    : 'generate_lead'
                const created = await ensureConversionAction(operatingCustomerId, tokens, cfg.developerToken, {
                    actionKey,
                    name: `${desiredCategory} (ClawFlow auto-created)`,
                    // Placeholder; actual transaction value is sent via gtag
                    // (alwaysUseDefaultValue=false in ensureConversionAction)
                    // so this only fires if the page tag forgets the value.
                    defaultValueIls: 1,
                }, loginCustomerId)
                stepResults.push({
                    step: `Create ${desiredCategory} conversion action`,
                    ok: true,
                    detail: `${created.status}: ${created.resourceName}`,
                })
            }

            // 2. Reconcile — promote desired, demote everything else currently primary.
            const report = await reconcilePrimaryConversionActions(
                operatingCustomerId, tokens, cfg.developerToken, desiredCategory, loginCustomerId,
            )
            stepResults.push({
                step: `Reconcile primary → ${desiredCategory}`,
                ok: report.failed.length === 0,
                detail: `promoted ${report.promoted.length}, demoted ${report.demoted.length}, unchanged ${report.unchanged.length}, failed ${report.failed.length}`,
            })
            if (report.demoted.length > 0) {
                stepResults.push({
                    step: 'Demoted to secondary',
                    ok: true,
                    detail: report.demoted.map(d => `${d.name} (${d.category})`).join('; ').slice(0, 500),
                })
            }
            // Phase 2026.02 Block 6: pivot to GA4 Admin for read-only failures
            // that ARE GA4-imported. Plus a separate hand-off for
            // WEBPAGE_CODELESS (Google's codeless conversion actions — created
            // via Ads UI, intentionally non-mutable via API per Google's
            // architecture; manual UI edit is the only path).
            let ga4Demoted = 0
            const ga4Failures: Array<{ name: string; reason: string }> = []
            const codelessAction: Array<{ name: string; resourceName: string; category: string }> = []
            const otherReadOnly: Array<{ name: string; category: string; type: string; error: string }> = []

            if (report.failed.length > 0) {
                // Bucket failures by handling strategy.
                const ga4Eligible = report.failed.filter(f =>
                    !f.intendedPrimary && f.ga4EventName && f.ga4PropertyId,
                )
                for (const f of report.failed) {
                    if (ga4Eligible.includes(f)) continue
                    if (f.type === 'WEBPAGE_CODELESS') {
                        codelessAction.push({ name: f.name, resourceName: f.resourceName, category: f.category })
                    } else {
                        otherReadOnly.push({ name: f.name, category: f.category, type: f.type, error: f.error })
                    }
                }

                // GA4 pivot — un-mark Key Event when action is GA4-imported.
                if (ga4Eligible.length > 0) {
                    try {
                        const { findKeyEventByEventName, deleteKeyEvent } = await import('./ga4Admin')
                        for (const f of ga4Eligible) {
                            try {
                                const ke = await findKeyEventByEventName(tokens, f.ga4PropertyId!, f.ga4EventName!)
                                if (!ke) {
                                    ga4Failures.push({ name: f.name, reason: `GA4 event_name="${f.ga4EventName}" not found as Key Event on property ${f.ga4PropertyId}` })
                                    continue
                                }
                                await deleteKeyEvent(tokens, ke.name)
                                ga4Demoted++
                            } catch (e) {
                                const msg = (e as Error).message
                                ga4Failures.push({ name: f.name, reason: msg.slice(0, 200) })
                            }
                        }
                        stepResults.push({
                            step: 'GA4 Key Event un-mark (read-only fallback)',
                            ok: ga4Demoted > 0,
                            detail: `${ga4Demoted}/${ga4Eligible.length} GA4 events un-marked as Key Event` +
                                    (ga4Failures.length > 0 ? `; failures: ${ga4Failures.map(x => `${x.name}: ${x.reason}`).join('; ').slice(0, 400)}` : ''),
                        })
                    } catch (e) {
                        const msg = (e as Error).message
                        const isScope = /insufficient|forbidden|403|scope/i.test(msg)
                        stepResults.push({
                            step: 'GA4 Key Event un-mark (read-only fallback)',
                            ok: false,
                            detail: isScope
                                ? 'OAuth scope analytics.edit missing — reconnect Google with full permissions in Integrations.'
                                : msg.slice(0, 400),
                        })
                    }
                }

                // WEBPAGE_CODELESS — known Google architectural limit. Surface
                // clear Hebrew instructions with deep link to that specific
                // action in Google Ads UI.
                if (codelessAction.length > 0) {
                    const baseCid = operatingCustomerId.replace(/-/g, '')
                    const instructions = codelessAction.map(a => {
                        const actionId = a.resourceName.split('/').pop() || ''
                        const deepLink = `https://ads.google.com/aw/conversions/customers/${baseCid}/detail?ocid=&conversionTypeId=${actionId}`
                        return `• ${a.name} (${a.category})\n  📌 Google Ads UI: ${deepLink}\n  פעולה: לחצו על הפעולה → ערכו → סמנו 'Secondary action' → שמרו`
                    }).join('\n\n')
                    stepResults.push({
                        step: 'Codeless conversion actions — manual UI step required (Google architectural limit)',
                        ok: false,
                        detail: `${codelessAction.length} action(s) of type WEBPAGE_CODELESS cannot be mutated via API by Google's design. Manual edit needed:\n\n${instructions}`,
                    })
                }

                if (otherReadOnly.length > 0) {
                    stepResults.push({
                        step: 'Other read-only actions — manual review',
                        ok: false,
                        detail: otherReadOnly.map(f => `${f.name} (${f.category}, type=${f.type}): ${f.error}`).join('\n').slice(0, 800),
                    })
                }
            }

            // Phase 2026.02 Block 6: idempotent success semantics.
            // The task is "ok" when:
            //   (a) we made progress this run (promoted/demoted/ga4Demoted > 0), OR
            //   (b) nothing needed to change (all 16 already unchanged AND only
            //       failures are known architectural limits — codeless actions
            //       requiring manual UI step), OR
            //   (c) progress was made AND only remaining failures are codeless.
            const totalApplied = report.promoted.length + report.demoted.length + ga4Demoted
            const onlyCodelessRemains = otherReadOnly.length === 0 && ga4Failures.length === 0
            const alreadyDone = totalApplied === 0
                && report.unchanged.length > 0
                && onlyCodelessRemains
                && codelessAction.length === report.failed.length
            const overallOk = totalApplied > 0 || alreadyDone

            const manualCount = codelessAction.length + otherReadOnly.length + ga4Failures.length
            let summary = `Marked ${desiredCategory} as primary; `
            if (totalApplied > 0) {
                summary += `demoted ${report.demoted.length} in Google Ads`
                if (ga4Demoted > 0) summary += ` + ${ga4Demoted} GA4 Key Events un-marked`
            } else if (alreadyDone) {
                summary += `all ${report.unchanged.length} actions already in target state`
            }
            if (manualCount > 0) {
                summary += ` (${manualCount} need manual UI step — Google API limit on codeless actions)`
            }
            summary += '.'

            return {
                ok: overallOk,
                outputDescription: summary,
                stepResults,
            }
        }

        if (wantsConv) {
            const { setupConversionActionsForInstance } = await import('./mazhirConversions')
            const result = await setupConversionActionsForInstance(instanceId)
            stepResults.push({
                step: 'הקמת ConversionActions',
                ok: true,
                detail: `${result.mapped?.length || 0} mapped, ${result.created?.length || 0} created`,
            })
        }
        // Phase 2026.02 Block 6: sGTM (server-side GTM container) — DIFFERENT
        // from client-side autoSetupGtmContainer. Requires Docker container on
        // Cloud Run or a Hetzner VPS subdomain — neither is wired yet. Surface
        // manual brief with Hebrew instructions + GCP/VPS deep links.
        // GA4 → BigQuery export — Pattern F manual brief until Pattern H
        // (expanded OAuth scopes for cloudbilling/serviceusage/iam) ships.
        if (wantsGa4BigQuery) {
            stepResults.push({
                step: 'GA4 → BigQuery export — manual setup (auto via expanded OAuth scopes planned)',
                ok: false,
                detail: 'יצוא יומי של GA4 ל-BigQuery דורש GCP project + billing + הרשאות IAM.\n' +
                    'שלבים:\n' +
                    '1. Google Cloud Console → New Project (אם אין) → Enable billing (חיוב)\n' +
                    '2. APIs & Services → Enable: BigQuery API, Analytics Data API\n' +
                    '3. IAM → הוסיפו serviceAccount firebase-measurement@system.gserviceaccount.com\n' +
                    '   עם role BigQuery Data Editor + BigQuery Job User\n' +
                    '4. GA4 Admin → Property settings → BigQuery Links → Link a project\n' +
                    '5. בחרו את ה-Project ID שיצרתם, מיקום: EU (לישראל)\n' +
                    '6. Frequency: Daily (לא Streaming אם לא נדרש real-time)\n' +
                    '7. Include: All events\n\n' +
                    'אוטומציה מלאה (אנחנו מבצעים את הכול במקומכם) דורשת הרחבת הרשאות OAuth — תיכלל בעדכון הבא.',
            })
            return {
                ok: true,
                awaitingManual: true,
                outputDescription: 'GA4 BigQuery export — manual setup required. Click "✓ ביצעתי ידנית" when done.',
                stepResults,
            }
        }

        if (wantsSgtm) {
            // Pattern G hybrid auto-deploy. We provision DNS + Docker + nginx
            // + certbot on the client VPS automatically. The one step Google
            // does NOT expose via API is CONTAINER_CONFIG generation (security
            // — it's a credential token). User pastes it once via the
            // "Configure sGTM" form in the popup (Pattern F UX).
            try {
                const { provisionSgtm } = await import('./sgtmProvisioner')
                const sgtm = await provisionSgtm(instanceId, agent?.id || null)
                stepResults.push({
                    step: 'sGTM infrastructure auto-provisioned',
                    ok: true,
                    detail: `URL: ${sgtm.sgtmUrl}\n` +
                        `DNS: ${sgtm.dnsCreated ? '✓ Cloudflare A record created' : '⚠ DNS create failed (manual fallback)'}\n` +
                        `Docker: ${sgtm.placeholderActive ? '✓ container running (placeholder config)' : '⚠ docker compose up failed (manual fallback)'}\n` +
                        `Nginx: ${sgtm.nginxConfigured ? '✓ vhost configured + reloaded' : '✗ failed'}\n` +
                        `SSL: ${sgtm.certbotQueued ? '⏳ certbot queued (async — runs after DNS propagates ~2-5 min)' : '✗ certbot skipped'}`,
                })
                stepResults.push({
                    step: 'User action required — CONTAINER_CONFIG paste',
                    ok: false,
                    detail: `הקמת sGTM כמעט הושלמה. נשאר שלב אחד שלא ניתן לבצע אוטומטית כי Google לא חושפת את ה-CONTAINER_CONFIG דרך ה-API:\n\n` +
                        `1. פתחו GTM: https://tagmanager.google.com\n` +
                        `2. בחרו את ה-Container שלכם (web)\n` +
                        `3. Admin → Container Settings → Tagging Server (gear icon)\n` +
                        `4. Manually provision tagging server\n` +
                        `5. Tagging server URL: ${sgtm.sgtmUrl}\n` +
                        `6. העתיקו את ה-Container configuration string שמופיע\n` +
                        `7. הדביקו אותו בטופס "הגדרת sGTM" שייפתח בפופאפ של המשימה הזאת\n` +
                        `8. הקליקו "שמרו" — אנחנו נעדכן את ה-Docker אוטומטית ונאמת ש-/healthy מחזיר 200\n\n` +
                        `הערה: שלב 7 דורש OAuth UI — Google שמרה אותו לאבטחה. כל השאר בוצע אוטומטית.`,
                })
                return {
                    ok: true,
                    awaitingManual: true,
                    outputDescription: `sGTM auto-provisioned at ${sgtm.sgtmUrl}. Awaiting CONTAINER_CONFIG paste.`,
                    stepResults,
                }
            } catch (e) {
                stepResults.push({
                    step: 'sGTM auto-provisioning failed',
                    ok: false,
                    detail: `Could not auto-provision sGTM infrastructure: ${(e as Error).message.slice(0, 500)}\n\nFall back to manual setup — open Google Cloud Console → Cloud Run → deploy ${'gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable'} manually.`,
                })
                return {
                    ok: true,
                    awaitingManual: true,
                    outputDescription: 'sGTM auto-provision failed — manual setup required.',
                    stepResults,
                }
            }
        }

        if (wantsGtm) {
            const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
            // Phase 2026.02 Block 6: agent-scoped read. Multi-agent VPS stores
            // mazhirGtm.target per-agent in mateh_agents.research_data, not in
            // legacy instances.research_data.
            const { readResearchData } = await import('./agentContext')
            const rd: any = (agent
                ? (await readResearchData(agent, instanceId))
                : (inst as any)?.researchData) || {}
            // Phase 2026.02 Block 6: auto-discover GTM target if not picked.
            let target = rd.mazhirGtm?.target
            const tokens = (agent as any)?.googleTokens || (inst as any)?.googleTokens
            if (!target) {
                if (!tokens?.refreshToken) {
                    stepResults.push({ step: 'GTM auto-discover', ok: false, detail: 'No Google OAuth tokens — reconnect Google in Integrations' })
                    return { ok: false, outputDescription: 'GTM tokens missing', error: 'no GTM tokens', stepResults }
                }
                try {
                    const { listGtmTargets, saveGtmTarget } = await import('./mazhirGtmSetup')
                    const candidates = await listGtmTargets(tokens)
                    if (candidates.length === 0) {
                        stepResults.push({ step: 'GTM auto-discover', ok: false, detail: 'No GTM containers found in this Google account — create one at tagmanager.google.com first' })
                        return { ok: false, outputDescription: 'no GTM containers', error: 'no containers in account', stepResults }
                    } else if (candidates.length === 1) {
                        target = candidates[0]
                        stepResults.push({
                            step: 'GTM auto-discover',
                            ok: true,
                            detail: `auto-picked single available container: ${target.name} (${target.publicId})`,
                        })
                        // Persist on owner agent so subsequent runs skip discovery.
                        if (agent) {
                            await saveGtmTarget(instanceId, target, agent.id || null)
                        }
                    } else {
                        // Multiple containers — let user pick. Surface list.
                        stepResults.push({
                            step: 'GTM auto-discover',
                            ok: false,
                            detail: `${candidates.length} GTM containers found — manual pick required:\n` +
                                candidates.map(c => `• ${c.name} (${c.publicId}, accountId=${c.accountId})`).join('\n') +
                                `\n\nOpen dashboard → Integrations → GTM → Pick container.`,
                        })
                        return {
                            ok: false,
                            outputDescription: `${candidates.length} GTM containers — user must pick`,
                            error: 'multiple containers — user pick required',
                            stepResults,
                        }
                    }
                } catch (e) {
                    const msg = (e as Error).message
                    stepResults.push({ step: 'GTM auto-discover', ok: false, detail: `Discovery failed: ${msg.slice(0, 300)}` })
                    return { ok: false, outputDescription: 'GTM discovery failed', error: msg, stepResults }
                }
            }
            const { autoSetupGtmContainer, saveGtmSetupResult } = await import('./mazhirGtmSetup')
            const gtmResult = await autoSetupGtmContainer(tokens, {
                target,
                measurementId: target.measurementId,
                conversions: rd.mazhirConversions?.gtmConfigs || [],
                enhancedConversions: true,
            })
            await saveGtmSetupResult(instanceId, gtmResult, agent?.id || null)
            // Detailed publish report — surface EXACTLY which fixtures were
            // created vs preserved. Sergei's principle: "trust → verify →
            // preserve". User must SEE what we touched.
            const createdSummary = gtmResult.created.length === 0
                ? 'nothing new — fully idempotent re-run'
                : gtmResult.created.map(c => `${c.type}: "${c.name}"`).join('; ')
            const skippedSummary = gtmResult.skipped.length === 0
                ? 'none'
                : gtmResult.skipped.map(s => `${s.type}: "${s.name}" (${s.reason})`).join('; ')
            stepResults.push({
                step: 'GTM auto-setup',
                ok: gtmResult.published,
                detail: gtmResult.published
                    ? `published version=${gtmResult.versionId || '(no-op)'}\n` +
                      `  Created (${gtmResult.created.length}): ${createdSummary.slice(0, 500)}\n` +
                      `  Preserved/Skipped (${gtmResult.skipped.length}): ${skippedSummary.slice(0, 700)}`
                    : `errors: ${gtmResult.errors.map(e => e.error).join('; ')}`,
            })

            // POST-PUBLISH VALIDATION — read live workspace state and verify
            // expected fixtures are present + enabled. Surface per-fixture
            // pass/fail. This is the "validate at end" pattern Sergei flagged
            // as critical: don't trust the publish response, actually check.
            try {
                const { validateGtmFixtures } = await import('./mazhirGtmSetup')
                const verify = await validateGtmFixtures(tokens, target, {
                    expectConversionLinker: true,
                    expectGclidCapture: true,
                    expectGaawe: !!target.measurementId,
                    expectEnhancedConversions: true,
                    expectConsentMode: true,
                })
                const okCount = verify.fixtures.filter(f => f.present).length
                const totalCount = verify.fixtures.length
                stepResults.push({
                    step: 'GTM live-state validation',
                    ok: okCount === totalCount,
                    detail: `${okCount}/${totalCount} expected fixtures verified in published live container.\n` +
                        verify.fixtures.map(f => `  ${f.present ? '✓' : '✗'} ${f.label}${f.foundName ? ` ("${f.foundName}")` : ''}${f.notes ? ` — ${f.notes}` : ''}`).join('\n'),
                })
            } catch (e) {
                // Non-fatal — validation failure shouldn't undo a successful publish.
                stepResults.push({
                    step: 'GTM live-state validation',
                    ok: false,
                    detail: `Validation read failed (publish itself succeeded): ${(e as Error).message.slice(0, 300)}`,
                })
            }
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