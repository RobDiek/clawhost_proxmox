/**
 * Phase 4.3-N v8 — Pass 2: Per-Batch Task Elaboration.
 *
 * Goal: for each skeleton from Pass 1, generate full sources + actionPlan +
 * expectedImpact.rationale + creative briefs. Parallelize across batches
 * grouped by channel for cohesion + bounded per-call output (≤6 tasks * ~3K
 * tokens/task = ~18K, well under the 32K cap).
 *
 * Why batching: Pass 1 decided WHAT (50-70 tasks). Pass 2 expands HOW. The
 * 32K output cap can't hold all detail for 70 tasks in one call (we'd need
 * ~150-200K). Splitting into channel-cohesive batches lets each batch focus
 * on a narrow context (paid for google_ads batches, GSC/linkAudit for seo
 * batches, etc.) and stay well under the cap.
 *
 * Parallelism: 5 concurrent Opus calls. Anthropic Tier-3+ accounts handle
 * this comfortably. If we hit 429 we fall back to sequential per-batch.
 *
 * Failure isolation: if a batch fails, OTHER batches still produce. Failed
 * batch's skeletons retain skeleton-only fields with a placeholder source.
 * Pass 3 will then upgrade those that match senior-bar rules.
 */

import type { PromptCtx } from './monthlyPlanGenerator'
import type { TaskSkeleton } from './monthlyPlanSkeleton'
import { callOpusStream } from './llmStream'
import { extractLlmJson } from './llmJson'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

interface BatchOutput {
    tasks: Array<Partial<MonthlyTask> & { id: string }>
}

interface BatchSpec {
    label: string                     // "paid", "seo-content", "gtm-ga4", etc.
    channels: MonthlyTask['channel'][] // which channels this batch covers
    skeletons: TaskSkeleton[]         // tasks to elaborate (max 6)
}

const MAX_TASKS_PER_BATCH = 6
const MAX_CONCURRENT_BATCHES = 5
const BATCH_MAX_TOKENS = 20000        // ~3.3K per task ceiling, plenty for creative briefs
const BATCH_TIMEOUT_MS = 900000       // 15 min per batch

function jstr(obj: any, max = 4000): string {
    if (obj == null) return '(not available)'
    try {
        const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
        if (s.length <= max) return s
        return s.slice(0, max) + `\n… [truncated; original was ${s.length} chars]`
    } catch { return '(unserializable)' }
}

// ─── Batch planning ───────────────────────────────────────────────────────
function planBatches(skeletons: TaskSkeleton[]): BatchSpec[] {
    // Group by channel for cohesion. Within each channel, chunk into ≤6.
    // For cross-channel skeletons (channel='cross'), bucket them last and
    // distribute across batches.
    const byChannel: Record<string, TaskSkeleton[]> = {}
    for (const s of skeletons) {
        const ch = s.channel || 'cross'
        if (!byChannel[ch]) byChannel[ch] = []
        byChannel[ch].push(s)
    }

    const batches: BatchSpec[] = []
    for (const [channel, list] of Object.entries(byChannel)) {
        for (let i = 0; i < list.length; i += MAX_TASKS_PER_BATCH) {
            const chunk = list.slice(i, i + MAX_TASKS_PER_BATCH)
            batches.push({
                label: `${channel}${list.length > MAX_TASKS_PER_BATCH ? `-p${Math.floor(i / MAX_TASKS_PER_BATCH) + 1}` : ''}`,
                channels: [channel as MonthlyTask['channel']],
                skeletons: chunk,
            })
        }
    }
    return batches
}

