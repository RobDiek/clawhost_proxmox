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

/**
 * Call Anthropic with STREAMING (SSE) response. Streaming avoids undici's
 * 5-min HeadersTimeout ceiling — server returns headers immediately and we
 * accumulate tokens as they arrive. Required for Opus 4.7 long Hebrew outputs
 * (12-18 min generation) on non-streaming would always hit headers timeout.
 *
 * Parses Anthropic SSE events:
 *   event: message_start
 *   event: content_block_start
 *   event: content_block_delta   <- text_delta chunks aggregated here
 *   event: content_block_stop
 *   event: message_stop
 */
async function callOpus(args: { apiKey: string; model: string; system: string; user: string; maxTokens?: number; timeoutMs?: number }): Promise<string> {
    const body = JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens || 32000,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
        stream: true,
    })
    console.log(`[callOpus] STREAM POST ${ANTHROPIC_URL} model=${args.model} max_tokens=${args.maxTokens} bodyLen=${body.length}`)
    const t0 = Date.now()
    let res: Response
    try {
        res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'x-api-key': args.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'accept': 'text/event-stream',
            },
            body,
            signal: AbortSignal.timeout(args.timeoutMs || 1200000),
        })
    } catch (err) {
        const e = err as any
        console.error(`[callOpus] fetch threw before stream open. cause=${e?.cause?.message || e?.cause?.code || '(none)'}`)
        throw new Error(`Anthropic stream open failed: ${e.message}`)
    }
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        console.error(`[callOpus] HTTP ${res.status} body=${t.slice(0, 1000)}`)
        throw new Error(`Opus ${res.status}: ${t.slice(0, 400)}`)
    }
    if (!res.body) throw new Error('Anthropic stream returned no body')

    // Read SSE chunks
    const reader = (res.body as any).getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let assembled = ''
    let lastProgressLog = Date.now()
    let stopReason: string | undefined
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE messages are separated by \n\n
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || ''
        for (const msg of messages) {
            const lines = msg.split('\n')
            let eventName = ''
            let dataStr = ''
            for (const line of lines) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                else if (line.startsWith('data:')) dataStr = line.slice(5).trim()
            }
            if (!dataStr) continue
            let payload: any
            try { payload = JSON.parse(dataStr) } catch { continue }
            switch (eventName) {
                case 'content_block_delta':
                    if (payload?.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') {
                        assembled += payload.delta.text
                    }
                    break
                case 'message_delta':
                    if (payload?.delta?.stop_reason) stopReason = payload.delta.stop_reason
                    if (payload?.usage?.output_tokens) outputTokens = payload.usage.output_tokens
                    break
                case 'message_start':
                    if (payload?.message?.usage?.input_tokens) inputTokens = payload.message.usage.input_tokens
                    break
                case 'error':
                    throw new Error(`Anthropic stream error: ${JSON.stringify(payload).slice(0, 400)}`)
            }
        }
        // Progress log every 60s — helpful for diagnosing long Opus runs
        if (Date.now() - lastProgressLog > 60000) {
            const elapsed = Math.round((Date.now() - t0) / 1000)
            console.log(`[callOpus] stream progress: ${elapsed}s elapsed, ${assembled.length} chars assembled`)
            lastProgressLog = Date.now()
        }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[callOpus] stream done: ${elapsed}s, ${assembled.length} chars, stop=${stopReason || '?'}, in=${inputTokens || '?'} out=${outputTokens || '?'}`)
    if (!assembled) throw new Error('Opus stream produced no text')
    return assembled
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

    // Phase 4.3-G: server-side fallback for scheduledFor + weekOfMonth.
    // If Opus omitted either, distribute tasks by priority across the month,
    // skipping weekends (IL: Sat = day 6 in ISO, also avoid Fri afternoon).
    // P0 → days 1-14, P1 → days 8-21, P2 → days 15-28.
    const today = new Date()
    const baseY = today.getUTCFullYear()
    const baseM = today.getUTCMonth()
    const baseD = today.getUTCDate()
    function isoDate(year: number, month0: number, day: number): string {
        const d = new Date(Date.UTC(year, month0, day))
        return d.toISOString().slice(0, 10)
    }
    function nextWorkday(dayOffset: number): string {
        // dayOffset is days from today. Skip Saturdays (6) and Fridays (5) after offset 12pm — for simplicity skip both 5 and 6.
        let off = dayOffset
        for (let i = 0; i < 14; i++) {
            const d = new Date(Date.UTC(baseY, baseM, baseD + off))
            const dow = d.getUTCDay()  // 0=Sun, 5=Fri, 6=Sat
            if (dow !== 5 && dow !== 6) return d.toISOString().slice(0, 10)
            off++
        }
        return isoDate(baseY, baseM, baseD + dayOffset)
    }

    // Group tasks by priority + index, distribute across the appropriate window
    const buckets: Record<string, { start: number; end: number; tasks: MonthlyTask[] }> = {
        P0: { start: 0, end: 13, tasks: [] },
        P1: { start: 7, end: 20, tasks: [] },
        P2: { start: 14, end: 27, tasks: [] },
    }
    for (const t of fixedTasks) {
        buckets[t.priority]?.tasks.push(t)
    }
    for (const key of ['P0', 'P1', 'P2'] as const) {
        const b = buckets[key]
        const span = b.end - b.start + 1
        b.tasks.forEach((t, idx) => {
            if (!t.scheduledFor) {
                const offset = b.start + Math.floor((idx * span) / Math.max(b.tasks.length, 1))
                t.scheduledFor = nextWorkday(offset)
            }
            if (!t.weekOfMonth) {
                const offset = Math.floor((new Date(t.scheduledFor).getTime() - Date.UTC(baseY, baseM, baseD)) / (24 * 3600 * 1000))
                t.weekOfMonth = Math.max(1, Math.min(4, Math.ceil((offset + 1) / 7))) as 1 | 2 | 3 | 4
            }
        })
    }

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
                    // Phase 4.3-F fix: don't double-count. extraConversions30d is the
                    // primary count; extraLeadsPerMonth only added when the metric is
                    // explicitly leads_per_month (the case below).
                    summary.estimatedTotalImpact.extraConversions30d =
                        (summary.estimatedTotalImpact.extraConversions30d || 0) + ei.value
                    break
                case 'leads_per_month':
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
    chosenScenarioKey: string | undefined          // 'smart' | 'aggressive'
    chosenScenarioFull: any                        // full strategy object (30-day plan, KPIs, do-not-channels, first_win, risks)
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
        if (!ctx.chosenScenarioKey) {
            return `═══ CHOSEN SCENARIO: (missing — user must pick in strategy_options first) ═══\n(no calibrated budgets available)`
        }
        const records = (ctx.costTimeline as any)?.records || []
        const picked = records.find((r: any) => r.scenario === ctx.chosenScenarioKey || r.tier_key === ctx.chosenScenarioKey)
        return `═══ CHOSEN SCENARIO: ${ctx.chosenScenarioKey} ═══

