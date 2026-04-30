// Integration registry — single source of truth for every external data source
// the platform can consume. Future-proof: adding a new integration = one entry
// here + a service file. The Hub UI and pipelines auto-pick it up.

import type { MarketingIntent } from './intents'

export type IntegrationCapability =
    // Search / SEO intelligence
    | 'search_intelligence'      // GSC top queries, organic positions
    | 'keyword_research'         // volumes, CPC, difficulty
    | 'serp_analysis'            // who ranks where, SERP features
    | 'web_crawling'             // scrape competitor pages, content extraction
    | 'page_speed'               // Core Web Vitals, Quality Score signals
    // Paid ads infrastructure
    | 'paid_ads_search'          // Google Ads (campaigns + reads)
    | 'paid_ads_social'          // Meta / TikTok / LinkedIn Ads
    | 'tag_management'           // GTM containers
    | 'web_analytics'            // GA4
    | 'ads_competitive'          // Google Ads Transparency, Meta Ad Library
    | 'offline_conversions'      // CRM → upload to Google Ads
    // Content & creative
    | 'cms'                      // WordPress, Webflow, Ghost
    | 'creative_design'          // Canva, fal.ai, Adobe
    // Social
    | 'social_publishing'        // Instagram Graph, FB Pages, LinkedIn, TikTok, YouTube
    // Commerce
    | 'ecommerce_catalog'        // Shopify, WooCommerce, Magento
    // Comms / lifecycle
    | 'email_delivery'           // Resend, SendGrid, Mailchimp
    | 'crm'                      // HubSpot, Pipedrive, Salesforce
    | 'messaging'                // WhatsApp Business, Telegram

export type AuthMethod =
    | 'oauth_google'
    | 'oauth_meta'
    | 'oauth_linkedin'
    | 'oauth_tiktok'
    | 'oauth_canva'
    | 'oauth_shopify'
    | 'oauth_hubspot'
    | 'oauth_youtube'
    | 'apikey'
    | 'builtin'

export interface IntegrationInfo {
    id: string
    nameHe: string
    nameEn: string
    descHe: string
    icon: string
    capabilities: IntegrationCapability[]
    auth: AuthMethod
    cost: 'free' | 'paid' | 'usage'      // free | flat paid | pay-per-use
    costNote?: string                     // human-readable, RTL Hebrew
    docsUrl?: string
    available: boolean                    // false = future / coming-soon
    // Relevance: which intents this integration is essential / recommended /
    // optional for. Used by relevance.ts to compute tier per intent.
    essentialFor?: MarketingIntent[]
    recommendedFor?: MarketingIntent[]
    optionalFor?: MarketingIntent[]
}