// ─── Channel-specific context extraction ──────────────────────────────────
function buildChannelContextBlock(ctx: PromptCtx, channels: MonthlyTask['channel'][]): string {
    const wantPaid = channels.some(c => c === 'google_ads' || c === 'meta')
    const wantOrganic = channels.some(c => c === 'seo' || c === 'content')
    const wantTracking = channels.some(c => c === 'gtm' || c === 'ga4')
    const wantWebsite = channels.includes('website')
    const wantGbp = channels.includes('gbp')
    const wantWhatsapp = channels.includes('whatsapp')
    const wantEmail = channels.includes('email')
    const wantCross = channels.includes('cross') || channels.length > 2

    const parts: string[] = []

    // Always include — every batch needs brand voice + scenario + audit highlights
    parts.push(`═══ BRAND BOOK (voice / USPs / banned phrases / vocabulary — every creative MUST follow) ═══
${jstr(ctx.brandBookFull, 5000)}`)

    parts.push(`═══ CHOSEN SCENARIO (budgets calibrated — never invent) ═══
${ctx.chosenScenarioKey || '(none)'}
${jstr(ctx.chosenScenarioFull, 7000)}`)

    parts.push(`═══ AUDIT HIGHLIGHTS (recommendedActions + blockers — every source.excerpt must cite real numbers) ═══
${jstr(ctx.audit, 7000)}`)

    if (wantPaid) {
        // Phase 4.3-N v8: surface the user-defined max CPA ceiling as a HARD constraint
        // in every paid batch — every actionPlan + expectedImpact must respect it.
        const maxCpa = (ctx.paidProfile as any)?.maxCpaIls
        if (typeof maxCpa === 'number' && maxCpa > 0) {
            parts.push(`═══ HARD CONSTRAINT — MAX CPA = ₪${maxCpa.toLocaleString()} ═══
This is a USER-DEFINED CEILING. Every paid_optimization / experiment task you
elaborate MUST:
  · For TARGET_CPA campaigns: explicitly state in an actionPlan step that
    tCPA is set to ≤ ₪${maxCpa.toLocaleString()}
  · For Smart Bidding migration: expectedImpact.rationale MUST show the math
    (e.g. 'current CPA ₪X → target ₪${maxCpa.toLocaleString()} = -Y% reduction')
  · If skeleton is for an emergency P0 because current CPA exceeds the ceiling:
    actionPlan step 1 MUST be 'pause/throttle campaign X spending ₪Y over CPA
    ceiling' before any optimization attempt
  · Source citation: include paidProfile.maxCpaIls reference (type='other',
    ref='paidProfile.maxCpaIls', excerpt='תקרת CPA: ₪${maxCpa.toLocaleString()}')
  · Brand-defense + retargeting campaigns are exempt — note this in actionPlan`)
        }
        parts.push(`═══ MEDIA PLAN (paid optimizations — every changes[] entry should already have a wrapping skeleton task) ═══
${jstr(ctx.mediaPlan, 10000)}`)
        parts.push(`═══ PAID KEYWORDS + COMPETITOR LANDSCAPE ═══
${jstr(ctx.paidKeywordResearch, 5000)}
${jstr(ctx.paidCompetitorLandscape, 4000)}`)
        parts.push(`═══ CLIENT ACCOUNT BASELINE (real 90d metrics) ═══
${jstr(ctx.clientBaseline, 5000)}`)
        parts.push(`═══ PAID AUDIT + PAID-DATA INVENTORY ═══
${jstr(ctx.paidAudit, 4500)}
${jstr(ctx.paidDataInventory, 3000)}`)
        parts.push(`═══ PAID LEARNINGS + CREATIVE FATIGUE ═══
${jstr(ctx.paidLearnings, 3000)}
${jstr(ctx.creativeFatigueAlerts, 2500)}`)
    }

    if (wantOrganic) {
        parts.push(`═══ INTERNAL SEO AUDIT (on-page / schema / content gaps) ═══
${jstr(ctx.internalSeoAudit, 6500)}`)
        parts.push(`═══ LINK AUDIT (anchor distribution / linkGap / lostLinks — use REAL excerpts) ═══
${jstr(ctx.linkAudit, 9000)}`)
        parts.push(`═══ AEO VISIBILITY (AI Overview presence + brand-mention gap) ═══
${jstr(ctx.aeoVisibility, 4500)}`)
        parts.push(`═══ SEO KEYWORDS + COMPETITOR LANDSCAPE ═══
${jstr(ctx.seoKeywordResearch, 5000)}
${jstr(ctx.competitorLandscape, 4000)}`)
        parts.push(`═══ EXISTING CONTENT PLAN (cross-reference contentPlanItemId) ═══
${jstr(ctx.contentPlan, 5000)}`)
    }

    if (wantTracking) {
        parts.push(`═══ TENANT STATE (tracking signals) ═══
classification=${ctx.tenantState?.classification}
GTM: ${jstr(ctx.tenantState?.signals?.gtm, 1500)}
GA4: ${jstr(ctx.tenantState?.signals?.ga4, 1500)}
Google Ads: ${jstr(ctx.tenantState?.signals?.googleAds, 2000)}`)
        parts.push(`═══ INTEGRATIONS STATE ═══
${jstr(ctx.integrationsState, 2500)}`)
    }

    if (wantWebsite) {
        parts.push(`═══ INTERNAL SEO AUDIT (structure / schema / CWV findings) ═══
${jstr(ctx.internalSeoAudit, 5500)}`)
    }

    if (wantGbp || wantWhatsapp || wantEmail || wantCross) {
        parts.push(`═══ AUDIENCE PERSONAS + POSITIONING ═══
${jstr(ctx.audiencePersonas, 4500)}
${jstr(ctx.positioningResults, 2500)}`)
    }

    // Always — past behaviour helps de-duplicate
    parts.push(`═══ PAST OUTPUTS (winners/losers — avoid duplicating) ═══
${jstr(ctx.pastAgentOutputs.slice(0, 15).map((o: any) => ({
    id: o.id, type: o.outputType, status: o.status, title: (o.title || '').slice(0, 60),
})), 3000)}`)

    parts.push(`═══ PAST HYPOTHESES ═══
${jstr(ctx.pastHypotheses, 2500)}`)

    parts.push(`═══ LATEST OPS BRIEF (this-week performance) ═══
${jstr(ctx.latestOpsBrief, 3500)}`)

    // Always include 2026 research — affects every creative + tracking task
    parts.push(`═══ 2026 SEO/AEO RESEARCH (ranking signals + AI Overview citation patterns) ═══
${(ctx.seoResearch2026 || '').slice(0, 18000)}`)

    return parts.join('\n\n')
}