Calibrated budget (NEVER override; reference verbatim):
${jstr(picked, 3000)}

Full cost_timeline_modeling records (both scenarios for context):
${jstr({ records }, 4000)}

${ctx.chosenScenarioFull ? `═══ STRATEGY DETAIL (full chosenScenario object — USE AS PRIMARY SOURCE) ═══

This object was auto-selected from strategy_options (confidence: ${(ctx.chosenScenarioFull as any).confidence || 'unknown'}) and contains the complete 30-day plan, 90-day KPI projections, primary persona, first-win channel, do-not channels with rationale, channel priority list with 30/60/90 outcomes, risks + mitigations, and funnel mapping. Anchor your monthly tasks on these — every task should trace to either a 30_day_plan.actions item, a channel_priority_list entry, or a risk mitigation.

${jstr(ctx.chosenScenarioFull, 12000)}` : '(chosenScenario stored as legacy string — full strategy object not available)'}`
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
      "scheduledFor": "<ISO YYYY-MM-DD within next 30 days; P0=week1-2, P1=week2-3, P2=week3-4; respect dependsOn ordering>",
      "weekOfMonth": <1|2|3|4 — bucket matching scheduledFor>,
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
    // Phase 4.3-B fix: chosenScenario lives in research_data in TWO shapes:
    //   (a) legacy: just a string 'smart' | 'aggressive' (early tenants)
    //   (b) current: full strategy object with .scenario field (the auto-selected
    //       record from strategy_options + 30_day_plan + kpis_90_day + first_win +
    //       do_not_channels + risks + channel_priority_list + funnel). This is
    //       gold for the synergy prompt.
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
    const seoKeywordResearch = results.seo_keyword_research
    const competitorLandscape = results.competitor_landscape
    const audiencePersonas = results.audience_personas
    const positioningResults = results.positioning
    const previousMonthlyPlan: MonthlyMarketingPlan | undefined = rd.monthlyPlan

    // Hard preconditions
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

    // Phase 4.3-B: ALWAYS use Opus 4.7 for monthly plan synthesis.
    // This is the most strategic task in the platform — Sonnet 4.6 emits poorly
    // escaped JSON on long Hebrew outputs (unescaped " in ש"ח, embedded
    // newlines inside multi-paragraph summaries). Per memory feedback_model_tiers
    // — strategic tasks default to Opus, not whatever resolveDirectModel returns.
    const model = 'claude-opus-4-7'
    const usingOpus = true

    // Tenant classification (read-only) — informs prompt context
    let tenantState: any = null
    try {
        const { classifyTenantSetupState } = await import('./tenantSetupState')
        tenantState = await classifyTenantSetupState(instanceId)
    } catch (e) {
        console.warn('[monthlyPlanGenerator] tenant classification failed:', (e as Error).message)
    }

    const seoResearch2026 = loadSeoResearch2026()

    const system = `You are the senior strategic marketing director for an Israeli SMB AI marketing platform (ClawFlow). Behind you stand **10 specialist sub-agents** working in parallel: paid PPC analyst, SEO strategist, content writer, creative director, social media manager, conversion optimizer, link outreach specialist, technical SEO auditor, hypothesis tester, brand analyst. Your job: synthesize the client's complete marketing state (paid + organic + content + audit + scenarios) into a UNIFIED MONTHLY PLAN — deep, parallel, multi-channel, hypothesis-driven, creative-rich.

