/**
 * Paid-budget scenario generator.
 *
 * Given the vertical benchmarks + upstream research, project 3 budget tiers:
 *   - שמרני (conservative): minimum viable, search-only or search+brand-only,
 *     manual CPC. Goal: prove conversion economics before scaling.
 *   - מאוזן (balanced): full-funnel search + 1 social layer, Max Conversions,
 *     1-2 ad-group expansion. Goal: scale validated angles.
 *   - אגרסיבי (aggressive): full search + Pmax + Meta prospecting/retargeting
 *     split, tCPA/tROAS, multi-language testing. Goal: dominate share-of-voice.
 *
 * Each tier returns 12-month KPI projection (per month):
 *   - Monthly impressions (= spend / CPM-equivalent)
 *   - Monthly clicks (= spend / blended CPC)
 *   - Monthly conversions (= clicks × CVR — but CVR depends on intent mix)
 *   - Monthly CPA range (low/median/high based on bid-tier discipline)
 *   - Monthly ROAS projection (= conversions × LTV / spend)
 *   - Learning-phase modifier: months 1-2 use 1.5-2× CPA, months 3-12 mature
 *
 * Output is structured deterministic math — the Opus prompt will critique,
 * adjust based on competitor-specific signals, and may revise. But the
 * baseline projection is here, calibrated to IL benchmarks NOT global avg.
 */

import type { VerticalBenchmark, IlVertical } from './ilVerticalBenchmarks'
import { IL_VERTICAL_BENCHMARKS } from './ilVerticalBenchmarks'
import type { PaidKeywordLandscape } from './keywordPaidLandscape'

export type BudgetTier = 'שמרני' | 'מאוזן' | 'אגרסיבי'
export type BudgetTierKey = 'conservative' | 'balanced' | 'aggressive'

export interface BudgetAllocation {
    search_brand_ils: number      // defensive brand bidding
    search_nonbrand_ils: number   // commercial keywords
    pmax_ils: number              // Performance Max (Google) — automation layer
    display_ils: number           // Google Display — pure awareness
    meta_prospecting_ils: number  // Meta cold-audience layer
    meta_retargeting_ils: number  // Meta warm-audience layer
    /** Sum of all above. Must equal monthly_budget_ils. */
    total_ils: number
}

export interface MonthlyKpiProjection {
    month: number                          // 1-12
    /** Learning phase (1-2) → adjusted CPA upward, CVR downward. */
    learning_phase: boolean
    impressions_est: number
    clicks_est: number
    conversions_est: number
    conversion_value_ils_est: number       // = conversions × LTV (where applicable)
    spend_ils: number
    cpa_ils_low: number
    cpa_ils_median: number
    cpa_ils_high: number
    roas_est: number
    /** Cumulative since month 1. */
    cumulative_conversions: number
    cumulative_revenue_ils: number
}

export interface BudgetScenario {
    tier: BudgetTier
    tierKey: BudgetTierKey
    label_he: string
    monthly_budget_ils: number
    /** Why this budget is right for this vertical. */
    rationale_he: string
    /** When this scenario makes sense (decision criteria). */
    when_to_choose_he: string[]
    allocation: BudgetAllocation
    /** What we expect month-by-month for 12 months. */
    monthly_projection: MonthlyKpiProjection[]
    /** Year-1 totals — derived from monthly_projection. */
    year_1_summary: {
        total_spend_ils: number
        total_conversions_est: number
        total_revenue_ils_est: number
        avg_cpa_ils: number
        avg_roas: number
    }
    /** Risks specific to this tier. */
    risks: string[]
    /** Bid-strategy progression month-by-month. */
    bidding_progression: Array<{ months: string; strategy: string; rationale_he: string }>
    /** Required setup before this tier is viable (e.g. tracking, Customer Match seed). */
    prerequisites: string[]
    /** Confidence — drops when keyword landscape sparse or vertical 'unknown'. */
    confidence: 'high' | 'medium' | 'working_hypothesis'
}

