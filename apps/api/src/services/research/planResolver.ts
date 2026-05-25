/**
 * Plan resolver — derives a stage list from a ResearchIntent, and detects
 * the intent from פרופיל עסקי answers.
 *
 * Spec: docs/research-pipeline-design.md §3-4
 */

import type { ResearchIntent, StageId } from './types'
import { UNIVERSAL_STAGES } from './types'

/**
 * Detection result with reasoning trail. UI surfaces `reasoning` so the
 * user understands WHY this intent was picked and can override confidently.
 */
export interface IntentDetection {
    intent: ResearchIntent
    /** What we matched in marketingGoals (primary signal). */
    goalsMatched: ResearchIntent[]
    /** What we matched in platforms (secondary signal — usage, not declared goal). */
    platformsMatched: ResearchIntent[]
    /** 1-line Hebrew explanation for UI. */
    reasoning: string
}

/**
 * Two-tier detection: marketingGoals is the AUTHORITATIVE source for intent
 * (declared goals). platforms is a secondary hint about USED channels — it
 * can EXPAND the plan but never solely DETERMINES intent. This prevents
 * "Google Ads listed in platforms" from forcing multichannel when the
 * stated goals are SEO-only.
 *
 * Priority for single-signal cases: seo_organic > paid_search > social_organic
 * > email_crm > ecommerce. SEO wins ties because organic content is the most
 * common starting point for IL SMBs and the cheapest to validate.
 *
 * Multichannel triggers ONLY when goals contain 3+ distinct intents — not
 * when goals + platforms together hit 3 (the previous bug). User can always
 * override via UI if they actually want a multichannel pipeline.
 */
export function detectIntent(answers: Record<string, unknown> | undefined): ResearchIntent {
    return detectIntentWithReasoning(answers).intent
}

export function detectIntentWithReasoning(answers: Record<string, unknown> | undefined): IntentDetection {
    const goalsRaw = String((answers as Record<string, unknown> | undefined)?.marketingGoals || '').toLowerCase()
    const platformsRaw = String((answers as Record<string, unknown> | undefined)?.platforms || '').toLowerCase()

    // Match patterns against EACH source separately (not concatenated).
    const matchPatterns = (text: string) => {
        const seo    = /\bseo\b|\baeo\b|אורגנ|בלוג|תוכן|content marketing/.test(text)
        const paid   = /google ads|מודעות ממומנות|פרסום ממומן|מטא ads|מטא ads|פייסבוק ads|paid search|ppc/.test(text)
        const social = /רשתות חברתיות אורגני|אינסטגרם אורגני|tiktok organic|פייסבוק אורגני|social media organic|רשתות חברתיות(?!\s*ממומן)/.test(text)
        const email  = /\bמייל\b|אימייל|ניוזלטר|\bcrm\b|email marketing/.test(text)
        const ecom   = /\becommerce\b|shopify|woocommerce|חנות אונליין/.test(text)
        const intents: ResearchIntent[] = []
        if (seo) intents.push('seo_organic')
        if (paid) intents.push('paid_search')
        if (social) intents.push('social_organic')
        if (email) intents.push('email_crm')
        if (ecom) intents.push('ecommerce')
        return intents
    }

    const goalsMatched = matchPatterns(goalsRaw)
    const platformsMatched = matchPatterns(platformsRaw)

    // Priority order — used to break ties when multiple goals are mentioned.
    const PRIORITY: ResearchIntent[] = ['seo_organic', 'paid_search', 'social_organic', 'email_crm', 'ecommerce']

    // Multichannel fires ONLY when goals declare 3+ distinct intents.
    // Platforms-only signals don't trigger multichannel (per Phase 3.9 fix).
    if (goalsMatched.length >= 3) {
        return {
            intent: 'multichannel',
            goalsMatched, platformsMatched,
            reasoning: `זוהו ${goalsMatched.length} כיוונים מובחנים בmarketingGoals שלכם — pipeline מלא (multichannel)`,
        }
    }

    // 1-2 goals declared → pick by priority. Platforms is informational only.
    if (goalsMatched.length > 0) {
        const top = PRIORITY.find(p => goalsMatched.includes(p)) || goalsMatched[0]
        const reason = goalsMatched.length === 1
            ? `זוהה כיוון יחיד ב-marketingGoals: ${top}`
            : `זוהו ${goalsMatched.length} כיוונים — בחרנו ${top} לפי priority order. שאר הכיוונים זמינים דרך "+ ערוץ נוסף".`
        return { intent: top, goalsMatched, platformsMatched, reasoning: reason }
    }

    // No explicit goals → fall back to platforms (legacy heuristic).
    if (platformsMatched.length > 0) {
        const top = PRIORITY.find(p => platformsMatched.includes(p)) || platformsMatched[0]
        return {
            intent: top,
            goalsMatched, platformsMatched,
            reasoning: `marketingGoals ריקים — נגזר מ-platforms: ${top}`,
        }
    }

    // Truly nothing identifiable → safe default = SEO (cheapest, most common).
    return {
        intent: 'seo_organic',
        goalsMatched, platformsMatched,
        reasoning: 'לא זוהה כיוון מ-answers — ברירת מחדל: SEO/אורגני (הכי נפוץ ל-SMB ב-IL)',
    }
}