═══ HARD POLICY (NON-NEGOTIABLE) ═══

1. Human-in-the-loop for MUTATIONS — every task that WRITES/PUBLISHES/CHANGES external systems is approval-gated in משימות פעילות. The agent proposes; the user decides.
2. **Read-only verifications NEVER become user tasks** — status checks, scans, audits-of-existing-state, monitoring, indexation checks, "verify campaign is active" — all of these are AUTO and live INSIDE other tasks as PRE-CHECK actionPlan steps (automated:true, ~5min). Never surface as standalone user tasks. Type 'measurement_gap' is RESERVED for setting up NEW tracking infrastructure (new pixel, new event, new property) — never for verifying existing-state. If you find yourself writing a task with metric='other' and value=1 that just says "verify X" or "check Y" — DELETE it and fold it into the appropriate write-task as its first actionPlan step.
3. Atomic tasks — 1 task = 1 atomic action. "Add 23 negatives" is one task; "Switch bid strategy" is another; "Publish 5 city LPs" → 5 separate tasks. Don't bundle.
4. Source citation MANDATORY — every task.sources[] has **≥3 entries** (aim for 4-6) pointing to specific upstream evidence with **meaningful excerpts** (real numbers/quotes, not "see audit"). Mix source types.
5. Link budgets are PRE-CALIBRATED — read chosenScenario + cost_timeline_modeling VERBATIM. NEVER invent new link budgets.
6. Order by impact — P0 ships this week; P1 this month; P2 quarterly. Within priority, by expectedImpact.value descending.
7. Israeli market context — Hebrew strings for user-facing fields. English technical terms (campaign, keyword, schema, awct, RSA, CPA) inline ok.

═══ HEBREW UX STANDARDS (CRITICAL — end users are non-technical IL SMB owners) ═══

ALL user-facing strings (title / summary / overview.hebrew / focusAreas / source.excerpt /
expectedImpact.rationale / actionPlan.step text-before-the-adapter-name) must be in **clean Hebrew**.
No English jargon in user-facing copy. Technical terms get HEBREW EXPLANATIONS inline.

Forbidden English words in user-facing strings:
- CPA, RSA, tCPA, INP, CWV, GTM, GA4, AEO, SEO, FAQPage, schema, pixel, Smart Bidding,
  remarketing, retargeting, audience, conversion, attribution, indexation, ranking,
  carousel, reel, headline, description, pillar, spoke, hub.

