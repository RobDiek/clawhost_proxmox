/**
 * Israeli paid-advertising benchmarks per vertical.
 *
 * These are reference ranges synthesized from Sergei's 7-year IL agency
 * experience + 2024-2026 industry reports (WordStream IL/Adalysis/SISTR).
 * Used by paid_budget_scenarios to convert "₪10K/month" into "≈ X clicks,
 * Y conversions, Z CPA" using vertical-realistic CVR/CPA ranges instead of
 * global averages which mislead IL SMBs.
 *
 * Verticals are intentionally coarse — we group by underlying funnel
 * economics, not by industry taxonomy. A "Pilates studio" and a "Yoga
 * studio" share fitness_local_service benchmarks; a "law firm
 * specializing in divorce" and a "real estate lawyer" share
 * legal_consult.
 *
 * Confidence calibration: ranges are intentionally wide (p25-p75).
 * If a user's account is below p25, that's red-flag; above p75 = either
 * exceptional creative or hidden tracking inflation. Median is the
 * baseline assumption.
 */

export type IlVertical =
    | 'storage_self_storage'
    | 'fitness_local_service'      // pilates, yoga, gym, personal trainer
    | 'real_estate_brokerage'      // brokerage, agent services
    | 'real_estate_listings'       // listings marketplace
    | 'legal_consult'              // law firm lead gen
    | 'medical_clinic'             // dermatology, dental, cosmetic
    | 'ecommerce_apparel'
    | 'ecommerce_food_grocery'
    | 'ecommerce_electronics'
    | 'ecommerce_physical'         // generic physical-goods ecom (home goods, moving supplies, packaging, hardware…)
    | 'b2b_saas'
    | 'b2b_services'               // accounting, marketing services, HR
    | 'beauty_services'            // salon, spa, esthetician
    | 'home_services'              // plumber, electrician, cleaner, mover
    | 'courses_education'          // online courses, tutoring, certifications
    | 'tourism_hospitality'        // hotels, tour operators
    | 'financial_consulting'       // mortgage broker, investment advisor
    | 'unknown'

/**
 * Per-vertical benchmarks. All values in ILS.
 *
 * - `search_cpc_*` — top-of-page bid range. Bigger range = more variance.
 * - `display_cpm_*` — for awareness layer (Pmax + Meta prospecting).
 * - `cvr_*` — conversion rate from click to PRIMARY conversion event
 *   (lead form OR purchase). Excludes engagement events.
 * - `cpa_*` — cost per acquisition floor for healthy accounts.
 * - `aov_*` — average order value (ecommerce) or lead-to-customer LTV
 *   for service businesses.
 * - `roas_target` — minimum healthy ROAS at maturity (T4 tier).
 */
export interface VerticalBenchmark {
    label_he: string
    label_en: string
    /** Search CPC range (p25/median/p75) — Google Ads in ILS. */
    search_cpc: { p25: number; median: number; p75: number }
    /** Meta CPC range — typically 30-50% cheaper than Google Search. */
    meta_cpc: { p25: number; median: number; p75: number }
    /** Display CPM range (Pmax + Meta prospecting + Google Display). */
    display_cpm: { p25: number; median: number; p75: number }
    /** CVR floor/median/ceiling. Account-wide. */
    cvr: { p25: number; median: number; p75: number }
    /** CPA range at maturity (T4). T1/T2 will be 1.5-2× higher during learning. */
    cpa: { p25: number; median: number; p75: number }
    /** Customer / lead lifetime value — informs ROAS targets. */
    ltv: { p25: number; median: number; p75: number }
    /** Minimum healthy ROAS at T4. */
    roas_target_minimum: number
    /** Typical conversion mechanism. Drives event-tracking + bid strategy. */
    typical_conversion: 'lead_form' | 'phone_call' | 'whatsapp_message' | 'purchase' | 'booking'
    /** Notes on IL-specific risks for this vertical. */
    il_notes: string
    /** Suggested minimum month-1 budget to leave learning phase (₪). */
    min_viable_monthly_budget_ils: number
}

