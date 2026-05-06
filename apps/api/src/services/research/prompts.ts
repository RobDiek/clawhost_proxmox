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
    POSITIONING_STACK_HE,
    FIRST_WIN_CHANNEL_RULES,
    REALISM_CHECK,
    CONFIDENCE_INTEGRITY_RULE,
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

function renderOurLinksBlock(ours: CompetitorLandscapeDfsData['ourLinks']): string {
    if (!ours) return '*(no link data)*'
    if (ours.enrichmentMissing.includes('no_domain_configured')) return '*(אין דומיין מוגדר)*'

    const sum = ours.summary
    const summaryLine = sum
        ? `**Profile:** backlinks=${sum.backlinks} · referring_domains=${sum.referring_domains} · referring_main=${sum.referring_main_domains} · spam_score=${sum.backlinks_spam_score} · rank=${sum.rank}`
        : '*(our backlinks summary unavailable — ' + ours.enrichmentMissing.filter(m => m === 'our_backlinks_summary').join('') + ')*'

    const topAnchors = ours.anchorPatterns?.slice(0, 10).map(a => `"${a.anchor}" (${a.referring_domains}rd)`).join(', ') || '*(anchor data unavailable)*'

    const refTotal = ours.referringDomains?.length || 0
    const refLost = ours.referringDomains?.filter(r => r.is_lost).length || 0
    const refLine = refTotal > 0
        ? `**Referring domains (top 100):** active=${refTotal - refLost} · lost=${refLost} · top 5 by rank: ${ours.referringDomains?.filter(r => !r.is_lost).slice(0, 5).map(r => r.domain + '(rank ' + r.rank + ')').join(', ') || '—'}`
        : '*(referring domains data unavailable)*'

    const lostList = ours.referringDomains?.filter(r => r.is_lost).slice(0, 8).map(r => r.domain + (r.lost_date ? ` (lost: ${r.lost_date.substring(0, 10)})` : '')).join(', ') || ''
    const lostLine = refLost > 0 ? `**Lost links (top 8 by recency):** ${lostList}` : ''

    const gapTotal = ours.linkGapCandidates?.length || 0
    const gapLine = gapTotal > 0
        ? `**Link-gap candidates (domains linking to competitors but NOT to us, top ${Math.min(gapTotal, 10)}):**\n` +
          ours.linkGapCandidates!.slice(0, 10).map(g => `- ${g.target} (rank ${g.rank}, ${g.referring_domains}rd, intersects ${g.intersections} of our competitors)`).join('\n')
        : '*(link-gap analysis unavailable — possibly Backlinks API not activated)*'

    return `${summaryLine}

**Top anchor texts (DFS backlinks/anchors):** ${topAnchors}

${refLine}
${lostLine ? '\n' + lostLine : ''}

${gapLine}`
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

### Our own link profile + link-gap analysis (Phase 3.10b)
${renderOurLinksBlock(dfs.ourLinks)}

### Our Google My Business profile
${renderGmbBlock(dfs.ourGmb)}

---

## פקודות עבודה

${INTENT_TAXONOMY}

${COMPETITOR_BUCKETING}

${COMPETITOR_ALWAYS_ON_SIGNALS}

${IL_SIGNALS_CHECKLIST}

${CONFIDENCE_INTEGRITY_RULE}

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
  "our_link_profile": {
    "_note": "סיכום של DFS backlinks data על הדומיין שלנו (storage-station / השם שלכם), לא של המתחרים. אם enrichmentMissing מציין — confidence: working_hypothesis.",
    "backlinks_total": 0,
    "referring_domains_total": 0,
    "spam_score": 0,
    "rank": 0,
    "anchor_distribution_top5": [
      { "anchor": "טקסט", "share_pct": 0, "referring_domains": 0 }
    ],
    "lost_links_top5": [
      { "domain": "...", "lost_date": "YYYY-MM-DD", "rank": 0, "recovery_priority": "high | medium | low" }
    ],
    "vs_competitors_summary": "1-2 משפטים: איפה אנחנו עומדים מבחינת link authority מול ה-top 5 מתחרים — זמין fewer/similar/more referring domains, anchor mix נקי/spammy, וכו׳",
    "confidence": "high | medium | working_hypothesis"
  },
  "link_gap_targets": [
    {
      "domain": "domain.com",
      "current_rank": 0,
      "intersects_n_competitors": 0,
      "outreach_angle": "1 משפט: למה הם ירצו לקשר אלינו (relevance, exchange, mention)",
      "priority": "high | medium | low",
      "_note": "מ-DFS backlinks/competitors. סדר לפי intersects (קונקרציה גבוהה עם המתחרים שלנו = יחס יותר רלוונטי) × rank של ה-domain."
    }
  ],
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:** הפיקו לפחות 5 records של מתחרים, בעדיפות top 5 מ-DFS enriched + 1-2 substitute/adjacent.
**כל record חייב evidence array עם DFS endpoints שספקו את הנתון.**
**אם backlinks data לא זמין למתחרה (enrichmentMissing מציין) — confidence ירד ל-working_hypothesis עם הסבר.**
**\`our_link_profile\` ו-\`link_gap_targets\` חובה** — מבוססים על Phase 3.10b backlinks suite. אם הסעיף לא זמין (אין Backlinks API subscription, enrichmentMissing מציין 'no_backlinks_data') — סמנו את שתי המקטעים כ-confidence: working_hypothesis עם הסבר.
**link_gap_targets:** מינימום 5, אם יש data. סדר לפי priority (high → low) + intersects count.

### חלק 3: Topical Authority Venn (markdown)
איפה אנחנו חופפים עם המתחרים בנושא, ואיפה יש "אדמת הפקר" שאף אחד לא משחק עליה. 3-5 חפיפות + 3-5 white spaces.

### חלק 4: Link Profile vs Competitors (markdown — Phase 3.10b)
ניתוח השוואתי ב-2-3 פסקאות:
- איפה אנחנו עומדים מבחינת backlinks total + referring domains total מול avg של top 5 competitors?
- האם ה-anchor mix שלנו cleaner/spammier מאשר אצלם?
- כמה lost links ניתן להחזיר (top 3 priorities)?
- 5 link-gap candidates עם outreach angle לכל אחד.

### חלק 5: Why Now? — IL timing
3 גורמי timing ספציפיים ל-2026 ו-IL — כל אחד עם מקור (research / news / market data) ועם confidence inline marker.

### חלק 6: Threat Ranking
דירגו את המתחרים לפי איום על ה-route-to-win שלנו (לא לפי "מי הכי גדול"). הסבירו דירוג.

### חלק 7: Recommended Actions (top 5)
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

${CONFIDENCE_INTEGRITY_RULE}

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
- **מינימום 15 records** (Hebrew/IL niches לעיתים מצומצמים — 30 לא תמיד ריאליסטי). מתוכם:
  - ≥ 5 with opportunity.decision = "take_now" (score ≥ 70)
  - ≥ 3 AEO-priority (aeo.is_priority = true, score ≥ 70)
  - ≥ 3 striking-distance (current_position 4-20, אם יש GSC/ranked_keywords data)
- כל record חייב volume/CPC/KD מ-DFS verbatim — אם זה לא ב-DFS data, סמנו null + **confidence: working_hypothesis** (חוק קשיח, לא ברירת מחדל).
- **Opportunity score** חישוב **לפי הנוסחה המדויקת** (0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE) — אסור משקלים שווים, אסור ממוצע. **\`opportunity._formula_verification\` חובה** עם החישוב המילולי.
- **AEO score** לפי הנוסחה (0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV) — אסור משקלים שווים. **\`aeo._formula_verification\` חובה**.
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

${CONFIDENCE_INTEGRITY_RULE}

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
    const competitorContent = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 4500)
    const personasContent = (getStageContent(rd, 'audience_personas') || '').substring(0, 4500)
    const tone = answers.tone as string | undefined

    // Pull structured competitor records when available — gives us
    // canonical names + buckets to reference in the differentiation map
    // instead of relying on the agent to re-extract from the markdown.
    const compResult = rd.results?.competitor_landscape
    const compRecords = (compResult as { records?: Array<{ name: string; bucket: string; threats_to_us?: string[] }> } | undefined)?.records || []
    const directCompetitorsList = compRecords
        .filter(r => r.bucket === 'direct' || r.bucket === 'substitute')
        .slice(0, 5)
        .map(r => `- ${r.name}${r.threats_to_us?.[0] ? ` (איום עיקרי: ${r.threats_to_us[0].substring(0, 100)})` : ''}`)
        .join('\n')

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 2000,
        prompt: `# מיצוב + Brand Foundation — "${businessName}"

## תיאור העסק
${businessDesc}
${tone ? `\n## טון רצוי שצוין באונבורדינג\n${tone}` : ''}
${haBlock}

---

## תמצית שלבים קודמים — חובה לבסס עליהם החלטות

### תמצית מתחרים (משלב competitor_landscape)
${competitorContent || '*(stage לא הורץ)*'}

${directCompetitorsList ? `**מתחרים ישירים מובנים (לטבלת differentiation):**\n${directCompetitorsList}` : ''}

### תמצית פרסונות (משלב audience_personas)
${personasContent || '*(stage לא הורץ)*'}

---

## פקודות עבודה

אתם brand strategist בכיר. בנו Brand Foundation שעונה על: **למה ${businessName}? למה דווקא הם? ולמה דווקא עכשיו?**

זה לא marketing fluff — כל החלטה צריכה להיגזר מהמתחרים והפרסונות שלמעלה. אם הבסיס לא קיים בנתונים, סמנו אותו כ-working_hypothesis במקום להמציא.

${POSITIONING_STACK_HE}

${LANGUAGE_DECISION}

${CONFIDENCE_INTEGRITY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown — 2-3 פסקאות)
מהי ה-positioning ב-3 משפטים? מי הפרסונה הראשית? מה הוא ה-anti-positioning הברור (מה אנחנו לא)? מה ה-differentiation החזק ביותר מול המתחרה הכי מסוכן?

### חלק 2: JSON record — positioning (חובה!)

\`\`\`json
{
  "records": [
    {
      "mission": "משפט אחד: למה אנחנו קמים בבוקר. הבעיה שאנחנו פותרים בעולם — לא 'to be the leading X' מנופח.",
      "positioning_statement": "עבור [פרסונה ספציפית מ-audience_personas] שמתמודדים עם [כאב מ-personas.objections_anxieties], ${businessName} הוא [קטגוריה] שעוזר ל[outcome מ-jtbd_statement.outcome], בניגוד ל[שם מתחרה ישיר] שעושים [חולשה ספציפית מ-competitor_landscape.threats_to_us].",
      "value_props": [
        {
          "name": "שם הצעת הערך",
          "for_persona": "שם הפרסונה (חייב להתאים ל-personas.records[].name)",
          "outcome": "מה הם מקבלים בפועל — מדיד אם אפשר",
          "why_us": "למה לא מתחרה X — קישור ל-competitor_landscape.records[].threats_to_us",
          "proof": "ציטוט / נתון / מקרה מהמחקר. אם אין — סמנו 'דורש validation' ו-confidence: working_hypothesis"
        }
      ],
      "brand_archetype": {
        "primary": "Hero | Sage | Rebel | Caregiver | Magician | Creator | Lover | Jester | Innocent | Explorer | Outlaw | Ruler",
        "secondary": "ארכיטיפ משני",
        "rationale": "למה דווקא אלה — קישור לפרסונות ולמתחרים, 2-3 משפטים"
      },
      "voice_tone": [
        { "dimension": "פורמליות", "do": "...", "dont": "...", "example_sentence": "..." },
        { "dimension": "הומור", "do": "...", "dont": "...", "example_sentence": "..." },
        { "dimension": "אקטיביות (proactive vs reactive)", "do": "...", "dont": "...", "example_sentence": "..." },
        { "dimension": "אמפתיה", "do": "...", "dont": "...", "example_sentence": "..." }
      ],
      "brand_promise": "משפט אחד מדיד שהמותג מתחייב אליו. לא 'the best' — אלא 'אנחנו תמיד [מדיד]: [תכונה ניתנת למדידה]'.",
      "differentiation_map": [
        {
          "competitor_name": "שם מתחרה ישיר מ-competitor_landscape",
          "they_signal": "מה הם משדרים (positioning שלהם, מ-competitor_landscape.records[].topical_authority_venn או narrative)",
          "we_signal": "מה אנחנו משדרים — בקצרה, 1 משפט",
          "diff_for_persona": "ההבדל מבחינת הפרסונה הראשית — 1 משפט"
        }
      ],
      "anti_positioning": {
        "not_for": ["סוגי לקוחות שאנחנו לא רוצים — 2-3 קטגוריות"],
        "not_doing": ["שירותים/מוצרים שלא נציע — 2-3 דברים"],
        "not_channels": ["ערוצים שלא נופיע בהם — עם הסבר קצר"]
      },
      "language_mode": "he | en | mixed",
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["upstream_competitor_landscape", "upstream_audience_personas", "answers.tone"],
      "generated_at": "ISO timestamp"
    }
  ],
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- בדיוק 1 record (זה positioning של עסק אחד, לא של פרסונות).
- value_props חייב להכיל **בדיוק 3** הצעות ערך, לא יותר ולא פחות.
- differentiation_map חייב לכלול **לפחות 3 מתחרים ישירים** מ-competitor_landscape.records (bucket=direct או substitute).
- voice_tone חייב לכלול את 4 המימדים שלמעלה — אסור להוסיף או להסיר.
- positioning_statement במבנה הקבוע לעיל. אסור לחרוג מ-"עבור X שמתמודדים עם Y, [biznes] הוא [קטגוריה]..."
- mission במשפט אחד, לא יותר — מנופחות = working_hypothesis.
- אם פרסונה מסוימת לא קיימת ב-audience_personas.records — אסור להמציא, השתמשו בקיימות.
- confidence לכל value_prop: 'high' רק אם יש proof מהמחקר. אם הוכחה היא 'common sense' או 'industry pattern' → working_hypothesis.

### חלק 3: Why Now? — Brand Timing (markdown)
3-5 גורמים ב-2026 ו-IL שמיישרים specifically את ${businessName} למומנט הזה. כל גורם — מקור (research / news / market signal) + confidence inline marker.

### חלק 4: Brand Story Arc (markdown — קצר)
StoryBrand-style: מי הגיבור (פרסונה), מה הקונפליקט (כאב הראשי), מי המדריך (${businessName}), מה התוכנית (3 צעדים), קריאה לפעולה, מה ייקרה אם יפעלו, מה ייקרה אם לא.
**חשוב:** רק 1 פסקה. זה layer מסר, לא ה-strategic core. אסור להפוך את ה-positioning כולו ל-StoryBrand.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
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
        minLength: 4500,
        prompt: `# אופציות אסטרטגיה — "${businessName}"

## תקציר נתונים מאסטרים קודמים

### תמצית competitor_landscape
${s1 || '*(stage לא הורץ)*'}

### תמצית seo_keyword_research
${s2 || '*(stage לא הורץ)*'}

### תמצית audience_personas
${s3 || '*(stage לא הורץ)*'}

### תמצית positioning
${positioning || '*(stage לא הורץ — אסטרטגיה ללא positioning תהיה weak)*'}

${budget ? `## תקציב חודשי שצוין באונבורדינג\n${budget}` : ''}
${marketingGoals ? `## מטרות שיווק שצוינו\n${marketingGoals}` : ''}
${haBlock}

---

## פקודות עבודה — methodology

אתם senior מרקטולוג עם 15 שנות ניסיון. צרו **שתי אופציות אסטרטגיה מלאות** מבוססות על הנתונים שלמעלה:
- **Smart** (low-comp / lean budget) — תקיפת long-tail + striking distance + AEO targets. קצר ל-90 ימים מעבר לציון proof.
- **All-In** (head terms / aggressive) — תקיפת keywords תחרותיים + paid acceleration. דורש budget גבוה + 6-9 חודשים timeline.

לכל option — חובה לעבור את 3 ה-must-pass tests של First-Win Channel + לחשב KPIs עם נוסחת Realism Forecast (3 תרחישים).

${INTENT_TAXONOMY}

${OPPORTUNITY_SCORING}

${COMPETITOR_BUCKETING}

${POSITIONING_STACK_HE}

${FIRST_WIN_CHANNEL_RULES}

${REALISM_CHECK}

${CONFIDENCE_INTEGRITY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown — 2-3 פסקאות)
מסכמים את 2 ה-options ב-3 משפטים כל אחד. מציגים המלצה: איזה option מומלץ ב-default ולמה (תוך הסבר tradeoff).

### חלק 2: JSON records — strategy options (חובה!)

\`\`\`json
{
  "records": [
    {
      "scenario": "smart",
      "scenario_label_he": "Smart — תוקפים long-tail + striking distance + AEO",
      "first_win_channel": {
        "channel": "שם הערוץ — קריטי לדיוק",
        "primary_persona": "שם פרסונה (חייב להתאים ל-personas.records[].name)",
        "primary_keywords": ["3 keywords מ-seo_keyword_research.records[] עם striking_bucket=fast_optimization או opportunity.decision=take_now"],
        "specific_action": "פעולה אחת קונקרטית להיום — לא תיאוריה",
        "expected_first_5_customers_days": 30,
        "must_pass_tests": {
          "time_to_first_proof_le_45_days": true,
          "reachable_buyer_without_heavy_infra": true,
          "high_learning_density": true,
          "rationale": "1-2 משפטים: למה כל מבחן עובר"
        },
        "why_not_other_channel": "פוקוס > splay — 1-2 משפטים על ה-tradeoff"
      },
      "channel_priority_list": [
        {
          "rank": 2,
          "channel": "שם הערוץ",
          "priority_marker": "critical | important | secondary",
          "linked_persona": "שם פרסונה מ-personas",
          "linked_keywords": ["1-3 מ-seo_keyword_research"],
          "linked_competitors": ["מתחרים מ-competitor_landscape שמשחקים בערוץ הזה"],
          "content_formula": "אורך / תדירות / סוג פוסט",
          "monthly_cost_ils": 0,
          "expected_30_60_90_outcomes": {
            "30d": "X leads / Y visits / Z conversions",
            "60d": "...",
            "90d": "..."
          }
        }
      ],
      "do_not_channels": [
        { "channel": "שם", "why_not_now": "1 משפט", "when_yes_month": 4 }
      ],
      "funnel_for_primary_persona": [
        { "stage": "awareness", "channel": "...", "action": "...", "trigger_or_cta": "...", "metric": "0" },
        { "stage": "consideration", "channel": "...", "action": "...", "trigger_or_cta": "...", "metric": "0" },
        { "stage": "selection", "channel": "...", "action": "...", "trigger_or_cta": "...", "metric": "0" },
        { "stage": "conversion", "channel": "...", "action": "...", "trigger_or_cta": "...", "metric": "0" },
        { "stage": "retention", "channel": "...", "action": "...", "trigger_or_cta": "...", "metric": "0" }
      ],
      "30_day_plan": [
        { "day_range": "1-3", "label": "FIRST WIN SETUP", "actions": ["1 פעולה קונקרטית", "פעולה 2"] },
        { "day_range": "4-10", "label": "...", "actions": [] },
        { "day_range": "11-20", "label": "...", "actions": [] },
        { "day_range": "21-30", "label": "...", "actions": [] }
      ],
      "kpis_90_day": {
        "_formula_note": "KPI computed via Realism Forecast: addressable_clicks × ctr_gain × cvr × lead_quality × close_rate × haircuts",
        "metrics": [
          {
            "name": "ביקורים אורגניים | לידים | לקוחות משלמים | MRR | CAC | LTV:CAC",
            "unit": "visits | leads | customers | ils | ils | ratio",
            "scenarios_30d": { "conservative": 0, "base": 0, "upside": 0 },
            "scenarios_90d": { "conservative": 0, "base": 0, "upside": 0 },
            "haircut_applied": "1.0 = no haircut; <1.0 = applied"
          }
        ],
        "realism_checklist_passed": {
          "baseline_exists": true,
          "comparable_cohort_available": true,
          "page_type_precedent_known": true,
          "no_impressions_vs_addressable_traffic_confusion": true,
          "zero_click_attrition_accounted": true,
          "no_unrealistic_cvr": true,
          "matches_team_bandwidth": true
        }
      },
      "budget_allocation_ils": [
        { "monthly_budget_ils": 1000, "channel_1_ils": 0, "channel_2_ils": 0, "channel_3_ils": 0, "reserve_ils": 0 },
        { "monthly_budget_ils": 3000, "channel_1_ils": 0, "channel_2_ils": 0, "channel_3_ils": 0, "reserve_ils": 0 },
        { "monthly_budget_ils": 5000, "channel_1_ils": 0, "channel_2_ils": 0, "channel_3_ils": 0, "reserve_ils": 0 }
      ],
      "risks_mitigations": [
        { "risk": "1 שורה", "probability": "low | medium | high", "impact": "low | medium | high", "mitigation": "1 שורה — פעולה קונקרטית" }
      ],
      "hard_stops_applied": ["any of: no_distinct_intent_page_type / cant_beat_serp_uniqueness / ymyl_without_expert_review / almost_only_zero_click / programmatic_thin_risk"],
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["upstream_competitor_landscape", "upstream_seo_keyword_research", "upstream_audience_personas", "upstream_positioning", "answers.budget"],
      "generated_at": "ISO timestamp"
    },
    {
      "scenario": "all_in",
      "scenario_label_he": "All-In — תוקפים head terms + paid acceleration",
      "// _": "Same shape as smart — fill all fields. Different first_win_channel + heavier budget + longer timeline + paid component."
    }
  ],
  "recommended_default": "smart | all_in",
  "recommendation_rationale": "1-2 משפטים: למה ה-default מומלץ עבור profile העסק הזה — תקציב, bandwidth, מצב תחרותי",
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- בדיוק **2 records**: scenario='smart' + scenario='all_in'. אסור ליצור hybrid או לדלג על אחד.
- כל record חייב לעבור 3 must-pass tests של first_win_channel — אם לא עובר, סמנו hard_stops + confidence: working_hypothesis.
- KPI metrics חייבים להכיל לפחות 6 מדדים: ביקורים אורגניים, לידים, לקוחות משלמים, MRR, CAC, LTV:CAC.
- 3 תרחישים בכל KPI: conservative / base / upside — אסור לדלג על conservative ("realistic minimum").
- channel_priority_list חייב לכלול לפחות 3 ערוצים מעבר ל-first_win_channel (סך 4+ ערוצים).
- ל-30_day_plan חייבים להיות 4 day_range buckets (1-3, 4-10, 11-20, 21-30) — לא להמציא חלוקה אחרת.
- linked_keywords / linked_persona / linked_competitors חייבים להפנות לרשומות אמיתיות מ-upstream stages — אסור להמציא keyword או persona שלא מופיעים שם.
- realism_checklist_passed: כל item שלא עובר → confidence ל-record יורד ל-medium לפחות; 3+ items נופלים → working_hypothesis.

### חלק 3: Tradeoff Analysis (markdown)
טבלה: Smart vs All-In on 5 dimensions: time-to-first-customer, total budget, risk profile, scalability ceiling, team bandwidth required. כל cell עם confidence inline marker.

### חלק 4: Decision Tree (markdown)
איזה option לבחור לפי profile:
- אם budget < ₪3,000 → ...
- אם buyer research corpus באנגלית → ...
- אם trust requirements YMYL → ...
- וכו' (3-5 branches)

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
${feedbackLine}`,
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
            minLength: 2500,
            prompt: `# סקריפט לראיונות אמת — Mom Test Style

## תמצית המחקר
### פרסונות (מ-audience_personas)
${personasContent || '*(stage לא הורץ)*'}

### אסטרטגיה (מ-strategy_options)
${strategyHalf1}
${strategyHalf2}

---

## פקודות עבודה

הכינו סקריפט לראיון customer discovery של 20 דקות ל-5 לקוחות פוטנציאליים, לפי עקרונות "The Mom Test":
- שאלות על **עבר** (מה כבר עשו), לא עתיד (מה יעשו)
- שאלות על **התנהגות**, לא על דעות
- אל תזכירו את המוצר של ${businessName} מוקדם מדי
- 50% מהשאלות חייבות להיות risk-of-no answers (חיפוש סיגנלים שליליים)

${PERSONA_JTBD_FORMAT}

${TRUST_HIERARCHY_METHOD}

${PRICING_VALIDATION_METHOD}

${CONFIDENCE_INTEGRITY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown)
2-3 פסקאות: למה ה-script הזה מאמת/מפריך את ההשערות הקריטיות של האסטרטגיה. אילו השערות הכי קריטיות לאמת ראשונות?

### חלק 2: JSON record — interview script (חובה!)

\`\`\`json
{
  "records": [
    {
      "mode": "real_interviews",
      "target_personas": [
        { "persona_name": "שם מ-audience_personas.records[].name", "where_to_find": "פלטפורמה / קבוצה / רשימה", "outreach_method": "1-2 משפטים: איך לפנות", "n_interviews_target": 5 }
      ],
      "interview_duration_minutes": 20,
      "script_sections": [
        {
          "section": "פתיחה",
          "duration_minutes": 2,
          "spoken_text_he": "טקסט מדויק להגיד בעברית",
          "purpose": "1 משפט"
        },
        {
          "section": "הקשר (past behavior)",
          "duration_minutes": 5,
          "questions": [
            {
              "q_number": 1,
              "question_he": "שאלה ממוקדת עבר בעברית — קונקרטית, ניתנת לאימות",
              "what_we_learn": "1 משפט: מה האות מהתשובה",
              "red_flag_response": "מה תשובה שגויה / מטעה",
              "follow_up": "שאלה המשך אם התשובה רדודה"
            }
          ]
        },
        { "section": "כאבים ופתרונות נוכחיים", "duration_minutes": 7, "questions": [] },
        { "section": "אימות הזדמנות", "duration_minutes": 5, "questions": [] },
        { "section": "סגירה", "duration_minutes": 1, "spoken_text_he": "...", "purpose": "..." }
      ],
      "what_to_listen_for": [
        { "positive_signal": "ציטוט לדוגמה", "negative_signal": "ציטוט לדוגמה", "interpretation": "מה זה אומר", "next_action": "מה לעשות" }
      ],
      "documentation_template_columns": ["interview_n", "name_role", "pain_1", "pain_2", "pays_today_for", "wtp_for_solution", "positive_signals", "reaction_to_product"],
      "confidence_thresholds": {
        "validated_60_percent_or_more": "להמשיך לאסטרטגיה",
        "ambiguous_30_to_60": "לבדוק שוב את הפרסונה, ייתכן שהגדרת קהל שגויה",
        "rejected_below_30": "חזור לשלבים 1-3 עם pivot"
      },
      "linked_hypotheses_to_validate": [
        { "hypothesis": "הכאב X הוא הכאב #1 לפרסונה Y", "source_stage": "audience_personas | strategy_options | positioning", "criticality": "high | medium | low" }
      ],
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["upstream_audience_personas", "upstream_strategy_options", "upstream_positioning"],
      "generated_at": "ISO timestamp"
    }
  ],
  "confidence": "medium"
}
\`\`\`

**חובה:**
- 1 record per interview script (mode='real_interviews').
- 5 sections (פתיחה / הקשר / כאבים / אימות / סגירה) ב-script_sections — במשך הזמן הנכון (סך = 20 דק').
- כל question חייב כל 4 השדות: question_he / what_we_learn / red_flag_response / follow_up.
- linked_hypotheses_to_validate חייב לכלול לפחות 5 השערות מ-strategy_options + positioning.
- confidence ל-record כולו: 'medium' מקסימום (interview script הוא ב-essence working hypothesis עד שהראיונות באמת התקיימו).

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
${feedbackLine}`,
        }
    }

    // Default: AI-simulated validation (Mom Test simulated against persona profiles)
    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 4000,
        prompt: `# AI-Simulated Customer Validation — "${businessName}"

## תמצית המחקר
### פרסונות (מ-audience_personas)
${personasContent || '*(stage לא הורץ)*'}

### אסטרטגיה (מ-strategy_options)
${strategyHalf1}
${strategyHalf2}

---

## פקודות עבודה

אתם משחקים תפקיד של **3 פרסונות שונות** מ-audience_personas. עונים בשם כל אחת על 10 validation questions. **50% מהתשובות חייבות להיות ביקורתיות** — אחרת זה לא validation, זה wishful thinking.

אחרי 3 הראיונות → Cross-Validation Matrix: מה **אומת**, מה **נפל**, מה **לא ברור**. + Top 3 blindspots + 3 immediate actions.

${PERSONA_JTBD_FORMAT}

${TRUST_HIERARCHY_METHOD}

${CONFIDENCE_INTEGRITY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: Executive Summary (markdown)
2-3 פסקאות: confidence score כללי, השערה עיקרית שאומתה, השערה עיקרית שנפלה, blindspot הכי גדול שצריך לטפל בו לפני launch.

### חלק 2: JSON records — simulated interviews (חובה!)

\`\`\`json
{
  "records": [
    {
      "persona_name": "שם פרסונה (חייב להתאים ל-audience_personas.records[].name)",
      "persona_profile_summary": "תקציר ב-1-2 משפטים: גיל, תפקיד, כאב ראשי",
      "questions": [
        {
          "q": "ספר לי על [הכאב הראשי] — איך זה נראה בפועל אצלך?",
          "in_persona_voice_he": "תשובה בגוף ראשון, 2-3 משפטים אמיתיים",
          "is_critical": true
        },
        { "q": "מה ניסית לעשות כדי לפתור את זה עד היום?", "in_persona_voice_he": "...", "is_critical": false },
        { "q": "כמה שילמת על פתרונות קודמים? מה הרגיז אותך בהם?", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "${businessName} מציע [הצעת ערך]. מה התגובה הראשונית שלך? (כולל ביקורת!)", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "מה לא ברור? מה מעורר חשד?", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "איך תשווה בין ${businessName} ל-[מתחרה מ-competitor_landscape]?", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "במחיר של ₪X/חודש — אקנה מיד / אשקול / יקר מדי?", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "מה יגרום לך לומר 'לא' סופית?", "in_persona_voice_he": "...", "is_critical": true },
        { "q": "איפה חיפשת פתרון כזה — מה היו מילות המפתח?", "in_persona_voice_he": "...", "is_critical": false },
        { "q": "מי עוד היית מתייעץ לפני הרכישה?", "in_persona_voice_he": "...", "is_critical": false }
      ],
      "red_flags": ["מה הפרסונה חשפה שמעורר דאגה — לפחות 1, מקסימום 3"],
      "green_flags": ["מה חיזק את ההשערה — לפחות 1, מקסימום 3"],
      "critical_answer_count": 5,
      "confidence": "high | medium | working_hypothesis"
    }
  ],
  "cross_validation_matrix": [
    {
      "hypothesis": "השערה ספציפית מ-strategy_options או positioning",
      "source_stage": "strategy_options | positioning | audience_personas",
      "persona_1_status": "validated | rejected | unclear",
      "persona_2_status": "validated | rejected | unclear",
      "persona_3_status": "validated | rejected | unclear",
      "overall_status": "validated | rejected | unclear",
      "criticality": "high | medium | low"
    }
  ],
  "confidence_score": {
    "validated_count": 0,
    "total_hypotheses": 0,
    "score_0_100": 0,
    "recommendation": "continue | small_pivot | back_to_research",
    "what_to_pivot": "אם small_pivot — מה בדיוק לעדכן",
    "back_to_which_stage": "אם back_to_research — איזה stage לחזור"
  },
  "top_3_blindspots": [
    {
      "blindspot": "מה התגלה",
      "discovered_via": "איזו תשובת פרסונה / cross-validation row",
      "action_required": "פעולה קונקרטית"
    }
  ],
  "immediate_actions": [
    {
      "action": "פעולה קונקרטית",
      "based_on": "ממצא ספציפי",
      "owner": "founder | content lead | sales | dev",
      "timeline": "this week | next 2 weeks | before launch"
    }
  ],
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- בדיוק **3 records** (3 personas) — אסור פחות, אסור יותר. Persona names חייבים להתאים ל-audience_personas.records[].name.
- כל record: בדיוק 10 questions (סדר קבוע לעיל) + answers בעברית בגוף ראשון של הפרסונה.
- critical_answer_count חייב להיות **לפחות 5** מתוך 10 (50% rule). אם פחות → record_confidence = working_hypothesis עם הסבר.
- cross_validation_matrix: לפחות 7 hypotheses, חייבים להגיע מ-strategy_options.records או positioning.records — אסור להמציא.
- confidence_score.recommendation מבוסס על score: 80+ continue / 60-80 small_pivot / <60 back_to_research.
- top_3_blindspots חייב להכיל **בדיוק 3** items.
- immediate_actions: 3-5 items עם owner + timeline ספציפי.

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}
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