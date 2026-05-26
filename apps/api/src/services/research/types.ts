/**
 * Research pipeline types — single source of truth for the intent-aware
 * research architecture.
 *
 * Spec: docs/research-pipeline-design.md
 *
 * Phase 1 deliverable. Consumers will migrate to these types in Phase 2+.
 * Until then a compatibility reader (services/research/reader.ts) keeps
 * legacy `researchData.stage1..stage5` access working.
 */

// ─── Intents ───────────────────────────────────────────────────────────────

export type ResearchIntent =
    | 'seo_organic'      // SEO + content + AEO (modern SEO is one bucket)
    | 'paid_search'      // Google Ads / Meta paid (lead gen)
    | 'social_organic'   // IG/FB/LinkedIn organic posting
    | 'email_crm'        // Email/CRM nurturing
    | 'ecommerce'        // Shopify/Woo product feed driven
    | 'multichannel'     // 3+ of the above

export const ALL_INTENTS: readonly ResearchIntent[] = [
    'seo_organic', 'paid_search', 'social_organic', 'email_crm', 'ecommerce', 'multichannel',
] as const

// ─── Stage IDs ─────────────────────────────────────────────────────────────

export type StageId =
    // Discovery
    | 'competitor_landscape'
    | 'internal_seo_audit'
    | 'seo_keyword_research'
    | 'aeo_visibility'
    | 'link_audit'
    | 'paid_setup_fork'             // Phase 2026.02 — explicit user choice: has_history vs no_history (gates Path A vs B)
    | 'paid_data_inventory'
    | 'client_account_baseline'     // Phase 4.2.1 — Google Ads + GA4 historical reality anchor (preflight for all paid stages)
    | 'paid_questionnaire'          // Phase 2026.02 — Path A (no_history) starting numbers + preferences (12 fields per playbook §1.2)
    | 'paid_csv_ingest'             // Phase 2026.02 — Path B-2 (has_history + no_integration) CSV uploads + parse
    | 'client_account_baseline_csv' // Phase 2026.02 — mirror of client_account_baseline that reads parsed CSV instead of live API
    | 'paid_competitor_landscape'   // Phase 4.2.1 — paid-specific competitor research
    | 'paid_keyword_research'       // Phase 4.2.2 — paid keyword landscape
    | 'paid_budget_scenarios'       // Phase 4.2.3 — IL-specific paid budget tiers
    | 'paid_audit'
    | 'social_landscape'
    | 'email_competitor_audit'
    // Audience
    | 'audience_personas'
    // Strategy
    | 'positioning'
    | 'cost_timeline_modeling'
    | 'strategy_options'
    | 'validation'
    // Execution
    | 'content_plan'
    | 'media_plan'

export const ALL_STAGE_IDS: readonly StageId[] = [
    'competitor_landscape', 'internal_seo_audit', 'seo_keyword_research',
    'aeo_visibility', 'link_audit',
    'paid_setup_fork',
    'paid_data_inventory',
    'client_account_baseline',
    'paid_questionnaire', 'paid_csv_ingest', 'client_account_baseline_csv',
    'paid_competitor_landscape', 'paid_keyword_research', 'paid_budget_scenarios',
    'paid_audit',
    'social_landscape', 'email_competitor_audit',
    'audience_personas', 'positioning', 'cost_timeline_modeling',
    'strategy_options', 'validation',
    'content_plan', 'media_plan',
] as const

// Universal stages — always part of every plan regardless of intent.
// Phase E3 — cost_timeline_modeling inserted after positioning (stable target/
// audience to budget for) and before strategy_options (consumes calibrated $).
export const UNIVERSAL_STAGES: readonly StageId[] = [
    'audience_personas', 'positioning', 'cost_timeline_modeling',
    'strategy_options', 'validation',
] as const

// ─── Stage descriptors (catalog) ───────────────────────────────────────────

export type StageCategory = 'discovery' | 'audience' | 'strategy' | 'execution'

export interface StageDescriptor {
    id: StageId
    category: StageCategory
    /** Hebrew title for UI cards. */
    titleHe: string
    /** Short Hebrew description for UI cards. */
    descriptionHe: string
    /** Integration keys this stage prefers — when missing, runs degraded. */
    preferredIntegrations: Array<
        | 'dataforseo' | 'firecrawl' | 'brave' | 'gsc' | 'googleAds' | 'meta' | 'ga4' | 'anthropic'
    >
    /** Stage IDs whose output this stage reads (validation runs here). */
    upstream: StageId[]
}