export const IL_VERTICAL_BENCHMARKS: Record<IlVertical, VerticalBenchmark> = {
    storage_self_storage: {
        label_he: 'אחסון פרטי',
        label_en: 'Self-storage',
        search_cpc: { p25: 4, median: 8, p75: 18 },
        meta_cpc: { p25: 2, median: 4, p75: 8 },
        display_cpm: { p25: 8, median: 15, p75: 28 },
        cvr: { p25: 0.015, median: 0.03, p75: 0.06 },
        cpa: { p25: 120, median: 240, p75: 450 },
        ltv: { p25: 1200, median: 2400, p75: 4800 },        // 6-24 months ARPU
        roas_target_minimum: 4,
        typical_conversion: 'whatsapp_message',
        il_notes: 'IL self-storage is geo-tight (5-15km radius). WhatsApp leads outperform forms 2-3×. Brand bidding common — defensive campaign mandatory.',
        min_viable_monthly_budget_ils: 3000,
    },
    fitness_local_service: {
        label_he: 'שירות כושר מקומי',
        label_en: 'Fitness local service',
        search_cpc: { p25: 3, median: 7, p75: 15 },
        meta_cpc: { p25: 2, median: 4, p75: 8 },
        display_cpm: { p25: 8, median: 14, p75: 25 },
        cvr: { p25: 0.02, median: 0.04, p75: 0.08 },
        cpa: { p25: 80, median: 170, p75: 320 },
        ltv: { p25: 1500, median: 3500, p75: 7000 },
        roas_target_minimum: 6,
        typical_conversion: 'lead_form',
        il_notes: 'High seasonality (Jan/Sept peaks). Free-trial offers convert 3-5× higher. Class-based studios benefit from Meta over Google.',
        min_viable_monthly_budget_ils: 2500,
    },
    real_estate_brokerage: {
        label_he: 'תיווך נדל"ן',
        label_en: 'Real estate brokerage',
        search_cpc: { p25: 8, median: 18, p75: 40 },
        meta_cpc: { p25: 3, median: 8, p75: 18 },
        display_cpm: { p25: 12, median: 22, p75: 45 },
        cvr: { p25: 0.005, median: 0.012, p75: 0.025 },
        cpa: { p25: 400, median: 1200, p75: 3500 },
        ltv: { p25: 8000, median: 25000, p75: 80000 },   // brokerage commission
        roas_target_minimum: 8,
        typical_conversion: 'phone_call',
        il_notes: 'High-value low-volume vertical. Phone calls 4× more valuable than forms. Long sales cycles (3-9 months) — Customer Match + offline conv mandatory.',
        min_viable_monthly_budget_ils: 8000,
    },
    real_estate_listings: {
        label_he: 'יד2/לוח דירות',
        label_en: 'Real estate listings',
        search_cpc: { p25: 4, median: 9, p75: 18 },
        meta_cpc: { p25: 2, median: 5, p75: 10 },
        display_cpm: { p25: 10, median: 18, p75: 30 },
        cvr: { p25: 0.025, median: 0.06, p75: 0.12 },
        cpa: { p25: 30, median: 80, p75: 180 },
        ltv: { p25: 200, median: 600, p75: 1500 },        // listing fees
        roas_target_minimum: 4,
        typical_conversion: 'lead_form',
        il_notes: 'High-volume low-margin. SEM cannibalizes brand search. Meta Lookalike on engaged users core to scale.',
        min_viable_monthly_budget_ils: 5000,
    },
    legal_consult: {
        label_he: 'משרד עורכי דין',
        label_en: 'Legal consultation',
        search_cpc: { p25: 12, median: 28, p75: 65 },
        meta_cpc: { p25: 5, median: 12, p75: 25 },
        display_cpm: { p25: 15, median: 28, p75: 50 },
        cvr: { p25: 0.015, median: 0.035, p75: 0.07 },
        cpa: { p25: 400, median: 1000, p75: 2500 },
        ltv: { p25: 3000, median: 8000, p75: 25000 },
        roas_target_minimum: 5,
        typical_conversion: 'phone_call',
        il_notes: 'Highest CPC in IL paid. Quality Score critical (specialty-specific landing pages). Niche specialty (e.g. divorce, criminal) lower CPC than generic "עורך דין".',
        min_viable_monthly_budget_ils: 6000,
    },
    medical_clinic: {
        label_he: 'מרפאה/קליניקה',
        label_en: 'Medical/cosmetic clinic',
        search_cpc: { p25: 8, median: 18, p75: 38 },
        meta_cpc: { p25: 4, median: 9, p75: 20 },
        display_cpm: { p25: 12, median: 22, p75: 40 },
        cvr: { p25: 0.02, median: 0.045, p75: 0.09 },
        cpa: { p25: 150, median: 350, p75: 800 },
        ltv: { p25: 1500, median: 4000, p75: 12000 },
        roas_target_minimum: 5,
        typical_conversion: 'booking',
        il_notes: 'Cosmetic clinics ad-policy sensitive (Meta sometimes blocks "before/after" creatives). Phone bookings dominate. Trust signals (doctor credentials) high QS impact.',
        min_viable_monthly_budget_ils: 5000,
    },
    ecommerce_apparel: {
        label_he: 'מסחר אונליין — אופנה',
        label_en: 'Ecommerce apparel',
        search_cpc: { p25: 2, median: 5, p75: 10 },
        meta_cpc: { p25: 1, median: 3, p75: 6 },
        display_cpm: { p25: 6, median: 12, p75: 22 },
        cvr: { p25: 0.012, median: 0.025, p75: 0.05 },
        cpa: { p25: 50, median: 120, p75: 280 },
        ltv: { p25: 300, median: 800, p75: 2000 },        // average order × repeat rate
        roas_target_minimum: 3,
        typical_conversion: 'purchase',
        il_notes: 'Catalog + Advantage+ Shopping (Meta) + Pmax (Google) the standard stack. iOS attribution loss heavy — CAPI + EC mandatory.',
        min_viable_monthly_budget_ils: 4000,
    },
    ecommerce_food_grocery: {
        label_he: 'מסחר אונליין — מזון',
        label_en: 'Ecommerce food/grocery',
        search_cpc: { p25: 3, median: 7, p75: 15 },
        meta_cpc: { p25: 2, median: 4, p75: 8 },
        display_cpm: { p25: 8, median: 14, p75: 25 },
        cvr: { p25: 0.025, median: 0.05, p75: 0.10 },
        cpa: { p25: 40, median: 90, p75: 200 },
        ltv: { p25: 800, median: 2400, p75: 6000 },      // subscription-like repeat
        roas_target_minimum: 4,
        typical_conversion: 'purchase',
        il_notes: 'Delivery radius constraints. Subscription/recurring orders dominate LTV — track first-30d-2nd-purchase, not just first conv. Wolt/10bis cannibalize direct.',
        min_viable_monthly_budget_ils: 3500,
    },
    ecommerce_electronics: {
        label_he: 'מסחר אונליין — אלקטרוניקה',
        label_en: 'Ecommerce electronics',
        search_cpc: { p25: 3, median: 8, p75: 18 },
        meta_cpc: { p25: 2, median: 5, p75: 12 },
        display_cpm: { p25: 10, median: 18, p75: 32 },
        cvr: { p25: 0.008, median: 0.018, p75: 0.04 },
        cpa: { p25: 80, median: 220, p75: 500 },
        ltv: { p25: 1500, median: 4000, p75: 10000 },
        roas_target_minimum: 3,
        typical_conversion: 'purchase',
        il_notes: 'Lower margins than apparel (15-25%). Price-comparison sites (Zap, Walla) heavy on Google — bid defensively on brand + model SKUs. Long consideration cycle.',
        min_viable_monthly_budget_ils: 6000,
    },
    b2b_saas: {
        label_he: 'B2B SaaS',
        label_en: 'B2B SaaS',
        search_cpc: { p25: 8, median: 22, p75: 55 },
        meta_cpc: { p25: 5, median: 15, p75: 35 },
        display_cpm: { p25: 18, median: 35, p75: 65 },
        cvr: { p25: 0.008, median: 0.02, p75: 0.05 },
        cpa: { p25: 400, median: 1200, p75: 3000 },
        ltv: { p25: 3000, median: 12000, p75: 60000 },
        roas_target_minimum: 4,
        typical_conversion: 'lead_form',
        il_notes: 'LinkedIn often wins over Meta for B2B. Long sales cycle = MQL/SQL distinction critical. Free-trial → paid funnel needs offline conv import.',
        min_viable_monthly_budget_ils: 8000,
    },
    b2b_services: {
        label_he: 'B2B שירותים',
        label_en: 'B2B services',
        search_cpc: { p25: 6, median: 15, p75: 35 },
        meta_cpc: { p25: 4, median: 9, p75: 20 },
        display_cpm: { p25: 12, median: 22, p75: 40 },
        cvr: { p25: 0.010, median: 0.025, p75: 0.055 },
        cpa: { p25: 250, median: 700, p75: 1800 },
        ltv: { p25: 5000, median: 18000, p75: 60000 },
        roas_target_minimum: 5,
        typical_conversion: 'lead_form',
        il_notes: 'Phone + WhatsApp lead capture critical. LinkedIn outperforms Meta for premium B2B audiences.',
        min_viable_monthly_budget_ils: 6000,
    },
    beauty_services: {
        label_he: 'שירותי יופי',
        label_en: 'Beauty/salon services',
        search_cpc: { p25: 2, median: 5, p75: 11 },
        meta_cpc: { p25: 1, median: 3, p75: 7 },
        display_cpm: { p25: 6, median: 12, p75: 22 },
        cvr: { p25: 0.025, median: 0.055, p75: 0.11 },
        cpa: { p25: 50, median: 110, p75: 250 },
        ltv: { p25: 600, median: 1800, p75: 5000 },
        roas_target_minimum: 5,
        typical_conversion: 'booking',
        il_notes: 'Hyperlocal — 3-7km radius. Instagram dominates over Facebook. Hebrew video creatives (Reels) outperform static.',
        min_viable_monthly_budget_ils: 2000,
    },
    home_services: {
        label_he: 'שירותי בית (אינסטלטור/חשמלאי/הובלות/ניקיון)',
        label_en: 'Home services',
        search_cpc: { p25: 4, median: 9, p75: 22 },
        meta_cpc: { p25: 2, median: 5, p75: 12 },
        display_cpm: { p25: 8, median: 14, p75: 28 },
        cvr: { p25: 0.025, median: 0.06, p75: 0.13 },
        cpa: { p25: 60, median: 140, p75: 320 },
        ltv: { p25: 600, median: 1800, p75: 5000 },
        roas_target_minimum: 4,
        typical_conversion: 'phone_call',
        il_notes: '"Urgency now" intent — call tracking + GCLID capture mandatory. Smart Bidding works fast once 30 conv in 30d.',
        min_viable_monthly_budget_ils: 2500,
    },
    courses_education: {
        label_he: 'קורסים והדרכה',
        label_en: 'Courses/education',
        search_cpc: { p25: 3, median: 8, p75: 18 },
        meta_cpc: { p25: 2, median: 5, p75: 12 },
        display_cpm: { p25: 8, median: 16, p75: 30 },
        cvr: { p25: 0.010, median: 0.025, p75: 0.06 },
        cpa: { p25: 100, median: 280, p75: 700 },
        ltv: { p25: 800, median: 2500, p75: 8000 },
        roas_target_minimum: 4,
        typical_conversion: 'lead_form',
        il_notes: 'Email-nurture + retargeting drive 60%+ of conversions. Free webinar/lead-magnet funnel standard. Long consideration (2-8 weeks).',
        min_viable_monthly_budget_ils: 3500,
    },
    tourism_hospitality: {
        label_he: 'תיירות ומלונאות',
        label_en: 'Tourism/hospitality',
        search_cpc: { p25: 4, median: 10, p75: 22 },
        meta_cpc: { p25: 2, median: 6, p75: 14 },
        display_cpm: { p25: 10, median: 18, p75: 35 },
        cvr: { p25: 0.012, median: 0.028, p75: 0.06 },
        cpa: { p25: 100, median: 250, p75: 600 },
        ltv: { p25: 1500, median: 4000, p75: 10000 },
        roas_target_minimum: 5,
        typical_conversion: 'booking',
        il_notes: 'Strong seasonality. Booking.com / Expedia + direct competing for same searches. Direct-booking incentives (10-15% off) drive shift to brand.',
        min_viable_monthly_budget_ils: 5000,
    },
    financial_consulting: {
        label_he: 'יעוץ פיננסי / משכנתאות',
        label_en: 'Financial consulting',
        search_cpc: { p25: 10, median: 25, p75: 60 },
        meta_cpc: { p25: 5, median: 14, p75: 30 },
        display_cpm: { p25: 16, median: 32, p75: 60 },
        cvr: { p25: 0.015, median: 0.035, p75: 0.08 },
        cpa: { p25: 350, median: 900, p75: 2200 },
        ltv: { p25: 5000, median: 18000, p75: 60000 },
        roas_target_minimum: 6,
        typical_conversion: 'phone_call',
        il_notes: 'Regulated category (Meta + Google ad policy). Compliance review on every creative. Phone calls dominate; offline conv import mandatory.',
        min_viable_monthly_budget_ils: 8000,
    },
    ecommerce_physical: {
        label_he: 'מסחר אלקטרוני — מוצרים פיזיים (כללי)',
        label_en: 'Ecommerce — physical goods (general)',
        // DRAFT benchmarks (Sergei to verify) — low-to-mid AOV physical goods
        // sold online (home goods, moving/packaging supplies, hardware). Tuned
        // to align with the paid_audit cross-stage gate floors: CPA floor ≈ ₪70,
        // ROAS floor 3.5×, physical-store CVR band 1.8-2.8%.
        search_cpc: { p25: 2.5, median: 6, p75: 14 },
        meta_cpc: { p25: 1.5, median: 3.5, p75: 8 },
        display_cpm: { p25: 9, median: 16, p75: 30 },
        cvr: { p25: 0.012, median: 0.022, p75: 0.04 },     // 1.2% / 2.2% / 4.0% (physical-store realistic)
        cpa: { p25: 70, median: 110, p75: 200 },           // p25 floor matches gate ₪70
        ltv: { p25: 150, median: 320, p75: 700 },          // low-AOV, low retention (single purchase)
        roas_target_minimum: 3.5,
        typical_conversion: 'purchase',
        il_notes: 'Low-AOV physical goods: ROAS-sensitive, thin margins. Real purchase CR ≈ 1.8-2.8% — anything far above signals micro-conversion pollution (count phone/WhatsApp/form at distinct values, not flat). Sharp seasonality common (e.g. moving supplies peak Jun-Aug). Shopping/PMax feed quality + product_schema drive performance more than ad copy.',
        min_viable_monthly_budget_ils: 3000,
    },
    unknown: {
        label_he: 'עסק כללי (לא סווג)',
        label_en: 'General business (unclassified)',
        search_cpc: { p25: 4, median: 10, p75: 22 },
        meta_cpc: { p25: 2, median: 5, p75: 12 },
        display_cpm: { p25: 10, median: 18, p75: 32 },
        cvr: { p25: 0.015, median: 0.035, p75: 0.075 },
        cpa: { p25: 100, median: 280, p75: 700 },
        ltv: { p25: 1000, median: 3500, p75: 10000 },
        roas_target_minimum: 4,
        typical_conversion: 'lead_form',
        il_notes: 'Vertical-detection failed. Numbers reflect IL SMB-paid-account median. Recommend explicit business-type input from user for sharper targets.',
        min_viable_monthly_budget_ils: 3000,
    },
}