function buildBatchUserPrompt(ctx: PromptCtx, batch: BatchSpec): string {
    const channelContext = buildChannelContextBlock(ctx, batch.channels)
    const skeletonsBlock = batch.skeletons.map(s => ({
        id: s.id,
        type: s.type,
        title: s.title,
        summary: s.summary,
        channel: s.channel,
        priority: s.priority,
        estimatedEffort: s.estimatedEffort,
        scheduledFor: s.scheduledFor,
        weekOfMonth: s.weekOfMonth,
        dependsOn: s.dependsOn,
        expectedImpactMetric: s.expectedImpactMetric,
        expectedImpactValue: s.expectedImpactValue,
        expectedImpactHorizon: s.expectedImpactHorizon,
        expectedImpactConfidence: s.expectedImpactConfidence,
        _oneLineRationale: s._oneLineRationale,
        mediaPlanOptIndex: s.mediaPlanOptIndex,
        contentPlanItemId: s.contentPlanItemId,
        paidHypothesisId: s.paidHypothesisId,
    }))

    return `═══ BATCH: ${batch.label} (${batch.skeletons.length} tasks to elaborate) ═══

This is PASS 2 of 3. Pass 1 already decided WHAT belongs in the month. Your job
NOW is to elaborate EACH of the ${batch.skeletons.length} skeleton tasks below
with full sources + actionPlan + creative briefs.

DO NOT add new tasks, DO NOT change any task's id/type/channel/priority/scheduledFor.
ONLY add the missing detail fields. Pass 3 will add new tasks if a senior-bar
rule is missing.

═══ CLIENT ═══
Business: ${ctx.businessName}
Website: ${ctx.websiteUrl}
Description: ${(ctx.businessDesc || '').slice(0, 600)}

${channelContext}

═══ THE ${batch.skeletons.length} TASKS TO ELABORATE ═══

${JSON.stringify(skeletonsBlock, null, 2)}

═══ YOUR JOB ═══

For each skeleton above, produce the elaborated task with these fields:
  · id: SAME as skeleton (copy verbatim — used to merge)
  · sources: ≥3 entries (target 4-6). Each excerpt = real number/quote from the
    upstream evidence above. Mix types (audit.recommendedActions.X, gsc.queries,
    dfs.keywords, ga4.event, strategy.persona, contentPlan.gap, sqr.waste,
    aucIns.opportunity, transparency.competitor, paidHypothesis, mediaPlan.optimization,
    chosenScenario.{first_win,channel_priority_list,risks,30_day_plan}, etc.).
    NEVER write "see audit" — quote the SPECIFIC finding.
  · actionPlan: 5-8 ordered steps. Last step MUST be monitoring/verification with
    metric + days + kill threshold. Each step:
      { step: '<Hebrew, ≤120 chars>', automated: <true|false>, estimatedMinutes: <N> }
    For automated:true — name the adapter exactly ('google_ads_mutate.add_negatives',
    'wordpress_publish_draft', 'github_create_pr', 'gtm_mutate.create_tag',
    'mazhir_gtm_auto_setup', 'mazhir_conv_setup', 'content_plan_v4_enqueue',
    'gbp_post_create') with specific resource targets.
    For automated:false — exact user instructions (open URL X → fill Y with Z →
    click K → screenshot).
  · expectedImpact: full nested object — same metric/value/horizon/confidence
    from skeleton flat fields, PLUS rationale (Hebrew, 1 sentence, anchored on
    ONE specific data point — e.g. "audit.wasteAnalysis.topWasteTerms[0]: 'מכולה'
    ₪613/33 קליקים/0 conv → הסרה צפויה להחזיר ₪600/חודש").

═══ CREATIVE BRIEFS (mandatory per task type, bundled into actionPlan steps) ═══

  · Meta tasks → 1 step lists FORMAT (single_image / carousel 3-5 cards / reel
    hook+15s-script / story). Per-persona variants: separate task per persona
    with persona-specific Hebrew copy.
  · Google Ads RSA tasks → 1 step provides the actual headlines (15, ≤30 chars
    each) + descriptions (4, ≤90 chars each) in real Hebrew, per the variant
    angle (price / urgency / trust).
  · Content / landing-page tasks → 1 step provides H1 + 8-12 H2 outline + intro
    hook + 15+ entities + 4-6 FAQ items (40-60 word Hebrew answers) + CTA copy.
  · GBP post tasks → full Hebrew copy + image brief + CTA.
  · Display creative tasks → image brief (composition + colors + text overlay).
  · YouTube/Video → 6-sec bumper OR 15-sec in-stream script (hook + value prop + CTA).
  · Experiment tasks (type='experiment') → 1 step lists hypothesis (if change X
    then metric Y moves by Z within W days), success criteria, decision rule
    (kill if <X / iterate if X-Y / scale if >Y), sample size, duration.

═══ HEBREW UX STANDARDS ═══

ALL user-facing strings (sources.excerpt / actionPlan.step text / expectedImpact.rationale)
in Hebrew, 2nd person plural (אתם/לכם/תוכלו) or impersonal infinitive. English jargon
expanded inline on first use: CPA → "עלות לליד (CPA)", RSA → "מודעת חיפוש מותאמת (RSA)",
GTM → "מנהל התגיות של גוגל (GTM)", schema → "סכמה / תיוג מובנה", etc.

Inside actionPlan adapter names (e.g. 'google_ads_mutate.add_negatives') English is OK
— it's a system identifier — but the human-readable preamble around it must be Hebrew.

═══ JSON STRICTNESS ═══

  · DOUBLE-quote JSON. SINGLE-quote 'word' for emphasis inside strings.
  · NO embedded JSON arrays inside string values.
  · NO literal newlines inside strings (use \\n).
  · No trailing commas, no comments, no markdown fences.
  · ₪ symbol, not ש"ח.

Output STRICT JSON. Schema:

{
  "tasks": [
    {
      "id": "<verbatim from skeleton>",
      "expectedImpact": {
        "metric": "<from skeleton.expectedImpactMetric>",
        "value": <from skeleton.expectedImpactValue>,
        "horizon": "<from skeleton.expectedImpactHorizon>",
        "confidence": "<from skeleton.expectedImpactConfidence>",
        "rationale": "<Hebrew ≤120 chars anchored on ONE data point>"
      },
      "sources": [
        { "type": "<see schema below>", "ref": "<concrete pointer>", "excerpt": "<Hebrew real-number quote ≤100 chars>" }
      ],
      "actionPlan": [
        { "step": "<Hebrew ≤120 chars>", "automated": <true|false>, "estimatedMinutes": <N> }
      ]
    }
  ]
}

Source type vocabulary (use these exact strings):
  mediaPlan.optimization | mediaPlan.campaign
  audit.recommendedActions.immediate | audit.recommendedActions.shortTerm | audit.recommendedActions.ongoing
  audit.existingAccountAudit.topRecommendations | audit.industrySignals
  gsc.queries | gsc.pages
  dfs.keywords
  ga4.event | ga4.funnel | ga4.demographics | ga4.seasonality
  strategy.positioning | strategy.persona | strategy.intent_ladder
  contentPlan.gap | contentPlan.item
  sqr.waste | aucIns.opportunity | changeHistory.gap
  transparency.competitor
  paidHypothesis | other

Return ONLY the JSON. No markdown fences. No preamble.`
}

