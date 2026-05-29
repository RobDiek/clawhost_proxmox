/**
 * Phase 4.3-N v8 — Pass 1: Skeleton Generation.
 *
 * Goal: produce a complete skeleton of 50-70 task placeholders in a single
 * Opus 4.7 call. Each placeholder has just enough info to scaffold the month —
 * type / channel / title / summary / priority / scheduledFor / one-line
 * rationale + flat expectedImpact fields. NO sources, NO actionPlan, NO
 * creative briefs. Those come in Pass 2.
 *
 * Why this works where v7's single-pass didn't:
 *  - Per-task budget drops from ~500 tokens (full task) to ~120 tokens
 *    (skeleton). 50-70 skeletons fit in ~8-10K output, well under the 32K cap.
 *  - Opus can think about WHAT belongs in the month without spending tokens
 *    fleshing out HOW each item gets executed. Decisions first, details later.
 *
 * Output: TaskSkeleton[] — consumed by Pass 2 (monthlyPlanDetailer.ts).
 */

import type { PromptCtx } from './monthlyPlanGenerator'
import { callOpusStream } from './llmStream'
import { extractLlmJson } from './llmJson'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

export type TaskType = MonthlyTask['type']
export type TaskChannel = MonthlyTask['channel']
export type TaskPriority = MonthlyTask['priority']
export type TaskEffort = MonthlyTask['estimatedEffort']
export type ImpactMetric = MonthlyTask['expectedImpact']['metric']
export type ImpactHorizon = MonthlyTask['expectedImpact']['horizon']
export type ImpactConfidence = MonthlyTask['expectedImpact']['confidence']

export interface TaskSkeleton {
    id: string
    type: TaskType
    title: string
    summary: string
    channel: TaskChannel
    priority: TaskPriority
    estimatedEffort: TaskEffort
    scheduledFor?: string
    weekOfMonth?: 1 | 2 | 3 | 4
    dependsOn: string[]
    expectedImpactMetric: ImpactMetric
    expectedImpactValue: number
    expectedImpactHorizon: ImpactHorizon
    expectedImpactConfidence: ImpactConfidence
    _oneLineRationale: string
    // Optional cross-refs to legacy artifacts (kept here so Pass 2 can preserve them)
    mediaPlanOptIndex?: number
    contentPlanItemId?: string
    paidHypothesisId?: string
}

interface SkeletonOutput {
    overview: { hebrew: string; keyTheme: string; focusAreas: string[] }
    tasks: TaskSkeleton[]
    qualityWarnings?: string[]
}

function jstr(obj: any, max = 6000): string {
    if (obj == null) return '(not available)'
    try {
        const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
        if (s.length <= max) return s
        return s.slice(0, max) + `\n… [truncated; original was ${s.length} chars]`
    } catch { return '(unserializable)' }
}

