/**
 * Per-stage prompt builders. One function per StageId — each takes the same
 * shared context (instance + answers + upstream stage results) and returns
 * a prompt + agent + minLength + useDirectApi switch for the executor.
 *
 * Spec: docs/research-pipeline-design.md §7
 *
 * Source: lifted from agentSetup.buildResearchPrompt with these mappings:
 *   competitor_landscape ← stage 1
 *   seo_keyword_research ← stage 2
 *   audience_personas    ← stage 3
 *   positioning          ← NEW (small focused prompt, was implicit in stage 4)
 *   strategy_options     ← stage 4
 *   validation           ← stage 5 (ai_sim + real_interviews modes)
 *
 * The other stages (aeo_visibility, social_landscape, email_competitor_audit,
 * paid_audit, content_plan, media_plan) are either Phase 4 (live integrations)
 * or wrap existing handlers, so they don't need prompt builders here.
 */

import { getStageContent } from './reader'
import type { ResearchDataV2, StageId } from './types'
import {
    INTENT_TAXONOMY,
    OPPORTUNITY_SCORING,
    AEO_TARGET_SCORING,
    LANGUAGE_DECISION,
    SERP_FEATURE_RULES_HE,
    COMPETITOR_BUCKETING,
    COMPETITOR_ALWAYS_ON_SIGNALS,
    IL_SIGNALS_CHECKLIST,
    CLUSTER_ARCHITECTURE,
    PROGRAMMATIC_RULES,
    STRIKING_DISTANCE_RULE,
    CANNIBALIZATION_RULE,
    PERSONA_JTBD_FORMAT,
    BUYING_JOURNEY_FORMAT,
    TRUST_HIERARCHY_METHOD,
    PRICING_VALIDATION_METHOD,
    CONFIDENCE_LABELING,
    JSON_OUTPUT_RULES,
    DFS_DATA_RULE,
    QUALITY_GATE_INSTRUCTIONS,
    HARD_BLOCK_RULES,
} from './promptBlocks'

interface PromptOpts {
    businessName: string
    businessDesc: string
    answers: Record<string, unknown>
    rd: ResearchDataV2
    /** Optional user feedback to inject into the prompt for re-run. */
    feedback?: string
    /** Tools available on the VPS — controls the search/crawl/dfs hints. */
    tools: { hasBrave: boolean; hasDataforseo: boolean; hasFirecrawl: boolean }
    /** Historical assets block (Meta/Google Ads/GA/GSC CSVs) — already formatted markdown. */
    historicalAssetsBlock?: string
    /**
     * Stage-specific DataForSEO data fetched by the controller's prefetch
     * step. Per-stage prompt builder casts to the expected shape.
     * Undefined when stage doesn't need DFS or prefetch failed gracefully.
     */
    dfsData?: unknown
}

export interface PromptResult {
    /** OpenClaw CLI agent if useDirectApi=false. Ignored otherwise. */
    agentId: 'sayer' | 'menateach'
    prompt: string
    /** Floor below which executor treats result as "too short". */
    minLength: number
    /**
     * Stages without web research (analytical) → direct Anthropic API,
     * bypassing OpenClaw workspace context which confuses menateach.
     */
    useDirectApi: boolean
}

interface ProductSku {
    name: string
    priceIls: number | null
    priceModel: 'subscription_monthly' | 'one_time' | 'tiered' | 'free' | 'unknown'
    description: string
    isPrimary?: boolean
}

// Format products list as a Hebrew block. Empty string ⇒ caller flows normally.
function productsBlock(answers: { products?: ProductSku[]; productsFunnel?: string }): string {
    const list = answers.products || []
    if (list.length === 0) return ''
    const modelLabels: Record<string, string> = {
        subscription_monthly: 'מנוי חודשי',
        one_time: 'חד-פעמי',
        tiered: 'מדורג',
        free: 'חינם (ליד-מגנט)',
        unknown: 'לא ברור',
    }
    const lines = list.map((p, i) => {
        const price = p.priceIls != null ? `₪${p.priceIls}` : 'מחיר לא צוין'
        const model = modelLabels[p.priceModel] || p.priceModel
        const mark = p.isPrimary ? ' 🎯 **[מוצר כניסה — דרכו נכנסים ל-funnel]**' : ''
        return `${i + 1}. **${p.name}** — ${price} (${model})${mark} — ${p.description || 'ללא תיאור'}`
    })
    const funnel = (answers.productsFunnel || '').trim()
    const funnelLine = funnel
        ? `\n\n**הקשר בין המוצרים (מהמשתמש ישירות — חייב לכבד!):** ${funnel}`
        : ''
    return lines.join('\n') + funnelLine
}

// Hard-block rules that go at the bottom of every prompt — sayer/menateach
// occasionally produces "system status reports" instead of research, this is
// the last line of defense before the meta-leak validator catches it.
const RULES = `
★★★ חוקי-על — כשל אוטומטי אם תפר אותם ★★★

🚫 **אסור לקרוא קבצים מ-/home/openclaw/.openclaw/workspace/** — בפרט:
   MEMORY.md / HEARTBEAT.md / AGENTS.md / SOUL.md / CHANNELS.md / TOOLS.md
   /workspace/state/* / /workspace/brands/* / /workspace/content/*
   הם **לא חלק מהמשימה הזאת**. ההקשר היחיד שלך הוא ה-prompt הזה.

🚫 **אסור לדווח על מצב המערכת** — לא cron jobs, לא Telegram Chat ID,
   לא integrations מחוברות, לא plugins disabled, לא config warnings.
   זה לא market research. זו תמיכה טכנית — לא המשימה שלך.

🚫 **אסור להתחיל בתשובה מתאר** "מה אני יודע" / "מה אני רואה" / "Session
   חדש" / "נתחיל מחדש". התחל ישר עם התוצאה — מתחרים, keywords, וכו'.

חוקים תפעוליים:
- **מקסימום 6 חיפושים בסך הכל** — לאחר מכן עצור וכתוב את הדוח הסופי המלא.
- אל תדקלם מה אתה מתכנן לחפש — פשוט בצע את החיפוש או כתוב את הדוח.
- אחרי שאספת מספיק מידע, התשובה הבאה שלך חייבת להיות **הדוח המלא בפורמט שבוקש**, לא עוד חיפוש ולא עוד הערה.
- כתוב הכל כאן בתשובה — לא בקובץ
- בעברית בלבד (מונחים מקצועיים באנגלית מותרים)
- לכל עובדה — ציין מקור (URL, שם אתר, או שם מחקר)
- זו משימה חדשה לגמרי — לא ראית אותה קודם. אל תאמר "כבר עניתי" — ענה מחדש.`

// Tool hint helpers — pick the right tool description based on what's
// available on the VPS, so the prompt accurately reflects the agent's
// capabilities.
function searchToolHint(tools: PromptOpts['tools']): string {
    return tools.hasBrave
        ? `השתמש ב-brave_search MCP tool. בצע לפחות 5 חיפושים נפרדים בעברית ובאנגלית.`
        : `השתמש ב-web_search. בצע לפחות 5 חיפושים נפרדים.`
}
function crawlToolHint(tools: PromptOpts['tools']): string {
    return tools.hasFirecrawl
        ? `\nהשתמש ב-firecrawl MCP לסריקת אתרי מתחרים — בדוק pricing pages, about pages, features.`
        : ''
}
function dfsToolHint(tools: PromptOpts['tools']): string {
    return tools.hasDataforseo
        ? `השתמש ב-dataforseo MCP tool לנפחי חיפוש אמיתיים, difficulty, CPC.`
        : `הערך difficulty (low/medium/high) על סמך כמות תוצאות ואיכות התחרות ב-SERP.`
}

