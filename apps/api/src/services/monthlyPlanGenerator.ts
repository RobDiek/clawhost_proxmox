/**
 * Phase 4.3-B: Unified Monthly Marketing Plan Generator
 *
 * Reads ALL upstream sources (paid + organic + content + audit + scenarios) +
 * 2026 SEO algorithm research as ground-truth context, calls Opus 4.7 to
 * synthesize a unified plan of atomic, approval-gated tasks for the month.
 *
 * Hard contracts (enforced via prompt + guardrails):
 *   - Every task.requiresApproval is implicitly true (no auto-apply; executor
 *     reads task.status === 'approved' before running anything).
 *   - Every task has ≥1 source — server-side guardrail flags otherwise.
 *   - Link budgets come from research_data.chosenScenario + cost_timeline_modeling
 *     VERBATIM (project_link_strategy_scenarios). Never invented.
 *   - 2026 algorithm research is read at runtime; quarterly refresh expected.
 *
 * Wiring:
 *   - resolveActiveAgent → readResearchData / writeResearchData (dual-write)
 *   - resolveDirectModel('mazhir') → Opus 4.7 by default for strategic synthesis
 *   - emits one agent_outputs row of outputType='monthly_marketing_plan' for
 *     the OVERALL plan; per-task משימות פעילות rows are created in Phase C
 *     when the user opens the plan in dashboard (or eagerly at generation time).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, brandBooks, agentOutputs } from '@/db/schema'
import { resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { sendApprovalQueueMessage } from '@/services/approvalQueueTelegram'
import { extractLlmJson } from '@/services/llmJson'
import type {
    MonthlyMarketingPlan,
    MonthlyTask,
    MonthlyPlanSummary,
} from '@/controllers/hosting/agentSetup'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

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
        join(__dirname, '..', '..', '..', '..', 'research', 'seo_algorithm_2026.md'),
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

async function callOpus(args: { apiKey: string; model: string; system: string; user: string; maxTokens?: number; timeoutMs?: number }): Promise<string> {
    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'x-api-key': args.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: args.model,
            max_tokens: args.maxTokens || 32000,
            system: args.system,
            messages: [{ role: 'user', content: args.user }],
        }),
        signal: AbortSignal.timeout(args.timeoutMs || 600000),
    })
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Opus ${res.status}: ${t.slice(0, 400)}`)
    }
    const j = await res.json() as any
    const text = j?.content?.[0]?.text
    if (!text || typeof text !== 'string') throw new Error('Opus returned no text')
    return text
}

// ─── Guardrails — enforce policy + derive summary stats ───────────────────
function applyMonthlyPlanGuardrails(plan: MonthlyMarketingPlan): MonthlyMarketingPlan {
    const fixedTasks: MonthlyTask[] = []
    const warnings: string[] = []

    for (const t of (plan.tasks || [])) {
        const fixed: MonthlyTask = { ...t }
        if (!fixed.id) fixed.id = 'tsk_' + randomBytes(5).toString('hex')
        if (!fixed.proposedAt) fixed.proposedAt = new Date().toISOString()
        if (!fixed.status) fixed.status = 'proposed'
        if (!Array.isArray(fixed.sources) || fixed.sources.length === 0) {
            warnings.push(`task "${(fixed.title || '').slice(0, 60)}" — no sources cited; flag for human review`)
            fixed.sources = [{ type: 'other', ref: 'missing', excerpt: '(no upstream evidence)' }]
        }
        if (!Array.isArray(fixed.dependsOn)) fixed.dependsOn = []
        if (!Array.isArray(fixed.actionPlan)) fixed.actionPlan = []
        if (!Array.isArray(fixed.childTaskIds)) fixed.childTaskIds = []
        // Defensive: clamp priority + status to known enums
        if (!['P0', 'P1', 'P2'].includes(fixed.priority)) fixed.priority = 'P1'
        fixedTasks.push(fixed)
    }

    // Sort: P0 first, then P1, then P2; within priority by impact descending
    const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
    fixedTasks.sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 9
        const pb = priorityOrder[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.expectedImpact?.value || 0) - (a.expectedImpact?.value || 0)
    })

    // Build summary
    const summary: MonthlyPlanSummary = {
        totalTasks: fixedTasks.length,
        byStatus: { proposed: fixedTasks.length, approved: 0, rejected: 0, skipped: 0, in_progress: 0, completed: 0, failed: 0 },
        byPriority: { P0: 0, P1: 0, P2: 0 },
        byChannel: {},
        byType: {},
        estimatedTotalImpact: {},
    }
    for (const t of fixedTasks) {
        summary.byPriority[t.priority] = (summary.byPriority[t.priority] || 0) + 1
        summary.byChannel[t.channel] = (summary.byChannel[t.channel] || 0) + 1
        summary.byType[t.type] = (summary.byType[t.type] || 0) + 1
        const ei = t.expectedImpact
        if (ei && ei.value > 0) {
            // Aggregate only 7d/14d/30d horizons; 60d/90d are out-of-scope for monthly totals
            const inWindow = ei.horizon === '7d' || ei.horizon === '14d' || ei.horizon === '30d'
            if (!inWindow) continue
            switch (ei.metric) {
                case 'conversions':
                case 'leads_per_month':
                    summary.estimatedTotalImpact.extraConversions30d =
                        (summary.estimatedTotalImpact.extraConversions30d || 0) + ei.value
                    summary.estimatedTotalImpact.extraLeadsPerMonth =
                        (summary.estimatedTotalImpact.extraLeadsPerMonth || 0) + ei.value
                    break
                case 'spend_savings_ils':
                    summary.estimatedTotalImpact.spendSavingsIls30d =
                        (summary.estimatedTotalImpact.spendSavingsIls30d || 0) + ei.value
                    break
                case 'cpa_reduction_pct':
                    summary.estimatedTotalImpact.cpaReductionPct =
                        Math.max(summary.estimatedTotalImpact.cpaReductionPct || 0, ei.value)
                    break
                case 'organic_traffic_pct':
                    summary.estimatedTotalImpact.extraOrganicTraffic30d =
                        (summary.estimatedTotalImpact.extraOrganicTraffic30d || 0) + ei.value
                    break
            }
        }
    }

    plan.tasks = fixedTasks
    plan.summary = summary
    plan.qualityWarnings = [...(plan.qualityWarnings || []), ...warnings]
    return plan
}

// ─── Build the long, structured user-prompt ───────────────────────────────
interface PromptCtx {
    businessName: string
    websiteUrl: string
    businessDesc: string
    paidProfile: any
    audit: any
    mediaPlan: any
    strategy: any
    chosenScenario: string | undefined
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

function jstr(obj: any, max = 8000): string {
    if (obj == null) return '(not available)'
    try {
        const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
        if (s.length <= max) return s
        return s.slice(0, max) + `\n… [truncated; original was ${s.length} chars]`
    } catch { return '(unserializable)' }
}

function buildUserPrompt(ctx: PromptCtx): string {
    const scenarioBlock = (() => {
        if (!ctx.chosenScenario || !ctx.costTimeline) {
            return `═══ CHOSEN SCENARIO: ${ctx.chosenScenario || '(missing — user must pick in strategy_options first)'} ═══\n(no calibrated budgets available)`
        }
        const records = (ctx.costTimeline as any)?.records || []
        const picked = records.find((r: any) => r.scenario === ctx.chosenScenario || r.tier_key === ctx.chosenScenario)
        return `═══ CHOSEN SCENARIO: ${ctx.chosenScenario} ═══

Calibrated budget (NEVER override; reference verbatim):
${jstr(picked, 3000)}

Full cost_timeline_modeling records (both scenarios for context):
${jstr({ records }, 4000)}`
    })()

    const prevTasksBlock = ctx.previousMonthlyPlan?.tasks
        ? `═══ PREVIOUS MONTH'S TASKS (do not duplicate; reference status when relevant) ═══

${jstr(ctx.previousMonthlyPlan.tasks.map((t: MonthlyTask) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, channel: t.channel,
    completedAt: t.completedAt, rejectedAt: t.rejectedAt, rejectedReason: t.rejectedReason,
})), 6000)}

If a previous task is still 'proposed' or 'skipped' and still relevant, CARRY IT OVER (same id) updating priority/sources as needed. If 'completed' — assume that capability is in place when designing follow-on tasks. If 'rejected' — DO NOT re-propose unless a new evidence material change exists.`
        : ''

    const tenantBlock = ctx.tenantState ? `═══ TENANT CLASSIFICATION ═══

Classification: ${ctx.tenantState.classification}
Reason: ${ctx.tenantState.classificationReason}
Stage modes for downstream wiring:
  stage6_audit: ${ctx.tenantState.recommendedMode?.stage6_audit}
  stage7_gtm: ${ctx.tenantState.recommendedMode?.stage7_gtm}
  stage8_conv: ${ctx.tenantState.recommendedMode?.stage8_conv}
  stage9_plan: ${ctx.tenantState.recommendedMode?.stage9_plan}

Google Ads: connected=${ctx.tenantState.signals?.googleAds?.connected}, ${ctx.tenantState.signals?.googleAds?.activeCampaignsCount} active campaigns, ${ctx.tenantState.signals?.googleAds?.last90dConversions} conv / ₪${(ctx.tenantState.signals?.googleAds?.last90dSpendIls || 0).toLocaleString()} spend in 90d
GTM: connected=${ctx.tenantState.signals?.gtm?.connected}, snippet on site=${ctx.tenantState.signals?.gtm?.snippetInstalledOnSite}, ${ctx.tenantState.signals?.gtm?.liveVersionTagCount} live tags
GA4: connected=${ctx.tenantState.signals?.ga4?.connected}, propertyId=${ctx.tenantState.signals?.ga4?.measurementId || 'none'}
` : ''

    return `${tenantBlock}

═══ CLIENT ═══

Business: ${ctx.businessName}
Website: ${ctx.websiteUrl}
Description: ${(ctx.businessDesc || '').slice(0, 800)}
Trigger for this generation: ${ctx.trigger}

${scenarioBlock}

═══ PAID PROFILE (client-provided) ═══

${jstr(ctx.paidProfile, 4000)}

═══ MAZHIR AUDIT (most recent — read findings + recommendedActions) ═══

${jstr(ctx.audit, 12000)}

═══ MEDIA PLAN (paid optimizations + new campaigns — wrap each as task) ═══

Pay special attention to:
  - mediaPlan.campaignOptimizations[].changes[] — each item should become at minimum one task with source pointing to mediaPlanOptIndex
  - mediaPlan.campaigns[] — supplementary new campaigns are tasks of type 'paid_optimization'
  - mediaPlan.planMode — informs whether tasks are optimize_existing vs build_new flavored

${jstr(ctx.mediaPlan, 14000)}

═══ ORGANIC STRATEGY (read full text or object) ═══

${jstr(ctx.strategy, 8000)}

═══ POSITIONING + AUDIENCE PERSONAS ═══

${jstr(ctx.positioningResults, 3000)}

${jstr(ctx.audiencePersonas, 4000)}

═══ COMPETITOR LANDSCAPES ═══

Organic competitors:
${jstr(ctx.competitorLandscape, 4000)}

Paid competitors:
${jstr(ctx.paidCompetitorLandscape, 4000)}

═══ KEYWORD RESEARCH ═══

Paid keywords (already grouped by intent):
${jstr(ctx.paidKeywordResearch, 5000)}

SEO keywords:
${jstr(ctx.seoKeywordResearch, 5000)}

═══ CLIENT ACCOUNT BASELINE (real metrics) ═══

${jstr(ctx.clientBaseline, 5000)}

═══ EXISTING CONTENT PLAN (do not duplicate items) ═══

${jstr(ctx.contentPlan, 6000)}

${prevTasksBlock}

═══ 2026 GOOGLE ALGORITHM & AEO RESEARCH (ground truth for ranking signal prioritization) ═══

${ctx.seoResearch2026 || '(2026 algorithm research not available; fall back to general SEO best-practice but flag in qualityWarnings)'}

═══ YOUR TASK — PRODUCE STRICT JSON ═══

Synthesize ONE unified monthly plan that:
  1. References each upstream evidence source via task.sources[] (mediaPlan.optimization, audit.recommendedActions.X, gsc.queries, ga4.X, strategy.persona, contentPlan.gap, sqr.waste, etc.)
  2. Orders by impact (P0 first; within same priority, by expectedImpact.value descending)
  3. Atomizes — every action is ONE task; don't bundle
  4. Forecasts expectedImpact with REAL numbers anchored on the data above (CPA delta, traffic lift, conv increase). If you can't justify a number, mark confidence='low' and use a conservative estimate.
  5. Builds actionPlan[] with a step-by-step executor recipe. Each step has automated:true (system can do via API after approval) or automated:false (user TODO with brief). For 'paid_optimization' type — automated:true with Google Ads API mutate. For 'content_creation' / 'landing_page' / 'website_change' — automated:true via WordPress/GitHub IF integration available, otherwise automated:false with detailed brief. For 'tracking_setup' — automated:true via Mazhir GTM/conversions endpoints.
  6. Builds dependsOn[] when one task gates another (e.g. "create city LP" must approve+complete before "add Search campaign for that city").
  7. Cross-channel synergy: actively look for paid→organic and organic→paid synergies. Examples:
     - SQR shows query "X" wasting budget with 0 conv → if same X has GSC striking-distance position → propose: pause kw in paid + invest in organic LP refresh + content
     - Paid drives brand search → schedule a "brand mention monitor" task to capture unlinked mentions for E-E-A-T
     - Content cluster about Y → propose paid amplification kw for top-converting page
  8. Link tasks reference chosenScenario's backlink_acquisition budget VERBATIM. Per scenario:
     - Smart: 2-3 mid-DR links/month at ~₪400-500/link, total ~₪1,000
     - Aggressive: 5-8 multi-tier links/month, total ~₪3,000
     For each link task, include the target DR tier + outreach approach (digital PR / niche edit / citation / etc.).
  9. Schema priority: For LLM/AEO tasks, use Article + FAQPage + HowTo + Organization combo (2.5-2.7× citation; from 2026 research).
 10. Hebrew strings for title/summary/sources.excerpt/actionPlan.step. English technical terms (campaign, keyword, schema, etc.) ok inline.

Output JSON exactly this shape (no markdown fences, no commentary before/after):

{
  "horizon": "30d",
  "overview": {
    "hebrew": "<3-5 sentence strategic narrative for the month — what's the focus, why now, what wins to expect>",
    "keyTheme": "<1-line headline e.g. 'אופטימיזציית STAG עירוני + הרחבת AEO ב-FAQ'>",
    "focusAreas": ["<3-5 Hebrew bullets — the strategic themes of the month>"]
  },
  "tasks": [
    {
      "id": "<tsk_xxxxxxxxxx — 10-char nanoid; omit if you want server to generate>",
      "type": "<paid_optimization | content_creation | landing_page | tracking_setup | audience_expansion | keyword_expansion | cross_channel_amplification | website_change | creative_refresh | measurement_gap | experiment | other>",
      "title": "<Hebrew, ≤80 chars>",
      "summary": "<Hebrew, 1-2 sentences>",
      "channel": "<google_ads | meta | seo | content | gtm | ga4 | website | gbp | whatsapp | email | cross>",
      "priority": "<P0 | P1 | P2>",
      "estimatedEffort": "<15_min | 30_min | 1_hour | 2_3_hours | 1_day | 2_3_days | 1_week>",
      "expectedImpact": {
        "metric": "<conversions | cpa_reduction_pct | spend_savings_ils | ctr_pct | ranking_position | organic_traffic_pct | leads_per_month | roas_pct | qs_points | other>",
        "value": <number — direction implied by metric, e.g. cpa_reduction_pct=15 means -15%>,
        "horizon": "<7d | 14d | 30d | 60d | 90d>",
        "confidence": "<high | medium | low>",
        "rationale": "<Hebrew, 1 sentence: WHY this number, anchored on which data point>"
      },
      "sources": [
        { "type": "<see schema above>", "ref": "<e.g. opt_idx:0,change_idx:0 or query:קרטונים>", "excerpt": "<optional Hebrew quote>" }
      ],
      "dependsOn": ["<other task IDs, or empty array>"],
      "actionPlan": [
        { "step": "<Hebrew: what executor does>", "automated": <true|false>, "estimatedMinutes": <number> }
      ],
      "mediaPlanOptIndex": <number — if this wraps mediaPlan.campaignOptimizations[i]>,
      "contentPlanItemId": "<string — if this wraps contentPlan.items[i].id>",
      "paidHypothesisId": "<string — if this wraps a paid_hypothesis>"
    }
  ],
  "qualityWarnings": ["<any concerns about data freshness, missing sources, conflicts>"]
}

Return ONLY the JSON. No markdown fences. No preamble. No conclusion text.`
}

// ─── Main entry ───────────────────────────────────────────────────────────
export async function generateMonthlyPlan(
    instanceId: string,
    trigger: 'cron_monthly' | 'on_demand' | 'auto_refresh' = 'on_demand',
): Promise<{ monthlyPlan: MonthlyMarketingPlan; outputId?: string; cost: { model: string } }> {
    const t0 = Date.now()

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const apiKey = (inst as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Anthropic API key missing')

    const { resolvePrimaryAgent, readResearchData, writeResearchData } = await import('./agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}

    // Read all upstream sources
    const mediaPlan = rd.mediaPlan
    const audit = rd.mazhirAudit
    const strategy = rd.strategy
    const chosenScenario: string | undefined = rd.chosenScenario
    const contentPlan = rd.contentPlan
    const paidProfile = rd.paidProfile
    const answers = rd.answers || {}
    const results = rd.results || {}
    const costTimeline = results.cost_timeline_modeling
    const paidBudget = results.paid_budget_scenarios
    const clientBaseline = results.client_account_baseline
    const paidCompetitorLandscape = results.paid_competitor_landscape
    const paidKeywordResearch = results.paid_keyword_research
    const seoKeywordResearch = results.seo_keyword_research
    const competitorLandscape = results.competitor_landscape
    const audiencePersonas = results.audience_personas
    const positioningResults = results.positioning
    const previousMonthlyPlan: MonthlyMarketingPlan | undefined = rd.monthlyPlan

    // Hard preconditions
    if (!paidProfile && !audit) {
        throw new Error('Either paidProfile or mazhirAudit required — run paid_data_inventory + mazhir/audit first')
    }
    if (!chosenScenario) {
        throw new Error('research_data.chosenScenario not set — user must pick smart or aggressive in strategy_options first')
    }

    const [brand] = await db.select().from(brandBooks).where(eq(brandBooks.instanceId, instanceId))
    const businessName = (brand as any)?.businessName || answers.businessName || 'unknown'
    const websiteUrl = answers.websiteUrl || ''
    const businessDesc = answers.businessDescription || ''

    const model = await resolveDirectModel(instanceId, 'mazhir').catch(() => 'claude-opus-4-7')
    const usingOpus = model.startsWith('claude-opus')

    // Tenant classification (read-only) — informs prompt context
    let tenantState: any = null
    try {
        const { classifyTenantSetupState } = await import('./tenantSetupState')
        tenantState = await classifyTenantSetupState(instanceId)
    } catch (e) {
        console.warn('[monthlyPlanGenerator] tenant classification failed:', (e as Error).message)
    }

    const seoResearch2026 = loadSeoResearch2026()

    const system = `You are the senior strategic marketing director for an Israeli SMB AI marketing platform (ClawFlow). Your job: synthesize the client's complete marketing state (paid + organic + content + audit + scenarios) into a UNIFIED MONTHLY PLAN of atomic, approval-gated tasks.

═══ HARD POLICY (NON-NEGOTIABLE) ═══

1. Human-in-the-loop — every task is approval-gated. The user reviews each one in משימות פעילות. NO task implies auto-application. The agent proposes; the user decides.
2. Atomic tasks — 1 task = 1 atomic action. "Add 23 negatives" is one task; "Switch bid strategy" is another; "Publish 5 city LPs" → 5 separate tasks. Don't bundle.
3. Source citation MANDATORY — every task.sources[] has ≥1 entry pointing to upstream evidence. No task can exist without traced provenance.
4. Link budgets are PRE-CALIBRATED — read chosenScenario + cost_timeline_modeling VERBATIM. NEVER invent new link budgets.
5. Order by impact — P0 ships this week; P1 this month; P2 quarterly. Within priority, by expectedImpact.value descending.
6. Israeli market context — Hebrew strings for user-facing fields. English technical terms (campaign, keyword, schema, awct) inline ok.

═══ STRATEGIC PRIORITIES (Sergei's principles — encoded as hard rules) ═══

1. Internal optimization FIRST, link building SECOND. Don't lead the plan with link tasks until on-page is solid (audit shows few content gaps).
2. Sequence: keyword grouping → page mapping → new pages → meta+schema. Reflect this in task priorities.
3. Continuous evaluation — every task's expectedImpact must produce a measurable delta that weekly KPI brief can read.
4. Paid → Organic synergy is a real 2026 mechanism (NavBoost + branded search + unlinked-mention detection). Actively look for cross-channel tasks.
5. Schema priority for LLM/AEO: Article + FAQPage + HowTo + Organization combo = 2.5-2.7× citation in AI Overviews (from 2026 research).

═══ TASK GENERATION GUIDELINES ═══

For each task:
- Read the 2026 algorithm research provided in the user message and weight ranking signals correctly. INP/CWV are tiebreakers — never lead with them when content gaps exist.
- Wrap existing mediaPlan.campaignOptimizations[].changes[] as separate tasks (use mediaPlanOptIndex). Don't duplicate the optimization itself; cite it.
- Wrap audit.recommendedActions.immediate as P0 tasks; shortTerm as P1; ongoing as P2.
- For GSC striking-distance queries (rank 4-15) — propose 'content_creation' or 'website_change' tasks to push them top-3.
- For competitor backlink gaps — propose 'link acquisition' tasks within chosenScenario's calibrated budget.
- For chosen scenario's monthly KPI target (e.g. "top_10 = 12 by month 2") — propose tasks moving N pages from rank 11-20 to top 10.
- expectedImpact must be SPECIFIC numbers — not "improvement" or "growth". Anchor on real data.

═══ DEDUPE RULES ═══

- DO NOT propose a task that duplicates a previousMonthlyPlan task still in proposed/skipped/approved/in_progress status. Carry it over with same id, update fields if newer evidence.
- DO NOT propose tasks that duplicate contentPlan.items already in drafting/awaiting_review/approved status.
- DO NOT propose creating ConversionActions that already exist (check tenantState.signals.googleAds.existingConversionActions).
- DO NOT propose creating GTM tags already present in tenantState.signals.gtm.liveVersionTagCount.

═══ FORBIDDEN ═══

- Tasks with no sources[]
- Inventing link/paid budgets (must cite chosenScenario)
- Bundling unrelated changes into one task
- "Optimize X" / "Improve Y" — must be specific
- Recommending Twenty CRM or any deprecated integration

Output STRICT JSON — no markdown fences, no commentary. Schema in user message.`

    const userPrompt = buildUserPrompt({
        businessName, websiteUrl, businessDesc,
        paidProfile, audit, mediaPlan, strategy,
        chosenScenario, costTimeline, paidBudget,
        clientBaseline, paidCompetitorLandscape, paidKeywordResearch,
        seoKeywordResearch, competitorLandscape,
        audiencePersonas, positioningResults,
        contentPlan, previousMonthlyPlan,
        tenantState, seoResearch2026,
        trigger,
    })

    console.log(`[monthlyPlanGenerator] ${instanceId}: Opus call starting (model=${model}, prompt=${system.length + userPrompt.length} chars, scenario=${chosenScenario})`)

    const raw = await callOpus({
        apiKey, model, system, user: userPrompt,
        maxTokens: usingOpus ? 32000 : 16000,
        timeoutMs: 600000,
    })

    const parsed = extractLlmJson<Partial<MonthlyMarketingPlan>>(raw, 'monthlyPlan')

    let plan: MonthlyMarketingPlan = {
        generatedAt: new Date().toISOString(),
        generatedBy: trigger,
        horizon: parsed.horizon || '30d',
        summary: { totalTasks: 0, byStatus: { proposed: 0, approved: 0, rejected: 0, skipped: 0, in_progress: 0, completed: 0, failed: 0 }, byPriority: { P0: 0, P1: 0, P2: 0 }, byChannel: {}, byType: {}, estimatedTotalImpact: {} },
        overview: parsed.overview || { hebrew: '', keyTheme: '', focusAreas: [] },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        status: 'draft',
        sourceSnapshots: {
            mediaPlanGeneratedAt: mediaPlan?.generatedAt,
            auditGeneratedAt: audit?.generatedAt,
            contentPlanGeneratedAt: contentPlan?.generatedAt,
            strategyUpdatedAt: (typeof strategy === 'object' && strategy) ? (strategy as any).updatedAt : undefined,
        },
        qualityWarnings: parsed.qualityWarnings || [],
    }

    plan = applyMonthlyPlanGuardrails(plan)

    // Persist via dual-write
    await writeResearchData(agent, instanceId, { ...rd, monthlyPlan: plan })

    // Surface to approval queue (overall plan; per-task surface in Phase C)
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
                chosenScenario,
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

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[monthlyPlanGenerator] ${instanceId}: ready in ${elapsed}s (tasks=${plan.summary.totalTasks}, P0=${plan.summary.byPriority.P0}, scenario=${chosenScenario}, outputId=${outputId})`)

    return { monthlyPlan: plan, outputId, cost: { model } }
}