export const STAGE_CATALOG: Record<StageId, StageDescriptor> = {
    competitor_landscape: {
        id: 'competitor_landscape', category: 'discovery',
        titleHe: 'נוף תחרותי',
        descriptionHe: 'מתחרים ישירים, מבנה שוק, נוכחות דיגיטלית, gaps',
        preferredIntegrations: ['brave', 'anthropic'],
        upstream: [],
    },
    internal_seo_audit: {
        id: 'internal_seo_audit', category: 'discovery',
        titleHe: 'אודיט SEO פנימי (טכני + on-page)',
        descriptionHe: 'inventory של URLs, on-page metrics, schema coverage, IA depth, technical issues, content gaps. Sitemap + DFS on-page audit',
        preferredIntegrations: ['dataforseo'],
        upstream: [],
    },
    seo_keyword_research: {
        id: 'seo_keyword_research', category: 'discovery',
        titleHe: 'מחקר מילות מפתח (SEO)',
        descriptionHe: '30+ keywords עם volume/CPC/difficulty, gaps מול מתחרים, SERP analysis',
        preferredIntegrations: ['dataforseo', 'firecrawl', 'brave'],
        upstream: [],
    },
    aeo_visibility: {
        id: 'aeo_visibility', category: 'discovery',
        titleHe: 'נראות AI (AEO)',
        descriptionHe: 'ציטוטים ב-Claude/ChatGPT/Perplexity, schema audit, GSC AI-Overview signals',
        preferredIntegrations: ['anthropic', 'firecrawl', 'gsc'],
        upstream: [],
    },
    link_audit: {
        id: 'link_audit', category: 'discovery',
        titleHe: 'אודיט פרופיל קישורים (Backlinks)',
        descriptionHe: 'Profile audit + lost links recovery + outreach roadmap + benchmarking מול 5 מתחרים. דורש DFS Backlinks API',
        preferredIntegrations: ['dataforseo'],
        upstream: ['competitor_landscape'],
    },
    paid_setup_fork: {
        id: 'paid_setup_fork', category: 'discovery',
        titleHe: 'הגדרת פרסום — נקודת התחלה',
        descriptionHe: 'בחירה מפורשת של המשתמש: האם יש היסטוריה / קמפיינים פעילים, או מתחילים מאפס. ' +
            'נועל את המסלול הבא — paid_questionnaire (אפס היסטוריה) או client_account_baseline / paid_csv_ingest (יש היסטוריה).',
        preferredIntegrations: [],
        upstream: [],
    },
    paid_data_inventory: {
        id: 'paid_data_inventory', category: 'discovery',
        titleHe: 'מלאי נתונים — פרסום ממומן',
        descriptionHe: 'מיפוי החיבורים: Google Ads / Meta / GA4 / GTM / מעקב שיחות / CRM / דוחות היסטוריים. ' +
            'קובע tier (T0-T4) — איזה bid strategies מותרים, אילו פעולות setup חסרות. ' +
            'מתנהג כ-prerequisite ל-paid_audit ול-media_plan.',
        preferredIntegrations: ['googleAds', 'meta', 'ga4', 'gsc'],
        upstream: ['paid_setup_fork'],
    },
    paid_questionnaire: {
        id: 'paid_questionnaire', category: 'discovery',
        titleHe: 'שאלון פרסום — מתחילים מאפס',
        descriptionHe: 'מסלול A (no_history) בלבד: 12 שדות סטנדרטיים שמזינים את setup_roadmap — ' +
            'מטרה ראשית, תקציב התחלתי, חלוקת ערוצים, גיאוגרפיה, URL מוצר, פעולות המרה קיימות, ' +
            'יכולת בדיקה (שבועות), התנגדות מרכזית, מתחרים חסומים.',
        preferredIntegrations: [],
        upstream: ['paid_setup_fork'],
    },
    paid_csv_ingest: {
        id: 'paid_csv_ingest', category: 'discovery',
        titleHe: 'יבוא דוחות CSV — פרסום ממומן',
        descriptionHe: 'מסלול B-2 (has_history + ללא חיבור OAuth): העלאת 4 קבצים נדרשים + 2 אופציונליים ' +
            'מ-Google Ads / Meta Ads Manager / GA4. הפלט מנורמל לאותו schema שמייצר client_account_baseline החי. ' +
            'parser פנימי — לא ספרייה חיצונית.',
        preferredIntegrations: [],
        upstream: ['paid_setup_fork'],
    },
    client_account_baseline_csv: {
        id: 'client_account_baseline_csv', category: 'discovery',
        titleHe: 'בייסליין חשבון — מקור CSV',
        descriptionHe: 'תאום ל-client_account_baseline אבל קורא מ-paid_csv_ingest במקום מה-API החי. ' +
            'שלבי downstream (paid_competitor_landscape, paid_keyword_research, paid_budget_scenarios, paid_audit) ' +
            'מקבלים את אותו schema ולא צריכים לדעת מאיפה הגיעו הנתונים.',
        preferredIntegrations: [],
        upstream: ['paid_csv_ingest'],
    },
    // Phase 4.2.1 — runs ONCE per research session, cached 24h. Pulls all
    // client-specific reality data (SQR, Auction Insights, Change History,
    // account-level CPC/CR, GA4 events/funnel/seasonality) scoped to the
    // campaigns the user has assigned to this instance. Every downstream paid
    // stage reads from `rd.results.client_account_baseline` instead of
    // refetching — single source of truth, cost-disciplined, consistent.
    client_account_baseline: {
        id: 'client_account_baseline', category: 'discovery',
        titleHe: 'מה אנחנו רואים בחשבון שלכם',
        descriptionHe: 'מושך את כל הנתונים ההיסטוריים שלכם פעם אחת: Google Ads (SQR, Auction Insights, היסטוריית שינויים, account-level CPC) + GA4 (events, funnel, seasonality). מסונן לפי הקמפיינים שבחרתם. כל שלבי הפרסום הבאים נשענים על הקאש הזה במקום למשוך מחדש.',
        preferredIntegrations: ['googleAds', 'ga4'],
        upstream: [],
    },
    paid_audit: {
        id: 'paid_audit', category: 'discovery',
        titleHe: 'אודיט פרסום ממומן',
        descriptionHe: 'Google Ads + Meta — היסטוריה, blockers, איכות מעקב, methodology. ' +
            'במצב cold (T0/T1): מחזיר setup roadmap של 7 ימים. במצב warm (T2+): takeover audit.',
        preferredIntegrations: ['googleAds', 'meta', 'ga4'],
        upstream: ['paid_data_inventory'],
    },
    paid_competitor_landscape: {
        id: 'paid_competitor_landscape', category: 'discovery',
        titleHe: 'נוף תחרותי — פרסום ממומן',
        descriptionHe: 'מי המתחרים שלכם מפרסמים בתשלום עכשיו, באילו פלטפורמות, באילו אנגלים יצירתיים, כמה זמן רצות המודעות, ומה ה-CRO של דפי הנחיתה שלהם. Meta Ad Library + Google Ads Transparency Center + Firecrawl LP audits — 5 buckets (Direct/Substitute/Adjacent/Reference).',
        preferredIntegrations: ['meta', 'firecrawl', 'anthropic'],
        // Phase 4.2.1 — depends on baseline for Auction Insights ground-truth
        // (which competitors actually win on YOUR auctions, scoped to YOUR campaigns).
        upstream: ['competitor_landscape', 'client_account_baseline'],
    },
    paid_keyword_research: {
        id: 'paid_keyword_research', category: 'discovery',
        titleHe: 'מחקר מילות מפתח — פרסום ממומן',
        descriptionHe: 'Paid search keyword landscape — אילו מילות מפתח קונים מתחרים, CPC estimates, intent ladder (TOFU/MOFU/BOFU), SERP ad-density. DataForSEO keywords_for_site + ads_search.',
        preferredIntegrations: ['dataforseo', 'anthropic'],
        // Phase 4.2.1 — depends on baseline for SQR top-converting terms (Tier-1
        // seeds), n-gram waste patterns (preemptive negatives), and account CPC.
        upstream: ['paid_competitor_landscape', 'client_account_baseline'],
    },
    paid_budget_scenarios: {
        id: 'paid_budget_scenarios', category: 'strategy',
        titleHe: 'תרחישי תקציב — פרסום ממומן',
        descriptionHe: '3 דרגות תקציב IL-specific (שמרני / מאוזן / אגרסיבי) עם KPI projection: impressions, clicks, conv, CPA range, ROAS target. מבוסס על paid_keyword_research CPC estimates + IL benchmarks per vertical.',
        preferredIntegrations: ['anthropic'],
        // Phase 4.2.1 — baseline supplies real account CPC/CR/CPA — anchor
        // scenarios on actual history when available, fall back to industry.
        upstream: ['paid_competitor_landscape', 'paid_keyword_research', 'audience_personas', 'client_account_baseline'],
    },
    social_landscape: {
        id: 'social_landscape', category: 'discovery',
        titleHe: 'נוף רשתות חברתיות',
        descriptionHe: 'מתחרים ב-IG/FB/LinkedIn, content patterns, אפיון tone',
        preferredIntegrations: ['brave', 'anthropic'],
        upstream: [],
    },
    email_competitor_audit: {
        id: 'email_competitor_audit', category: 'discovery',
        titleHe: 'אודיט ניוזלטרים מתחרים',
        descriptionHe: 'תדירות, טון, נושאים, CTAs של 5+ מתחרים',
        preferredIntegrations: ['anthropic'],
        upstream: [],
    },
    audience_personas: {
        id: 'audience_personas', category: 'audience',
        titleHe: 'פרסונות קהל יעד',
        descriptionHe: '1-3 פרסונות עם דמוגרפיה, כאבים, טריגרים, channel preferences, CAC צפוי',
        preferredIntegrations: ['ga4', 'anthropic'],
        upstream: [],
    },
    positioning: {
        id: 'positioning', category: 'strategy',
        titleHe: 'מיצוב',
        descriptionHe: 'mission, positioning statement, value props, archetype',
        preferredIntegrations: ['anthropic'],
        upstream: ['competitor_landscape', 'audience_personas'],
    },
    cost_timeline_modeling: {
        id: 'cost_timeline_modeling', category: 'strategy',
        titleHe: 'מודל עלויות וזמנים',
        descriptionHe: 'IL pricing constants + time-to-rank formulas → calibrated $ + month-by-month KPI projection per scenario. Feeds strategy_options',
        preferredIntegrations: ['anthropic'],
        upstream: ['competitor_landscape', 'internal_seo_audit', 'seo_keyword_research', 'aeo_visibility', 'link_audit'],
    },
    strategy_options: {
        id: 'strategy_options', category: 'strategy',
        titleHe: 'אופציות אסטרטגיה',
        descriptionHe: 'תרחיש Smart (low-comp) ו-All-In (head terms), KPIs, timelines, budgets',
        preferredIntegrations: ['anthropic'],
        upstream: ['positioning', 'audience_personas'],
    },
    validation: {
        id: 'validation', category: 'strategy',
        titleHe: 'אימות אסטרטגיה',
        descriptionHe: 'realism check על KPIs, blindspot detection, confidence score',
        preferredIntegrations: ['anthropic'],
        upstream: ['strategy_options'],
    },
    content_plan: {
        id: 'content_plan', category: 'execution',
        titleHe: 'תוכנית תוכן',
        descriptionHe: 'יומן עריכה ל-3 חודשים — נושאים, פלטפורמות, כותבים, תאריכים',
        preferredIntegrations: ['anthropic'],
        upstream: ['strategy_options'],
    },
    media_plan: {
        id: 'media_plan', category: 'execution',
        titleHe: 'תוכנית מדיה (פרסום ממומן)',
        descriptionHe: 'קמפיינים, ad groups, תקציבים, KPIs, gates לעלייה',
        preferredIntegrations: ['googleAds', 'meta', 'anthropic'],
        upstream: ['paid_audit', 'strategy_options'],
    },
}

