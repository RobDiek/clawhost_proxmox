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

function _existingTaskMatches(existingTasks: MonthlyTask[], patterns: RegExp[]): boolean {
    return existingTasks.some(t => {
        const hay = `${t.title || ''} ${t.summary || ''} ${(t.actionPlan || []).map(s => s.step).join(' ')}`.toLowerCase()
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
            && !_existingTaskMatches(existingTasks, [/product schema|productschema|schema.*Product/i])
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

        // Group records by type (entity_authority / content_quotability / etc.)
        const lowQuotability = records.filter(r => typeof r.quotability_score_0_100 === 'number' && r.quotability_score_0_100 < 50)
        if (lowQuotability.length >= 3
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

        // High-threat competitors with consistently running ads (longest_running_ad_days ≥ 30)
        const highThreat = records.filter(r =>
            (r.strategic_threat_level === 'high' || r.strategic_threat_level === 'critical')
            && typeof r.longest_running_ad_days === 'number'
            && r.longest_running_ad_days >= 30
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

// ─── Registry + entry point ───────────────────────────────────────────────
const ALL_FILLERS: StructuredFiller[] = [
    INTERNAL_SEO_FILLER,
    AEO_FILLER,
    SEO_KW_FILLER,
    PAID_KW_FILLER,
    PAID_COMP_FILLER,
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