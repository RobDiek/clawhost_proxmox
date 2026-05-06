/**
 * Methodology module — single source of truth for the SEO/AEO research
 * playbook. Encodes Sergei's 7-year operational defaults (memory:
 * project_seo_playbook_sergei.md) into types, constants, and pure
 * functions that per-stage prompt builders compose.
 *
 * What lives here:
 *   - Intent taxonomy (7 base intents + modifiers, JTBD as overlay)
 *   - Opportunity Score formula (weighted 7-component, replaces KD×Volume)
 *   - AEO Target Score formula (subset selection for citation-priority kw)
 *   - Hebrew/English language decision tree
 *   - Competitor buckets (4) + scorecard weights (6 dims)
 *   - Always-on competitor signals + IL-specific signals
 *   - Cluster architecture defaults (topic + page-type lattice)
 *   - Programmatic SEO protection rules
 *   - Striking-distance buckets + cannibalization rule
 *   - Persona minimum fields + buying journey columns + trust hierarchy
 *   - Quality gate checks
 *   - JSON record schemas (KeywordRecord, CompetitorRecord, PersonaRecord)
 *   - Confidence labeling helpers
 *
 * Hebrew prompt-injection text fragments live in promptBlocks.ts —
 * separate so methodology.ts stays purely typed/structural.
 *
 * Per-stage prompt builders (services/research/prompts.ts) MUST import
 * formulas + schemas from here. Never duplicate the 0.25/0.20/0.15 weights
 * or the 4-bucket competitor list inline in a prompt — drift is fatal.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. Intent taxonomy
// ────────────────────────────────────────────────────────────────────────────

export type PrimaryIntent =
    | 'navigational'
    | 'brand_validation'
    | 'info_broad'
    | 'info_deep'
    | 'commercial_eval'
    | 'transactional'
    | 'support'

export const PRIMARY_INTENTS: readonly PrimaryIntent[] = [
    'navigational', 'brand_validation', 'info_broad', 'info_deep',
    'commercial_eval', 'transactional', 'support',
] as const

export type Locality = 'none' | 'city' | 'region' | 'near_me' | 'branch'
export type Urgency = 'none' | 'same_day' | 'urgent'
export type TrustLoad = 'low' | 'medium' | 'high' | 'ymyl'
export type LanguageMode = 'he' | 'en' | 'mixed' | 'translit'
export type BuyerMaturity = 'first_time' | 'switcher' | 'expert'

/**
 * Intent classification — primary intent + orthogonal modifiers + JTBD overlay.
 * JTBD is intentionally a free-form statement, NOT an enum — it's the
 * explanatory layer over intent (per Christensen), never peer-class.
 */