// ─── Plan + status ─────────────────────────────────────────────────────────

export type StageState =
    | 'pending'      // queued, not yet run
    | 'running'      // in flight
    | 'completed'    // ran with all required integrations
    | 'degraded'     // ran without some integrations — surfaces UI warning
    | 'failed'       // last run failed; can retry

export interface StageStatus {
    state: StageState
    runAt?: string
    failureReason?: string
    /**
     * Why we marked degraded — list of missing integrations the user should
     * connect. UI uses these to render the bright warning + deep-link CTAs.
     */
    degradedReasons?: string[]
    /**
     * Phase 4.7 — set when an upstream stage re-ran AFTER this stage. The
     * `state` field stays whatever it was (typically 'completed') so reads
     * still work, but the UI shows a "stale — re-run recommended" badge and
     * the dependency-aware re-runner can cascade-clear if the user confirms.
     * Cleared whenever this stage itself re-runs.
     */
    stale?: {
        since: string         // ISO timestamp of when the staleness was recorded
        sourceStage: StageId  // which upstream stage's re-run invalidated us
    }
}

export interface StageResult {
    /** Hybrid markdown content (narrative sections + embedded JSON code blocks). */
    content: string
    /** Where the data came from — for audit + UI provenance badge. */
    source: 'dataforseo' | 'firecrawl' | 'brave' | 'gsc' | 'googleAds' | 'meta' | 'ga4'
        | 'anthropic' | 'mixed' | 'legacy_migration'
    runAt: string
    /** Concrete list of integrations the run actually queried. */
    integrationsUsed: string[]
    /**
     * Structured records extracted from the JSON code-block in `content`.
     * Shape varies by stage (KeywordRecord[], CompetitorRecord[], etc.).
     * Undefined for stages that don't emit structured records (e.g. legacy
     * migrations, validation narrative). Stage-typed at consumer site.
     */
    records?: unknown[]
    /**
     * Total DFS cost in USD reported across this stage's pre-fetch calls.
     * Logging/audit only — tenant pays DataForSEO directly with their own
     * key. Sum of cache-miss calls only (cache hits cost 0).
     */
    dfsCost?: number
    /**
     * Section-level confidence rollup — worst confidence across the stage's
     * sections. UI shows this on the pipeline-stage card.
     */
    confidence?: 'high' | 'medium' | 'working_hypothesis'
    /**
     * Self-critique gate outcome (Phase 3.5e). Set when the 2nd-pass critic
     * ran. Records pass/fail per check + warnings + (optional) revision marker.
     * UI surfaces a banner with hard_failures or warnings count.
     */
    qualityGate?: {
        pass: boolean
        hardFailures: string[]
        warnings: string[]
        revised: boolean
        skipped?: boolean
        /** Phase 3.14 — failures resolved by server-side post-processing. */
        autoCorrected?: string[]
    }
    /**
     * Non-records JSON fields from the hybrid response — sibling top-level
     * keys parsed alongside `records` (e.g. our_link_profile, link_gap_targets,
     * cross_validation_matrix, confidence_score). Phase 3.10b adds backlinks
     * suite output here for competitor_landscape.
     */
    extras?: Record<string, unknown>
    /**
     * Phase 4.0 — raw prefetch payload (DFS + Firecrawl + GMB + seasonality).
     * Stored alongside the LLM output so downstream stages can cite
     * calibrated signals directly instead of re-deriving them from the
     * synthesised markdown. Stage-typed at consumer site (e.g.
     * `CompetitorLandscapeDfsData`, `SeoKeywordResearchDfsData`).
     */
    dfsData?: unknown
}