Hebrew replacements WITH inline explanation (first occurrence):
- CPA → "עלות לליד (CPA)" — מחיר ממוצע ללקוח פוטנציאלי
- tCPA → "אסטרטגיית הצעות מבוססת יעד עלות לליד (tCPA)"
- RSA → "מודעת חיפוש מותאמת (RSA)"
- INP → "זמן התגובה לאינטראקציה (INP)"
- CWV → "אותות חוויית משתמש בליבה (Core Web Vitals)"
- GTM → "מנהל התגיות של גוגל (GTM)"
- GA4 → "Google Analytics 4 (GA4)"
- AEO → "אופטימיזציה למענה (AEO)"
- FAQPage → "סכמת שאלות נפוצות (FAQPage)"
- schema → "סכמה" / "תיוג מובנה"
- Pixel → "פיקסל מעקב"
- Smart Bidding → "הצעות חכמות"
- remarketing/retargeting → "פנייה חוזרת לגולשים"
- audience → "קהל יעד"
- conversion → "המרה" / "פעולת ערך"
- attribution → "ייחוס"
- pillar → "דף עוגן"
- spoke → "דף נושא משני" / "דף קשור"
- carousel → "קרוסלת תמונות"
- reel → "סרטון קצר (Reel)"
- headline → "כותרת מודעה"
- description → "תיאור מודעה"

Inside actionPlan steps where automated:true, the adapter call (e.g. "google_ads_mutate.add_negatives")
is OK in English as it's a system identifier — but the human-readable preamble before/after must be Hebrew.

The plan is READ by a non-technical Israeli business owner. Every sentence must be understandable.

═══ NARRATIVE OVERVIEW STANDARDS (the "story" of the month) ═══

overview.hebrew is NOT a 3-sentence abstract. It is a **6-8 paragraph plan-as-a-story** that walks
the owner through what we'll do and WHY in that order. One paragraph PER CHANNEL we're activating:

Template (apply to each active channel):
  **SEO/אורגני:** "קודם נכוון פנימה — נשפר את [page] כי יש לה כבר [N impressions ב-position P].
  אחרי שהבסיס יציב, נבנה [M dedicated pages] לערים הקיימות... רק כשהכל מוכן פנים האתר, נצא לבניית
  סמכות חיצונית — נירשם ל-[directories], נפנה ל-[outreach targets]..."

  **פרסום ממומן:** "הצעד הראשון לעצור את הבזבוז — ₪X הולכים לחיפושים לא רלוונטיים על [terms].
  אחרי שנוסיף שליליים נעבור מ-[strategy A] ל-[strategy B] כי שיעור ההמרה הנוכחי [CR%] מצדיק
  אופטימיזציה אלגוריתמית..."

  **תוכן ומדיה:** "נכתוב [N posts] לפי [persona breakdown]. דנה במעבר מקבלת [topic A], איתי
  המשופץ מקבל [topic B]..."

  **GMB וניהול מותג:** "..."

  **מעקב ואנליטיקה:** "לפני שמשיקים אופטימיזציות חזקות, חייבים סוגרים את [tracking gap]..."

  **ניסויים השפעה:** "השמשתי [N hypotheses] השפעה השונה — [list]..."

Tone: clear, plain, conversational — like a senior marketer briefing the founder. No bullet points
inside overview.hebrew — coherent prose paragraphs only. Each paragraph 60-150 Hebrew words.

═══ CALENDAR SCHEDULING (NEW — every task scheduledFor a date) ═══

Each task MUST include scheduledFor (ISO date YYYY-MM-DD) within the current month (or following
30 days from generatedAt). Distribution rules:
  - P0 → week 1-2 (days 1-14 from generation date)
  - P1 → week 2-3 (days 8-21)
  - P2 → week 3-4 (days 15-28)
  - For tasks with dependsOn[], scheduledFor MUST be AT LEAST 1 day after the latest dep
  - Balance load: don't pile 8 tasks on the same day. Aim for 1-3 tasks per workday (Sun-Thu)
  - No weekend scheduling (Friday afternoon / Saturday for IL market)
  - Also set weekOfMonth (1/2/3/4) for compact display

═══ DEPTH STANDARDS (quality bar — failure = unusable plan) ═══

**QUANTITY**: Target **30-40 tasks per month**. We have 10 sub-agents in parallel — under-tasking means agents sit idle. Spread work across channels so each specialist has 3-7 tasks of their kind.

**COMPACTNESS** (CRITICAL — we have ~32K output budget for 30-40 deep tasks):
- title: ≤80 Hebrew chars
- summary: ≤2 sentences, ≤200 chars
- expectedImpact.rationale: 1 sentence, ≤120 chars
- source.excerpt: 1 quote/number, ≤100 chars (DO quote real data, but DO NOT repeat the whole audit paragraph)
- actionPlan[].step: ≤120 chars per step. Concrete but tight.
- For creative briefs (RSA headlines / Meta carousel / FAQ items / persona УТП variants): pack them into actionPlan steps OR a single field; do NOT inflate.
- NO redundant narrative. Every word earns its place. The plan is a working artifact, not a thought essay.