export interface BudgetScenariosBundle {
    vertical: IlVertical
    vertical_label_he: string
    /** Median CPC the user can realistically expect (blended from search keyword landscape). */
    blended_cpc_ils: number
    /** Median CVR the user can realistically expect. */
    blended_cvr: number
    scenarios: BudgetScenario[]
    /** Cross-scenario decision matrix. */
    decision_matrix_he: string[]
    diagnostics: {
        keywords_used_for_cpc: number
        benchmark_source: 'il_vertical' | 'global_fallback'
        custom_inputs_used: boolean
    }
}

// ─── Allocation rules per tier ────────────────────────────────────────────
// Percentages, must sum to 1.0 within each tier. Differs by vertical sometimes
// (e.g. ecommerce shifts heavier to Pmax+Meta; legal/medical stays search-heavy).

function allocationFor(tier: BudgetTierKey, vertical: IlVertical): {
    search_brand: number
    search_nonbrand: number
    pmax: number
    display: number
    meta_prospecting: number
    meta_retargeting: number
} {
    // Defaults
    const allocations: Record<BudgetTierKey, ReturnType<typeof allocationFor>> = {
        conservative: {
            search_brand: 0.15, search_nonbrand: 0.60,
            pmax: 0, display: 0,
            meta_prospecting: 0.15, meta_retargeting: 0.10,
        },
        balanced: {
            search_brand: 0.10, search_nonbrand: 0.45,
            pmax: 0.15, display: 0,
            meta_prospecting: 0.20, meta_retargeting: 0.10,
        },
        aggressive: {
            search_brand: 0.07, search_nonbrand: 0.35,
            pmax: 0.25, display: 0.05,
            meta_prospecting: 0.18, meta_retargeting: 0.10,
        },
    }
    const base = allocations[tier]

    // Vertical overrides — ecommerce verticals shift heavier toward Pmax + Meta
    if (vertical === 'ecommerce_apparel' || vertical === 'ecommerce_food_grocery' || vertical === 'ecommerce_electronics') {
        if (tier === 'balanced') {
            return { search_brand: 0.08, search_nonbrand: 0.30, pmax: 0.25, display: 0, meta_prospecting: 0.25, meta_retargeting: 0.12 }
        }
        if (tier === 'aggressive') {
            return { search_brand: 0.05, search_nonbrand: 0.20, pmax: 0.35, display: 0.05, meta_prospecting: 0.25, meta_retargeting: 0.10 }
        }
    }
    // Legal/medical/financial stays search-heavy (high-intent vertical)
    if (vertical === 'legal_consult' || vertical === 'medical_clinic' || vertical === 'financial_consulting') {
        if (tier === 'conservative') {
            return { search_brand: 0.20, search_nonbrand: 0.70, pmax: 0, display: 0, meta_prospecting: 0.05, meta_retargeting: 0.05 }
        }
        if (tier === 'balanced') {
            return { search_brand: 0.15, search_nonbrand: 0.60, pmax: 0.05, display: 0, meta_prospecting: 0.10, meta_retargeting: 0.10 }
        }
    }
    // B2B SaaS / B2B Services — LinkedIn-friendly (not modeled here, falls into meta_prospecting bucket)
    if (vertical === 'b2b_saas' || vertical === 'b2b_services') {
        // Same as defaults; the prompt will tell the analyst to consider LinkedIn within meta_prospecting allocation
    }
    return base
}

function makeAllocation(monthlyBudget: number, pcts: ReturnType<typeof allocationFor>): BudgetAllocation {
    const a = {
        search_brand_ils: Math.round(monthlyBudget * pcts.search_brand),
        search_nonbrand_ils: Math.round(monthlyBudget * pcts.search_nonbrand),
        pmax_ils: Math.round(monthlyBudget * pcts.pmax),
        display_ils: Math.round(monthlyBudget * pcts.display),
        meta_prospecting_ils: Math.round(monthlyBudget * pcts.meta_prospecting),
        meta_retargeting_ils: Math.round(monthlyBudget * pcts.meta_retargeting),
        total_ils: 0,
    }
    a.total_ils = a.search_brand_ils + a.search_nonbrand_ils + a.pmax_ils
        + a.display_ils + a.meta_prospecting_ils + a.meta_retargeting_ils
    return a
}