export interface ResearchPlan {
    stages: StageId[]
    status: Partial<Record<StageId, StageStatus>>
}

// ─── ResearchData (the JSONB column shape going forward) ───────────────────

export interface ResearchDataV2 {
    /** Captured in פרופיל עסקי step. Schema-loose by design. */
    answers?: Record<string, unknown>
    intent?: ResearchIntent
    plan?: ResearchPlan
    results?: Partial<Record<StageId, StageResult>>

    /**
     * Strategy outputs kept flat at the top level for legacy consumers
     * (Mazhir / Brand-Deep / contentPlan readers). These do NOT migrate
     * into `results.<stage_id>` — they have their own dedicated keys
     * and are written by their respective controllers.
     */
    chosenScenario?: unknown
    chosenScenarioAt?: string
    paidProfile?: unknown
    mediaPlan?: unknown
    contentPlan?: unknown
    mazhirAudit?: unknown
    brandPhaseAt?: unknown

    /** Audit trail of prior plans when user changes intent mid-flight. */
    archivedPlans?: ResearchPlan[]

    /** Generation timestamp, kept for legacy display in UI. */
    generatedAt?: string

    // ── Legacy fields (read-only via reader.ts during transition) ──
    // These ship until Phase 7 cleanup. New code MUST NOT write to them.
    stage1?: string; stage1GeneratedAt?: string
    stage2?: string; stage2GeneratedAt?: string
    stage3?: string; stage3GeneratedAt?: string
    stage4?: string; stage4GeneratedAt?: string
    stage5?: string; stage5GeneratedAt?: string
    report?: string
    strategy?: unknown
    strategyStage1?: unknown; strategyStage1GeneratedAt?: string
    strategyStage2?: unknown; strategyStage2GeneratedAt?: string
    strategyStage3?: unknown; strategyStage3GeneratedAt?: string
    strategyStage4?: unknown; strategyStage4GeneratedAt?: string
}