// ────────────────────────────────────────────────────────────────────────────
// competitor_landscape — Phase 3.5c rewrite with full methodology + DFS data
// ────────────────────────────────────────────────────────────────────────────
//
// Architecture: stage controller (manager) does DFS prefetch BEFORE calling
// this builder. We receive `dfsData: CompetitorLandscapeDfsData` with real
// competitor list, backlink profiles, anchor patterns, on-page audits, and
// our GMB profile if available. The agent never has to estimate — DFS data
// is rendered verbatim into the prompt as a factual section.
//
// Output is hybrid: a JSON code-block of `CompetitorRecord[]` + Hebrew
// markdown narrative sections (Topical Authority Venn, Why Now, Threat
// ranking, Recommended actions). Per-record confidence labeling required.

import type { CompetitorLandscapeDfsData, CompetitorEnrichment } from '@/controllers/hosting/research/stages/prefetch/competitor_landscape'

function renderCompetitorListTable(competitors: CompetitorLandscapeDfsData['competitors']): string {
    if (competitors.length === 0) return '*(לא זוהו מתחרים — ייתכן ש-domain שלכם חדש או לא הוגדר אתר)*'
    const top = competitors.slice(0, 50)
    const rows = top.map(c => {
        const orgCount = c.full_domain_metrics?.organic?.count ?? '—'
        return `| ${c.domain} | ${c.avg_position.toFixed(1)} | ${c.intersections} | ${orgCount} |`
    }).join('\n')
    return `| Domain | Avg position | Shared keywords | Organic count |\n|---|---|---|---|\n${rows}`
}

function renderEnrichmentTable(top: CompetitorEnrichment[]): string {
    if (top.length === 0) return '*(אין מתחרים מועשרים)*'
    return top.map(e => {
        const bls = e.backlinks
            ? `backlinks=${e.backlinks.backlinks}, ref_domains=${e.backlinks.referring_domains}, spam=${e.backlinks.backlinks_spam_score}`
            : '*(backlinks data unavailable — ' + e.enrichmentMissing.filter(m => m === 'backlinks_summary').join('') + ')*'
        const topAnchors = e.anchorPatterns?.slice(0, 5).map(a => `"${a.anchor}" (${a.referring_domains})`).join(', ') || '*(anchor data unavailable)*'
        const onPage = e.onPage
            ? `onpage_score=${e.onPage.onpage_score ?? '—'}, schema=${(e.onPage.schema?.map(s => s.type).join(',')) || 'none'}, plain_text_words=${e.onPage.meta?.content?.plain_text_word_count ?? '—'}, h1=${e.onPage.meta?.h1?.[0]?.substring(0, 60) ?? '—'}`
            : '*(on-page audit unavailable)*'
        return `### ${e.domain}
- **שיתופי keywords:** ${e.sharedKeywords} | **avg position:** ${e.avgPosition.toFixed(1)} | **organic_count:** ${e.organicCount ?? '—'}
- **Link profile (DFS backlinks/summary):** ${bls}
- **Top anchor texts (DFS backlinks/anchors):** ${topAnchors}
- **On-page (DFS on_page/instant_pages):** ${onPage}`
    }).join('\n\n')
}

function renderGmbBlock(gmb: CompetitorLandscapeDfsData['ourGmb']): string {
    if (!gmb) return '*(לא נמצא פרופיל Google Business עבור העסק — אם אתם עסק מקומי, זה red flag לטיפול מיידי)*'
    const rating = gmb.rating ? `${gmb.rating.value}/${gmb.rating.rating_max} (${gmb.rating.votes_count} reviews)` : 'אין rating'
    const cats = (gmb.categories || []).join(', ') || '—'
    return `- **Title:** ${gmb.title}
- **Address:** ${gmb.address || '—'}
- **Phone:** ${gmb.phone || '—'}
- **Categories:** ${cats}
- **Rating:** ${rating}
- **Claimed:** ${gmb.is_claimed ? 'Yes' : 'No / unknown'}`
}

export function buildCompetitorLandscapePrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)
    const userCompetitors = answers.competitors as string | undefined

    const dfs = opts.dfsData as CompetitorLandscapeDfsData | undefined
    if (!dfs) throw new Error('competitor_landscape: dfsData prefetch is required')

    const dfsAvailability = dfs.hasCompetitorData
        ? `**מקור הנתונים:** DataForSEO live data, ${new Date().toISOString().slice(0, 10)} | ${dfs.competitors.length} מתחרים | top ${dfs.topEnriched.length} מועשרים | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)`
        : `**זהירות:** לא נמצא domain להזרים DataForSEO competitorsDomain (websiteUrl ריק או לא תקין). הניתוח יסתמך על שם העסק וההקשר ב-prompt בלבד — סמנו את כל ה-records כ-confidence: working_hypothesis.`

    return {
        agentId: 'menateach',
        useDirectApi: true,  // we have real DFS data; no need for openclaw CLI MCP search
        minLength: 3000,
        prompt: `# ניתוח מתחרים מקיף — "${businessName}"

## תיאור העסק
${businessDesc}
${userCompetitors ? `\n**מתחרים שציין המשתמש:** ${userCompetitors}` : ''}
${prodBlk ? `\n## המוצרים/שירותים של ${businessName}\n${prodBlk}\n` : ''}
${haBlock}

## נתוני DataForSEO — להשתמש verbatim, אסור להמציא מספרים

${dfsAvailability}

### Top 50 domain-level competitors (DFS competitors_domain)
${renderCompetitorListTable(dfs.competitors)}

### Top 5 enriched — backlinks + anchors + on-page
${renderEnrichmentTable(dfs.topEnriched)}

### Our Google My Business profile
${renderGmbBlock(dfs.ourGmb)}

---

## פקודות עבודה

${INTENT_TAXONOMY}

${COMPETITOR_BUCKETING}

${COMPETITOR_ALWAYS_ON_SIGNALS}

${IL_SIGNALS_CHECKLIST}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown — 2-3 פסקאות)
תקצרו את הממצא המרכזי על המגרש התחרותי: מי האיומים האמיתיים? מה ה-route-to-win שלנו? מה ה-3 פעולות העיקריות?

### חלק 2: JSON records — competitors (חובה!)