// ─── Per-tier monthly KPI projection (12 months) ──────────────────────────
function projectMonthlyKpis(opts: {
    monthlyBudget: number
    blendedCpc: number
    blendedCvr: number
    benchmark: VerticalBenchmark
    tier: BudgetTierKey
}): MonthlyKpiProjection[] {
    const out: MonthlyKpiProjection[] = []
    let cumulativeConv = 0
    let cumulativeRev = 0

    // Tier ramp-up: conservative is steady; balanced ramps; aggressive ramps fast
    const rampPattern: Record<BudgetTierKey, number[]> = {
        conservative: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],            // flat
        balanced:     [0.8, 0.9, 1, 1, 1, 1, 1, 1.05, 1.05, 1.1, 1.1, 1.1],  // ramp up to 1.1×
        aggressive:   [0.6, 0.85, 1, 1.1, 1.15, 1.2, 1.2, 1.25, 1.25, 1.3, 1.3, 1.3], // strong ramp
    }
    const ramp = rampPattern[opts.tier]

    for (let m = 1; m <= 12; m++) {
        const isLearning = m <= 2
        const monthlySpend = Math.round(opts.monthlyBudget * ramp[m - 1])
        // Learning phase: CPC slightly higher (15%) due to Smart Bidding exploration
        const effectiveCpc = isLearning ? opts.blendedCpc * 1.15 : opts.blendedCpc
        // Learning phase: CVR lower (60-70% of mature) due to broader targeting
        const effectiveCvr = isLearning ? opts.blendedCvr * 0.65 : opts.blendedCvr
        const clicks = Math.round(monthlySpend / effectiveCpc)
        const conversions = Math.round(clicks * effectiveCvr)
        const cpaLow = Math.round((monthlySpend / Math.max(conversions, 1)) * 0.8)
        const cpaMedian = Math.round(monthlySpend / Math.max(conversions, 1))
        const cpaHigh = Math.round((monthlySpend / Math.max(conversions, 1)) * 1.3)
        const revenue = Math.round(conversions * opts.benchmark.ltv.median)
        const roas = monthlySpend > 0 ? revenue / monthlySpend : 0
        // Impressions assume ~1% CTR (varies wildly; placeholder for Opus to refine)
        const impressions = Math.round(clicks / 0.01)
        cumulativeConv += conversions
        cumulativeRev += revenue
        out.push({
            month: m, learning_phase: isLearning,
            impressions_est: impressions, clicks_est: clicks,
            conversions_est: conversions, conversion_value_ils_est: revenue,
            spend_ils: monthlySpend,
            cpa_ils_low: cpaLow, cpa_ils_median: cpaMedian, cpa_ils_high: cpaHigh,
            roas_est: Number(roas.toFixed(2)),
            cumulative_conversions: cumulativeConv,
            cumulative_revenue_ils: cumulativeRev,
        })
    }
    return out
}