export interface IntentClassification {
    primary: PrimaryIntent
    locality: Locality
    urgency: Urgency
    trust_load: TrustLoad
    language_mode: LanguageMode
    buyer_maturity?: BuyerMaturity
    /** "When [situation], I want [progress], so that [outcome], without risking [downside]" */
    jtbd?: string
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Opportunity Score (weighted 7-component, 0–100)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Weights from Sergei's playbook §1. Sum = 1.00. Components individually
 * normalized to 0–100 before the weighted sum.
 *
 *   0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE
 *
 * BV = business value | WP = win probability | QD = qualified demand
 * CY = click yield (after SERP attrition) | AEO = citation/answer fit
 * CL = cluster leverage | OE = operational ease
 */
export const OPPORTUNITY_WEIGHTS = {
    business_value:      0.25,
    win_probability:     0.20,
    qualified_demand:    0.15,
    click_yield:         0.15,
    aeo_fit:             0.10,
    cluster_leverage:    0.10,
    operational_ease:    0.05,
} as const

export interface OpportunityComponents {
    business_value: number
    win_probability: number
    qualified_demand: number
    click_yield: number
    aeo_fit: number
    cluster_leverage: number
    operational_ease: number
}

/**
 * Compute weighted opportunity score. Inputs assumed to be 0–100; output is
 * 0–100. Out-of-range inputs are clamped (per-component) so a model that
 * accidentally returns 120 doesn't poison the final score.
 */
export function opportunityScore(c: OpportunityComponents): number {
    const clamp = (v: number) => Math.max(0, Math.min(100, v))
    return Math.round(
        clamp(c.business_value)   * OPPORTUNITY_WEIGHTS.business_value +
        clamp(c.win_probability)  * OPPORTUNITY_WEIGHTS.win_probability +
        clamp(c.qualified_demand) * OPPORTUNITY_WEIGHTS.qualified_demand +
        clamp(c.click_yield)      * OPPORTUNITY_WEIGHTS.click_yield +
        clamp(c.aeo_fit)          * OPPORTUNITY_WEIGHTS.aeo_fit +
        clamp(c.cluster_leverage) * OPPORTUNITY_WEIGHTS.cluster_leverage +
        clamp(c.operational_ease) * OPPORTUNITY_WEIGHTS.operational_ease,
    )
}

export type OpportunityDecision =
    | 'take_now'           // 70+
    | 'take_if_strategic'  // 60-69 (only if local/brand defense or cluster-critical)
    | 'backlog'            // 50-59
    | 'skip'               // <50

export function opportunityDecision(score: number): OpportunityDecision {
    if (score >= 70) return 'take_now'
    if (score >= 60) return 'take_if_strategic'
    if (score >= 50) return 'backlog'
    return 'skip'
}

/**
 * Hard-stop rules — skip a topic even if score looks high. Returned reasons
 * surface in the JSON record so reviewers know why something was rejected.
 */
export interface HardStopCheck {
    no_distinct_intent_page_type?: boolean
    cant_beat_serp_uniqueness?: boolean
    ymyl_without_expert_review?: boolean
    almost_only_zero_click?: boolean
    programmatic_thin_risk?: boolean
}

export const HARD_STOP_REASONS: Record<keyof HardStopCheck, string> = {
    no_distinct_intent_page_type:    'אין page-type שונה לכוונה — התוכן יתחרה בעצמו',
    cant_beat_serp_uniqueness:       'לא ניתן לתת ערך ייחודי מעבר ל-SERP הקיים',
    ymyl_without_expert_review:      'נושא YMYL ללא expert/legal review זמין',
    almost_only_zero_click:          'תוצאה כמעט רק zero-click ללא assisted-conversion value',
    programmatic_thin_risk:          'מועמד programmatic שייסחף ל-thin/scaled content',
}

export function hasHardStop(check: HardStopCheck): { stopped: boolean; reasons: string[] } {
    const reasons: string[] = []
    for (const key of Object.keys(check) as Array<keyof HardStopCheck>) {
        if (check[key]) reasons.push(HARD_STOP_REASONS[key])
    }
    return { stopped: reasons.length > 0, reasons }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. AEO Target Score (citation-priority subset selection)
// ────────────────────────────────────────────────────────────────────────────

/**
 * From playbook §11.
 *   AEO Target = 0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV
 *
 * SN = synthesis need | FD = fact density potential | FU = follow-up likelihood
 * ES = entity specificity | CV = citation value
 *
 * 70+ → AEO-priority subset (gets citation-oriented content treatment).
 */
export const AEO_TARGET_WEIGHTS = {
    synthesis_need:        0.30,
    fact_density:          0.25,
    follow_up_likelihood:  0.20,
    entity_specificity:    0.15,
    citation_value:        0.10,
} as const

export interface AeoTargetComponents {
    synthesis_need: number
    fact_density: number
    follow_up_likelihood: number
    entity_specificity: number
    citation_value: number
}

export function aeoTargetScore(c: AeoTargetComponents): number {
    const clamp = (v: number) => Math.max(0, Math.min(100, v))
    return Math.round(
        clamp(c.synthesis_need)       * AEO_TARGET_WEIGHTS.synthesis_need +
        clamp(c.fact_density)         * AEO_TARGET_WEIGHTS.fact_density +
        clamp(c.follow_up_likelihood) * AEO_TARGET_WEIGHTS.follow_up_likelihood +
        clamp(c.entity_specificity)   * AEO_TARGET_WEIGHTS.entity_specificity +
        clamp(c.citation_value)       * AEO_TARGET_WEIGHTS.citation_value,
    )
}

export const AEO_PRIORITY_THRESHOLD = 70

/**
 * Hebrew query shapes that frequently qualify as AEO targets. Used by the
 * keyword-stage prompt to seed candidate selection — model still has to
 * score each per the formula, but these patterns get pre-flagged.
 */
export const AEO_QUERY_SHAPES = [
    'מה ההבדל בין', 'איך לבחור', 'כמה עולה', 'מה זה', 'מה המשמעות של',
    'הכי טוב', 'מהו', 'איך עובד', 'מה כולל', 'כמה זמן', 'האם אפשר',
    'האם חוקי', 'האם בטוח', 'מתי כדאי', 'למה', 'מה לעשות אם',
    'X לעומת Y', 'X או Y', 'יתרונות וחסרונות',
    // English equivalents that often surface in IL B2B/SaaS searches
    'what is', 'how to choose', 'difference between', 'best for', 'how much does',
    'X vs Y', 'pros and cons', 'how does X work',
] as const

/**
 * Query shapes that stay in traditional SEO (skip AEO treatment).
 */
export const TRADITIONAL_SEO_ONLY_SHAPES = [
    'navigational (exact brand URL)',
    'login / account / dashboard',
    'docs / API reference / help center',
    'category browse without synthesis (e.g. "shoes", "laptops")',
    'SKU / exact product / exact branch lookup',
    'pure "near me" with strong local pack dominance',
] as const

// ────────────────────────────────────────────────────────────────────────────
// 4. Language decision tree (He vs En)
// ────────────────────────────────────────────────────────────────────────────

export interface LanguageDecisionInputs {
    /** B2B / B2C / mixed */
    business_type: 'b2b' | 'b2c' | 'mixed'
    /** Local IL service vs global delivery */
    delivery_locality: 'il_local' | 'il_national' | 'global_from_il'
    /** Buyer research corpus dominance — where buyers actually research */
    research_corpus: 'hebrew' | 'english' | 'mixed'
    /** Has a clear local trust requirement (reviews, address, hours) */
    trust_heavy: boolean
    /** Tech persona (developer / product / procurement) */
    tech_persona: boolean
}

export type LanguageDecision = {
    primary: LanguageMode
    secondary?: LanguageMode
    rationale: string
}

/**
 * Encodes the playbook §5 rule. Hebrew-first by default for IL local/B2C/
 * trust-heavy; English-first for global B2B/dev-heavy; mixed only by
 * evidence. Hard fallback: Hebrew commercial + English supporting glossary.
 */
export function decideLanguage(input: LanguageDecisionInputs): LanguageDecision {
    if (input.delivery_locality === 'global_from_il' && input.business_type === 'b2b' && input.tech_persona) {
        return {
            primary: 'en',
            secondary: 'he',
            rationale: 'Global B2B with tech persona — English-first acquisition, Hebrew localization secondary',
        }
    }
    if (input.delivery_locality === 'il_local' || input.trust_heavy || input.business_type === 'b2c') {
        return {
            primary: 'he',
            secondary: input.research_corpus === 'mixed' ? 'en' : undefined,
            rationale: 'IL local / B2C / trust-heavy — Hebrew-first commercial pages; English secondary only as supporting glossary/docs',
        }
    }
    if (input.research_corpus === 'mixed') {
        return {
            primary: 'mixed',
            rationale: 'Mixed buyer-research corpus with stable bilingual sub-terms — bilingual coverage required',
        }
    }
    if (input.research_corpus === 'english') {
        return {
            primary: 'en',
            secondary: 'he',
            rationale: 'English-dominant research corpus — English-first content, Hebrew commercial pages for IL conversion',
        }
    }
    return {
        primary: 'he',
        rationale: 'Default Hebrew-first for IL acquisition — never invert to "translated English"',
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. SERP feature priorities
// ────────────────────────────────────────────────────────────────────────────

export type SerpFeature =
    | 'ai_overview'
    | 'people_also_ask'
    | 'featured_snippet'
    | 'video_carousel'
    | 'image_pack'
    | 'local_pack'
    | 'shopping_carousel'

export type SerpPriority = 'must_capture' | 'must_harvest' | 'nice' | 'conditional_must' | 'skip'

export interface SerpFeatureRule {
    feature: SerpFeature
    /** Hebrew label for UI/markdown */
    label: string
    defaultPriority: SerpPriority
    /** When it becomes must-capture */
    mustWhen: string[]
    /** When it can be skipped */
    skipWhen: string[]
}

export const SERP_FEATURE_RULES: Record<SerpFeature, SerpFeatureRule> = {
    ai_overview: {
        feature: 'ai_overview',
        label: 'AI Overview / AI Mode',
        defaultPriority: 'must_capture',
        mustWhen: ['info-deep', 'comparison', 'how-to-choose', 'trust-heavy', 'what-is/diff/best/price/legal/safe'],
        skipWhen: ['pure navigational', 'exact login', 'ultra-simple local query'],
    },
    people_also_ask: {
        feature: 'people_also_ask',
        label: 'People Also Ask',
        defaultPriority: 'must_harvest',
        mustWhen: ['always — research layer for content mining + FAQ architecture'],
        skipWhen: [],  // never skip as research layer
    },
    featured_snippet: {
        feature: 'featured_snippet',
        label: 'Featured Snippet',
        defaultPriority: 'must_capture',
        mustWhen: ['definition', 'steps', 'comparison', 'list', 'short-answer'],
        skipWhen: ['pure local pack', 'product browse'],
    },
    video_carousel: {
        feature: 'video_carousel',
        label: 'Video carousel',
        defaultPriority: 'nice',
        mustWhen: ['demo-heavy', 'procedure-heavy', 'education-heavy', 'visual-trust markets'],
        skipWhen: ['abstract B2B without video consumption pattern'],
    },
    image_pack: {
        feature: 'image_pack',
        label: 'Image pack',
        defaultPriority: 'nice',
        mustWhen: ['visual services', 'hospitality', 'interior', 'beauty', 'retail', 'products', 'local proof'],
        skipWhen: ['pure SaaS', 'abstract services'],
    },
    local_pack: {
        feature: 'local_pack',
        label: 'Local Pack',
        defaultPriority: 'must_capture',
        mustWhen: ['any geo-modified intent', 'offline/service-area intent'],
        skipWhen: ['pure national/international SaaS'],
    },
    shopping_carousel: {
        feature: 'shopping_carousel',
        label: 'Shopping carousel',
        defaultPriority: 'conditional_must',
        mustWhen: ['ecommerce', 'catalog', 'physical products', 'real pricing/feed'],
        skipWhen: ['lead-gen', 'local service', 'consulting'],
    },
}

// ────────────────────────────────────────────────────────────────────────────
// 6. AEO platforms (target priority for IL)
// ────────────────────────────────────────────────────────────────────────────

export interface AeoPlatform {
    id: string
    label: string
    tier: 1 | 2
    notes: string
}

export const AEO_PLATFORMS: AeoPlatform[] = [
    { id: 'google_ai_overview', label: 'Google AI Overviews', tier: 1, notes: 'Indexability + snippet eligibility required. Hebrew available.' },
    { id: 'google_ai_mode',     label: 'Google AI Mode',     tier: 1, notes: 'Query fan-out → broader supporting-pages pool.' },
    { id: 'chatgpt_search',     label: 'ChatGPT Search',     tier: 1, notes: 'Fast/timely answers with web source links.' },
    { id: 'perplexity',         label: 'Perplexity',         tier: 1, notes: 'Answer engine with citations in every response.' },
    { id: 'gemini',             label: 'Gemini app/web',     tier: 2, notes: 'Related links/sources; quoted content links to source.' },
    { id: 'claude',             label: 'Claude Research',    tier: 2, notes: 'Web search + accurate citations + source tracking.' },
]

/**
 * What gets cited (high probability) vs what doesn't — used to instruct
 * agents on content shape for AEO-priority keywords.
 */
export const AEO_CITATION_PATTERNS = {
    cited_often: [
        'clear answer structure (heading → answer → support)',
        'facts + lists + comparison tables + definitions',
        'local pages: address + service + zone + hours + FAQs',
        'articles with clear author / organization / date / source integrity',
        'machine-readable entity + claim structure (schema, microdata)',
    ],
    cited_rarely: [
        'marketing fog without facts',
        'thin local pages',
        'JS-hidden primary content',
        'title/body language mismatch on Hebrew pages',
        'pages without strong source identity',
        'gated / preview-blocked content',
        'programmatic sludge',
    ],
} as const

// ────────────────────────────────────────────────────────────────────────────
// 7. Competitor analysis
// ────────────────────────────────────────────────────────────────────────────

export type CompetitorBucket = 'direct' | 'substitute' | 'adjacent' | 'reference'

export interface CompetitorBucketDef {
    id: CompetitorBucket
    labelHe: string
    definition: string
}

export const COMPETITOR_BUCKETS: CompetitorBucketDef[] = [
    { id: 'direct',     labelHe: 'מתחרה ישיר',          definition: 'Same buyer + same job + same monetization model' },
    { id: 'substitute', labelHe: 'תחליף',               definition: 'Different solution type, same job — steals your job, not your keyword' },
    { id: 'adjacent',   labelHe: 'קטגוריה סמוכה',       definition: 'Neighboring category, partial SERP+audience overlap, future expansion lane' },
    { id: 'reference',  labelHe: 'דוגמת התייחסות',      definition: 'Standard-setting execution example (not necessarily competing) for content/system benchmarks' },
]

/**
 * Scorecard weights (sum = 100). 60% score / 40% narrative split applies
 * at output composition — narrative analysis lives in the markdown
 * sections, scores live in the JSON records.
 */
export const COMPETITOR_SCORECARD_WEIGHTS = {
    serp_overlap:           25,
    page_type_fit:          20,
    authority_trust_proof:  15,
    local_presence_quality: 15,
    content_system_maturity: 15,
    asset_linkability:      10,
} as const

export interface CompetitorScorecard {
    serp_overlap: number              // 0-100
    page_type_fit: number
    authority_trust_proof: number
    local_presence_quality: number
    content_system_maturity: number
    asset_linkability: number
}

export function competitorThreatScore(s: CompetitorScorecard): number {
    const clamp = (v: number) => Math.max(0, Math.min(100, v))
    return Math.round(
        (clamp(s.serp_overlap)             * COMPETITOR_SCORECARD_WEIGHTS.serp_overlap            +
         clamp(s.page_type_fit)            * COMPETITOR_SCORECARD_WEIGHTS.page_type_fit           +
         clamp(s.authority_trust_proof)    * COMPETITOR_SCORECARD_WEIGHTS.authority_trust_proof   +
         clamp(s.local_presence_quality)   * COMPETITOR_SCORECARD_WEIGHTS.local_presence_quality  +
         clamp(s.content_system_maturity)  * COMPETITOR_SCORECARD_WEIGHTS.content_system_maturity +
         clamp(s.asset_linkability)        * COMPETITOR_SCORECARD_WEIGHTS.asset_linkability) / 100,
    )
}

/**
 * 5 always-on signals — every competitor analysis MUST surface these.
 * Per playbook §6.
 */
export const ALWAYS_ON_COMPETITOR_SIGNALS = [
    'topical_authority_venn',
    'site_architecture_depth',
    'link_profile_depth',
    'backlink_worthy_assets_inventory',
    'eeat_signals',
] as const

/**
 * Often-checked but not always-on. Surface only when relevant or when
 * specifically requested in the prompt context.
 */
export const SOMETIMES_COMPETITOR_SIGNALS = [
    'content_velocity_90d',                  // noisy without quality
    'brand_serp_defense',                    // must if brand significant
    'aio_presence_priority_non_branded',     // NOT per branded query (vanity)
    'funding_team_size_proxy',               // often overweighted
] as const

/**
 * IL-specific signals that global SEO frameworks miss. Pull these into
 * every competitor analysis on IL businesses.
 */
export const IL_SPECIFIC_SIGNALS = {
    language: [
        'Hebrew-only / Hebrew+English / Latin transliteration coverage',
        'Script mismatch absent on primary commercial pages',
        'Native Hebrew vs translated-English-pretending-to-be-Hebrew',
    ],
    local_trust: [
        'Hebrew review volume + quality',
        'Profile photos + response patterns + Q&A engagement',
        'Local addresses, branches, hours',
        'Hebrew local proof (case studies / testimonials in he)',
    ],
    off_site_corroboration: [
        'IL media mentions: Geektime, Ynet, Calcalist, Globes, vertical-specific outlets',
        'Industry associations + Israeli business directories',
        'Vertical-specific local listings',
        'University / association / partnership mentions',
    ],
    consumer_reality: [
        'Sabbath/holiday/calendar service availability signals',
        'City/district service zones (not just "Israel-wide")',
        'Local pack visibility on Hebrew geo-modifiers',
        'True mobile usability (IL is mobile-first)',
    ],
    /** NOT primary signal — discovery only, never deliverable basis */
    discovery_only: [
        'WhatsApp group screenshots',
    ],
} as const

// ────────────────────────────────────────────────────────────────────────────
// 8. Cluster architecture + programmatic SEO + striking distance + canniba
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default per-pillar spoke composition — topic cluster + page-type lattice,
 * NOT pure silo. Aligns with AI Mode query fan-out behavior.
 */
export const DEFAULT_PILLAR_COMPOSITION = {
    pillar: 1,
    info_deep_spokes: { min: 2, max: 3 },
    comparison_spokes: { min: 1, max: 2 },
    pricing_explainer: 1,
    faq_or_decision_guide: 1,
    trust_proof_page: 1,
    /** Local pages: variable — only when geo-intent strong */
    local_pages_when_geo: 'variable',
} as const

/** Total spokes per commercial pillar — sanity range. */
export const SPOKES_PER_PILLAR_RANGE = { min: 6, max: 8 } as const

/**
 * Programmatic SEO protection rules — all 6 must pass before publishing
 * a programmatic page. Per playbook §8.
 */
export const PROGRAMMATIC_PROTECTION_RULES = [
    'distinct_intent_or_entity_rule',
    'unique_usefulness_rule',
    'template_quality_floor',
    'thin_page_quarantine',
    'scalable_proof_rule',
    'cannibalization_pre_check',
] as const

export type ProgrammaticRule = typeof PROGRAMMATIC_PROTECTION_RULES[number]

export const PROGRAMMATIC_RULE_DESCRIPTIONS: Record<ProgrammaticRule, string> = {
    distinct_intent_or_entity_rule: 'Page must have separate entity / geo / use-case / decision need',
    unique_usefulness_rule:         'Payload beyond template: price logic, availability, local proof, FAQs, differentiators, branch/team data',
    template_quality_floor:         'Reader must understand "how this differs from neighboring page" without effort',
    thin_page_quarantine:           'Low-quality candidates → noindex draft bucket until manual QA',
    scalable_proof_rule:            'If you cannot scale trust layer, do not scale page count',
    cannibalization_pre_check:      'Page must map to canonical cluster + single target intent',
}

/**
 * Striking-distance buckets. With GSC data → use accurately. Without GSC →
 * estimate-mode (acceptable temporarily, not long-term production).
 */
export const STRIKING_DISTANCE = {
    fast_optimization:    { positions: [4, 8] as const,   label: 'Fast optimization — title/meta/internal links/intent match' },
    content_upgrade:      { positions: [9, 15] as const,  label: 'Content/structure upgrade — length, depth, format, schema' },
    rebuild_or_remap:     { positions: [16, 20] as const, label: 'Rebuild or re-map — page may be wrong type for intent' },
} as const

/**
 * Cannibalization detection rule. ALL must be true to flag (with exceptions).
 * Per playbook §10.
 */
export interface CannibalizationCheck {
    same_language_geo: boolean
    same_primary_intent: boolean
    same_page_type_or_close_variant: boolean
    /** % overlap on important keyword set; threshold = 70 */
    query_overlap_pct: number
    /** Has Google switched lead URL between them in SERP history? */
    url_substitution_in_serp: boolean
}

export interface CannibalizationException {
    different_location_entity?: boolean
    different_language_version?: boolean
    different_legal_compliance_intent?: boolean
    different_product_entity?: boolean
}

export function flagCannibalization(
    check: CannibalizationCheck,
    exceptions: CannibalizationException = {},
): boolean {
    if (Object.values(exceptions).some(Boolean)) return false
    return check.same_language_geo
        && check.same_primary_intent
        && check.same_page_type_or_close_variant
        && check.query_overlap_pct >= 70
        && check.url_substitution_in_serp
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Personas (JTBD format + min fields + journey + trust)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Job-to-be-done statement format. Verbatim from playbook §12.
 *   When [situation], I want [progress], so that [outcome],
 *   without risking [anxiety / switching cost / downside].
 */
export interface JtbdStatement {
    situation: string
    progress: string
    outcome: string
    risk: string
}

export const JTBD_TEMPLATE_HE =
    'כש[סיטואציה], אני רוצה [פעולה / התקדמות], על מנת ש[תוצאה רצויה], מבלי לסכן [חרדה / עלות מעבר / חיסרון].'

export const PERSONA_REQUIRED_FIELDS = [
    'segment_definition',
    'jtbd_statement',
    'primary_triggers',
    'top_queries_by_stage',
    'decision_criteria',
    'trust_hierarchy',
    'objections_anxieties',
    'switching_cost',
    'preferred_proof',
    'channels_and_behaviors',
    'language_mode',
] as const

export type PersonaRequiredField = typeof PERSONA_REQUIRED_FIELDS[number]

export const PERSONA_OPTIONAL_FIELDS = [
    'age',
    'role',
    'lifestyle_content',
] as const  // only include when CAUSALLY affects search/decision behavior

/** Buying journey columns — playbook §12. */
export const BUYING_JOURNEY_COLUMNS = [
    'stage', 'trigger', 'jtbd', 'questions_asked', 'query_shapes',
    'trust_threshold', 'primary_channel', 'best_content_format',
    'key_cta', 'drop_off_risk', 'metric', 'owner',
] as const

/** Trust hierarchy method — priority order. */
export const TRUST_HIERARCHY_METHOD_ORDER = [
    'customer_or_winloss_interviews',     // 1 — highest fidelity
    'sales_call_mining',                  // 2
    'review_mining',                      // 3
    'competitor_messaging_patterns',      // 4
    'vertical_priors',                    // 5 — lowest fidelity
] as const

/** Weighted trust stack — combine to find which decides this vertical. */
export const TRUST_STACK_DIMENSIONS = [
    'official_licensed_authority',
    'peer_reviews',
    'expert_endorsement',
    'brand_familiarity',
    'local_proof',
    'price_transparency',
    'case_evidence',
    'usability_convenience',
] as const

/** Pricing validation defaults — playbook §12. */
export const PRICING_VALIDATION_DEFAULT = [
    'competitor_pricing_benchmark',
    'sales_call_objection_mining',
    'win_loss_review',
    'wtp_interviews',
    'segmentation_by_use_case',
] as const

export const PRICING_VALIDATION_RIGOR = [
    'van_westendorp_psm',     // homogeneous audience + sample discipline only
    'conjoint',                // budget + data discipline + real trade-offs
    'packaging_offer_tests',   // often more useful than "pure price research"
] as const

// ────────────────────────────────────────────────────────────────────────────
// 10. Positioning + first-win channel + realism
// ────────────────────────────────────────────────────────────────────────────

/** Positioning stack — mix, not single framework. */
export const POSITIONING_STACK = {
    jtbd:                'Demand + progress explanation',
    obviously_awesome:   'Positioning + category fit',
    mom_test:            'Validation discipline',
    storybrand:          'Messaging layer ONLY (not strategic core)',
    crossing_the_chasm:  'Add when enterprise-heavy',
} as const

/** First-Win Channel must-pass tests. ALL 3 required. */
export const FIRST_WIN_CHANNEL_TESTS = [
    'time_to_first_proof_max_45_days',
    'reachable_buyer_without_heavy_infra',
    'high_learning_density',
] as const

/** Secondary tests — applied AFTER the 3 must-pass. */
export const FIRST_WIN_SECONDARY_TESTS = [
    'cac_realism',
    'founder_team_fit',
    'repeatability',
    'scalability',
] as const

/**
 * Realism check formula:
 *   Forecast = Addressable Clicks × Expected CTR Gain × CVR × Lead Quality × Close Rate
 * Then apply: resource haircut + execution haircut + market noise haircut.
 * Always produce 3 scenarios (Conservative / Base / Upside).
 */
export interface RealismForecastInputs {
    addressable_clicks: number
    expected_ctr_gain: number      // 0–1
    cvr: number                    // 0–1
    lead_quality: number           // 0–1 multiplier
    close_rate: number             // 0–1
    resource_haircut: number       // 0–1 (1 = no haircut)
    execution_haircut: number      // 0–1
    market_noise_haircut: number   // 0–1
}

export function realismForecast(i: RealismForecastInputs): number {
    return Math.round(
        i.addressable_clicks * i.expected_ctr_gain * i.cvr * i.lead_quality * i.close_rate
        * i.resource_haircut * i.execution_haircut * i.market_noise_haircut,
    )
}

export type RealismScenario = 'conservative' | 'base' | 'upside'

export const REALISM_CHECKLIST = [
    'baseline_exists',
    'comparable_cohort_available',
    'page_type_precedent_known',
    'no_impressions_vs_addressable_traffic_confusion',
    'zero_click_attrition_accounted',
    'no_unrealistic_cvr',
    'matches_team_bandwidth',
] as const

// ────────────────────────────────────────────────────────────────────────────
// 11. Quality gate (10-check self-critique pre-ship pass)
// ────────────────────────────────────────────────────────────────────────────

export const QUALITY_GATE_CHECKS = [
    'source_spot_check',                       // 3-5 random claims verified
    'contradiction_pass',                      // internal consistency
    'actionability_pass',                      // every recommendation → next-task
    'language_script_qa',                      // Hebrew/English mixed integrity
    'math_sanity',                             // scores, forecasts, CTR logic
    'intent_integrity',                        // no mixed intents in cluster
    'thinness_novelty',                        // distinct reason-to-exist
    'stakeholder_readout_test',                // SEO+content+founder all understand
    'out_loud_read',                           // catches fluff, tautology, false precision
    'so_what_test',                            // every section ends with a clear decision
] as const

export type QualityCheck = typeof QUALITY_GATE_CHECKS[number]

export interface QualityGateResult {
    pass: boolean
    failed_checks: Array<{
        check: QualityCheck
        reasons: string[]
        /** true → must regenerate; false → flag in markdown but ship */
        hard_failure: boolean
    }>
}

/** Hard-failure checks — content cannot ship if any fails. Others = warnings. */
export const HARD_FAILURE_CHECKS: ReadonlySet<QualityCheck> = new Set([
    'math_sanity',
    'language_script_qa',
    'intent_integrity',
    'source_spot_check',
])

// ────────────────────────────────────────────────────────────────────────────
// 12. Confidence labeling
// ────────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'working_hypothesis'

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, { he: string; description: string }> = {
    high: {
        he: 'גבוה',
        description: 'Verified data — primary source quoted, observed behavior, structured dataset',
    },
    medium: {
        he: 'בינוני',
        description: 'Extrapolation from data — pattern inferred from observed signals',
    },
    working_hypothesis: {
        he: 'השערה — דורש אימות',
        description: 'No interview/data — public-signal proxy. NEVER claim "validated".',
    },
}

/** High-stakes claim categories — ALWAYS carry an inline confidence marker. */
export const HIGH_STAKES_CLAIM_CATEGORIES = [
    'pricing',
    'kpi_forecast',
    'traffic_projection',
    'cac_estimate',
    'tam_sam_som',
    'cvr_estimate',
    'time_to_result',
    'market_size',
] as const

/** Inline marker for markdown narrative — `[confidence: high]` / etc. */
export function inlineConfidenceMarker(level: ConfidenceLevel): string {
    return `[confidence: ${level === 'working_hypothesis' ? 'השערה' : CONFIDENCE_LABELS[level].he}]`
}

// ────────────────────────────────────────────────────────────────────────────
// 13. JSON record schemas (per-stage structured output)
// ────────────────────────────────────────────────────────────────────────────

/** Common fields every record carries — provenance + audit. */
export interface RecordCommon {
    confidence: ConfidenceLevel
    /** Source attestation: URL list, dataset name, or "ai_inference" */
    evidence: string[]
    /** ISO 8601 timestamp when record was produced. */
    generated_at: string
}

/**
 * Keyword record — output of seo_keyword_research stage. Scores carry
 * sub-component breakdown so reviewers can audit the formula application.
 */
export interface KeywordRecord extends RecordCommon {
    keyword: string
    language: 'he' | 'en'
    intent: IntentClassification
    cluster: string
    page_type: string
    serp_features_present: SerpFeature[]
    volume_monthly?: number
    cpc_ils?: number
    difficulty_0_100?: number
    /** Striking-distance bucket if currently ranked. */
    current_position?: number
    striking_bucket?: 'fast_optimization' | 'content_upgrade' | 'rebuild_or_remap' | null
    /** Opportunity score breakdown */
    opportunity: OpportunityComponents & { total: number; decision: OpportunityDecision }
    /** AEO Target subset flag + sub-score */
    aeo: AeoTargetComponents & { total: number; is_priority: boolean }
    hard_stops: string[]
    recommended_action: string
    owner: string
}

export interface CompetitorRecord extends RecordCommon {
    name: string
    url: string
    bucket: CompetitorBucket
    scorecard: CompetitorScorecard & { total: number }
    /** Always-on signals — required */
    topical_authority_venn: string
    site_architecture_depth: string
    link_profile_depth: string
    backlink_worthy_assets_inventory: string[]
    eeat_signals: string
    /** IL-specific (when applicable) */
    il_signals?: {
        language_coverage: string
        local_trust: string
        off_site_corroboration: string
        consumer_reality: string
    }
    content_gaps_at_competitor: string[]
    threats_to_us: string[]
}

export interface PersonaRecord extends RecordCommon {
    name: string
    segment_definition: string
    jtbd_statement: JtbdStatement
    primary_triggers: string[]
    top_queries_by_stage: Array<{ stage: string; queries: string[] }>
    decision_criteria: string[]
    trust_hierarchy: Array<{ source: string; weight: number }>
    objections_anxieties: Array<{ objection: string; rebuttal: string }>
    switching_cost: string
    preferred_proof: string[]
    channels_and_behaviors: string
    language_mode: LanguageMode
    pricing_validation: {
        competitor_benchmark_range_ils: string
        wtp_range_ils: string
        price_sensitivity: 'low' | 'medium' | 'high'
        recommended_price_point_ils: string
        method_used: string[]
    }
}

export interface OpportunityRecord extends RecordCommon {
    topic: string
    cluster: string
    primary_intent: PrimaryIntent
    language_mode: LanguageMode
    opportunity_score: number
    business_value: number
    win_probability: number
    aeo_fit: number
    page_type: string
    recommended_action: string
    owner: string
}