\`\`\`json
{
  "records": [
    {
      "name": "שם המתחרה (Hebrew)",
      "url": "https://...",
      "bucket": "direct" | "substitute" | "adjacent" | "reference",
      "scorecard": {
        "serp_overlap": 0-100,
        "page_type_fit": 0-100,
        "authority_trust_proof": 0-100,
        "local_presence_quality": 0-100,
        "content_system_maturity": 0-100,
        "asset_linkability": 0-100
      },
      "topical_authority_venn": "איפה אנחנו חופפים בנושא ואיפה לא — 2-3 משפטים",
      "site_architecture_depth": "ניתוח עומק האתר — hub-and-spoke? silo? flat? פעולה מתבקשת",
      "link_profile_depth": "סיכום על בסיס ה-DFS backlinks data — referring_domains, anchor patterns, spam_score",
      "backlink_worthy_assets_inventory": ["calculator X", "research Y", "tool Z"],
      "eeat_signals": "Hebrew bylines? expert quotes? schema.author? G2/Trustpilot reviews?",
      "il_signals": {
        "language_coverage": "Hebrew-only / Hebrew+English / mixed / translated-from-en",
        "local_trust": "Hebrew reviews count + quality / GMB completeness / branches",
        "off_site_corroboration": "Geektime/Ynet/Calcalist mentions / industry associations",
        "consumer_reality": "service availability calendar / city zones / mobile readiness"
      },
      "content_gaps_at_competitor": ["topic A", "intent B", "format C"],
      "threats_to_us": ["מה המסוכן ביותר לנו עם השחקן הזה — 2-3 איומים קונקרטיים"],
      "confidence": "high" | "medium" | "working_hypothesis",
      "evidence": ["dfs_competitors_domain", "dfs_backlinks_summary", "dfs_on_page_audit", "dfs_gmb"],
      "generated_at": "ISO timestamp"
    }
  ],
  "confidence": "high" | "medium" | "working_hypothesis"
}
\`\`\`

**חובה:** הפיקו לפחות 5 records, בעדיפות top 5 מ-DFS enriched + 1-2 substitute/adjacent.
**כל record חייב evidence array עם DFS endpoints שספקו את הנתון.**
**אם backlinks data לא זמין למתחרה (enrichmentMissing מציין) — confidence ירד ל-working_hypothesis עם הסבר.**

### חלק 3: Topical Authority Venn (markdown)
איפה אנחנו חופפים עם המתחרים בנושא, ואיפה יש "אדמת הפקר" שאף אחד לא משחק עליה. 3-5 חפיפות + 3-5 white spaces.

### חלק 4: Why Now? — IL timing
3 גורמי timing ספציפיים ל-2026 ו-IL — כל אחד עם מקור (research / news / market data) ועם confidence inline marker.

### חלק 5: Threat Ranking
דירגו את המתחרים לפי איום על ה-route-to-win שלנו (לא לפי "מי הכי גדול"). הסבירו דירוג.

### חלק 6: Recommended Actions (top 5)
פעולות קונקרטיות בעקבות הניתוח. כל פעולה — owner + timeline + confidence inline marker.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// seo_keyword_research — Phase 3.5c rewrite with full methodology + DFS data
// ────────────────────────────────────────────────────────────────────────────
//
// Architecture: stage controller does the DFS prefetch (keyword_ideas 700,
// difficulty bulk top 100, SERP advanced top 10, ranked_keywords for our
// domain). This builder receives `dfsData: SeoKeywordResearchDfsData`
// and renders all of it as factual sections — no estimation by the agent.
//
// Output is hybrid: KeywordRecord[] JSON + Hebrew markdown (cluster map,
// striking-distance subset, AEO target subset, content gap analysis,
// recommended priority queue). Per-record opportunity score must be
// computed from the formula, not invented.

import type { SeoKeywordResearchDfsData } from '@/controllers/hosting/research/stages/prefetch/seo_keyword_research'

function renderKeywordIdeasTable(ideas: SeoKeywordResearchDfsData['ideas'], limit = 100): string {
    if (ideas.length === 0) return '*(לא הוחזרו keyword ideas)*'
    const top = [...ideas]
        .filter(k => typeof k.keyword_info?.search_volume === 'number')
        .sort((a, b) => (b.keyword_info?.search_volume || 0) - (a.keyword_info?.search_volume || 0))
        .slice(0, limit)
    const rows = top.map(k => {
        const ki = k.keyword_info
        const props = k.keyword_properties
        const intent = k.search_intent_info?.main_intent || '—'
        const kd = props?.keyword_difficulty ?? ki?.keyword_difficulty ?? '—'
        return `| ${k.keyword} | ${ki?.search_volume ?? '—'} | ${ki?.cpc?.toFixed(2) ?? '—'} | ${ki?.competition ?? '—'} | ${kd} | ${intent} |`
    }).join('\n')
    return `| Keyword | Volume | CPC (ILS) | Competition | KD | DFS-intent |\n|---|---|---|---|---|---|\n${rows}`
}

function renderDifficultyTable(difficulty: SeoKeywordResearchDfsData['difficulty'], limit = 50): string {
    if (difficulty.length === 0) return '*(bulk_keyword_difficulty unavailable)*'
    const rows = difficulty.slice(0, limit).map(d =>
        `| ${d.keyword} | ${d.keyword_difficulty ?? '—'} |`
    ).join('\n')
    return `| Keyword | Calibrated KD (0-100) |\n|---|---|\n${rows}`
}

function renderSerpSnapshots(snapshots: SeoKeywordResearchDfsData['serpSnapshots']): string {
    if (snapshots.length === 0) return '*(SERP snapshots unavailable)*'
    return snapshots.map(s => {
        const f = s.features
        const featureFlags = [
            f.has_ai_overview ? 'AIO' : null,
            f.has_people_also_ask ? 'PAA' : null,
            f.has_featured_snippet ? 'FS' : null,
            f.has_video_carousel ? 'Video' : null,
            f.has_image_pack ? 'Images' : null,
            f.has_local_pack ? 'LocalPack' : null,
            f.has_shopping_carousel ? 'Shopping' : null,
        ].filter(Boolean).join(' / ') || 'none'
        const top3 = f.organic_top_3.map((o, i) => `  ${i + 1}. **${o.domain}** — ${o.title.substring(0, 80)}\n     ${o.url}`).join('\n')
        const paa = f.paa_questions.length > 0
            ? `**PAA questions (${f.paa_questions.length}):** ${f.paa_questions.slice(0, 5).map(q => `"${q}"`).join(', ')}`
            : ''
        const aio = f.aio_cited_domains.length > 0
            ? `**AIO cites:** ${f.aio_cited_domains.slice(0, 5).join(', ')}`
            : ''
        return `### ${s.keyword}
- **SERP features present:** ${featureFlags}
- **Top 3 organic:**
${top3 || '  *(no organic results)*'}
${paa}
${aio}`
    }).join('\n\n')
}

function renderRankedKeywords(ranked: SeoKeywordResearchDfsData['rankedKeywords']): string {
    if (ranked.length === 0) return '*(לא נמצאו keywords שעבורם הדומיין שלכם מדורג, או שאין domain מוגדר)*'
    const rows = ranked.slice(0, 50).map(r => {
        const kw = r.keyword_data?.keyword
        const pos = r.ranked_serp_element?.serp_item?.rank_absolute
        const url = r.ranked_serp_element?.serp_item?.url
        const vol = r.keyword_data?.keyword_info?.search_volume
        const kd = r.keyword_data?.keyword_info?.keyword_difficulty ?? '—'
        const bucket = pos === undefined ? '—'
            : pos <= 8 ? 'fast_optimization (4-8)'
            : pos <= 15 ? 'content_upgrade (9-15)'
            : pos <= 20 ? 'rebuild_or_remap (16-20)'
            : `pos ${pos}`
        return `| ${kw ?? '—'} | ${pos ?? '—'} | ${bucket} | ${vol ?? '—'} | ${kd} | ${url ?? '—'} |`
    }).join('\n')
    return `| Keyword | Position | Striking bucket | Volume | KD | URL |\n|---|---|---|---|---|---|\n${rows}`
}

export function buildSeoKeywordResearchPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)

    const dfs = opts.dfsData as SeoKeywordResearchDfsData | undefined
    if (!dfs) throw new Error('seo_keyword_research: dfsData prefetch is required')

    const dfsAvailability = `**מקור הנתונים:** DataForSEO live data, ${new Date().toISOString().slice(0, 10)} | seeds: ${dfs.seeds.join(', ')} | language: ${dfs.languageCode} | location: IL | ideas=${dfs.ideas.length} difficulty=${dfs.difficulty.length} serp=${dfs.serpSnapshots.length} ranked=${dfs.rankedKeywords.length} | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)${dfs.enrichmentMissing.length ? ' | partial: ' + dfs.enrichmentMissing.join(', ') : ''}`

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 4000,
        prompt: `# מחקר מילות מפתח מקיף — "${businessName}"