/**
 * Classify a business description into one of our vertical buckets. Cheap
 * keyword-based heuristic; ambiguous cases default to 'unknown'.
 */
export function classifyIlVertical(opts: {
    businessName: string
    businessDesc: string
    productsText: string
    /** Optional: explicit business model from the questionnaire
     * ('ecommerce' | 'saas' | 'local' | 'service' | 'content'). Used as a
     * fallback when the Hebrew/English lexicon doesn't match — avoids
     * defaulting to 'unknown' when we already KNOW the model. */
    businessModel?: string | null
}): { vertical: IlVertical; confidence: 'high' | 'medium' | 'low'; rationale: string } {
    const txt = `${opts.businessName} ${opts.businessDesc} ${opts.productsText}`.toLowerCase()

    type Rule = { vertical: IlVertical; he?: RegExp; en?: RegExp; minHits?: number }
    const rules: Rule[] = [
        { vertical: 'storage_self_storage', he: /אחסון|מחסן|סטוראג'?|פינוי|דירה צבא/u, en: /\b(self[\s-]?storage|warehouse|storage unit)\b/i },
        { vertical: 'fitness_local_service', he: /פילאטיס|יוגה|ספורט|כושר|אימון אישי|חדר כושר/u, en: /\b(pilates|yoga|gym|fitness|personal trainer|crossfit)\b/i },
        { vertical: 'real_estate_brokerage', he: /תיווך|מתווך|נדל"ן|דירה|מכירת דירות/u, en: /\b(real[\s-]?estate|broker|realtor)\b/i },
        { vertical: 'legal_consult', he: /עורך דין|עו"ד|משפטי|תביעה|גירושין|נזיקין|פלילי/u, en: /\blaw firm|attorney|lawyer|legal|litigation/i },
        { vertical: 'medical_clinic', he: /מרפאה|רופא|רופאת|קליניקה|אסתטיקה|שיניים|עור|השתלת/u, en: /\b(clinic|dental|cosmetic|aesthetic|doctor|dermat)\b/i },
        { vertical: 'ecommerce_apparel', he: /בגדים|אופנה|נעליים|תכשיטים|אקססוריז/u, en: /\b(apparel|fashion|shoes|jewelry|accessories)\b/i },
        { vertical: 'ecommerce_food_grocery', he: /מזון|מצרכים|סופר|פירות|ירקות|משלוח אוכל/u, en: /\b(grocery|food delivery|meal kit)\b/i },
        { vertical: 'ecommerce_electronics', he: /אלקטרוניקה|מחשב|טלפון|מכשירים|מוצרי חשמל/u, en: /\b(electronics|computers|appliances|phones|gadgets)\b/i },
        { vertical: 'ecommerce_physical', he: /קרטונים|חומרי אריזה|ציוד אריזה|ארגזים|מוצרי בית|כלי בית|חומרה|כלי עבודה|ציוד למעבר דירה/u, en: /\b(moving boxes|packing supplies|home goods|houseware|hardware|packaging)\b/i },
        { vertical: 'b2b_saas', he: /תוכנה|פלטפורמה|SaaS|מערכת|אפליקציית עסקים/u, en: /\b(saas|software|platform|api|b2b tool)\b/i },
        { vertical: 'b2b_services', he: /יעוץ עסקי|רואה חשבון|שיווק עסקי|HR|משאבי אנוש/u, en: /\b(consulting|accounting|marketing services|hr)\b/i },
        { vertical: 'beauty_services', he: /קוסמטיקה|מספרה|מעצבת שיער|מניקור|שעוות|אסתטיקאית/u, en: /\b(salon|spa|esthetician|hair stylist|nails)\b/i },
        { vertical: 'home_services', he: /אינסטלטור|חשמלאי|הובלות|ניקיון|תיקונים|מנעולן/u, en: /\b(plumber|electrician|mover|cleaning|locksmith)\b/i },
        { vertical: 'courses_education', he: /קורס|לימוד|הדרכה|מורה פרטי|חוגים/u, en: /\b(course|tutoring|online learning|certification|class)\b/i },
        { vertical: 'tourism_hospitality', he: /מלון|צימר|חופשה|טיול מאורגן|שכרת רכב/u, en: /\b(hotel|resort|tour|travel|booking)\b/i },
        { vertical: 'financial_consulting', he: /משכנתא|יועץ פיננסי|השקעות|פנסיה|ביטוח/u, en: /\b(mortgage|investment|financial advisor|insurance)\b/i },
    ]

    for (const r of rules) {
        const heHit = r.he?.test(opts.businessDesc) || r.he?.test(opts.businessName) || r.he?.test(opts.productsText)
        const enHit = r.en?.test(txt)
        if (heHit) return { vertical: r.vertical, confidence: 'high', rationale: 'Hebrew vertical lexicon matched in business description' }
        if (enHit) return { vertical: r.vertical, confidence: 'medium', rationale: 'English vertical keywords matched (Hebrew preferred — possible mismatch)' }
    }

    // Fallback: no lexicon match, but the questionnaire gave us an explicit
    // business model. Map the unambiguous ones to a vertical so we don't fall
    // all the way to 'unknown' (which disqualifies the aggressive tier and
    // renders generic SMB benchmarks). Only the safe mappings — 'local' /
    // 'service' are too broad to pin to a single vertical, so they stay unknown.
    const model = (opts.businessModel || '').toLowerCase().trim()
    if (model === 'ecommerce') {
        return { vertical: 'ecommerce_physical', confidence: 'low', rationale: 'No vertical lexicon match — businessModel=ecommerce → generic physical-goods ecom benchmarks' }
    }
    if (model === 'saas') {
        return { vertical: 'b2b_saas', confidence: 'low', rationale: 'No vertical lexicon match — businessModel=saas → B2B SaaS benchmarks' }
    }

    return { vertical: 'unknown', confidence: 'low', rationale: 'No vertical lexicon match — using general IL SMB benchmarks' }
}

export function renderBenchmarksForPrompt(vertical: IlVertical): string {
    const b = IL_VERTICAL_BENCHMARKS[vertical]
    return [
        `═══ IL VERTICAL BENCHMARKS — ${b.label_he} (${b.label_en}) ═══`,
        '',
        `**Search CPC range (₪)**: p25=${b.search_cpc.p25} | median=${b.search_cpc.median} | p75=${b.search_cpc.p75}`,
        `**Meta CPC range (₪)**: p25=${b.meta_cpc.p25} | median=${b.meta_cpc.median} | p75=${b.meta_cpc.p75}`,
        `**Display CPM range (₪)**: p25=${b.display_cpm.p25} | median=${b.display_cpm.median} | p75=${b.display_cpm.p75}`,
        `**Conversion rate (CVR)**: p25=${(b.cvr.p25 * 100).toFixed(2)}% | median=${(b.cvr.median * 100).toFixed(2)}% | p75=${(b.cvr.p75 * 100).toFixed(2)}%`,
        `**CPA range at T4 maturity (₪)**: p25=${b.cpa.p25} | median=${b.cpa.median} | p75=${b.cpa.p75}`,
        `**Customer LTV (₪)**: p25=${b.ltv.p25} | median=${b.ltv.median} | p75=${b.ltv.p75}`,
        `**Minimum healthy ROAS at T4**: ${b.roas_target_minimum}×`,
        `**Typical conversion mechanism**: ${b.typical_conversion}`,
        `**Min viable monthly budget**: ₪${b.min_viable_monthly_budget_ils.toLocaleString()}`,
        `**IL-specific notes**: ${b.il_notes}`,
        '',
        'USE THESE AS ANCHORS:',
        '- Account performance BELOW p25 = red flag, investigate tracking/targeting',
        '- Account performance ABOVE p75 = either exceptional creative OR inflated tracking (check attribution)',
        '- Median is the realistic baseline assumption when projecting new scenarios',
        '- During T1/T2 learning phase, CPA can be 1.5-2× above mature CPA — plan for it',
    ].join('\n')
}