export const INTEGRATIONS: IntegrationInfo[] = [
    // ── Search / SEO intelligence ─────────────────────────────────────────
    {
        id: 'gsc',
        nameHe: 'Google Search Console',
        nameEn: 'Google Search Console',
        descHe: 'נתוני חיפוש אורגני שלכם — שאילתות, CTR, מיקומים. Mazhir משתמש בזה כדי לזהות קניבליזציה paid↔organic ומילים שכבר ממירות אורגנית',
        icon: '🔎',
        capabilities: ['search_intelligence', 'web_analytics'],
        auth: 'oauth_google',
        cost: 'free',
        available: true,
        essentialFor: ['seo', 'paid_search'],
        recommendedFor: ['content', 'lead_generation', 'ecommerce'],
    },
    {
        id: 'dataforseo',
        nameHe: 'DataForSEO',
        nameEn: 'DataForSEO',
        descHe: 'נפחי חיפוש אמיתיים, CPC, רמת תחרות, SERP scraping, backlinks. בלי זה תוכניות התקציב של Mazhir הן ניחושים',
        icon: '📊',
        capabilities: ['keyword_research', 'serp_analysis'],
        auth: 'apikey',
        cost: 'usage',
        costNote: '~$5/חודש (תשלום לפי שימוש)',
        available: true,
        essentialFor: ['seo', 'paid_search', 'content'],
        recommendedFor: ['paid_social', 'ecommerce', 'lead_generation'],
    },
    {
        id: 'firecrawl',
        nameHe: 'Firecrawl',
        nameEn: 'Firecrawl',
        descHe: 'סריקת אתרי מתחרים, ניתוח דפי נחיתה, חילוץ תוכן ל-AI',
        icon: '🕷️',
        capabilities: ['web_crawling'],
        auth: 'apikey',
        cost: 'free',
        costNote: 'חינם 3,000 דפים/חודש',
        available: true,
        recommendedFor: ['seo', 'content', 'paid_search', 'paid_social'],
        optionalFor: ['lead_generation', 'ecommerce'],
    },
    {
        id: 'brave_search',
        nameHe: 'Brave Search',
        nameEn: 'Brave Search',
        descHe: 'אינדקס חיפוש עצמאי — מקור משלים ל-discovery (פחות רלוונטי ל-Google Ads)',
        icon: '🦁',
        capabilities: ['serp_analysis'],
        auth: 'apikey',
        cost: 'free',
        costNote: 'חינם 2,000 חיפושים/חודש',
        available: true,
        optionalFor: ['seo', 'content'],
    },
    {
        id: 'pagespeed',
        nameHe: 'PageSpeed Insights',
        nameEn: 'PageSpeed Insights',
        descHe: 'Core Web Vitals + ציון מהירות — משפיע על Quality Score ב-Google Ads ועל דירוג ב-SEO. שירות ציבורי של Google, לא צריך לחבר',
        icon: '',
        capabilities: ['page_speed'],
        auth: 'builtin',
        cost: 'free',
        available: true,
        recommendedFor: ['seo', 'paid_search', 'ecommerce'],
        optionalFor: ['content'],
    },

    // ── Paid ads infrastructure ───────────────────────────────────────────
    {
        id: 'google_ads',
        nameHe: 'Google Ads',
        nameEn: 'Google Ads',
        descHe: 'חיבור OAuth + Customer ID — ניהול קמפיינים, היסטוריה, Search Terms Report, Auction Insights',
        icon: '💰',
        capabilities: ['paid_ads_search'],
        auth: 'oauth_google',
        cost: 'free',
        available: true,
        essentialFor: ['paid_search'],
        recommendedFor: ['lead_generation', 'ecommerce'],
    },
    {
        id: 'meta_ads',
        nameHe: 'Meta Ads',
        nameEn: 'Meta Ads',
        descHe: 'OAuth ל-Meta Business — קמפיינים, פיקסל, Conversion API',
        icon: '📘',
        capabilities: ['paid_ads_social'],
        auth: 'oauth_meta',
        cost: 'free',
        available: true,
        essentialFor: ['paid_social'],
        recommendedFor: ['lead_generation', 'ecommerce', 'brand_awareness'],
    },
    {
        id: 'gtm',
        nameHe: 'Google Tag Manager',
        nameEn: 'Google Tag Manager',
        descHe: 'ניהול tags, Conversion Linker, GCLID, awct/gaawe — Mazhir מגדיר אוטומטית',
        icon: '🏷️',
        capabilities: ['tag_management'],
        auth: 'oauth_google',
        cost: 'free',
        available: true,
        essentialFor: ['paid_search', 'lead_generation'],
        recommendedFor: ['paid_social', 'ecommerce'],
    },
    {
        id: 'ga4',
        nameHe: 'Google Analytics 4',
        nameEn: 'Google Analytics 4',
        descHe: 'מקור האמת ל-conversions ולנתוני התנהגות — חובה ל-smart bidding',
        icon: '📈',
        capabilities: ['web_analytics'],
        auth: 'oauth_google',
        cost: 'free',
        available: true,
        essentialFor: ['paid_search', 'paid_social', 'lead_generation', 'ecommerce'],
        recommendedFor: ['seo', 'content'],
    },
    {
        id: 'google_ads_transparency',
        nameHe: 'Google Ads Transparency',
        nameEn: 'Google Ads Transparency Center',
        descHe: 'מודעות פעילות של מתחרים ב-Google Ads כרגע — Mazhir משתמש כ-reference ל-RSA. ספריה ציבורית של Google, לא צריך לחבר',
        icon: '',
        capabilities: ['ads_competitive'],
        auth: 'builtin',
        cost: 'free',
        available: true,
        recommendedFor: ['paid_search'],
        optionalFor: ['paid_social'],
    },
    {
        id: 'meta_ad_library',
        nameHe: 'Meta Ad Library',
        nameEn: 'Meta Ad Library',
        descHe: 'מודעות פעילות של מתחרים בפייסבוק/אינסטגרם — creative DNA, copy ideas. ספריה ציבורית של Meta, לא צריך לחבר',
        icon: '',
        capabilities: ['ads_competitive'],
        auth: 'builtin',
        cost: 'free',
        available: true,
        recommendedFor: ['paid_social'],
        optionalFor: ['paid_search', 'content', 'brand_awareness'],
    },

    // ── CMS ───────────────────────────────────────────────────────────────
    {
        id: 'wordpress',
        nameHe: 'WordPress',
        nameEn: 'WordPress',
        descHe: 'גישה ל-WP REST API — פרסום מאמרים, audit לדפי נחיתה, schema',
        icon: '🌐',
        capabilities: ['cms'],
        auth: 'apikey',
        cost: 'free',
        available: true,
        essentialFor: ['content'],
        recommendedFor: ['seo', 'lead_generation'],
    },
    {
        id: 'shopify',
        nameHe: 'Shopify',
        nameEn: 'Shopify',
        descHe: 'קטלוג מוצרים, dynamic remarketing feeds, אירועי המרה',
        icon: '🛍️',
        capabilities: ['ecommerce_catalog'],
        auth: 'oauth_shopify',
        cost: 'free',
        available: false,
        essentialFor: ['ecommerce'],
    },
    {
        id: 'woocommerce',
        nameHe: 'WooCommerce',
        nameEn: 'WooCommerce',
        descHe: 'חנות WordPress — קטלוג, עגלות נטושות, פיד למודעות',
        icon: '🛒',
        capabilities: ['ecommerce_catalog'],
        auth: 'apikey',
        cost: 'free',
        available: false,
        essentialFor: ['ecommerce'],
    },

    // ── Social publishing ─────────────────────────────────────────────────
    {
        id: 'instagram',
        nameHe: 'Instagram',
        nameEn: 'Instagram (Graph API)',
        descHe: 'פרסום אורגני, Stories, Reels, אנליטיקס',
        icon: '📷',
        capabilities: ['social_publishing'],
        auth: 'oauth_meta',
        cost: 'free',
        available: true,
        essentialFor: ['social_organic'],
        recommendedFor: ['paid_social', 'brand_awareness'],
    },
    {
        id: 'facebook_pages',
        nameHe: 'Facebook Pages',
        nameEn: 'Facebook Pages',
        descHe: 'דף פייסבוק — פרסום, תגובות, אנליטיקס',
        icon: '👍',
        capabilities: ['social_publishing'],
        auth: 'oauth_meta',
        cost: 'free',
        available: true,
        essentialFor: ['social_organic'],
        recommendedFor: ['paid_social'],
    },
    {
        id: 'linkedin',
        nameHe: 'LinkedIn',
        nameEn: 'LinkedIn',
        descHe: 'פוסטים מקצועיים, דף חברה',
        icon: '💼',
        capabilities: ['social_publishing'],
        auth: 'oauth_linkedin',
        cost: 'free',
        available: false,
        recommendedFor: ['social_organic', 'content', 'lead_generation'],
    },
    {
        id: 'tiktok',
        nameHe: 'TikTok',
        nameEn: 'TikTok',
        descHe: 'וידאו קצר, אורגני וממומן',
        icon: '🎵',
        capabilities: ['social_publishing', 'paid_ads_social'],
        auth: 'oauth_tiktok',
        cost: 'free',
        available: false,
        recommendedFor: ['social_organic', 'paid_social', 'brand_awareness'],
    },
    {
        id: 'youtube',
        nameHe: 'YouTube',
        nameEn: 'YouTube',
        descHe: 'וידאו ארוך וקצר, ניתוח ביצועי ערוץ',
        icon: '▶️',
        capabilities: ['social_publishing'],
        auth: 'oauth_youtube',
        cost: 'free',
        available: false,
        recommendedFor: ['content', 'brand_awareness'],
    },

    // ── Email / CRM / Comms ───────────────────────────────────────────────
    {
        id: 'resend',
        nameHe: 'Resend',
        nameEn: 'Resend',
        descHe: 'משלוח אימיילים — ניוזלטרים, אישורים, מסעות',
        icon: '📨',
        capabilities: ['email_delivery'],
        auth: 'apikey',
        cost: 'free',
        costNote: 'חינם עד 3,000 מיילים/חודש',
        available: true,
        essentialFor: ['email_marketing'],
        recommendedFor: ['lead_generation'],
    },
    {
        id: 'hubspot',
        nameHe: 'HubSpot',
        nameEn: 'HubSpot',
        descHe: 'CRM + automation — לידים, deals, scoring, offline conversions',
        icon: '🎯',
        capabilities: ['crm', 'offline_conversions'],
        auth: 'oauth_hubspot',
        cost: 'free',
        available: false,
        essentialFor: ['lead_generation'],
        recommendedFor: ['email_marketing', 'paid_search'],
    },
    {
        id: 'whatsapp_business',
        nameHe: 'WhatsApp Business',
        nameEn: 'WhatsApp Business',
        descHe: 'הודעות ללקוחות — אישורי הזמנה, תזכורות, תמיכה',
        icon: '💬',
        capabilities: ['messaging'],
        auth: 'apikey',
        cost: 'usage',
        available: false,
        recommendedFor: ['lead_generation', 'ecommerce'],
    },

    // ── Creative ─────────────────────────────────────────────────────────
    {
        id: 'canva',
        nameHe: 'Canva',
        nameEn: 'Canva',
        descHe: 'גישה ל-brand kit, יצירת ויזואלים, exports',
        icon: '🎨',
        capabilities: ['creative_design'],
        auth: 'oauth_canva',
        cost: 'free',
        available: true,
        recommendedFor: ['content', 'social_organic', 'paid_social'],
    },

    // ── Built-in / always-on ──────────────────────────────────────────────
    {
        id: 'telegram',
        nameHe: 'Telegram',
        nameEn: 'Telegram',
        descHe: 'בוט מובנה — צ׳אט עם הסוכן, התראות, אישורי פרסום',
        icon: '✈️',
        capabilities: ['messaging'],
        auth: 'builtin',
        cost: 'free',
        available: true,
        // No essential/recommended — built-in for all
    },
]

export function getIntegration(id: string): IntegrationInfo | undefined {
    return INTEGRATIONS.find(i => i.id === id)
}

export function listAvailableIntegrations(): IntegrationInfo[] {
    return INTEGRATIONS.filter(i => i.available)
}