function buildSkeletonUserPrompt(ctx: PromptCtx): string {
    const scenarioBlock = (() => {
        if (!ctx.chosenScenarioKey) {
            return `═══ CHOSEN SCENARIO: (missing — user must pick in strategy_options first) ═══`
        }
        const records = (ctx.costTimeline as any)?.records || []
        const picked = records.find((r: any) => r.scenario === ctx.chosenScenarioKey || r.tier_key === ctx.chosenScenarioKey)
        return `═══ CHOSEN SCENARIO: ${ctx.chosenScenarioKey} ═══
Calibrated budget (verbatim — never invent):
${jstr(picked, 2500)}

Full strategy object (channel_priority_list, 30_day_plan, risks, KPIs):
${jstr(ctx.chosenScenarioFull, 9000)}`
    })()

    const prevTasksBlock = ctx.previousMonthlyPlan?.tasks
        ? `═══ PREVIOUS MONTH'S TASKS (do not duplicate; carry over still-relevant ones with same id) ═══
${jstr(ctx.previousMonthlyPlan.tasks.map((t: MonthlyTask) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, channel: t.channel,
    completedAt: t.completedAt, rejectedAt: t.rejectedAt,
})), 4000)}`
        : ''

    const tenantBlock = ctx.tenantState ? `═══ TENANT CLASSIFICATION ═══
Classification: ${ctx.tenantState.classification}
Reason: ${ctx.tenantState.classificationReason}
Stage modes: stage6_audit=${ctx.tenantState.recommendedMode?.stage6_audit}, stage7_gtm=${ctx.tenantState.recommendedMode?.stage7_gtm}, stage8_conv=${ctx.tenantState.recommendedMode?.stage8_conv}, stage9_plan=${ctx.tenantState.recommendedMode?.stage9_plan}
Google Ads: connected=${ctx.tenantState.signals?.googleAds?.connected}, ${ctx.tenantState.signals?.googleAds?.activeCampaignsCount} active, ${ctx.tenantState.signals?.googleAds?.last90dConversions} conv / ₪${(ctx.tenantState.signals?.googleAds?.last90dSpendIls || 0).toLocaleString()} spend in 90d
GTM: connected=${ctx.tenantState.signals?.gtm?.connected}, snippet=${ctx.tenantState.signals?.gtm?.snippetInstalledOnSite}, tags=${ctx.tenantState.signals?.gtm?.liveVersionTagCount}
GA4: connected=${ctx.tenantState.signals?.ga4?.connected}, propertyId=${ctx.tenantState.signals?.ga4?.measurementId || 'none'}
` : ''

    // Phase 4.3-N v8: month-over-month baseline delta narrative.
    // Surfaces "you were at X, now Y, delta = Z%" so Opus can reference real
    // movement in priorities + rationales. Falls back gracefully when no
    // prior baseline exists (first month → null).
    const baselineDeltaBlock = ctx.baselineDelta
        ? `\n═══ BASELINE DELTA — MONTH-OVER-MONTH PERFORMANCE ═══
Prior baseline pulled: ${ctx.baselineDelta._pulledFrom || 'unknown'}
Current baseline pulled: ${ctx.baselineDelta._pulledTo || 'unknown'}

Real movement (Google Ads account-level metrics — cite these verbatim in expectedImpact.rationale + overview.hebrew when relevant):
${(['cost', 'conversions', 'clicks', 'ctr', 'avgCpc', 'convRate', 'costPerConv'] as const)
    .map(k => {
        const d = (ctx.baselineDelta as any)[k]
        if (!d) return null
        const arrow = d.improved ? '✓' : '⚠'
        const direction = d.deltaPct > 0 ? '+' : ''
        return `  ${arrow} ${d.labelHe}: ${d.prior.toLocaleString()} → ${d.current.toLocaleString()} (${direction}${d.deltaPct.toFixed(1)}%)`
    }).filter(Boolean).join('\n')}

INSTRUCTIONS:
  · Reference this delta in overview.hebrew paragraphs ("CPA ירד מ-₪X ל-₪Y — Z% שיפור")
  · For P0 tasks that worsen vs baseline (⚠), add explicit rationale "regression vs last month"
  · For metrics that improved (✓), build on the win — propose tasks that double-down on what worked
  · Don't repeat tasks from the previous plan that produced no measurable improvement (see completedTaskOutcomes below)`
        : ''

    const completedOutcomesBlock = (ctx.completedTaskOutcomes && ctx.completedTaskOutcomes.length > 0)
        ? `\n═══ COMPLETED TASKS FROM PREVIOUS PLAN — outcomes ═══
${ctx.completedTaskOutcomes.length} tasks from last month transitioned to completed/in_progress. Use their outcomes
(if recorded) to decide what to KEEP DOING, STOP DOING, or REPLICATE for the new month:

${jstr(ctx.completedTaskOutcomes.slice(0, 20), 3000)}

INSTRUCTIONS:
  · Tasks where expectedImpact matched actualImpact (within 20%) → REPLICATE pattern in new plan
  · Tasks where actualImpact missed expectedImpact by >40% → DON'T propose similar; investigate root cause via measurement_gap task
  · Tasks with completedMethod='manual' (no integration) → next month consider proposing the INTEGRATION SETUP as P1 task so future runs can be automated`
        : ''

    // Phase 4.3-N v8: extract hard CPA ceiling for paid-task constraint block
    const maxCpa = (ctx.paidProfile as any)?.maxCpaIls
    const maxCpaBlock = (typeof maxCpa === 'number' && maxCpa > 0)
        ? `\n═══ HARD CONSTRAINT — MAX CPA (user-defined ceiling) ═══
The client has set a HARD MAX CPA of ₪${maxCpa.toLocaleString()}. This is non-
negotiable. Every paid_optimization / experiment task that touches bid strategy
MUST respect this. Specifically:
  · Any TARGET_CPA recommendation: tCPA ≤ ₪${maxCpa.toLocaleString()}
  · Any Smart Bidding migration task MUST show in its _oneLineRationale the
    expected CPA stays under this ceiling
  · If clientBaseline shows current CPA > ₪${Math.round(maxCpa * 1.2).toLocaleString()}
    (= maxCpa × 1.2), spawn a P0 emergency optimization task with rationale
    'CPA חורגת מהתקרה (₪${maxCpa.toLocaleString()})' and dependsOn the CR
    validation task
  · Brand-defense + retargeting / RT campaigns are EXEMPT (different CPA economics)
  · Never propose campaigns/tasks with expectedImpact.metric='cpa_reduction_pct'
    targeting a value that would land above the ceiling`
        : ''

    return `${tenantBlock}

═══ CLIENT ═══
Business: ${ctx.businessName}
Website: ${ctx.websiteUrl}
Description: ${(ctx.businessDesc || '').slice(0, 600)}
Trigger: ${ctx.trigger}

${scenarioBlock}
${baselineDeltaBlock}
${completedOutcomesBlock}
${maxCpaBlock}

═══ PAID PROFILE ═══
${jstr(ctx.paidProfile, 3000)}

═══ MAZHIR AUDIT (findings + recommendedActions) ═══
${jstr(ctx.audit, 9000)}

═══ MEDIA PLAN (paid optimizations + campaigns) ═══
${jstr(ctx.mediaPlan, 10000)}

═══ ORGANIC STRATEGY ═══
${jstr(ctx.strategy, 5000)}

═══ POSITIONING + PERSONAS ═══
${jstr(ctx.positioningResults, 2500)}
${jstr(ctx.audiencePersonas, 3500)}

═══ COMPETITOR LANDSCAPES ═══
Organic:
${jstr(ctx.competitorLandscape, 3000)}
Paid:
${jstr(ctx.paidCompetitorLandscape, 3000)}

═══ KEYWORD RESEARCH ═══
Paid:
${jstr(ctx.paidKeywordResearch, 4000)}
SEO:
${jstr(ctx.seoKeywordResearch, 4000)}

═══ CLIENT ACCOUNT BASELINE ═══
${jstr(ctx.clientBaseline, 4000)}

═══ PAID-DATA INVENTORY ═══
${jstr(ctx.paidDataInventory, 3000)}

═══ PAID AUDIT ═══
${jstr(ctx.paidAudit, 4500)}

═══ INTERNAL SEO AUDIT (on-page, schema, content gaps) ═══
${jstr(ctx.internalSeoAudit, 6000)}

═══ LINK AUDIT (anchor distribution, lostLinks, linkGap — CRITICAL for link tasks) ═══
${jstr(ctx.linkAudit, 9000)}

═══ AEO VISIBILITY ═══
${jstr(ctx.aeoVisibility, 4000)}

═══ STRATEGY OPTIONS (full records) ═══
${jstr(ctx.strategyOptionsAll, 4000)}

═══ BRAND BOOK (voice / USPs / banned phrases — affects every creative task) ═══
${jstr(ctx.brandBookFull, 5000)}

═══ WEEKLY OPS BRIEFS (${(ctx.opsBriefs as any[])?.length || 0} weeks history) ═══
Latest:
${jstr(ctx.latestOpsBrief, 4000)}
Recent history:
${jstr((ctx.opsBriefs as any[] || []).slice(-5).map((b: any) => ({
    weekOf: b.weekOf || b.generatedAt,
    summary: b.summary || b.overview,
    topAlerts: b.alerts?.slice?.(0, 3) || b.findings?.slice?.(0, 3),
})), 3000)}

═══ USER MARKETING INTENTS (DO NOT propose excluded channels) ═══
${jstr(ctx.marketingIntents, 1500)}

═══ INTEGRATIONS STATE ═══
${jstr(ctx.integrationsState, 2500)}

═══ AGENT INTEGRATIONS ═══
${jstr(ctx.agentIntegrations, 2000)}

═══ PAST AGENT OUTPUTS (winners/losers — ${ctx.pastAgentOutputs.length} drafts) ═══
${jstr(ctx.pastAgentOutputs.slice(0, 25).map((o: any) => ({
    id: o.id, type: o.outputType, status: o.status, agent: o.agentRole,
    title: (o.title || '').slice(0, 60), createdAt: o.createdAt,
})), 3500)}

═══ PAST HYPOTHESES ═══
${jstr(ctx.pastHypotheses, 3000)}

═══ CREATIVE PERFORMANCE + FATIGUE ═══
${jstr(ctx.creativePerformance, 2500)}
${jstr(ctx.creativeFatigueAlerts, 1500)}

═══ PAID LEARNINGS / STRATEGY LEARNINGS ═══
${jstr(ctx.paidLearnings, 2500)}
${jstr(ctx.strategyLearnings, 2500)}

═══ EXISTING CONTENT PLAN ═══
${jstr(ctx.contentPlan, 4500)}

${prevTasksBlock}

═══ 2026 SEO/AEO RESEARCH (ranking signals + AI Overview citation patterns) ═══
${ctx.seoResearch2026 || '(2026 research not available)'}

═══ YOUR TASK — PRODUCE SKELETON-ONLY JSON ═══

This is PASS 1 of 3. Your job: decide WHAT belongs in the month + WHEN.
Pass 2 will elaborate sources + actionPlan + creative briefs. Pass 3 will
deterministically backfill any senior-bar rule you missed.

Produce 50-70 task placeholders. Each task has ONLY these 15 fields. NO
sources, NO actionPlan, NO creative copy. Keep titles + summaries Hebrew-
compact (title ≤80 chars, summary ≤140 chars, rationale ≤120 chars).

REQUIRED COVERAGE (skeleton must include at least one task for each):
  · Every entry in mediaPlan.campaignOptimizations[].changes[] → wrap as paid_optimization task (set mediaPlanOptIndex)
  · Every audit.recommendedActions.immediate/shortTerm/ongoing → P0/P1/P2 task
  · Every GSC striking-distance query (pos 4-15, vol>20) → content/website task
  · Every chosenScenario.channel_priority_list entry → 1-3 tasks operationalizing it
  · Every persona in audience_personas → ≥1 persona-targeted task (Pass 2 adds creative)
  · 3 RSA variant tasks if paid_search active: A) price-anchor B) urgency C) trust
  · BOFU comparison page vs primary competitor (named in competitorLandscape)
  · CR validation task (P0 measurement_gap) + every tCPA/Smart Bidding task lists it in dependsOn
  · Senior bar rules: competitive intel monitor, CRO audit, retention/LTV (if recurring revenue),
    mobile-first, data warehouse / Customer Match, decision rules, email lead nurture
  · linkAudit-driven tasks (mandatory when data present):
      - if anchor_distribution.exact_match_pct ≥ 50 → anchor diversification task
      - per linkGap top-5 prospect → outreach task
      - per lostLinks top-5 → recovery task
      - if referring_domains_total < 50 and scenario=smart → linkable asset creation task
      - link acquisition tasks calibrated to chosenScenario (Smart=2-3, Aggressive=5-8/month)
  · MANDATORY channel minimums per chosenScenario (skip a channel ONLY if in do_not_channels):
      google_ads ≥8, seo ≥4, content ≥3, gbp ≥2, meta ≥2 (or "connect Meta" P1), gtm/ga4 as needed

DEDUPE: do NOT re-propose tasks already proposed/skipped/approved/in_progress in previousMonthlyPlan.
Carry them over with same id when still relevant.

JSON STRICTNESS:
  · DOUBLE-quoted strings only. Use 'word' (single quotes) for emphasis INSIDE strings.
  · NO embedded JSON arrays inside string values.
  · NO literal newlines inside strings (use \\n).
  · No trailing commas.
  · ₪ symbol, not ש"ח.

Output STRICT JSON. No markdown fences. No commentary. Schema:

{
  "overview": {
    "hebrew": "<6-8 paragraph Hebrew narrative — 1 paragraph PER ACTIVE CHANNEL — sequenced, conversational, no bullet points, 60-150 words each>",
    "keyTheme": "<1-line Hebrew headline>",
    "focusAreas": ["<3-5 Hebrew bullets>"]
  },
  "tasks": [
    {
      "id": "<tsk_xxxxxxxxxx or omit>",
      "type": "<paid_optimization|content_creation|landing_page|tracking_setup|audience_expansion|keyword_expansion|cross_channel_amplification|website_change|creative_refresh|measurement_gap|experiment|other>",
      "title": "<Hebrew ≤80 chars>",
      "summary": "<Hebrew 1 sentence ≤140 chars>",
      "channel": "<google_ads|meta|seo|content|gtm|ga4|website|gbp|whatsapp|email|cross>",
      "priority": "<P0|P1|P2>",
      "estimatedEffort": "<15_min|30_min|1_hour|2_3_hours|1_day|2_3_days|1_week>",
      "scheduledFor": "<YYYY-MM-DD within next 30d — P0 week1-2, P1 week2-3, P2 week3-4; respect dependsOn ordering; skip Fri+Sat>",
      "weekOfMonth": <1|2|3|4>,
      "dependsOn": ["<other tsk_ids or empty>"],
      "expectedImpactMetric": "<conversions|cpa_reduction_pct|spend_savings_ils|ctr_pct|ranking_position|organic_traffic_pct|leads_per_month|roas_pct|qs_points|other>",
      "expectedImpactValue": <number>,
      "expectedImpactHorizon": "<7d|14d|30d|60d|90d>",
      "expectedImpactConfidence": "<high|medium|low>",
      "_oneLineRationale": "<Hebrew ≤120 chars — WHY this task exists, anchored on one specific data point>",
      "mediaPlanOptIndex": <number if wrapping mediaPlan.campaignOptimizations[i]>,
      "contentPlanItemId": "<string if wrapping contentPlan.items[i].id>",
      "paidHypothesisId": "<string if wrapping a paid_hypothesis>"
    }
  ],
  "qualityWarnings": ["<concerns about data freshness or missing inputs>"]
}

Return ONLY the JSON.`
}

