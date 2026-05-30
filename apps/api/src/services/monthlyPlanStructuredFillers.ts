/**
 * K23 — Structured fillers for monthly plan.
 *
 * Closes the systemic data-siloing gap discovered during K22 testing:
 * 5 research stages (internal_seo_audit, aeo_visibility, seo_keyword_research,
 * paid_keyword_research, paid_competitor_landscape) produce rich structured
 * records[] but Pass 1/Pass 2/Pass 3 Opus prompts only ever see markdown.
 * Empirical impact on Packing Station: ~50% of concrete audit findings
 * (Product schema on 65 pages, /cart/ duplicates, missing meta on 13 URLs,
 * etc.) never made it from the audit into the monthly plan.
 *
 * Each filler reads its stage's records[] and SPAWNS deterministic monthly
 * tasks by clustering records into actionable aggregates. No Opus call —
 * the records are already analyzed by the prefetch stage with concrete
 * `recommended_action` + `estimated_effort_hours` + Hebrew rationale.
 *
 * Tenant-agnostic by design: relies only on schema-defined record fields.
 * No hardcoded URLs, brand names, or industry assumptions. Tested on
 * Packing Station fixtures; will work on any tenant whose prefetch
 * stages produce records[] in the documented shape.
 *
 * Integration: monthlyPlanGenerator.ts invokes runStructuredFillers()
 * AFTER Pass 3 ensureCoverage but BEFORE Hebrew cleanup (so any English
 * jargon in our deterministic copy gets scrubbed too).
 */

import { randomBytes } from 'crypto'
import type { MonthlyTask, MonthlyTaskActionStep } from '@/controllers/hosting/agentSetup'