// ─── Bidding progression per tier ─────────────────────────────────────────
function biddingProgression(tier: BudgetTierKey): BudgetScenario['bidding_progression'] {
    if (tier === 'conservative') {
        return [
            { months: '1-2', strategy: 'Max Clicks', rationale_he: 'מצב למידה — אוספים סיגנל בלי לבזבז על Smart Bidding מתחת לסף 15 conv/30d' },
            { months: '3-6', strategy: 'Max Conversions', rationale_he: 'אם נצברו 15+ המרות ב-30 יום אחרונים — מעבר. אחרת נשארים על Max Clicks' },
            { months: '7-12', strategy: 'Target CPA', rationale_he: 'דורש 30+ conv/30d יציבים. אם לא הגענו — נישאר על Max Conv' },
        ]
    }
    if (tier === 'balanced') {
        return [
            { months: '1', strategy: 'Max Clicks', rationale_he: 'אספקת סיגנל ראשונית' },
            { months: '2-3', strategy: 'Max Conversions', rationale_he: 'מעבר מהיר כי תקציב יותר גדול → 15 conv תוך 30 יום ריאליסטי' },
            { months: '4-6', strategy: 'Target CPA', rationale_he: 'יעד CPA מבוסס בנצ\'מרק vertical' },
            { months: '7-12', strategy: 'Target CPA + Pmax (לאחר 50+ conv/30d)', rationale_he: 'Pmax מצטרף בשכבת automation; tCPA נשאר על search' },
        ]
    }
    return [
        { months: '1', strategy: 'Max Clicks + Pmax', rationale_he: 'תקציב גדול מאפשר Pmax מיום 1 לצד search-clicks' },
        { months: '2-3', strategy: 'Max Conversions + Pmax', rationale_he: 'מעבר מהיר לconv-bidding' },
        { months: '4-6', strategy: 'Target CPA + Pmax + Meta CBO', rationale_he: 'multi-strategy: search-tCPA, Pmax bidding, Meta campaign budget optimization' },
        { months: '7-12', strategy: 'Target ROAS + Pmax + value-based Meta', rationale_he: 'ערך-מבוסס — דורש value tracking (e-commerce purchases or lead-value upload from CRM)' },
    ]
}

// ─── Per-tier prerequisites ───────────────────────────────────────────────
function prerequisites(tier: BudgetTierKey): string[] {
    if (tier === 'conservative') {
        return [
            'Google Ads OAuth מחובר',
            'GA4 + GTM פעילים',
            'אירוע המרה אחד נורה (lead form / phone call / purchase)',
            'דף נחיתה ייעודי לקמפיין (לא homepage)',
        ]
    }
    if (tier === 'balanced') {
        return [
            'כל ה-prerequisites של "שמרני"',
            'Meta Business Manager מחובר + Pixel installed',
            'Enhanced Conversions for Web enabled ב-Google Ads',
            'Meta CAPI configured (לפחות אירוע אחד)',
            'דפי נחיתה מותאמים: 2-3 dedicated LPs לפי intent tier (BOFU/MOFU/TOFU)',
        ]
    }
    return [
        'כל ה-prerequisites של "מאוזן"',
        'Customer Match seed list (≥300 emails לקבל 100+ matched)',
        'Offline Conversion Import wired (phone-call tracking → Google Ads OCI)',
        'Value-based tracking active (purchase_value או lead_value)',
        'A/B testing infrastructure: 5+ ad variants per ad group ready to rotate',
        'Brand monitoring active (Mention/Brand24 או manual weekly check)',
    ]
}

