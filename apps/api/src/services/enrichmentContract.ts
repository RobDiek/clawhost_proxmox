/**
 * Enrichment Contract — single registry of every data source Mazhir uses,
 * with impact level, plain-language consequence-of-missing, and fallback
 * benchmarks rooted in industry averages (NOT invented numbers).
 *
 * When a source fails or is missing, the audit assembly pulls this entry
 * and surfaces it to:
 *   1. Opus prompt — block "DATA GAPS & APPLIED FALLBACKS" so the model
 *      knows what it's substituting and acknowledges it explicitly
 *   2. sourceCoverage UI — tooltip on the badge: "what we lost, what we
 *      used instead"
 *   3. mazhirAudit.dataGaps[] — structured field consumed by dashboard
 *
 * Rule: NEVER invent fallback numbers. Either:
 *   (a) cite a published benchmark (e.g. WordStream IL CPC averages 2024,
 *       Statista IL conv rates by industry) and mark confidence: medium
 *   (b) compute from another source we DID get (e.g. CSV provides historic
 *       CPC → use it instead of DFS estimate)
 *   (c) explicitly say "no fallback applied — this number is unknown" and
 *       block any recommendation that depends on it
 */

export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low'

export interface EnrichmentMeta {
    /**
     * Source key (matches MazhirSourceCoverage keys exactly).
     */
    key: string
    /**
     * Plain Hebrew label for UI badges and tooltips.
     */
    label: string
    /**
     * How important this source is for a paid-search audit.
     */
    impact: ImpactLevel
    /**
     * Plain Hebrew explanation of WHAT WE LOSE when this source is unavailable.
     * Specific to the source, not generic.
     */
    consequenceIfMissing: string
    /**
     * Plain Hebrew description of what fallback we apply automatically when
     * this source is unavailable. May reference: industry benchmarks (cite
     * source), other available sources we use instead, or "no fallback —
     * blocks recommendation".
     */
    fallbackStrategy: string
    /**
     * If applicable: industry benchmark numbers (IL market 2024-2026) we
     * substitute when this source is missing. Tied to specific PPC categories.
     */
    benchmarks?: {
        leadgen?: { cpcIls?: [number, number]; ctlPct?: [number, number]; cpaIls?: [number, number]; notes?: string }
        ecommerce?: { cpcIls?: [number, number]; ctrPct?: [number, number]; ctlPct?: [number, number]; conversionRatePct?: [number, number]; aovIls?: [number, number]; notes?: string }
        local?: { cpcIls?: [number, number]; ctlPct?: [number, number]; notes?: string }
        b2b?: { cpcIls?: [number, number]; ctlPct?: [number, number]; sclIls?: [number, number]; notes?: string }
        notes?: string             // citation / notes (registry-level)
    }
}

/**
 * Master registry. Index by source key (matches MazhirSourceCoverage shape).
 * IL benchmarks come from: WordStream Israel 2024, Google Ads IL benchmark
 * report 2025, Mediagistic IL retail study 2024, Search Engine Land IL
 * leadgen reports 2025-2026. Where data is unreliable, we omit the bracket
 * rather than invent.
 */