## תיאור העסק
${businessDesc}
${prodBlk ? `\n## המוצרים/שירותים\n${prodBlk}\n` : ''}
${haBlock}

## נתוני DataForSEO — להשתמש verbatim, אסור להמציא volumes/CPC/KD

${dfsAvailability}

### Top 100 keyword ideas — DFS keyword_ideas (sorted by volume)
${renderKeywordIdeasTable(dfs.ideas, 100)}

${dfs.ideas.length > 100 ? `_(${dfs.ideas.length - 100} additional ideas available; not all rendered. Tail covers long-tail BOFU candidates.)_` : ''}

### Calibrated keyword difficulty — DFS bulk_keyword_difficulty (top 50)
${renderDifficultyTable(dfs.difficulty, 50)}

### SERP feature snapshots — DFS serp/google/organic/live/advanced (top 10 priority)
${renderSerpSnapshots(dfs.serpSnapshots)}

### Striking-distance scan — DFS ranked_keywords (our domain, position ≤ 50)
${renderRankedKeywords(dfs.rankedKeywords)}

---

## פקודות עבודה — methodology

${INTENT_TAXONOMY}

${OPPORTUNITY_SCORING}

${AEO_TARGET_SCORING}

${LANGUAGE_DECISION}

${SERP_FEATURE_RULES_HE}

${CLUSTER_ARCHITECTURE}

${PROGRAMMATIC_RULES}

${STRIKING_DISTANCE_RULE}

${CANNIBALIZATION_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown — 2-3 פסקאות)
תקצרו את ממצאי המחקר: כמה keywords עם opportunity ≥ 70? כמה AEO-priority subset? כמה striking-distance fast wins? מה ה-cluster המרכזי? איזה הזדמנות פתוחה הכי גדולה?

### חלק 2: JSON records — keywords (חובה!)

\`\`\`json
{
  "records": [
    {
      "keyword": "מילת המפתח (Hebrew או English)",
      "language": "he" | "en",
      "intent": {
        "primary": "navigational" | "brand_validation" | "info_broad" | "info_deep" | "commercial_eval" | "transactional" | "support",
        "locality": "none" | "city" | "region" | "near_me" | "branch",
        "urgency": "none" | "same_day" | "urgent",
        "trust_load": "low" | "medium" | "high" | "ymyl",
        "language_mode": "he" | "en" | "mixed" | "translit",
        "buyer_maturity": "first_time" | "switcher" | "expert",
        "jtbd": "JTBD statement במבנה הנדרש (overlay, לא peer-class!)"
      },
      "cluster": "שם cluster (pillar candidate או existing pillar)",
      "page_type": "pillar / info_deep_spoke / comparison_spoke / pricing_explainer / faq / trust_proof / local_page",
      "serp_features_present": ["ai_overview", "people_also_ask", "featured_snippet", "video_carousel", "image_pack", "local_pack", "shopping_carousel"],
      "volume_monthly": 0,
      "cpc_ils": 0.0,
      "difficulty_0_100": 0,
      "current_position": null,
      "striking_bucket": "fast_optimization" | "content_upgrade" | "rebuild_or_remap" | null,
      "opportunity": {
        "business_value": 0,
        "win_probability": 0,
        "qualified_demand": 0,
        "click_yield": 0,
        "aeo_fit": 0,
        "cluster_leverage": 0,
        "operational_ease": 0,
        "total": 0,
        "decision": "take_now" | "take_if_strategic" | "backlog" | "skip"
      },
      "aeo": {
        "synthesis_need": 0,
        "fact_density": 0,
        "follow_up_likelihood": 0,
        "entity_specificity": 0,
        "citation_value": 0,
        "total": 0,
        "is_priority": true | false
      },
      "hard_stops": ["one of: no_distinct_intent_page_type / cant_beat_serp_uniqueness / ymyl_without_expert_review / almost_only_zero_click / programmatic_thin_risk"],
      "recommended_action": "פעולה ממוקדת: ייצור pillar / spoke / refresh existing URL / programmatic candidate / drop",
      "owner": "SEO lead / content lead / dev / agency",
      "confidence": "high" | "medium" | "working_hypothesis",
      "evidence": ["dfs_keyword_ideas", "dfs_keyword_difficulty", "dfs_serp_advanced", "dfs_ranked_keywords"],
      "generated_at": "ISO timestamp"
    }
  ],
  "confidence": "high" | "medium" | "working_hypothesis"
}
\`\`\`

**חובה:**
- מינימום 30 records, מתוכם:
  - ≥ 10 with opportunity.decision = "take_now" (score ≥ 70)
  - ≥ 5 AEO-priority (aeo.is_priority = true, score ≥ 70)
  - ≥ 5 striking-distance (current_position 4-20)
- כל record חייב volume/CPC/KD מ-DFS verbatim — אם זה לא ב-DFS data, סמנו null + confidence: working_hypothesis
- Opportunity score חייב להיות חישוב לפי הנוסחה (0.25·BV + 0.20·WP + ...) — לא ניחוש
- AEO score לפי הנוסחה (0.30·SN + 0.25·FD + ...) — לא ניחוש
- intent.jtbd חייב להיות במבנה "כש[סיטואציה], אני רוצה [פעולה], על מנת ש[תוצאה], מבלי לסכן [downside]"

### חלק 3: Cluster Map (markdown)
מפת cluster — pillar candidates + spoke architecture per cluster (6-8 spokes, page-type lattice). Internal linking pattern. Cannibalization risks flagged.

### חלק 4: AEO-Priority Subset (markdown)
רשימת AEO targets (score ≥ 70) — איזה content treatment מקבלים, איזה schema markup חובה, איזה structured-data patterns.

### חלק 5: Striking-Distance Quick Wins (markdown)
פעולות מיידיות על positions 4-20 קיימות. סדרו לפי impact × ease.

### חלק 6: Programmatic SEO Opportunities (markdown — אם זוהו)
מועמדים ל-programmatic + 6 protection rules check. אם אף אחד לא עובר את 6 הכללים — אומרים זאת מפורשות.

### חלק 7: Real Content Gaps (markdown)
keywords שאף מתחרה לא מדורג עליהם בעוד שיש demand — top 5.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// audience_personas — Phase 3.5c rewrite with full methodology + DFS data
// ────────────────────────────────────────────────────────────────────────────
//
// JTBD-first persona builder. DFS contributes intent-classified keywords
// (queries-by-stage signal) + competitor Trustpilot reviews (review mining
// for trust hierarchy + objections + switching costs) + our GMB profile.
// Upstream stages (competitor_landscape + seo_keyword_research) provide
// the SERP/competitor context which the prompt also pulls via getStageContent.
//
// Output: PersonaRecord[] per methodology.ts schema — minimum 11 required
// fields including JTBD statement in mandated format, buying journey,
// trust hierarchy, pricing validation with method-used disclosure.

import type { AudiencePersonasDfsData } from '@/controllers/hosting/research/stages/prefetch/audience_personas'

function renderIntentKeywordsTable(items: AudiencePersonasDfsData['intentKeywords'], limit = 60): string {
    if (items.length === 0) return '*(intent keywords unavailable)*'
    const top = [...items]
        .filter(k => typeof k.keyword_info?.search_volume === 'number' && (k.keyword_info?.search_volume ?? 0) > 0)
        .sort((a, b) => (b.keyword_info?.search_volume || 0) - (a.keyword_info?.search_volume || 0))
        .slice(0, limit)
    const rows = top.map(k => {
        const ki = k.keyword_info
        const intent = k.search_intent_info?.main_intent || '—'
        const foreign = k.search_intent_info?.foreign_intent?.join(',') || '—'
        return `| ${k.keyword} | ${ki?.search_volume ?? '—'} | ${intent} | ${foreign} |`
    }).join('\n')
    return `| Keyword | Volume | Main intent | Foreign intent |\n|---|---|---|---|\n${rows}`
}

function renderCompetitorReviews(reviews: AudiencePersonasDfsData['competitorReviews']): string {
    if (reviews.length === 0) {
        return '*(אין Trustpilot reviews זמינים. ייתכן שהמתחרים לא רשומים שם — IL businesses לעיתים קרובות לא ב-Trustpilot. סמנו pricing/objection claims כ-working_hypothesis.)*'
    }
    return reviews.map(r => {
        if (r.reviews.length === 0) return `### ${r.domain}\n*(no reviews returned — domain not on Trustpilot)*`
        const positive = r.reviews.filter(rv => (rv.rating?.value ?? 0) >= 4).length
        const negative = r.reviews.filter(rv => (rv.rating?.value ?? 0) <= 2).length
        const samples = r.reviews.slice(0, 8).map((rv, i) => {
            const rating = rv.rating ? `${rv.rating.value}/${rv.rating.rating_max}` : '—'
            const text = (rv.text || '').substring(0, 200).replace(/\s+/g, ' ').trim()
            const title = (rv.title || '').substring(0, 80).trim()
            return `  ${i + 1}. **${rating}** — _"${title}"_ — ${text || '(no body)'}`
        }).join('\n')
        return `### ${r.domain}
- **Reviews returned:** ${r.reviews.length} | positive (4-5★): ${positive} | negative (1-2★): ${negative}
- **Sample (top 8 by recency):**
${samples}`
    }).join('\n\n')
}

