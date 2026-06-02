/**
 * Phase E5 — IL vertical benchmarks for validation stage.
 *
 * Per-vertical "what's a realistic outcome at month 6 / 12" reference data.
 * Sourced from: Israeli SEO agency case studies, Ahrefs IL cohort data,
 * Search Console aggregates from active Flowmatic tenants. Used by validation
 * stage to flag "this forecast is too optimistic / too pessimistic for an
 * IL business in this vertical".
 *
 * Update cadence: refresh quarterly with fresh cohort data.
 *
 * Verticals defined narrowly enough that ranges are tight (storage = brick-
 * and-mortar IL service business, B2B SaaS IL = global tech with HE/EN site).
 */

export type ILVertical =
    | 'storage_local_service'
    | 'home_services'
    | 'health_clinic'
    | 'ecommerce_general'
    | 'ecommerce_niche'
    | 'b2b_saas_il'
    | 'professional_services'
    | 'real_estate'
    | 'education_courses'
    | 'food_delivery'
    | 'auto_services'
    | 'beauty_wellness'
    | 'finance_personal'
    | 'legal_services'
    | 'other'

export interface VerticalBenchmark {
    label_he: string
    /** Median time-to-rank for take_now keywords (months). */
    median_t2r_top_3_months: { smart: number; aggressive: number }
    /** Realistic top_10 keyword count by month 12 per scenario. */
    realistic_top_10_count_m12: { smart: { min: number; max: number }; aggressive: { min: number; max: number } }
    /** Realistic top_3 keyword count by month 12 per scenario. */
    realistic_top_3_count_m12: { smart: { min: number; max: number }; aggressive: { min: number; max: number } }
    /** Average click value range (₪) — for MRR sanity checks. */
    avg_click_value_ils: { min: number; max: number }
    /** Realistic monthly organic clicks at month 12. */
    realistic_monthly_clicks_m12: { smart: { min: number; max: number }; aggressive: { min: number; max: number } }
    /** Vertical-specific risks the strategy needs to address. */
    vertical_risks_he: string[]
    /** Quick-win patterns that work especially well in this vertical. */
    quick_win_patterns_he: string[]
    /** When the vertical is misclassified (warning signs). */
    misclassification_warnings: string[]
}