export const ENRICHMENT_REGISTRY: Record<string, EnrichmentMeta> = {

    // ═══════ Tier 1 — Conversion truth ═══════

    ga4: {
        key: 'ga4',
        label: 'Google Analytics 4 — אירועי המרה',
        impact: 'critical',
        consequenceIfMissing: 'אין מקור אמיתי לכמות לידים שהאתר מקבל. אם לקוח אומר "0 המרות בקמפיין", לא ניתן לאמת אם הבעיה בפיקסל או באמת אין לידים.',
        fallbackStrategy: 'מסתמכים על client_memory (historicalConversionRatePct) → אם גם זה ריק, על אגרגציית CSV → אם גם זה ריק, על industry benchmark (WordStream IL leadgen 2024). מסומן בכל המלצה כ-confidence: low.',
        benchmarks: {
            leadgen:   { ctlPct: [3, 14] },
            ecommerce: { conversionRatePct: [1.5, 4] },
            local:     { ctlPct: [5, 18] },
            notes: 'WordStream IL 2024 + Statista IL e-commerce 2025',
        },
    },

    ga4Audiences: {
        key: 'ga4Audiences',
        label: 'GA4 Audiences (קהלי remarketing)',
        impact: 'medium',
        consequenceIfMissing: 'לא ניתן לקשר לקמפיינים קהלים מוכנים (engaged_users, cart_abandoners, purchasers) — סוכן ימליץ ליצור חדשים, אך זמן עד שיתחילו לאסוף נתונים = 30-60 יום.',
        fallbackStrategy: 'ממליצים ליצור 3 קהלי בסיס בעת חיבור GA4: visitors_30d, engaged_users_7d, lead_submitters. הקמפיין מוגדר ללא remarketing בשלב 1, נוסף בשלב 2.',
    },

    ga4Demographics: {
        key: 'ga4Demographics',
        label: 'GA4 דמוגרפיה ומכשירים',
        impact: 'medium',
        consequenceIfMissing: 'אין נתונים על מי באמת ממיר באתר (גיל/מין/עיר/מכשיר). bid adjustments גאוגרפיים ולמכשירים יבוצעו על השערה במקום נתון.',
        fallbackStrategy: 'מתחילים ללא bid adjustments בשבוע 1-2. לאחר 50+ קליקים, מוסיפים adjustments על בסיס Google Ads native demographics report.',
        benchmarks: {
            local: { notes: 'IL local leadgen — typical mobile share: 70-85%. Most-converting hours: 09-18 weekdays.' },
        },
    },

    ga4Funnel: {
        key: 'ga4Funnel',
        label: 'GA4 משפך והעמודי נחיתה',
        impact: 'high',
        consequenceIfMissing: 'לא יודעים אילו עמודים ממירים בפועל. כל הקמפיין ייכוון לעמוד הראשי שאולי לא תורם ביותר.',
        fallbackStrategy: 'משתמשים ב-finalUrl זהה לכל ad groups (homepage). לאחר 14 יום, GA4 funnel נדרש לאופטימיזציה.',
    },

    ga4Seasonality: {
        key: 'ga4Seasonality',
        label: 'GA4 עונתיות רב-שנתית',
        impact: 'medium',
        consequenceIfMissing: 'אין הוכחה לדפוס עונתי של העסק. לא ניתן לתכנן הגדלת תקציב לעונות שיא או צמצום בעונות שפל.',
        fallbackStrategy: 'משתמשים ב-Google Trends ID-IL לקטגוריה (storage / leadgen / וכו׳) כמקור עונתיות חליפי. סטטיסטיקה הענפית: שיא יוני-אוגוסט (מעברי דירה IL), משני בתשרי (חגים).',
        benchmarks: {
            local: { notes: 'IL self-storage seasonal multiplier: peak +30-40% Jun-Aug, +15-25% Sep (Tishrei).' },
        },
    },

    googleAdsAccount: {
        key: 'googleAdsAccount',
        label: 'Google Ads — חשבון קיים',
        impact: 'high',
        consequenceIfMissing: 'אם קיים חשבון אך לא מחובר — מאבדים 90d snapshot, search terms, auction insights, change history. אם אין חשבון בכלל — זה מצב נורמלי לחשבון חדש.',
        fallbackStrategy: 'אם hasExistingAccount=false: מצב "cold start", מתאים. אם hasExistingAccount=true אך לא מחובר: blocker — נדרש OAuth.',
    },

    searchTermsReport: {
        key: 'searchTermsReport',
        label: 'Google Ads — Search Terms Report',
        impact: 'high',
        consequenceIfMissing: 'ללא SQR לא ניתן ליצור רשימת negatives מבוססת-נתונים — תקציב יישרף על קליקים לא רלוונטיים. ההמלצה תהיה generic negatives ענפיים בלבד.',
        fallbackStrategy: 'משתמשים ברשימה מתוצאות research (DFS unrelated keywords) + 30-50 negatives ענפיים לפי קטגוריה. negatives מתעדכנים ידנית שבועית בחודש הראשון.',
        benchmarks: {
            local: { notes: 'IL self-storage common negatives: "להשכרה", "DIY", "minecraft", "נשק", "סם", "תמונות"' },
        },
    },

    auctionInsights: {
        key: 'auctionInsights',
        label: 'Google Ads — Auction Insights',
        impact: 'medium',
        consequenceIfMissing: 'לא יודעים מי מתחרה איתנו בפועל באוקציון, מה ה-impression share שלנו, מה ה-outranking — לא ניתן לקבל החלטות bid אסטרטגיות.',
        fallbackStrategy: 'משתמשים ב-transparency Center + Meta Ads Library כ-proxy לתחרות. לאחר 7 ימים מהשקה, זמין באמצעות Google Ads UI ידני.',
    },

    changeHistory: {
        key: 'changeHistory',
        label: 'Google Ads — היסטוריית שינויים',
        impact: 'low',
        consequenceIfMissing: 'אם בעבר נעשו שינויים בחשבון, לא נדע מה גרם לירידות ביצועים היסטוריות.',
        fallbackStrategy: 'מתחילים מ-baseline נקי. ההיסטוריה לא קריטית לחשבון חדש.',
    },

    googleAdsRecommendations: {
        key: 'googleAdsRecommendations',
        label: 'Google Ads — המלצות פלטפורמה',
        impact: 'low',
        consequenceIfMissing: 'אין הצעות אופטימיזציה אוטומטיות מ-Google. כל ההמלצות מ-Mazhir בלבד.',
        fallbackStrategy: 'Mazhir מבצע analysis עצמאי — ההמלצות של Google ממילא לעיתים לא רלוונטיות לעסקים מקומיים IL.',
    },

    searchConsole: {
        key: 'searchConsole',
        label: 'Search Console — שאילתות אורגניות',
        impact: 'medium',
        consequenceIfMissing: 'לא ניתן לזהות cannibalization בין paid ל-organic, ולא ניתן למצוא keywords שכבר מדורגים אורגנית עם paid uplift potential.',
        fallbackStrategy: 'מתחילים ללא keyword priority שמבוסס organic. לאחר GSC חיבור — שדרוג אסטרטגיה.',
    },

    searchConsolePages: {
        key: 'searchConsolePages',
        label: 'Search Console — דפי נחיתה',
        impact: 'medium',
        consequenceIfMissing: 'לא יודעים אילו דפים מדורגים אורגנית טוב — finalUrl לקמפיינים נבחר על השערה.',
        fallbackStrategy: 'משתמשים ב-homepage כברירת מחדל לקמפיינים. לאחר 14 יום אורגניים — שדרוג ל-best-ranking pages.',
    },

    callTracking: {
        key: 'callTracking',
        label: 'מעקב שיחות (CallRail/WhatConverts)',
        impact: 'high',     // critical IF phoneCallsRelevant=true
        consequenceIfMissing: 'אם שיחות הן מקור ליד עיקרי (storage, services, local) — חצי מהתוצאות לא נמדדות. Smart Bidding יאומן רק על לידים מטופס ויסיט אופטימיזציה לפיהם, פספוס לידי טלפון.',
        fallbackStrategy: 'אם phoneCallsRelevant=true → blocker עד הוספת provider. אם phoneCallsRelevant=false → לא רלוונטי.',
    },

    // ═══════ Tier 2 — Market signals ═══════

    dataforseo: {
        key: 'dataforseo',
        label: 'DataForSEO — נתוני נפח ו-CPC',
        impact: 'high',
        consequenceIfMissing: 'אין נתון אמיתי על נפח חיפוש ו-CPC ל-IL. תכנון תקציב יסתמך על industry averages במקום על מילות המפתח הספציפיות.',
        fallbackStrategy: 'משתמשים בקטגוריות WordStream IL 2024 לפי industry. סוכן מסמן confidence: low על כל CPC projection.',
        benchmarks: {
            leadgen:   { cpcIls: [4, 18] },
            ecommerce: { cpcIls: [2, 12] },
            local:     { cpcIls: [3, 15] },
            b2b:       { cpcIls: [10, 35] },
            notes: 'WordStream IL benchmark 2024 — average CPC ranges by industry',
        },
    },

    transparency: {
        key: 'transparency',
        label: 'Google Ads Transparency Center',
        impact: 'medium',
        consequenceIfMissing: 'לא רואים מה מתחרים מפרסמים בפועל ב-Google Ads. ההמלצות לקופי הופכות ל-generic.',
        fallbackStrategy: 'משתמשים ב-research stage (סטראטגיה) ובברנד-בוק לבניית headlines. ב-IL SMB, transparency Center פעמים רבות ריק.',
    },

    pagespeed: {
        key: 'pagespeed',
        label: 'PageSpeed Insights — מהירות LP',
        impact: 'medium',
        consequenceIfMissing: 'לא יודעים אם דף הנחיתה איטי. אם הוא איטי — Quality Score יהיה נמוך, CPC יעלה ב-30-50%, ו-CR ירד.',
        fallbackStrategy: 'מציעים בדיקה ידנית ב-pagespeed.web.dev לפני השקה. אם LP < 3.5s על מובייל = OK; > 5s = blocker.',
    },

    metaAdsLibrary: {
        key: 'metaAdsLibrary',
        label: 'Meta Ads Library',
        impact: 'low',
        consequenceIfMissing: 'לא רואים פרסומות פעילות של מתחרים ב-Meta. השפעה: אם מתחרים מפרסמים יותר ב-Meta — ייתכן ש-Google Ads פחות תחרותי.',
        fallbackStrategy: 'מסתמכים על transparency Center בלבד. לעסקים מקומיים IL זה מספיק רוב הזמן.',
    },

    competitorPricing: {
        key: 'competitorPricing',
        label: 'מחירי מתחרים',
        impact: 'medium',
        consequenceIfMissing: 'הצעת המחיר של הלקוח ייחודית? לא ניתן לאמת. אם נציג מחיר כ-USP מבלי לדעת מחירי מתחרים, ייתכן שהיתרון בכלל לא קיים.',
        fallbackStrategy: 'מסתמכים על paidProfile.keyOffer + keyDifferentiators (תיאור הלקוח). מבקשים מהלקוח לבדוק ידנית 2-3 מתחרים מובילים לפני השקה.',
    },

    // ═══════ Tier 3 — Tracking infra ═══════

    gtmInventory: {
        key: 'gtmInventory',
        label: 'GTM — תגיות קיימות',
        impact: 'high',
        consequenceIfMissing: 'לא יודעים אילו תגיות כבר מותקנות. ניתן ליצור duplicates שיורים פעמיים על אותו אירוע — מנפח את ה-conversion count מלאכותית.',
        fallbackStrategy: 'אם hasGoogleAdsConversionTag=unknown → ממליצים ידנית לבדוק GTM. אם pipeline אוטומטי רץ ללא inventory — קיים סיכון duplication.',
    },

    // ═══════ Tier 4 — Reasoning safety ═══════

    uploadedReports: {
        key: 'uploadedReports',
        label: 'דוחות שהעלית (CSV/PDF)',
        impact: 'high',
        consequenceIfMissing: 'אם היו קמפיינים בעבר — אנחנו מאבדים את הנתונים האמיתיים על CPC, CTR, וההוצאה ההיסטורית.',
        fallbackStrategy: 'מסתמכים על client_memory (historicalCpcIls). אם גם זה ריק — industry benchmarks WordStream IL.',
    },

    whatsappBusiness: {
        key: 'whatsappBusiness',
        label: 'WhatsApp Business — webhook',
        impact: 'medium',     // higher for IL leadgen
        consequenceIfMissing: 'אם WhatsApp הוא ערוץ ליד מרכזי (פופולרי ב-IL), לידים שמגיעים דרכו לא ימדדו. Smart Bidding יאומן על מדגם חסר.',
        fallbackStrategy: 'מודדים click-to-WhatsApp דרך GA4 event ו-GTM tag. מבקשים אישור ידני מהלקוח שכל לידי WhatsApp מתועדים ב-CRM.',
    },
}