// ─── Per-tier risks ───────────────────────────────────────────────────────
function risks(tier: BudgetTierKey, vertical: IlVertical): string[] {
    const benchmark = IL_VERTICAL_BENCHMARKS[vertical]
    if (tier === 'conservative') {
        return [
            `תקציב נמוך מ-₪${benchmark.min_viable_monthly_budget_ils.toLocaleString()} (vertical floor) — Smart Bidding יתקשה אי פעם להתייצב`,
            'לא מספיק data לטיב באמת — מסקנות month-12 יהיו עדיין סטטיסטיקה רועשת',
            'תחרות באוקציה לא מותרת לחלוטין — אבא היריב יכול לעלות ה-CPC ולפלוט אותנו אם רץ עם תקציב גדול יותר',
        ]
    }
    if (tier === 'balanced') {
        return [
            'התחלת קמפיינים בלי iOS attribution recovery (CAPI/EC) — לפחות 30-50% מההמרות יחסרו → מסקנות שגויות',
            'Pmax זקוק ל-50+ conv לפני שהוא מתייצב — יכול לחזור עם CPA רעיל אם נוסע מוקדם מדי',
            'תקציב חודשי לא יציב (יתקרבו עליות וירידות) → tCPA "ינוע" יעדים → CPA יקפוץ',
        ]
    }
    return [
        'תקציב גבוה דורש finance ops למידת responsiveness — אם משלמים שכר חודשי אבל cash flow חודשי לא תואם → קושי שמירה',
        'Pmax יכול לקאניבליז את search-brand אם לא מוגדר נכון negative keywords — בודקים שבועית',
        'tROAS מבוסס value tracking — אם attribution לא יציב (iOS), tROAS יבזבז על noise',
        'LinkedIn Ads (B2B verticals) דורש developer-token נפרד + minimum spend $10/day — תכננו לפני שמגדילים תקציב',
        'Brand bidding מתחרים יכולים לגרום ל-CPC לקפוץ פתאום ב-50%+ — defensive campaign mandatory',
    ]
}

// ─── Public entry ─────────────────────────────────────────────────────────

export interface GenerateScenariosOpts {
    vertical: IlVertical
    keywordLandscape: PaidKeywordLandscape | null
    /** Optional budget hint from answers.paidBudget — if user has a number in mind. */
    userBudgetHintIls?: number | null
}