const DETAILER_SYSTEM = `You are the senior strategic marketing director for an Israeli SMB AI marketing platform (ClawFlow). This is PASS 2 of a 3-pass monthly plan pipeline — your job is to ELABORATE skeleton tasks already decided in Pass 1.

DO NOT add new tasks. DO NOT remove tasks. DO NOT change ids / types / channels / priorities / scheduledFor / weekOfMonth. ONLY produce the elaboration fields: sources[], actionPlan[], expectedImpact.rationale.

═══ HARD POLICY ═══

1. Human-in-the-loop — every task is approval-gated. The user decides.
2. Read-only verifications are NEVER user tasks — they're auto pre-check steps inside other tasks' actionPlan.
3. Source citation MANDATORY — ≥3 sources per task (target 4-6), each excerpt = real number/quote (not "see audit"). Mix source types.
4. ActionPlan: 5-8 ordered steps. Last step = monitoring/verification with explicit metric + horizon + kill threshold.
5. Link budgets — chosenScenario VERBATIM (Smart 2-3 mid-DR links ~₪1K/mo; Aggressive 5-8 multi-tier ~₪3K/mo). Never invent.
6. Hebrew strings — 2nd person plural (אתם/לכם/תוכלו) or impersonal infinitive. English technical terms expanded inline on first occurrence.

═══ HEBREW UX STANDARDS ═══

Forbidden English in user-facing strings:
  CPA, RSA, tCPA, INP, CWV, GTM, GA4, AEO, SEO, FAQPage, schema, pixel, Smart Bidding,
  remarketing, retargeting, audience, conversion, attribution, indexation, ranking,
  carousel, reel, headline, description, pillar, spoke, hub.

Hebrew replacements (inline expansion on first use):
  CPA → "עלות לליד (CPA)"
  tCPA → "אסטרטגיית הצעות מבוססת יעד עלות לליד (tCPA)"
  RSA → "מודעת חיפוש מותאמת (RSA)"
  GTM → "מנהל התגיות של גוגל (GTM)"
  schema → "סכמה / תיוג מובנה"
  Smart Bidding → "הצעות חכמות"
  remarketing → "פנייה חוזרת לגולשים"
  conversion → "המרה / פעולת ערך"
  pillar → "דף עוגן"
  spoke → "דף נושא משני"
  carousel → "קרוסלת תמונות"
  reel → "סרטון קצר (Reel)"

═══ BACKLINK AUDIT GATE ═══

When elaborating link-acquisition tasks: cross-reference linkAudit.referringDomains
before naming a specific directory (B144, Zap, Dapei Zahav, etc.). NEVER recommend
a directory already present. If no backlink data → tasks should depend on a
"backlink audit pre-check" task (skeleton should already have one — if missing,
add to qualityWarnings).

═══ STATE-RECONCILIATION ═══

Audit findings may pre-date user resolving things via UI pickers. When sourcing
from audit.blockers, cross-check tenantState:
  · GTM connected + snippet on site + live version → don't cite as a blocker
  · GA4 connected + measurementId picked → don't cite as a blocker
  · Mazhir conversions mapped → don't cite "0 conversion signals" as a blocker
  · Active campaigns > 0 → don't cite "campaign suspended"

═══ DEPTH ═══

Quality bar = top digital agency (Wpromote / Tinuiti / iProspect). Per task:
  · ≥3 sources, target 4-6, with real numbers/quotes
  · 5-8 actionPlan steps with concrete adapter names + specific resource targets
    + estimatedMinutes per step
  · Hebrew creative copy embedded in actionPlan for creative-bearing channels
    (Meta carousel cards, RSA headlines, GBP post copy, FAQ items, etc.)
  · Last actionPlan step = monitoring with explicit thresholds

═══ FORBIDDEN ═══

  · Tasks with <3 sources
  · Generic sources like "see audit" without real data quote
  · Embedded JSON arrays inside string values
  · Inventing new tasks (Pass 3 does that for senior-bar gaps)
  · Removing or renaming skeleton fields
  · Recommending deprecated integrations (Twenty CRM)

═══ JSON STRICTNESS ═══

  · DOUBLE-quote JSON. SINGLE-quote 'word' for emphasis inside strings.
  · NO embedded JSON arrays inside string values.
  · NO literal newlines inside strings (use \\n).
  · No trailing commas, no comments, no markdown fences.
  · ₪ symbol, not ש"ח.

Output STRICT JSON only.`

