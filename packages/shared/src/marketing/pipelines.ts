// Pipeline registry — each pipeline is an independent execution unit that
// produces a specific output (research report, audit, media plan, content
// calendar, etc.). Pipelines are gated by intents and depend on integrations.
//
// Future-proof contract:
//   - Each pipeline writes to its OWN namespace in pipelineState.
//   - Adding a new intent later activates the relevant pipelines without
//     touching existing ones.
//   - Disabling an intent does NOT delete pipeline state — just hides it.
//   - Pipelines never read each other's state directly; they call typed
//     accessors that handle legacy/new namespace fallback.

import type { MarketingIntent } from './intents'

export type PipelineId =
    // Discovery / research
    | 'research_paid'
    | 'research_seo'
    | 'research_content'
    | 'research_social'
    | 'research_email'
    | 'research_ecommerce'
    | 'strategy'
    // Paid (Mazhir family)
    | 'mazhir_audit'
    | 'mazhir_media_plan'
    | 'mazhir_gtm_setup'
    | 'mazhir_conversions'
    | 'mazhir_executor'
    // Meta paid
    | 'meta_audit'
    | 'meta_media_plan'
    | 'meta_executor'
    // SEO ops
    | 'seo_audit'
    | 'seo_keyword_plan'
    | 'seo_technical_audit'
    | 'seo_content_gap'
    // Content
    | 'content_calendar'
    | 'content_publisher'
    // Social organic
    | 'social_calendar'
    | 'social_publisher'
    // Email
    | 'email_campaigns'
    | 'email_automations'
    // E-commerce
    | 'product_feed_sync'
    | 'dynamic_remarketing'
    // Lead gen
    | 'lead_router'
    | 'offline_conversions_upload'

export interface PipelineDef {
    id: PipelineId
    nameHe: string
    nameEn: string
    descHe: string
    intents: MarketingIntent[]                // pipeline activates if ANY intent matches
    requires: string[]                        // integration ids that MUST be connected (alt with `|`: 'instagram|facebook_pages')
    improvesWith: string[]                    // integration ids that improve quality but not required
    upstreamPipelines?: PipelineId[]          // pipelines whose output this one reads (additive only)
    namespace: string                         // pipelineState[namespace] — stable key for storage
    runMode: 'oneshot' | 'recurring' | 'on_demand'
}