**SOURCES (per task)**: MINIMUM 3, target 4-6. Each source.excerpt = quote the SPECIFIC number/finding (not "see audit"). Example: "audit.existingAccountAudit.wasteAnalysis.topWasteTerms[0]: 'מכולה' ₪613 / 33 קליקים / 0 conv". Mix types:
  - audit.* (immediate/shortTerm/ongoing/blockers/existingAccountAudit)
  - gsc.queries (specific query + position + impressions + clicks)
  - dfs.keywords (specific keyword + vol + cpc)
  - ga4.event/funnel/demographics (specific event + count + segment)
  - strategy.persona / strategy.positioning / strategy.intent_ladder (specific persona name + jobs)
  - chosenScenario.{first_win,channel_priority_list,risks,30_day_plan,kpis_90_day} (specific entry index)
  - contentPlan.gap (specific missing pillar/cluster)
  - sqr.waste / aucIns.opportunity / changeHistory.gap (specific term/competitor/gap)
  - transparency.competitor (specific competitor + ad type)
  - paidHypothesis (specific hypothesis if exists)
  - research_2026.section_N.topic (which section of the algo research backs this)

**ACTION PLANS (per task)**: 5-8 steps. Each step is CONCRETE:
  - For automated:true: name the integration adapter exactly ('google_ads_mutate.add_negatives', 'wordpress_publish_draft', 'github_create_pr', 'gtm_mutate.create_tag', 'mazhir_gtm_auto_setup', 'mazhir_conv_setup', 'content_plan_v4_enqueue', 'gbp_post_create') + specific resource targets (campaign ID, ad group name, page URL).
  - For automated:false: tell user EXACTLY what to do (open URL X → fill field Y with value Z → click button K → screenshot for verification).
  - Each step has estimatedMinutes (realistic — API mutations 2-10min; content drafts 30-90min; manual placements 15-60min).
  - Include a monitoring/verification step (last step typically: "monitor metric M for N days; threshold for success/kill = T").

**CREATIVE DETAIL** (mandatory for creative-bearing channels):
  - **Meta tasks**: specify FORMAT (single_image / carousel / reel / story / video). For carousel: list 3-5 card concepts. For reel: hook in first 3 seconds + script outline + caption + CTA. **Per-persona variants**: 1 task per persona with persona-specific УТП. Hebrew copy, real headlines.
  - **Google Ads RSA**: list the actual 15 headlines and 4 descriptions (real Hebrew text, ≤30/≤90 chars).
  - **Content/landing pages**: H1 + H2 outline (8-12 sections) + intro hook (2 sentences) + 15+ entities to cover + 4-6 FAQ items (40-60 word answers) + CTA copy + social proof slot + form fields.
  - **GBP posts**: full Hebrew copy + image brief + CTA + scheduling.
  - **Display creatives**: image brief (composition + colors + text overlay + persona-targeted).
  - **YouTube/Video**: 6-second bumper script OR 15-second in-stream script with hook + value prop + CTA.

**HYPOTHESIS TASKS (REQUIRED, type='experiment')**: minimum 2-3 per month. Structure:
  - hypothesis: "If we change [variable] from [baseline] to [new], then [metric] will move by [delta] within [window]"
  - success_criteria: "≥X% improvement on [metric] OR ≥N conversions within Y days"
  - decision_rule: "kill if <X / iterate if X-Y / scale if >Y"
  - sample_size: "min N impressions / N clicks / N conv"
  - duration: ISO days

**CONFIDENCE labels**:
  - **high** — when prediction directly anchors on hard data (GSC impressions, SQR ₪ spent, audit numbers, last-90d performance). Use freely.
  - **medium** — based on industry benchmark or scenario projection.
  - **low** — ONLY for experimental hypotheses without supporting data.

═══ SENIOR AGENCY BAR (mandatory — distinguishes mid-tier from top agency) ═══

These checks MUST pass on every plan. A monthly plan that misses any of these
is mid-tier (Wpromote/Tinuiti/iProspect would reject it):