// ─── Concurrency-limited executor ─────────────────────────────────────────
async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    handler: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    async function worker() {
        while (true) {
            const idx = cursor++
            if (idx >= items.length) return
            results[idx] = await handler(items[idx], idx)
        }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
    await Promise.all(workers)
    return results
}

// ─── Per-batch elaboration ────────────────────────────────────────────────
async function elaborateBatch(
    ctx: PromptCtx,
    batch: BatchSpec,
    apiKey: string,
    model: string,
): Promise<BatchOutput | null> {
    const userPrompt = buildBatchUserPrompt(ctx, batch)
    console.log(`[monthlyPlanDetailer] batch=${batch.label} (${batch.skeletons.length} tasks) starting (prompt=${DETAILER_SYSTEM.length + userPrompt.length} chars)`)
    try {
        const raw = await callOpusStream({
            label: `monthlyPlanDetailer:${batch.label}`,
            apiKey, model,
            system: DETAILER_SYSTEM,
            user: userPrompt,
            maxTokens: BATCH_MAX_TOKENS,
            timeoutMs: BATCH_TIMEOUT_MS,
        })
        try {
            const parsed = extractLlmJson<BatchOutput>(raw, `monthlyPlanDetailer:${batch.label}`)
            console.log(`[monthlyPlanDetailer] batch=${batch.label} done: ${parsed.tasks?.length || 0} tasks elaborated`)
            return parsed
        } catch (parseErr) {
            try {
                const fs = await import('node:fs/promises')
                const dumpPath = `/tmp/monthly_plan_detailer_${batch.label}_${Date.now()}.txt`
                await fs.writeFile(dumpPath, raw, 'utf-8')
                console.error(`[monthlyPlanDetailer] batch=${batch.label} PARSE FAIL — raw dumped to ${dumpPath} (${raw.length} chars)`)
            } catch { /* best-effort */ }
            console.error(`[monthlyPlanDetailer] batch=${batch.label} parse error: ${(parseErr as Error).message}`)
            return null
        }
    } catch (err) {
        console.error(`[monthlyPlanDetailer] batch=${batch.label} FAILED: ${(err as Error).message}`)
        return null
    }
}