const SKELETON_SYSTEM = `You are the senior strategic marketing director for an Israeli SMB AI marketing platform (ClawFlow). This is PASS 1 of a 3-pass monthly plan pipeline — your job is to decide WHAT belongs in the month and WHEN, NOT how it gets executed.

═══ HARD POLICY (NON-NEGOTIABLE) ═══

1. Human-in-the-loop — every task is approval-gated. The user decides; we propose.
2. Read-only verifications are NEVER user tasks — they're auto pre-check steps inside other tasks. If a task description sounds like "verify X", "check Y", "audit current state of Z" — it's auto, not a user task. Type 'measurement_gap' is reserved for setting up NEW tracking infrastructure.
3. Atomic — 1 task = 1 atomic action. "Add 23 negatives" is ONE task. "Switch bid strategy" is ANOTHER. "Publish 5 city LPs" → 5 separate tasks.
4. Link budgets — read chosenScenario + cost_timeline_modeling VERBATIM. Never invent.
5. Hebrew for all user-facing strings (title / summary / overview.hebrew / focusAreas / _oneLineRationale). English technical terms (campaign, schema, RSA, CPA, GTM) get HEBREW inline expansions on first occurrence — see standards below.

═══ HEBREW UX STANDARDS ═══

Forbidden English (in user-facing strings): CPA, RSA, tCPA, INP, CWV, GTM, GA4, AEO, SEO, FAQPage, schema, pixel, Smart Bidding, remarketing, retargeting, audience, conversion, attribution, indexation, ranking, carousel, reel, headline, description, pillar, spoke, hub, static_value_pollution, striking distance, anchor (in SEO link context), micro-conversion, branded search, generic search, long-tail, head term, geo-targeting, dayparting, Customer Match, lookalike, refresh, audit, baseline, snapshot.

ARROWS in keyTheme / focusAreas / overview.hebrew — DO NOT use → (RIGHTWARDS ARROW). In RTL the visual flow is right-to-left, so "→" reads backward. Use one of:
  · middot " · " (e.g. "תיקון מעקב · ייצוב הצעות · תקיפה")
  · LEFTWARDS ARROW "←" if explicit sequence is required (e.g. "תיקון מעקב ← ייצוב הצעות")
  · numbered list (e.g. "(1) תיקון מעקב, (2) ייצוב, (3) תקיפה")

Hebrew replacements WITH inline explanation (first occurrence only):
  CPA → "עלות לליד (CPA)"
  tCPA → "אסטרטגיית הצעות מבוססת יעד עלות לליד (tCPA)"
  RSA → "מודעת חיפוש מותאמת (RSA)"
  INP → "זמן התגובה לאינטראקציה (INP)"
  CWV → "אותות חוויית משתמש בליבה (Core Web Vitals)"
  GTM → "מנהל התגיות של גוגל (GTM)"
  GA4 → "Google Analytics 4 (GA4)"
  AEO → "אופטימיזציה למענה (AEO)"
  FAQPage → "סכמת שאלות נפוצות (FAQPage)"
  schema → "סכמה" / "תיוג מובנה"
  pixel → "פיקסל מעקב"
  Smart Bidding → "הצעות חכמות"
  remarketing/retargeting → "פנייה חוזרת לגולשים"
  audience → "קהל יעד"
  conversion → "המרה" / "פעולת ערך"
  attribution → "ייחוס"
  pillar → "דף עוגן"
  spoke → "דף נושא משני"
  carousel → "קרוסלת תמונות"
  reel → "סרטון קצר (Reel)"
  static_value_pollution → "זיהום ערך סטטי (סימון ערך קבוע במקום ערך עסקה אמיתי)"
  striking distance → "מרחק תקיפה (מילים במיקום ממוצע 4-15 שניתן לפרוץ מהן לעמוד 1)"
  anchor (SEO link context) → "טקסט עוגן" (השאירו pillar → "דף עוגן" ללא שינוי — שני מושגים נפרדים)
  micro-conversion → "המרת ביניים"
  branded search → "חיפוש מותגי"
  generic search → "חיפוש גנרי"
  long-tail → "מילים ארוכות זנב"
  head term → "מילה ראשית"
  geo-targeting → "מיקוד גיאוגרפי"
  dayparting → "התאמת שעות פעילות"
  Customer Match → "התאמת לקוחות (Customer Match)"
  lookalike → "קהל דומה (Lookalike)"
  refresh → "רענון"
  audit → "סקירה" / "אודיט (סקירת חשבון)"
  baseline → "בסיס" / "מצב הבסיס"
  snapshot → "תמונת מצב"

Use 2nd person plural (אתם/לכם/תוכלו) or impersonal infinitive — never 2nd person singular.

═══ STATE-RECONCILIATION (avoid stale audit findings) ═══

The mazhirAudit may pre-date the user resolving things via UI pickers (GTM target,
GA4 property, conversion mapping). For each audit.blockers[]:
  · "GTM mismatch / not connected" — IF tenantState.signals.gtm.targetPicked AND snippetInstalledOnSite AND hasLiveVersion → STALE, do NOT propose "fix GTM". Note in qualityWarnings.
  · "GA4 not connected" — IF signals.ga4.connected AND measurementId → STALE, skip.
  · "0 Mazhir conversion signals" — IF signals.googleAds.existingConversionActions has mapped items → STALE.
  · "Campaign suspended" — IF signals.googleAds.activeCampaignsCount > 0 → STALE.

═══ BACKLINK AUDIT GATE ═══

DO NOT propose specific external directories (B144, Zap, Dapei Zahav, etc.) or
outreach targets WITHOUT first checking linkAudit data:
  · If linkAudit has referring_domains list → cross-reference proposed directories;
    skip any already linked
  · If NO backlink data → propose 1 P0 prerequisite "backlink audit pre-check" task,
    and downstream link tasks dependsOn it
  · Per chosenScenario.cost_timeline backlink_acquisition: Smart = 2-3 mid-DR
    links/month (~₪400-500/link, ₪1K total); Aggressive = 5-8 multi-tier links/month
    (~₪3K total). Never invent new link budgets.

═══ SENIOR AGENCY BAR (all 10 must appear in the skeleton, as standalone tasks) ═══

1. CR validation precedes Smart Bidding migration — P0 measurement_gap task that
   audits current Google Ads conversion definitions + funnel from click → form
   → qualified-lead. Every tCPA/Smart-Bidding task MUST list it in dependsOn[].
2. Creative diversity — 3 separate RSA variant tasks: A) price-first B) urgency
   C) trust signals. NOT one bundled "RSA refresh".
3. Funnel-stage coverage — TOFU/MOFU/BOFU. BOFU MUST include comparison page vs
   primary competitor (use name from competitorLandscape).
4. Competitive intelligence monitor — weekly scan of Transparency Center +
   Wayback + backlink alerts for top 3 competitors. Reaction window 24-48h.
5. Conversion path / CRO audit — form fields, WhatsApp button placement, trust
   signal proximity, mobile speed. Heatmap + session recording + form abandonment.
6. Retention / LTV — if business is recurring (storage / SaaS / subscription / repeat-
   purchase services): 1+ task for cross-sell / reactivation / referral.
7. Mobile-first — click-to-call, WhatsApp Business automation with lead-qualification
   flow, mobile LP variants. At least 1 dedicated mobile task.
8. Data warehouse / Customer Match — GA4 → BigQuery export AND/OR first-party
   hashed-data upload to Google Ads Customer Match for lookalike expansion.
9. Decision rules / replan triggers — explicit thresholds: "CPA >40% above
   baseline for 14d → emergency replan", "ranking drop >5 positions → incident
   response", "traffic -20% WoW → root-cause investigation". Can be standalone
   task OR documented in qualityWarnings.
10. Email lead nurture sequence — if primary persona has 2+ week research cycle
    (moving, weddings, renovation, B2B): lead-magnet + 3-5 email sequence task.

═══ DEPTH (skeleton quantity bar) ═══

Target 50-70 tasks. Under 40 = under-tasking (10 sub-agents idle). Spread by channel:
  google_ads ≥8, seo ≥4, content ≥3, gbp ≥2, meta ≥2, gtm/ga4 ≥1, website ≥2,
  link_acquisition matches chosenScenario (Smart 2-3, Aggressive 5-8),
  experiment type ≥2 (explicit hypotheses).

═══ COMPACTNESS (CRITICAL — token budget for 50-70 tasks is ~10K total) ═══

  · title ≤80 Hebrew chars
  · summary ≤140 chars, 1 sentence
  · _oneLineRationale ≤120 chars, anchored on ONE specific data point
  · No prose narration. Every word earns its place.

═══ FORBIDDEN ═══

  · Read-only verification/status-check tasks as user approvals (those are auto)
  · Inventing link/paid budgets without chosenScenario cite
  · Generic titles ("אופטימיזציה כללית", "שיפור CTR") — must be specific
  · Bundling unrelated changes
  · Recommending deprecated integrations (Twenty CRM)

═══ NARRATIVE OVERVIEW STANDARDS ═══

overview.hebrew is NOT a 3-sentence abstract. It's a 6-8 paragraph plan-as-story:
ONE paragraph PER ACTIVE CHANNEL we're activating, conversational, sequenced.

Template per channel:
  SEO/אורגני: "קודם נכוון פנימה — נשפר את [page] כי יש לה כבר [N impressions ב-position P].
  אחרי שהבסיס יציב, נבנה [M dedicated pages]... רק כשהכל מוכן פנים האתר, נצא לבניית סמכות חיצונית..."

  פרסום ממומן: "הצעד הראשון לעצור את הבזבוז — ₪X הולכים לחיפושים לא רלוונטיים על [terms].
  אחרי שנוסיף שליליים נעבור מ-[strategy A] ל-[strategy B] כי שיעור ההמרה הנוכחי [CR%] מצדיק..."

  Tone: clear, plain, conversational — senior marketer briefing the founder.
  No bullet points inside overview.hebrew — paragraph prose only. 60-150 Hebrew
  words per paragraph.

═══ JSON STRICTNESS ═══

  · Output VALID JSON parseable by JSON.parse()
  · DOUBLE-quote JSON delimiters. SINGLE-quote ('word') for emphasis inside strings
    RIGHT: "summary": "להוסיף 23 שליליים 'חינם', 'DIY', 'cloud storage'"
    WRONG: "summary": "להוסיף 23 שליליים "חינם", "DIY""   ← breaks JSON
  · NO embedded JSON arrays/objects inside string values
  · NO literal newlines inside strings (use \\n)
  · No trailing commas, no comments
  · ₪ symbol, not ש"ח
  · NO markdown fences, NO commentary before/after — output starts with '{' and ends with '}'`

