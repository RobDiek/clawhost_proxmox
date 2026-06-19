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
import type { ConnectedStack } from './connectedStack'

// ─── Filler contract ──────────────────────────────────────────────────────
export interface StructuredFiller {
    stageId: string
    description: string
    /**
     * Optional tactic tag. When set, the filler is SKIPPED if the tactic appears
     * in the tenant's deferral set (rd.deferredTactics / rd.strategy.deferredTactics).
     * This is the rail for Phase-0 rule #3 (respect upstream decisions): a strategy
     * that rejected a tactic (e.g. city_pages for a national B2B) must not have it
     * re-added by a deterministic filler.
     */
    tactic?: string
    /**
     * Optional precondition. When provided and it returns false, the filler is
     * skipped. Used to ground archetype-implied tactics in real signals (e.g. only
     * spawn city pages when there is an actual local-geo signal — facts > priors).
     */
    appliesWhen?(rd: any, stack?: ConnectedStack): boolean
    /**
     * Returns NEW MonthlyTask objects to append. Receives existingTasks so
     * the filler can skip records already covered (idempotency), and the resolved
     * connected stack so deterministic copy stays integration-grounded (a filler
     * with fewer params is still assignable — only stack-aware fillers declare it).
     */
    fill(rd: any, existingTasks: MonthlyTask[], stack?: ConnectedStack): MonthlyTask[]
}

// ─── Integration-grounding + deferral helpers (Phase 0) ───────────────────
/**
 * Channel-aware phrasing for filler action steps. Deterministic filler copy used
 * to hardcode WordPress/WooCommerce/Yoast plugin instructions — wrong when the
 * tenant publishes via GitHub (or has no CMS). Branch the wording to the resolved
 * publish channel so every spawned task is integration-grounded.
 */
function cmsHint(stack: ConnectedStack | undefined, opts: { wp: string; git: string; generic?: string }): string {
    const ch = stack?.publishChannel
    if (ch === 'wordpress') return opts.wp
    if (ch === 'github') return opts.git
    return opts.generic ?? opts.git
}

/**
 * True only when there is a concrete local-geo signal — explicit service-area
 * cities or an `il_local` delivery-locality classification. Deliberately strict:
 * a persona that merely mentions a city is NOT enough to justify a whole
 * city-pages architecture (that was the speculative bug). National/B2B tenants
 * (no such signal) return false → local-only fillers are skipped.
 */
function hasLocalGeoSignal(rd: any): boolean {
    try {
        const cities = rd?.paidProfile?.geography?.cities
        if (Array.isArray(cities) && cities.length > 0) return true
        const loc = rd?.businessClassification?.delivery_locality
            || rd?.results?.business_classification?.delivery_locality
            || rd?.results?.positioning?.delivery_locality
        if (loc === 'il_local') return true
        return false
    } catch { return false }
}

/** Collect explicitly-deferred tactic names from research_data (Phase-0 rail;
 *  Phase-1 strategy will populate these). Tolerant of string[] or {tactic}[] shapes. */
