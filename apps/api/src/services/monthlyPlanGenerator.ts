/**
 * Phase 4.3-N v8 — Monthly Marketing Plan: Multi-Pass Orchestrator.
 *
 * v7 (single-pass) consistently hit the 32K output cap, truncating senior-bar
 * coverage and link-strategy depth. v8 splits generation into 3 deterministic
 * passes:
 *   Pass 1 — monthlyPlanSkeleton:       single Opus call, ~10K out, 50-70 task placeholders
 *   Pass 2 — monthlyPlanDetailer:       parallel batched Opus calls, channel-grouped, full detail
 *   Pass 3 — monthlyPlanSeniorBarCheck: deterministic 15-rule coverage scan + targeted fills
 *
 * Each pass fits comfortably under 32K independently — token cap is structural,
 * not a tuning problem. Multi-pass also lets us guarantee senior-bar rule
 * coverage (Pass 3 is deterministic, not LLM-decided).
 *
 * Hard contracts (preserved from v7):
 *   - Every task.requiresApproval is implicitly true; executor reads
 *     task.status === 'approved' before any external-system mutation.
 *   - Every task has ≥1 source (guardrails fill missing with a flag).
 *   - Link budgets come from research_data.chosenScenario + cost_timeline_modeling
 *     VERBATIM. Never invented.
 *   - 2026 algorithm research is read at runtime; quarterly refresh expected.
 *
 * Wiring:
 *   - resolveActiveAgent → readResearchData / writeResearchData (dual-write)
 *   - per-task agent_outputs rows emitted with outputType='monthly_task'
 *   - overall plan agent_outputs row with outputType='monthly_marketing_plan'
 *   - orphan archive: prior-generation rows whose task IDs are not in new plan
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances, brandBooks, agentOutputs } from '@/db/schema'
import { sendApprovalQueueMessage } from '@/services/approvalQueueTelegram'
import { applyMonthlyPlanGuardrails } from './monthlyPlanGuardrails'
import { generateSkeleton } from './monthlyPlanSkeleton'
import { elaborateTasks } from './monthlyPlanDetailer'
import { ensureCoverage } from './monthlyPlanSeniorBarCheck'
import type {
    MonthlyMarketingPlan,
    MonthlyTask,
} from '@/controllers/hosting/agentSetup'

// ─── Shared types ─────────────────────────────────────────────────────────
// Exported so the per-pass modules (monthlyPlanSkeleton / Detailer /
// SeniorBarCheck) consume the same context shape. Owner is the orchestrator.
export interface PromptCtx {
    businessName: string
    websiteUrl: string
    businessDesc: string
    paidProfile: any
    audit: any
    mediaPlan: any
    strategy: any
    chosenScenarioKey: string | undefined
    chosenScenarioFull: any
    strategyOptionsAll: any
    paidAudit: any
    paidDataInventory: any
    internalSeoAudit: any
    linkAudit: any
    aeoVisibility: any
    validation: any
    opsBriefs: any
    latestOpsBrief: any
    marketingIntents: any
    integrationsState: any
    brandBookFull: any
    pastAgentOutputs: any[]
    agentIntegrations: any[]
    pastHypotheses: any[]
    creativePerformance: any[]
    creativeFatigueAlerts: any[]
    paidLearnings: any[]
    strategyLearnings: any[]
    costTimeline: any
    paidBudget: any
    clientBaseline: any
    paidCompetitorLandscape: any
    paidKeywordResearch: any
    seoKeywordResearch: any
    competitorLandscape: any
    audiencePersonas: any
    positioningResults: any
    contentPlan: any
    previousMonthlyPlan: MonthlyMarketingPlan | undefined
    tenantState: any
    seoResearch2026: string
    trigger: 'cron_monthly' | 'on_demand' | 'auto_refresh'
    // Phase 4.3-N v8: baseline-delta context for month-over-month performance narrative.
    // baselineHistory[monthKey] holds frozen baselines from prior months.
    // baselineDelta is the computed comparison (current vs most-recent prior).
    baselineHistory: any
    baselineDelta: any
    completedTaskOutcomes: any[]
}

// ─── 2026 SEO research loader (cached) ────────────────────────────────────
let _seoResearch2026Cache: { content: string; loadedAt: number } | null = null
const RESEARCH_CACHE_TTL_MS = 60 * 60 * 1000

function loadSeoResearch2026(): string {
    const now = Date.now()
    if (_seoResearch2026Cache && (now - _seoResearch2026Cache.loadedAt) < RESEARCH_CACHE_TTL_MS) {
        return _seoResearch2026Cache.content
    }
    const candidates: string[] = [
        process.env.SEO_RESEARCH_2026_PATH || '',
        '/opt/openclaw-hosting/research/seo_algorithm_2026.md',
        join(process.cwd(), 'research', 'seo_algorithm_2026.md'),
        join(process.cwd(), '..', '..', 'research', 'seo_algorithm_2026.md'),
        join(process.cwd(), '..', 'research', 'seo_algorithm_2026.md'),
    ].filter(Boolean)
    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                const content = readFileSync(p, 'utf-8')
                _seoResearch2026Cache = { content, loadedAt: now }
                console.log(`[monthlyPlanGenerator] loaded seo_algorithm_2026.md from ${p} (${content.length} chars)`)
                return content
            }
        } catch (e) {
            console.warn(`[monthlyPlanGenerator] candidate ${p} failed: ${(e as Error).message}`)
        }
    }
    console.warn('[monthlyPlanGenerator] seo_algorithm_2026.md not found — running without 2026 ground-truth context')
    _seoResearch2026Cache = { content: '', loadedAt: now }
    return ''
}

// ─── Build PromptCtx from instanceId ──────────────────────────────────────
async function buildPromptCtx(
    instanceId: string,
    trigger: PromptCtx['trigger'],
    agentId: string | null | undefined,    // Phase 4.3-N v8: optional — resolve specific secondary agent (multi-agent VPS support)
): Promise<{ ctx: PromptCtx; agent: any; rd: any; apiKey: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const apiKey = (inst as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Anthropic API key missing')

    // Phase 4.3-N v8: multi-agent topology. If agentId given, resolve THAT agent
    // (e.g. Packing Station). Otherwise fall back to primary (legacy single-agent).
    const { resolvePrimaryAgent, resolveAgentById, readResearchData } = await import('./agentContext')
    const agent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}

    const mediaPlan = rd.mediaPlan
    const audit = rd.mazhirAudit
    const strategy = rd.strategy
    const chosenScenarioRaw = rd.chosenScenario
    const chosenScenarioKey: string | undefined =
        typeof chosenScenarioRaw === 'string'
            ? chosenScenarioRaw
            : (chosenScenarioRaw && typeof chosenScenarioRaw === 'object')
                ? (chosenScenarioRaw as any).scenario
                : undefined
    const chosenScenarioFull = (typeof chosenScenarioRaw === 'object' && chosenScenarioRaw) ? chosenScenarioRaw : undefined
    const contentPlan = rd.contentPlan
    const paidProfile = rd.paidProfile
    const answers = rd.answers || {}
    const results = rd.results || {}
    const costTimeline = results.cost_timeline_modeling
    const paidBudget = results.paid_budget_scenarios
    const clientBaseline = results.client_account_baseline
    const paidCompetitorLandscape = results.paid_competitor_landscape
    const paidKeywordResearch = results.paid_keyword_research
    const paidAudit = results.paid_audit
    const paidDataInventory = results.paid_data_inventory
    const seoKeywordResearch = results.seo_keyword_research
    const competitorLandscape = results.competitor_landscape
    const audiencePersonas = results.audience_personas
    const positioningResults = results.positioning
    const internalSeoAudit = results.internal_seo_audit
    const linkAudit = results.link_audit
    const aeoVisibility = results.aeo_visibility
    const strategyOptionsAll = results.strategy_options
    const validation = results.validation
    const previousMonthlyPlan: MonthlyMarketingPlan | undefined = rd.monthlyPlan

    const opsBriefs = rd.opsBriefs
    const latestOpsBrief = rd.latestOpsBrief
    const marketingIntents = rd.marketingIntents
    const integrationsState = rd.integrationsState

    // Phase 4.3-N v8: baseline-delta computation for month-over-month narrative.
    const baselineHistory = rd.baselineHistory || {}
    const currentBaseline = clientBaseline
    const priorMonthKeys = Object.keys(baselineHistory).sort().reverse()
    const priorBaseline = priorMonthKeys.length > 0 ? baselineHistory[priorMonthKeys[0]] : null
    const baselineDelta = (currentBaseline && priorBaseline) ? computeBaselineDelta(priorBaseline, currentBaseline) : null

    // Phase 4.3-N v8: extract completed task outcomes from previous plan for next-month context.
    const completedTaskOutcomes: any[] = (previousMonthlyPlan?.tasks || [])
        .filter((t: any) => t.status === 'completed' || t.status === 'in_progress')
        .map((t: any) => ({
            id: t.id, title: t.title, type: t.type, channel: t.channel,
            completedAt: t.completedAt, completedMethod: t.completedMethod,
            executionOutcome: t.executionOutcome,   // populated by executor post-run
            actualImpact: t.actualImpact,           // optional — captured by future executors
            expectedImpact: t.expectedImpact,
        }))

    let brandBookFull: any = undefined
    let pastAgentOutputs: any[] = []
    let agentIntegrations: any[] = []
    let pastHypotheses: any[] = []
    let creativePerformance: any[] = []
    let creativeFatigueAlerts: any[] = []
    let paidLearnings: any[] = []
    let strategyLearnings: any[] = []
    try {
        // Phase 4.3-N v8: multi-agent — scope brand book to the resolved agent
        // (Storage Station vs Packing Station have distinct voice/USPs).
        const whereClause = agent?.id
            ? and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.agentId, agent.id))
            : eq(brandBooks.instanceId, instanceId)
        const [bb] = await db.select().from(brandBooks).where(whereClause)
        brandBookFull = bb
    } catch (e) { console.warn('[monthlyPlanGenerator] brandBook pull failed:', (e as Error).message) }

    try {
        const { agentOutputs: agentOutputsTbl, agentIntegrations: agentIntegrationsTbl,
            creativePerformance: creativePerformanceTbl, creativeFatigueAlerts: creativeFatigueTbl,
            hypotheses: hypothesesTbl, paidLearnings: paidLearningsTbl,
            strategyLearnings: strategyLearningsTbl,
        } = await import('@/db/schema') as any
        const { desc } = await import('drizzle-orm')
        pastAgentOutputs = await db.select().from(agentOutputsTbl)
            .where(eq(agentOutputsTbl.instanceId, instanceId))
            .orderBy(desc(agentOutputsTbl.createdAt))
            .limit(50)
        agentIntegrations = await db.select().from(agentIntegrationsTbl)
            .where(eq(agentIntegrationsTbl.instanceId, instanceId))
        if (creativePerformanceTbl) {
            creativePerformance = await db.select().from(creativePerformanceTbl)
                .where(eq(creativePerformanceTbl.instanceId, instanceId))
                .limit(30)
        }
        if (creativeFatigueTbl) {
            creativeFatigueAlerts = await db.select().from(creativeFatigueTbl)
                .where(eq(creativeFatigueTbl.instanceId, instanceId))
                .limit(20)
        }
        if (hypothesesTbl) {
            pastHypotheses = await db.select().from(hypothesesTbl)
                .where(eq(hypothesesTbl.instanceId, instanceId))
                .limit(30)
        }
        if (paidLearningsTbl) {
            paidLearnings = await db.select().from(paidLearningsTbl)
                .where(eq(paidLearningsTbl.instanceId, instanceId))
                .limit(30)
        }
        if (strategyLearningsTbl) {
            strategyLearnings = await db.select().from(strategyLearningsTbl)
                .where(eq(strategyLearningsTbl.instanceId, instanceId))
                .limit(30)
        }
    } catch (e) {
        console.warn('[monthlyPlanGenerator] historical-data pulls failed (non-fatal):', (e as Error).message)
    }
    console.log(`[monthlyPlanGenerator] ${instanceId} historical: outputs=${pastAgentOutputs.length} integrations=${agentIntegrations.length} hypotheses=${pastHypotheses.length} creativePerf=${creativePerformance.length} fatigue=${creativeFatigueAlerts.length} paidLearn=${paidLearnings.length} stratLearn=${strategyLearnings.length} opsBriefs=${(opsBriefs as any[])?.length || 0}`)

    // Phase 2026.02 Block 6: accept new-schema paidAudit (rd.results.paid_audit)
    // as alternative to legacy mazhirAudit. Path B-1 tenants only have the new
    // schema — legacy paidProfile/mazhirAudit are populated only via the Path A
    // openPaidProfileModal flow (pre-2026.02 onboarding).
    if (!paidProfile && !audit && !paidAudit) {
        throw new Error('Either paidProfile, mazhirAudit, or new-schema paid_audit (rd.results.paid_audit) required — run paid_data_inventory + paid_audit first')
    }
    if (!chosenScenarioKey) {
        throw new Error('research_data.chosenScenario not set or malformed — user must pick smart or aggressive in strategy_options first')
    }

    // Phase 4.3-N v8: agent-scoped brand book for businessName resolution.
    const brandWhere = agent?.id
        ? and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.agentId, agent.id))
        : eq(brandBooks.instanceId, instanceId)
    const [brand] = await db.select().from(brandBooks).where(brandWhere)
    const businessName = (brand as any)?.businessName || answers.businessName || 'unknown'
    const websiteUrl = answers.websiteUrl || ''
    const businessDesc = answers.businessDescription || ''

    let tenantState: any = null
    try {
        const { classifyTenantSetupState } = await import('./tenantSetupState')
        tenantState = await classifyTenantSetupState(instanceId)
    } catch (e) {
        console.warn('[monthlyPlanGenerator] tenant classification failed:', (e as Error).message)
    }

    const seoResearch2026 = loadSeoResearch2026()

    const ctx: PromptCtx = {
        businessName, websiteUrl, businessDesc,
        paidProfile, audit, mediaPlan, strategy,
        chosenScenarioKey, chosenScenarioFull,
        strategyOptionsAll, paidAudit, paidDataInventory,
        internalSeoAudit, linkAudit, aeoVisibility, validation,
        opsBriefs, latestOpsBrief, marketingIntents, integrationsState,
        brandBookFull, pastAgentOutputs, agentIntegrations, pastHypotheses,
        creativePerformance, creativeFatigueAlerts, paidLearnings, strategyLearnings,
        costTimeline, paidBudget,
        clientBaseline, paidCompetitorLandscape, paidKeywordResearch,
        seoKeywordResearch, competitorLandscape,
        audiencePersonas, positioningResults,
        contentPlan, previousMonthlyPlan,
        tenantState, seoResearch2026,
        trigger,
        baselineHistory, baselineDelta, completedTaskOutcomes,
    }

    return { ctx, agent, rd, apiKey }
}

// Phase 4.3-N v8: compute baseline delta (prior → current). Returns null on
// missing data. Output structure surfaces deltas Opus can cite verbatim in
// the monthly plan narrative — e.g. "CPA was ₪150 → now ₪120 = -20%".
function computeBaselineDelta(prior: any, current: any): any {
    try {
        const priorAds = prior?.dfsData?.googleAds?.accountMetrics || {}
        const currAds = current?.dfsData?.googleAds?.accountMetrics || {}
        const delta: any = { _pulledFrom: prior?.pulledAt, _pulledTo: current?.pulledAt }

        const num = (v: any): number | null => (typeof v === 'number' && !isNaN(v)) ? v : null

        // Core metrics: cost, conversions, clicks, ctr, cpc, conv_rate, cpa
        const metrics: Array<{ key: string; labelHe: string; betterDir: 'up' | 'down' }> = [
            { key: 'cost',             labelHe: 'הוצאה',          betterDir: 'down' },
            { key: 'conversions',      labelHe: 'המרות',          betterDir: 'up' },
            { key: 'clicks',           labelHe: 'קליקים',         betterDir: 'up' },
            { key: 'impressions',      labelHe: 'חשיפות',         betterDir: 'up' },
            { key: 'ctr',              labelHe: 'CTR',            betterDir: 'up' },
            { key: 'avgCpc',           labelHe: 'CPC ממוצע',      betterDir: 'down' },
            { key: 'convRate',         labelHe: 'שיעור המרה',     betterDir: 'up' },
            { key: 'costPerConv',      labelHe: 'CPA',            betterDir: 'down' },
        ]
        for (const m of metrics) {
            const a = num(priorAds[m.key])
            const b = num(currAds[m.key])
            if (a === null || b === null || a === 0) continue
            const deltaAbs = b - a
            const deltaPct = (deltaAbs / Math.abs(a)) * 100
            const improved = m.betterDir === 'up' ? deltaAbs > 0 : deltaAbs < 0
            delta[m.key] = {
                prior: a, current: b, deltaAbs, deltaPct: Math.round(deltaPct * 10) / 10,
                improved, labelHe: m.labelHe,
            }
        }
        return delta
    } catch (err) {
        console.warn('[monthlyPlanGenerator] computeBaselineDelta failed:', (err as Error).message)
        return null
    }
}

// ─── Persist plan + emit per-task agent_outputs rows ──────────────────────
async function persistAndEmit(
    instanceId: string,
    plan: MonthlyMarketingPlan,
    agent: any,
    rd: any,
    trigger: PromptCtx['trigger'],
    chosenScenarioKey: string | undefined,
): Promise<{ outputId: string | undefined }> {
    const { writeResearchData } = await import('./agentContext')
    await writeResearchData(agent, instanceId, { ...rd, monthlyPlan: plan })

    const taskOutputIdByTaskId = new Map<string, string>()
    try {
        const existing = await db.select().from(agentOutputs)
            .where(and(
                eq(agentOutputs.instanceId, instanceId),
                eq(agentOutputs.outputType, 'monthly_task'),
            ))
        const existingByTaskId = new Map<string, any>()
        for (const row of existing) {
            const tid = (row.metadata as any)?.taskId
            if (tid) existingByTaskId.set(tid, row)
        }

        for (const task of plan.tasks) {
            const carry = existingByTaskId.get(task.id)
            if (carry && (carry.status === 'pending_review' || carry.status === 'approved' || carry.status === 'in_progress')) {
                taskOutputIdByTaskId.set(task.id, carry.id)
                await db.update(agentOutputs).set({
                    // Phase 2026.02 Block 6: per-agent isolation. Without
                    // agentId, secondary agents (Packing Station etc.) hit the
                    // outputs.ts filter (line 124: eq(agentId, secondary.id))
                    // and see an empty approval queue. Always scope rows to
                    // the agent that owns the plan.
                    agentId: agent?.id || null,
                    title: `${task.priority} · ${task.title}`.slice(0, 200),
                    content: JSON.stringify({
                        summary: task.summary,
                        type: task.type,
                        channel: task.channel,
                        priority: task.priority,
                        estimatedEffort: task.estimatedEffort,
                        expectedImpact: task.expectedImpact,
                        sources: task.sources,
                        actionPlan: task.actionPlan,
                        dependsOn: task.dependsOn,
                    }, null, 2).slice(0, 12000),
                    // K19: scheduledFor column lets the UI filter "future tasks" without
                    // a research_data lookup. Mirrors task.scheduledFor verbatim.
                    scheduledFor: task.scheduledFor ? new Date(task.scheduledFor) : null,
                    metadata: {
                        taskId: task.id,
                        type: task.type,
                        channel: task.channel,
                        priority: task.priority,
                        // K19: surface schedule + dependency info on the output row
                        // so the dashboard filter/badge logic doesn't need to cross-
                        // reference research_data.monthlyPlan.tasks for every task.
                        weekOfMonth: task.weekOfMonth,
                        scheduledFor: task.scheduledFor,
                        dependsOn: task.dependsOn,
                        monthlyPlanGeneratedAt: plan.generatedAt,
                    } as any,
                }).where(eq(agentOutputs.id, carry.id))
                continue
            }

            const [taskRow] = await db.insert(agentOutputs).values({
                id: 'mt_' + randomBytes(6).toString('hex'),
                instanceId,
                agentId: agent?.id || null,
                agentRole: 'mazhir',
                outputType: 'monthly_task',
                platform: task.channel === 'google_ads' ? 'google_ads'
                        : task.channel === 'meta' ? 'meta'
                        : task.channel === 'seo' || task.channel === 'content' ? 'content'
                        : 'multi',
                status: 'pending_review',
                title: `${task.priority} · ${task.title}`.slice(0, 200),
                content: JSON.stringify({
                    summary: task.summary,
                    type: task.type,
                    channel: task.channel,
                    priority: task.priority,
                    estimatedEffort: task.estimatedEffort,
                    expectedImpact: task.expectedImpact,
                    sources: task.sources,
                    actionPlan: task.actionPlan,
                    dependsOn: task.dependsOn,
                }, null, 2).slice(0, 12000),
                scheduledFor: task.scheduledFor ? new Date(task.scheduledFor) : null,
                metadata: {
                    taskId: task.id,
                    type: task.type,
                    channel: task.channel,
                    priority: task.priority,
                    weekOfMonth: task.weekOfMonth,
                    scheduledFor: task.scheduledFor,
                    dependsOn: task.dependsOn,
                    monthlyPlanGeneratedAt: plan.generatedAt,
                } as any,
            }).returning()
            if (taskRow?.id) taskOutputIdByTaskId.set(task.id, taskRow.id)
        }

        for (const task of plan.tasks) {
            const oid = taskOutputIdByTaskId.get(task.id)
            if (oid) task.executionOutputId = oid
        }
        await writeResearchData(agent, instanceId, { ...rd, monthlyPlan: plan })
        console.log(`[monthlyPlanGenerator] ${instanceId}: emitted ${taskOutputIdByTaskId.size} per-task agent_outputs rows`)

        // Archive orphan monthly_task rows from PRIOR generations
        try {
            const currentTaskIds = new Set(plan.tasks.map(t => t.id))
            const allMonthlyTaskRows = await db.select().from(agentOutputs)
                .where(and(
                    eq(agentOutputs.instanceId, instanceId),
                    eq(agentOutputs.outputType, 'monthly_task'),
                    eq(agentOutputs.status, 'pending_review'),
                ))
            let archivedCount = 0
            for (const row of allMonthlyTaskRows) {
                const tid = (row.metadata as any)?.taskId
                if (tid && !currentTaskIds.has(tid)) {
                    await db.update(agentOutputs).set({ status: 'archived' })
                        .where(eq(agentOutputs.id, row.id))
                    archivedCount++
                }
            }
            if (archivedCount > 0) {
                console.log(`[monthlyPlanGenerator] ${instanceId}: archived ${archivedCount} orphan monthly_task rows`)
            }
        } catch (err) {
            console.warn('[monthlyPlanGenerator] orphan archive failed (non-fatal):', (err as Error).message)
        }
    } catch (err) {
        console.warn('[monthlyPlanGenerator] per-task output emission failed:', (err as Error).message)
    }

    // Surface overall plan as a historical/published artefact.
    // Phase 2026.02 Block 6: NOT in approval queue (status='published' not
    // 'pending_review'). The overall plan is redundant in משימות פעילות —
    // the dashboard already shows the same data via monthlyPlanCard above
    // the queue, and the 57 per-task rows are the only ones that need
    // explicit approval. Keep the row for audit history + Telegram anchor
    // but stop cluttering the user's queue with a non-actionable card.
    let outputId: string | undefined
    try {
        // Hebrew title — only acronyms in Latin letters (P0/P1/P2). Plan's
        // keyTheme is allowed in Hebrew + acronyms. Truncated for length.
        const summaryText = `${plan.summary.totalTasks} משימות · ${plan.summary.byPriority.P0} P0 · ${plan.summary.byPriority.P1} P1 · ${plan.summary.byPriority.P2} P2`
        const [outputRow] = await db.insert(agentOutputs).values({
            id: 'mp_month_' + randomBytes(6).toString('hex'),
            instanceId,
            agentId: agent?.id || null,
            agentRole: 'mazhir',
            outputType: 'monthly_marketing_plan',
            platform: 'multi',
            status: 'published',
            title: `תוכנית חודשית — ${summaryText} · ${(plan.overview?.keyTheme || '').slice(0, 60)}`,
            content: JSON.stringify({
                summary: plan.summary,
                overview: plan.overview,
                taskTitles: plan.tasks.map(t => ({ id: t.id, priority: t.priority, channel: t.channel, title: t.title })),
            }, null, 2).slice(0, 12000),
            metadata: {
                totalTasks: plan.summary.totalTasks,
                P0: plan.summary.byPriority.P0,
                P1: plan.summary.byPriority.P1,
                P2: plan.summary.byPriority.P2,
                trigger,
                chosenScenario: chosenScenarioKey,
                estimatedTotalImpact: plan.summary.estimatedTotalImpact,
            } as any,
        }).returning()
        outputId = outputRow?.id
        if (outputId) {
            sendApprovalQueueMessage(outputId).catch((err: Error) => {
                console.warn('[monthlyPlanGenerator] Telegram notify failed:', err.message)
            })
        }
    } catch (err) {
        console.warn('[monthlyPlanGenerator] approval_queue insert failed:', (err as Error).message)
    }

    return { outputId }
}

// ─── Main entry — thin orchestrator over the 3 passes ─────────────────────
export async function generateMonthlyPlan(
    instanceId: string,
    trigger: PromptCtx['trigger'] = 'on_demand',
    agentId: string | null | undefined,    // Phase 4.3-N v8: optional — resolve secondary agent for multi-agent VPS support
): Promise<{ monthlyPlan: MonthlyMarketingPlan; outputId?: string; cost: { model: string } }> {
    const t0 = Date.now()
    const model = 'claude-opus-4-7'

    // Build context once — all 3 passes share it
    const { ctx, agent, rd, apiKey } = await buildPromptCtx(instanceId, trigger, agentId)
    console.log(`[monthlyPlanGenerator] ${instanceId}: building plan for agent=${agent?.id || 'primary-fallback'} (${agent?.name || 'unnamed'})`)

    console.log(`[monthlyPlanGenerator] ${instanceId}: v8 multi-pass starting (model=${model}, scenario=${ctx.chosenScenarioKey})`)

    // ─── Pass 1: Skeleton ────────────────────────────────────────────────
    const tPass1Start = Date.now()
    const { skeleton } = await generateSkeleton(ctx, apiKey, model)
    const pass1Elapsed = ((Date.now() - tPass1Start) / 1000).toFixed(1)
    console.log(`[monthlyPlanGenerator] ${instanceId}: Pass 1 (skeleton) done in ${pass1Elapsed}s — ${skeleton.tasks.length} skeletons`)

    // ─── Pass 2: Detail elaboration (parallel batches) ───────────────────
    const tPass2Start = Date.now()
    const { tasks: detailedTasks, batchStats } = await elaborateTasks(ctx, skeleton.tasks, apiKey, model)
    const pass2Elapsed = ((Date.now() - tPass2Start) / 1000).toFixed(1)
    console.log(`[monthlyPlanGenerator] ${instanceId}: Pass 2 (detail) done in ${pass2Elapsed}s — ${batchStats.succeeded}/${batchStats.total} batches succeeded, ${detailedTasks.length} tasks merged`)

    // ─── Pass 3: Senior-bar coverage check + fills ───────────────────────
    const tPass3Start = Date.now()
    const { tasks: pass3Tasks, coverage } = await ensureCoverage(ctx, detailedTasks, apiKey, model)
    const pass3Elapsed = ((Date.now() - tPass3Start) / 1000).toFixed(1)
    const filledRules = coverage.filter(c => c.status === 'filled').map(c => c.rule)
    const failedFills = coverage.filter(c => c.status === 'fill_failed').map(c => c.rule)
    console.log(`[monthlyPlanGenerator] ${instanceId}: Pass 3 (coverage) done in ${pass3Elapsed}s — filled=[${filledRules.join(',')}] failed=[${failedFills.join(',')}]`)

    // ─── K17: Hebrew cleanup pass — strips snake_case / English jargon ──
    // from user-facing task strings (title / summary / actionPlan[].step /
    // expectedImpact.rationale / sources[].excerpt) without changing
    // structure. Runs AFTER Pass 3 so coverage fills ALSO get cleaned
    // (Pass 3 still injects fresh Opus output that may contain
    // snake_case / English jargon despite the style guide).
    let finalTasks = pass3Tasks
    try {
        const { runMonthlyPlanHebrewCleanup } = await import('./monthlyPlanHebrewCleanup')
        const cleanup = await runMonthlyPlanHebrewCleanup({ tasks: pass3Tasks as unknown as Array<Record<string, unknown>>, instanceId })
        if (cleanup.applied && cleanup.cleanedTasks) {
            finalTasks = cleanup.cleanedTasks as unknown as typeof pass3Tasks
            console.log(`[monthlyPlanGenerator] ${instanceId}: Hebrew cleanup applied to ${cleanup.cleanedTasks.length} tasks (post-Pass 3)`)
        } else {
            console.log(`[monthlyPlanGenerator] ${instanceId}: Hebrew cleanup skipped (${cleanup.reason})`)
        }
    } catch (e) {
        console.warn(`[monthlyPlanGenerator] ${instanceId}: Hebrew cleanup error (non-fatal):`, (e as Error).message)
    }

    // ─── Assemble plan + apply guardrails ────────────────────────────────
    const qualityWarnings: string[] = [
        ...(skeleton.qualityWarnings || []),
    ]
    if (batchStats.failed > 0) {
        qualityWarnings.push(`Pass 2: ${batchStats.failed} of ${batchStats.total} batches failed — affected tasks shipped with skeleton-only fallback (no sources/actionPlan)`)
    }
    if (filledRules.length > 0) {
        qualityWarnings.push(`Pass 3 auto-filled missing senior-bar rules: ${filledRules.join(', ')}`)
    }
    if (failedFills.length > 0) {
        qualityWarnings.push(`Pass 3 fill failed for: ${failedFills.join(', ')} — manually escalate; senior-bar coverage incomplete`)
    }

    // Phase 4.3-N v8: stale-upstream check. Surface in qualityWarnings if any
    // research stage feeding this plan is stale (its upstream was edited after
    // it last ran). Non-blocking — user can still generate, but the plan is
    // built on partially-stale data. UI surfaces stale stages in סטטוס מערכת.
    const staleUpstream: string[] = []
    const planStatus = (rd?.plan?.status) || {}
    const criticalStages = [
        'audience_personas', 'positioning', 'strategy_options', 'cost_timeline_modeling',
        'paid_audit', 'paid_data_inventory', 'client_account_baseline',
        'internal_seo_audit', 'link_audit', 'competitor_landscape',
    ]
    for (const stageId of criticalStages) {
        const s = planStatus[stageId]
        if (s?.stale) {
            staleUpstream.push(`${stageId} (changed by ${s.stale.sourceStage || 'unknown'})`)
        }
    }
    if (staleUpstream.length > 0) {
        qualityWarnings.push(`⚠ Plan built with stale upstream stages: ${staleUpstream.join('; ')}. Re-run these stages and regenerate the plan for full accuracy.`)
    }

    let plan: MonthlyMarketingPlan = {
        generatedAt: new Date().toISOString(),
        generatedBy: trigger,
        horizon: '30d',
        summary: { totalTasks: 0, byStatus: { proposed: 0, approved: 0, rejected: 0, skipped: 0, in_progress: 0, completed: 0, failed: 0 }, byPriority: { P0: 0, P1: 0, P2: 0 }, byChannel: {}, byType: {}, estimatedTotalImpact: {} },
        overview: skeleton.overview || { hebrew: '', keyTheme: '', focusAreas: [] },
        tasks: finalTasks,
        status: 'draft',
        sourceSnapshots: {
            mediaPlanGeneratedAt: ctx.mediaPlan?.generatedAt,
            auditGeneratedAt: ctx.audit?.generatedAt,
            contentPlanGeneratedAt: ctx.contentPlan?.generatedAt,
            strategyUpdatedAt: (typeof ctx.strategy === 'object' && ctx.strategy) ? (ctx.strategy as any).updatedAt : undefined,
        },
        qualityWarnings,
    }

    plan = applyMonthlyPlanGuardrails(plan)

    // ─── Persist + emit ──────────────────────────────────────────────────
    const { outputId } = await persistAndEmit(instanceId, plan, agent, rd, trigger, ctx.chosenScenarioKey)

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[monthlyPlanGenerator] ${instanceId}: v8 ready in ${elapsed}s total (Pass1=${pass1Elapsed}s, Pass2=${pass2Elapsed}s, Pass3=${pass3Elapsed}s; tasks=${plan.summary.totalTasks}; P0=${plan.summary.byPriority.P0}; scenario=${ctx.chosenScenarioKey}; outputId=${outputId})`)

    return { monthlyPlan: plan, outputId, cost: { model } }
}