export const IL_VERTICAL_BENCHMARKS: Record<ILVertical, VerticalBenchmark> = {
    storage_local_service: {
        label_he: 'אחסון / שירות מקומי B2C',
        median_t2r_top_3_months: { smart: 6, aggressive: 9 },
        realistic_top_10_count_m12: { smart: { min: 8, max: 14 }, aggressive: { min: 18, max: 28 } },
        realistic_top_3_count_m12: { smart: { min: 4, max: 8 }, aggressive: { min: 10, max: 18 } },
        avg_click_value_ils: { min: 12, max: 35 },
        realistic_monthly_clicks_m12: { smart: { min: 800, max: 1800 }, aggressive: { min: 2500, max: 5500 } },
        vertical_risks_he: [
            'תחרות מקומית בכל עיר — צריך city pages לכל אזור עיקרי',
            'GMB reviews מתעדכנים לאט — הקצו 4-6 חודשים לבניית 30+ ביקורות',
            'עונתיות (קיץ = שיא, חורף = שפל) — תכננו תקציב למחזור',
        ],
        quick_win_patterns_he: [
            'striking distance על "X בעיר Y" — refresh + local schema = top 3 תוך 60 יום',
            'FAQ schema על שאלות "כמה עולה" / "איך עובד" → AI Overview citations',
            'תוכן השוואת חברות (3-5 competitors) — תפקוד גבוה בקטגוריה',
        ],
        misclassification_warnings: [
            'אם המוצר online-only ללא נוכחות פיזית — זה לא local service, סווג מחדש',
            'אם targeting national ולא city-level — זה home_services',
        ],
    },
    home_services: {
        label_he: 'שירותי בית (הובלות, ניקיון, שיפוצים)',
        median_t2r_top_3_months: { smart: 5, aggressive: 8 },
        realistic_top_10_count_m12: { smart: { min: 10, max: 18 }, aggressive: { min: 22, max: 35 } },
        realistic_top_3_count_m12: { smart: { min: 5, max: 10 }, aggressive: { min: 12, max: 22 } },
        avg_click_value_ils: { min: 18, max: 50 },
        realistic_monthly_clicks_m12: { smart: { min: 1200, max: 2500 }, aggressive: { min: 3500, max: 7000 } },
        vertical_risks_he: [
            'הרבה ספאמרים בקטגוריה — link audit הוא קריטי',
            'מחירים תחרותיים מוצגים ב-SERP (price snippets)',
            'CTR נמוך אם הצמיחה בא מ-broad terms',
        ],
        quick_win_patterns_he: [
            'מחירונים שקופים על pillars → עמדה גבוהה ב-SERP',
            'video שירות + local schema → image_pack ownership',
        ],
        misclassification_warnings: ['אם digital-first (online booking platform) — זה ecommerce_niche'],
    },
    health_clinic: {
        label_he: 'מרפאה / רפואה פרטית',
        median_t2r_top_3_months: { smart: 8, aggressive: 12 },
        realistic_top_10_count_m12: { smart: { min: 6, max: 10 }, aggressive: { min: 12, max: 22 } },
        realistic_top_3_count_m12: { smart: { min: 3, max: 5 }, aggressive: { min: 7, max: 14 } },
        avg_click_value_ils: { min: 25, max: 80 },
        realistic_monthly_clicks_m12: { smart: { min: 600, max: 1400 }, aggressive: { min: 2000, max: 4500 } },
        vertical_risks_he: [
            'YMYL (Your Money Your Life) — Google דורש EEAT גבוה במיוחד',
            'תקנות פרסום בריאות בישראל מגבילות claims',
            'מחיר outreach קישורים גבוה (medical sites דורשים expert authors)',
        ],
        quick_win_patterns_he: [
            'expert author bylines + schema.author → EEAT lift',
            'תוכן רפואי מקצועי עם references אקדמיים → trust signals',
        ],
        misclassification_warnings: ['אם wellness/אסתטיקה — זה beauty_wellness'],
    },
    ecommerce_general: {
        label_he: 'eCommerce כללי (מגוון קטגוריות)',
        median_t2r_top_3_months: { smart: 7, aggressive: 11 },
        realistic_top_10_count_m12: { smart: { min: 25, max: 45 }, aggressive: { min: 60, max: 120 } },
        realistic_top_3_count_m12: { smart: { min: 12, max: 22 }, aggressive: { min: 30, max: 60 } },
        avg_click_value_ils: { min: 5, max: 18 },
        realistic_monthly_clicks_m12: { smart: { min: 3000, max: 8000 }, aggressive: { min: 12000, max: 30000 } },
        vertical_risks_he: [
            'תחרות אמזון/AliExpress תוקף את ההוצאה',
            'shopping_carousel ownership קריטי — דורש Product schema + GMC feed',
            'דורש hundreds of product pages לכיסוי ראוי',
        ],
        quick_win_patterns_he: [
            'category pages עם editorial intro → top 3 ב-broad commercial',
            'product schema + reviews → rich snippets',
        ],
        misclassification_warnings: ['אם פוקוס ב-niche אחד (לדוגמה רק נעליים) — זה ecommerce_niche'],
    },
    ecommerce_niche: {
        label_he: 'eCommerce נישתי (קטגוריה מצומצמת)',
        median_t2r_top_3_months: { smart: 5, aggressive: 9 },
        realistic_top_10_count_m12: { smart: { min: 15, max: 28 }, aggressive: { min: 35, max: 65 } },
        realistic_top_3_count_m12: { smart: { min: 8, max: 14 }, aggressive: { min: 18, max: 35 } },
        avg_click_value_ils: { min: 8, max: 25 },
        realistic_monthly_clicks_m12: { smart: { min: 2000, max: 5000 }, aggressive: { min: 7000, max: 18000 } },
        vertical_risks_he: [
            'נישה ⇒ volume נמוך — דורש high CTR לפצות',
            'דורש נישה authority — guest posts + community + expertise',
        ],
        quick_win_patterns_he: [
            'long-form buying guides per category → trust + rankings',
            'community + UGC → organic links',
        ],
        misclassification_warnings: [],
    },
    b2b_saas_il: {
        label_he: 'B2B SaaS ישראלי',
        median_t2r_top_3_months: { smart: 9, aggressive: 14 },
        realistic_top_10_count_m12: { smart: { min: 5, max: 12 }, aggressive: { min: 15, max: 30 } },
        realistic_top_3_count_m12: { smart: { min: 2, max: 6 }, aggressive: { min: 8, max: 18 } },
        avg_click_value_ils: { min: 80, max: 400 },
        realistic_monthly_clicks_m12: { smart: { min: 300, max: 800 }, aggressive: { min: 1200, max: 3500 } },
        vertical_risks_he: [
            'EN content הוא חובה (target market global)',
            'תחרות עם G2 / Capterra / Reddit — זרמי תוכן ארגוניים אוכלים את ה-SERP',
            'sales cycle ארוך — SEO רק תחילת funnel',
        ],
        quick_win_patterns_he: [
            'use-case content (alternatives to X / vs Y) → high commercial intent',
            'integration pages → long-tail discovery',
        ],
        misclassification_warnings: [
            'אם ב-2C — זה ecommerce_niche או other',
            'אם 100% IL market — זה professional_services',
        ],
    },
    professional_services: {
        label_he: 'שירותים מקצועיים (יועצים / רואי חשבון / יחצנים)',
        median_t2r_top_3_months: { smart: 6, aggressive: 10 },
        realistic_top_10_count_m12: { smart: { min: 6, max: 12 }, aggressive: { min: 14, max: 25 } },
        realistic_top_3_count_m12: { smart: { min: 3, max: 7 }, aggressive: { min: 8, max: 15 } },
        avg_click_value_ils: { min: 50, max: 200 },
        realistic_monthly_clicks_m12: { smart: { min: 400, max: 1000 }, aggressive: { min: 1500, max: 3500 } },
        vertical_risks_he: [
            'קונסולידציה לא נפוצה — long-tail per problem אופטימלי',
            'thought leadership content (LinkedIn cross-post) חשוב לאמון',
        ],
        quick_win_patterns_he: [
            'case studies + שמות לקוחות (אישור פרסום) → social proof + branded queries',
            'expert author bylines',
        ],
        misclassification_warnings: ['אם דין/חוק — זה legal_services (YMYL)'],
    },
    real_estate: {
        label_he: 'נדל"ן',
        median_t2r_top_3_months: { smart: 8, aggressive: 13 },
        realistic_top_10_count_m12: { smart: { min: 12, max: 22 }, aggressive: { min: 28, max: 50 } },
        realistic_top_3_count_m12: { smart: { min: 5, max: 10 }, aggressive: { min: 14, max: 28 } },
        avg_click_value_ils: { min: 30, max: 120 },
        realistic_monthly_clicks_m12: { smart: { min: 1200, max: 3000 }, aggressive: { min: 5000, max: 12000 } },
        vertical_risks_he: ['Yad2 / Madlan domination בroad SERPs', 'IL market data חוזר על עצמו ⇒ דרוש original analysis'],
        quick_win_patterns_he: ['neighborhood pages עם schema + תוכן ייחודי', 'market reports per quarter → links + branded queries'],
        misclassification_warnings: [],
    },
    education_courses: {
        label_he: 'חינוך / קורסים אונליין',
        median_t2r_top_3_months: { smart: 5, aggressive: 9 },
        realistic_top_10_count_m12: { smart: { min: 10, max: 18 }, aggressive: { min: 22, max: 40 } },
        realistic_top_3_count_m12: { smart: { min: 5, max: 10 }, aggressive: { min: 12, max: 24 } },
        avg_click_value_ils: { min: 15, max: 60 },
        realistic_monthly_clicks_m12: { smart: { min: 1800, max: 4500 }, aggressive: { min: 6000, max: 15000 } },
        vertical_risks_he: ['Udemy/Coursera dominate broad — נישה ספציפית הכרחית', 'attribution קשה (long sales cycle)'],
        quick_win_patterns_he: ['free intro course → email + remarketing', 'student case studies + transcripts → long-tail magnet'],
        misclassification_warnings: [],
    },
    food_delivery: {
        label_he: 'משלוחי מזון / מסעדות',
        median_t2r_top_3_months: { smart: 4, aggressive: 7 },
        realistic_top_10_count_m12: { smart: { min: 18, max: 30 }, aggressive: { min: 40, max: 70 } },
        realistic_top_3_count_m12: { smart: { min: 8, max: 15 }, aggressive: { min: 20, max: 40 } },
        avg_click_value_ils: { min: 4, max: 12 },
        realistic_monthly_clicks_m12: { smart: { min: 4000, max: 10000 }, aggressive: { min: 15000, max: 35000 } },
        vertical_risks_he: ['Wolt / 10bis / Cibus קוטעים את הצמיחה האורגנית', 'GMB hyper-critical — Reviews + photos + hours updated'],
        quick_win_patterns_he: ['menu pages עם schema + photos', 'neighborhood landing pages'],
        misclassification_warnings: [],
    },
    auto_services: {
        label_he: 'שירותי רכב / מוסכים',
        median_t2r_top_3_months: { smart: 5, aggressive: 9 },
        realistic_top_10_count_m12: { smart: { min: 10, max: 18 }, aggressive: { min: 22, max: 38 } },
        realistic_top_3_count_m12: { smart: { min: 5, max: 10 }, aggressive: { min: 12, max: 22 } },
        avg_click_value_ils: { min: 20, max: 60 },
        realistic_monthly_clicks_m12: { smart: { min: 1500, max: 3500 }, aggressive: { min: 4500, max: 10000 } },
        vertical_risks_he: ['city/area-specific intent — דורש 5+ city pages'],
        quick_win_patterns_he: ['service category pages + price ranges + schema'],
        misclassification_warnings: [],
    },
    beauty_wellness: {
        label_he: 'יופי / wellness / אסתטיקה',
        median_t2r_top_3_months: { smart: 6, aggressive: 10 },
        realistic_top_10_count_m12: { smart: { min: 12, max: 22 }, aggressive: { min: 28, max: 50 } },
        realistic_top_3_count_m12: { smart: { min: 6, max: 12 }, aggressive: { min: 15, max: 28 } },
        avg_click_value_ils: { min: 15, max: 50 },
        realistic_monthly_clicks_m12: { smart: { min: 2000, max: 5000 }, aggressive: { min: 6500, max: 15000 } },
        vertical_risks_he: ['SHM/regulation — claims מוגבלים', 'highly visual category — image_pack ownership חיוני'],
        quick_win_patterns_he: ['before-after content + schema.review', 'treatment guides per concern'],
        misclassification_warnings: ['אם רפואי/דרמטולוג — זה health_clinic (YMYL)'],
    },
    finance_personal: {
        label_he: 'פיננסים אישיים (משכנתאות, ביטוחים, השקעות)',
        median_t2r_top_3_months: { smart: 9, aggressive: 14 },
        realistic_top_10_count_m12: { smart: { min: 5, max: 10 }, aggressive: { min: 12, max: 22 } },
        realistic_top_3_count_m12: { smart: { min: 2, max: 5 }, aggressive: { min: 6, max: 14 } },
        avg_click_value_ils: { min: 80, max: 350 },
        realistic_monthly_clicks_m12: { smart: { min: 400, max: 1000 }, aggressive: { min: 1500, max: 4000 } },
        vertical_risks_he: ['YMYL — top tier EEAT דרושה', 'רגולציה (רשות שוק ההון) מגבילה pitches'],
        quick_win_patterns_he: ['calculators (משכנתא / חיסכון) → backlinks + branded queries'],
        misclassification_warnings: [],
    },
    legal_services: {
        label_he: 'עו"ד / שירותים משפטיים',
        median_t2r_top_3_months: { smart: 7, aggressive: 12 },
        realistic_top_10_count_m12: { smart: { min: 6, max: 12 }, aggressive: { min: 14, max: 28 } },
        realistic_top_3_count_m12: { smart: { min: 3, max: 7 }, aggressive: { min: 8, max: 18 } },
        avg_click_value_ils: { min: 60, max: 250 },
        realistic_monthly_clicks_m12: { smart: { min: 500, max: 1200 }, aggressive: { min: 1800, max: 4500 } },
        vertical_risks_he: ['YMYL + תקנות לשכת עו"ד מגבילות claims', 'expert author bylines הכרחי'],
        quick_win_patterns_he: ['practice area pages עם FAQ + תקנות עדכניות'],
        misclassification_warnings: [],
    },
    other: {
        label_he: 'אחר',
        median_t2r_top_3_months: { smart: 7, aggressive: 11 },
        realistic_top_10_count_m12: { smart: { min: 8, max: 18 }, aggressive: { min: 20, max: 40 } },
        realistic_top_3_count_m12: { smart: { min: 4, max: 9 }, aggressive: { min: 10, max: 22 } },
        avg_click_value_ils: { min: 15, max: 50 },
        realistic_monthly_clicks_m12: { smart: { min: 1200, max: 3000 }, aggressive: { min: 4000, max: 10000 } },
        vertical_risks_he: [],
        quick_win_patterns_he: [],
        misclassification_warnings: ['בחרו vertical ספציפי לתוצאה מדויקת יותר'],
    },
}

