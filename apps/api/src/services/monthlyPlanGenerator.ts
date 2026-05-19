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
): Promise<{ ctx: PromptCtx; agent: any; rd: any; apiKey: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const apiKey = (inst as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Anthropic API key missing')

    const { resolvePrimaryAgent, readResearchData } = await import('./agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
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

    let brandBookFull: any = undefined
    let pastAgentOutputs: any[] = []
    let agentIntegrations: any[] = []
    let pastHypotheses: any[] = []
    let creativePerformance: any[] = []
    let creativeFatigueAlerts: any[] = []
    let paidLearnings: any[] = []
    let strategyLearnings: any[] = []
    try {
        const [bb] = await db.select().from(brandBooks).where(eq(brandBooks.instanceId, instanceId))
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

    if (!paidProfile && !audit) {
        throw new Error('Either paidProfile or mazhirAudit required — run paid_data_inventory + mazhir/audit first')
    }
    if (!chosenScenarioKey) {
        throw new Error('research_data.chosenScenario not set or malformed — user must pick smart or aggressive in strategy_options first')
    }

    const [brand] = await db.select().from(brandBooks).where(eq(brandBooks.instanceId, instanceId))
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
    }

    return { ctx, agent, rd, apiKey }
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
                    metadata: {
                        taskId: task.id,
                        type: task.type,
                        channel: task.channel,
                        priority: task.priority,
                        monthlyPlanGeneratedAt: plan.generatedAt,
                    } as any,
                }).where(eq(agentOutputs.id, carry.id))
                continue
            }

            const [taskRow] = await db.insert(agentOutputs).values({
                id: 'mt_' + randomBytes(6).toString('hex'),
                instanceId,
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
                metadata: {
                    taskId: task.id,
                    type: task.type,
                    channel: task.channel,
                    priority: task.priority,
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

    // Surface overall plan to approval queue
    let outputId: string | undefined
    try {
        const summaryText = `${plan.summary.totalTasks} tasks · ${plan.summary.byPriority.P0} P0 · ${plan.summary.byPriority.P1} P1 · ${plan.summary.byPriority.P2} P2`
        const [outputRow] = await db.insert(agentOutputs).values({
            id: 'mp_month_' + randomBytes(6).toString('hex'),
            instanceId,
            agentRole: 'mazhir',
            outputType: 'monthly_marketing_plan',
            platform: 'multi',
            status: 'pending_review',
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
): Promise<{ monthlyPlan: MonthlyMarketingPlan; outputId?: string; cost: { model: string } }> {
    const t0 = Date.now()
    const model = 'claude-opus-4-7'

    // Build context once — all 3 passes share it
    const { ctx, agent, rd, apiKey } = await buildPromptCtx(instanceId, trigger)

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
    const { tasks: finalTasks, coverage } = await ensureCoverage(ctx, detailedTasks, apiKey, model)
    const pass3Elapsed = ((Date.now() - tPass3Start) / 1000).toFixed(1)
    const filledRules = coverage.filter(c => c.status === 'filled').map(c => c.rule)
    const failedFills = coverage.filter(c => c.status === 'fill_failed').map(c => c.rule)
    console.log(`[monthlyPlanGenerator] ${instanceId}: Pass 3 (coverage) done in ${pass3Elapsed}s — filled=[${filledRules.join(',')}] failed=[${failedFills.join(',')}]`)

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