export const PIPELINES: PipelineDef[] = [
    // ── Research family ──────────────────────────────────────────────────
    {
        id: 'research_paid',
        nameHe: 'מחקר שוק לפעילות ממומנת',
        nameEn: 'Paid Marketing Research',
        descHe: 'מתחרים, מילות מפתח עם CPC, intent matrix, ערוצי גיוס',
        intents: ['paid_search', 'paid_social', 'lead_generation'],
        requires: [],
        improvesWith: ['gsc', 'dataforseo', 'firecrawl', 'google_ads', 'google_ads_transparency', 'meta_ad_library'],
        namespace: 'research_paid',
        runMode: 'on_demand',
    },
    {
        id: 'research_seo',
        nameHe: 'מחקר SEO',
        nameEn: 'SEO Research',
        descHe: 'מילות מפתח אורגניות, content gaps, technical SEO baseline',
        intents: ['seo'],
        requires: [],
        improvesWith: ['gsc', 'dataforseo', 'firecrawl', 'pagespeed', 'wordpress'],
        namespace: 'research_seo',
        runMode: 'on_demand',
    },
    {
        id: 'research_content',
        nameHe: 'מחקר תוכן',
        nameEn: 'Content Research',
        descHe: 'נושאים, פורמטים, lead magnets, תדירות פרסום',
        intents: ['content'],
        requires: [],
        improvesWith: ['gsc', 'firecrawl', 'dataforseo', 'wordpress'],
        namespace: 'research_content',
        runMode: 'on_demand',
    },
    {
        id: 'research_social',
        nameHe: 'מחקר רשתות חברתיות',
        nameEn: 'Social Research',
        descHe: 'פלטפורמות, פורמטים, תדירות, hashtags, influencers',
        intents: ['social_organic', 'paid_social', 'brand_awareness'],
        requires: [],
        improvesWith: ['firecrawl', 'meta_ad_library', 'instagram', 'facebook_pages'],
        namespace: 'research_social',
        runMode: 'on_demand',
    },
    {
        id: 'research_email',
        nameHe: 'מחקר Email',
        nameEn: 'Email Research',
        descHe: 'mailing lists, lifecycle stages, deliverability baseline',
        intents: ['email_marketing'],
        requires: [],
        improvesWith: ['resend', 'firecrawl'],
        namespace: 'research_email',
        runMode: 'on_demand',
    },
    {
        id: 'research_ecommerce',
        nameHe: 'מחקר eCommerce',
        nameEn: 'E-Commerce Research',
        descHe: 'unit economics, AOV, frequency, abandoned-cart benchmarks',
        intents: ['ecommerce'],
        requires: [],
        improvesWith: ['shopify', 'woocommerce', 'gsc', 'dataforseo'],
        namespace: 'research_ecommerce',
        runMode: 'on_demand',
    },
    {
        id: 'strategy',
        nameHe: 'אסטרטגיה ותוכנית פעולה',
        nameEn: 'Strategy & Action Plan',
        descHe: 'סינתזה של כל המחקרים → תוכנית עבודה ל-N סוכנים, scenarios',
        intents: ['paid_search', 'paid_social', 'seo', 'content', 'social_organic', 'email_marketing', 'ecommerce', 'lead_generation', 'brand_awareness'],
        requires: [],
        improvesWith: [],
        upstreamPipelines: ['research_paid', 'research_seo', 'research_content', 'research_social', 'research_email', 'research_ecommerce'],
        namespace: 'strategy',
        runMode: 'on_demand',
    },

    // ── Mazhir (Google Ads family) ────────────────────────────────────────
    {
        id: 'mazhir_audit',
        nameHe: 'אודיט Google Ads',
        nameEn: 'Mazhir Audit',
        descHe: 'אודיט תשתית מעקב + חשבון קיים + מתודולוגיה לפי 2025-2026',
        intents: ['paid_search'],
        requires: ['google_ads'],
        improvesWith: ['gsc', 'dataforseo', 'pagespeed', 'google_ads_transparency'],
        upstreamPipelines: ['research_paid', 'strategy'],
        namespace: 'mazhir_audit',
        runMode: 'on_demand',
    },
    {
        id: 'mazhir_media_plan',
        nameHe: 'תוכנית מדיה Google Ads',
        nameEn: 'Mazhir Media Plan',
        descHe: 'קמפיינים, ad groups, RSA, מילות מפתח עם volumes/CPC, negatives',
        intents: ['paid_search'],
        requires: ['google_ads'],
        improvesWith: ['dataforseo', 'gsc', 'google_ads_transparency', 'meta_ad_library'],
        upstreamPipelines: ['mazhir_audit', 'research_paid', 'strategy'],
        namespace: 'mazhir_media_plan',
        runMode: 'on_demand',
    },
    {
        id: 'mazhir_gtm_setup',
        nameHe: 'הגדרת GTM',
        nameEn: 'GTM Auto-Setup',
        descHe: 'Conversion Linker, GCLID Capture, customEvent triggers, awct, gaawe',
        intents: ['paid_search', 'lead_generation', 'ecommerce'],
        requires: ['gtm'],
        improvesWith: ['ga4'],
        namespace: 'mazhir_gtm_setup',
        runMode: 'on_demand',
    },
    {
        id: 'mazhir_conversions',
        nameHe: 'Conversion Actions',
        nameEn: 'Conversion Actions Setup',
        descHe: 'יצירת ConversionAction ב-Google Ads דרך API',
        intents: ['paid_search'],
        requires: ['google_ads', 'gtm'],
        improvesWith: ['ga4'],
        namespace: 'mazhir_conversions',
        runMode: 'on_demand',
    },
    {
        id: 'mazhir_executor',
        nameHe: 'הפעלת קמפיינים Google Ads',
        nameEn: 'Mazhir Executor',
        descHe: 'יצירת קמפיינים, ad groups, RSA, keywords, negatives ב-PAUSED',
        intents: ['paid_search'],
        requires: ['google_ads', 'gtm', 'ga4'],
        improvesWith: [],
        upstreamPipelines: ['mazhir_media_plan', 'mazhir_conversions', 'mazhir_gtm_setup'],
        namespace: 'mazhir_executor',
        runMode: 'on_demand',
    },

    // ── Meta paid ────────────────────────────────────────────────────────
    {
        id: 'meta_audit',
        nameHe: 'אודיט Meta Ads',
        nameEn: 'Meta Audit',
        descHe: 'אודיט פיקסל, CAPI, חשבון, אודיינסים',
        intents: ['paid_social'],
        requires: ['meta_ads'],
        improvesWith: ['instagram', 'facebook_pages', 'meta_ad_library'],
        upstreamPipelines: ['research_paid', 'research_social', 'strategy'],
        namespace: 'meta_audit',
        runMode: 'on_demand',
    },
    {
        id: 'meta_media_plan',
        nameHe: 'תוכנית מדיה Meta',
        nameEn: 'Meta Media Plan',
        descHe: 'קמפיינים, אודיינסים, creative briefs',
        intents: ['paid_social'],
        requires: ['meta_ads'],
        improvesWith: ['meta_ad_library', 'instagram', 'facebook_pages', 'canva'],
        upstreamPipelines: ['meta_audit', 'research_paid', 'research_social'],
        namespace: 'meta_media_plan',
        runMode: 'on_demand',
    },
    {
        id: 'meta_executor',
        nameHe: 'הפעלת קמפיינים Meta',
        nameEn: 'Meta Executor',
        descHe: 'יצירת קמפיינים ב-PAUSED',
        intents: ['paid_social'],
        requires: ['meta_ads'],
        improvesWith: [],
        upstreamPipelines: ['meta_media_plan'],
        namespace: 'meta_executor',
        runMode: 'on_demand',
    },

    // ── SEO ops ──────────────────────────────────────────────────────────
    {
        id: 'seo_audit',
        nameHe: 'אודיט SEO',
        nameEn: 'SEO Audit',
        descHe: 'on-page, technical baseline, indexation, core web vitals',
        intents: ['seo'],
        requires: [],
        improvesWith: ['gsc', 'pagespeed', 'firecrawl', 'wordpress'],
        upstreamPipelines: ['research_seo'],
        namespace: 'seo_audit',
        runMode: 'on_demand',
    },
    {
        id: 'seo_keyword_plan',
        nameHe: 'תוכנית מילות מפתח SEO',
        nameEn: 'SEO Keyword Plan',
        descHe: 'targeting per page, content briefs, internal linking',
        intents: ['seo'],
        requires: [],
        improvesWith: ['gsc', 'dataforseo', 'firecrawl'],
        upstreamPipelines: ['seo_audit', 'research_seo'],
        namespace: 'seo_keyword_plan',
        runMode: 'on_demand',
    },
    {
        id: 'seo_technical_audit',
        nameHe: 'אודיט SEO טכני',
        nameEn: 'Technical SEO Audit',
        descHe: 'crawl, sitemap, robots, schema, hreflang',
        intents: ['seo'],
        requires: [],
        improvesWith: ['firecrawl', 'pagespeed', 'gsc'],
        namespace: 'seo_technical_audit',
        runMode: 'recurring',
    },
    {
        id: 'seo_content_gap',
        nameHe: 'Content Gap Analysis',
        nameEn: 'Content Gap Analysis',
        descHe: 'מה מתחרים מכסים שאתם לא, prioritized by traffic potential',
        intents: ['seo', 'content'],
        requires: [],
        improvesWith: ['dataforseo', 'firecrawl', 'gsc'],
        namespace: 'seo_content_gap',
        runMode: 'on_demand',
    },

    // ── Content ──────────────────────────────────────────────────────────
    {
        id: 'content_calendar',
        nameHe: 'לוח תוכן',
        nameEn: 'Content Calendar',
        descHe: 'תוכנית תוכן שבועית/חודשית',
        intents: ['content', 'social_organic'],
        requires: [],
        improvesWith: ['wordpress', 'gsc', 'dataforseo', 'firecrawl', 'canva'],
        upstreamPipelines: ['research_content', 'strategy'],
        namespace: 'content_calendar',
        runMode: 'recurring',
    },
    {
        id: 'content_publisher',
        nameHe: 'פרסום תוכן',
        nameEn: 'Content Publisher',
        descHe: 'פרסום אוטומטי / חצי-אוטומטי לפי לוח — ל-WordPress או ל-repo ב-GitHub',
        intents: ['content'],
        requires: ['wordpress|github'],
        improvesWith: ['canva'],
        upstreamPipelines: ['content_calendar'],
        namespace: 'content_publisher',
        runMode: 'recurring',
    },

    // ── Social organic ───────────────────────────────────────────────────
    {
        id: 'social_calendar',
        nameHe: 'לוח רשתות חברתיות',
        nameEn: 'Social Calendar',
        descHe: 'לוח פוסטים אורגניים',
        intents: ['social_organic'],
        requires: [],
        improvesWith: ['instagram', 'facebook_pages', 'linkedin', 'tiktok', 'canva'],
        upstreamPipelines: ['research_social', 'content_calendar'],
        namespace: 'social_calendar',
        runMode: 'recurring',
    },
    {
        id: 'social_publisher',
        nameHe: 'פרסום ברשתות',
        nameEn: 'Social Publisher',
        descHe: 'פרסום אוטומטי לפי לוח, אינטגרציה עם canva',
        intents: ['social_organic'],
        requires: ['instagram|facebook_pages|linkedin|tiktok'],
        improvesWith: ['canva'],
        upstreamPipelines: ['social_calendar'],
        namespace: 'social_publisher',
        runMode: 'recurring',
    },

    // ── Email ────────────────────────────────────────────────────────────
    {
        id: 'email_campaigns',
        nameHe: 'קמפיינים Email',
        nameEn: 'Email Campaigns',
        descHe: 'ניוזלטרים, broadcasts',
        intents: ['email_marketing'],
        requires: ['resend'],
        improvesWith: ['ga4'],
        upstreamPipelines: ['research_email', 'strategy'],
        namespace: 'email_campaigns',
        runMode: 'recurring',
    },
    {
        id: 'email_automations',
        nameHe: 'אוטומציות Email',
        nameEn: 'Email Automations',
        descHe: 'מסעות לקוח: welcome, abandoned cart, re-engagement',
        intents: ['email_marketing', 'ecommerce', 'lead_generation'],
        requires: ['resend'],
        improvesWith: ['hubspot', 'ga4'],
        upstreamPipelines: ['research_email'],
        namespace: 'email_automations',
        runMode: 'recurring',
    },

    // ── E-commerce ───────────────────────────────────────────────────────
    {
        id: 'product_feed_sync',
        nameHe: 'סנכרון פיד מוצרים',
        nameEn: 'Product Feed Sync',
        descHe: 'פיד ל-Google Merchant + Meta Catalog',
        intents: ['ecommerce'],
        requires: ['shopify|woocommerce'],
        improvesWith: ['google_ads', 'meta_ads'],
        namespace: 'product_feed_sync',
        runMode: 'recurring',
    },
    {
        id: 'dynamic_remarketing',
        nameHe: 'Dynamic Remarketing',
        nameEn: 'Dynamic Remarketing',
        descHe: 'מודעות מוצר אישיות לגולשים שעזבו',
        intents: ['ecommerce'],
        requires: ['shopify|woocommerce', 'gtm'],
        improvesWith: ['google_ads', 'meta_ads'],
        upstreamPipelines: ['product_feed_sync'],
        namespace: 'dynamic_remarketing',
        runMode: 'on_demand',
    },

    // ── Lead generation ──────────────────────────────────────────────────
    {
        id: 'lead_router',
        nameHe: 'נתב לידים',
        nameEn: 'Lead Router',
        descHe: 'טפסים → CRM, scoring, התראות',
        intents: ['lead_generation'],
        requires: [],
        improvesWith: ['hubspot', 'whatsapp_business', 'resend'],
        namespace: 'lead_router',
        runMode: 'recurring',
    },
    {
        id: 'offline_conversions_upload',
        nameHe: 'העלאת המרות offline',
        nameEn: 'Offline Conversions Upload',
        descHe: 'CRM → Google Ads / Meta — חיוני ל-PMax בליד-ג׳ן',
        intents: ['lead_generation', 'paid_search'],
        requires: ['google_ads'],
        improvesWith: ['hubspot'],
        namespace: 'offline_conversions_upload',
        runMode: 'recurring',
    },
]

export function getPipeline(id: PipelineId): PipelineDef | undefined {
    return PIPELINES.find(p => p.id === id)
}

// Pipelines that are RELEVANT for given intents (i.e. would activate if user
// switches them on). Includes those that need integrations not yet connected.
export function pipelinesForIntents(intents: MarketingIntent[]): PipelineDef[] {
    const set = new Set(intents)
    return PIPELINES.filter(p => p.intents.some(i => set.has(i)))
}