/**
 * Heuristic vertical classifier — best-effort from answers + business
 * description. validation prompt receives the suggested vertical AND the
 * model is asked to override if classification is wrong.
 */
export function classifyVertical(answers: Record<string, unknown>): ILVertical {
    const text = (
        String(answers.businessDescription || '') + ' ' +
        String(answers.targetAudience || '') + ' ' +
        String(answers.businessName || '') + ' ' +
        String(answers.platforms || '')
    ).toLowerCase()
    if (/אחסון|self storage|מחסן/i.test(text)) return 'storage_local_service'
    if (/שיפוצ|ניקיון|הובלות|אינסטלטור|נגר|חשמלאי/i.test(text)) return 'home_services'
    if (/רופא|מרפאה|דרמטולוג|רוקח|פיזיותרפ|תזונאי/i.test(text)) return 'health_clinic'
    if (/saas|cloud|software|platform|api|developer/i.test(text) && /b2b|enterprise/i.test(text)) return 'b2b_saas_il'
    if (/eshop|e-shop|חנות|shop|product|ecommerce|מוצרים/i.test(text)) {
        if (/niche|specialty|נישה/i.test(text)) return 'ecommerce_niche'
        return 'ecommerce_general'
    }
    if (/יועץ|רואה חשבון|יחצן|consultant|accountant|advisor/i.test(text)) return 'professional_services'
    if (/נדל"?ן|דירה|בית למכירה|real estate|realtor/i.test(text)) return 'real_estate'
    if (/קורס|הכשרה|לימוד|course|training|בית ספר/i.test(text)) return 'education_courses'
    if (/מסעדה|משלוח|delivery|food|חומוס|פיצה|בורגר/i.test(text)) return 'food_delivery'
    if (/מוסך|רכב|car|תיקון|חלפים/i.test(text)) return 'auto_services'
    if (/יופי|קוסמטיק|spa|מספרה|מניק|פדיק|אסתטיקה/i.test(text)) return 'beauty_wellness'
    if (/משכנתא|השקעה|ביטוח|פיננס|finance|insurance/i.test(text)) return 'finance_personal'
    if (/עו"?ד|דין|חוק|משפט|legal|attorney/i.test(text)) return 'legal_services'
    return 'other'
}