function renderGmbForPersonas(gmb: AudiencePersonasDfsData['ourGmb']): string {
    if (!gmb) return '*(לא נמצא GMB — אם אתם עסק מקומי, חוסר GMB משפיע על trust hierarchy של הפרסונה).*'
    const rating = gmb.rating ? `${gmb.rating.value}/${gmb.rating.rating_max} (${gmb.rating.votes_count} reviews)` : 'no rating'
    return `- **Title:** ${gmb.title}
- **Rating:** ${rating}
- **Categories:** ${(gmb.categories || []).join(', ') || '—'}
- **Snippet:** ${(gmb.snippet || '').substring(0, 200) || '—'}`
}

export function buildAudiencePersonasPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)
    const targetAudience = answers.targetAudience as string | undefined
    const challenges = answers.challenges as string | undefined

    const dfs = opts.dfsData as AudiencePersonasDfsData | undefined
    if (!dfs) throw new Error('audience_personas: dfsData prefetch is required')

    const competitorContent = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 3500)
    const keywordsContent = (getStageContent(rd, 'seo_keyword_research') || '').substring(0, 3500)

    const dfsAvailability = `**מקור הנתונים:** DataForSEO live data, ${new Date().toISOString().slice(0, 10)} | intent_kw=${dfs.intentKeywords.length} competitor_reviews=${dfs.competitorReviews.length}/${dfs.competitorDomainsUsed.length} GMB=${dfs.ourGmb ? 'found' : 'none'} | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)${dfs.enrichmentMissing.length ? ' | partial: ' + dfs.enrichmentMissing.join(', ') : ''}`

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 3500,
        prompt: `# מחקר קהל יעד — JTBD personas + pricing validation עבור "${businessName}"

## תיאור העסק
${businessDesc}
${prodBlk ? `\n## המוצרים/שירותים\n${prodBlk}\n\n**חשוב לכל פרסונה:** איזה מוצר/ים מתאימים, באיזה סדר נכנסים ל-funnel, האם יש הבדלי WTP בין מוצרים.\n` : ''}
${targetAudience ? `\n**קהל יעד שצוין באונבורדינג:** ${targetAudience}` : ''}
${challenges ? `\n**אתגרים שצוינו:** ${challenges}` : ''}
${haBlock}

---

## תמצית שלבים קודמים (להשתמש כ-source-of-truth!)

### מתחרים (משלב competitor_landscape)
${competitorContent || '*(stage לא הורץ עדיין)*'}

### מילות מפתח (משלב seo_keyword_research)
${keywordsContent || '*(stage לא הורץ עדיין)*'}

---

## נתוני DataForSEO — לזיהוי intent + review mining

${dfsAvailability}

### Intent-classified keywords — DFS keyword_ideas with intent_info (top 60 by volume)
${renderIntentKeywordsTable(dfs.intentKeywords)}

### Competitor Trustpilot reviews — review mining לזיהוי trust hierarchy + objections + switching costs
${renderCompetitorReviews(dfs.competitorReviews)}

### Our Google My Business profile
${renderGmbForPersonas(dfs.ourGmb)}

---

## פקודות עבודה — methodology

${INTENT_TAXONOMY}

${PERSONA_JTBD_FORMAT}

${BUYING_JOURNEY_FORMAT}

${TRUST_HIERARCHY_METHOD}

${PRICING_VALIDATION_METHOD}

${LANGUAGE_DECISION}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown — 2-3 פסקאות)
תקצרו: כמה פרסונות זוהו? מי הסגמנט #1 לתקיפה ולמה? ה-3 כאבים החזקים ביותר? באיזה אופן trust_hierarchy שונה בין הפרסונות?

### חלק 2: JSON records — personas (חובה!)