/**
 * Resolve the ordered stage list for an intent. Universal stages
 * (personas, positioning, strategy, validation) always appear in the
 * same relative position so cross-intent flows feel consistent.
 */
export function planForIntent(intent: ResearchIntent): StageId[] {
    // Order rationale (per SEO playbook §6 + 11):
    // 1. competitor_landscape FIRST — establishes who's in the SERP, link
    //    profiles, content gaps. Every downstream stage references this.
    // 2. Discovery stages — keyword/AEO/paid/social — use competitor signal
    //    to ground their analysis (cluster gap, AEO citation patterns).
    // 3. audience_personas — synthesizes from competitor + keyword landscape.
    // 4. positioning — needs both competitor_landscape + audience_personas.
    // 5. strategy_options — needs all prior research + positioning.
    // 6. validation — tests strategy_options + positioning hypotheses.
    // 7. content_plan / media_plan — execute the chosen scenario.
    // Phase E1.3 — internal_seo_audit lives after competitor_landscape (which
    // gives it a competitor benchmark to compare technical metrics against)
    // and before seo_keyword_research (which uses indexed-pages inventory to
    // ground striking-distance + cannibalization analysis on real URLs).
    // Phase 2026.01 — content_plan REMOVED from research pipeline (per Q5
    // restructure). It's now a separate, FINAL onboarding step that runs
    // AFTER paid channels setup is complete. Handler still exists and
    // is triggered manually (or by the final-onboarding-step flow) — it
    // just isn't surfaced as a "מחקר ואסטרטגיה" stage card anymore.
    switch (intent) {
        case 'seo_organic':
            return ['competitor_landscape', 'internal_seo_audit', 'seo_keyword_research',
                'aeo_visibility', 'link_audit',
                ...UNIVERSAL_STAGES]
        case 'paid_search':
            // Phase 4.2 — paid research pipeline (3 new stages between organic
            // competitor_landscape and the existing paid_audit):
            //   - paid_competitor_landscape: who's bidding now, their creatives + LPs
            //   - paid_keyword_research: paid keyword landscape + CPC estimates
            //   - paid_budget_scenarios: 3 IL-specific budget tiers with KPIs
            // These give paid the same research depth organic already has.
            return ['competitor_landscape', 'paid_data_inventory',
                'paid_competitor_landscape', 'paid_keyword_research',
                'audience_personas', 'positioning',
                'paid_budget_scenarios', 'cost_timeline_modeling',
                'paid_audit', 'strategy_options', 'validation',
                'media_plan']
        case 'social_organic':
            return ['competitor_landscape', 'social_landscape',
                ...UNIVERSAL_STAGES]
        case 'email_crm':
            return ['competitor_landscape', 'email_competitor_audit',
                ...UNIVERSAL_STAGES]
        case 'ecommerce':
            // Phase 4.2 — ecommerce gets the full paid research pipeline too
            // (paid traffic is the primary growth lever for IL ecommerce SMBs).
            return ['competitor_landscape', 'internal_seo_audit', 'seo_keyword_research',
                'paid_data_inventory', 'paid_competitor_landscape', 'paid_keyword_research',
                'audience_personas', 'positioning',
                'paid_budget_scenarios', 'cost_timeline_modeling',
                'paid_audit', 'strategy_options', 'validation',
                'media_plan']
        case 'multichannel':
            return ['competitor_landscape', 'internal_seo_audit', 'seo_keyword_research',
                'aeo_visibility', 'link_audit',
                'paid_data_inventory', 'paid_competitor_landscape', 'paid_keyword_research',
                'paid_audit', 'social_landscape',
                'audience_personas', 'positioning',
                'paid_budget_scenarios', 'cost_timeline_modeling',
                'strategy_options', 'validation',
                'media_plan']
    }
}

/**
 * Compute the union of stage lists for a set of intents. Used by the
 * "expand intent" flow — adding paid_search to an SEO plan keeps the
 * SEO stages and adds only what's new.
 */
export function planForIntents(intents: ResearchIntent[]): StageId[] {
    const seen = new Set<StageId>()
    const ordered: StageId[] = []
    for (const intent of intents) {
        for (const stage of planForIntent(intent)) {
            if (!seen.has(stage)) { seen.add(stage); ordered.push(stage) }
        }
    }
    return ordered
}