1. **CR validation precedes Smart Bidding migration**. Before any tCPA/tROAS
   experiment task, propose a P0 measurement_gap task that AUDITS what counts
   as conversion in the current Google Ads account (form submit / phone click /
   WhatsApp click / generate_lead / etc.) AND validates the funnel from
   button-click → form-submit → qualified-lead → customer. Inflated CR
   (e.g. button clicks counted as conversions when only 5% become real leads)
   makes Smart Bidding misfire. The tCPA task MUST list this validation task
   in dependsOn[].

2. **Creative diversity for paid**. Don't ship one generic RSA refresh. Split
   into 2-3 separate ad-group-variant tasks with distinct messaging angles:
   - A) price-first (e.g. "29.9₪/קוב" anchor)
   - B) urgency (e.g. "השבת קלוט!", "מקום מוגבל")
   - C) trust (e.g. "ביטוח כלול", "24/7 אבטחה", reviews count)
   Each task isolates a psychological lever and produces independent learning.

3. **Funnel-stage content coverage**. Plan must include tasks for:
   - TOFU (awareness): "מה זה X / איך עובד"
   - MOFU (consideration): "איך לבחור / כמה עולה"
   - BOFU (decision): **comparison page vs primary competitor** — e.g.
     "Storage Station vs avia2000" — using competitor name from competitorLandscape.
     This is the highest-converting page type for recurring-revenue sites.

4. **Competitive intelligence monitor**. Include 1 monthly task that sets up
   weekly competitive monitoring: Transparency Center scan + Wayback site
   diff + backlink alerts for top 3 competitors. Reaction window 24-48h.

5. **Conversion path / CRO audit task**. At least one task per plan that
   audits form fields, WhatsApp button placement, trust signal proximity,
   mobile page speed. Top agency does heatmap + session recording + form
   abandonment analytics.

6. **Retention / LTV for recurring-revenue**. If business is recurring (storage,
   SaaS, subscription, services with repeat purchase): include 1+ task for
   cross-sell / reactivation / referral. NOT optional. Acquisition-only plans
   leave 30-50% revenue on table.

7. **Mobile-first optimizations** (mandatory for IL market). Click-to-call
   optimization, WhatsApp Business automation with lead-qualification flow,
   mobile LP variants. At least 1 dedicated mobile task per plan.

8. **Data warehouse / attribution architecture** task. GA4 → BigQuery export
   for cross-channel attribution. First-party hashed-data upload to Google
   Ads Customer Match for lookalike audience expansion. At least 1 task per
   quarter (P2 in monthly plan).

9. **Decision rule / replan triggers**. Plan must include — either as a
   dedicated task or in qualityWarnings — explicit escalation triggers:
   "CPA >40% above baseline for 14 days → emergency replan task spawned",
   "ranking drop >5 positions on tracked query → incident response",
   "traffic drop >20% week-over-week → root cause investigation".

10. **Email lead nurture sequence** for primary persona with longer research
    cycle. If audience persona has 2+ week research period (moving, weddings,
    renovation, B2B), include 1 task for lead-magnet + 3-5 email sequence.

═══ CHANNEL COVERAGE (MANDATORY MINIMUMS) ═══

For ALL plans, regardless of chosenScenario, include AT LEAST:
  - **google_ads**: 8-12 tasks (paid_optimization / keyword_expansion / creative_refresh / audience_expansion / experiment)
  - **seo**: 4-6 tasks (covering pillar, spokes, AEO content, internal-linking, schema, CWV-if-needed, NAP citations)
  - **content**: 3-5 tasks (blog/AEO articles, social copy, email newsletter — if applicable)
  - **gbp**: 2-3 tasks (reviews wave, posts, photos, Q&A, services)
  - **meta**: 2-4 tasks. **If client has Meta OAuth**: retargeting + creative variants per persona + brand awareness. **If NO Meta OAuth but business profile fits Meta (consumer leadgen, visual product, brand-building stage)**: 1 P1 task "Connect Meta + start with ₪500 test budget" with full brief on test design.
  - **gtm/ga4**: tasks for any tracking gap. **ALWAYS** include "Connect GA4" as P0 if scope missing — regardless of other state.
  - **website**: structural/schema/CWV/UX tasks.
  - **link acquisition**: per chosenScenario monthly count (Smart = 2-3; Aggressive = 5-8) — already calibrated.
  - **hypothesis tests (experiment type)**: 2-3 explicit experiments with structure above.