\`\`\`json
{
  "records": [
    {
      "name": "שם פיקטיבי לפרסונה (Hebrew)",
      "segment_definition": "מי בדיוק נכנס לפרסונה — תפקיד / תחום / company size / IL geo",
      "jtbd_statement": {
        "situation": "כש[סיטואציה ספציפית]",
        "progress": "אני רוצה [פעולה / progress]",
        "outcome": "על מנת ש[תוצאה רצויה מדידה]",
        "risk": "מבלי לסכן [חרדה / עלות מעבר / חיסרון]"
      },
      "primary_triggers": ["מה מפעיל את החיפוש — 3-5 trigger events קונקרטיים"],
      "top_queries_by_stage": [
        { "stage": "awareness", "queries": ["query 1", "query 2"] },
        { "stage": "consideration", "queries": [...] },
        { "stage": "selection", "queries": [...] },
        { "stage": "conversion", "queries": [...] }
      ],
      "decision_criteria": ["3-7 קריטריונים סדורים בעדיפות — מה הכי חשוב לבחירה"],
      "trust_hierarchy": [
        { "source": "official_licensed_authority / peer_reviews / expert_endorsement / brand_familiarity / local_proof / price_transparency / case_evidence / usability_convenience", "weight": 0-100 }
      ],
      "objections_anxieties": [
        { "objection": "התנגדות / חרדה ספציפית", "rebuttal": "תגובה מבוססת מחקר" }
      ],
      "switching_cost": "מה מונע מהפרסונה לעבור מ-status quo — habit / data lock-in / contract / fear / משהו אחר",
      "preferred_proof": ["cases / reviews / licenses / comparison tables / price transparency — מה ישכנע"],
      "channels_and_behaviors": "איפה research קורה בפועל — SERP / Maps / IG / FB groups / WhatsApp / referrals / direct",
      "language_mode": "he" | "en" | "mixed",
      "pricing_validation": {
        "competitor_benchmark_range_ils": "₪X-Y (טווח + מקור — מ-Trustpilot reviews / pricing pages / public data)",
        "wtp_range_ils": "₪X-Y (טווח + ראיה — ציטוט / מחקר / pattern review-mining)",
        "price_sensitivity": "low" | "medium" | "high",
        "recommended_price_point_ils": "₪X-Y/חודש או חד-פעמי — לפי מודל מחיר",
        "method_used": ["competitor_pricing_benchmark", "review_mining", "vertical_priors"]
      },
      "confidence": "high" | "medium" | "working_hypothesis",
      "evidence": ["dfs_keyword_ideas_intent", "dfs_trustpilot_reviews:domain.com", "upstream_competitor_landscape", "answers.targetAudience"],
      "generated_at": "ISO timestamp"
    }
  ],
  "confidence": "high" | "medium" | "working_hypothesis"
}
\`\`\`

**חובה:**
- 2-3 פרסונות (לא 5+ — אם זוהו יותר, אחדו או חדדו)
- כל 11 השדות הנדרשים בכל record (segment_definition, jtbd_statement, primary_triggers, top_queries_by_stage, decision_criteria, trust_hierarchy, objections_anxieties, switching_cost, preferred_proof, channels_and_behaviors, language_mode)
- jtbd_statement חייב להיות במבנה 4 השדות (situation/progress/outcome/risk) — לא משפט אחד
- pricing_validation.method_used חייב לציין שיטה — אם המקור היחיד הוא review-mining + competitor benchmark (אין WTP interviews), confidence ל-pricing = working_hypothesis
- top_queries_by_stage חייב לכלול keywords מ-DFS intent_keywords רלוונטיים (לא להמציא)
- אם אין Trustpilot reviews לאף מתחרה — confidence על trust_hierarchy יורד ל-working_hypothesis עם הסבר

### חלק 3: Top Pain Points + ציטוטים (markdown)
6+ כאבים מרכזיים. לכל אחד — ציטוט מ-DFS Trustpilot reviews או מ-upstream stages או מ-answers.challenges. אם נשען על vertical priors — סמנו [confidence: השערה].

### חלק 4: איפה הקהל נמצא (markdown)
| פלטפורמה | קבוצות/ערוצים ספציפיים | גודל משוער | רלוונטיות |
|---|---|---|---|
(תיק מ-DFS / upstream / vertical priors. כל שורה — confidence inline.)

### חלק 5: Cross-sell / Upsell path${prodBlk ? '' : ' (אם רלוונטי)'}
${prodBlk ? 'איך המוצרים מחוברים בין הפרסונות? מי feeder של מי? (e.g. קורס → SaaS, חבילה משותפת)' : '— אם יש מוצר יחיד, דלגו על סקציה זו.'}

### חלק 6: Why Now? — לפרסונות אלו (markdown)
3 גורמי timing IL/2026 ספציפיים לפרסונות (לא לעסק) — מקור + confidence inline marker לכל אחד.

### חלק 7: סיכום הזדמנות השוק (markdown)
TAM גלובלי / TAM IL / SAM / SOM. כל מספר עם מקור + confidence inline marker. אם המספר extrapolated מ-public data ולא verified — סמנו [confidence: בינוני] לכל הפחות.

### חלק 8: סגמנט #1 לתקוף + 3 סיבות (markdown)
איזה פרסונה תוקפים ראשון ולמה. הקשר ל-First-Win-Channel criteria מ-strategy stage.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// positioning (NEW — was implicit in old stage 4)
// ────────────────────────────────────────────────────────────────────────────
//
// Why a separate stage: design doc moves positioning out of strategy_options
// so the user can review/edit positioning *before* generating the channel
// strategy, KPIs, budget. Single-shot strategy bundled positioning in a way
// that locked the user into one framing without a checkpoint.

export function buildPositioningPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const competitorContent = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 5000)
    const personasContent = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const tone = answers.tone as string | undefined

    return {
        agentId: 'menateach',
        useDirectApi: true, // analytical, no live web search needed
        minLength: 800,
        prompt: `# משימה: מיצוב + Brand Foundation עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.

## תיאור העסק
${businessDesc}
${tone ? `\n## טון רצוי\n${tone}` : ''}

## תמצית המתחרים (משלב competitor_landscape)
${competitorContent || 'לא זמין'}

## תמצית הפרסונות (משלב audience_personas)
${personasContent || 'לא זמין'}
${haBlock}
## הוראות
אתה brand strategist בכיר. בנה Brand Foundation שעונה על: **למה ${businessName}? למה דווקא הם? ולמה דווקא עכשיו?**

זה לא marketing fluff — כל החלטה צריכה להיגזר מהמתחרים והפרסונות שלמעלה.

## פורמט תשובה (חובה)

### Mission (משימה)
משפט אחד — **למה אנחנו קמים בבוקר**. לא "to be the leading X" — מה הבעיה שאנחנו פותרים בעולם?

### Positioning Statement
פורמט: **עבור [פרסונה] שמתמודדים עם [כאב], ${businessName} הוא [קטגוריה] שעוזר ל[תוצאה], בניגוד ל[מתחרה ראשי] שעושים [חולשה].**

### Value Propositions (3 בדיוק)
לכל אחת:
1. **[שם הצעת ערך]**
   - **למי:** [פרסונה ספציפית]
   - **התוצאה:** [מה הם מקבלים]
   - **למה אנחנו:** [למה לא מתחרה X]
   - **הוכחה:** [אם יש — נתון/ציטוט מהמחקר]