function collectDeferredTactics(rd: any): Set<string> {
    const out = new Set<string>()
    const sources = [rd?.deferredTactics, rd?.strategy?.deferredTactics, rd?.results?.strategy_options?.deferredTactics]
    for (const src of sources) {
        if (!Array.isArray(src)) continue
        for (const entry of src) {
            const name = typeof entry === 'string' ? entry : (entry?.tactic || entry?.id || entry?.name)
            if (name && typeof name === 'string') out.add(name.trim().toLowerCase())
        }
    }
    return out
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
    fill(rd, existingTasks, stack) {
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
                    _step(cmsHint(stack, {
                        wp: 'בחנו את תבנית WooCommerce — הפעילו הזרקת Product schema אוטומטית (פלאגין Rank Math / Yoast).',
                        git: 'הוסיפו Product schema (JSON-LD) לתבנית דף המוצר בקוד — בלוק אחד שמיוצר לכל דף מוצר — ובצעו commit/PR ב-GitHub.',
                        generic: 'הוסיפו Product schema (JSON-LD) לתבנית דף המוצר — בלוק אחד שמיוצר אוטומטית לכל דף מוצר.',
                    }), false, 30),
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
                    _step(cmsHint(stack, {
                        wp: 'הכניסו דרך Yoast/RankMath / שדות המוצר ב-WooCommerce. שמרו רשימת הדפים המעודכנים.',
                        git: 'עדכנו את שדה ה-meta description ב-frontmatter/תבנית הדף בקוד ובצעו commit/PR ב-GitHub. שמרו רשימת הדפים המעודכנים.',
                        generic: 'עדכנו את שדה ה-meta description בכל דף דרך מערכת הניהול. שמרו רשימת הדפים המעודכנים.',
                    }), false, 60),
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
            // K28-fix: Hebrew cleanup translates "striking-distance" →
            // "מרחק פריצה" / "מרחק הגעה" / "במרחק". Match all variants +
            // positional range 4-15 / 4-10 / 5-15. Without this, Opus
            // generates a striking task in Pass 1/2 and the filler creates
            // a duplicate in Pass 4 (semantic dupe — same 17 keywords).
            && !_existingTaskMatches(existingTasks, [/striking.?distance|מיקום\s*\d{1,2}[-\s]\d{1,2}|מרחק\s*(פריצה|הגעה|הגעה לטופ)|במרחק\s*פריצה|striking_bucket|רענון.*דפים.*מיקום/i])
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
                rationale: 'מותגים עם ישות Wikidata ופאנל ידע (Knowledge Panel) מקבלים פי 3-10 יותר ציטוטים במנועי AI לעומת מותגים בלעדיהם.',
            },
            sources: [
                { type: 'other', ref: 'aeo_citation_authority_baseline', excerpt: 'מותגים בעלי ישות אנציקלופדית מצוטטים על ידי מודלי שפה כמקור סמכותי.' },
                { type: 'other', ref: 'knowledge_graph_entry_door', excerpt: 'Wikidata היא שער הכניסה לגרף הידע (Knowledge Graph) של Google ולוויקיפדיה.' },
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
                { type: 'other', ref: 'aeo_measurement_baseline', excerpt: 'מעקב ציטוטים (Citation tracking) הוא המקבילה ל-GSC עבור מנועי AI.' },
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
    tactic: 'city_pages',
    // Local SEO city pages are an archetype-implied tactic — only valid when the
    // tenant actually serves local geographies. Without a concrete local-geo
    // signal (national/B2B tenants) this used to spawn speculative city pages
    // off hardcoded IL metros. Gate it: facts > priors.
    appliesWhen: (rd) => hasLocalGeoSignal(rd),
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
    tactic: 'persona_lps',
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

// ═══ K26 — TIER-1 SEO COMPLETENESS FILLERS ═══════════════════════════════
// Round out the SEO program with 8 always-systemic fillers that close
// audit-grade coverage gaps. All read from research_data or existing tasks;
// tenant-agnostic; idempotent by title regex.

// K26-a: Internal linking strategy task. When the plan contains ≥3 new
// pillar/spoke/LP tasks, spawn ONE aggregate task to build N internal links
// FROM existing content → to those new pages (and inverse for spokes → pillars).
const INTERNAL_LINKING_FILLER: StructuredFiller = {
    stageId: 'k26_internal_linking',
    description: 'Aggregate internal linking task when ≥3 new pillar/spoke/LP pages are scheduled',
    fill(_rd, existingTasks) {
        const newPages = existingTasks.filter(t => {
            const text = `${t.title || ''} ${t.summary || ''}`.toLowerCase()
            return /pillar|spoke|landing|דף נחיתה|דף עוגן|דף נושא משני|דף עיר/i.test(text)
        })
        if (newPages.length < 3) return []
        if (_existingTaskMatches(existingTasks, [/internal linking|קישור פנימי|קישורים פנימי|internal link build|link.*architecture/i])) return []
        return [{
            id: newTaskId('tsk_k26_internal_links'),
            type: 'website_change',
            title: `קישורים פנימיים — בניית ${newPages.length * 3}+ קישורים בין דפים חדשים`,
            summary: `${newPages.length} דפים חדשים תוכננו לחודש — נדרשת ארכיטקטורת קישור פנימי (spokes→pillar, pillar→spokes, אזכורים contextual).`,
            channel: 'seo',
            priority: 'P1',
            estimatedEffort: '2_3_hours',
            expectedImpact: { metric: 'organic_traffic_pct', value: 15, horizon: '60d', confidence: 'high', rationale: `קישורים פנימיים הם הדרך המהירה ביותר להעביר authority לדפים חדשים. ${newPages.length}×3 קישורים = ~${newPages.length * 3} signal-passing edges בגרף האתר.` },
            sources: newPages.slice(0, 4).map(p => ({ type: 'other' as const, ref: `existing_task.id=${p.id}`, excerpt: `${(p.title || '').slice(0, 80)}` })),
            dependsOn: [],
            actionPlan: [
                _step('מפו את כל הדפים החדשים מהתוכנית — pillar / spoke / LP / city / persona. שמרו רשימה.', false, 20),
                _step('לכל דף חדש: זהו 3-5 דפים קיימים רלוונטיים שיכולים לקשר אליו contextually (לא בכותרת/footer).', false, 90),
                _step('הוסיפו אנקור מגוון: branded + descriptive + partial-match. הימנעו מ-exact-match (75% exact = penguin risk כפי שזוהה).', false, 60),
                _step('הוסיפו inverse: pillar → spokes (חובה ב-cluster architecture). 3-5 קישורים יוצאים מ-pillar לכל spoke.', false, 45),
                _step('הוסיפו breadcrumb navigation (HTML + BreadcrumbList schema) על כל דף שכן ב-IA.', false, 30),
                _step('ניטור 60 יום: ב-GSC, מדדו crawl frequency של הדפים החדשים + internal link count ב-Internal Links report.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 3,
        }]
    },
}

// K26-b: Image SEO audit. Always relevant (every site has images). Idempotent.
const IMAGE_SEO_FILLER: StructuredFiller = {
    stageId: 'k26_image_seo',
    description: 'Image SEO audit: alt text, WebP/AVIF, lazy loading, image sitemap',
    fill(_rd, existingTasks, stack) {
        if (_existingTaskMatches(existingTasks, [/image seo|alt text|תמונות.*alt|webp|avif|image sitemap|sitemap.*תמונות|תמונות.*מהירות/i])) return []
        return [{
            id: newTaskId('tsk_k26_image_seo'),
            type: 'website_change',
            title: 'ביקורת SEO תמונות — alt text, WebP, lazy loading, sitemap תמונות',
            summary: 'תמונות הן 50%+ ממשקל הדף ברוב אתרי e-commerce — אופטימיזציה מורידה LCP, מעלה accessibility, פותחת image_pack ב-SERP.',
            channel: 'seo',
            priority: 'P1',
            estimatedEffort: '1_day',
            expectedImpact: { metric: 'organic_traffic_pct', value: 12, horizon: '60d', confidence: 'medium', rationale: 'אופטימיזציית תמונות מורידה LCP ב-30-50%, פותחת image_pack ל-15-25% משאילתות, ומעלה accessibility score.' },
            sources: [{ type: 'other' as const, ref: 'core_web_vitals.image_baseline', excerpt: 'תמונות מהוות 50-70% ממשקל הדף באתרי מסחר.' }],
            dependsOn: [],
            actionPlan: [
                _step('ביצוע סריקה: כמה תמונות באתר ללא alt text? (השתמשו ב-Screaming Frog / Sitebulb / Ahrefs Audit).', false, 30),
                _step('כתבו alt text בעברית לכל תמונה — descriptive (לא keyword stuffing), 5-12 מילים, כולל context.', false, 240),
                _step(cmsHint(stack, {
                    wp: 'המירו תמונות JPG/PNG ל-WebP (קומפרסיה 25-35% טובה יותר). פלאגין WordPress: ShortPixel / WebP Express / Imagify.',
                    git: 'המירו תמונות JPG/PNG ל-WebP (קומפרסיה 25-35% טובה יותר) בשלב ה-build / סקריפט עיבוד תמונות, ובצעו commit ל-GitHub.',
                    generic: 'המירו תמונות JPG/PNG ל-WebP (קומפרסיה 25-35% טובה יותר) דרך כלי עיבוד התמונות של האתר.',
                }), false, 60),
                _step(cmsHint(stack, {
                    wp: 'הפעילו lazy loading (native HTML loading="lazy" על כל img מתחת ל-fold + iframe). WordPress 5.5+ עושה אוטומטית.',
                    git: 'הוסיפו loading="lazy" לכל תגית img מתחת ל-fold + iframe בתבניות הקוד, ובצעו commit ל-GitHub.',
                    generic: 'הוסיפו loading="lazy" לכל תגית img מתחת ל-fold + iframe.',
                }), false, 30),
                _step(cmsHint(stack, {
                    wp: 'צרו image-sitemap.xml (נוסף ל-sitemap הראשי) ושלחו ל-GSC. RankMath/Yoast יוצרים אוטומטית.',
                    git: 'צרו image-sitemap.xml (נוסף ל-sitemap הראשי) בשלב ה-build ושלחו ל-GSC.',
                    generic: 'צרו image-sitemap.xml (נוסף ל-sitemap הראשי) ושלחו ל-GSC.',
                }), false, 30),
                _step('הוסיפו תמונת og:image לכל דף עם תוכן (1200×630 WebP) ו-twitter:image לשיתופים.', false, 45),
                _step('ניטור 60 יום: GSC → Performance → Search appearance "Images" — מדדו clicks/impressions delta. CWV → LCP delta.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 2,
        }]
    },
}

// K26-c: Video schema. Reads existing tasks that reference YouTube/וידאו/reel.
// Spawns dedicated VideoObject schema task if videos are part of the plan.
const VIDEO_SCHEMA_FILLER: StructuredFiller = {
    stageId: 'k26_video_schema',
    description: 'VideoObject schema task when plan contains video content',
    fill(_rd, existingTasks) {
        const hasVideo = existingTasks.some(t => {
            const text = `${t.title || ''} ${t.summary || ''}`.toLowerCase()
            return /youtube|וידאו|video|reel|סרטון|tiktok/i.test(text)
        })
        if (!hasVideo) return []
        if (_existingTaskMatches(existingTasks, [/videoobject|video schema|וידאו.*סכמ|video.*schema|סכמת.*וידאו|video.*structured/i])) return []
        return [{
            id: newTaskId('tsk_k26_video_schema'),
            type: 'website_change',
            title: 'סכמת VideoObject + transcript + הטמעה SEO-friendly לסרטונים',
            summary: 'כל וידאו בלי VideoObject schema = אבדן video carousel ב-SERP + אובדן הזדמנות citation במנועי AI. transcript = entity density.',
            channel: 'seo',
            priority: 'P2',
            estimatedEffort: '2_3_hours',
            expectedImpact: { metric: 'organic_traffic_pct', value: 8, horizon: '60d', confidence: 'medium', rationale: 'VideoObject schema פותח video carousel ב-SERP, מעלה CTR ב-15-25%. transcript מוסיף 500-1500 מילים entity-rich לדף.' },
            sources: [{ type: 'other' as const, ref: 'serp_video_carousel_opportunity', excerpt: 'סבב וידאו (Video carousel) ב-SERP מוצג ב-15-30% משאילתות "איך לעשות" והדרכות.' }],
            dependsOn: [],
            actionPlan: [
                _step('לכל סרטון מהתוכנית: יצרו transcript מלא בעברית (פלאגין: Otter.ai / Whisper API).', false, 60),
                _step('הוסיפו VideoObject schema עם: name, description, thumbnailUrl, uploadDate, contentUrl, embedUrl, duration (ISO 8601), transcript.', false, 90),
                _step('הטמיעו את הסרטון עם data-no-cookie="true" (YouTube nocookie embed) + lazy load via thumbnail click.', false, 30),
                _step('הוסיפו את ה-transcript בתוך accordion <details> מתחת לסרטון — entity-rich text מאונדקס.', false, 30),
                _step('שלחו את ה-URLs ל-GSC URL Inspection. בקשו indexing.', false, 15),
                _step('ניטור 60 יום: GSC → Performance → Search appearance "Videos" — מדדו impressions delta.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 3,
        }]
    },
}

// K26-d: Multi-competitor comparison pages. Read paid_competitor_landscape.records[]
// for high-threat competitors; spawn comparison page tasks for those NOT already
// in plan (Get Packing was covered; check Hakol Lamovil / BestBox etc).
const COMPARISON_PAGES_FILLER: StructuredFiller = {
    stageId: 'k26_comparison_pages',
    description: 'BOFU comparison pages for top-3 competitors not already covered',
    tactic: 'comparison_pages',
    fill(rd, existingTasks) {
        const records: any[] = rd?.results?.paid_competitor_landscape?.records || []
        const competitors: any[] = records.filter(r => r?.domain && (r.strategic_threat_level === 'high' || r.strategic_threat_level === 'medium'))
        if (competitors.length === 0) return []
        const existingTitlesLc = existingTasks.map(t => (t.title || '').toLowerCase() + ' ' + (t.summary || '').toLowerCase())
        const out: MonthlyTask[] = []
        for (const c of competitors.slice(0, 5)) {
            const compName = String(c.domain).replace(/^www\./, '').split('.')[0]
            const compNameLc = compName.toLowerCase()
            const alreadyCovered = existingTitlesLc.some(text =>
                text.includes(compNameLc) && /(השוואה|vs\.|מול|comparison|comparison page|דף השוואה)/i.test(text)
            )
            if (alreadyCovered) continue
            out.push({
                id: newTaskId('tsk_k26_comparison'),
                type: 'landing_page',
                title: `דף השוואה — אנחנו מול ${compName}`.slice(0, 80),
                summary: `דף BOFU להשוואה מול ${compName} (${c.strategic_threat_level} threat) — תופס שאילתות "[brand] vs ${compName}" ומחזק positioning.`,
                channel: 'seo',
                priority: 'P1',
                estimatedEffort: '1_day',
                expectedImpact: { metric: 'conversions', value: 3, horizon: '60d', confidence: 'medium', rationale: `דפי השוואה תופסים שאילתות BOFU (high intent), CR שלהם 2-4× מ-pillar pages.` },
                sources: [
                    { type: 'transparency.competitor' as const, ref: `paid_competitor_landscape.records[].domain=${c.domain}`, excerpt: (c.strategic_threat_rationale_he || '').slice(0, 150) || `${c.domain}: ${c.strategic_threat_level} threat` },
                    ...(Array.isArray(c.landing_page_strengths) ? [{ type: 'transparency.competitor' as const, ref: `${c.domain}.landing_page_strengths`, excerpt: c.landing_page_strengths.slice(0, 2).join(' · ') }] : []),
                ],
                dependsOn: [],
                actionPlan: [
                    _step(`חקרו את ${compName} — מחיר, מארזים, זמן משלוח, אזורי שירות, ביקורות. שמרו טבלת השוואה.`, false, 60),
                    _step(`כתבו H1: "אנחנו מול ${compName} — השוואה מלאה ${new Date().getFullYear()}". פסקת hero עם הבדל מרכזי.`, false, 45),
                    _step('הוסיפו טבלת השוואה מובנית: 8-12 שורות (מחיר / משלוח / החזרות / אחריות / אזורי שירות / מארזים / טיפוח לקוחות / ביקורות).', false, 90),
                    _step('הוסיפו 2-3 testimonials של לקוחות שעברו מ-המתחרה אליכם (אם קיימים).', false, 60),
                    _step('הוסיפו ComparisonTable schema + FAQPage עם 5 שאלות "מה ההבדל בין X ל-Y?".', false, 30),
                    _step('CTA primary: "השוו במחיר" / "התחילו עכשיו". CTA secondary: צ\'אט WhatsApp.', false, 20),
                    _step('ניטור 60 יום: מיקום ב-GSC לשאילתת brand+competitor, CR של הדף. יעד: top-3 + CR >5%.', false, 15),
                ],
                status: 'proposed', proposedAt: nowIso(), weekOfMonth: 3,
            })
            if (out.length >= 2) break   // Cap at 2 spawns per regen
        }
        return out
    },
}

// K26-FOUNDATION: the single "full internal SEO/AEO optimization across ALL
// pages" task. One approval → the orchestrator runs the whole sweep in the
// background (schema+FAQPage, meta, internal links, image alt, product schema —
// builder-aware, system-page-aware, 2026-correct). This is Layer 0: the
// foundation that should run before content deepening. Idempotent: one per plan.
const FULL_SITE_SEO_FILLER: StructuredFiller = {
    stageId: 'k26_full_site_seo',
    description: 'Full-site internal SEO/AEO optimization (one task → whole sweep)',
    fill(_rd, existingTasks) {
        if (existingTasks.some(t => (t as { taskKind?: string }).taskKind === 'full_site_seo')) return []
        if (_existingTaskMatches(existingTasks, [/אופטימיזציה\s+(פנימית\s+)?מלאה|מנוע\s+seo\s+פנימי|full[- ]site\s+seo|פריסת\s+seo\s+מלאה/i])) return []
        const task = {
            id: newTaskId('tsk_full_site_seo'),
            taskKind: 'full_site_seo',
            type: 'website_change',
            title: 'מנוע SEO פנימי — אופטימיזציה מלאה לכל הדפים',
            summary: 'אישור אחד → המערכת עוברת על כל הדפים והמוצרים באתר ומביאה כל אחד לסטנדרט SEO/AEO 2026: סכמת מבנה (Organization+WebSite+Breadcrumb+Article/WebPage, ו-FAQPage היכן שיש שאלות), תיאורי meta, קישורים פנימיים, טקסט alt לתמונות, וסכמת Product למוצרים. רץ ברקע. דפי מערכת (עגלה/תשלום/תודה) מדולגים אוטומטית.',
            channel: 'seo',
            priority: 'P0',
            estimatedEffort: 'system',
            expectedImpact: { metric: 'organic_traffic_pct', value: 18, horizon: '60d', confidence: 'high', rationale: 'תשתית פנימית מלאה (structured data + meta + קישורים) על כל עמוד = הבסיס לדירוג אורגני ולציטוט במנועי AI. נדרש לפני העמקת תוכן.' },
            sources: [{ type: 'other' as const, ref: 'full_site_internal_baseline', excerpt: 'אופטימיזציה פנימית לכל הדפים — הפעולה הראשונה בכל אסטרטגיית SEO/AEO.' }],
            dependsOn: [],
            actionPlan: [
                _step('סריקת כל הדפים והמוצרים והוספת סכמת מבנה (Organization+WebSite+Breadcrumb+Article/WebPage; FAQPage היכן שיש שאלות) — כולל דפי Elementor.', true, 0),
                _step('יצירת/עדכון תיאור meta לכל דף ללא תיאור איכותי (דפי מערכת מדולגים).', true, 0),
                _step('הוספת קישורים פנימיים רלוונטיים בין דפי תוכן.', true, 0),
                _step('יצירת טקסט alt בעברית לתמונות ללא תיאור + סכמת Product+Offer לכל המוצרים.', true, 0),
                _step('דוח כיסוי בסיום — כמה דפים/מוצרים עודכנו בכל שכבה.', true, 0),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 1,
        }
        return [task as unknown as MonthlyTask]
    },
}

// K26-e: BreadcrumbList + brand-entity (Organization + sameAs) schema. For any
// tenant with pillar/spoke content tasks, spawn aggregate technical schema task.
// NOTE: WebSite SearchAction (Sitelinks Searchbox) was RETIRED by Google
// 2024-11-21 — no longer emitted. Entity (Organization/sameAs) is the 2026 value.
const TECHNICAL_SCHEMA_FILLER: StructuredFiller = {
    stageId: 'k26_technical_schema',
    description: 'BreadcrumbList + brand-entity (Organization + sameAs) schema',
    fill(_rd, existingTasks, stack) {
        const hasContent = existingTasks.some(t => /pillar|spoke|דף עוגן|דף נושא|landing|דף נחיתה|דף עיר/i.test(`${t.title || ''} ${t.summary || ''}`))
        if (!hasContent) return []
        if (_existingTaskMatches(existingTasks, [/breadcrumblist|breadcrumb schema|website schema|תיוג.*נתיב|ישות מותג|organization.*sameas|brand entity/i])) return []
        return [{
            id: newTaskId('tsk_k26_tech_schema'),
            type: 'website_change',
            title: 'תיוג מובנה טכני — BreadcrumbList + ישות מותג (Organization + sameAs)',
            summary: 'שתי סכמות "תשתית" לכל האתר: BreadcrumbList (path display ב-SERP, מעלה CTR) + Organization עם sameAs (זיהוי המותג כישות מוכרת ע"י גוגל ומנועי AI — הסיגנל החזק ביותר ל-AI Overviews ב-2026). הערה: WebSite SearchAction (sitelinks searchbox) הוצא משימוש ע"י גוגל בנוב׳ 2024 — לא מוסיפים יותר.',
            channel: 'seo',
            priority: 'P1',
            estimatedEffort: '2_3_hours',
            expectedImpact: { metric: 'ctr_pct', value: 10, horizon: '30d', confidence: 'high', rationale: 'BreadcrumbList ב-SERP מעלה CTR ב-10-15% (path מציע context). Organization+sameAs קושר את המותג לישות בגרף הידע → אזכור ע"י מנועי AI (קורלציה 0.66 לעומת 0.22 לבק-לינקים).' },
            sources: [{ type: 'other' as const, ref: 'technical_schema_baseline', excerpt: 'SEO טכני במאמץ נמוך ובהשפעה גבוהה (entity grounding ל-AI).' }],
            dependsOn: [],
            actionPlan: [
                _step(cmsHint(stack, {
                    wp: 'BreadcrumbList: הוסיפו על כל קטגוריה / מוצר / דף נושא / דף עיר. RankMath/Yoast עושים אוטומטית — בדקו ב-Rich Results Test.',
                    git: 'BreadcrumbList (JSON-LD): הוסיפו לתבניות הדפים בקוד ובצעו commit/PR ב-GitHub — בדקו ב-Rich Results Test.',
                    generic: 'BreadcrumbList (JSON-LD): הוסיפו על כל קטגוריה / מוצר / דף נושא / דף עיר — בדקו ב-Rich Results Test.',
                }), false, 45),
                _step('Organization schema (sitewide, לא רק הבית): name, logo, contactPoint, ו-sameAs → פרופילים מאמתים (Wikidata, LinkedIn, רשתות רשמיות, Google Business). זה הליבה לזיהוי המותג ע"י מנועי AI.', false, 45),
                _step('ודאו inLanguage=he-IL ו-@id יציבים (#organization / #website) כך שכל הצמתים מקושרים לגרף אחד.', false, 20),
                _step('בדקו ב-Rich Results Test + Schema.org validator על 5 דפים representative — וודאו שאין warnings.', false, 30),
                _step('בקשו re-crawl ל-GSC לדפים הראשיים. עקבו אחרי breadcrumb ב-Search appearance.', false, 15),
                _step('ניטור 30 יום: CTR delta + נוכחות המותג ב-AI Overviews על שאילתות branded.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 1,
        }]
    },
}

// K26-f: Review schema for product pages. Read internal_seo_audit.records[]
// for product pages count; spawn if ≥10 product pages exist.
const REVIEW_SCHEMA_FILLER: StructuredFiller = {
    stageId: 'k26_review_schema',
    description: 'AggregateRating + Review schema for product pages',
    fill(rd, existingTasks, stack) {
        const records: any[] = rd?.results?.internal_seo_audit?.records || []
        const productPages = records.filter(r => r?.page_type === 'product' || /\/product\//i.test(r?.url || ''))
        if (productPages.length < 10) return []
        if (_existingTaskMatches(existingTasks, [/review schema|aggregaterating|ביקורות.*סכמ|rating.*schema|stars.*schema|כוכבי.*ביקורת/i])) return []
        return [{
            id: newTaskId('tsk_k26_review_schema'),
            type: 'website_change',
            title: `סכמת AggregateRating + Review ל-${productPages.length} דפי מוצר`,
            summary: `${productPages.length} דפי מוצר ללא AggregateRating schema = אובדן star ratings ב-SERP. אחד מהגורמים החזקים ב-CTR ל-e-commerce.`,
            channel: 'seo',
            priority: 'P0',
            estimatedEffort: '1_day',
            expectedImpact: { metric: 'ctr_pct', value: 25, horizon: '30d', confidence: 'high', rationale: `Star ratings ב-SERP מעלות CTR ב-20-35% (אחד מ-features ה-rich-snippet הכי חזקים).` },
            sources: [{ type: 'other' as const, ref: `internal_seo_audit.records[].page_type=product (n=${productPages.length})`, excerpt: `${productPages.length} דפי מוצר זוהו.` }],
            dependsOn: [],
            actionPlan: [
                _step(cmsHint(stack, {
                    wp: 'סנכרנו עם source-of-truth של ביקורות (Google Reviews API / ביקורות WooCommerce / Trustpilot).',
                    git: 'סנכרנו עם source-of-truth של ביקורות (Google Reviews API / Trustpilot / קובץ נתוני ביקורות במאגר).',
                    generic: 'סנכרנו עם source-of-truth של ביקורות (Google Reviews API / Trustpilot / מערכת הביקורות באתר).',
                }), false, 45),
                _step(cmsHint(stack, {
                    wp: 'עדכנו את תבנית WooCommerce להוסיף AggregateRating: ratingValue, reviewCount, bestRating=5. כללו ב-Product schema.',
                    git: 'הוסיפו AggregateRating (ratingValue, reviewCount, bestRating=5) ל-JSON-LD של דף המוצר בקוד, כחלק מ-Product schema, ובצעו commit/PR.',
                    generic: 'הוסיפו AggregateRating (ratingValue, reviewCount, bestRating=5) לתבנית דף המוצר, כחלק מ-Product schema.',
                }), false, 90),
                _step('הוסיפו Review schema לפחות לחמש ביקורות פר מוצר (top by helpfulness): author Person, datePublished, reviewBody, reviewRating.', false, 90),
                _step('בדקו ב-Rich Results Test על 3 דפי מוצר — וודאו star rating מוצג. fix warnings.', false, 30),
                _step('בקשו re-crawl ב-GSC לדפי מוצר עליונים. עקבו אחרי "Review snippet" ב-Search appearance.', false, 20),
                _step('ניטור 30 יום: CTR delta על דפי מוצר + impressions עם "Review snippet" appearance.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 1,
        }]
    },
}

// K26-g: Sitemap.xml validation post-deploy. Always relevant for tenants
// who add new content. Idempotent.
const SITEMAP_VALIDATION_FILLER: StructuredFiller = {
    stageId: 'k26_sitemap_validation',
    description: 'Sitemap.xml validation + GSC submission cadence',
    fill(_rd, existingTasks, stack) {
        if (_existingTaskMatches(existingTasks, [/sitemap.*validat|sitemap.*xml|תוקפ.*sitemap|sitemap submission|sitemap.*gsc/i])) return []
        return [{
            id: newTaskId('tsk_k26_sitemap'),
            type: 'measurement_gap',
            title: 'ניטור sitemap.xml + הגשה אוטומטית ל-GSC לאחר כל deploy',
            summary: 'בלי sitemap מסונכרן, indexing מתעכב 1-4 שבועות. Auto-submit ל-GSC + Bing אחרי כל פרסום = indexing תוך 24 שעות.',
            channel: 'seo',
            priority: 'P2',
            estimatedEffort: '2_3_hours',
            expectedImpact: { metric: 'organic_traffic_pct', value: 5, horizon: '30d', confidence: 'high', rationale: 'Indexing מהיר על דפים חדשים = compounding traffic. תהליך אוטומטי = zero ongoing effort.' },
            sources: [{ type: 'other' as const, ref: 'sitemap_indexing_baseline', excerpt: 'שליחת מפת אתר (sitemap) ל-GSC ופרוטוקול IndexNow מתועדים כבסיס.' }],
            dependsOn: [],
            actionPlan: [
                _step(cmsHint(stack, {
                    wp: 'וודאו ש-sitemap.xml הראשי מתעדכן אוטומטית אחרי כל פרסום (RankMath / Yoast / WP Sitemaps).',
                    git: 'וודאו ש-sitemap.xml נוצר ומתעדכן אוטומטית בשלב ה-build בכל deploy ל-GitHub.',
                    generic: 'וודאו ש-sitemap.xml הראשי מתעדכן אוטומטית אחרי כל פרסום.',
                }), false, 30),
                _step('הוסיפו image-sitemap.xml + video-sitemap.xml אם רלוונטי (e-commerce עם תמונות מוצר).', false, 30),
                _step('הקימו IndexNow integration (Bing/Yandex) — פלאגין: IndexNow / Cloudflare worker.', false, 45),
                _step('שלחו את ה-sitemaps ל-GSC + Bing Webmaster. וודאו status=Success.', false, 20),
                _step('הקימו GitHub Action / cron weekly שמשגר POST /sitemap-ping ל-Google + Bing אחרי כל push.', false, 60),
                _step('ניטור: GSC → Indexing → Pages — וודאו ש-discovered/indexed לא מתרחק יותר מ-7 ימים.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 4,
        }]
    },
}

// K26-h: Quarterly content refresh schedule. Always relevant for tenants
// with evergreen content (most are). Idempotent.
const CONTENT_REFRESH_FILLER: StructuredFiller = {
    stageId: 'k26_content_refresh',
    description: 'Quarterly content refresh schedule for evergreen pages',
    fill(_rd, existingTasks) {
        if (_existingTaskMatches(existingTasks, [/content refresh|רענון.*תוכן|evergreen.*refresh|annual.*update|רענון רבעוני|content.*update.*schedule/i])) return []
        return [{
            id: newTaskId('tsk_k26_content_refresh'),
            type: 'other',
            title: 'לוח רענון תוכן רבעוני — top-20 דפים evergreen',
            summary: 'תוכן ישן יורד במיקום. רענון רבעוני של top-20 evergreen pages = signal של "fresh content" + עדכון עובדות + הוספת entities.',
            channel: 'content',
            priority: 'P2',
            estimatedEffort: '1_hour',
            expectedImpact: { metric: 'organic_traffic_pct', value: 10, horizon: '90d', confidence: 'medium', rationale: 'דפים שמתעדכנים אחת לרבעון שומרים על top-10. דפים שלא מתעדכנים יורדים 3-7 מיקומים תוך 12 חודשים.' },
            sources: [{ type: 'other' as const, ref: 'evergreen_refresh_baseline', excerpt: 'דעיכת תוכן (Content decay) גורמת לאובדן 15-30% מהתנועה תוך שנה ללא רענון.' }],
            dependsOn: [],
            actionPlan: [
                _step('סנו רשימת top-20 evergreen pages לפי clicks (GSC → Performance → Pages, last 90d).', false, 30),
                _step('צרו Google Sheet עם: URL, last_updated, primary_keyword, current_position, refresh_due_date (quarterly).', false, 30),
                _step('הגדירו רוטינה רבעונית: 1 שבוע × 4-5 דפים. עדכונים: עובדות מספריות / שנה / טבלאות / FAQ חדשות.', false, 30),
                _step('בכל רענון: עדכן title with current year, עדכן meta description, הוסיפו 100-300 מילים חדשות, בקשו re-crawl.', false, 20),
                _step('הוסיפו reminder ל-Calendar: 1 של חודשים 1/4/7/10 — "רענון 4-5 דפים evergreen".', false, 10),
                _step('ניטור: track position delta של 20 דפים. יעד: ≥80% שומרים על top-10 throughout השנה.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 4,
        }]
    },
}

// ─── Registry + entry point ───────────────────────────────────────────────
// K24 supersedes the generic K22 AEO_FILLER (a single "improve AEO visibility"
// task) with 3 focused fillers (entity authority + probe + quotability). The
// generic filler is removed from the registry to avoid duplicate coverage.
// K26 adds 8 Tier-1 SEO completeness fillers (internal links, image SEO, video
// schema, comparison pages, technical schema, review schema, sitemap, content
// refresh).
// ═══ K27 — SCHEMA PRIORITY PLAN CONSUMER (extras-level read) ═════════════
// The LLM-generated extras `aeo_visibility.extras.schema_priority_plan` and
// `internal_seo_audit.extras.schema_gap_analysis` are rich action-oriented
// lists of schemas to add per-page-type with url_examples, expected_aio_lift,
// urls_to_add_count, estimated_effort_hours, and implementation_approach.
// Earlier fillers consumed records[] but NOT these extras — this filler
// unlocks them. For each high|medium-priority schema gap NOT already covered
// by existing tasks, spawn an aggregate "implement [Schema] on N URLs" task.
const SCHEMA_PRIORITY_FILLER: StructuredFiller = {
    stageId: 'k27_schema_priority',
    description: 'Consume aeo_visibility.schema_priority_plan + internal_seo_audit.schema_gap_analysis for missing schemas',
    fill(rd, existingTasks) {
        const aeoPlan: any[] = rd?.results?.aeo_visibility?.extras?.schema_priority_plan || []
        const seoGap: any[] = rd?.results?.internal_seo_audit?.extras?.schema_gap_analysis || []
        const candidates: Array<{ schema: string; pageType: string; count: number; priority: string; approach?: string; urls?: string[]; lift?: string; hours?: number; source: 'aeo' | 'seo' }> = []

        for (const p of aeoPlan) {
            if (!p?.schema_type || (p.urls_to_add_count || 0) < 1) continue
            candidates.push({
                schema: String(p.schema_type),
                pageType: String(p.page_type || 'multiple'),
                count: Number(p.urls_to_add_count) || 0,
                priority: String(p.priority || 'medium'),
                approach: p.implementation_approach,
                urls: Array.isArray(p.url_examples) ? p.url_examples.slice(0, 3) : [],
                lift: p.expected_aio_lift,
                hours: Number(p.estimated_effort_hours) || undefined,
                source: 'aeo',
            })
        }
        for (const g of seoGap) {
            if (!Array.isArray(g?.expected_schemas) || (g.missing_urls_count || 0) < 1) continue
            for (const sch of g.expected_schemas) {
                candidates.push({
                    schema: String(sch),
                    pageType: String(g.page_type || 'multiple'),
                    count: Number(g.missing_urls_count) || 0,
                    priority: String(g.priority || 'medium'),
                    approach: g.implementation_note,
                    urls: [],
                    lift: undefined,
                    hours: undefined,
                    source: 'seo',
                })
            }
        }

        const out: MonthlyTask[] = []
        const seen = new Set<string>()
        for (const c of candidates) {
            const key = `${c.schema.toLowerCase()}|${c.pageType.toLowerCase()}`
            if (seen.has(key)) continue
            seen.add(key)
            if (c.priority === 'low') continue
            const schemaPattern = new RegExp(`\\b${c.schema.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
            // Skip if any existing task title/summary mentions this schema name.
            if (existingTasks.some(t => schemaPattern.test(`${t.title || ''} ${t.summary || ''}`))) continue

            out.push({
                id: newTaskId('tsk_k27_schema'),
                type: 'website_change',
                title: `הוספת סכמת ${c.schema} ל-${c.count} דפי ${c.pageType}`.slice(0, 80),
                summary: `${c.priority} priority — ${c.lift ? c.lift.slice(0, 150) : `סגירת פער schema על ${c.count} דפים`}`,
                channel: 'seo',
                priority: c.priority === 'high' ? 'P0' : c.priority === 'medium' ? 'P1' : 'P2',
                estimatedEffort: c.hours && c.hours > 16 ? '2_3_days' : c.hours && c.hours > 4 ? '1_day' : '2_3_hours',
                expectedImpact: {
                    metric: 'organic_traffic_pct',
                    value: c.priority === 'high' ? 15 : 8,
                    horizon: '60d',
                    confidence: 'medium',
                    rationale: `סכמת ${c.schema} על ${c.count} דפים פותחת rich snippets / AI citation ל-page_type=${c.pageType}.`,
                },
                sources: [
                    {
                        type: 'other' as const,
                        ref: c.source === 'aeo' ? `aeo_visibility.extras.schema_priority_plan[].schema_type=${c.schema}` : `internal_seo_audit.extras.schema_gap_analysis[].page_type=${c.pageType}`,
                        excerpt: (c.approach || `${c.count} דפים זוהו ללא ${c.schema} schema.`).slice(0, 200),
                    },
                    ...(c.urls && c.urls.length > 0 ? c.urls.slice(0, 2).map(u => ({ type: 'other' as const, ref: `url_example`, excerpt: u })) : []),
                ],
                dependsOn: [],
                actionPlan: [
                    _step(`גישה: ${(c.approach || 'הטמעה דרך template/plugin בקובץ אחד שמייצר אוטומטית לכל דף.').slice(0, 200)}`, false, 30),
                    _step(`מקדו את template/CMS שיוצר את הסכמה — וודאו fields חובה לפי Schema.org docs לסוג ${c.schema}.`, false, 60),
                    _step(`עברו על top-${Math.min(c.count, 3)} URLs — וודאו שהסכמה מתקבלת תקין ב-Rich Results Test.`, false, 30),
                    _step('בקשו re-crawl ב-GSC URL Inspection ל-top 5 URLs רלוונטיים.', false, 20),
                    _step(`ניטור 60 יום: GSC → Search appearance ל-${c.schema} — מדדו impressions delta.`, false, 15),
                ],
                status: 'proposed',
                proposedAt: nowIso(),
                weekOfMonth: c.priority === 'high' ? 1 : 2,
            })
            if (out.length >= 3) break   // Cap to keep plan focused
        }
        return out
    },
}

// ═══ K28 — ARCHETYPE COVERAGE FILLERS (Phase 6) ═══════════════════════════
// Deterministic guarantees that the archetype strategy's intent is actually
// represented in the plan, regardless of what the LLM passes produced:
//   • every connect-first / uncovered PRIMARY+SECONDARY channel → an activation task
//   • recurring-revenue offers → onboarding/retention/expansion tasks
//   • active paid search → an ongoing search-query-report mining cadence

interface ChannelMeta { key: string; he: string; detect: RegExp }
/** Map a registry channel description → a canonical key + Hebrew label + a
 *  coverage-detection regex (Hebrew + English) for the "is it already in the plan?" check. */
function channelMeta(channel: string): ChannelMeta | null {
    const c = channel.toLowerCase()
    if (/linkedin/.test(c)) return { key: 'linkedin', he: 'LinkedIn', detect: /linkedin|לינקדאין/i }
    if (/organic short-video|reels|tiktok|youtube|short-video/.test(c)) return { key: 'social_video', he: 'וידאו קצר אורגני (Reels/TikTok/YouTube)', detect: /reel|tiktok|youtube|וידאו קצר|סרטון קצר|אורגני.*וידאו/i }
    if (/webinar|masterclass/.test(c)) return { key: 'webinar', he: 'וובינר / מאסטרקלאס', detect: /webinar|וובינר|מאסטרקלאס/i }
    if (/affiliate|jv/.test(c)) return { key: 'affiliate', he: 'שותפים / JV', detect: /affiliate|שותפים|partner.*program/i }
    if (/email/.test(c)) return { key: 'email', he: 'רשימת אימייל + נרטור', detect: /email|אימייל|רשימת תפוצה|מייל|רצף מיילים|נרטור/i }
    if (/business profile|gbp/.test(c)) return { key: 'gbp', he: 'Google Business Profile', detect: /business profile|gbp|דף עסק|פרופיל עסק/i }
    if (/meta|advantage|dpa/.test(c)) return { key: 'meta', he: 'Meta', detect: /\bmeta\b|facebook|instagram|reels/i }
    // SEO/content/search are heavily covered by other fillers + the LLM — skip
    // to avoid duplicate activation noise; the channel detection below also guards.
    return null
}

function collectStrategyChannels(rd: any): Array<{ channel: string; action: string; blockedBy?: string; tier: string }> {
    const strat = rd?.archetypeStrategy
    if (!strat) return []
    const out: Array<{ channel: string; action: string; blockedBy?: string; tier: string }> = []
    const fromStrategy = (s: any) => {
        for (const c of (s?.rankedChannels || [])) {
            if (c.tier === 'primary' || c.tier === 'secondary') out.push({ channel: c.channel, action: c.action, blockedBy: c.blockedBy, tier: c.tier })
        }
    }
    if (Array.isArray(strat.offerStrategies) && strat.offerStrategies.length > 1) {
        for (const os of strat.offerStrategies) fromStrategy(os.strategy)
    } else {
        fromStrategy(strat)
    }
    return out
}

// K28-a: channel activation guarantee. Every archetype primary/secondary channel
// that the plan does not already cover gets an explicit "set up + first use" task
// (connect-first → connect then first campaign/content). Closes the "LinkedIn was
// a primary channel but produced zero tasks" gap.
const CHANNEL_ACTIVATION_FILLER: StructuredFiller = {
    stageId: 'k28_channel_activation',
    description: 'Ensure every primary/secondary archetype channel is operationalized (connect + first use)',
    tactic: 'channel_activation',
    fill(rd, existingTasks) {
        const channels = collectStrategyChannels(rd)
        if (channels.length === 0) return []
        const out: MonthlyTask[] = []
        const seen = new Set<string>()
        for (const ch of channels) {
            const meta = channelMeta(ch.channel)
            if (!meta || seen.has(meta.key)) continue
            seen.add(meta.key)
            // already covered by an existing task? skip.
            if (_existingTaskMatches(existingTasks, [meta.detect])) continue
            const connectFirst = ch.action === 'connect_first'
            const title = connectFirst
                ? `הקמה והפעלה ראשונית של ${meta.he}`
                : `הקמת נוכחות והפעלה ראשונית ב-${meta.he}`
            out.push({
                id: newTaskId('tsk_k28_chan'),
                type: connectFirst ? 'tracking_setup' : 'cross_channel_amplification',
                title: title.slice(0, 80),
                summary: `${meta.he} הוא ערוץ ${ch.tier === 'primary' ? 'ראשי' : 'משני'} באסטרטגיית הארכיטיפ אך אין לו עדיין משימה — ${connectFirst ? 'נדרש חיבור/הקמה ואז שימוש ראשון' : 'נדרשת הקמת נוכחות ושימוש ראשון'}.`,
                channel: 'cross',
                priority: ch.tier === 'primary' ? 'P1' : 'P2',
                estimatedEffort: '2_3_hours',
                expectedImpact: { metric: 'other', value: 1, horizon: '30d', confidence: 'medium', rationale: `הפעלת ערוץ ${meta.he} פותחת זרם לידים/חשיפה שתואם לארכיטיפ — חיוני שלא להשאיר ערוץ ראשי ריק.` },
                sources: [{ type: 'other', ref: `archetypeStrategy.${ch.tier}Channel`, excerpt: `${ch.channel} (${ch.action})` }],
                dependsOn: [],
                actionPlan: connectFirst ? [
                    _step(`חברו את ${meta.he} (חשבון/הרשאות/אינטגרציה) — בלי זה הערוץ לא פעיל.`, false, 30),
                    _step(`הגדירו את היעד הראשון בערוץ: קהל/מילות מפתח/פורמט בהתאם לפרסונה הראשית.`, false, 45),
                    _step(`הפיקו נכס ראשון (קמפיין/פוסט/וידאו) עם מסר מותאם-מותג ו-CTA ברור.`, false, 90),
                    _step(`חברו מדידה: UTM/אירוע המרה ל-${meta.he} כדי לייחס לידים.`, false, 30),
                    _step(`ניטור 30 יום: חשיפה→קליק→ליד; החליטו אם להגדיל לפי ROMI.`, false, 20),
                ] : [
                    _step(`פתחו/אמתו פרופיל ${meta.he} עם מיתוג מלא (תיאור, לוגו, קישורים).`, false, 30),
                    _step(`בנו לוח תוכן ראשוני (3-5 נכסים) מבוסס JTBD של הפרסונה הראשית.`, false, 60),
                    _step(`פרסמו נכס ראשון + CTA לאתר/וואטסאפ; מדדו מעורבות.`, false, 60),
                    _step(`קבעו קצב פרסום שבועי ומדידת חשיפה/מעורבות/הפניות.`, false, 20),
                    _step(`ניטור 30 יום: גידול עוקבים + תנועה מהערוץ; החליטו על הגברה.`, false, 20),
                ],
                status: 'proposed', proposedAt: nowIso(), weekOfMonth: ch.tier === 'primary' ? 2 : 3,
            })
            if (out.length >= 5) break
        }
        return out
    },
}

// K28-b: retention/expansion for recurring-revenue offers (subscription/repeat).
const RETENTION_FILLER: StructuredFiller = {
    stageId: 'k28_retention',
    description: 'Onboarding/activation + churn win-back + expansion tasks for recurring-revenue offers',
    tactic: 'retention',
    fill(rd, existingTasks) {
        const strat = rd?.archetypeStrategy
        const recurring = !!(strat?.modifiers?.recurring
            || (Array.isArray(strat?.allOffers) && strat.allOffers.some((o: any) => o?.recurring))
            || (Array.isArray(strat?.offerStrategies) && strat.offerStrategies.some((os: any) => os?.strategy?.modifiers?.recurring)))
        if (!recurring) return []
        const out: MonthlyTask[] = []
        const add = (id: string, title: string, summary: string, detect: RegExp, steps: MonthlyTaskActionStep[], metric: any, value: number, week: 1 | 2 | 3 | 4) => {
            if (_existingTaskMatches(existingTasks, [detect])) return
            out.push({
                id: newTaskId(id), type: 'cross_channel_amplification', title: title.slice(0, 80), summary, channel: 'email',
                priority: 'P1', estimatedEffort: '1_day',
                expectedImpact: { metric, value, horizon: '90d', confidence: 'medium', rationale: 'בהכנסה חוזרת (מנוי) השימור והרחבת הלקוח מכפילים LTV — לרוב זול פי 5 מגיוס חדש.' },
                sources: [{ type: 'other', ref: 'archetypeStrategy.recurring', excerpt: 'מודל הכנסה חוזר זוהה (מנוי/חזרה).' }],
                dependsOn: [], actionPlan: steps, status: 'proposed', proposedAt: nowIso(), weekOfMonth: week,
            })
        }
        add('tsk_k28_onboard', 'רצף onboarding/הפעלה ללקוח חדש (7 ימים)', 'רצף 4-5 הודעות (מייל/וואטסאפ) שמובילות את הלקוח החדש ל-"רגע הערך" הראשון — הפעלה = שימור.', /onboarding|הפעל.*לקוח|רצף.*קליטה|activation.*flow|רגע הערך/i, [
            _step('מפו את "רגע הערך" הראשון של המוצר (הפעולה שמנבאת שימור).', false, 45),
            _step('כתבו רצף 4-5 הודעות (יום 0/1/3/5/7) שמובילות לרגע הזה.', false, 120),
            _step('הוסיפו checklist/וידאו קצר "התחלה מהירה" + ערוץ תמיכה (וואטסאפ).', false, 60),
            _step('הגדירו אירוע "activated" ב-GA4 ומדדו % הפעלה תוך 7 ימים.', true, 20),
            _step('ניטור 90 יום: שיעור הפעלה ↔ שימור חודש 1; שפרו את הצעד עם הנשירה.', false, 20),
        ], 'other', 1, 1)
        add('tsk_k28_winback', 'מניעת נטישה + win-back — זיהוי סיכון ורצף החזרה', 'זיהוי לקוחות בסיכון נטישה (ירידה בשימוש) + רצף win-back; הפחתת churn ישירות מגדילה LTV.', /churn|נטישה|win.?back|שימור.*לקוח|בסיכון נטישה/i, [
            _step('הגדירו סיגנל סיכון (אי-כניסה X ימים / ירידת שימוש) ב-GA4/מערכת.', false, 45),
            _step('בנו רצף win-back 3 הודעות: תזכורת ערך, סיוע, הצעה/שדרוג.', false, 90),
            _step('הוסיפו פנייה אישית (וואטסאפ/טלפון) ללקוחות בעלי ACV גבוה.', false, 30),
            _step('מדדו win-back rate + churn חודשי לפני/אחרי.', false, 20),
            _step('ניטור 90 יום: יעד הפחתת churn ב-15-25%.', false, 15),
        ], 'other', 1, 3)
        add('tsk_k28_expansion', 'הרחבת לקוח — מסע cross-sell/upsell בין המוצרים', 'מסע ייעודי שמעלה לקוחות קיימים בין רמות/מוצרים (למשל self-serve → done-for-you) — הכנסה זולה ורווחית.', /cross.?sell|upsell|הרחב.*לקוח|שדרוג.*לקוח|expansion/i, [
            _step('זהו קריטריון מוכנות לשדרוג (שימוש/תוצאה/גודל) פר לקוח.', false, 45),
            _step('בנו הצעת שדרוג + רצף 3 הודעות שמראה ROI של הרמה הבאה.', false, 90),
            _step('הגדירו קהל Ads/Email של לקוחות מתאימים לשדרוג.', false, 30),
            _step('מדדו expansion MRR + שיעור שדרוג.', false, 20),
            _step('ניטור 90 יום: יעד 5-10% מהלקוחות משדרגים.', false, 15),
        ], 'conversions', 3, 3)
        return out
    },
}

// K28-c: ongoing search-query-report (SQR) mining when paid search is active.
const SQR_FILLER: StructuredFiller = {
    stageId: 'k28_sqr',
    description: 'Ongoing search-query-report mining cadence when paid search is live',
    tactic: 'sqr',
    fill(rd, existingTasks, stack) {
        const paidSearchActive = !!stack?.googleAds && existingTasks.some(t => t.channel === 'google_ads')
        if (!paidSearchActive) return []
        if (_existingTaskMatches(existingTasks, [/search.?query.?report|sqr|דוח שאילתות|מיינ.*שאילתות|שאילתות חיפוש.*שבועי/i])) return []
        return [{
            id: newTaskId('tsk_k28_sqr'), type: 'paid_optimization',
            title: 'קצב מיון דוח שאילתות חיפוש (SQR) — שבועי',
            summary: 'בחשבון חדש דליפות התקציב הגדולות ביותר בשבועות הראשונים — מיון SQR שבועי חושף מונחים מבזבזים והזדמנויות מילים חדשות.',
            channel: 'google_ads', priority: 'P1', estimatedEffort: '1_hour',
            expectedImpact: { metric: 'spend_savings_ils', value: 600, horizon: '30d', confidence: 'high', rationale: 'מיון SQR שבועי בחשבון חדש חוסך בדרך כלל 10-20% מהתקציב ומזין מילים חדשות איכותיות.' },
            sources: [{ type: 'other', ref: 'paid_search_active', excerpt: 'קמפיין חיפוש ממומן פעיל בתוכנית.' }],
            dependsOn: [],
            actionPlan: [
                _step('הגדירו רוטינה שבועית (יום א׳): Google Ads → Search terms.', false, 10),
                _step('סמנו מונחים מבזבזים (0 המרות, הוצאה גבוהה) → הוסיפו כשליליים.', false, 20),
                _step('סמנו מונחים ממירים שאינם keyword → הוסיפו ככוונה מדויקת/ביטוי.', false, 20),
                _step('תעדו דפוסים חוזרים → עדכנו רשימת שליליים ברמת החשבון.', false, 15),
                _step('ניטור 30 יום: ירידת spend מבוזבז + עליית שיעור המרה.', false, 15),
            ],
            status: 'proposed', proposedAt: nowIso(), weekOfMonth: 1,
        }]
    },
}

// Technical-SEO fillers fully subsumed by the one-task full-site sweep — skipped
// when that foundational task is in the plan (no redundant granular tasks).
const FULL_SWEEP_OVERLAP_STAGES = new Set<string>([
    'k26_technical_schema', 'k26_internal_linking', 'k26_image_seo', 'k26_review_schema', 'k27_schema_priority',
])

const ALL_FILLERS: StructuredFiller[] = [
    // Foundation FIRST — the one-task full-site sweep. Registered before the
    // granular technical fillers so they can detect it and skip (no redundant
    // schema/meta/links/alt tasks when the sweep already covers them).
    FULL_SITE_SEO_FILLER,
    INTERNAL_SEO_FILLER,
    SEO_KW_FILLER,
    PAID_KW_FILLER,
    PAID_COMP_FILLER,
    // K24 — AEO/LLM Program
    ENTITY_AUTHORITY_FILLER,
    AEO_PROBE_FILLER,
    QUOTABILITY_FILLER,
    // K25 — Local SEO Depth
    CITY_PAGES_FILLER,
    PERSONA_LP_FILLER,
    // K26 — Tier-1 SEO completeness
    INTERNAL_LINKING_FILLER,
    IMAGE_SEO_FILLER,
    VIDEO_SCHEMA_FILLER,
    COMPARISON_PAGES_FILLER,
    TECHNICAL_SCHEMA_FILLER,
    REVIEW_SCHEMA_FILLER,
    SITEMAP_VALIDATION_FILLER,
    CONTENT_REFRESH_FILLER,
    // K27 — Extras-level schema priority plan consumer
    SCHEMA_PRIORITY_FILLER,
    // K28 — Archetype coverage (Phase 6): channel activation, retention, SQR
    CHANNEL_ACTIVATION_FILLER,
    RETENTION_FILLER,
    SQR_FILLER,
]

export interface FillerRunResult {
    spawned: MonthlyTask[]
    perStageStats: Array<{ stageId: string; spawnedCount: number }>
}

/**
 * Invoked after Pass 3 ensureCoverage. Runs every registered filler;
 * appends spawned tasks to the plan. Logs per-stage counts.
 *
 * Phase-0 gating (rule #3 — respect upstream decisions): a filler is skipped when
 * its `tactic` is in the tenant's deferral set, or its `appliesWhen` precondition
 * is false. `stack` (resolved connected stack) is threaded so deterministic copy
 * stays integration-grounded (rule #1).
 */
export function runStructuredFillers(rd: any, existingTasks: MonthlyTask[], stack?: ConnectedStack): FillerRunResult {
    const spawned: MonthlyTask[] = []
    const perStageStats: Array<{ stageId: string; spawnedCount: number }> = []
    const deferred = collectDeferredTactics(rd)
    const skipped: string[] = []
    for (const f of ALL_FILLERS) {
        // Gate 1 — explicit deferral of this tactic by upstream strategy.
        if (f.tactic && deferred.has(f.tactic.toLowerCase())) {
            skipped.push(`${f.stageId}(deferred:${f.tactic})`)
            perStageStats.push({ stageId: f.stageId, spawnedCount: 0 })
            continue
        }
        // Gate 2 — precondition not met (e.g. no local-geo signal for city pages).
        if (f.appliesWhen && !f.appliesWhen(rd, stack)) {
            skipped.push(`${f.stageId}(precondition)`)
            perStageStats.push({ stageId: f.stageId, spawnedCount: 0 })
            continue
        }
        // Gate 3 — covered by the one-task full-site sweep. When that foundational
        // task is present, the purely-technical fillers it subsumes (schema/links/
        // image-alt/review schema) don't also spawn separate tasks → clean plan.
        if (FULL_SWEEP_OVERLAP_STAGES.has(f.stageId)
            && [...existingTasks, ...spawned].some(t => (t as { taskKind?: string }).taskKind === 'full_site_seo')) {
            skipped.push(`${f.stageId}(covered-by-full-sweep)`)
            perStageStats.push({ stageId: f.stageId, spawnedCount: 0 })
            continue
        }
        try {
            const tasks = f.fill(rd, [...existingTasks, ...spawned], stack)
            spawned.push(...tasks)
            perStageStats.push({ stageId: f.stageId, spawnedCount: tasks.length })
        } catch (err) {
            console.error(`[structuredFillers] ${f.stageId} fill error:`, (err as Error).message)
            perStageStats.push({ stageId: f.stageId, spawnedCount: 0 })
        }
    }
    if (skipped.length > 0) {
        console.log(`[structuredFillers] skipped ${skipped.length} filler(s): ${skipped.join(', ')}`)
    }
    return { spawned, perStageStats }
}