export async function generateSkeleton(
    ctx: PromptCtx,
    apiKey: string,
    model = 'claude-opus-4-7',
): Promise<{ skeleton: SkeletonOutput; rawLength: number }> {
    const userPrompt = buildSkeletonUserPrompt(ctx)
    const { withHebrewStyleGuide } = await import('./hebrewStyleGuide')
    const fullSystem = withHebrewStyleGuide(SKELETON_SYSTEM)
    console.log(`[monthlyPlanSkeleton] starting Pass 1 (model=${model}, prompt=${fullSystem.length + userPrompt.length} chars, scenario=${ctx.chosenScenarioKey})`)
    const raw = await callOpusStream({
        label: 'monthlyPlanSkeleton',
        apiKey, model,
        system: fullSystem,
        user: userPrompt,
        maxTokens: 32000,    // Phase 2026.02 Block 6: 16K hit `stop=max_tokens` truncation on
                             // 46-task aggressive-scenario skeletons (29K char raw → JSON unterminated).
                             // 32K leaves headroom; Opus 4.7 supports up to 64K output.
        timeoutMs: 900000,   // 15 min — pass 1 typically 3-6 min on Opus 4.7
    })
    let parsed: SkeletonOutput
    try {
        parsed = extractLlmJson<SkeletonOutput>(raw, 'monthlyPlanSkeleton')
    } catch (err) {
        try {
            const fs = await import('node:fs/promises')
            const dumpPath = `/tmp/monthly_plan_skeleton_raw_${Date.now()}.txt`
            await fs.writeFile(dumpPath, raw, 'utf-8')
            console.error(`[monthlyPlanSkeleton] PARSE FAIL — raw dumped to ${dumpPath} (${raw.length} chars)`)
        } catch { /* best-effort */ }
        throw err
    }
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
        throw new Error(`monthlyPlanSkeleton: Pass 1 returned no tasks (raw len=${raw.length})`)
    }
    console.log(`[monthlyPlanSkeleton] Pass 1 done: ${parsed.tasks.length} skeletons, keyTheme="${(parsed.overview?.keyTheme || '').slice(0, 60)}"`)
    return { skeleton: parsed, rawLength: raw.length }
}

export type { SkeletonOutput }