### Brand Archetype
1 ארכיטיפ ראשי + 1 משני (Hero / Sage / Rebel / Caregiver / Magician / וכו').
**למה דווקא אלה:** [קישור לפרסונות ולמתחרים]

### Voice & Tone
| מימד | מה כן | מה לא | דוגמה במשפט |
|---|---|---|---|
| פורמליות | ... | ... | "..." |
| הומור | ... | ... | "..." |
| אקטיביות | ... | ... | "..." |

### Brand Promise
משפט אחד שהמותג מתחייב אליו ללקוח. נמדד — לא "the best", אלא "אנחנו תמיד [מדיד]".

### Differentiation Map
| מתחרה ראשי | מה הם משדרים | מה אנחנו משדרים | ההבדל לפרסונה |
|---|---|---|---|
| [שם] | ... | ... | ... |
| [שם] | ... | ... | ... |
| [שם] | ... | ... | ... |
(לפחות 3 מתחרים מהמחקר)

### Anti-Positioning
מה ${businessName} **לא** רוצה להיות? אילו לקוחות לא רלוונטיים? באיזה ערוץ לא להופיע?
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// strategy_options (was stage 4)
// ────────────────────────────────────────────────────────────────────────────
//
// Reads competitor_landscape + seo_keyword_research + audience_personas +
// positioning. Pulls them through the reader to support legacy stage1..3
// during the migration window.

export function buildStrategyOptionsPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const s1 = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 5000)
    const s2 = (getStageContent(rd, 'seo_keyword_research') || '').substring(0, 5000)
    const s3 = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const positioning = (getStageContent(rd, 'positioning') || '').substring(0, 3000)
    const budget = answers.budget as string | undefined
    const marketingGoals = answers.marketingGoals as string | undefined

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 1500,
        prompt: `# משימה: ניתוח ערוצים ואסטרטגיה עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.
- אל תאמר "כבר עניתי" — ענה מחדש.

## תמצית מחקר — מתחרים
${s1 || 'לא זמין'}

## תמצית מחקר — מילות מפתח
${s2 || 'לא זמין'}

## תמצית מחקר — קהל יעד
${s3 || 'לא זמין'}

${positioning ? `## מיצוב + Brand Foundation\n${positioning}\n` : ''}
${budget ? `## תקציב\n${budget}` : ''}
${marketingGoals ? `## מטרות שיווק\n${marketingGoals}` : ''}
${haBlock}
## הוראות
אתה senior מרקטולוג עם 15 שנות ניסיון. נתח את הנתונים ובנה אסטרטגיית ערוצים:
1. **FIRST WIN CHANNEL** (הכי חשוב) — בחר ערוץ אחד + פעולה אחת + פרסונה אחת שיביאו את 5 הלקוחות הראשונים. פוקוס מוחלט.
2. **Competitive activity deep-dive לכל ערוץ** — מה המתחרים מפרסמים? מה ה-engagement שלהם? מה ה-hashtags/topics שעובדים?
3. **Cross-references חובה** — כל ערוץ קשור לפרסונה ספציפית + מילות מפתח ספציפיות מהשלבים הקודמים.
4. **תוכנית 30 ימים עם תאריכים ספציפיים** — לא "שבוע 1" אלא "יום 1-3"

## פורמט תשובה (חובה)

### 🎯 FIRST WIN CHANNEL — הערוץ #1 ל-5 הלקוחות הראשונים
**זה הכי חשוב. עונה על: "איפה להתמקד עכשיו?"**

- **ערוץ:** [שם]
- **למה דווקא זה:** [3 סיבות מתוך הנתונים]
- **פרסונה:** [שם + מאיפה מהשלב 3]
- **מילות מפתח:** [2-3 מהשלב 2]
- **פעולה אחת ספציפית:** [מה בדיוק לעשות היום, לא תיאוריה]
- **Expected outcome:** [5 לקוחות תוך X ימים]
- **למה לא ערוץ אחר עכשיו:** [פוקוס > splay]

### ערוצים נוספים (לפי עדיפות — אחרי שה-First Win עובד)

#### 2. [שם הערוץ] ⭐⭐⭐ קריטי
- **למה (על סמך המחקר):** [קשר ישיר לשלבים 1-3 עם ציטוטים]
- **פרסונה מרכזית:** [שם]
- **מילות מפתח:** [3 מהשלב 2]
- **🔍 Competitive Activity Deep-Dive:**
  | מתחרה | מה הם מפרסמים | תכיפות | Engagement | הזווית שלהם | מה חסר |
  |---|---|---|---|---|---|
  | [שם] | [דוגמה + URL] | [3/שבוע] | [לייקים/תגובות] | [זווית] | [הזדמנות] |
- **Content formula:** [אורך, תדירות, סוג פוסט]
- **תדירות:** [X פוסטים/שבוע]
- **עלות משוערת:** ₪[מספר] / חודש
- **ROI צפוי:** [מספרים מוחשיים: X leads, Y visits, Z conversions תוך 30/60/90 ימים]
(חזור ל-4 ערוצים נוספים)

#### ❌ מה לא לעשות עכשיו
| ערוץ | למה לא | מתי כן (חודש X) |
|---|---|---|

### פאנל שיווק — פרסונה #1
| שלב | ערוץ | פעולה ספציפית | Trigger/CTA | מדד |
|---|---|---|---|---|
| Awareness | ... | ... | ... | [מספר] |
| Consideration | ... | ... | ... | [מספר] |
| Conversion | ... | ... | ... | [מספר] |
| Retention | ... | ... | ... | [מספר] |

### תוכנית פעולה — 30 ימים (עם ימים ספציפיים)
#### ימים 1-3 — FIRST WIN SETUP
1. [פעולה — קונקרטית, ניתנת לביצוע היום]
2. ...
#### ימים 4-10
3. ...
#### ימים 11-20
4. ...
#### ימים 21-30
5. ...

### KPIs ל-90 ימים (שמרניים / ריאליים / אופטימיים)
| מדד | 30 יום — שמרני | 30 יום — ריאלי | 90 יום — ריאלי | 90 יום — אופטימי |
|---|---|---|---|---|
| ביקורים אורגניים | ... | ... | ... | ... |
| לידים | ... | ... | ... | ... |
| לקוחות משלמים | ... | ... | ... | ... |
| MRR | ₪... | ₪... | ₪... | ₪... |
| CAC | ₪... | ₪... | ₪... | ₪... |
| LTV:CAC ratio | ... | ... | ... | ... |

### Budget Allocation (לפי תקציב זמין)
| תקציב זמין | ערוץ #1 | ערוץ #2 | ערוץ #3 | רזרבה |
|---|---|---|---|---|
| ₪1,000/חודש | ₪... | ₪... | ₪... | ₪... |
| ₪3,000/חודש | ₪... | ₪... | ₪... | ₪... |
| ₪5,000/חודש | ₪... | ₪... | ₪... | ₪... |

### הסיכונים וההקלות (Risks & Mitigations)
| סיכון | הסתברות | אימפקט | הקלה |
|---|---|---|---|
| [סיכון] | נמוך/בינוני/גבוה | נמוך/בינוני/גבוה | [פעולה] |
(לפחות 3 סיכונים מרכזיים)

${feedbackLine}
${RULES}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// validation (was stage 5) — two modes: ai_sim (default) + real_interviews
// ────────────────────────────────────────────────────────────────────────────

