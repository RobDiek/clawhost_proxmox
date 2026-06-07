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
                  | 'blocked_by_deps'
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
            // K32: surface "blocked by deps" to UI explicitly. agent_outputs
            // status flips to 'blocked_by_deps' (instead of staying 'approved'
            // silently — that was confusing user), with a list of unmet deps
            // in the content payload so the queue can render which to do first.
            const unmetTitles = unmet.map(depId => {
                const d = plan.tasks.find(t => t.id === depId)
                return d ? `${depId} — "${(d.title || '').slice(0, 60)}"` : depId
            })
            await mutateResearchData(agent, instanceId, (rd2: any) => {
                const plan2: MonthlyMarketingPlan = rd2.monthlyPlan
                if (plan2 && plan2.tasks[taskIdx]) {
                    // Reset to 'approved' so user can re-approve after deps done,
                    // and re-fire will skip dep check + run executor body.
                    plan2.tasks[taskIdx].status = 'approved'
                    ;(plan2.tasks[taskIdx] as any).errorCategory = 'blocked_by_deps'
                    ;(plan2.tasks[taskIdx] as any).blockedByTaskIds = unmet
                }
                return rd2
            })
            if (task.executionOutputId) {
                try {
                    // K32: keep agent_outputs.status='pending_review' so task
                    // stays in the default ממתינים לאישור filter. Surface
                    // "blocked by deps" via metadata + content only — UI badge
                    // reads metadata.blockedByTaskIds. After deps complete,
                    // user re-approves and executor proceeds normally.
                    const [existing] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, task.executionOutputId))
                    const existingMeta: any = existing?.metadata || {}
                    await db.update(agentOutputs).set({
                        status: 'pending_review',
                        metadata: { ...existingMeta, blockedByTaskIds: unmet, blockedAt: new Date().toISOString() } as any,
                        content: JSON.stringify({
                            outputDescription: `חסומה — ${unmet.length} תלויות לא הושלמו`,
                            blockedByTaskIds: unmet,
                            unmetTitles,
                            note_he: `המשימה לא תרוץ עד שתשלימו: ${unmetTitles.join(' · ')}`,
                        }, null, 2),
                    }).where(eq(agentOutputs.id, task.executionOutputId))
                } catch (err) {
                    console.warn('[monthlyTaskExecutor] failed to update output for blocked_by_deps:', (err as Error).message)
                }
            }
            return {
                ok: false,
                outputDescription: `Blocked by ${unmet.length} unmet dependency: ${unmet.join(', ')}`,
                error: `unmet dependencies: ${unmet.join(', ')}`,
                errorCategory: 'blocked_by_deps' as any,
            }
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
        // Cross-type detection: "write/optimize meta descriptions for existing
        // pages" tasks arrive from Opus as website_change / other (channel seo /
        // website), so the type switch alone would route them to the manual
        // brief. Detect by intent + route to the real WordPress batch adapter —
        // same pattern as switch_bid_strategy detection inside runGoogleAdsAdapter.
        // Landing-page first — task.type==='landing_page' is the strongest signal
        // and its brief may mention schema/links keywords that would otherwise
        // mis-route to an SEO batch.
        // A2 — run EVERY matching on-site auto-capability for this task, then
        // aggregate. Composite tasks ("refresh page" = content + schema + links)
        // get all their sub-ops executed, not just the first match. External
        // outreach (link recovery / PR / 3rd-party directory) can NEVER be auto —
        // short-circuit to the manual brief even if a loose matcher would grab it.
        // Order matters: page_refresh/landing change content BEFORE schema/links.
        const A2_ADAPTERS: Array<{ id: string; match: (t: MonthlyTask) => boolean; run: () => Promise<ExecutorResult> }> = [
            { id: 'page_refresh', match: isPageRefreshTask, run: () => runPageRefreshAdapter(instanceId, task, plan, agent) },
            { id: 'landing_page', match: isLandingPageTask, run: () => runLandingPageAdapter(instanceId, task, plan, agent) },
            { id: 'site_widget', match: isSiteWidgetTask, run: () => runSiteWidgetAdapter(instanceId, task, plan, agent) },
            { id: 'seo.meta', match: isSeoMetaBatchTask, run: () => runSeoMetaBatchAdapter(instanceId, task, plan, agent) },
            { id: 'seo.product_schema', match: isProductSchemaTask, run: () => runProductSchemaAdapter(instanceId, task, plan, agent) },
            { id: 'seo.schema', match: isSeoSchemaTask, run: () => runSeoSchemaBatchAdapter(instanceId, task, plan, agent) },
            { id: 'seo.internal_links', match: isInternalLinksTask, run: () => runInternalLinksAdapter(instanceId, task, plan, agent) },
            { id: 'seo.slug', match: isSlugProposeTask, run: () => runSlugProposeAdapter(instanceId, task, plan, agent) },
            { id: 'seo.image_alt', match: isImageAltTask, run: () => runImageAltAdapter(instanceId, task, plan, agent) },
            { id: 'aeo.llms_txt', match: isLlmsTxtTask, run: () => runLlmsTxtAdapter(instanceId, task, plan, agent) },
            { id: 'aeo.answer_first', match: isAnswerFirstTask, run: () => runAnswerFirstAdapter(instanceId, task, plan, agent) },
            { id: 'aeo.citation_monitor', match: isAeoCitationMonitorTask, run: () => runAeoCitationMonitorAdapter(instanceId, task, plan, agent) },
        ]
        const matched = isExternalOutreachTask(task) ? [] : A2_ADAPTERS.filter(a => { try { return a.match(task) } catch { return false } })
        if (matched.length === 1) {
            result = await matched[0].run()
        } else if (matched.length > 1) {
            const subs: Array<{ id: string; r: ExecutorResult }> = []
            for (const a of matched) {
                try { subs.push({ id: a.id, r: await a.run() }) }
                catch (e) { subs.push({ id: a.id, r: { ok: false, outputDescription: '', error: (e as Error).message } }) }
            }
            result = aggregateA2Results(subs)
        } else if (isAdsAnalysisTask(task)) {
            result = await runAdsAnalysisAdapter(instanceId, task, plan, agent)
        } else if (isSitePerfTask(task)) {
            result = await runSitePerfAdapter(instanceId, task, plan, agent)
        } else {
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
    const noRetryCategories = new Set(['integration_missing', 'not_implemented', 'systemic_bug', 'blocked_by_deps'])
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
    const allOk = true

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
                // Extract the list of negatives from title / summary / actionPlan / change.what
                const negs = _extractNegativesFromTask(task, mpOpt)
                if (negs.length === 0) {
                    // Couldn't auto-parse the list → this is NOT a systemic bug; ship
                    // a manual brief so the user adds them from the task text. (Pre-fix
                    // this fell through to ok:false/no-category → mis-classified as
                    // systemic_bug + a false Telegram OWNER alert.)
                    return runManualTodoAdapter(instanceId, task, _plan,
                        'לא הצלחנו לחלץ את רשימת השליליים אוטומטית — הוסיפו אותם ידנית מתוך תיאור המשימה ל-campaign שליליים ב-Google Ads.',
                        { stepResults: [...stepResults, { step: 'parse negatives', ok: false, detail: 'no negatives extracted — manual brief' }] })
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
            case 'switch_bid_strategy': {
                // K34: real Google Ads API switch via applyBiddingStrategy service.
                // Pre-K34 this fell through to runManualTodoAdapter and returned
                // ok:true with stepResults=['Manual TODO brief produced'] — looks
                // completed in UI but nothing actually mutated in Ads. Now we
                // call the real mutation path that already exists (and is used
                // by the explicit "apply strategy" UI endpoint).
                //
                // Strategy choice: default 'moderate' (tCPA target). Hard cap
                // on automated decisions — anything that PAUSES PMax (aggressive)
                // or DROPS budget >15% must go through the explicit UI chooser,
                // not auto-execute. So the executor branch only ever runs
                // conservative or moderate.
                const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig, mutateResearchData } =
                    await import('./agentContext')
                const taskAgent = (task as any).agentId
                    ? (await resolveAgentById(instanceId, (task as any).agentId)) || (await resolvePrimaryAgent(instanceId))
                    : await resolvePrimaryAgent(instanceId)
                if (!taskAgent) {
                    return {
                        ok: false, outputDescription: '', error: 'agent missing',
                        errorCategory: 'systemic_bug', stepResults,
                    }
                }
                const tokens = (taskAgent as any).googleTokens
                if (!tokens?.refreshToken) {
                    return {
                        ok: false,
                        outputDescription: 'Google Ads OAuth tokens missing — user must reconnect Google',
                        error: 'No Google refresh token on agent',
                        errorCategory: 'integration_missing',
                        userAction: {
                            title_he: 'Google Ads לא מחובר — נדרשת התחברות מחדש',
                            cta_he: 'התחברו ל-Google →',
                            action_path: '#integrations/google',
                            integrationKey: 'google_ads',
                        },
                        stepResults,
                    }
                }
                const ads = (await readGoogleAdsConfig(taskAgent, instanceId)).config as any
                if (!ads?.customerId || !ads?.developerToken) {
                    return {
                        ok: false,
                        outputDescription: 'Google Ads not connected (customerId / developerToken missing)',
                        error: 'Google Ads config incomplete',
                        errorCategory: 'integration_missing',
                        userAction: {
                            title_he: 'Google Ads לא מחובר במלואו',
                            cta_he: 'השלימו הגדרת Google Ads →',
                            action_path: '#integrations/google_ads',
                            integrationKey: 'google_ads',
                        },
                        stepResults,
                    }
                }
                const operatingCustomerId = String(ads.scope?.operatingCustomerId || ads.customerId || '').replace(/\D/g, '')
                const loginCustomerId = String(ads.loginCustomerId || ads.customerId || '').replace(/\D/g, '')
                const scopedCampaignIds: string[] = Array.isArray(ads.scope?.campaignIds) ? ads.scope.campaignIds.map(String) : []
                if (scopedCampaignIds.length === 0) {
                    // Without scope we'd touch every campaign — refuse and surface as
                    // awaiting_user_action so user opens the scope picker first.
                    return runManualTodoAdapter(instanceId, task, _plan,
                        'חסר scope קמפיינים ב-Google Ads — פתחו את ההגדרות וסמנו אילו קמפיינים בקובץ ה-scope לפני שחרור Smart Bidding.',
                        { stepResults: [...stepResults, { step: 'scope check', ok: false, detail: 'ads.scope.campaignIds empty — refusing to mutate every campaign' }] })
                }

                // Read target CPA from task text (Hebrew "₪80" / "tcpa target 80" / "80 שקל"),
                // fallback to service default ₪70.
                const fullText = (task.title + ' ' + task.summary + ' ' + (task.actionPlan || []).map(s => s.step).join(' '))
                const cpaMatch = fullText.match(/(?:tcpa|cpa|יעד|target)[^\d]{0,15}(\d{2,4})|(\d{2,4})\s*(?:₪|שקל|nis|ils)/i)
                const targetCpaIls = cpaMatch ? Number(cpaMatch[1] || cpaMatch[2]) : 70

                stepResults.push({ step: 'preflight checks', ok: true, detail: `customer=${operatingCustomerId}, scope=${scopedCampaignIds.length} campaigns, target_cpa=₪${targetCpaIls}` })

                // K34 policy: executor only runs DRY-RUN. Real mutation is a
                // second, explicit step — user clicks "Apply strategy" in the
                // UI dashboard which calls POST /instances/:id/safety/
                // apply-bidding-strategy with dryRun=false. This matches the
                // no-automatic-actions invariant for money-affecting Ads changes.
                const { applyBiddingStrategy: apply } = await import('./googleAdsBiddingStrategy')
                const preview = await apply({
                    customerId: operatingCustomerId,
                    loginCustomerId,
                    tokens: { refreshToken: tokens.refreshToken },
                    developerToken: String(ads.developerToken),
                    scopedCampaignIds,
                    strategy: 'moderate',
                    moderateTargetCpaIls: targetCpaIls,
                    dryRun: true,
                })

                stepResults.push({
                    step: 'preview moderate bidding strategy (dry-run)',
                    ok: preview.errors.length === 0,
                    detail: preview.summary,
                })
                for (const a of preview.actionsApplied.slice(0, 8)) {
                    stepResults.push({ step: `would change → ${a.campaignName}`, ok: true, detail: a.change })
                }
                for (const e of preview.errors.slice(0, 5)) {
                    stepResults.push({ step: `✗ ${e.campaignId}`, ok: false, detail: e.error })
                }

                // Render structured preview table for dashboard (Hebrew-plural address)
                const previewTable = preview.previousState.map(snap => {
                    const planned = preview.actionsApplied.filter(a => a.campaignId === snap.campaignId).map(a => a.change).join(' · ')
                    return `• ${snap.campaignName} (${snap.channel}, ${snap.status})\n   נוכחי: ${snap.bidding}, תקציב ₪${(snap.budgetMicros / 1_000_000).toFixed(0)}/יום\n   מתוכנן: ${planned || 'ללא שינוי'}`
                }).join('\n\n')
                const briefHe = [
                    `**תצוגה מקדימה — שחרור Smart Bidding (moderate, tCPA ₪${targetCpaIls})**`,
                    '',
                    `Customer: \`${operatingCustomerId}\` · ${scopedCampaignIds.length} קמפיינים ב-scope`,
                    '',
                    previewTable,
                    '',
                    `סיכום: ${preview.summary}`,
                    '',
                    '⚠ *זוהי תצוגה בלבד — לא בוצעו שינויים בפועל.*',
                    'אם אתם בטוחים — לחצו על "החל אסטרטגיית הצעות" בלשונית בטיחות Google Ads.',
                    'ה-snapshot של previousState נשמר כדי לאפשר undo מלא אחרי הביצוע.',
                ].join('\n')

                return {
                    ok: preview.errors.length === 0,
                    outputDescription: briefHe,
                    awaitingManual: true,
                    error: preview.errors.length > 0 ? `${preview.errors.length} preview errors` : undefined,
                    errorCategory: preview.errors.length === 0 ? 'awaiting_user_action' : 'systemic_bug',
                    userAction: preview.errors.length === 0 ? {
                        title_he: 'תצוגה מקדימה מוכנה — לחצו "החל אסטרטגיה"',
                        cta_he: 'פתחו בטיחות Google Ads →',
                        action_path: '#safety/bidding-strategies',
                    } : undefined,
                    stepResults,
                }
            }
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
    const negs: string[] = []
    // Pull the comma list that follows the FIRST colon in a string. Opus phrases
    // these as "...שליליים של מתחרים: storage station, get moving, home center".
    const harvestAfterColon = (s: string) => {
        const after = String(s || '').split(/:\s*/).slice(1).join(': ')   // everything past the first colon
        if (!after) return
        const parts = after.split(/[,،;|]/).map(p => p.trim()).filter(p => p.length > 1 && p.length < 40)
        negs.push(...parts)
    }
    // Richest → weakest source. TITLE is where the list usually lives (the prior
    // code missed it, so competitor/intent/housing negative tasks parsed 0 and
    // failed). Then mediaPlan change.what, summary, then actionPlan steps.
    harvestAfterColon(task.title || '')
    harvestAfterColon(mpOpt?.changes?.[0]?.what || '')
    if (negs.length === 0) harvestAfterColon(task.summary || '')
    if (negs.length === 0) {
        for (const s of (task.actionPlan || [])) {
            const m = s.step.match(/הוסיפ?ו?\s+([^.]+)/)
            if (m) {
                const parts = m[1].split(/[,،;|]/).map(p => p.trim()).filter(p => p.length > 1 && p.length < 40)
                negs.push(...parts)
            }
        }
    }
    // Dedupe + clean. Drop pure-numeric tokens (e.g. the "12"/"18" count prefix)
    // and any token that's clearly not a search term (contains 'שליליים').
    return Array.from(new Set(
        negs.map(n => n.replace(/^["'`]|["'`]$/g, '').trim())
            .filter(n => n.length > 1 && !/^[\d.,]+$/.test(n) && !/שליליים|negative/i.test(n)),
    ))
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
    // K32-fix2: relax type constraint — Opus generates "primary reconcile" tasks
    // as both measurement_gap (validation) AND tracking_setup (mark/promote)
    // depending on context. The behavior is identical so both should route here.
    // K33: bind to channel='google_ads' — Enhanced Conversions / Consent Mode
    // are channel='gtm' tasks whose actionPlan ALSO mentions ראשית (purchase
    // primary as a verification dependency), causing wantsPrimaryReconcile to
    // hijack them. Channel is the source of truth for which API stack runs.
    const wantsPrimaryReconcile = task.channel === 'google_ads'
        && (task.type === 'measurement_gap' || task.type === 'tracking_setup')
        && /ראשית|primary[\s-]*(for[\s-]*goal|conversion|action)|מסומן|סימון.{0,40}(רכישה|primary)/i.test(text)
    // "Review/audit conversion-action settings BEFORE bid changes"
    // (tsk_cr_validation_audit archetype). NOT a reconcile (no "primary" mark) —
    // it's a health GATE that must run + pass before money-affecting bidding
    // changes unblock. Pre-fix it had no adapter path → 0 steps → not_implemented
    // (silent skip) → blocked the entire tROAS chain (#4/#5/#27). Now wires the
    // real conversionSetupAudit (GA4 firing baseline + contamination isolation).
    const wantsConversionAudit = !wantsPrimaryReconcile
        && task.channel === 'google_ads'
        && (task.type === 'measurement_gap' || task.type === 'tracking_setup')
        && /סקירת|ביקורת|בדיקת|\baudit\b|\breview\b|לפני\s+כל\s+שינוי|לפני.*(שינוי|הצע)|הגדרות.*המרה|conversion\s*(action|setting)/i.test(text)

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

    // ─── Conversion-setup audit gate (tsk_cr_validation_audit) ─────────────
    // Runs the real GA4-firing + contamination audit. Clean → completed (which
    // UNBLOCKS the dependent bidding tasks). Critical findings / unverifiable
    // (transient / no OAuth) → awaiting_user_action so bidding stays blocked
    // until the measurement is proven sound (never change bids on a broken setup).
    if (wantsConversionAudit) {
        try {
            const { auditAgentConversionSetup } = await import('./conversionSetupAudit')
            const audit = await auditAgentConversionSetup(agent as never)
            const steps = audit.findings.map(f => ({ step: `${f.severity}: ${f.code}`, ok: f.severity !== 'critical', detail: f.he }))
            const critical = audit.findings.filter(f => f.severity === 'critical')
            const cannotVerify = audit.transient || audit.findings.some(f => f.code === 'no_oauth')
            if (critical.length || cannotVerify) {
                const headline = critical.length
                    ? `ביקורת הגדרות ההמרה מצאה ${critical.length} בעיות קריטיות — תקנו אותן לפני שינוי הצעות מחיר.`
                    : audit.transient
                        ? 'לא ניתן היה לאמת את הגדרות ההמרה כרגע (תקלה זמנית בקריאת GA4) — הריצו שוב.'
                        : 'לא ניתן לאמת את הגדרות ההמרה — חברו את חשבון Google ל-GA4/Ads.'
                return {
                    ok: false,
                    outputDescription: headline + (audit.findings.length ? '\n' + audit.findings.map(f => `• ${f.he}`).join('\n') : ''),
                    awaitingManual: true,
                    errorCategory: 'awaiting_user_action',
                    stepResults: steps.length ? steps : [{ step: 'ביקורת המרות', ok: false, detail: headline }],
                }
            }
            return {
                ok: true,
                outputDescription: 'ביקורת הגדרות ההמרה: לא נמצאו בעיות חוסמות — המדידה תקינה, אפשר להמשיך לשינויי הצעות מחיר.',
                errorCategory: 'completed',
                stepResults: steps.length ? steps : [{ step: 'ביקורת המרות', ok: true, detail: 'לא נמצאו בעיות חוסמות' }],
            }
        } catch (err) {
            return { ok: false, outputDescription: `ביקורת ההמרות נכשלה: ${(err as Error).message}`, error: (err as Error).message, errorCategory: 'systemic_bug' }
        }
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
                    name: `${desiredCategory} (Flowmatic auto-created)`,
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

            // 2a. SHARED-ACCOUNT SAFETY GATE. reconcilePrimaryConversionActions is
            // account-wide (no brand filter): on a shared MCC operating account it
            // would re-promote THIS tenant's secondary purchase actions to
            // account-level primary, contaminating sibling brands' bidding (the
            // reverse of campaignGoalIsolation). When other brands share the account,
            // the "purchase = primary" intent is governed by this tenant's
            // CAMPAIGN-level custom goal, not account flags. So: ensure that goal is
            // correct (re-sync) and SKIP the account-wide reconcile. Only run the
            // reconcile when we CONFIRM the account is single-brand (no siblings).
            const { ensureCampaignGoalIsolation } = await import('./campaignGoalIsolation')
            const iso = await ensureCampaignGoalIsolation(agent as never, { source: 'primary_reconcile' })
            if (iso.reason !== 'no_contamination') {
                stepResults.push({ step: 'חשבון Ads משותף — בדיקת בטיחות', ok: true, detail: iso.siblingNames.length ? `מותגים נוספים בחשבון: ${iso.siblingNames.join(', ')}` : `סטטוס בידוד: ${iso.status}/${iso.reason}` })
                stepResults.push({ step: 'מטרת המרה מבודדת ברמת קמפיין', ok: true, detail: `${iso.status}/${iso.reason}${iso.resyncedGoals?.length ? ` · עודכנו ${iso.resyncedGoals.length} מטרות` : ''} — דילוג על reconcile ברמת החשבון` })
                return {
                    ok: true,
                    outputDescription: 'הרכישה מוגדרת כיעד ההמרה הראשי דרך מטרת קמפיין ייעודית (החשבון משותף עם מותגים נוספים). לא בוצע reconcile ברמת החשבון — כך שהאופטימיזציה של המותגים האחרים לא נפגעת, והקמפיינים שלכם מתאמנים רק על פעולת הרכישה שלכם.',
                    errorCategory: 'completed',
                    stepResults,
                }
            }

            // 2b. Single-brand account → account-wide reconcile is safe.
            // Reconcile — promote desired, demote everything else currently primary.
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
        // K34 follow-on: channels that don't map to any tracking-API adapter
        // (seo / cross / website / email / whatsapp / gbp / content) used to
        // fall off the end with stepResults=[] — K31 then flagged
        // not_implemented + Telegram OWNER alert + finalStatus=failed.
        // That's the right systemic detection ONLY when there IS a missing
        // adapter. For inherently-manual channels (SEO audits, sitemap
        // monitoring, brand defense briefs) the correct path is a manual
        // brief — Opus mis-types them as measurement_gap but the work is
        // pure human-in-the-loop content/process. Fall through to the
        // manual-todo brief instead of failing them.
        if (stepResults.length === 0) {
            const trackingApiChannels = new Set(['ga4', 'meta', 'google_ads', 'gtm'])
            if (!trackingApiChannels.has(task.channel)) {
                return runManualTodoAdapter(instanceId, task, _plan,
                    `מעקב/ביקורת ידנית (channel=${task.channel}) — בצעו לפי ה-brief למטה ולחצו "✓ ביצעתי ידנית" בסיום.`,
                    { stepResults: [{ step: `route channel=${task.channel} → manual brief`, ok: true, detail: 'no tracking-API adapter for this channel — surfaced as manual todo' }] })
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
// Adapter: seo_meta_batch — batch-write meta descriptions to existing WP pages
// ════════════════════════════════════════════════════════════════════════

/**
 * Detect a "write/optimize meta descriptions for existing pages" task. These
 * come from Opus as type=website_change|other (channel seo/website/content),
 * so the type switch would otherwise route them to the manual brief. Requires
 * an explicit meta-description mention AND a bulk/existing-pages signal to
 * avoid hijacking single new-article content tasks.
 */
// External / third-party outreach we can NEVER auto-execute (editing someone
// else's site): link recovery from named publishers, PR pitches, directory /
// price-comparison listings, partnership registrations. READ-only monitoring/
// analysis is NOT external. Used to short-circuit A2 to a manual brief so a
// loose on-site matcher never auto-attempts off-site work.
export function isExternalOutreachTask(task: MonthlyTask): boolean {
    if (/מעקב|ניטור|ניתוח|סקירה/i.test(task.title || '')) return false
    const text = `${task.title} ${task.summary}`
    return /שחזור קישור|יחסי ציבור|יח"?צ\b|פיץ'|פנייה ל.{0,4}אתרים|הרחבת פרופיל הקישורים|פוסט אורח|guest post|רישום ב-?\s*(zap|b144|זאפ|ספרי|מדריך|אינדקס|השוואת)|השוואת מחירים|שיתוף פעולה עם|התאחדות/i.test(text)
}

// Aggregate multiple A2 sub-adapter results into one task result.
function aggregateA2Results(subs: Array<{ id: string; r: ExecutorResult }>): ExecutorResult {
    const okCount = subs.filter(s => s.r.ok).length
    const steps = subs.flatMap(s => [
        { step: `▸ ${s.id}`, ok: s.r.ok, detail: (s.r.outputDescription || s.r.error || '').slice(0, 300) },
        ...((s.r.stepResults || []) as Array<{ step: string; ok: boolean; detail?: string }>),
    ])
    const lines = subs.map(s => `${s.r.ok ? '✓' : '✗'} ${s.id}: ${(s.r.outputDescription || s.r.error || '').slice(0, 200)}`)
    const anyIntegration = subs.some(s => s.r.errorCategory === 'integration_missing')
    let errorCategory: ExecutorResult['errorCategory'] = 'completed'
    if (okCount === 0) errorCategory = anyIntegration ? 'integration_missing' : 'systemic_bug'
    const userAction = subs.find(s => s.r.userAction)?.r.userAction
    return {
        ok: okCount > 0,
        outputDescription: `בוצעו ${okCount}/${subs.length} פעולות אוטומטיות במשימה:\n${lines.join('\n')}`,
        errorCategory,
        stepResults: steps,
        ...(userAction ? { userAction } : {}),
    }
}

// Refresh / expand / deepen EXISTING pages (not new-article creation). Routes to
// the page-refresh adapter so "רענון 17 דפים", "הרחבת 35 דפים תוכן דק",
// "רענון דף עוגן 325→1,200" actually update live pages instead of a manual brief.
export function isPageRefreshTask(task: MonthlyTask): boolean {
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const refresh = /רענון|רענ(נ|ו)|הרחב(ת|ו|ה)?\s*\d|תוכן דק|דפים קיימ|העמק|עדכון תוכן קיים|\d{2,4}\s*→\s*[\d,]{3,5}|מ-?\s*\d{2,4}\s*ל-?\s*[\d,]{3,5}\s*מילים/i.test(text)
    if (!refresh) return false
    const channelOk = task.channel === 'seo' || task.channel === 'content' || task.channel === 'website'
    const isNew = /מאמר חדש|כתבו מאמר|צרו מאמר|דף נושא|דף נחיתה|דף השוואה|דפי ערים|דף עיר|מאמר דף/i.test(text)
    return channelOk && !isNew
}

async function runPageRefreshAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runPageRefresh, parseTargetWords } = await import('./seoPageRefresh')
    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback downstream */ }
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const targetWords = parseTargetWords(text)
    const res = await runPageRefresh(instanceId, { agentId: agent?.id, businessName, targetWords })

    if (res.integrationMissing) {
        return {
            ok: false,
            outputDescription: 'WordPress לא מחובר — לא ניתן לרענן דפים קיימים אוטומטית.',
            error: 'wordpress integration missing',
            errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.error && res.updated.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    const stepResults = [
        { step: 'סריקת דפים', ok: true, detail: `${res.scanned} נסרקו · ${res.candidates} מועמדים לרענון · יעד ${res.targetWords} מילים` },
        ...res.updated.map(u => ({ step: `עודכן: ${u.title}`, ok: true, detail: `${u.beforeWords}→${u.afterWords} מילים · ${u.link}` })),
        ...res.failures.map(f => ({ step: `נכשל: ${f.type} #${f.id}`, ok: false, detail: f.error })),
    ]
    if (res.candidates === 0) {
        return { ok: true, outputDescription: `כל הדפים שנסרקו כבר מעל סף התוכן — אין מה לרענן.`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.authError && res.updated.length === 0) {
        return {
            ok: false,
            outputDescription: `נמצאו ${res.candidates} דפים לרענון אך החיבור ל-WordPress נדחה (401/403) — סיסמת היישום פגה/בוטלה או למשתמש אין הרשאות עריכה. חברו מחדש עם משתמש מנהל.`,
            error: 'wordpress write rejected (401/403)',
            errorCategory: 'integration_missing',
            userAction: { title_he: 'חיבור WordPress נדחה — נדרש חיבור מחדש', cta_he: 'חברו מחדש את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
            stepResults,
        }
    }
    return { ok: res.ok, outputDescription: `רועננו ${res.updated.length} דפים — העמקת תוכן + כותרות H2 בפורמט שאלה + מקטע שאלות נפוצות.`, stepResults }
}

// Floating WhatsApp/call button OR exit-intent popup on the site. NOT WhatsApp
// Business API automation (that needs a WA channel integration — stays manual).
export function isSiteWidgetTask(task: MonthlyTask): boolean {
    // Match on TITLE (+summary) only — the task's PURPOSE. Action steps of many
    // unrelated tasks mention a CTA button / WhatsApp / popup incidentally, which
    // caused heavy false-positives (calculator, comparison page, email nurture…).
    const text = `${task.title || ''} ${task.summary || ''}`
    const buttons = /כפתור\s*(whatsapp|וואטסאפ|חיוג)|click.?to.?call|floating\s*(whatsapp|button)|וואטסאפ צף|כפתור צף/i.test(text)
    const popup = /חלון יציאה|exit.?intent|פופ.?אפ|pop.?up/i.test(text)
    // exclude WhatsApp Business API automation (greeting/qualifying flows)
    const waBusiness = /whatsapp business|אוטומציה ב.?whatsapp|הודעת קבלת פנים|שאלות סינון/i.test(text)
    if (waBusiness && !buttons && !popup) return false
    return buttons || popup
}

async function runSiteWidgetAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runSiteWidget } = await import('./seoSiteWidget')
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mode: 'buttons' | 'popup' = /חלון יציאה|exit.?intent|פופ.?אפ|pop.?up/i.test(text) ? 'popup' : 'buttons'
    const res = await runSiteWidget(instanceId, { agentId: agent?.id, mode, taskText: text })

    if (res.needsPhone) {
        return { ok: false, outputDescription: 'כדי להוסיף כפתור צף צריך מספר טלפון/וואטסאפ של העסק. הוסיפו אותו בפרטי העסק ונפעיל אוטומטית.', error: 'no business phone', errorCategory: 'awaiting_user_action', awaitingManual: true }
    }
    if (res.integrationMissing) {
        return {
            ok: false,
            outputDescription: res.error || 'נדרש חיבור אתר (WordPress עם companion v1.11.0+ או GitHub) כדי להוסיף את הווידג\'ט.',
            error: 'site integration missing', errorCategory: 'integration_missing',
            userAction: { title_he: 'נדרש חיבור אתר', cta_he: 'חברו את האתר →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (!res.ok) {
        return { ok: false, outputDescription: `לא ניתן היה להוסיף את הווידג'ט: ${res.error || 'שגיאה לא ידועה'}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    const what = mode === 'popup' ? 'חלון יציאה (exit-intent)' : 'כפתורי WhatsApp/חיוג צפים'
    const wherePr = res.platform === 'github' && res.prUrl ? ` · PR: ${res.prUrl}` : ''
    return {
        ok: true,
        outputDescription: `הותקן ${what} ב${res.platform === 'github' ? 'אתר GitHub' : 'אתר וורדפרס'}${wherePr}.`,
        stepResults: [{ step: 'הוספת ווידג\'ט', ok: true, detail: `mode=${mode} · ${res.applied.join(', ')}` }],
    }
}

// Ads spend / keyword-overlap analysis → proposal (read-only).
export function isAdsAnalysisTask(task: MonthlyTask): boolean {
    const text = `${task.title} ${task.summary}`
    return /חפיפת מילות מפתח|ניתוח.{0,15}(ממומן|מילות מפתח|מונחי חיפוש)|keyword overlap|הסטת תקציב|בזבוז.{0,10}תקציב/i.test(text)
}
async function runAdsAnalysisAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null): Promise<ExecutorResult> {
    void task
    const { runAdsAnalysis } = await import('./adsKeywordOverlap')
    const r = await runAdsAnalysis(instanceId, { agentId: agent?.id })
    if (r.error === 'google_ads_not_connected') return { ok: false, outputDescription: 'Google Ads לא מחובר — לא ניתן לנתח מונחי חיפוש.', error: r.error, errorCategory: 'integration_missing', userAction: { title_he: 'חברו Google Ads', cta_he: 'חברו →', action_path: '/dashboard#integrations', integrationKey: 'google_ads' } }
    if (!r.ok) return { ok: false, outputDescription: `שגיאה בניתוח Ads: ${r.error}`, error: r.error, errorCategory: 'systemic_bug' }
    return { ok: true, outputDescription: r.proposalHe, stepResults: [{ step: 'ניתוח מונחי חיפוש', ok: true, detail: `${r.analyzedTerms} מונחים · ${r.wasteful} בזבזניים · ~₪${r.wastedSpend}` }] }
}

// Core Web Vitals / site performance → PageSpeed analysis + proposal (read-only).
export function isSitePerfTask(task: MonthlyTask): boolean {
    const text = `${task.title} ${task.summary}`
    return /core web vitals|חוויית משתמש בליבה|מהירות (אתר|טעינה)|\bLCP\b|\bCLS\b|\bINP\b|page ?speed|הסרת iframes?/i.test(text)
}
async function runSitePerfAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null): Promise<ExecutorResult> {
    void task
    const { runSitePerf } = await import('./sitePerf')
    const r = await runSitePerf(instanceId, { agentId: agent?.id })
    if (!r.ok) {
        const e = String(r.error || '')
        // PageSpeed Insights daily quota / rate limit = transient infra limit, NOT
        // a code bug. Surface as retryable (awaiting) so it doesn't fire the
        // systemic_bug Telegram OWNER alert on a quota hiccup.
        if (/\b429\b|quota exceeded|rate limit|userratelimit|resource has been exhausted/i.test(e)) {
            return { ok: false, outputDescription: 'ניתוח הביצועים נדחה זמנית — מכסת PageSpeed היומית מוצתה. המשימה תרוץ שוב מאוחר יותר.', error: r.error, errorCategory: 'awaiting_user_action', awaitingManual: true }
        }
        return { ok: false, outputDescription: `לא ניתן היה לנתח ביצועים: ${r.error}`, error: r.error, errorCategory: e === 'no site URL' ? 'integration_missing' : 'systemic_bug' }
    }
    return { ok: true, outputDescription: r.proposalHe, stepResults: [{ step: 'PageSpeed', ok: true, detail: r.url || '' }, ...r.cwv.map(c => ({ step: c.metric, ok: c.rating === 'טוב', detail: `${c.value} (${c.rating})` }))] }
}

/**
 * Detect a RECURRING AI-citation MONITORING task ("מעקב ציטוט שבועי במנועי AI ·
 * N prompts × M engines"). This is a measurement owned by the AEO/SEO tracking
 * engine (seoTrackingRunner llmResponses/llmMentions + monthly report card), NOT
 * a one-off schema/llms write. Pre-fix it fell into seo.schema+aeo.llms_txt and
 * falsely reported "completed" without doing the monitoring. Excluded from those
 * matchers so ONLY this adapter handles it.
 */
export function isAeoCitationMonitorTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    const text = `${task.title || ''} ${task.summary || ''}`
    const isMonitor = /מעקב.*ציטוט|ציטוט(?:ים)?.*(שבועי|חודשי|מנוע)|citation.*(monitor|track|weekly|monthly|share)|\d+\s*prompts?\s*[×x]\s*\d|prompts?\s*[×x]\s*\d+\s*(מנוע|engine)/i.test(text)
    if (!isMonitor) return false
    // measurement intent (not "add AEO answer/schema for AI")
    return task.type === 'measurement_gap' || /מעקב|monitor|track|measure|מדידה|דו"?ח|report/i.test(text)
}

async function runAeoCitationMonitorAdapter(instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null): Promise<ExecutorResult> {
    void task; void _plan
    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const { readSeoTracking } = await import('./seoTracking')
    const ag = agent?.id ? (await resolveAgentById(instanceId, agent.id)) || (await resolvePrimaryAgent(instanceId)) : await resolvePrimaryAgent(instanceId)
    const st = ag ? readSeoTracking(ag as never) : null
    const aeoActive = !!(st && st.status === 'active' && (st.config.llmResponses || st.config.llmMentions))
    if (aeoActive) {
        const engines = (st!.config.engines || []).join(', ') || 'מנועי AI'
        return {
            ok: true,
            outputDescription: `מעקב ציטוטים ב-AI מנוהל אוטומטית ע"י מנוע מעקב ה-AEO (${engines}) — סבב מתוזמן + כרטיס דוח חודשי. אין צורך במשימה חד-פעמית; צפו בתוצאות בכרטיס הדוח.`,
            errorCategory: 'completed',
            stepResults: [{ step: 'מנוע מעקב AEO', ok: true, detail: `פעיל · ${engines}` }],
        }
    }
    return {
        ok: false,
        outputDescription: 'מעקב ציטוטים ב-AI מתבצע דרך מנוע מעקב ה-AEO (לא משימת סכמה חד-פעמית). הפעילו llmResponses/llmMentions בלוח מעקב ה-SEO כדי לקבל סבב שבועי/חודשי + כרטיס דוח.',
        awaitingManual: true,
        errorCategory: 'awaiting_user_action',
        userAction: { title_he: 'הפעילו מעקב ציטוטים (AEO)', cta_he: 'פתחו מעקב SEO →', action_path: '#seo-tracking' },
        stepResults: [{ step: 'מנוע מעקב AEO', ok: false, detail: 'llmResponses/llmMentions לא מופעלים לטננט' }],
    }
}

export function isSeoMetaBatchTask(task: MonthlyTask): boolean {
    // content_creation owns new-article generation (incl. its own meta) — never
    // hijack it even if an action step mentions a meta description.
    if (task.type === 'content_creation') return false
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentionsMeta = /meta\s*-?\s*desc|תיאור(?:י)?\s*מטא/i.test(text)
    if (!mentionsMeta) return false
    const bulkOrExisting = /קיימ|existing|כל ה|batch|bulk|עמודים|דפים|פוסטים|posts|pages|all pages/i.test(text)
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk && bulkOrExisting
}

/**
 * GitHub fallback for the SEO ops. When a tenant's site is a GitHub repo (not
 * WordPress), the WP adapters find no WP integration; this runs the equivalent
 * static-site retrofit (frontmatter/body + PR). Returns null when the tenant is
 * not GitHub-connected (caller then surfaces the normal integration_missing).
 */
async function runGithubSeoFallback(
    instanceId: string, op: 'meta' | 'schema' | 'links' | 'slug',
    task: MonthlyTask, plan: MonthlyMarketingPlan, agent: { id?: string } | null,
): Promise<ExecutorResult | null> {
    const { loadGithubConfig, runSeoGithubBatch } = await import('./seoGithubBatch')
    if (!(await loadGithubConfig(instanceId, agent?.id))) return null

    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback name */ }

    const res = await runSeoGithubBatch(instanceId, op, { agentId: agent?.id, businessName })
    const opHe: Record<string, string> = { meta: 'תיאורי מטא', schema: 'סכמת JSON-LD', links: 'קישורים פנימיים', slug: 'הצעות slug' }

    if (res.error && res.changed.length === 0 && res.proposals.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-GitHub: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }

    // slug = propose-only brief
    if (op === 'slug') {
        if (res.proposals.length === 0) {
            return { ok: true, outputDescription: `נסרקו ${res.scanned} קבצים ב-GitHub — אין כתובות לתעתק.`, errorCategory: 'completed_idempotent_noop' }
        }
        const brief = [`נמצאו ${res.proposals.length} קבצים עם שם בעברית/מקודד. הצעות slug לטיני ליישום ידני (שנו filename + frontmatter slug + הוסיפו redirect):`, '',
            ...res.proposals.map(p => `• ${p.path}\n    → ${p.suggestedSlug}`)].join('\n')
        return { ok: true, outputDescription: brief, awaitingManual: true, errorCategory: 'awaiting_user_action', stepResults: [{ step: `סריקת GitHub`, ok: true, detail: `${res.scanned} קבצים · ${res.candidates} דורשים תעתיק` }] }
    }

    const stepResults = [
        { step: 'סריקת GitHub', ok: true, detail: `${res.scanned} קבצים · ${res.candidates} מועמדים` },
        ...res.changed.map(c => ({ step: c.path, ok: true, detail: c.detail })),
        ...res.failures.map(f => ({ step: f.path, ok: false, detail: f.error })),
    ]
    if (res.candidates === 0 || (res.changed.length === 0 && res.failures.length === 0)) {
        return { ok: true, outputDescription: `כל ${res.scanned} הקבצים ב-GitHub כבר כוללים ${opHe[op]} — אין מה לעדכן.`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.changed.length === 0) {
        return runManualTodoAdapter(instanceId, task, plan, `לא ניתן היה לעדכן ${opHe[op]} ב-GitHub אוטומטית. בצעו ידנית.`, { stepResults })
    }
    return {
        ok: true,
        outputDescription: `נוצר Pull Request ב-GitHub עם ${opHe[op]} ל-${res.changed.length} קבצים${res.prUrl ? `:\n${res.prUrl}` : ''}\n\n⚠️ סקרו ומזגו את ה-PR כדי להחיל את השינויים.`,
        errorCategory: 'completed', stepResults,
    }
}

/**
 * Detect a "schema markup / structured data for existing pages" task. Same
 * guardrails as the meta detector — explicit schema mention + bulk/existing
 * signal, on a web channel, never content_creation.
 */
/**
 * Detect a WooCommerce PRODUCT-schema task (Product + Offer JSON-LD on product
 * pages). Routed to runProductSchema (real WC data), NOT seoSchemaBatch (which
 * only does posts/pages → Article/FAQ schema). isSeoSchemaTask excludes these.
 */
export function isProductSchemaTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    // STRICT + TITLE-ONLY: the task's INTENT is in its title. Only genuine
    // Product+Offer schema tasks ("הטמעת סכמת Product + Offer …"). Matching the
    // summary/actionPlan too falsely grabbed INP/categories/AggregateRating
    // tasks (their detail text mentions Product schema incidentally) and routed
    // them to the product-schema adapter (wrong output). Title is unambiguous.
    // Includes bare "Offer schema" / "סכמת Offer" — Offer JSON-LD is product/price
    // markup → belongs on WooCommerce products (product_schema), not posts/pages.
    const title = task.title || ''
    const isProductOfferSchema = /product\s*\+\s*offer|מוצר\s*\+\s*offer|\bproduct\s+schema\b|\boffer\s+schema\b|schema\.org\/product|סכמת\s*(?:product|מוצר|offer)\b/i.test(title)
    // AggregateRating / Review schema that targets PRODUCTS belongs here too:
    // runProductSchema adds aggregateRating ONLY when a product has real reviews
    // (rating_count>0) — honest, no fabrication. Pre-fix these fell to the
    // posts/pages schema batch, which enriched a few unrelated shop pages and
    // falsely reported "completed" without touching the products (hit on the
    // "AggregateRating + Review ל-48 דפי מוצר" task). Guard: must name products,
    // so Organization-level aggregateRating tasks (#28) stay on seo.schema.
    const isProductRatingSchema = /aggregate\s*rating|aggregaterating|\breview\b|דירוג|ביקור/i.test(title)
        && /מוצר|products?\b|דפי\s*מוצר|woo/i.test(title)
    if (!isProductOfferSchema && !isProductRatingSchema) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

export function isSeoSchemaTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    if (isProductSchemaTask(task)) return false   // product schema → dedicated adapter
    if (isAeoCitationMonitorTask(task)) return false   // citation monitoring → AEO tracking engine
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    // NOT JSON-LD-batch work even if the title says "schema/markup": technical
    // files (robots.txt / sitemap.xml / GSC submit), CRO trust widgets (trust
    // signals / above-the-fold / review carousel), and external directory
    // citations route to their own capability or to manual. Sending them to the
    // schema batch makes it scan posts/pages, find existing schema, and falsely
    // report "completed (nothing to add)" without doing the task's real intent.
    const notSchemaAdapter = /robots\.txt|sitemap\.xml|הגשה ל-?gsc|הגשת\s*citation|citation:|directory.*citation|אותות\s*אמון|trust\s*signal|מעל\s*הקפל|above[- ]the[- ]fold|קרוסל.*ביקור|review\s*carousel/i
    if (notSchemaAdapter.test(task.title || '')) return false
    // Broadened: schema/structured-data + brand-entity-for-AI + technical markup
    // (search box / breadcrumb) + Hebrew construct forms (סכמ covers סכמה/סכמת/סכמות).
    const mentionsSchema = /schema|structured\s*data|json-?ld|rich\s*results|search\s*action|sitelinks|סכמ|נתונים\s*מובנים|markup|תיוג\s*מובנה|ישות\s*מותג|brand\s*entity|knowledge\s*(panel|graph)/i.test(text)
    if (!mentionsSchema) return false
    const bulkOrExisting = /קיימ|existing|כל ה|batch|bulk|עמודים|דפים|פוסטים|posts|pages|all pages|אתר|ישות|entity|מנועי|search/i.test(text)
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk && bulkOrExisting
}

/**
 * Detect an "internal linking" task. Same guardrails as the other SEO
 * detectors — explicit interlinking mention on a web channel, not content_creation.
 */
export function isInternalLinksTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentions = /internal\s*link|inter-?link|silo|קישור(?:ים)?\s*פנימי|לינקים\s*פנימי|קישורי\s*פנים/i.test(text)
    if (!mentions) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

/**
 * Detect a "create a landing page" task (explicit type, or clear LP intent).
 */
export function isLandingPageTask(task: MonthlyTask): boolean {
    if (task.type === 'landing_page') return true
    const text = `${task.title} ${task.summary}`
    return /landing\s*page|דף\s*נחיתה|דף\s*מכירה/i.test(text) && (task.channel === 'seo' || task.channel === 'website' || task.channel === 'content')
}

async function runLandingPageAdapter(
    instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runLandingPage } = await import('./seoLandingPage')
    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback */ }
    const brief = [task.title, task.summary, '', ...(task.actionPlan || []).map(s => '• ' + s.step)].join('\n')
    const res = await runLandingPage(instanceId, brief, { agentId: agent?.id, businessName })

    if (res.integrationMissing) {
        return { ok: false, outputDescription: 'אין אתר מחובר (WordPress/GitHub) — לא ניתן ליצור דף נחיתה.', error: 'no site integration', errorCategory: 'integration_missing', userAction: { title_he: 'חברו אתר', cta_he: 'חברו אתר →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' } }
    }
    if (res.error || !res.ok) {
        return { ok: false, outputDescription: `יצירת דף נחיתה נכשלה: ${res.error || 'unknown'}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    // Draft created — user reviews + publishes. Treated as awaiting_user_action
    // (final publish is the human step), NOT a silent completed.
    return {
        ok: true,
        outputDescription: `נוצר דף נחיתה כטיוטה ל-${res.platform === 'github' ? 'GitHub (PR)' : 'WordPress'}: "${res.title}"\n${res.editUrl}\n\n⚠️ בדקו ופרסמו את הטיוטה.`,
        awaitingManual: true,
        errorCategory: 'awaiting_user_action',
        stepResults: [{ step: `דף נחיתה נוצר: ${res.title}`, ok: true, detail: res.editUrl }],
    }
}

/**
 * Detect an "answer-first / featured-snippet / TL;DR" AEO task.
 */
export function isAnswerFirstTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    if (isAeoCitationMonitorTask(task)) return false   // citation monitoring → AEO tracking engine
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentions = /answer[\s-]?first|featured\s*snippet|tl;?dr|תשובה\s*(קצרה|ישירה|ראשונה)|פסקת\s*תשובה|snippet\s*מוצג|תוכן\s*ל-?ai|answer\s*engine/i.test(text)
    if (!mentions) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

async function runAnswerFirstAdapter(
    instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runAnswerFirst } = await import('./seoAnswerFirst')
    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback */ }
    const res = await runAnswerFirst(instanceId, { agentId: agent?.id, businessName })

    if (res.integrationMissing) {
        return { ok: false, outputDescription: 'WordPress לא מחובר — לא ניתן להוסיף פסקת תשובה.', error: 'wordpress integration missing', errorCategory: 'integration_missing', userAction: { title_he: 'WordPress לא מחובר', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' } }
    }
    if (res.authError && res.updated.length === 0) {
        return { ok: false, outputDescription: 'החיבור ל-WordPress נדחה (401/403). חברו מחדש עם משתמש מנהל.', error: 'wp write rejected', errorCategory: 'integration_missing', userAction: { title_he: 'חיבור WordPress נדחה', cta_he: 'חברו מחדש →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' } }
    }
    if (res.error && res.updated.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    const stepResults = [
        { step: 'סריקת פוסטים', ok: true, detail: `${res.scanned} פוסטים` },
        ...res.updated.map(u => ({ step: `פסקת תשובה: ${u.title}`, ok: true, detail: u.answer })),
        ...res.failures.map(f => ({ step: `נכשל #${f.id}`, ok: false, detail: f.error })),
    ]
    if (res.updated.length === 0 && res.failures.length === 0) {
        return { ok: true, outputDescription: `כל הפוסטים שנסרקו כבר כוללים פסקת תשובה — אין מה להוסיף.`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.updated.length === 0) {
        return runManualTodoAdapter(instanceId, task, _plan, `לא ניתן היה להוסיף פסקאות תשובה אוטומטית. בצעו ידנית.`, { stepResults })
    }
    return { ok: true, outputDescription: `נוספה פסקת תשובה (AEO) ל-${res.updated.length} פוסטים ב-WordPress${res.failures.length ? ` (${res.failures.length} נכשלו)` : ''}.`, errorCategory: 'completed', stepResults }
}

/**
 * Detect an "llms.txt / AI-crawler / AEO file" task.
 */
export function isLlmsTxtTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    if (isAeoCitationMonitorTask(task)) return false   // citation monitoring → AEO tracking engine
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentions = /llms?\.?txt|llms-full|ai\s*crawler|מנועי\s*ai|קובץ\s*llms|llm\.txt/i.test(text)
    if (!mentions) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

async function runLlmsTxtAdapter(
    instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runLlmsTxt } = await import('./seoLlmsTxt')
    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback */ }
    const res = await runLlmsTxt(instanceId, { agentId: agent?.id, businessName })

    if (res.integrationMissing) {
        return { ok: false, outputDescription: 'אין אתר מחובר (WordPress/GitHub) — לא ניתן ליצור llms.txt.', error: 'no site integration', errorCategory: 'integration_missing', userAction: { title_he: 'חברו אתר (WordPress/GitHub)', cta_he: 'חברו אתר →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' } }
    }
    if (res.error) {
        if (/llms_route_missing/.test(res.error)) {
            return runManualTodoAdapter(instanceId, task, _plan, 'נדרש עדכון תוסף Flowmatic Companion ל-1.10.0+ כדי להגיש /llms.txt. עדכנו את התוסף ונסו שוב.', { stepResults: [{ step: 'llms.txt', ok: false, detail: res.error }] })
        }
        return { ok: false, outputDescription: `יצירת llms.txt נכשלה: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    return {
        ok: true,
        outputDescription: `נוצר llms.txt (${res.pages} עמודים, ${res.bytes} bytes) ל-${res.platform === 'github' ? 'GitHub (PR)' : 'WordPress'}:\n${res.servedAt}`,
        errorCategory: 'completed',
        stepResults: [{ step: `סריקת ${res.pages} עמודים`, ok: true }, { step: `llms.txt פורסם`, ok: true, detail: res.servedAt }],
    }
}

/**
 * Detect an "image alt-text / image SEO" task.
 */
export function isImageAltTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentions = /alt[\s-]?text|alt\s*attribute|image\s*seo|טקסט\s*חלופי|תיוג\s*תמונות|alt\s*לתמונות|תמונות.*alt|ביקורת\s*seo\s*תמונות/i.test(text)
    if (!mentions) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

async function runImageAltAdapter(
    instanceId: string, task: MonthlyTask, _plan: MonthlyMarketingPlan, agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runImageAltBatch } = await import('./seoImageAlt')
    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* fallback */ }
    const res = await runImageAltBatch(instanceId, { agentId: agent?.id, businessName })

    if (res.integrationMissing) {
        // image alt is WP-media-specific; GitHub static sites carry alt inline in
        // markdown — route those through the GitHub fallback's links/body path later.
        return {
            ok: false, outputDescription: 'WordPress לא מחובר — לא ניתן לעדכן טקסט חלופי לתמונות.',
            error: 'wordpress integration missing', errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.authError && res.updated.length === 0) {
        return { ok: false, outputDescription: 'החיבור ל-WordPress נדחה (401/403). חברו מחדש עם משתמש מנהל.', error: 'wp write rejected', errorCategory: 'integration_missing', userAction: { title_he: 'חיבור WordPress נדחה', cta_he: 'חברו מחדש →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' } }
    }
    if (res.error && res.updated.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    const stepResults = [
        { step: 'סריקת ספריית מדיה', ok: true, detail: `${res.scanned} תמונות · ${res.candidates} ללא alt` },
        ...res.updated.map(u => ({ step: `alt נוסף: ${u.filename}`, ok: true, detail: u.altText })),
        ...res.failures.map(f => ({ step: `נכשל #${f.id}`, ok: false, detail: f.error })),
    ]
    if (res.candidates === 0) {
        return { ok: true, outputDescription: `כל ${res.scanned} התמונות שנסרקו כבר כוללות טקסט חלופי — אין מה לעדכן.`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.updated.length === 0) {
        return runManualTodoAdapter(instanceId, task, _plan, `נמצאו ${res.candidates} תמונות ללא alt אך לא ניתן היה לכתוב דרך ה-API. בצעו ידנית.`, { stepResults })
    }
    return { ok: true, outputDescription: `נוסף טקסט חלופי ל-${res.updated.length} תמונות ב-WordPress${res.failures.length ? ` (${res.failures.length} נכשלו)` : ''}.`, errorCategory: 'completed', stepResults }
}

/**
 * Detect a "slug / URL transliteration / 301" task. Propose-only per policy.
 */
export function isSlugProposeTask(task: MonthlyTask): boolean {
    if (task.type === 'content_creation') return false
    const text = `${task.title} ${task.summary} ${(task.actionPlan || []).map(s => s.step).join(' ')}`
    const mentions = /slug|transliterat|permalink|url\s*structure|כתובת(?:ות)?\s*url|תעתיק|301|מבנה\s*כתובות|קישור\s*קבוע/i.test(text)
    if (!mentions) return false
    const channelOk = task.channel === 'seo' || task.channel === 'website' || task.channel === 'content'
    return channelOk
}

async function runSlugProposeAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { proposeSlugs } = await import('./seoSlugPropose')
    const res = await proposeSlugs(instanceId, { agentId: agent?.id })

    if (res.integrationMissing) {
        const gh = await runGithubSeoFallback(instanceId, 'slug', task, _plan, agent)
        if (gh) return gh
        return {
            ok: false, outputDescription: 'WordPress לא מחובר — לא ניתן להציע כתובות URL.',
            error: 'wordpress integration missing', errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.error && res.proposals.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }
    if (res.candidates === 0) {
        return { ok: true, outputDescription: `כל ${res.scanned} הכתובות שנסרקו כבר באנגלית/תקינות — אין מה לתעתק.`, errorCategory: 'completed_idempotent_noop', stepResults: [{ step: 'סריקת כתובות URL', ok: true, detail: `${res.scanned} נסרקו, 0 דורשות תעתיק` }] }
    }

    // Propose-only: produce a brief the user applies manually (slug change + 301).
    const lines = res.proposals.map(p =>
        `• "${p.title}"\n    כעת: ${p.oldUrl}\n    מוצע: ${p.newUrl}\n    301: ${p.oldUrl} → ${p.newUrl}`,
    ).join('\n')
    const brief = [
        `נמצאו ${res.candidates} כתובות URL בעברית/מקודדות. להלן הצעות תעתיק לטיני + הפניות 301 ליישום ידני (לא משנים URL של עמודים מדורגים אוטומטית):`,
        '',
        lines,
        '',
        '⚠️ שנו slug רק לעמודים שעדיין לא מדורגים/מקבלים תנועה. לכל שינוי — הקימו 301 מהכתובת הישנה לחדשה (Yoast Premium / Rank Math / תוסף Redirection) כדי לא לאבד דירוג.',
    ].join('\n')

    return {
        ok: true,
        outputDescription: brief,
        awaitingManual: true,
        errorCategory: 'awaiting_user_action',
        stepResults: [
            { step: 'סריקת כתובות URL', ok: true, detail: `${res.scanned} נסרקו · ${res.candidates} דורשות תעתיק` },
            { step: `הופקו ${res.proposals.length} הצעות slug + 301`, ok: true },
        ],
    }
}

async function runInternalLinksAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runInternalLinks } = await import('./seoInternalLinks')
    const res = await runInternalLinks(instanceId, { agentId: agent?.id })

    if (res.integrationMissing) {
        const gh = await runGithubSeoFallback(instanceId, 'links', task, _plan, agent)
        if (gh) return gh
        return {
            ok: false, outputDescription: 'WordPress לא מחובר — לא ניתן להוסיף קישורים פנימיים אוטומטית.',
            error: 'wordpress integration missing', errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.authError && res.updated.length === 0) {
        return {
            ok: false, outputDescription: `החיבור ל-WordPress נדחה (401/403). חברו מחדש עם משתמש מנהל.`,
            error: 'wordpress write rejected (401/403)', errorCategory: 'integration_missing',
            userAction: { title_he: 'חיבור WordPress נדחה — נדרש חיבור מחדש', cta_he: 'חברו מחדש את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.error && res.updated.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }

    const totalLinks = res.updated.reduce((n, u) => n + u.inserted.length, 0)
    const stepResults = [
        { step: 'סריקת WordPress', ok: true, detail: `${res.scanned} עמודים · ${res.candidates} פוסטים מועמדים` },
        ...res.updated.map(u => ({ step: `קישורים נוספו: ${u.title}`, ok: true, detail: u.inserted.map(i => `"${i.anchor}" → ${i.toUrl}`).join(' · ') })),
        ...res.failures.map(f => ({ step: `נכשל: #${f.id}`, ok: false, detail: f.error })),
    ]

    if (res.updated.length === 0 && res.failures.length === 0) {
        return { ok: true, outputDescription: `לא נמצאו הזדמנויות לקישור פנימי טבעי ב-${res.candidates} הפוסטים שנסרקו (אנקור טבעי לא נמצא בגוף הטקסט).`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.updated.length === 0) {
        return runManualTodoAdapter(instanceId, task, _plan, `לא ניתן היה להוסיף קישורים פנימיים אוטומטית (${res.failures.length} כשלים). בצעו ידנית לפי ה-brief.`, { stepResults })
    }
    return {
        ok: true,
        outputDescription: `נוספו ${totalLinks} קישורים פנימיים ל-${res.updated.length} פוסטים ב-WordPress${res.failures.length ? ` (${res.failures.length} נכשלו)` : ''}.`,
        errorCategory: 'completed', stepResults,
    }
}

async function runSeoSchemaBatchAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runSeoSchemaBatch } = await import('./seoSchemaBatch')
    let businessName: string | undefined
    let sameAs: string[] | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
        // sameAs for brand entity — pull any social/Wikidata URLs we already know.
        const candidates = [rd?.answers?.socialProfiles, rd?.answers?.socialLinks, rd?.brandBook?.sameAs, rd?.brand?.sameAs].flat()
        const urls = candidates.filter((u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
        if (urls.length) sameAs = Array.from(new Set(urls))
    } catch { /* tone fallback handled downstream */ }

    const res = await runSeoSchemaBatch(instanceId, { agentId: agent?.id, businessName, sameAs })

    if (res.integrationMissing) {
        const gh = await runGithubSeoFallback(instanceId, 'schema', task, _plan, agent)
        if (gh) return gh
        return {
            ok: false,
            outputDescription: 'WordPress לא מחובר — לא ניתן להוסיף סכמה אוטומטית.',
            error: 'wordpress integration missing',
            errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.authError && res.updated.length === 0) {
        return {
            ok: false,
            outputDescription: `נמצאו ${res.candidates} עמודים, אך החיבור ל-WordPress נדחה (401/403). חברו מחדש עם משתמש מנהל.`,
            error: 'wordpress write rejected (401/403)',
            errorCategory: 'integration_missing',
            userAction: { title_he: 'חיבור WordPress נדחה — נדרש חיבור מחדש', cta_he: 'חברו מחדש את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.error && res.updated.length === 0) {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`, error: res.error, errorCategory: 'systemic_bug' }
    }

    const newCount = res.updated.filter(u => u.reason === 'new').length
    const enrichCount = res.updated.filter(u => u.reason === 'enrich').length
    const stepResults = [
        { step: 'סריקת WordPress', ok: true, detail: `${res.scanned} עמודים נסרקו · ${res.candidates} להוספה/העשרה` },
        ...res.updated.map(u => ({ step: `${u.reason === 'enrich' ? 'סכמה הועשרה' : 'סכמה נוספה'}: ${u.title}`, ok: true, detail: u.types.join(', ') })),
        ...res.failures.map(f => ({ step: `נכשל: ${f.type} #${f.id}`, ok: false, detail: f.error })),
    ]

    if (res.candidates === 0) {
        return { ok: true, outputDescription: `כל ${res.scanned} העמודים שנסרקו כבר כוללים סכמה מלאה ועדכנית של Flowmatic — אין מה להוסיף.`, errorCategory: 'completed_idempotent_noop', stepResults }
    }
    if (res.updated.length === 0) {
        const notPersisted = res.failures.some(f => /schema_not_persisted/.test(f.error))
        const headline = notPersisted
            ? `נמצאו ${res.candidates} עמודים, אך WordPress לא שמר את הסכמה — נדרש עדכון תוסף Flowmatic Companion ל-1.9.0+. בצעו ידנית בינתיים.`
            : `נמצאו ${res.candidates} עמודים ללא סכמה, אך לא ניתן היה לכתוב דרך ה-API. בצעו ידנית לפי ה-brief.`
        return runManualTodoAdapter(instanceId, task, _plan, headline, { stepResults })
    }

    const lines = res.updated.map(u => `• ${u.title} — ${u.types.join(', ')}`).join('\n')
    const summary = enrichCount > 0
        ? `עודכנה סכמת JSON-LD ב-${res.updated.length} עמודים (${newCount} חדשים, ${enrichCount} הועשרו) ב-WordPress`
        : `נוספה סכמת JSON-LD ל-${res.updated.length} עמודים ב-WordPress`
    return {
        ok: true,
        outputDescription: `${summary}${res.failures.length ? ` (${res.failures.length} נכשלו)` : ''}:\n${lines}`,
        errorCategory: 'completed',
        stepResults,
    }
}

async function runProductSchemaAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runProductSchema } = await import('./seoProductSchema')
    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const ag = agent?.id ? (await resolveAgentById(instanceId, agent.id)) || (await resolvePrimaryAgent(instanceId)) : await resolvePrimaryAgent(instanceId)
    const res = await runProductSchema(ag as never, {})

    if (res.status === 'no_store') {
        return {
            ok: false,
            outputDescription: 'WordPress/WooCommerce לא מחובר — לא ניתן להוסיף סכמת מוצר.',
            error: 'wordpress integration missing', errorCategory: 'integration_missing',
            userAction: { title_he: 'WordPress לא מחובר — נדרשת התחברות', cta_he: 'חברו את WordPress →', action_path: '/dashboard#integrations', integrationKey: 'wordpress' },
        }
    }
    if (res.status === 'no_products') {
        return { ok: true, outputDescription: 'לא נמצאו מוצרים פעילים בחנות — אין מה לעדכן.', errorCategory: 'completed_idempotent_noop' }
    }
    if (res.status === 'error') {
        return { ok: false, outputDescription: `שגיאה בגישה ל-WooCommerce: ${res.reason}`, error: res.reason, errorCategory: 'systemic_bug' }
    }
    const stepResults = [
        { step: 'סריקת מוצרים', ok: true, detail: `${res.scanned} מוצרים · ${res.updated} עודכנו · ${res.skipped || 0} דולגו · ${res.failures || 0} נכשלו` },
        ...(res.samples || []).map(s => ({ step: `Product: ${s.name}`, ok: true, detail: `₪${s.price} · ${s.availability}${s.hasRating ? ' · דירוג אמיתי' : ''}` })),
        ...(res.errors || []).map(e => ({ step: 'הערה', ok: false, detail: e })),
    ]
    if ((res.updated || 0) === 0) {
        const headline = (res.skipped || 0) > 0
            ? `נמצאו ${res.scanned} מוצרים אך WordPress לא שמר את הסכמה — נדרש עדכון תוסף Flowmatic Companion ל-1.12.0+ (תמיכה ב-product). בצעו עדכון ידני בינתיים.`
            : 'לא ניתן היה לכתוב סכמת מוצר דרך ה-API.'
        return runManualTodoAdapter(instanceId, task, _plan, headline, { stepResults })
    }
    return {
        ok: true,
        outputDescription: `נוספה סכמת Product + Offer ל-${res.updated} עמודי מוצר — מנתוני WooCommerce אמיתיים (מחיר, זמינות, דירוג רק אם קיימות ביקורות).${res.failures ? ` (${res.failures} נכשלו)` : ''}`,
        errorCategory: 'completed', stepResults,
    }
}

async function runSeoMetaBatchAdapter(
    instanceId: string,
    task: MonthlyTask,
    _plan: MonthlyMarketingPlan,
    agent: { id?: string } | null,
): Promise<ExecutorResult> {
    const { runSeoMetaBatch } = await import('./seoMetaBatch')

    let businessName: string | undefined
    try {
        const { readResearchData } = await import('./agentContext')
        const rd: any = (await readResearchData(agent as any, instanceId)) || {}
        businessName = rd?.answers?.businessName
    } catch { /* tone fallback handled downstream */ }

    const res = await runSeoMetaBatch(instanceId, { agentId: agent?.id, businessName })

    if (res.integrationMissing) {
        const gh = await runGithubSeoFallback(instanceId, 'meta', task, _plan, agent)
        if (gh) return gh
        return {
            ok: false,
            outputDescription: 'WordPress לא מחובר — לא ניתן לעדכן תיאורי מטא אוטומטית.',
            error: 'wordpress integration missing',
            errorCategory: 'integration_missing',
            userAction: {
                title_he: 'WordPress לא מחובר — נדרשת התחברות',
                cta_he: 'חברו את WordPress →',
                action_path: '/dashboard#integrations',
                integrationKey: 'wordpress',
            },
        }
    }

    if (res.error && res.updated.length === 0) {
        return {
            ok: false,
            outputDescription: `שגיאה בגישה ל-WordPress: ${res.error}`,
            error: res.error,
            errorCategory: 'systemic_bug',
        }
    }

    const stepResults = [
        { step: 'סריקת WordPress', ok: true, detail: `${res.scanned} עמודים נסרקו · ${res.candidates} עם תיאור מטא חסר/חלש` },
        ...res.updated.map(u => ({ step: `עודכן: ${u.title}`, ok: true, detail: u.metaDescription })),
        ...res.failures.map(f => ({ step: `נכשל: ${f.type} #${f.id}`, ok: false, detail: f.error })),
    ]

    if (res.candidates === 0) {
        const msg = res.detectorAvailable
            ? `כל ${res.scanned} העמודים שנסרקו כבר כוללים תיאור מטא תקין — אין מה לעדכן.`
            : `נסרקו ${res.scanned} עמודים. לא זוהה תוסף SEO קריא (Yoast/Rank Math) דרך ה-API ולא נמצאו עמודים ללא תקציר — אין מה לעדכן אוטומטית.`
        return { ok: true, outputDescription: msg, errorCategory: 'completed_idempotent_noop', stepResults }
    }

    if (res.authError && res.updated.length === 0) {
        // Writes rejected 401/403 — WordPress connection can't edit content.
        return {
            ok: false,
            outputDescription: `נמצאו ${res.candidates} עמודים לעדכון, אך החיבור ל-WordPress נדחה (401/403) — סיסמת היישום (Application Password) פגה/בוטלה, למשתמש אין הרשאות עריכה, או השרת חוסם את כותרת ה-Authorization. חברו מחדש את WordPress עם משתמש מנהל.`,
            error: 'wordpress write rejected (401/403)',
            errorCategory: 'integration_missing',
            userAction: {
                title_he: 'חיבור WordPress נדחה — נדרש חיבור מחדש',
                cta_he: 'חברו מחדש את WordPress →',
                action_path: '/dashboard#integrations',
                integrationKey: 'wordpress',
            },
            stepResults,
        }
    }

    if (res.updated.length === 0) {
        // Had candidates but wrote nothing and no auth error. Distinguish the
        // "write accepted but silently dropped" case (companion plugin missing
        // the show_in_rest meta registration) from a generic write failure.
        const notPersisted = res.failures.some(f => /meta_not_persisted/.test(f.error))
        const headline = notPersisted
            ? `נמצאו ${res.candidates} עמודים לעדכון, אך WordPress קיבל את הכתיבה ולא שמר אותה — נדרש עדכון תוסף Flowmatic Companion ל-1.7.0+ (שמאפשר כתיבת תיאורי מטא דרך ה-API). בצעו ידנית בינתיים לפי ה-brief.`
            : `נמצאו ${res.candidates} עמודים עם תיאור מטא חסר/חלש, אך לא ניתן היה לכתוב דרך ה-API (ודאו ש-Yoast או Rank Math מותקנים ופעילים). בצעו ידנית לפי ה-brief.`
        return runManualTodoAdapter(instanceId, task, _plan, headline, { stepResults })
    }

    const lines = res.updated.map(u => `• ${u.title} — ${u.link}`).join('\n')
    return {
        ok: true,
        outputDescription: `עודכנו תיאורי מטא ל-${res.updated.length} עמודים ב-WordPress${res.failures.length ? ` (${res.failures.length} נכשלו)` : ''}:\n${lines}`,
        errorCategory: 'completed',
        stepResults,
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
    // K34: every manual-brief outcome is awaiting_manual, not completed.
    // Previously runManualTodoAdapter returned ok:true with no awaitingManual,
    // which K31's classifier mapped to errorCategory='completed' — making
    // tasks that surfaced a brief look like real mutations had happened.
    // The UI then offered no "✓ ביצעתי ידנית" button because status was
    // already 'completed'. The right shape: ok=true (we did our part —
    // produced the brief), awaitingManual=true (caller still has work to do).
    return {
        ok: true,
        outputDescription: brief,
        awaitingManual: true,
        errorCategory: 'awaiting_user_action',
        stepResults: [
            ...(carryStepResults?.stepResults || []),
            { step: 'Manual TODO brief produced', ok: true, detail: brief.length + ' chars' },
        ],
    }
}