// ─── Merge skeleton + elaboration into a full MonthlyTask ─────────────────
function mergeIntoTask(skeleton: TaskSkeleton, elaboration?: Partial<MonthlyTask>): MonthlyTask {
    const fallbackImpact: MonthlyTask['expectedImpact'] = {
        metric: skeleton.expectedImpactMetric,
        value: skeleton.expectedImpactValue,
        horizon: skeleton.expectedImpactHorizon,
        confidence: skeleton.expectedImpactConfidence,
        rationale: skeleton._oneLineRationale || '',
    }
    return {
        id: skeleton.id,
        type: skeleton.type,
        title: skeleton.title,
        summary: skeleton.summary,
        channel: skeleton.channel,
        priority: skeleton.priority,
        estimatedEffort: skeleton.estimatedEffort,
        expectedImpact: elaboration?.expectedImpact
            ? { ...fallbackImpact, ...elaboration.expectedImpact }
            : fallbackImpact,
        sources: Array.isArray(elaboration?.sources) && elaboration!.sources.length > 0
            ? elaboration!.sources
            : [{ type: 'other', ref: 'pass2_failed', excerpt: '(Pass 2 elaboration unavailable — skeleton-only)' }],
        dependsOn: Array.isArray(skeleton.dependsOn) ? skeleton.dependsOn : [],
        actionPlan: Array.isArray(elaboration?.actionPlan) && elaboration!.actionPlan.length > 0
            ? elaboration!.actionPlan
            : [],
        status: 'proposed',
        proposedAt: new Date().toISOString(),
        scheduledFor: skeleton.scheduledFor,
        weekOfMonth: skeleton.weekOfMonth,
        childTaskIds: [],
        mediaPlanOptIndex: skeleton.mediaPlanOptIndex,
        contentPlanItemId: skeleton.contentPlanItemId,
        paidHypothesisId: skeleton.paidHypothesisId,
    }
}