export function generateBudgetScenarios(opts: GenerateScenariosOpts): BudgetScenariosBundle {
    const benchmark = IL_VERTICAL_BENCHMARKS[opts.vertical]

    // Derive blended CPC from keyword landscape if available, else fall back to vertical median
    const blendedCpc = opts.keywordLandscape?.ilBenchmarks.medianCpcIls
        || benchmark.search_cpc.median
    const blendedCvr = benchmark.cvr.median

    // Tier budgets — anchored to vertical min_viable + spectrum
    // conservative = min_viable
    // balanced = 2-3× min_viable (sweet spot for most IL SMBs)
    // aggressive = 5-10× min_viable
    const conservativeBudget = benchmark.min_viable_monthly_budget_ils
    const balancedBudget = Math.round(benchmark.min_viable_monthly_budget_ils * 2.5)
    const aggressiveBudget = Math.round(benchmark.min_viable_monthly_budget_ils * 6)

    // If user gave a hint, use it for the "balanced" tier and bracket around
    let scenarios_budgets: [number, number, number] = [conservativeBudget, balancedBudget, aggressiveBudget]
    if (opts.userBudgetHintIls && opts.userBudgetHintIls > 0) {
        const hint = opts.userBudgetHintIls
        scenarios_budgets = [
            Math.round(hint * 0.5),
            hint,
            Math.round(hint * 2.5),
        ]
    }

    const tierMeta: Array<{ key: BudgetTierKey; label: BudgetTier; rationale_he: string; when_he: string[] }> = [
        {
            key: 'conservative', label: 'שמרני',
            rationale_he: `תקציב מינימלי שיש סיכוי לעבור את שלב הלמידה ב-${benchmark.label_he}. מבוסס על floor המומלץ ל-vertical (₪${benchmark.min_viable_monthly_budget_ils}/חודש).`,
            when_he: [
                'לא בטוחים שהפרסום הממומן יחזיר ROI — בודקים economics לפני סקייל',
                'cash flow מצומצם — צריך לראות תוצאה ראשונה תוך חודש',
                'אין עוד CRM/Pixel/Enhanced Conversions stack מוכן',
            ],
        },
        {
            key: 'balanced', label: 'מאוזן',
            rationale_he: `2.5× ה-floor — sweet spot ל-${benchmark.label_he} ב-IL. מאפשר full search + Pmax + Meta dual-layer בלי לדרוש advanced infrastructure שעוד אין.`,
            when_he: [
                'בעלי tracking infrastructure בסיסי (GA4 + GTM) ורוצים לסקייל',
                'יש איזה data היסטורי או CRM — Customer Match באפק',
                'מטרה: 6-12 חודשים להגיע ל-mature account עם stable CPA',
            ],
        },
        {
            key: 'aggressive', label: 'אגרסיבי',
            rationale_he: `6× ה-floor — מתאים כשרוצים dominance תוך 6 חודשים בקטגוריה. דורש ROI proof-of-concept מהשלבים הקודמים.`,
            when_he: [
                'יש כבר proof-of-concept מ-tier מאוזן (CPA יציב, ROAS חיובי)',
                'cash flow + finance ops מוכנים ל-₪25-50K/חודש',
                'מטרה: share-of-voice dominance או scale חזק לתחילת שנה',
                'יש advanced infrastructure: CRM + CAPI + Customer Match + Offline Conv Upload',
            ],
        },
    ]

    const scenarios: BudgetScenario[] = tierMeta.map((meta, i) => {
        const budget = scenarios_budgets[i]
        const pcts = allocationFor(meta.key, opts.vertical)
        const allocation = makeAllocation(budget, pcts)
        const monthlyProjection = projectMonthlyKpis({
            monthlyBudget: budget,
            blendedCpc,
            blendedCvr,
            benchmark,
            tier: meta.key,
        })
        const totalSpend = monthlyProjection.reduce((s, m) => s + m.spend_ils, 0)
        const totalConv = monthlyProjection.reduce((s, m) => s + m.conversions_est, 0)
        const totalRev = monthlyProjection.reduce((s, m) => s + m.conversion_value_ils_est, 0)
        const avgCpa = totalConv > 0 ? Math.round(totalSpend / totalConv) : 0
        const avgRoas = totalSpend > 0 ? Number((totalRev / totalSpend).toFixed(2)) : 0
        // Confidence: drops with vertical=unknown OR sparse keyword data
        let confidence: BudgetScenario['confidence'] = 'high'
        if (opts.vertical === 'unknown') confidence = 'working_hypothesis'
        else if (!opts.keywordLandscape || !opts.keywordLandscape.available) confidence = 'medium'

        return {
            tier: meta.label, tierKey: meta.key,
            label_he: `${meta.label} — ₪${budget.toLocaleString()}/חודש`,
            monthly_budget_ils: budget,
            rationale_he: meta.rationale_he,
            when_to_choose_he: meta.when_he,
            allocation,
            monthly_projection: monthlyProjection,
            year_1_summary: {
                total_spend_ils: totalSpend,
                total_conversions_est: totalConv,
                total_revenue_ils_est: totalRev,
                avg_cpa_ils: avgCpa,
                avg_roas: avgRoas,
            },
            risks: risks(meta.key, opts.vertical),
            bidding_progression: biddingProgression(meta.key),
            prerequisites: prerequisites(meta.key),
            confidence,
        }
    })

    return {
        vertical: opts.vertical,
        vertical_label_he: benchmark.label_he,
        blended_cpc_ils: blendedCpc,
        blended_cvr: blendedCvr,
        scenarios,
        decision_matrix_he: [
            'בחרו "שמרני" אם: אתם בודקים paid לראשונה ב-vertical, או cash-flow מוגבל, או אין עדיין tracking infrastructure מלא',
            'בחרו "מאוזן" אם: יש לכם הוכחת ROI ראשונית (אורגני או מאמצים פיילוט), tracking בסיסי קיים, יש 6-12 חודש לעבוד',
            'בחרו "אגרסיבי" אם: יש לכם proof-of-concept מ-tier מאוזן, finance ops מוכנים, רוצים לתפוס שוק תוך 6 חודש',
            'תזכרו: אגרסיבי בלי CAPI + EC = שריפת תקציב על attribution-loss',
        ],
        diagnostics: {
            keywords_used_for_cpc: opts.keywordLandscape?.keywords.length || 0,
            benchmark_source: opts.vertical === 'unknown' ? 'global_fallback' : 'il_vertical',
            custom_inputs_used: !!opts.userBudgetHintIls,
        },
    }
}