═══ STRATEGIC PRIORITIES (Sergei's principles) ═══

1. Internal optimization FIRST, link building SECOND. Lead with on-page wins (audit immediates, SQR cleanup, schema, content upgrade), then layer link strategy.
2. Sequence: keyword grouping → page mapping → new pages → meta+schema → link building.
3. Continuous evaluation — every task's expectedImpact produces a measurable delta the weekly KPI brief can read.
4. Paid → Organic synergy is a real 2026 mechanism (NavBoost + branded search + unlinked-mention detection). Look for cross-channel tasks (paid drives brand search → organic CTR; GMB reviews drive paid trust; content drives paid LP quality score).
5. Schema priority for LLM/AEO: Article + FAQPage + HowTo + Organization combo = 2.5-2.7× citation in AI Overviews (2026 research).

═══ TASK GENERATION GUIDELINES ═══

For each task:
- Read the 2026 algorithm research and weight ranking signals correctly. INP/CWV are tiebreakers — never lead with them when content gaps exist.
- Wrap each existing mediaPlan.campaignOptimizations[].changes[] entry as a separate task (use mediaPlanOptIndex). Don't duplicate the optimization itself; cite it AND enrich with specific actionPlan adapters + monitoring.
- Wrap audit.recommendedActions.immediate as P0; shortTerm as P1; ongoing as P2.
- For each GSC striking-distance query (rank 4-15 with vol>20): propose a specific content/website task pushing it to top-3 (cite the query text + current position + impressions).
- For each chosenScenario.channel_priority_list entry: produce 1-3 tasks operationalizing its content_formula + expected_30_60_90_outcomes.
- For each persona in research_data.results.audience_personas: at least 1 task with persona-tailored creative or content variant.
- For chosenScenario.do_not_channels: do NOT propose tasks in those channels.
- For chosenScenario.risks_mitigations: 1 mitigation task per high-impact risk (P0/P1 depending on probability).
- expectedImpact: SPECIFIC numbers. "+25 conv/mo" not "growth"; "-15% CPA" not "improvement".

═══ DEDUPE RULES ═══

- DO NOT propose a task that duplicates a previousMonthlyPlan task still in proposed/skipped/approved/in_progress status. Carry it over with same id, update fields if newer evidence.
- DO NOT propose contentPlan items already in drafting/awaiting_review/approved status.
- DO NOT propose creating ConversionActions/GTM tags that already exist in tenantState.signals.

═══ FORBIDDEN ═══

- Tasks with <3 sources[]
- Read-only verification/status-check tasks for the user to approve (these are auto)
- Inventing link/paid budgets (must cite chosenScenario)
- Bundling unrelated changes into one task
- Generic titles like "Optimize X" / "Improve Y" — must be specific (numbers, real values)
- Creative tasks WITHOUT specific copy / format / persona УТП
- Hypothesis tasks WITHOUT success_criteria + decision_rule
- "TODO: review" steps without specific instructions
- Recommending Twenty CRM or any deprecated integration

═══ JSON STRICTNESS (CRITICAL — avoid parse failures) ═══

Output VALID JSON parseable by JSON.parse():
- JSON delimiters use DOUBLE quotes. INSIDE strings, use SINGLE quotes 'word' for any emphasis/quotation.
  RIGHT: "excerpt": "בדוק 'פעיל' וגם budget"
  WRONG: "excerpt": "בדוק "פעיל" וגם budget"   ← unescaped internal " breaks JSON
- **NEVER include JSON-formatted arrays or objects as string content.** If you need to mention a list of items inside excerpt or rationale, write them as plain comma-separated text WITHOUT [ ] brackets.
  RIGHT: "excerpt": "רשימת שליליים: חינם, DIY, cloud storage, ביטוח"
  WRONG: "excerpt": "['חינם','DIY','cloud storage','ביטוח']"   ← embedded JSON breaks parsing
- If you absolutely must include a literal " inside a string, escape as \\" — but PREFER single quotes.
- Use ₪ symbol (not ש"ח) wherever possible to avoid escaping issues.
- Hebrew apostrophes (') do NOT need escaping in double-quoted strings — but use sparingly.
- NEVER embed literal newlines inside strings. If you need multi-line content, use \\n.
- No trailing commas before } or ].
- No comments inside the JSON.
- Be COMPACT — we have ~32K output budget for 30-40 deep tasks. Don't waste tokens on verbose narration.

Output STRICT JSON — no markdown fences, no commentary, no preamble. Schema in user message.`

    const userPrompt = buildUserPrompt({
        businessName, websiteUrl, businessDesc,
        paidProfile, audit, mediaPlan, strategy,
        chosenScenarioKey, chosenScenarioFull, costTimeline, paidBudget,
        clientBaseline, paidCompetitorLandscape, paidKeywordResearch,
        seoKeywordResearch, competitorLandscape,
        audiencePersonas, positioningResults,
        contentPlan, previousMonthlyPlan,
        tenantState, seoResearch2026,
        trigger,
    })

    console.log(`[monthlyPlanGenerator] ${instanceId}: Opus call starting (model=${model}, prompt=${system.length + userPrompt.length} chars, scenario=${chosenScenarioKey})`)

    const raw = await callOpus({
        apiKey, model, system, user: userPrompt,
        // 32K maxTokens — Anthropic non-streaming hard limit for Opus 4.7.
        // 64K requires streaming SSE or a beta header; transparent non-streaming
        // calls with 64K return TCP-drop ("fetch failed") not a clean HTTP error.
        // 32K Hebrew ≈ 30-40 deep tasks if Opus is compact in excerpts.
        maxTokens: usingOpus ? 32000 : 16000,
        // 15-min timeout — Opus 4.7 with 32K on Hebrew runs 8-12min typically.
        timeoutMs: 900000,
    })

    // Phase 4.3-G debug: dump raw Opus output to /tmp for inspection if parsing fails.
    // This is invaluable for diagnosing JSON quirks across iterations.
    let parsed: Partial<MonthlyMarketingPlan>
    try {
        parsed = extractLlmJson<Partial<MonthlyMarketingPlan>>(raw, 'monthlyPlan')
    } catch (err) {
        try {
            const fs = await import('node:fs/promises')
            const dumpPath = `/tmp/monthly_plan_raw_${instanceId}_${Date.now()}.txt`
            await fs.writeFile(dumpPath, raw, 'utf-8')
            console.error(`[monthlyPlanGenerator] PARSE FAIL — raw output dumped to ${dumpPath} (${raw.length} chars)`)
        } catch { /* best-effort */ }
        throw err
    }

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

    // ─── Phase 4.3-C: emit ONE agent_outputs row PER TASK ─────────────────
    // Each task surfaces in משימות פעילות as its own approval card.
    // outputType='monthly_task' triggers the task lifecycle UI on the dashboard.
    // Carry-over tasks (those that already exist from prior month) get their
    // existing output row reused — detect by metadata.taskId match.
    const taskOutputIdByTaskId = new Map<string, string>()
    try {
        // Find any existing monthly_task outputs for this instance — to detect carry-over
        const { and, eq: eqOp, sql } = await import('drizzle-orm')
        const existing = await db.select().from(agentOutputs)
            .where(and(
                eqOp(agentOutputs.instanceId, instanceId),
                eqOp(agentOutputs.outputType, 'monthly_task'),
            ))
        const existingByTaskId = new Map<string, any>()
        for (const row of existing) {
            const tid = (row.metadata as any)?.taskId
            if (tid) existingByTaskId.set(tid, row)
        }

        for (const task of plan.tasks) {
            const carry = existingByTaskId.get(task.id)
            if (carry && (carry.status === 'pending_review' || carry.status === 'approved' || carry.status === 'in_progress')) {
                // Carry-over: reuse the existing output row, update content + metadata
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
                }).where(eqOp(agentOutputs.id, carry.id))
                continue
            }

            // New task → new output row
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

        // Mirror per-task output ID back onto each task for executor cross-ref
        for (const task of plan.tasks) {
            const oid = taskOutputIdByTaskId.get(task.id)
            if (oid) task.executionOutputId = oid
        }
        // Re-persist with executionOutputIds populated
        await writeResearchData(agent, instanceId, { ...rd, monthlyPlan: plan })
        console.log(`[monthlyPlanGenerator] ${instanceId}: emitted ${taskOutputIdByTaskId.size} per-task agent_outputs rows`)
    } catch (err) {
        console.warn('[monthlyPlanGenerator] per-task output emission failed:', (err as Error).message)
    }

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

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[monthlyPlanGenerator] ${instanceId}: ready in ${elapsed}s (tasks=${plan.summary.totalTasks}, P0=${plan.summary.byPriority.P0}, scenario=${chosenScenarioKey}, outputId=${outputId})`)

    return { monthlyPlan: plan, outputId, cost: { model } }
}