// ─── Public entry ─────────────────────────────────────────────────────────
export async function elaborateTasks(
    ctx: PromptCtx,
    skeletons: TaskSkeleton[],
    apiKey: string,
    model = 'claude-opus-4-7',
): Promise<{ tasks: MonthlyTask[]; batchStats: { total: number; succeeded: number; failed: number } }> {
    if (skeletons.length === 0) {
        return { tasks: [], batchStats: { total: 0, succeeded: 0, failed: 0 } }
    }

    const batches = planBatches(skeletons)
    console.log(`[monthlyPlanDetailer] Pass 2 starting: ${skeletons.length} skeletons → ${batches.length} batches (max ${MAX_CONCURRENT_BATCHES} concurrent)`)

    const batchResults = await runWithConcurrency(
        batches,
        MAX_CONCURRENT_BATCHES,
        (batch) => elaborateBatch(ctx, batch, apiKey, model),
    )

    // Build a lookup: id → elaborated fields
    const elaborationById = new Map<string, Partial<MonthlyTask>>()
    let succeeded = 0
    let failed = 0
    for (const result of batchResults) {
        if (!result || !Array.isArray(result.tasks)) {
            failed++
            continue
        }
        succeeded++
        for (const t of result.tasks) {
            if (t && typeof t.id === 'string') {
                elaborationById.set(t.id, t)
            }
        }
    }

    const tasks: MonthlyTask[] = skeletons.map(s => mergeIntoTask(s, elaborationById.get(s.id)))

    console.log(`[monthlyPlanDetailer] Pass 2 done: ${succeeded}/${batches.length} batches succeeded, ${tasks.length} tasks merged (${tasks.filter(t => t.sources[0]?.ref === 'pass2_failed').length} skeleton-only fallbacks)`)

    return { tasks, batchStats: { total: batches.length, succeeded, failed } }
}