export function renderScenariosForPrompt(bundle: BudgetScenariosBundle): string {
    const lines: string[] = []
    lines.push('═══ BUDGET SCENARIOS (IL Vertical Benchmarks) ═══')
    lines.push('')
    lines.push(`Vertical: ${bundle.vertical_label_he} (${bundle.vertical})`)
    lines.push(`Blended CPC: ₪${bundle.blended_cpc_ils.toFixed(2)} | Blended CVR: ${(bundle.blended_cvr * 100).toFixed(2)}%`)
    lines.push(`Keyword pool: ${bundle.diagnostics.keywords_used_for_cpc} kw | benchmark source: ${bundle.diagnostics.benchmark_source}`)
    lines.push('')

    for (const s of bundle.scenarios) {
        const a = s.allocation
        const summary = s.year_1_summary
        lines.push(`---`)
        lines.push(`### ${s.label_he} (confidence: ${s.confidence})`)
        lines.push(`**Rationale:** ${s.rationale_he}`)
        lines.push(`**When to choose:**`)
        for (const w of s.when_to_choose_he) lines.push(`  - ${w}`)
        lines.push(``)
        lines.push(`**Monthly allocation:**`)
        lines.push(`  - Search Brand: ₪${a.search_brand_ils.toLocaleString()}`)
        lines.push(`  - Search Non-Brand: ₪${a.search_nonbrand_ils.toLocaleString()}`)
        lines.push(`  - Pmax: ₪${a.pmax_ils.toLocaleString()}`)
        lines.push(`  - Display: ₪${a.display_ils.toLocaleString()}`)
        lines.push(`  - Meta Prospecting: ₪${a.meta_prospecting_ils.toLocaleString()}`)
        lines.push(`  - Meta Retargeting: ₪${a.meta_retargeting_ils.toLocaleString()}`)
        lines.push(`  - **TOTAL: ₪${a.total_ils.toLocaleString()}/mo**`)
        lines.push(``)
        lines.push(`**Year-1 projection:**`)
        lines.push(`  - Spend: ₪${summary.total_spend_ils.toLocaleString()}`)
        lines.push(`  - Conversions: ${summary.total_conversions_est.toLocaleString()}`)
        lines.push(`  - Revenue: ₪${summary.total_revenue_ils_est.toLocaleString()}`)
        lines.push(`  - Avg CPA: ₪${summary.avg_cpa_ils.toLocaleString()}`)
        lines.push(`  - Avg ROAS: ${summary.avg_roas}×`)
        lines.push(``)
        lines.push(`**Monthly progression (clicks/conv/CPA):**`)
        for (const m of s.monthly_projection) {
            const learning = m.learning_phase ? ' [LEARNING]' : ''
            lines.push(`  M${m.month}: ${m.clicks_est} clicks → ${m.conversions_est} conv | CPA ₪${m.cpa_ils_median} (₪${m.cpa_ils_low}-₪${m.cpa_ils_high}) | ROAS ${m.roas_est}× | spend ₪${m.spend_ils}${learning}`)
        }
        lines.push(``)
        lines.push(`**Bidding progression:**`)
        for (const b of s.bidding_progression) lines.push(`  - M${b.months}: ${b.strategy} — ${b.rationale_he}`)
        lines.push(``)
        lines.push(`**Prerequisites:**`)
        for (const p of s.prerequisites) lines.push(`  - ${p}`)
        lines.push(``)
        lines.push(`**Risks specific to this tier:**`)
        for (const r of s.risks) lines.push(`  - ${r}`)
    }

    lines.push(`---`)
    lines.push('**Decision matrix:**')
    for (const d of bundle.decision_matrix_he) lines.push(`  - ${d}`)
    return lines.join('\n')
}