// ─── Filler contract ──────────────────────────────────────────────────────
export interface StructuredFiller {
    stageId: string
    description: string
    /**
     * Returns NEW MonthlyTask objects to append. Receives existingTasks so
     * the filler can skip records already covered (idempotency).
     */
    fill(rd: any, existingTasks: MonthlyTask[]): MonthlyTask[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function newTaskId(prefix = 'tsk'): string {
    return `${prefix}_${randomBytes(5).toString('hex')}`
}

function nowIso(): string {
    return new Date().toISOString()
}

// K23 idempotency check. ONLY title+summary, NOT actionPlan steps —
// actionPlan steps reference concepts in passing (e.g. "write meta title"
// inside a single-page task) which would create false positives that block
// cross-site fillers (e.g. "write meta description for 50 missing pages").
// A task's focus = its title+summary, not its internal mechanics.
function _existingTaskMatches(existingTasks: MonthlyTask[], patterns: RegExp[]): boolean {
    return existingTasks.some(t => {
        const hay = `${t.title || ''} ${t.summary || ''}`.toLowerCase()
        return patterns.some(p => p.test(hay))
    })
}

function _step(step: string, automated = false, minutes = 30): MonthlyTaskActionStep {
    return { step, automated, estimatedMinutes: minutes, status: 'pending' }
}

// ─── 1. internal_seo_audit filler ─────────────────────────────────────────
// Reads records[] of URL-level audit entries. Each record has fields:
//   { url, title, h1, meta_description, schemas_missing, schemas_present,
//     word_count, issues_critical, issues_warning, priority_score,
//     priority_class, recommended_action, expected_impact,
//     estimated_effort_hours, owner, onpage_score, quadrant_scores, ... }
// Clusters:
//   • THIN content (word_count < 300)
//   • MISSING Product schema on product pages (schemas_missing includes 'Product')
//   • DUPLICATE H1 (h1 array length > 1, surfaced via issues)
//   • MISSING meta description (meta_description empty)
//   • DUPLICATE canonical (issues mentions 'canonical_duplicate')
const INTERNAL_SEO_FILLER: StructuredFiller = {
    stageId: 'internal_seo_audit',
    description: 'Cluster URL-level SEO audit findings into actionable monthly tasks',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.internal_seo_audit?.records || []
        if (records.length === 0) return []

        const out: MonthlyTask[] = []

        // ── Cluster A: missing Product schema on product pages ──────────
        const productSchemaMissing = records.filter(r =>
            Array.isArray(r.schemas_missing)
            && r.schemas_missing.some((s: string) => /^Product$/i.test(s))
            && (r.page_type === 'product' || /\/product\//i.test(r.url || ''))
        )
        if (productSchemaMissing.length >= 3
            && !_existingTaskMatches(existingTasks, [/product schema|productschema|schema.*product/i, /סכמ[התה].*מוצר|תיוג.*מובנה.*מוצר|מוצר.*סכמ[התה]|מוצר.*תיוג מובנה/i])
        ) {
            const urls = productSchemaMissing.slice(0, 10).map(r => r.url).filter(Boolean)
            out.push({
                id: newTaskId('tsk_isa_prodschema'),
                type: 'website_change',
                title: `הוספת Product schema ל-${productSchemaMissing.length} דפי מוצר`.slice(0, 80),
                summary: `סריקה זיהתה ${productSchemaMissing.length} דפי מוצר ללא Product schema — אובדן rich snippets (מחיר, ביקורות, זמינות) ב-SERP.`,
                channel: 'seo',
                priority: 'P0',
                estimatedEffort: productSchemaMissing.length > 30 ? '2_3_days' : '1_day',
                expectedImpact: {
                    metric: 'organic_traffic_pct',
                    value: 15,
                    horizon: '30d',
                    confidence: 'high',
                    rationale: `Product schema על ${productSchemaMissing.length} דפים פותח rich snippets — עליה צפויה 10-20% CTR.`,
                },
                sources: [
                    { type: 'other', ref: `internal_seo_audit.records[].schemas_missing=Product (n=${productSchemaMissing.length})`, excerpt: `${productSchemaMissing.length} דפי מוצר ללא Product schema זוהו באודיט הטכני.` },
                    ...urls.slice(0, 3).map(u => ({ type: 'other' as const, ref: `internal_seo_audit.records[].url=${u}`, excerpt: `דוגמה: ${u}` })),
                ],
                dependsOn: [],
                actionPlan: [
                    _step('בחנו את תבנית WooCommerce — הפעילו אפשרות הזרקת Product schema אוטומטית (פלאגין Rank Math / Yoast / RankMath Pro).', false, 30),
                    _step('בדקו ב-Schema.org Validator שכל הדפים מתקבלים תקין: name, image, price (priceCurrency=ILS), availability, brand.', false, 45),
                    _step(`עברו על דוגמת ${urls.length || 'N'} דפים (השארנו רשימה ב-sources) ואמתו שה-schema fields מאוכלסים בערכים נכונים.`, false, 60),
                    _step('בקשו אינדוקס מחדש דרך Search Console URL Inspection לדפים מובילים (top-10 by traffic).', false, 30),
                    _step('ניטור: 30 ימים — מדדו CTR במבט שאילתות מוצריות ב-GSC; יעד: +10-15% CTR + הופעת rich snippets.', false, 15),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 2,
            })
        }

        // ── Cluster B: thin content (word_count < 300) ──────────────────
        const thinPages = records.filter(r => typeof r.word_count === 'number' && r.word_count < 300)
        if (thinPages.length >= 5) {
            const titleKeywords = [/thin content|תוכן דק|הרחבת.*דפים|דפים דקים/i]
            // Skip if a thin-content task already exists (e.g. one Opus generated)
            if (!_existingTaskMatches(existingTasks, titleKeywords)) {
                const urls = thinPages.slice(0, 15).map(r => r.url).filter(Boolean)
                out.push({
                    id: newTaskId('tsk_isa_thin'),
                    type: 'content_creation',
                    title: `הרחבת ${thinPages.length} דפים עם תוכן דק (<300 מילים)`.slice(0, 80),
                    summary: `${thinPages.length} דפים מתחת ל-300 מילים — פגיעות גבוהה ל-Helpful Content Update. דחוף לעמודי קטגוריה/מוצר.`,
                    channel: 'content',
                    priority: 'P0',
                    estimatedEffort: thinPages.length > 20 ? '2_3_days' : '1_day',
                    expectedImpact: {
                        metric: 'organic_traffic_pct',
                        value: 25,
                        horizon: '60d',
                        confidence: 'medium',
                        rationale: `הרחבת ${thinPages.length} דפי דק content ל-400+ מילים מורידה Helpful Content vulnerability score ב-30-40 נקודות.`,
                    },
                    sources: [
                        { type: 'other', ref: `internal_seo_audit.records[].word_count<300 (n=${thinPages.length})`, excerpt: `${thinPages.length} דפים זוהו עם פחות מ-300 מילים.` },
                        ...urls.slice(0, 3).map(u => ({ type: 'other' as const, ref: `internal_seo_audit.records[].url=${u}`, excerpt: `דוגמה: ${u}` })),
                    ],
                    dependsOn: [],
                    actionPlan: [
                        _step('מיינו את הדפים לפי priority_score מהאודיט — התחילו ב-10 דפים בעדיפות גבוהה.', false, 20),
                        _step('הוסיפו לכל דף: פסקת פתיחה עם USP (50-80 מילים), 3-5 מפרטים טכניים, FAQ עם 3-5 שאלות, "שימושים נפוצים" (60-100 מילים).', false, 180),
                        _step('הוסיפו תמונות מצוידות alt text בעברית + תיאור כמותי (גודל, מחיר, חבילה).', false, 60),
                        _step('סבב שני: עברו על 10-15 דפים נוספים תוך 14 ימים, באותה תבנית.', false, 240),
                        _step('ניטור: 60 ימים — מדדו Helpful Content vulnerability score החדש ב-GSC + traffic delta על דפים מועצמים.', false, 30),
                    ],
                    status: 'proposed',
                    proposedAt: nowIso(),
                    weekOfMonth: 1,
                })
            }
        }

        // ── Cluster C: missing meta description ─────────────────────────
        const missingMeta = records.filter(r =>
            (!r.meta_description || (typeof r.meta_description === 'string' && r.meta_description.trim() === ''))
            || (typeof r.meta_length === 'number' && r.meta_length < 50)
        )
        if (missingMeta.length >= 5
            && !_existingTaskMatches(existingTasks, [/meta description|תיאור.*meta|meta_description|תיאור.*תגית/i])
        ) {
            const urls = missingMeta.slice(0, 10).map(r => r.url).filter(Boolean)
            out.push({
                id: newTaskId('tsk_isa_meta'),
                type: 'website_change',
                title: `כתיבת meta description ל-${missingMeta.length} דפים`.slice(0, 80),
                summary: `${missingMeta.length} דפים חסרים meta description או קצרים מ-50 תווים — אובדן שליטה ב-snippet ב-SERP.`,
                channel: 'seo',
                priority: 'P1',
                estimatedEffort: missingMeta.length > 15 ? '1_day' : '2_3_hours',
                expectedImpact: {
                    metric: 'ctr_pct',
                    value: 8,
                    horizon: '30d',
                    confidence: 'high',
                    rationale: `meta description ייחודי + 150-160 תווים מעלה CTR ב-5-10% לעומת auto-generated snippet.`,
                },
                sources: [
                    { type: 'other', ref: `internal_seo_audit.records[].meta_description missing/short (n=${missingMeta.length})`, excerpt: `${missingMeta.length} דפים זוהו עם meta description חסר או <50 תווים.` },
                    ...urls.slice(0, 3).map(u => ({ type: 'other' as const, ref: `internal_seo_audit.records[].url=${u}`, excerpt: `דוגמה: ${u}` })),
                ],
                dependsOn: [],
                actionPlan: [
                    _step('עבדו עם הרשימה מ-sources — לכל דף כתבו meta description 150-160 תווים בעברית.', false, 90),
                    _step('כללו: keyword עיקרי + value prop + CTA (לדוגמה: "משלוח חינם", "הזמינו עכשיו").', false, 30),
                    _step('הכניסו דרך Yoast/RankMath / WooCommerce product fields. שמרו רשימת הדפים המעודכנים.', false, 60),
                    _step('בקשו crawl מחדש דרך GSC URL Inspection ל-10 הדפים החשובים ביותר.', false, 20),
                    _step('ניטור: 30 ימים — השוו CTR ב-GSC לפני/אחרי על הדפים שהשתנו.', false, 15),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 1,
            })
        }

        return out
    },
}

// ─── 2. aeo_visibility filler ─────────────────────────────────────────────
// records[] each: { target, type, current_state, quotability_score_0_100,
//   recommended_action, expected_aeo_impact, estimated_effort_hours, owner,
//   evidence, timeline, confidence, _target_kind }
const AEO_FILLER: StructuredFiller = {
    stageId: 'aeo_visibility',
    description: 'Spawn AEO improvement tasks from citation probe gaps',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.aeo_visibility?.records || []
        if (records.length === 0) return []

        const out: MonthlyTask[] = []

        // Group records by quotability score. Threshold ≥ 2 (not 3) — AEO citation
        // gaps are individually painful: each missed citation = a competitor cited
        // instead. Spawning an aggregate task even on 2 gaps is worthwhile.
        const lowQuotability = records.filter(r => typeof r.quotability_score_0_100 === 'number' && r.quotability_score_0_100 < 50)
        if (lowQuotability.length >= 2
            && !_existingTaskMatches(existingTasks, [/AEO|aeo|ציטוט|נראות AI|chatgpt|gemini|מנועי AI/i])
        ) {
            const top = lowQuotability.slice(0, 5)
            out.push({
                id: newTaskId('tsk_aeo_quotability'),
                type: 'content_creation',
                title: `שיפור נראות במנועי AI — ${lowQuotability.length} פערים זוהו`.slice(0, 80),
                summary: `${lowQuotability.length} נושאים עם quotability score <50 — המותג לא מצוטט ע"י ChatGPT/Gemini/Perplexity על שאילתות מרכזיות.`,
                channel: 'content',
                priority: 'P1',
                estimatedEffort: '2_3_days',
                expectedImpact: {
                    metric: 'other',
                    value: lowQuotability.length,
                    horizon: '90d',
                    confidence: 'medium',
                    rationale: `כל פער citation שמתוקן מגדיל סיכוי ל-AI citation על שאילתות JTBD רלוונטיות.`,
                },
                sources: top.map(r => ({
                    type: 'other' as const,
                    ref: `aeo_visibility.records[].target=${r.target} (score ${r.quotability_score_0_100})`,
                    excerpt: `${r.target}: ${(r.recommended_action || '').slice(0, 120)}`,
                })),
                dependsOn: [],
                actionPlan: [
                    _step(`עבדו על top-${Math.min(top.length, 3)} פערים מהרשימה — לכל אחד הוסיפו: עובדה מספרית מובהקת, ציטוט מומחה, מקור מהימן (.gov/.edu/אקדמיה).`, false, 180),
                    _step('כתבו תוכן עם entity-density גבוה — שמות מותג, יצרנים, דגמים, ערים — לא generic.', false, 120),
                    _step('הוסיפו Schema.org structured data: Article + Author (Person schema עם sameAs) + ItemList לאוספים.', false, 90),
                    _step('בקשו indexing מהיר דרך GSC URL Inspection לכל דף מעודכן.', false, 20),
                    _step('ניטור 90 ימים: הריצו את ה-citation probes שוב (אותם prompts) — מדדו brandCited delta.', false, 30),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 2,
            })
        }

        return out
    },
}

// ─── 3. seo_keyword_research filler ───────────────────────────────────────
// records[] each: { keyword, cluster, intent, volume_monthly, difficulty_0_100,
//   cpc_ils, current_position, opportunity{total, decision}, page_type,
//   striking_bucket, recommended_action, aeo{}, ... }
const SEO_KW_FILLER: StructuredFiller = {
    stageId: 'seo_keyword_research',
    description: 'Cluster striking-distance + high-opportunity keywords into content/LP tasks',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.seo_keyword_research?.records || []
        if (records.length === 0) return []

        const out: MonthlyTask[] = []

        // Striking-distance: current_position between 4-15, high opportunity
        const striking = records.filter(r =>
            typeof r.current_position === 'number'
            && r.current_position >= 4
            && r.current_position <= 15
            && (r.opportunity?.total || 0) >= 70
            && (r.opportunity?.decision === 'take_now' || r.striking_bucket === 'content_upgrade')
        )
        if (striking.length >= 3
            && !_existingTaskMatches(existingTasks, [/striking.?distance|מיקום.*4-10|רענון.*pillar|striking_bucket/i])
        ) {
            const top = striking.slice(0, 5)
            out.push({
                id: newTaskId('tsk_skw_striking'),
                type: 'content_creation',
                title: `רענון ${striking.length} דפי striking-distance (מיקום 4-15)`.slice(0, 80),
                summary: `${striking.length} מילות מפתח במיקומים 4-15 עם opportunity ≥70 — רענון on-page יכול לדחוף לטופ-3 ולהכפיל קליקים.`,
                channel: 'seo',
                priority: 'P0',
                estimatedEffort: '2_3_days',
                expectedImpact: {
                    metric: 'organic_traffic_pct',
                    value: 35,
                    horizon: '60d',
                    confidence: 'medium',
                    rationale: `מעבר ממיקום 8-10 למיקום 3-5 מכפיל-משלש CTR. ${striking.length} מילים × volume_monthly ממוצע.`,
                },
                sources: top.map(r => ({
                    type: 'dfs.keywords' as const,
                    ref: `seo_keyword_research.records[].keyword="${r.keyword}" (pos=${r.current_position}, vol=${r.volume_monthly})`,
                    excerpt: `${r.keyword} (vol ${r.volume_monthly}/חודש, מיקום ${r.current_position}): ${(r.recommended_action || '').slice(0, 120)}`,
                })),
                dependsOn: [],
                actionPlan: [
                    _step(`עבדו על top-${Math.min(top.length, 3)} מילים מהרשימה — לכל מילה צרו refresh brief.`, false, 60),
                    _step('On-page: עדכנו H1, הוסיפו H2 מבוסס על SERP features (PAA / image_pack), הוסיפו FAQ schema.', false, 180),
                    _step('הוסיפו entity coverage: שמות יצרנים, גדלים, מחירים — entity density מעלה relevance signals.', false, 90),
                    _step('הוסיפו internal links מ-3 דפים נישתיים → לפילר.', false, 45),
                    _step('בקשו re-crawl ב-GSC URL Inspection. ניטור 30/60 ימים — מדדו delta מיקום + clicks.', false, 30),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 1,
            })
        }

        // High opportunity untargeted (current_position > 20 or null, opportunity ≥80)
        const highOppUntargeted = records.filter(r =>
            (r.opportunity?.total || 0) >= 80
            && (typeof r.current_position !== 'number' || r.current_position > 20)
            && r.page_type === 'pillar'
        )
        if (highOppUntargeted.length >= 2
            && !_existingTaskMatches(existingTasks, [/pillar.*חדש|דף עוגן|new pillar|opportunity.*80/i])
        ) {
            const top = highOppUntargeted.slice(0, 3)
            out.push({
                id: newTaskId('tsk_skw_pillar'),
                type: 'content_creation',
                title: `יצירת ${highOppUntargeted.length} דפי pillar חדשים (opportunity ≥80)`.slice(0, 80),
                summary: `${highOppUntargeted.length} מילות מפתח עם opportunity ≥80 אבל אין דף ייעודי — הזדמנות לקלוט שאילתות חדשות.`,
                channel: 'seo',
                priority: 'P1',
                estimatedEffort: '2_3_days',
                expectedImpact: {
                    metric: 'organic_traffic_pct',
                    value: 20,
                    horizon: '90d',
                    confidence: 'medium',
                    rationale: `pillar חדש עם תוכן עומק 2000+ מילים + internal linking יכול לקלוט top-10 תוך 90 ימים על קלטות difficulty <40.`,
                },
                sources: top.map(r => ({
                    type: 'dfs.keywords' as const,
                    ref: `seo_keyword_research.records[].keyword="${r.keyword}" (opp ${r.opportunity?.total})`,
                    excerpt: `${r.keyword} (vol ${r.volume_monthly}, difficulty ${r.difficulty_0_100}): ${(r.recommended_action || '').slice(0, 120)}`,
                })),
                dependsOn: [],
                actionPlan: [
                    _step(`עבדו על ה-${Math.min(top.length, 2)} מילות פילר העליונות. צרו brief לכל דף עם 8-12 סעיפים.`, false, 90),
                    _step('כתבו תוכן 2000-3000 מילים בעברית — כללו: הקדמה (entity), 6-8 סעיפי תוכן, טבלאות, FAQ, מסקנות עם CTA.', false, 240),
                    _step('הוסיפו Schema: Article + FAQPage + BreadcrumbList. כל ישות מותג עם sameAs.', false, 60),
                    _step('יצרו 5-8 internal links מ-spokes/דפים קיימים → ל-pillars החדשים.', false, 45),
                    _step('ניטור 90 ימים: מיקום + clicks ב-GSC. יעד: top-15 תוך 60 ימים, top-10 תוך 90.', false, 30),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 3,
            })
        }

        return out
    },
}

// ─── 4. paid_keyword_research filler ──────────────────────────────────────
// records[] each: { ad_group_id, ad_group_label_he, keywords, negative_keywords,
//   bid_strategy_recommended, bid_strategy_blocked_until_tracking_fix,
//   intent_tier, il_specific_notes_he, ... }
const PAID_KW_FILLER: StructuredFiller = {
    stageId: 'paid_keyword_research',
    description: 'Spawn ad-group setup + negative-keyword tasks from prefetch landscape',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.paid_keyword_research?.records || []
        if (records.length === 0) return []

        const out: MonthlyTask[] = []

        // Ad groups with bid_strategy blocked until tracking fix
        const blocked = records.filter(r => r.bid_strategy_blocked_until_tracking_fix === true)
        if (blocked.length >= 1
            && !_existingTaskMatches(existingTasks, [/tracking.*fix|conv.*tracking|smart bidding.*block|tracking.*lock/i])
        ) {
            const top = blocked.slice(0, 3)
            out.push({
                id: newTaskId('tsk_pkw_tracking'),
                type: 'measurement_gap',
                title: `שחרור Smart Bidding חסום ב-${blocked.length} ad groups (תיקון tracking)`.slice(0, 80),
                summary: `${blocked.length} קבוצות מודעות חסומות מ-Smart Bidding בגלל פגמי מעקב — תיקון tracking ראשי לפני העלאת ביצועים.`,
                channel: 'google_ads',
                priority: 'P0',
                estimatedEffort: '1_day',
                expectedImpact: {
                    metric: 'conversions',
                    value: blocked.length * 5,
                    horizon: '30d',
                    confidence: 'high',
                    rationale: `כל ad group ש-Smart Bidding פתוח בו יכול להעלות המרות ב-15-25% לעומת Manual CPC.`,
                },
                sources: top.map(r => ({
                    type: 'paidHypothesis' as const,
                    ref: `paid_keyword_research.records[].ad_group_id=${r.ad_group_id}`,
                    excerpt: `${r.ad_group_label_he}: ${(r.il_specific_notes_he || r.bid_strategy_rationale_he || '').slice(0, 120)}`,
                })),
                dependsOn: [],
                actionPlan: [
                    _step('בדקו את conversion actions ב-Google Ads — וודאו ש-Primary במצב פעיל ועם נתונים אחרונים <7 ימים.', false, 30),
                    _step('הריצו test conversion דרך GTM Preview/Tag Assistant — וודאו ש-conversion linker + GCLID נטענים.', false, 45),
                    _step('בדקו Enhanced Conversions — מצב active, hashing תקין, רוב הטריגרים מקבלים email/phone.', false, 30),
                    _step('אחרי תיקון: בכל ad group מהרשימה — שנו bid strategy ל-recommended מ-prefetch (tCPA/MaxConv).', false, 30),
                    _step('ניטור 14 ימים: צפו ב-Learning Status; אם נכנס Limited — חזרו לתבנית Bidding הקודמת.', false, 30),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 1,
            })
        }

        return out
    },
}

// ─── 5. paid_competitor_landscape filler ──────────────────────────────────
// records[] each: { domain, platforms_active, strategic_threat_level,
//   creative_angles_observed, landing_page_strengths, landing_page_weaknesses,
//   median_ad_run_days, longest_running_ad_days, active_ads_google,
//   active_ads_meta, page_names, ... }
const PAID_COMP_FILLER: StructuredFiller = {
    stageId: 'paid_competitor_landscape',
    description: 'Spawn competitive intelligence tasks from high-threat competitor records',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.paid_competitor_landscape?.records || []
        if (records.length === 0) return []

        const out: MonthlyTask[] = []

        // High-threat competitors. Ad-run-days filter was too strict (excluded
        // many tenants whose competitors run shorter cycles). Now: ANY
        // strategic_threat_level=high|critical qualifies; threshold ≥ 2 records.
        const highThreat = records.filter(r =>
            r.strategic_threat_level === 'high' || r.strategic_threat_level === 'critical'
        )
        if (highThreat.length >= 2
            && !_existingTaskMatches(existingTasks, [/ניטור.*מתחר|competitor.*monitor|transparency.*center|מודעות.*מתחר/i])
        ) {
            const top = highThreat.slice(0, 3)
            out.push({
                id: newTaskId('tsk_pcl_monitor'),
                type: 'cross_channel_amplification',
                title: `ניטור ${highThreat.length} מתחרים בעדיפות גבוהה — סריקה שבועית`.slice(0, 80),
                summary: `${highThreat.length} מתחרים בעדיפות אסטרטגית גבוהה עם מודעות פעילות 30+ ימים — דורש ניטור שבועי שלא לפספס מעבר אסטרטגי.`,
                channel: 'cross',
                priority: 'P1',
                estimatedEffort: '1_hour',
                expectedImpact: {
                    metric: 'other',
                    value: highThreat.length,
                    horizon: '30d',
                    confidence: 'high',
                    rationale: `זיהוי מוקדם של מעבר creative/positioning של מתחרה מאפשר תגובה תוך 48 שעות.`,
                },
                sources: top.map(r => ({
                    type: 'transparency.competitor' as const,
                    ref: `paid_competitor_landscape.records[].domain=${r.domain}`,
                    excerpt: `${r.domain} (${r.strategic_threat_level}): ${(r.strategic_threat_rationale_he || '').slice(0, 120)}`,
                })),
                dependsOn: [],
                actionPlan: [
                    _step(`שמרו ב-bookmark Google Ads Transparency Center URL לכל אחד מ-${top.length} המתחרים: ${top.map(r => r.domain).join(', ')}.`, false, 15),
                    _step('שמרו ב-bookmark Meta Ad Library page-id-search לאותם דומיינים (אם פעילים ב-Meta).', false, 10),
                    _step('הגדירו cron / Calendar reminder יום א׳ 09:00 — סקירת מודעות חדשות + landing page changes (השוו ל-Wayback).', false, 5),
                    _step('בכל סקירה שבועית — תיעוד שינויים: angle creative חדש / promo / LP redesign. שמרו לוג ב-Google Sheets.', false, 20),
                    _step('escalation: מתחרה משיק angle חדש → צרו draft response (counter-positioning) תוך 48 שעות.', false, 10),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 1,
            })
        }

        return out
    },
}

// ═══ K24 — AEO/LLM PROGRAM FILLERS ═══════════════════════════════════════
// 4 fillers that turn the 1-task "improve AEO" gap into a coherent program.
// All read research_data signals; tenant-agnostic.

// K24-a: Entity authority (Wikidata + Knowledge Panel + Person schema).
// AEO citations require credibility signals: business as recognized entity,
// authors with sameAs trails. Single setup task per tenant; idempotent
// (skipped on re-run once any matching task exists in the plan).
const ENTITY_AUTHORITY_FILLER: StructuredFiller = {
    stageId: 'k24_entity_authority',
    description: 'Wikidata + Knowledge Panel + Author Person schema setup for AEO citations',
    fill(_rd, existingTasks) {
        // Scope-specific check: Wikidata entity OR Knowledge Panel claim — these
        // are the unique markers. Don't block on generic "sameAs" or "Organization
        // schema" matches (those are partial coverage; K24 wants the full triad).
        if (_existingTaskMatches(existingTasks, [/wikidata|מנוע ידע|knowledge panel|ישות אנציקלופדית/i])) {
            return []
        }
        return [{
            id: newTaskId('tsk_k24_entity_auth'),
            type: 'website_change',
            title: 'הגדרת ישות מותג למנועי AI — Wikidata, Knowledge Panel, סכמת Person',
            summary: 'תשתית citation עבור ChatGPT/Gemini/Perplexity: הגדרת המותג כישות מוכרת + סכמת מומחה לכל מחבר תוכן.',
            channel: 'seo',
            priority: 'P1',
            estimatedEffort: '1_week',
            expectedImpact: {
                metric: 'other',
                value: 3,
                horizon: '90d',
                confidence: 'medium',
                rationale: 'מותגים עם Wikidata entity + Knowledge Panel מקבלים 3-10× יותר citation במנועי AI לעומת בלי.',
            },
            sources: [
                { type: 'other', ref: 'aeo_citation_authority_baseline', excerpt: 'מותגים בעלי ישות אנציקלופדית מצוטטים על ידי מודלי שפה כמקור סמכותי.' },
                { type: 'other', ref: 'knowledge_graph_entry_door', excerpt: 'Wikidata = שער כניסה ל-Google Knowledge Graph + Wikipedia.' },
            ],
            dependsOn: [],
            actionPlan: [
                _step('צרו Wikidata entity למותג: שם, סוג עסק, תאריך הקמה, מיקום, sameAs לפרופילים (LinkedIn / Facebook / GBP). השלימו 8-10 properties עיקריים.', false, 90),
                _step('דרישת Knowledge Panel: וודאו GBP מאומת, Wikipedia stub (אופציונלי לעסק קטן), GBP במצב complete (8+ attributes), Wikidata קיים.', false, 60),
                _step('הוסיפו לכל דף תוכן עם author byline סכמת Person: name, jobTitle, sameAs (LinkedIn URL, Twitter URL). מחבר אחיד מותג = recommended.', false, 90),
                _step('הוסיפו סכמת Organization על דף הבית: legalName, foundingDate, founder Person ref, employee count range, areaServed (אזורי שירות בישראל).', false, 60),
                _step('שדרגו sameAs בסכמת Organization: GBP profile URL, Facebook, Instagram, LinkedIn, Wikidata entity ID (Q-number).', false, 30),
                _step('הריצו בוחן rich-snippets test על דף הבית + 3 pillar pages — וודאו שכל הסכמות עוברות validation.', false, 30),
                _step('ניטור 90 יום: השוו ציטוטים של המותג ב-ChatGPT/Gemini/Perplexity לפני ואחרי (ראו filler multi_engine_probe).', false, 30),
            ],
            status: 'proposed',
            proposedAt: nowIso(),
            weekOfMonth: 2,
        }]
    },
}

// K24-b: Multi-engine AEO probe scheduler. Without ongoing measurement,
// we can't tell which AI engines cite us and on which queries. One-time
// setup task to configure the probe cron + dashboard.
const AEO_PROBE_FILLER: StructuredFiller = {
    stageId: 'k24_aeo_probe',
    description: 'Set up weekly probe cron across ChatGPT/Gemini/Perplexity/Claude for citation tracking',
    fill(_rd, existingTasks) {
        // Scope-specific check: weekly probe / citation tracking infrastructure.
        // The generic K22 AEO_FILLER task mentions ChatGPT/Gemini in passing,
        // but does NOT set up measurement infrastructure — that's our unique
        // scope. Tighter regex avoids that false-positive.
        if (_existingTaskMatches(existingTasks, [/probe.*שבועי|מעקב ציטוט שבועי|weekly probe|citation tracking|measurement.*citation|cron.*citation|20 prompts|probe scheduler/i])) {
            return []
        }
        return [{
            id: newTaskId('tsk_k24_aeo_probe'),
            type: 'measurement_gap',
            title: 'מעקב ציטוט שבועי במנועי AI — 20 prompts × 4 מנועים',
            summary: 'תשתית מדידה: הרצה שבועית של 20 שאלות JTBD על ChatGPT/Gemini/Perplexity/Claude — תיעוד brandCited + competitorsCited.',
            channel: 'seo',
            priority: 'P1',
            estimatedEffort: '2_3_hours',
            expectedImpact: {
                metric: 'other',
                value: 20,
                horizon: '30d',
                confidence: 'high',
                rationale: 'ללא מדידה אין שיפור. 20 prompts × 4 מנועים = 80 data points/שבוע על visibility במנועי AI.',
            },
            sources: [
                { type: 'other', ref: 'aeo_measurement_baseline', excerpt: 'Citation tracking הוא המקבילה ל-GSC עבור מנועי AI.' },
                { type: 'strategy.persona', ref: 'audience_personas.jtbd_statements', excerpt: 'הפרומפטים מבוססים על JTBD של הפרסונות שלכם.' },
            ],
            dependsOn: [],
            actionPlan: [
                _step('הגדירו 20 prompts מבוססי JTBD של הפרסונות הראשיות (גוף ראשון, ייפוי כוח לקבלת המלצה).', false, 60),
                _step('בחרו כלי probe: AthenaHQ / Profound / Otterly / AlsoAsked — או build-your-own דרך OpenAI/Anthropic API.', false, 30),
                _step('הגדירו cron שבועי שמריץ את 20 פרומפטים על 4 מנועים (ChatGPT, Gemini, Perplexity, Claude). תיעוד: brandCited?, citationContext, competitorsCited[].', false, 60),
                _step('הקימו dashboard פשוט (Google Sheet / Notion) שמראה: % brandCited per engine, share-of-voice vs competitors, ציטוטים חדשים השבוע.', false, 45),
                _step('ראשון של כל חודש: סקירה שבועית-מצרפית → זיהו את 3 ה-prompts הקשים ביותר → spawn content/schema tasks.', false, 15),
            ],
            status: 'proposed',
            proposedAt: nowIso(),
            weekOfMonth: 1,
        }]
    },
}

// K24-c: Quotability optimization. Reads seo_keyword_research.records[].aeo
// fields (fact_density, citation_value, synthesis_need). Spawns optimization
// task for top-3 high-traffic pages with low quotability.
const QUOTABILITY_FILLER: StructuredFiller = {
    stageId: 'k24_quotability',
    description: 'Optimize top pages for AI citation extraction (fact density, expert quotes, source links)',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.seo_keyword_research?.records || []
        if (records.length === 0) return []
        // Keywords with high volume but low aeo.citation_value or fact_density
        const lowQuotable = records.filter(r =>
            (r.volume_monthly || 0) >= 1000
            && (
                (typeof r.aeo?.citation_value === 'number' && r.aeo.citation_value < 70)
                || (typeof r.aeo?.fact_density === 'number' && r.aeo.fact_density < 70)
            )
        )
        if (lowQuotable.length < 2) return []
        // Scope-specific check: optimization of specific high-volume pages for
        // quotability (fact density + expert quotes + sources). The generic
        // K22 AEO_FILLER task mentions "quotability" in summary, but is about
        // adding citations to pages without specifying TOP pages. K24 quotability
        // is page-by-page page-level optimization. Tighten regex to title-only
        // markers that match the K24 task type.
        if (_existingTaskMatches(existingTasks, [/אופטימיזציית ציטוטיות|fact density audit|page.*quotability|דפים.*ציטוטיות|quotability.*optimization|quotability.*page/i])) {
            return []
        }
        const top = lowQuotable.slice(0, 5)
        return [{
            id: newTaskId('tsk_k24_quotability'),
            type: 'content_creation',
            title: `אופטימיזציית ציטוטיות (Quotability) ל-${lowQuotable.length} דפים בעלי תעבורה גבוהה`,
            summary: `${lowQuotable.length} דפים עם נפח חיפוש גבוה אך citation_value/fact_density נמוך — הוספת עובדות מספריות + ציטוטי מומחה + מקורות חיצוניים = פתח לציטוט במנועי AI.`,
            channel: 'content',
            priority: 'P1',
            estimatedEffort: '2_3_days',
            expectedImpact: {
                metric: 'other',
                value: top.length,
                horizon: '90d',
                confidence: 'medium',
                rationale: `דפים עם 5+ עובדות מספריות + ציטוטי מומחה מקבלים 4-7× citation במודלי שפה לעומת prose generic.`,
            },
            sources: top.map(r => ({
                type: 'dfs.keywords' as const,
                ref: `seo_keyword_research.records[].keyword="${r.keyword}" (vol ${r.volume_monthly}, citation_value ${r.aeo?.citation_value ?? '?'})`,
                excerpt: `${r.keyword}: ${(r.recommended_action || '').slice(0, 120)}`,
            })),
            dependsOn: [],
            actionPlan: [
                _step(`עבדו על top-${Math.min(top.length, 3)} דפים מהרשימה — לכל אחד הוסיפו 5+ עובדות מספריות (₪, מספרים, אחוזים, תאריכים).`, false, 120),
                _step('הוסיפו ציטוט/דעת מומחה בפורמט בלוק: "[שם המומחה], [תפקיד]: "..."" — מקור עם sameAs לפרופיל מקצועי.', false, 90),
                _step('הוסיפו 3-5 מקורות חיצוניים מהימנים (Lamas / משרד הבינוי / academia / מחקרי שוק) — קישורי outbound בעלי נושא רלוונטי.', false, 60),
                _step('הוסיפו FAQ section עם 5-8 שאלות; תשובות 40-60 מילים (אופטימליות לציטוט במודלי שפה).', false, 90),
                _step('הוסיפו סכמת Article + ScholarlyArticle (אופציונלי) או FAQPage עם author Person ref.', false, 30),
                _step('ניטור 90 יום: הריצו probes (filler aeo_probe) על שאלות שמכוונות ל-keywords הנ"ל; מדדו citation lift.', false, 15),
            ],
            status: 'proposed',
            proposedAt: nowIso(),
            weekOfMonth: 2,
        }]
    },
}

// ═══ K25 — LOCAL SEO DEPTH FILLERS ════════════════════════════════════════

// K25-a: City pages. Read top cities from research signals (paidProfile.geography,
// audience_personas demographics, internal_seo gsc city breakdown if available).
// Fallback: hardcoded top-5 IL metros that fit most local businesses.
// Spawn ONE aggregate task to create city pages for top-N cities.
const CITY_PAGES_FILLER: StructuredFiller = {
    stageId: 'k25_city_pages',
    description: 'Spawn city page architecture task for top IL cities',
    fill(rd, existingTasks) {
        if (_existingTaskMatches(existingTasks, [/city page|דף עיר|local seo.*דף|דפי ערים|local landing|דף עירוני/i])) {
            return []
        }
        // Try to read cities from multiple research signals; fall back to top IL metros.
        let cities: string[] = []
        try {
            const pp = rd?.paidProfile?.geography
            if (Array.isArray(pp?.cities) && pp.cities.length > 0) cities = pp.cities.slice(0, 10)
            // Personas may carry geo signals in jtbd_statement
            const personas: any[] = rd?.results?.audience_personas?.records || []
            const personaText = personas.map(p => JSON.stringify(p)).join(' ')
            // Top-12 IL metros — present in any IL local-services tenant's geography
            const ilMetros = ['תל אביב', 'גוש דן', 'ירושלים', 'חיפה', 'באר שבע', 'פתח תקווה', 'ראשון לציון', 'אשדוד', 'נתניה', 'רמת גן', 'בני ברק', 'חולון']
            if (cities.length === 0) {
                cities = ilMetros.filter(c => personaText.includes(c)).slice(0, 5)
            }
            if (cities.length === 0) cities = ilMetros.slice(0, 5)
        } catch { /* defensive */ }

        return [{
            id: newTaskId('tsk_k25_city_pages'),
            type: 'content_creation',
            title: `יצירת ${cities.length} דפי ערים — ${cities.slice(0, 3).join(' / ')}…`,
            summary: `ארכיטקטורת דפי ערים לטופ-${cities.length} ערי שירות — נדבך חובה ב-Local SEO לקליטת שאילתות "[שירות] ב[עיר]".`,
            channel: 'seo',
            priority: 'P0',
            estimatedEffort: '2_3_days',
            expectedImpact: {
                metric: 'organic_traffic_pct',
                value: 30,
                horizon: '90d',
                confidence: 'medium',
                rationale: `דפי ערים תופסים local-pack + organic top-3 על שאילתות "[שירות] ב[עיר]" — 30-50% מתעבורה לוקאלית נכנסת דרכם.`,
            },
            sources: [
                { type: 'other', ref: 'local_seo_baseline.city_pages', excerpt: `${cities.length} ערים זוהו ממקורות מחקר: ${cities.join(', ')}.` },
                { type: 'strategy.persona', ref: 'audience_personas.geography', excerpt: 'פרסונות הראשיות פועלות בערים אלה.' },
                { type: 'gsc.pages', ref: 'local_pack_opportunities', excerpt: 'ה-SERPs לשאילתות מקומיות מציגים local_pack — דף עיר ייעודי נכנס.' },
            ],
            dependsOn: [],
            actionPlan: [
                _step(`צרו תבנית unified לדף עיר עם: H1="[שירות] ב[עיר]", פיסקת פתיחה מאופיינת מקומית (תחנות, שכונות), טבלת אזורי שירות, FAQ מקומי, GBP map embed.`, false, 90),
                _step(`כתבו ${cities.length} דפי ערים — כל אחד 800-1,200 מילים, ייחודי (לא משכפול). השתמשו ב-GSC top queries לכל עיר אם זמין.`, false, 360),
                _step('הוסיפו לכל דף LocalBusiness schema עם address מלא, geo coordinates, areaServed (אזורי שירות הקרובים), opening_hours.', false, 60),
                _step('יצרו internal linking: דף ראשי → דפי ערים (בתת-תפריט "אזורי שירות"), דפי ערים → ל-pillar הראשי.', false, 30),
                _step('שלחו את ה-URLs ל-GSC URL Inspection → Request indexing. הוסיפו את כל ה-URLs ל-sitemap.xml.', false, 20),
                _step('ניטור 90 יום: מיקום ב-GSC לשאילתות "[שירות] [עיר]" + clicks. יעד: top-5 על 60% מהשאילתות תוך 90 יום.', false, 20),
            ],
            status: 'proposed',
            proposedAt: nowIso(),
            weekOfMonth: 2,
        }]
    },
}

// K25-b: Persona LP coverage. Read audience_personas.records[]; for each
// persona where no LP appears to exist, spawn a creation task.
const PERSONA_LP_FILLER: StructuredFiller = {
    stageId: 'k25_persona_lps',
    description: 'Spawn dedicated landing pages per primary persona',
    fill(rd, existingTasks) {
        const personas: any[] = rd?.results?.audience_personas?.records || []
        if (personas.length === 0) return []
        const out: MonthlyTask[] = []
        // For each persona, check if there's an existing LP task referencing it.
        // Use the persona's name first token as the proxy (e.g. "דנה — משפחה בתזוזה" → "דנה").
        for (const p of personas) {
            const fullName = (p?.name || '').trim()
            if (!fullName) continue
            const firstToken = fullName.split(/[\s—-]/)[0]
            if (!firstToken || firstToken.length < 2) continue
            // Idempotency: skip if existing task title/summary already references this persona AND mentions LP/דף נחיתה/landing.
            const personaPattern = new RegExp(firstToken.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
            const hasLp = existingTasks.some(t => {
                const text = `${t.title || ''} ${t.summary || ''}`.toLowerCase()
                return personaPattern.test(text) && /(landing|דף נחיתה|persona lp|פרסונ.*דף)/i.test(text)
            })
            if (hasLp) continue
            // Spawn LP for this persona.
            out.push({
                id: newTaskId('tsk_k25_persona_lp'),
                type: 'landing_page',
                title: `דף נחיתה ייעודי לפרסונה ${firstToken}`.slice(0, 80),
                summary: `${firstToken} — דף נחיתה ממוקד לפי JTBD + preferred_proof + objections של הפרסונה. ערוץ המרה מותאם.`,
                channel: 'seo',
                priority: 'P1',
                estimatedEffort: '1_day',
                expectedImpact: {
                    metric: 'conversions',
                    value: 5,
                    horizon: '60d',
                    confidence: 'medium',
                    rationale: `LP לפרסונה ראשית = CR גבוה ב-30-80% לעומת LP גנרי. מבוסס על JTBD + trust hierarchy מהמחקר.`,
                },
                sources: ([
                    { type: 'strategy.persona' as const, ref: `audience_personas.records[].name="${fullName}"`, excerpt: (p?.jtbd_statement?.progress || '').slice(0, 150) },
                    { type: 'strategy.persona' as const, ref: `audience_personas.records[].preferred_proof`, excerpt: Array.isArray(p?.preferred_proof) ? p.preferred_proof.slice(0, 2).join(' · ') : '' },
                ] as Array<{ type: 'strategy.persona'; ref: string; excerpt: string }>).filter(s => s.excerpt),
                dependsOn: [],
                actionPlan: [
                    _step(`קראו מחדש את הפרסונה ${firstToken} ב-research_data — שמרו JTBD, switching_cost, preferred_proof, trust_hierarchy.`, false, 30),
                    _step(`כתבו H1 ופסקת hero על בסיס JTBD progress של ${firstToken} — לא generic.`, false, 30),
                    _step(`הוסיפו 3 בלוקי trust signals לפי trust_hierarchy של הפרסונה (top 3 weights).`, false, 60),
                    _step(`טיפול ב-objections: כל preferred_proof → סקציה ייעודית עם תשובה ברורה (טבלה / FAQ / video).`, false, 90),
                    _step(`CTA primary מותאם לטון הפרסונה. CTA secondary = WhatsApp / טלפון אם הפרסונה מעדיפה ערוץ זה.`, false, 30),
                    _step(`הוסיפו אירוע GA4 ייעודי "persona_${firstToken}_landing_view" + "persona_${firstToken}_cta_click".`, true, 15),
                    _step(`ניטור 60 יום: CR של הדף vs LP גנרי דומה. יעד: +30% CR.`, false, 20),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: 3,
            })
        }
        // Cap at 2 LPs per regen to avoid plan explosion if many personas.
        return out.slice(0, 2)
    },
}

// ─── Registry + entry point ───────────────────────────────────────────────
// K24 supersedes the generic K22 AEO_FILLER (a single "improve AEO visibility"
// task) with 3 focused fillers (entity authority + probe + quotability). The
// generic filler is removed from the registry to avoid duplicate coverage.
const ALL_FILLERS: StructuredFiller[] = [
    INTERNAL_SEO_FILLER,
    SEO_KW_FILLER,
    PAID_KW_FILLER,
    PAID_COMP_FILLER,
    // K24 — AEO/LLM Program (replaces K22 generic AEO_FILLER)
    ENTITY_AUTHORITY_FILLER,
    AEO_PROBE_FILLER,
    QUOTABILITY_FILLER,
    // K25 — Local SEO Depth
    CITY_PAGES_FILLER,
    PERSONA_LP_FILLER,
]

export interface FillerRunResult {
    spawned: MonthlyTask[]
    perStageStats: Array<{ stageId: string; spawnedCount: number }>
}

/**
 * Invoked after Pass 3 ensureCoverage. Runs every registered filler;
 * appends spawned tasks to the plan. Logs per-stage counts.
 */
export function runStructuredFillers(rd: any, existingTasks: MonthlyTask[]): FillerRunResult {
    const spawned: MonthlyTask[] = []
    const perStageStats: Array<{ stageId: string; spawnedCount: number }> = []
    for (const f of ALL_FILLERS) {
        try {
            const tasks = f.fill(rd, [...existingTasks, ...spawned])
            spawned.push(...tasks)
            perStageStats.push({ stageId: f.stageId, spawnedCount: tasks.length })
        } catch (err) {
            console.error(`[structuredFillers] ${f.stageId} fill error:`, (err as Error).message)
            perStageStats.push({ stageId: f.stageId, spawnedCount: 0 })
        }
    }
    return { spawned, perStageStats }
}