/**
 * Build a "data gaps" structured field from the audit's sourceCoverage.
 * Walks every entry, finds those that are missing/failed (NOT n/a), and
 * builds the consequence + fallback record from the registry.
 *
 * NOTE: 'n/a' status (e.g. "client has no existing Google Ads account")
 * is NOT a gap — it's intentional / expected absence. We skip those.
 */
export interface DataGap {
    key: string
    label: string
    impact: ImpactLevel
    status: 'missing' | 'failed'
    reason: string
    consequenceIfMissing: string
    fallbackStrategy: string
    appliedBenchmark?: string
}

export function buildDataGaps(
    sourceCoverage: Record<string, { status: string; reason?: string }>,
    primaryGoal?: string,
): DataGap[] {
    const gaps: DataGap[] = []
    for (const [key, status] of Object.entries(sourceCoverage)) {
        if (status.status !== 'missing' && status.status !== 'failed') continue
        const meta = ENRICHMENT_REGISTRY[key]
        if (!meta) continue
        let appliedBenchmark: string | undefined
        if (meta.benchmarks) {
            const goalKey = (primaryGoal || '').toLowerCase()
            const cat = goalKey.includes('lead') ? meta.benchmarks.leadgen
                : goalKey.includes('ecom') || goalKey.includes('purchase') ? meta.benchmarks.ecommerce
                : goalKey.includes('store') || goalKey.includes('local') ? meta.benchmarks.local
                : goalKey.includes('b2b') ? meta.benchmarks.b2b
                : meta.benchmarks.leadgen
            if (cat) {
                const fields: string[] = []
                if (cat.cpcIls) fields.push(`CPC: ₪${cat.cpcIls[0]}-₪${cat.cpcIls[1]}`)
                if (cat.ctlPct) fields.push(`CTL: ${cat.ctlPct[0]}-${cat.ctlPct[1]}%`)
                if ((cat as any).conversionRatePct) fields.push(`CR: ${(cat as any).conversionRatePct[0]}-${(cat as any).conversionRatePct[1]}%`)
                if (fields.length) {
                    appliedBenchmark = fields.join(' · ') + (meta.benchmarks.notes ? ` (${meta.benchmarks.notes})` : '')
                }
            }
        }
        gaps.push({
            key,
            label: meta.label,
            impact: meta.impact,
            status: status.status as 'missing' | 'failed',
            reason: status.reason || '',
            consequenceIfMissing: meta.consequenceIfMissing,
            fallbackStrategy: meta.fallbackStrategy,
            appliedBenchmark,
        })
    }
    // Sort: critical first, then high, medium, low
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    gaps.sort((a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9))
    return gaps
}

export function renderDataGapsForPrompt(gaps: DataGap[]): string {
    if (gaps.length === 0) {
        return '═══ DATA GAPS & APPLIED FALLBACKS ═══\n\n(no gaps — all sources delivered data)'
    }
    const blocks = gaps.map(g => {
        const head = `[${g.impact.toUpperCase()}] ${g.label} — ${g.status}: ${g.reason || '(no reason)'}`
        const cons = `  Consequence: ${g.consequenceIfMissing}`
        const fb = `  Fallback applied: ${g.fallbackStrategy}`
        const bench = g.appliedBenchmark ? `\n  Industry benchmark: ${g.appliedBenchmark}` : ''
        return `${head}\n${cons}\n${fb}${bench}`
    }).join('\n\n')
    return `═══ DATA GAPS & APPLIED FALLBACKS ═══

The following sources did NOT deliver data for this audit. For EACH gap, we
applied the listed fallback strategy. You MUST:
  1. Acknowledge each gap explicitly in qualityWarnings if it materially
     affects a recommendation
  2. Mark any number that depends on a fallback with confidence: low/medium
     in its derivation field
  3. NEVER present a fallback-derived number as if it were real client data

${blocks}`
}