export function buildValidationPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, rd, feedback } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    // validationMode passed via answers.validationMode (set by user toggle).
    const mode = (answers.validationMode as string | undefined) || 'ai_sim'

    const personasContent = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const strategyContent = (getStageContent(rd, 'strategy_options') || '').substring(0, 6000)
    // Split strategy across two summary slots to match legacy prompt structure.
    const strategyHalf1 = strategyContent.substring(0, 3000)
    const strategyHalf2 = strategyContent.substring(3000)

    if (mode === 'real_interviews') {
        return {
            agentId: 'menateach',
            useDirectApi: true,
            minLength: 1200,
            prompt: `# משימה: סקריפט לראיונות אמת — Mom Test Style

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.

## תמצית המחקר
### פרסונות
${personasContent || 'לא זמין'}

### אסטרטגיה
${strategyHalf1}
${strategyHalf2}

## הוראות
הכן סקריפט לראיון customer discovery של 20 דקות ל-5 לקוחות פוטנציאליים, לפי עקרונות "The Mom Test":
- שאלות על **עבר** (מה כבר עשו), לא עתיד (מה יעשו)
- שאלות על **התנהגות**, לא על דעות
- אל תזכיר את המוצר של ${businessName} מוקדם מדי

## פורמט תשובה
### מי לראיין (קהל יעד)
- **פרסונה #1:** [שם + איפה למצוא אותם + איך לפנות]

### הסקריפט (20 דקות)
#### פתיחה (2 דקות)
"[טקסט מדויק בעברית]"

#### חלק 1: הבנת ההקשר (5 דקות)
1. **שאלה:** "[שאלה ממוקדת עבר]"
   - למה השאלה: [מה אנחנו מוצאים]
   - red flag: [מה לא לעשות]
2. ...

#### חלק 2: כאבים ופתרונות נוכחיים (7 דקות)
3. ...

#### חלק 3: אימות ההזדמנות (5 דקות)
5. ...

#### סגירה (1 דקה)
"[טקסט]"

### מה לחפש בתשובות
| סיגנל חיובי | סיגנל שלילי | משמעות |
|---|---|---|
| [ציטוט לדוגמה] | [ציטוט לדוגמה] | [מה עושים] |

### איך לנתח אחרי 5 ראיונות
1. **אימות כאב:** X מתוך 5 הזכירו [הכאב] ← [אמת / להמשיך לבדוק]
2. **WTP:** ממוצע X שילמו/משלמים ₪Y על פתרונות דומים
3. **סגמנט:** איזה פרסונה הגיבה הכי חזק

### Template לתיעוד (Google Sheet מבנה)
| ראיון # | שם/תפקיד | כאב #1 | כאב #2 | משלם היום על | WTP עבור פתרון | סיגנלים חיוביים | תגובה למוצר |
|---|---|---|---|---|---|---|---|

### Confidence Threshold
- **60%+ מהראיונות מאמתים את הכאב** → האסטרטגיה מאומתת, המשך
- **30-60%** → לבדוק שוב את הפרסונה, ייתכן שהגדרת קהל שגויה
- **<30%** → חזור לשלבים 1-3 עם pivot
${feedbackLine}`,
        }
    }

    // Default: AI-simulated validation
    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 1500,
        prompt: `# משימה: AI-Simulated Customer Validation עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.
- אתה משחק תפקיד של **3 פרסונות שונות** ועונה בשם כל אחת.

## תמצית המחקר
### פרסונות
${personasContent || 'לא זמין'}

### אסטרטגיה
${strategyHalf1}
${strategyHalf2}

## הוראות
דמה 3 ראיונות customer discovery. לכל פרסונה (מהשלב 3):
1. **היכנס לתפקיד** — חשוב כמו הפרסונה, לא כמו AI
2. ענה על 10 שאלות validation — ביקורתית, אמיתית, לא "כן כן כן"
3. **50% מהתשובות צריכות להיות קריטיות** — אחרת זה לא validation

אחרי 3 ראיונות — Cross-Validation Matrix: מה **אומת**, מה **נפל**, מה **לא ברור**.

## פורמט תשובה

### ראיון 1: פרסונה [שם]

**פרופיל:** [תמצית פרסונה — גיל, תפקיד, כאבים]

**Q1: ספר לי על [הכאב הראשי] — איך זה נראה בפועל אצלך?**
*[תשובה כפרסונה — ציטוט בגוף ראשון, 2-3 משפטים אמיתיים]*

**Q2: מה ניסית לעשות כדי לפתור את זה עד היום?**
*[תשובה]*

**Q3: כמה שילמת על פתרונות קודמים? מה הרגיז אותך בהם?**
*[תשובה עם מספרים]*

**Q4: ${businessName} מציע [הצעת ערך]. מה התגובה הראשונית שלך? (כולל ביקורת!)**
*[תשובה ביקורתית]*

**Q5: מה לא ברור? מה מעורר חשד?**
*[תשובה]*

**Q6: איך תשווה בין ${businessName} ל-[מתחרה מהשלב 1]?**
*[תשובה]*

**Q7: במחיר של ₪X/חודש — התשובה שלך: (בחר: אקנה מיד / אשקול / יקר מדי)?**
*[תשובה עם הסבר]*

**Q8: מה יגרום לך לומר "לא" סופית?**
*[תשובה]*

**Q9: איפה חיפשת פתרון כזה — מה היו מילות המפתח?**
*[תשובה — אמיתית לפרסונה]*

**Q10: מי עוד היית מתייעץ לפני הרכישה?**
*[תשובה]*

**🔴 Red Flags שעלו:** [מה הפרסונה חשפה שמעורר דאגה]
**🟢 Green Flags:** [מה חיזק את ההשערה]

(חזור ל-ראיון 2 ו-3 עם 2 הפרסונות האחרות)

### Cross-Validation Matrix
| השערה (מהאסטרטגיה) | פרסונה 1 | פרסונה 2 | פרסונה 3 | Status |
|---|---|---|---|---|
| הכאב X הוא הכאב #1 | ✅/❌/🟡 | ... | ... | ✅ מאומת / ❌ נפל / 🟡 לא ברור |
| WTP של ₪X/חודש ריאלי | ... | ... | ... | ... |
| הערוץ Y הוא המתאים | ... | ... | ... | ... |
| הצעת הערך "Z" משכנעת | ... | ... | ... | ... |
| הפרסונה Φ היא הסגמנט #1 | ... | ... | ... | ... |
(לפחות 7 השערות)

### Confidence Score
- **השערות מאומתות:** X מתוך Y = Z%
- **Score כללי:** [0-100]
- **המלצה:**
  - 80+ → המשך לאסטרטגיה
  - 60-80 → pivot קטן — עדכן [מה]
  - <60 → חזור למחקר — [איזה שלב]

### Top 3 Blindspots שהתגלו
1. **[Blindspot]** — [איך התגלה + מה לעשות]
2. ...
3. ...

### המלצות אקשן מידיות
1. **[פעולה קונקרטית]** — על סמך [ממצא]
2. ...
3. ...
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatch helper — used by per-stage controllers to get prompt by id.
// New prompts (aeo_visibility, social_landscape, email_competitor_audit)
// belong here when they ship (Phase 4).
// ────────────────────────────────────────────────────────────────────────────

export function buildPromptForStage(stageId: StageId, opts: PromptOpts): PromptResult | null {
    switch (stageId) {
        case 'competitor_landscape':   return buildCompetitorLandscapePrompt(opts)
        case 'seo_keyword_research':   return buildSeoKeywordResearchPrompt(opts)
        case 'audience_personas':      return buildAudiencePersonasPrompt(opts)
        case 'positioning':            return buildPositioningPrompt(opts)
        case 'strategy_options':       return buildStrategyOptionsPrompt(opts)
        case 'validation':             return buildValidationPrompt(opts)
        // Phase 4 stages (live integrations) + intent wrappers handle their
        // own prompt construction inside their per-stage controller.
        default: return null
    }
}