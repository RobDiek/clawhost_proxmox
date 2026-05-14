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
import { classifyVertical, IL_VERTICAL_BENCHMARKS } from './verticalBenchmarks'
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
    EVIDENCE_HONESTY_RULE,
    CONFIDENCE_LABELING,
    JSON_OUTPUT_RULES,
    DFS_DATA_RULE,
    QUALITY_GATE_INSTRUCTIONS,
    HARD_BLOCK_RULES,
    HEBREW_ONLY_BLOCK,
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
        const deepBlock = e.deepPages && e.deepPages.length > 0
            ? '\n- **Money-pages deep scan (Phase E2.1 — Firecrawl on top-3 ranked URLs):**\n' + renderDeepPagesBlock(e.deepPages)
            : ''
        const reviewsBlock = e.reviews
            ? '\n- **Google reviews sentiment (Phase E2.4 — sample of ' + e.reviews.sample_size + '):**\n' + renderReviewsBlock(e.reviews)
            : ''
        // Phase 4.0(fix4) — render pals rating (rating + votes_count) as a
        // separate signal so the prompt sees a real headline number even
        // when sentiment text fetch failed. Both blocks coexist when DFS
        // returns sentiment — pals gives the count, reviews gives the
        // breakdown + themes.
        const palsBlock = e.palsRating
            ? `\n- **Google rating (from ourGmb.people_also_search — DFS authoritative):** ⭐ ${e.palsRating.rating}/5 · ${e.palsRating.votes_count} reviews · listed as "${e.palsRating.title}"`
            : ''
        const rankedKwBlock = e.topRankedKeywords && e.topRankedKeywords.length > 0
            ? '\n- **Top ranked keywords (Phase E2.5 — top 20 by traffic — drives topic-matrix synthesis):**\n' + renderTopRankedKeywords(e.topRankedKeywords.slice(0, 20))
            : ''
        return `### ${e.domain}
- **שיתופי keywords:** ${e.sharedKeywords} | **avg position:** ${e.avgPosition.toFixed(1)} | **organic_count:** ${e.organicCount ?? '—'}
- **Link profile (DFS backlinks/summary):** ${bls}
- **Top anchor texts (DFS backlinks/anchors):** ${topAnchors}
- **On-page (DFS on_page/instant_pages, homepage only):** ${onPage}${palsBlock}${deepBlock}${reviewsBlock}${rankedKwBlock}`
    }).join('\n\n')
}

function renderTopRankedKeywords(kws: NonNullable<CompetitorEnrichment['topRankedKeywords']>): string {
    const lines = kws.map(k =>
        `  - \`${k.keyword}\` — pos ${k.rank} | vol ${k.volume ?? '—'} | etv ${k.etv ? k.etv.toFixed(1) : '—'} | ${k.url ? k.url.substring(0, 80) : '—'}`
    )
    return lines.join('\n')
}

function renderSerpOwnershipBlock(entries: CompetitorLandscapeDfsData['serpOwnership']): string {
    if (!entries || entries.length === 0) {
        return '*(אין SERP-ownership matrix — דורש top contested keywords עם נתוני volume; אם אין rankedKeywords ב-DFS data — סמנו working_hypothesis)*'
    }
    return entries.map(e => {
        const top3 = e.top_organic.map(o => `${o.rank}. ${o.domain}`).join(' · ') || '—'
        const aio = e.ai_overview_cited && e.ai_overview_cited.length > 0
            ? `🤖 AI Overview cites: ${e.ai_overview_cited.slice(0, 5).join(', ')}`
            : '🤖 No AI Overview detected'
        const fs = e.featured_snippet_owner ? `📌 Featured snippet: \`${e.featured_snippet_owner}\`` : '📌 No featured snippet'
        const paa = e.paa_owners && e.paa_owners.length > 0
            ? `❓ PAA: ${e.paa_owners.slice(0, 3).map(p => `"${p.question.substring(0, 60)}"${p.answer_domain ? ' → ' + p.answer_domain : ''}`).join(' · ')}`
            : '❓ No PAA'
        const otherFeats = e.other_features.length > 0 ? `🎨 Other: ${e.other_features.join(', ')}` : ''
        const wePresent = e.we_present_on_page1 ? '🟢 We rank on page 1' : '🔴 We do NOT rank on page 1'
        return `**\`${e.keyword}\`** (vol ${e.volume ?? '—'}) — ${wePresent}
- top organic: ${top3}
- ${aio}
- ${fs}
- ${paa}${otherFeats ? '\n- ' + otherFeats : ''}`
    }).join('\n\n')
}

function renderReviewsBlock(rev: NonNullable<CompetitorEnrichment['reviews']>): string {
    const lines: string[] = []
    lines.push(`  - avg_rating=${rev.avg_rating}/5 · positive=${rev.positive_pct}% · negative=${rev.negative_pct}% · owner_response_rate=${rev.owner_response_rate_pct}%`)
    lines.push(`  - breakdown: ★1=${rev.rating_breakdown['1']} ★2=${rev.rating_breakdown['2']} ★3=${rev.rating_breakdown['3']} ★4=${rev.rating_breakdown['4']} ★5=${rev.rating_breakdown['5']}`)
    if (rev.top_complaints.length > 0) lines.push(`  - top_complaints: ${rev.top_complaints.join(' · ')}`)
    if (rev.top_praises.length > 0) lines.push(`  - top_praises: ${rev.top_praises.join(' · ')}`)
    if (rev.sample_negative_quote) lines.push(`  - 🔴 quote (negative): "${rev.sample_negative_quote.substring(0, 200)}${rev.sample_negative_quote.length > 200 ? '…' : ''}"`)
    if (rev.sample_positive_quote) lines.push(`  - 🟢 quote (positive): "${rev.sample_positive_quote.substring(0, 200)}${rev.sample_positive_quote.length > 200 ? '…' : ''}"`)
    return lines.join('\n')
}

function renderDeepPagesBlock(pages: NonNullable<CompetitorEnrichment['deepPages']>): string {
    return pages.map(p => {
        if (!p.fetchOk) {
            return `  - 🚫 \`${p.url}\` (rank ${p.rank} for "${p.rankedFor}") — fetch failed: ${p.fetchError}`
        }
        const eeat = p.eeatSignals
        const eeatList = [
            eeat.hasByline ? `byline${eeat.authorName ? '(' + eeat.authorName + ')' : ''}` : null,
            eeat.hasPublishDate ? 'publish_date' : null,
            eeat.hasUpdatedDate ? 'updated_date' : null,
            eeat.hasExternalCitations ? 'authority_citations' : null,
            eeat.hasReviews ? 'reviews_section' : null,
        ].filter(Boolean).join(' · ') || 'none detected'
        const schemas = p.schemaTypes.length > 0 ? p.schemaTypes.join(', ') : 'none'
        const h2s = p.h2List.slice(0, 5).map(h => `"${h.substring(0, 60)}"`).join(', ') || 'none'
        const firstPara = p.firstParagraph ? `"${p.firstParagraph.substring(0, 180)}${p.firstParagraph.length > 180 ? '…' : ''}"` : 'no paragraph extracted'
        return `  - 📄 \`${p.url}\` (page_type: ${p.inferredPageType}, rank ${p.rank} for "${p.rankedFor}", vol ${p.searchVolume ?? '—'})
    - **words:** ${p.wordCount ?? '—'} | **schemas:** ${schemas} | **EEAT:** ${eeatList}
    - **H1:** ${p.h1 ?? '—'} | **H2 (top 5):** ${h2s}
    - **first paragraph:** ${firstPara}`
    }).join('\n')
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

function renderSeasonalityBlock(s: CompetitorLandscapeDfsData['seasonality']): string {
    if (!s || s.length === 0) {
        return '*(אין נתוני seasonality — DFS searchVolume נכשל או head terms לא נמצאו. סמנו "Why now" כ-working_hypothesis)*'
    }
    const MONTH_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
    return s.map(entry => {
        const peakStr = entry.peak_months.length > 0
            ? entry.peak_months.map(m => MONTH_HE[m] || String(m)).join(', ')
            : 'אין חודש שעולה ≥25% מעל הממוצע'
        const monthlyStr = entry.monthly
            .slice(-12)
            .map(m => `${String(m.month).padStart(2, '0')}/${String(m.year).slice(-2)}: ${m.volume}`)
            .join(' · ')
        return `**\`${entry.keyword}\`** — avg ${entry.avg_monthly_volume}/mo · peaks: **${peakStr}**
  - last 12 months: ${monthlyStr}`
    }).join('\n\n')
}

function renderRankingMismatchesBlock(m: CompetitorLandscapeDfsData['rankingMismatches']): string {
    if (!m || m.length === 0) return '*(אין סתירות — DFS rankedKeywords ו-serpAdvanced תואמים)*'
    return m.map(x =>
        `- **\`${x.keyword}\`** — DFS rank #${x.dfs_rank ?? '?'} | live SERP: לא בעמוד 1\n  ${x.interpretation_he}`
    ).join('\n\n')
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

    const firecrawlNote = dfs.firecrawlAvailable
        ? `Firecrawl: ${dfs.firecrawlPagesScraped} money-pages נסרקו על פני top ${dfs.topEnriched.length} מתחרים`
        : 'Firecrawl: **לא זמין** — deepPages חסר; הסתמכו רק על onpage homepage + backlinks'
    const dfsAvailability = dfs.hasCompetitorData
        ? `**מקור הנתונים:** DataForSEO live data, ${new Date().toISOString().slice(0, 10)} | ${dfs.competitors.length} מתחרים | top ${dfs.topEnriched.length} מועשרים | ${firecrawlNote} | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)`
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

### Top 5 enriched — backlinks + anchors + on-page + money-pages + reviews + topRankedKeywords
${renderEnrichmentTable(dfs.topEnriched)}

### SERP feature ownership matrix (Phase E2.6 — top contested keywords × who owns AI Overview / Featured Snippet / PAA / other features)
${renderSerpOwnershipBlock(dfs.serpOwnership)}

### Our own link profile + link-gap analysis (Phase 3.10b)
${renderOurLinksBlock(dfs.ourLinks)}

### Our Google My Business profile
${renderGmbBlock(dfs.ourGmb)}

### Seasonality — monthly volume per head term (Phase 4.0)
${renderSeasonalityBlock(dfs.seasonality)}

### Ranking inconsistencies — DFS rankedKeywords vs live serpAdvanced (Phase 4.0)
${renderRankingMismatchesBlock(dfs.rankingMismatches)}

---

## פקודות עבודה

${INTENT_TAXONOMY}

${COMPETITOR_BUCKETING}

${COMPETITOR_ALWAYS_ON_SIGNALS}

${IL_SIGNALS_CHECKLIST}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: תקציר מנהלים (markdown — 2-3 פסקאות, **בעברית בלבד**)
תקצרו את הממצא המרכזי על המגרש התחרותי: מי האיומים האמיתיים? מה הדרך לניצחון שלנו? מהן 3 הפעולות העיקריות?

### חלק 2: רשומות JSON — מתחרים (חובה!)

**Threat scorecard formula** (משקלים מדויקים, Σ=1.0, **אסור משקלים שווים**):
\`Total = 0.25·serp_overlap + 0.20·page_type_fit + 0.15·authority_trust_proof + 0.15·local_presence_quality + 0.15·content_system_maturity + 0.10·asset_linkability\`

**דוגמת חישוב:** serp_overlap=85, page_type_fit=75, authority=60, local=65, content=70, asset=50:
- 0.25·85 = 21.25
- 0.20·75 = 15.00
- 0.15·60 = 9.00
- 0.15·65 = 9.75
- 0.15·70 = 10.50
- 0.10·50 = 5.00
- **Σ = 70.50** → \`scorecard.total = 70.50\`, \`_formula_verification\` = "0.25·85 + 0.20·75 + 0.15·60 + 0.15·65 + 0.15·70 + 0.10·50 = 21.25+15.00+9.00+9.75+10.50+5.00 = 70.50"

**\`scorecard.total\` ו-\`_formula_verification\` חובה לכל record** — self-critique בודק.

**Phase 4.0 — Degraded-scorecard rule:** עבור מתחרה שאין לו נתוני enrichment אמיתיים (backlinks_summary, on_page_audit, ו-topRankedKeywords כולם תחת \`enrichmentMissing\` או \`data_unavailable\`), **אסור** לתת ציונים גבוהים נומריים על authority_trust_proof, content_system_maturity, ו-asset_linkability — אלה נמדדים מהנתונים שאין לכם. במקום זה: סמנו את שלושת הציונים האלה כ-\`null\` (לא 60 או 50 בניחוש), \`scorecard.total\` נשאר null, \`_formula_verification\` = "data_unavailable — cannot score without enrichment", ו-\`confidence\` חייב להיות \`working_hypothesis\`. זה משאיר את ה-bucket assignment וה-narrative במקום, אבל לא יוצר אשליה של מספרים מדויקים.


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
        "asset_linkability": 0-100,
        "total": 0,
        "_formula_verification": "0.25·serp_overlap + 0.20·page_type_fit + 0.15·authority + 0.15·local + 0.15·content + 0.10·asset = SUM (string with literal arithmetic)"
      },
      "topical_authority_venn": "איפה אנחנו חופפים בנושא ואיפה לא — 2-3 משפטים",
      "site_architecture_depth": "ניתוח עומק האתר — hub-and-spoke? silo? flat? פעולה מתבקשת",
      "link_profile_depth": "סיכום על בסיס ה-DFS backlinks data — referring_domains, anchor patterns, spam_score",
      "backlink_worthy_assets_inventory": ["calculator X", "research Y", "tool Z"],
      "money_pages_analysis": {
        "_note": "Phase E2.1 — מבוסס על deepPages (Firecrawl scrape של top-3 URLs ranked של המתחרה). אם deepPages חסר ב-DFS data — סמנו 'data_unavailable' ו-confidence: working_hypothesis.",
        "page_types_observed": ["pillar", "spoke", "local_page", "וכו'"],
        "avg_word_count_inner_pages": 0,
        "schema_coverage_summary": "1 משפט: איזה schemas קיימים אצלם (FAQPage / Article / Product / LocalBusiness) ובאיזה page-types",
        "content_depth_vs_us": "thinner | similar | deeper",
        "structural_pattern": "1 משפט: הם משתמשים ב-clusters? hub-and-spoke? long-form pillars?",
        "what_they_do_better_inside": ["1-3 דברים קונקרטיים שזיהיתם בעמודים שלהם שאנחנו לא עושים"]
      },
      "reviews_intel": {
        "_note": "Phase E2.4/4.0 — שני מקורות אפשריים: (1) Phase E2.4 reviews aggregation עם sentiment + themes (מלא); (2) Phase 4.0 palsRating מ-ourGmb.people_also_search — רק rating + votes_count, אין text. **אם palsRating נוכח** ב-prompt עבור המתחרה — חובה למלא sample_size + avg_rating מהמספרים שלו, ולסמן top_complaint_themes / top_praise_themes כריקים []. **אסור** לסמן 'data_unavailable' כשיש palsRating — זה סותר את הנתון האמיתי שהמערכת מסרה.",
        "sample_size": 0,
        "avg_rating": 0,
        "positive_pct": 0,
        "negative_pct": 0,
        "owner_engagement": "high | medium | low",
        "top_complaint_themes": ["3 themes לכל היותר, מתוך top_complaints"],
        "top_praise_themes": ["3 themes לכל היותר, מתוך top_praises"],
        "what_we_learn": "1-2 משפטים בעברית: מה הלקוחות שלהם אומרים שאנחנו צריכים לקחת בחשבון. אם complaints חוזרים על themes ספציפיים — אלו הזדמנויות שלנו (לעשות טוב יותר את מה שהם נכשלים בו). אם רק palsRating זמין (אין themes) — ציינו 'מה הלקוחות שלהם אומרים — דורש fetch ידני, אך הדירוג הגבוה/נמוך נמדד מ-N reviews מאומתות'."
      },
      "topic_coverage": {
        "_note": "Phase E2.5 — מבוסס על topRankedKeywords של המתחרה (top 30 by traffic). סווגו את ה-keywords לתוך 3-5 topics/clusters שמשקפים את התחומים שהם dominate-ים. אם topRankedKeywords חסר — confidence: working_hypothesis.",
        "dominated_topics": [
          {
            "topic": "שם topic בעברית (לדוגמה: 'אחסון תכולת דירה לטווח קצר')",
            "keyword_count": 0,
            "sample_keywords": ["3-5 דוגמאות"],
            "estimated_traffic": "low | medium | high (לפי סכום etv)"
          }
        ],
        "their_strongest_topic": "1 משפט: ה-topic שבו הם הכי חזקים ולמה זה איום עלינו",
        "weak_topic_we_can_attack": "1 משפט: topic שבו הם נוכחים אבל לא dominate-ים — הזדמנות לנו"
      },
      "eeat_signals": {
        "_note": "Phase E2.1 — מבוסס על deepPages.eeatSignals. אם deepPages חסר — מבוסס על onpage homepage בלבד (degraded).",
        "byline_present_pct": 0,
        "publish_dates_present": true,
        "updated_dates_present": true,
        "external_authority_citations": true,
        "reviews_section_present": true,
        "schema_author_present": true,
        "summary": "1 משפט בעברית: רמת ה-EEAT הכוללת שלהם מול שלנו"
      },
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
  "serp_ownership_summary": {
    "_note": "Phase E2.6 — מבוסס על SERP feature ownership matrix שבprompt. סיכום אסטרטגי של מי שולט ב-SERP features ב-top contested keywords + הזדמנויות שלנו.",
    "ai_overview_owners_top": ["3 דומיינים שמופיעים הכי הרבה ב-AI Overview citations"],
    "featured_snippet_owners_top": ["3 דומיינים שלוקחים הכי הרבה featured snippets"],
    "we_present_pct": 0,
    "we_present_in_keywords_count": 0,
    "biggest_zero_click_risk_pct": 0,
    "wedge_opportunities": [
      {
        "keyword": "מילת מפתח קונקרטית",
        "current_owners": "מי שולט (top organic + features)",
        "our_wedge": "1 משפט בעברית — איזה features פתוחים לנו (FS שלא מוחזק, AI Overview citation gap, וכו)"
      }
    ],
    "confidence": "high | medium | working_hypothesis"
  },
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

### חלק 3: חפיפת סמכות נושאית (markdown)
איפה אנחנו חופפים עם המתחרים בנושא, ואיפה יש "אדמת הפקר" שאף אחד לא משחק עליה.
3-5 חפיפות + 3-5 white spaces. **בעברית בלבד** (anchor / hub / cluster מותרים).

### חלק 4: השוואת פרופיל קישורים מול מתחרים (markdown — Phase 3.10b)
ניתוח השוואתי ב-2-3 פסקאות:
- איפה אנחנו עומדים מבחינת backlinks total + referring domains total מול ממוצע של 5 המתחרים המובילים?
- האם ה-anchor mix שלנו נקי או ספאמי יותר מאצלם?
- כמה lost links ניתן להחזיר (3 בעדיפות גבוהה)?
- 5 link-gap candidates עם זווית פנייה (outreach angle) לכל אחד.

### חלק 5: למה עכשיו? — תזמון לישראל
3 גורמי תזמון ספציפיים ל-2026 ובהקשר הישראלי — כל אחד עם מקור (מחקר / חדשות / נתוני שוק) ועם
inline marker של ביטחון. **בעברית בלבד** במשפטים.

### חלק 6: פעולות מומלצות (top 5)
פעולות קונקרטיות בעקבות הניתוח. **כל פעולה במשפט עברי שלם** עם:
- owner (תפקיד אחראי בעברית: "מנהל תוכן", "מנהל SEO", "מייסד")
- timeline ("30 יום", "60 יום", "רבעון 1 2026")
- inline marker של ביטחון (גבוה / בינוני / השערת עבודה).

**הערה:** דירוג איומים בין המתחרים מופיע כבר בכרטיסי ה-records (scorecard.total) —
**אסור לשכפל אותו במרקדאון** (זה היה גורם לאי-עקביות בין הטקסט הסיפורי לערכים האותרטיביים).

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}
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

function renderGscBlock(gsc: SeoKeywordResearchDfsData['gsc']): string {
    if (!gsc.connected) {
        return `*(GSC לא מחובר — ${gsc.reason || 'אין Google Search Console מחובר לחשבון'}. striking-distance מתבסס על DFS rankedKeywords בלבד; אם המשתמש יחבר GSC זה ייתן signals חזקים יותר. רשמו במפורש בפלט שהנתון מבוסס DFS estimation ולא Google's own data.)*`
    }
    const rows = gsc.queries.slice(0, 100).map(q => {
        const bucket = q.position <= 3 ? 'top_3'
            : q.position <= 8 ? 'fast_optimization (4-8)'
            : q.position <= 15 ? 'content_upgrade (9-15)'
            : q.position <= 20 ? 'rebuild_or_remap (16-20)'
            : `pos ${Math.round(q.position)}`
        return `| ${q.query} | ${q.position.toFixed(1)} | ${bucket} | ${q.clicks} | ${q.impressions} | ${(q.ctr * 100).toFixed(2)}% |`
    }).join('\n')
    return `**Site:** \`${gsc.siteUrl}\` | **Days analyzed:** ${gsc.daysAnalyzed} | **Total queries:** ${gsc.queries.length}\n\n| Query | Position (avg) | Striking bucket | Clicks | Impressions | CTR |\n|---|---|---|---|---|---|\n${rows}`
}

export function buildSeoKeywordResearchPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)

    const dfs = opts.dfsData as SeoKeywordResearchDfsData | undefined
    if (!dfs) throw new Error('seo_keyword_research: dfsData prefetch is required')

    // Phase QA — pull existing URL inventory from internal_seo_audit upstream
    // so cluster_architecture knows which proposed pages already exist (to
    // refresh) vs need to be created. Prevents wasted content budget +
    // cannibalization risk.
    const internalAudit = rd.results?.internal_seo_audit
    const internalAuditRecords = (internalAudit?.records as Array<Record<string, unknown>> | undefined) || []
    const existingUrls = internalAuditRecords
        .map(r => ({
            url: String(r.url || ''),
            page_type: String(r.page_type || ''),
            title: String(r.title || ''),
            word_count: typeof r.word_count === 'number' ? r.word_count : undefined,
            onpage_score: typeof r.onpage_score === 'number' ? r.onpage_score : undefined,
        }))
        .filter(u => u.url)
    const existingUrlsBlock = existingUrls.length > 0
        ? `### Existing URL inventory (Phase QA — מ-internal_seo_audit upstream)
${existingUrls.slice(0, 50).map(u => `- \`${u.url}\` (${u.page_type || 'other'}) | "${u.title.substring(0, 60)}${u.title.length > 60 ? '…' : ''}" | ${u.word_count ?? '—'} words | onpage_score=${u.onpage_score ?? '—'}`).join('\n')}

**חובה ב-cluster_architecture:** לכל \`pillar_url_proposal\` ולכל \`spoke.keyword\` — בדקו אם קיים URL מהinventory למעלה שמכסה את ה-topic. אם כן — סמנו \`url_status: 'exists_refresh'\` (אם דורש שיפור) או \`'exists_no_change'\` (אם בסדר), ומלאו \`existing_url_match\` עם ה-URL מ-inventory. אם לא — \`url_status: 'new'\`. **אסור להציע ליצור URL חדש כשiu קיים coverage** — זה cannibalization risk.`
        : '### Existing URL inventory\n*(internal_seo_audit לא הורץ — cluster_architecture יסמן את כל ה-pillars/spokes כ-`new`. אם הסיט קיים — הריצו internal_seo_audit קודם.)*'

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

### GSC organic queries — Google's own data (last 90 days)
${renderGscBlock(dfs.gsc)}

**הערה לגבי striking distance:** אם GSC מחובר, השתמשו ב-GSC queries כמקור עיקרי ל-current_position וב-striking_bucket — Google's own data תמיד מנצח DFS estimation. השתמשו ב-DFS rankedKeywords כ-fallback בלבד.

${existingUrlsBlock}

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

${EVIDENCE_HONESTY_RULE}

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
  "cluster_architecture": [
    {
      "cluster_name": "שם cluster (בעברית עיקרי, אנגלית רק אם הnameingvention ב-IL הוא אנגלי)",
      "pillar_keyword": "מילת המפתח הראשית של ה-cluster (head term)",
      "pillar_url_proposal": "/proposed-url-slug",
      "pillar_url_status": "new | exists_refresh | exists_no_change",
      "pillar_existing_url_match": "אם exists_* — ה-URL מהinternal_seo_audit שכבר מכסה את ה-pillar topic. אם new — null.",
      "intent_ladder": "1 משפט בעברית — איך הקלאסטר עובר בין info_broad → info_deep → commercial_eval → transactional",
      "spokes": [
        {
          "keyword": "מילת מפתח (חייבת להיות אחת מ-records[].keyword)",
          "page_type": "info_deep_spoke / comparison_spoke / pricing_explainer / faq / trust_proof / local_page",
          "internal_link_to_pillar_anchor": "טקסט עוגן בעברית למקושר מהspoke לpillar",
          "url_status": "new | exists_refresh | exists_no_change",
          "existing_url_match": "אם exists_* — URL מ-internal_seo_audit. אם new — null."
        }
      ],
      "serp_features_dominant": ["הרשימה של SERP features שחוזרת על עצמה ברוב records של ה-cluster — ai_overview / paa / featured_snippet / local_pack / image_pack / video"],
      "expected_zero_click_share": "estimated % שחיפושים ייגמרו בלי click (מבוסס על SERP features). אם > 60% — flag risk.",
      "evidence": ["dfs_keyword_ideas", "dfs_serp_advanced", "internal_seo_audit_url_inventory"],
      "confidence": "high | medium | working_hypothesis"
    }
  ],
  "cannibalization_audit": {
    "_note": "סריקה מול records — אם 2+ records מתחרים על אותו primary intent + page_type בתוך אותו cluster, זו cannibalization risk.",
    "risks_identified": [
      {
        "competing_keywords": ["kw_a", "kw_b"],
        "shared_intent_and_page_type": "intent + page_type משותפים שגורמים לתחרות פנימית",
        "resolution": "merge into single page / split intent / dedicate distinct page types",
        "owner": "מנהל SEO / מנהל תוכן",
        "confidence": "high | medium | working_hypothesis"
      }
    ],
    "confidence": "high | medium | working_hypothesis"
  },
  "content_briefs": [
    {
      "_note": "Content briefs רק לרשומות עם opportunity.decision == 'take_now'. ללמד את צוות התוכן בדיוק מה לבנות.",
      "for_keyword": "המילה/מפתח (חייבת להיות אחת מ-records)",
      "page_type": "pillar / spoke / faq / וכו'",
      "title_proposal_he": "כותרת H1 בעברית (50-60 תווים, כוללת keyword)",
      "meta_description_he": "תיאור meta בעברית (140-160 תווים, persuasive + keyword early)",
      "target_word_count": 0,
      "h2_outline": ["H2 #1 בעברית", "H2 #2 בעברית", "H2 #3 בעברית"],
      "must_include_entities": ["שמות עצמיים — מותגים / כלים / מקומות / מומחים שצריכים להיכלל"],
      "must_include_data_points": ["מספרים / סטטיסטיקות / data references — מ-DFS או מ-research"],
      "schema_markup_required": ["FAQ / HowTo / LocalBusiness / Article / Product"],
      "internal_links_to_create": ["/page-a", "/page-b"],
      "competitive_advantage": "1 משפט בעברית — איך הדף הזה ינצח את הdomination הנוכחי ב-SERP",
      "owner": "מנהל תוכן / sub-contracted writer",
      "estimated_effort_hours": 0,
      "evidence": ["dfs_serp_advanced", "dfs_keyword_ideas"]
    }
  ],
  "confidence": "high" | "medium" | "working_hypothesis"
}
\`\`\`

**חובה:**
- **מינימום 20 records** (Hebrew/IL niches לעיתים מצומצמים — אם קשה להגיע ל-20 עם DFS data verbatim, השלימו עם working_hypothesis records מבוססי מתחרים + cluster gap analysis). מתוכם:
  - ≥ 6 with opportunity.decision = "take_now" (score ≥ 70)
  - ≥ 3 AEO-priority (aeo.is_priority = true, score ≥ 70)
  - ≥ 3 striking-distance (current_position 4-20, אם יש GSC/ranked_keywords data)
- **\`cluster_architecture\` חובה** — מינימום 3 clusters, כל cluster עם pillar + 4-8 spokes (חייבים להיות מוזכרים ב-records[]).
- **\`cannibalization_audit\` חובה** — סקירה מול כל records. אם 0 risks → ציינו במפורש "לא זוהו risks" + הסבר.
- **\`content_briefs\` חובה** — brief מלא לכל record עם opportunity.decision = "take_now" (לפחות 6).
- כל record חייב volume/CPC/KD מ-DFS verbatim — אם זה לא ב-DFS data, סמנו null + **confidence: working_hypothesis** (חוק קשיח, לא ברירת מחדל).
- **Opportunity score** חישוב **לפי הנוסחה המדויקת** (0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE) — אסור משקלים שווים, אסור ממוצע. **\`opportunity._formula_verification\` חובה** עם החישוב המילולי.
- **AEO score** לפי הנוסחה (0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV) — אסור משקלים שווים. **\`aeo._formula_verification\` חובה**.
- intent.jtbd חייב להיות במבנה "כש[סיטואציה], אני רוצה [פעולה], על מנת ש[תוצאה], מבלי לסכן [downside]"

### חלק 3: מפת cluster (markdown — בעברית בלבד)
מפת cluster — מועמדים ל-pillar pages + ארכיטקטורת spokes בכל cluster (6-8 spokes, page-type lattice).
דפוסי internal linking. סכנות cannibalization מסומנות.

### חלק 4: תת-קבוצת עדיפות AEO (markdown — בעברית בלבד)
רשימת מטרות AEO (score ≥ 70) — איזה טיפול תוכן מקבלות, איזה schema markup חובה,
איזה דפוסי structured data לבנות.

### חלק 5: ניצחונות מהירים ב-striking distance (markdown — בעברית בלבד)
פעולות מיידיות על positions 4-20 קיימות. סדרו לפי impact × ease.

### חלק 6: הזדמנויות programmatic SEO (markdown — אם זוהו, בעברית בלבד)
מועמדים ל-programmatic + בדיקה מול 6 כללי הגנה. אם אף אחד לא עובר את 6 הכללים — ציינו זאת במפורש.

### חלק 7: פערי תוכן אמיתיים (markdown — בעברית בלבד)
מילות מפתח שאף מתחרה לא מדורג עליהן ויש להן demand — 5 המובילות.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}
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

${EVIDENCE_HONESTY_RULE}

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

### חלק 3: כאבים מרכזיים + ציטוטים (markdown — בעברית בלבד)
6+ כאבים מרכזיים. לכל אחד — ציטוט מתוך Trustpilot reviews של DFS, או משלבים קודמים, או מ-answers.challenges.
אם הניתוח נשען על vertical priors בלבד — סמנו [ביטחון: השערת עבודה].

### חלק 4: איפה הקהל נמצא (markdown — בעברית בלבד)
| פלטפורמה | קבוצות/ערוצים ספציפיים | גודל משוער | רלוונטיות |
|---|---|---|---|
(נתונים מ-DFS / שלבים קודמים / vertical priors. כל שורה עם inline marker של ביטחון.)

### חלק 5: מסלול cross-sell / upsell${prodBlk ? '' : ' (אם רלוונטי)'}
${prodBlk ? 'איך המוצרים מחוברים בין הפרסונות? מי משמש כ-feeder למה? (לדוגמה: קורס → SaaS, חבילה משותפת)' : '— אם יש מוצר יחיד, דלגו על סקציה זו.'}

### חלק 6: למה עכשיו? — לפרסונות אלו (markdown — בעברית בלבד)
3 גורמי תזמון לישראל ב-2026 הספציפיים לפרסונות (לא לעסק) — מקור + inline marker של ביטחון לכל אחד.

### חלק 7: סיכום הזדמנות השוק (markdown)
TAM גלובלי / TAM IL / SAM / SOM. כל מספר עם מקור + confidence inline marker. אם המספר extrapolated מ-public data ולא verified — סמנו [confidence: בינוני] לכל הפחות.

### חלק 8: סגמנט #1 לתקוף + 3 סיבות (markdown)
איזה פרסונה תוקפים ראשון ולמה. הקשר ל-First-Win-Channel criteria מ-strategy stage.

---

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}
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

${EVIDENCE_HONESTY_RULE}

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

${HEBREW_ONLY_BLOCK}
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

    // Phase E4 — read cost_timeline_modeling output. This is the pre-calibrated
    // baseline: monthly_budget_ils + duration + monthly_kpi_projection per
    // scenario. The strategy_options stage MUST reuse these numbers verbatim
    // and not invent its own — the calibration was done with IL constants +
    // formulas in the cost_timeline_modeling prefetch.
    const ctm = rd.results?.cost_timeline_modeling
    const ctmRecords = (ctm?.records as Array<Record<string, unknown>> | undefined) || []
    const ctmExtras = (ctm?.extras as Record<string, unknown> | undefined) || {}
    const smartRecord = ctmRecords.find(r => r.scenario === 'smart')
    const aggressiveRecord = ctmRecords.find(r => r.scenario === 'aggressive')
    const ctmAvailable = !!smartRecord && !!aggressiveRecord
    const calibratedBlock = ctmAvailable ? `
### תמצית cost_timeline_modeling (Phase E3 / round-8 platform-DIY — חובה verbatim)

⚠ **Reality framing**: התקציבים למטה הם **Platform-DIY** — מה שהמשתמש משלם בפועל בעידן הסוכנים. סוכנים עושים content + tech + strategy + outreach drafting (₪0 marginal). העלויות הן: subscription ל-OpenClaw + Anthropic API key + רכישת קישורים אמיתית + paid ads (אם כן). \`agency_comparison_ils\` הוא side-block למסגור ערך — לא תקציב המשתמש.

**Smart scenario (Platform-DIY):**
- תקציב חודשי: ₪${(smartRecord!.monthly_budget_ils as number)?.toLocaleString() ?? '?'} (platform ₪${getNested(smartRecord, 'monthly_budget_breakdown_ils.platform_subscription')} | Anthropic ₪${getNested(smartRecord, 'monthly_budget_breakdown_ils.anthropic_api')} | backlinks ₪${getNested(smartRecord, 'monthly_budget_breakdown_ils.backlink_acquisition')} | paid ads ₪${getNested(smartRecord, 'monthly_budget_breakdown_ils.paid_ads')} | external tooling ₪${getNested(smartRecord, 'monthly_budget_breakdown_ils.external_tooling')})
- משך: ${getNested(smartRecord, 'duration_months.expected')} חודשים (${getNested(smartRecord, 'duration_months.min')}-${getNested(smartRecord, 'duration_months.max')})
- תוכנית כוללת: ₪${(smartRecord!.total_program_ils as number)?.toLocaleString() ?? '?'}
- *Agency comparison: ₪${getNested(smartRecord, 'agency_comparison_ils.total_monthly')}/mo (savings ₪${getNested(smartRecord, 'agency_comparison_ils.savings_vs_diy_total')} program-total)*
- KPI חודש 3 / 6 / 12: ${ctmKpiSnapshot(smartRecord!.monthly_kpi_projection)}

**Aggressive scenario (Platform-DIY + paid):**
- תקציב חודשי: ₪${(aggressiveRecord!.monthly_budget_ils as number)?.toLocaleString() ?? '?'} (platform ₪${getNested(aggressiveRecord, 'monthly_budget_breakdown_ils.platform_subscription')} | Anthropic ₪${getNested(aggressiveRecord, 'monthly_budget_breakdown_ils.anthropic_api')} | backlinks ₪${getNested(aggressiveRecord, 'monthly_budget_breakdown_ils.backlink_acquisition')} | paid ads ₪${getNested(aggressiveRecord, 'monthly_budget_breakdown_ils.paid_ads')} | external tooling ₪${getNested(aggressiveRecord, 'monthly_budget_breakdown_ils.external_tooling')})
- משך: ${getNested(aggressiveRecord, 'duration_months.expected')} חודשים (${getNested(aggressiveRecord, 'duration_months.min')}-${getNested(aggressiveRecord, 'duration_months.max')})
- תוכנית כוללת: ₪${(aggressiveRecord!.total_program_ils as number)?.toLocaleString() ?? '?'}
- *Agency comparison: ₪${getNested(aggressiveRecord, 'agency_comparison_ils.total_monthly')}/mo (savings ₪${getNested(aggressiveRecord, 'agency_comparison_ils.savings_vs_diy_total')} program-total)*
- KPI חודש 3 / 6 / 12: ${ctmKpiSnapshot(aggressiveRecord!.monthly_kpi_projection)}

**Decision guidance מהמודל:** ${(ctmExtras.decision_guidance as Record<string, unknown> | undefined)?.decision_text_he || '*(לא זמין)*'}

**LTV:CAC חישוב חייב להיות עם תקציב Platform-DIY** — לא agency_comparison. CAC = monthly_budget_ils.total ÷ paying_customers_per_month. ב-Platform-DIY ה-CAC נמוך באופן משמעותי כי labor=0.
` : '\n### cost_timeline_modeling — לא הורץ\nעליכם לציין במפורש שהאסטרטגיה לא calibrated ל-IL costs ולסמן confidence: working_hypothesis.\n'

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
${calibratedBlock}
${budget ? `## תקציב חודשי שצוין באונבורדינג\n${budget}` : ''}
${marketingGoals ? `## מטרות שיווק שצוינו\n${marketingGoals}` : ''}
${haBlock}

---

## פקודות עבודה — methodology

אתם senior מרקטולוג עם 15 שנות ניסיון. צרו **שתי אופציות אסטרטגיה מלאות** מבוססות על הנתונים שלמעלה:
- **Smart** (low-comp / lean budget) — תקיפת long-tail + striking distance + AEO targets. ${ctmAvailable ? 'תקציב חודשי + משך + KPI חייבים להיות זהים ל-cost_timeline_modeling.smart record.' : 'ללא calibration זמין — סמנו working_hypothesis.'}
- **All-In** (head terms / aggressive) — תקיפת keywords תחרותיים + paid acceleration. ${ctmAvailable ? 'תקציב חודשי + משך + KPI חייבים להיות זהים ל-cost_timeline_modeling.aggressive record.' : 'ללא calibration זמין — סמנו working_hypothesis.'}

${ctmAvailable ? '**אסור להמציא מספרים** — cost_timeline_modeling stage כבר חישב אותם ב-IL constants + formulas מדויקים. תפקידכם: אסטרטגיה (channels / KPIs / risks / first-win) — לא תקצוב.' : ''}

לכל option — חובה לעבור את 3 ה-must-pass tests של First-Win Channel + לחשב KPIs עם נוסחת Realism Forecast (3 תרחישים).

${INTENT_TAXONOMY}

${OPPORTUNITY_SCORING}

${COMPETITOR_BUCKETING}

${POSITIONING_STACK_HE}

${FIRST_WIN_CHANNEL_RULES}

${REALISM_CHECK}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

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

${HEBREW_ONLY_BLOCK}
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

${EVIDENCE_HONESTY_RULE}

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

${HEBREW_ONLY_BLOCK}
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

${buildVerticalBenchmarksBlock(answers, rd)}

---

## פקודות עבודה

אתם משחקים תפקיד של **3 פרסונות שונות** מ-audience_personas. עונים בשם כל אחת על 10 validation questions. **50% מהתשובות חייבות להיות ביקורתיות** — אחרת זה לא validation, זה wishful thinking.

אחרי 3 הראיונות → Cross-Validation Matrix: מה **אומת**, מה **נפל**, מה **לא ברור**. + Top 3 blindspots + 3 immediate actions.

**Phase E5 — Cross-stage coherence checks (חובה לבצע!):**
1. **Vertical reality check** — האם forecast של strategy_options מיושר עם realistic_top_3_count_m12 + realistic_monthly_clicks_m12 של הvertical benchmark שלמטה? אם forecast גבוה ב-50%+ מהtop של ה-range → flag עם hard severity. אם נמוך ב-30%+ → flag עם warning.
2. **Persona-keyword coherence** — האם audience_personas.targetAudience מתיישב עם seo_keyword_research.intent? לדוגמה: persona "construction owners B2B" לא מתאים ל-keywords "אחסון תכולת דירה" (consumer). flag mismatches.
3. **Persona-positioning coherence** — האם positioning value_props רלוונטי ל-jtbd statements? אם value_prop מדבר על "צוותים" אבל persona היא solo entrepreneur — flag.
4. **Budget-deliverables coherence** — האם cost_timeline_modeling.monthly_budget_breakdown_ils מתאים ל-strategy_options channels? אם strategy מציין paid_search כ-channel אבל budget אין link_outreach line — flag.

${PERSONA_JTBD_FORMAT}

${TRUST_HIERARCHY_METHOD}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

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
    "validation_rate_pct": 0,
    "score_0_100": 0,
    "recommendation": "continue | small_pivot | back_to_research",
    "what_to_pivot": "אם small_pivot — תקציר חופשי של 2-3 משפטים בעברית. ROLE: human-readable summary שיופיע ב-UI banner.",
    "strategy_changes": [
      {
        "field": "JSON-pointer מדויק לשדה ב-upstream stage (לדוגמה: 'strategy_options.records[0].budget_allocation_ils.paid_ads' / 'positioning.value_props[1].for_persona' / 'audience_personas.records[2].pricing_validation.wtp_range_ils')",
        "from": "ערך נוכחי או תיאור 1-משפטי של מה שיש כיום",
        "to": "ערך מוצע מבוסס על הראיונות (האקטואלי, לא דמיוני)",
        "rationale_he": "1-2 משפטים בעברית: למה השינוי הזה — איזו תשובה / cross-val row תומכת",
        "evidence_records": ["1.persona_name.q4", "2.persona_name.q7", "cross_val[3]"],
        "impact": "high | medium | low",
        "owner": "founder | content lead | sales | dev"
      }
    ],
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
- **strategy_changes חובה** — לפחות 2 items עבור recommendation=continue, **לפחות 4 items** עבור small_pivot, **לפחות 6 items** עבור back_to_research. כל change חייב לכלול את כל 7 השדות (field/from/to/rationale_he/evidence_records/impact/owner).
- **field** ב-strategy_changes חייב להיות JSON-pointer מדויק לשדה upstream שניתן לעדכון אוטומטי. דוגמאות תקפות:
  • strategy_options.records[0].budget_allocation_ils.paid_search (לעדכן תקציב)
  • positioning.value_props[1].for_persona (לעדכן persona mapping)
  • audience_personas.records[2].pricing_validation.wtp_range_ils (לעדכן WTP estimate)
  • seo_keyword_research.records[3].decision (לשנות take_now → backlog)
  • strategy_options.records[0].30_day_plan[1].actions (להוסיף/להסיר action)
  אסור fields ערוכים אבסטרקטיים כמו "landing_page.headline" — חייב לעמוד בJSON path אמיתי במחקר.
- **evidence_records** חובה — לפחות 1-2 הפניות לתשובות ספציפיות. פורמט: "{N}.{persona_short}.q{n}" (לדוגמה "2.itai.q4") או "cross_val[{idx}]".
- top_3_blindspots חייב להכיל **בדיוק 3** items.
- immediate_actions: 3-5 items עם owner + timeline ספציפי.

${QUALITY_GATE_INSTRUCTIONS}

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// link_audit — deep backlinks audit + lost-link recovery + outreach roadmap.
// Phase (b) of Sergei's depth upgrade. Requires DFS Backlinks subscription.
// ────────────────────────────────────────────────────────────────────────────

interface LinkAuditDfsShape {
    ourDomain: string | null
    backlinksApiAvailable: boolean
    subscriptionFailureMessage?: string | null
    ours: {
        summary?: { backlinks?: number; referring_domains?: number; spam_score?: number; rank?: number }
        anchors?: Array<{ anchor: string; backlinks?: number; referring_domains?: number; first_seen?: string; lost_date?: string }>
        referringDomains?: Array<{ domain?: string; rank?: number; backlinks?: number; first_seen?: string; lost_date?: string; is_lost?: boolean }>
        lostLinks?: Array<{ domain?: string; rank?: number; lost_date?: string; is_lost?: boolean }>
        linkGap?: Array<{ domain?: string; rank?: number; intersections?: number }>
        enrichmentMissing: string[]
    }
    competitors: Array<{
        domain: string
        summary?: { backlinks?: number; referring_domains?: number; spam_score?: number; rank?: number }
        anchors?: Array<{ anchor: string; backlinks?: number; referring_domains?: number }>
        referringDomains?: Array<{ domain?: string; rank?: number }>
        enrichmentMissing: string[]
    }>
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
}

function buildLinkAuditPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const dfs = opts.dfsData as LinkAuditDfsShape | undefined
    if (!dfs) throw new Error('link_audit: dfsData prefetch is required')

    // Phase E2 soft-fail — when backlinks API unavailable, prompt explicitly
    // tells the model to render a partial result + clear "data unavailable"
    // banner instead of inventing numbers.
    const degradedBanner = !dfs.backlinksApiAvailable
        ? `\n**⚠ אזהרה — שלב פועל במצב מוגבל:** ${dfs.subscriptionFailureMessage || 'נתוני DataForSEO Backlinks לא זמינים.'}\nעליכם להפיק פלט עם confidence: working_hypothesis בכל הרשומות, להסביר במפורש בתקציר המנהלים שהאודיט נעשה ללא נתוני backlinks חיים, ולהציע תוכנית outreach generic מבוססת על נוף המתחרים בלבד.\n`
        : ''

    // ─ Render our domain summary ─
    const oursSummary = dfs.ours.summary
        ? `- backlinks: ${oursSummary_safe(dfs.ours.summary.backlinks)}\n- referring_domains: ${oursSummary_safe(dfs.ours.summary.referring_domains)}\n- spam_score: ${oursSummary_safe(dfs.ours.summary.spam_score)}\n- domain_rank: ${oursSummary_safe(dfs.ours.summary.rank)}`
        : '*(אין summary — DFS לא החזיר נתונים)*'

    const oursAnchorsTable = dfs.ours.anchors && dfs.ours.anchors.length
        ? renderAnchorsTable(dfs.ours.anchors.slice(0, 25))
        : '*(אין anchors data)*'

    const lostLinksTable = dfs.ours.lostLinks && dfs.ours.lostLinks.length
        ? renderLostLinksTable(dfs.ours.lostLinks.slice(0, 30))
        : '*(אין lost links — או שלא נמצאו, או שהנתון לא זמין)*'

    const linkGapTable = dfs.ours.linkGap && dfs.ours.linkGap.length
        ? renderLinkGapTable(dfs.ours.linkGap.slice(0, 30))
        : '*(אין link-gap data)*'

    // ─ Render competitor comparison table ─
    const competitorTable = dfs.competitors.length
        ? renderCompetitorLinkTable(dfs.competitors)
        : '*(אין נתוני מתחרים)*'

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 3000,
        prompt: `# אודיט פרופיל קישורים — "${businessName}"

## תיאור העסק
${businessDesc}
${haBlock}
${degradedBanner}
## נתוני DataForSEO Backlinks — verbatim, אסור להמציא

**מקור:** DataForSEO Backlinks live data, ${new Date().toISOString().slice(0, 10)} | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)

### הדומיין שלנו: \`${dfs.ourDomain}\`

**Summary:**
${oursSummary}

**Top 25 anchors (top by backlinks):**
${oursAnchorsTable}

**Top 30 lost referring domains (recovery candidates):**
${lostLinksTable}

**Top 30 link-gap candidates (linking to competitors but not us):**
${linkGapTable}

### Top ${dfs.competitors.length} competitors — link profile comparison
${competitorTable}

---

## פקודות עבודה

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: תקציר מנהלים (markdown — בעברית, 2-3 פסקאות)
איפה אנחנו עומדים מבחינת link authority? ראשית, מספרים — backlinks, referring_domains, רמת spam, domain rank. שנית, השוואה — איפה אנחנו ביחס לממוצע 5 המתחרים המובילים? שלישית — מה 3 הצעדים הקריטיים לפעולה?

### חלק 2: רשומות JSON — outreach + recovery targets (חובה)

\`\`\`json
{
  "our_profile_summary": {
    "backlinks_total": 0,
    "referring_domains_total": 0,
    "spam_score": 0,
    "domain_rank": 0,
    "vs_competitors_summary": "1-2 משפטים — איפה אנחנו עומדים מול ממוצע top 5 (fewer/similar/more referring domains, anchor mix נקי/spammy)",
    "confidence": "high | medium | working_hypothesis"
  },
  "anchor_distribution_analysis": {
    "branded_pct": 0,
    "exact_match_pct": 0,
    "naked_url_pct": 0,
    "generic_pct": 0,
    "topical_pct": 0,
    "_note": "סיווג לפי מילים: brand-name → branded; keyword exact-match → exact; URL → naked_url; click here / here → generic; topic terms → topical.",
    "risk_flags": ["over_optimization | spam_anchor_pattern | thin_diversity | none"],
    "confidence": "high | medium | working_hypothesis"
  },
  "records": [
    {
      "type": "lost_link_recovery" | "link_gap_outreach" | "anchor_remediation" | "spam_disavow",
      "domain": "domain.com",
      "current_rank": 0,
      "_metric": "סוג המטריקה הרלוונטית: lost_date / intersections / spam_score / over_optimized_anchor",
      "_metric_value": "ערך הספציפי",
      "outreach_angle": "1-2 משפטים בעברית — למה הם ירצו לקשר אלינו, או איך מתחילים שיחה",
      "priority": "high | medium | low",
      "estimated_effort_hours": 0,
      "owner": "תפקיד אחראי בעברית: 'מנהל SEO' / 'מנהל תוכן' / 'מייסד' / 'סוכנות חיצונית'",
      "timeline": "תוך X ימים/שבועות (במספר ובעברית)",
      "evidence": ["dfs_referring_domains", "dfs_competitors_intersections", "dfs_anchors"],
      "confidence": "high | medium | working_hypothesis"
    }
  ],
  "competitor_link_benchmarks": [
    {
      "domain": "competitor.com",
      "backlinks": 0,
      "referring_domains": 0,
      "domain_rank": 0,
      "spam_score": 0,
      "vs_us": "ahead | similar | behind",
      "key_anchor_pattern": "1 משפט — איזה anchor pattern הם מנצלים שאנחנו לא",
      "evidence": ["dfs_competitor_summary", "dfs_competitor_anchors"]
    }
  ],
  "velocity_signal": {
    "_note": "אם referringDomains מכיל first_seen — חישוב גס של new referring domains ב-30/90 יום. אם לא — סמנו unavailable.",
    "new_referring_30d": 0,
    "new_referring_90d": 0,
    "comparison_to_top_competitor": "stronger | similar | weaker | unavailable",
    "confidence": "high | medium | working_hypothesis"
  },
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- **records** מינימום 12 רשומות, מתוכם:
  - לפחות 3 \`lost_link_recovery\` (אם יש lost links data)
  - לפחות 5 \`link_gap_outreach\` (אם יש linkGap data)
  - לפחות 1 \`anchor_remediation\` אם זוהה over-optimization (exact_match_pct > 30%)
  - לפחות 1 \`spam_disavow\` אם זוהו דומיינים מפנים עם spam_score > 70
- כל record עם evidence array שמסביר מאיזה DFS endpoint הגיע הנתון
- Priority: high קודם, אחר כך medium, לבסוף low
- אם DFS data חסר לקטגוריה (\`enrichmentMissing\` מציין) — סמנו את הסעיף כ-confidence: working_hypothesis

### חלק 3: תוכנית outreach 30 יום (markdown, בעברית)
חלוקת 12 הרשומות ל-3 שבועות:
- שבוע 1 (high priority): top 4 קישורים שאבדו + 4 link-gap מועמדים עם אותו owner
- שבוע 2-3 (medium): שאר הרשומות
- שבוע 4: מעקב + מדידה

לכל שבוע — שעות מאמץ צפויות + KPI סוף שבוע (referring_domains gained / outreach emails sent / response rate).

### חלק 4: סיכונים ומיטיגציות (markdown, בעברית)
3-5 סיכונים קונקרטיים בתוכנית הקישורים: penalty risk מ-anchor patterns, spam injection, lost authority, רגרסיה. לכל סיכון — מיטיגציה ספציפית.

---

${QUALITY_GATE_INSTRUCTIONS}
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Render helpers for link_audit DFS data tables.

function oursSummary_safe(v: unknown): string {
    if (v === undefined || v === null) return 'unavailable'
    if (typeof v === 'number') return v.toLocaleString()
    return String(v)
}

function renderAnchorsTable(anchors: Array<{ anchor: string; backlinks?: number; referring_domains?: number }>): string {
    const rows = anchors.map(a => `| ${a.anchor.replace(/\|/g, '\\|')} | ${a.backlinks ?? '—'} | ${a.referring_domains ?? '—'} |`).join('\n')
    return `| anchor | backlinks | referring_domains |\n|---|---|---|\n${rows}`
}

function renderLostLinksTable(lost: Array<{ domain?: string; rank?: number; lost_date?: string; is_lost?: boolean }>): string {
    const rows = lost.map(l => `| ${l.domain ?? '—'} | ${l.rank ?? '—'} | ${l.lost_date ?? '—'} | ${l.is_lost ? 'yes' : 'no'} |`).join('\n')
    return `| domain | rank | lost_date | is_lost |\n|---|---|---|---|\n${rows}`
}

function renderLinkGapTable(gap: Array<{ domain?: string; rank?: number; intersections?: number }>): string {
    const rows = gap.map(g => `| ${g.domain ?? '—'} | ${g.rank ?? '—'} | ${g.intersections ?? '—'} |`).join('\n')
    return `| domain | rank | intersects competitors |\n|---|---|---|\n${rows}`
}

function renderCompetitorLinkTable(comps: LinkAuditDfsShape['competitors']): string {
    const rows = comps.map(c => {
        const s = c.summary || {}
        return `| ${c.domain} | ${s.backlinks ?? '—'} | ${s.referring_domains ?? '—'} | ${s.spam_score ?? '—'} | ${s.rank ?? '—'} |`
    }).join('\n')
    return `| competitor | backlinks | referring_domains | spam_score | rank |\n|---|---|---|---|---|\n${rows}`
}

// ────────────────────────────────────────────────────────────────────────────
// internal_seo_audit — Phase E1.2. Comprehensive technical + on-page audit
// of OUR domain. Feeds aeo_visibility (schema gaps), link_audit (priority
// pages), strategy_options (technical-debt hours), content_plan (refresh-vs-
// new decisions per existing URL).
// ────────────────────────────────────────────────────────────────────────────

interface InternalSeoAuditDfsShape {
    ourDomain: string
    sitemap: { url: string | null; entryCount: number; fetchedOk: boolean; notes: string[] }
    robotsTxt: { present: boolean; sitemapReference: string | null; disallowCount: number; rawLength: number; notes: string[] }
    urls: Array<{
        url: string
        pathDepth: number
        title?: string
        titleLength?: number
        metaDescription?: string
        metaLength?: number
        canonicalUrl?: string
        canonicalSelf?: boolean
        h1List: string[]
        h1Count: number
        h2Count: number
        wordCount?: number
        onpageScore?: number
        schemaTypes: string[]
        pageTiming?: { lcp_ms?: number; tti_ms?: number; dom_complete_ms?: number }
        dfsIssues: string[]
        inferredPageType: string
        clientIssues: string[]
        fetchOk: boolean
    }>
    aggregate: {
        crawledCount: number
        avgWordCount: number
        thinContentCount: number
        urlsWithoutSchema: number
        urlsWithoutCanonical: number
        urlsWithMissingMeta: number
        urlsWithDuplicateTitle: Array<{ title: string; urls: string[] }>
        urlsWithDuplicateH1: Array<{ h1: string; urls: string[] }>
        urlsWithDuplicateMeta: Array<{ meta: string; urls: string[] }>
        avgOnpageScore: number
        deepPagesCount: number
        schemaTypeFrequency: Record<string, number>
    }
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
    enrichmentMissing: string[]
}

function buildInternalSeoAuditPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const dfs = opts.dfsData as InternalSeoAuditDfsShape | undefined
    if (!dfs) throw new Error('internal_seo_audit: dfsData prefetch is required')

    // Render URL audit table — most-impactful first (low onpage_score + thin content + bad path depth)
    const urlsSorted = [...dfs.urls].sort((a, b) => {
        const aS = (a.onpageScore ?? 50) - (a.clientIssues.length * 5)
        const bS = (b.onpageScore ?? 50) - (b.clientIssues.length * 5)
        return aS - bS
    })
    const urlTable = renderInternalAuditUrlTable(urlsSorted.slice(0, 50))
    const dupesBlock = renderInternalAuditDupes(dfs.aggregate)
    const schemaCoverageBlock = renderInternalAuditSchemaCoverage(dfs)

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 3000,
        prompt: `# אודיט SEO פנימי מקיף — "${businessName}"

## תיאור העסק
${businessDesc}
${haBlock}

## נתוני האודיט — verbatim, אסור להמציא מספרים

**מקור:** DataForSEO on-page (${new Date().toISOString().slice(0, 10)}) + sitemap.xml + robots.txt | ${dfs.urls.length} URLs נסרקו | $${dfs.totalCostUsd.toFixed(4)} (${dfs.cacheHits}/${dfs.cacheHits + dfs.cacheMisses} cache hits)${dfs.enrichmentMissing.length ? ' | partial: ' + dfs.enrichmentMissing.join(', ') : ''}

### Site inventory
- **Domain:** \`${dfs.ourDomain}\`
- **Sitemap:** ${dfs.sitemap.url ? `\`${dfs.sitemap.url}\` — ${dfs.sitemap.entryCount} entries (sampled ${dfs.urls.length})` : '*(לא נמצא sitemap.xml — flag חשוב)*'}
- **robots.txt:** ${dfs.robotsTxt.present ? `נוכח (${dfs.robotsTxt.rawLength} chars, ${dfs.robotsTxt.disallowCount} Disallow rules${dfs.robotsTxt.sitemapReference ? `, sitemap ref → ${dfs.robotsTxt.sitemapReference}` : ', אין הפניה ל-sitemap'})` : '*(robots.txt חסר — flag חשוב)*'}
- **Sampled URLs:** ${dfs.aggregate.crawledCount} | **Avg word count:** ${dfs.aggregate.avgWordCount} | **Avg on-page score:** ${dfs.aggregate.avgOnpageScore}/100
- **Thin content (<300 מילים):** ${dfs.aggregate.thinContentCount} URLs
- **Without schema:** ${dfs.aggregate.urlsWithoutSchema} | **Without canonical:** ${dfs.aggregate.urlsWithoutCanonical} | **Missing meta description:** ${dfs.aggregate.urlsWithMissingMeta}
- **Deep pages (path depth ≥4):** ${dfs.aggregate.deepPagesCount}

### URL audit — top 50 by impact (low score + many issues first)
${urlTable}

### Duplicate detection
${dupesBlock}

### Schema coverage by page-type
${schemaCoverageBlock}

---

## פקודות עבודה

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

${DFS_DATA_RULE}

---

## פלט נדרש

### חלק 1: תקציר מנהלים (markdown — בעברית, 2-3 פסקאות)
3 דברים: (א) בריאות טכנית כללית — לאן הנקודה החזקה ביותר ולאן החלשה ביותר; (ב) הסיכון הכי דחוף — מה יקלקל לנו את ה-SEO אם לא נטפל מיד (אינדקסציה? duplicate? thin? schema?); (ג) ההזדמנות הכי גדולה — מה השיפור עם ROI הגבוה ביותר ביחס למאמץ.

### חלק 2: רשומות JSON — URL audit + תוכנית תיקון (חובה!)

\`\`\`json
{
  "site_health_summary": {
    "overall_score_0_100": 0,
    "indexable_pages": 0,
    "sitemap_status": "complete | partial | missing",
    "robots_status": "good | needs_review | missing",
    "schema_coverage_pct": 0,
    "thin_content_pct": 0,
    "duplicate_titles_count": 0,
    "duplicate_h1_count": 0,
    "duplicate_meta_count": 0,
    "avg_word_count": 0,
    "avg_onpage_score": 0,
    "deep_pages_pct": 0,
    "biggest_strength": "1 משפט בעברית",
    "biggest_weakness": "1 משפט בעברית",
    "confidence": "high | medium | working_hypothesis"
  },
  "records": [
    {
      "url": "https://...",
      "page_type": "homepage | pillar | spoke | product | service | category | faq | blog_post | local_page | about | contact | pricing | other",
      "title": "...",
      "title_length": 0,
      "meta_description": "...",
      "meta_length": 0,
      "h1": "...",
      "word_count": 0,
      "onpage_score": 0,
      "path_depth": 0,
      "schemas_present": [],
      "schemas_missing": [],
      "issues_critical": ["thin_content / no_schema / duplicate_title / missing_canonical / etc — only the SHOWSTOPPERS"],
      "issues_warning": ["short_meta_description / multiple_h1 / etc — would-be-nice"],
      "priority_action": "1-2 משפטים בעברית — מה לתקן ראשון בעמוד הזה",
      "owner": "תפקיד אחראי בעברית: 'מנהל SEO' / 'מנהל תוכן' / 'מפתח'",
      "estimated_effort_hours": 0,
      "expected_impact": "high | medium | low",
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["dfs_onpage_audit"]
    }
  ],
  "schema_gap_analysis": [
    {
      "page_type": "homepage / product / service / faq / וכו'",
      "expected_schemas": ["Organization", "WebSite"],
      "present_in_pct": 0,
      "missing_urls_count": 0,
      "priority": "high | medium | low",
      "implementation_note": "1 משפט בעברית — איך להוסיף ב-batch + שעות מאמץ צפויות"
    }
  ],
  "ia_findings": {
    "_note": "Information Architecture — based on URL path depth (rough proxy until Phase E2 adds full link-graph crawl)",
    "deep_pages_count": 0,
    "deep_pages_examples": ["url1", "url2"],
    "depth_distribution": {
      "depth_0_homepage": 0,
      "depth_1": 0,
      "depth_2": 0,
      "depth_3": 0,
      "depth_4_plus": 0
    },
    "recommendation": "1-2 משפטים בעברית — האם המבנה שטוח מדי / עמוק מדי / מתאים?"
  },
  "duplicate_consolidation_plan": [
    {
      "duplicate_type": "title | h1 | meta",
      "urls_affected": ["url1", "url2"],
      "recommended_resolution": "1 משפט בעברית — merge / split / canonicalize / rewrite",
      "owner": "תפקיד בעברית",
      "priority": "high | medium | low"
    }
  ],
  "content_pruning_matrix": [
    {
      "_note": "Phase QA — ההחלטה הסטנדרטית של אודיט SEO רציני: לכל URL מ-records[] קבעו פעולה אחת. אסור לדלג על URL.",
      "url": "URL מהinventory",
      "decision": "keep | refresh | merge | canonicalize | delete | noindex",
      "rationale": "1-2 משפטים בעברית: למה החלטה זו. דוגמה: 'דף thin עם 120 מילים, 0 traffic ב-90 יום, אין שום link → delete; 301 ל-/about'.",
      "merge_target_url": "אם decision=merge — URL היעד אליו לאחד תוכן ולעשות 301",
      "canonical_target_url": "אם decision=canonicalize — URL הקנוני (לא מבטיח 301, רק link rel=canonical)",
      "estimated_traffic_at_risk": "high | medium | low | none — מבוסס על onpage_score + word_count",
      "owner": "תפקיד אחראי בעברית: 'מנהל SEO' / 'מנהל תוכן' / 'מפתח'",
      "estimated_effort_hours": 0,
      "priority": "high | medium | low",
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["onpage_audit", "client_issues", "duplicate_check"]
    }
  ],
  "tech_debt_summary": {
    "_note": "agg של שעות עבודה לפי category — לעבור ל-strategy_options כקלט ל-cost modeling",
    "by_category_hours": {
      "schema_implementation": 0,
      "content_thinness_fix": 0,
      "meta_rewrites": 0,
      "duplicate_consolidation": 0,
      "ia_restructure": 0,
      "technical_fixes": 0
    },
    "total_hours_estimate": 0,
    "confidence": "high | medium | working_hypothesis"
  },
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- **records:** רשומה לכל URL שנסרק (${dfs.urls.length} URLs). אסור להחסיר. אסור להמציא URLs שלא ב-data.
- כל \`issues_critical\` ו-\`issues_warning\` חייבים להיות מתוך הקודים שמופיעים ב-\`clientIssues\` או \`dfsIssues\` של ה-URL — אסור להמציא issues חדשים.
- \`schemas_missing\` = expected_schemas[page_type] − schemas_present (server קלקליישן בודק את זה).
- \`priority_action\` חייב להיות פעיל וקונקרטי — לא "לבדוק את הdocs" אלא "להוסיף FAQ schema markup ל-X דפי שאלות נפוצות".
- \`schema_gap_analysis\` אגרגציה לפי page_type — מינימום entry אחד לכל page_type שמופיע ב-records.
- \`tech_debt_summary.total_hours_estimate\` חייב להיות סכום אמיתי של שעות מ-records.
- **\`content_pruning_matrix\` חובה:** רשומה אחת לכל URL מ-\`records[]\`. אסור לדלג. החלטה אחת: keep / refresh / merge / canonicalize / delete / noindex. אם decision=merge חובה למלא \`merge_target_url\` עם URL אחר מאותה inventory. אם decision=canonicalize חובה \`canonical_target_url\`.
- אם נתון חסר (DFS לא החזיר) — confidence: working_hypothesis עם הסבר ב-evidence.

### חלק 3: 5 פעולות "fix this first" (markdown — בעברית בלבד)
מבחר 5 הפעולות עם הImpact/Effort הטוב ביותר. כל אחת:
- מה לתקן (קונקרטי, איזה URLs)
- למה זה חשוב (impact business)
- כמה שעות / כמה כסף לסוכנות חיצונית (אם רלוונטי)
- מי האחראי
- timeline (תוך X ימים)
- inline marker של ביטחון

### חלק 4: Roadmap טכני 90 יום (markdown — בעברית בלבד)
חלוקה לחודש 1 / חודש 2 / חודש 3 — מה הכי דחוף קודם, מה תלוי במה. KPI סוף כל חודש (avg onpage score / thin content count / schema coverage %).

---

${QUALITY_GATE_INSTRUCTIONS}
${feedbackLine}`,
    }
}

// ─── Render helpers for internal_seo_audit DFS data ───────────────────────

function renderInternalAuditUrlTable(urls: InternalSeoAuditDfsShape['urls']): string {
    if (urls.length === 0) return '*(אין URLs נסרקו)*'
    const rows = urls.map(u => {
        const issues = [...u.clientIssues, ...u.dfsIssues].slice(0, 5).join(', ') || '—'
        return `| ${u.url} | ${u.inferredPageType} | ${u.titleLength ?? '—'} | ${u.metaLength ?? '—'} | ${u.h1Count} | ${u.wordCount ?? '—'} | ${u.onpageScore ?? '—'} | ${u.schemaTypes.length} | ${issues} |`
    }).join('\n')
    return `| URL | page_type | title_len | meta_len | h1# | words | onpage_score | schema# | issues |\n|---|---|---|---|---|---|---|---|---|\n${rows}`
}

function renderInternalAuditDupes(agg: InternalSeoAuditDfsShape['aggregate']): string {
    const out: string[] = []
    if (agg.urlsWithDuplicateTitle.length > 0) {
        out.push('**Duplicate titles:**')
        for (const d of agg.urlsWithDuplicateTitle.slice(0, 10)) {
            out.push(`- "${d.title}" → ${d.urls.length} URLs: ${d.urls.slice(0, 3).join(', ')}${d.urls.length > 3 ? ` (+${d.urls.length - 3})` : ''}`)
        }
    }
    if (agg.urlsWithDuplicateH1.length > 0) {
        out.push('\n**Duplicate H1:**')
        for (const d of agg.urlsWithDuplicateH1.slice(0, 10)) {
            out.push(`- "${d.h1}" → ${d.urls.length} URLs`)
        }
    }
    if (agg.urlsWithDuplicateMeta.length > 0) {
        out.push('\n**Duplicate meta descriptions:**')
        for (const d of agg.urlsWithDuplicateMeta.slice(0, 10)) {
            out.push(`- ${d.urls.length} URLs share the same meta`)
        }
    }
    return out.join('\n') || '*(אין duplicates שזוהו ב-50 URLs שנסרקו — flag positive)*'
}

function renderInternalAuditSchemaCoverage(dfs: InternalSeoAuditDfsShape): string {
    const byType: Record<string, { count: number; withSchema: number; schemas: Set<string> }> = {}
    for (const u of dfs.urls) {
        if (!u.fetchOk) continue
        if (!byType[u.inferredPageType]) byType[u.inferredPageType] = { count: 0, withSchema: 0, schemas: new Set() }
        byType[u.inferredPageType].count++
        if (u.schemaTypes.length > 0) byType[u.inferredPageType].withSchema++
        for (const s of u.schemaTypes) byType[u.inferredPageType].schemas.add(s)
    }
    const rows = Object.entries(byType).map(([pt, v]) => {
        const pct = v.count > 0 ? Math.round((v.withSchema / v.count) * 100) : 0
        const schemas = Array.from(v.schemas).join(', ') || '—'
        return `| ${pt} | ${v.count} | ${v.withSchema} (${pct}%) | ${schemas} |`
    }).join('\n')
    return `| page_type | total | with_schema | schemas_found |\n|---|---|---|---|\n${rows}`
}

// ────────────────────────────────────────────────────────────────────────────
// aeo_visibility — Phase E1.1. AI-search visibility audit.
// Reads internal_seo_audit (schema coverage) + seo_keyword_research (queries
// to probe) upstream. Anthropic citation probes drive the visibility metric.
// ────────────────────────────────────────────────────────────────────────────

interface AeoVisibilityDfsShape {
    ourDomain: string | null
    hasUpstream: boolean
    upstreamMissing: string[]
    topUrls: Array<{ url: string; inferredPageType?: string; schemaTypes?: string[]; h1List?: string[]; wordCount?: number }>
    priorityKeywords: Array<{ keyword?: string; intent?: { primary?: string }; opportunity?: { decision?: string; total?: number }; aeo?: { is_priority?: boolean; total?: number }; cluster?: string }>
    citationProbes: Array<{
        query: string
        sourceKeyword: string
        brandCited: boolean
        brandPosition: number | null
        competitorsCited: string[]
        excerpt: string
        sentiment: 'positive' | 'neutral' | 'negative' | 'not_cited'
    }>
    citationStats: {
        probes_run: number
        brand_cited_count: number
        brand_cited_pct: number
        avg_brand_position: number | null
        most_cited_competitor: string | null
        competitor_citation_frequency: Record<string, number>
    }
    aeoSchemaGaps: Array<{ schema_type: string; why_critical_for_aeo: string; urls_affected_count: number }>
    totalCostUsd: number
    enrichmentMissing: string[]
}

function buildAeoVisibilityPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const dfs = opts.dfsData as AeoVisibilityDfsShape | undefined
    if (!dfs) throw new Error('aeo_visibility: dfsData prefetch is required')

    const probesTable = dfs.citationProbes.length > 0
        ? renderAeoProbesTable(dfs.citationProbes)
        : '*(לא הורצו citation probes — חסר upstream או לא הוגדר API key)*'
    const competitorRanking = renderAeoCompetitorRanking(dfs.citationStats.competitor_citation_frequency, businessName)
    const schemaGapsTable = renderAeoSchemaGapsTable(dfs.aeoSchemaGaps)
    const upstreamWarning = dfs.upstreamMissing.length > 0
        ? `\n**⚠ Upstream חסר:** ${dfs.upstreamMissing.join(', ')}. השלב יפעל ב-degraded mode על בסיס מה שיש.\n`
        : ''

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 2500,
        prompt: `# נראות AI (AEO) — "${businessName}"

## תיאור העסק
${businessDesc}
${haBlock}
${upstreamWarning}

## נתוני האודיט — verbatim, אסור להמציא

**מקור:** Anthropic citation probes (${new Date().toISOString().slice(0, 10)}) + upstream internal_seo_audit + seo_keyword_research | $${dfs.totalCostUsd.toFixed(4)}${dfs.enrichmentMissing.length ? ' | partial: ' + dfs.enrichmentMissing.join(', ') : ''}

### Brand citation summary
- **Probes run:** ${dfs.citationStats.probes_run}
- **Brand cited:** ${dfs.citationStats.brand_cited_count}/${dfs.citationStats.probes_run} (${dfs.citationStats.brand_cited_pct}%)
- **Avg position when cited:** ${dfs.citationStats.avg_brand_position ?? 'לא צוטטנו אף פעם'}
- **Most-cited competitor:** ${dfs.citationStats.most_cited_competitor || '—'}

### Citation probes — query × response
${probesTable}

### Competitor citation ranking — מי מקבל ציטוטים ב-AI search
${competitorRanking}

### AEO Schema gaps (cross-referenced עם internal_seo_audit)
${schemaGapsTable}

### URLs sample from internal audit
${dfs.topUrls.length > 0 ? renderAeoTopUrls(dfs.topUrls.slice(0, 15)) : '*(אין נתוני internal_seo_audit — שלב upstream לא רץ)*'}

---

## פקודות עבודה

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: תקציר מנהלים (markdown — בעברית, 2-3 פסקאות)
שלוש שאלות מרכזיות: (א) **המוניטין שלכם ב-AI search** — האם LLMs מציגים אתכם כשאנשים שואלים על הקטגוריה? באיזה דירוג? לעומת מי? (ב) **Extractability gap** — אילו schema critical חסרים ולכמה דפים? (ג) **תוכנית AEO 90 יום** — 3 פעולות בסדר עדיפות עם expected ROI ב-AEO.

### חלק 2: רשומות JSON — AEO targets + actions (חובה!)

\`\`\`json
{
  "aeo_summary": {
    "brand_visibility_score_0_100": 0,
    "brand_cited_pct": 0,
    "avg_position_when_cited": 0,
    "schema_coverage_for_aeo_pct": 0,
    "extractability_grade": "A | B | C | D | F",
    "biggest_gap": "1 משפט בעברית",
    "biggest_quick_win": "1 משפט בעברית",
    "confidence": "high | medium | working_hypothesis"
  },
  "records": [
    {
      "type": "schema_implementation | content_extractability_upgrade | citation_outreach | structured_data_audit | answer_block_optimization",
      "target": "URL או page_type או keyword cluster",
      "_target_kind": "url | page_type | cluster",
      "current_state": "1-2 משפטים בעברית — מה המצב היום (no_schema / thin_answer_blocks / weak_entity_signals / וכו')",
      "recommended_action": "2-3 משפטים בעברית — מה לעשות בדיוק",
      "expected_aeo_impact": "high | medium | low",
      "rationale": "1-2 משפטים — למה זה משפר נראות ב-AI search ספציפית",
      "owner": "תפקיד אחראי בעברית: 'מנהל SEO' / 'מנהל תוכן' / 'מפתח'",
      "estimated_effort_hours": 0,
      "timeline": "תוך X ימים/שבועות (במספר ובעברית)",
      "evidence": ["citation_probe", "schema_gap_analysis", "upstream_internal_audit"],
      "confidence": "high | medium | working_hypothesis"
    }
  ],
  "schema_priority_plan": [
    {
      "schema_type": "FAQPage | HowTo | Article | Organization | Product | LocalBusiness",
      "urls_to_add_count": 0,
      "url_examples": ["url1", "url2"],
      "implementation_approach": "1 משפט בעברית — איך מיישמים (gtm template / cms field / hardcoded)",
      "expected_aio_lift": "1 משפט בעברית — איך זה ישפר נראות ב-AI Overview / PAA",
      "owner": "תפקיד בעברית",
      "estimated_effort_hours": 0,
      "priority": "high | medium | low"
    }
  ],
  "competitor_aeo_advantage": [
    {
      "competitor": "competitor.com",
      "cited_in_probes": 0,
      "what_they_do_better": "1-2 משפטים בעברית — schema פעיל אצלם / content type / brand authority / וכו'",
      "lesson_to_apply": "1 משפט בעברית — איך אנחנו מצמצמים את הפער",
      "evidence": ["citation_probe"]
    }
  ],
  "extractability_audit": {
    "_note": "לפי upstream internal_seo_audit + h1 patterns + schema coverage",
    "pages_with_strong_extractability_count": 0,
    "pages_with_weak_extractability_count": 0,
    "weak_extractability_url_examples": ["url1", "url2"],
    "common_weakness_patterns": ["thin_above_fold | no_definition_blocks | no_data_points | walls_of_text | no_summary_para"],
    "confidence": "high | medium | working_hypothesis"
  },
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- **records** מינימום 8: לפחות 3 \`schema_implementation\` (אם יש gaps), לפחות 2 \`content_extractability_upgrade\`, לפחות 1 \`answer_block_optimization\`. השאר לפי שיקול.
- כל record עם evidence מרשימת ה-DFS data במקור — אסור להמציא evidence sources.
- \`schema_priority_plan\` חייב לכסות את כל ה-aeoSchemaGaps שזוהו.
- \`competitor_aeo_advantage\` רשומה לכל competitor שצוטט באחד מהprobes.
- אם \`probes_run = 0\` — כל confidence: working_hypothesis עם הסבר ב-rationale.

### חלק 3: 5 פעולות AEO לרבעון הבא (markdown — בעברית בלבד)
מבחר 5 הפעולות עם ה-impact/effort הטוב ביותר ל-AEO ספציפית. כל פעולה: מה לעשות, למה זה משפר AI search, מי האחראי, timeline, ROI צפוי.

### חלק 4: השוואה — אנחנו vs מי שמצוטט (markdown — בעברית בלבד)
לכל competitor שצוטט בלפחות 2 probes, פסקה: מה הם עושים שאנחנו לא? schema פעיל? content depth? brand authority? איך אנחנו מצמצמים את הפער?

---

${QUALITY_GATE_INSTRUCTIONS}
${feedbackLine}`,
    }
}

function renderAeoProbesTable(probes: AeoVisibilityDfsShape['citationProbes']): string {
    const rows = probes.map(p => {
        const status = p.brandCited ? `✓ position ${p.brandPosition ?? '?'}` : '✗ not cited'
        const compsList = p.competitorsCited.slice(0, 3).join(', ') || '—'
        return `| ${p.sourceKeyword} | ${status} | ${p.sentiment} | ${compsList} |`
    }).join('\n')
    return `| keyword (probed) | brand citation | sentiment | top competitors cited |\n|---|---|---|---|\n${rows}`
}

function renderAeoCompetitorRanking(freq: Record<string, number>, ownBrand: string): string {
    const sorted = Object.entries(freq)
        .filter(([k]) => k.toLowerCase() !== ownBrand.toLowerCase())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    if (sorted.length === 0) return '*(לא זוהו competitors בציטוטים)*'
    const rows = sorted.map(([name, count]) => `| ${name} | ${count} |`).join('\n')
    return `| competitor | citations across probes |\n|---|---|\n${rows}`
}

function renderAeoSchemaGapsTable(gaps: AeoVisibilityDfsShape['aeoSchemaGaps']): string {
    if (gaps.length === 0) return '*(אין schema gaps זוהוו — flag positive)*'
    const rows = gaps.map(g => `| ${g.schema_type} | ${g.urls_affected_count} | ${g.why_critical_for_aeo} |`).join('\n')
    return `| schema_type | urls_affected | למה קריטי ל-AEO |\n|---|---|---|\n${rows}`
}

function renderAeoTopUrls(urls: AeoVisibilityDfsShape['topUrls']): string {
    const rows = urls.map(u => {
        const schemas = (u.schemaTypes || []).join(', ') || '—'
        return `| ${u.url} | ${u.inferredPageType ?? '—'} | ${u.wordCount ?? '—'} | ${schemas} |`
    }).join('\n')
    return `| URL | page_type | words | schemas |\n|---|---|---|---|\n${rows}`
}

// ─── Phase E5 — vertical benchmarks block for validation prompt ────────────

function buildVerticalBenchmarksBlock(answers: Record<string, unknown>, _rd: ResearchDataV2): string {
    const vertical = classifyVertical(answers)
    const bench = IL_VERTICAL_BENCHMARKS[vertical]
    const risksText = bench.vertical_risks_he.length
        ? bench.vertical_risks_he.map(r => `  - ${r}`).join('\n')
        : '  - *(אין סיכונים ספציפיים מתועדים)*'
    const quickWinsText = bench.quick_win_patterns_he.length
        ? bench.quick_win_patterns_he.map(q => `  - ${q}`).join('\n')
        : '  - *(אין quick-wins ספציפיים מתועדים)*'
    return `### Vertical benchmarks (Phase E5 — IL market reality check)

**Classified vertical:** ${vertical} (${bench.label_he})

${bench.misclassification_warnings.length ? '⚠ **misclassification warnings:**\n' + bench.misclassification_warnings.map(w => '  - ' + w).join('\n') + '\n\nאם vertical שגוי — ציינו ב-validation output ועדכנו את ההמלצות בהתאם.\n' : ''}

**Realistic ranges לעסק ב-vertical הזה:**
- **Median time-to-rank top_3:** Smart ${bench.median_t2r_top_3_months.smart} חודשים | Aggressive ${bench.median_t2r_top_3_months.aggressive} חודשים
- **Top_10 count by month 12:** Smart ${bench.realistic_top_10_count_m12.smart.min}-${bench.realistic_top_10_count_m12.smart.max} | Aggressive ${bench.realistic_top_10_count_m12.aggressive.min}-${bench.realistic_top_10_count_m12.aggressive.max}
- **Top_3 count by month 12:** Smart ${bench.realistic_top_3_count_m12.smart.min}-${bench.realistic_top_3_count_m12.smart.max} | Aggressive ${bench.realistic_top_3_count_m12.aggressive.min}-${bench.realistic_top_3_count_m12.aggressive.max}
- **Realistic monthly organic clicks at M12:** Smart ${bench.realistic_monthly_clicks_m12.smart.min.toLocaleString()}-${bench.realistic_monthly_clicks_m12.smart.max.toLocaleString()} | Aggressive ${bench.realistic_monthly_clicks_m12.aggressive.min.toLocaleString()}-${bench.realistic_monthly_clicks_m12.aggressive.max.toLocaleString()}
- **Avg click value:** ₪${bench.avg_click_value_ils.min}-${bench.avg_click_value_ils.max} (לחישוב MRR sanity)

**Vertical-specific risks:**
${risksText}

**Quick-win patterns שעובדים ב-vertical הזה:**
${quickWinsText}

**שימוש בולידציה:** השוו את forecast ה-strategy_options מול הטווחים האלה. flag כל סטייה מעל 50% למעלה (אופטימיות יתר → hard fail) או 30% למטה (פסימיות → warning).`
}

// ─── Phase E4 helpers — read calibrated values from cost_timeline_modeling ──

function getNested(obj: unknown, path: string): string {
    const parts = path.split('.')
    let cur: unknown = obj
    for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as object)) {
            cur = (cur as Record<string, unknown>)[p]
        } else {
            return '?'
        }
    }
    if (typeof cur === 'number') return cur.toLocaleString()
    if (typeof cur === 'string') return cur
    return '?'
}

function ctmKpiSnapshot(kpis: unknown): string {
    if (!Array.isArray(kpis)) return '?'
    const m3 = kpis.find(k => k && typeof k === 'object' && (k as Record<string, unknown>).month === 3) as Record<string, unknown> | undefined
    const m6 = kpis.find(k => k && typeof k === 'object' && (k as Record<string, unknown>).month === 6) as Record<string, unknown> | undefined
    const m12 = kpis.find(k => k && typeof k === 'object' && (k as Record<string, unknown>).month === 12) as Record<string, unknown> | undefined
    const fmt = (k: Record<string, unknown> | undefined) => {
        if (!k) return '—'
        return `top_3=${k.expected_top_3_count ?? '?'} top_10=${k.expected_top_10_count ?? '?'} clicks=${typeof k.expected_organic_clicks === 'number' ? k.expected_organic_clicks.toLocaleString() : '?'}`
    }
    return `M3 [${fmt(m3)}] · M6 [${fmt(m6)}] · M12 [${fmt(m12)}]`
}

// ────────────────────────────────────────────────────────────────────────────
// cost_timeline_modeling — Phase E3. Calibrated cost + timeline projections
// for Smart vs Aggressive scenarios. Heavy math in prefetch; AI interprets
// the baselines + writes executive narrative + risk analysis.
// ────────────────────────────────────────────────────────────────────────────

interface CostTimelineModelingShape {
    upstreamMissing: string[]
    business_context: {
        our_domain: string | null
        our_dr_estimate: number
        top_competitor_dr: number
        top_competitor_link_count: number
        competition_level: 'low' | 'medium' | 'high'
        target_top_3_count_smart: number
        target_top_3_count_aggressive: number
    }
    scenarios: {
        smart: ScenarioBaselineShape
        aggressive: ScenarioBaselineShape
    }
    constants_snapshot: {
        usd_to_ils: number
        platform_business_tier_ils_per_month: number
        platform_pro_tier_ils_per_month: number
        seo_strategist_ils_per_hour: number
        content_writer_ils_per_hour: number
        tech_seo_ils_per_hour: number
        outreach_jr_ils_per_hour: number
        tooling_typical_ils_per_month: number
    }
}

interface ScenarioBaselineShape {
    name: 'smart' | 'aggressive'
    label_he: string
    inputs: Record<string, unknown>
    // Platform-DIY (Phase QA round-8) — what user actually pays
    monthly_budget_ils: {
        platform_subscription: number
        anthropic_api: number
        backlink_acquisition: number
        paid_ads: number
        external_tooling: number
        total: number
    }
    duration_months: { min: number; expected: number; max: number }
    total_program_ils: number
    // Agency comparison side-block — narrative-only
    agency_comparison_ils: {
        content_production: number
        link_outreach_labor: number
        technical_seo: number
        seo_strategist: number
        tooling_subscriptions: number
        total_monthly: number
        total_program: number
        savings_vs_diy_total: number
    }
    monthly_kpis: Array<{
        month: number
        new_pieces_published: number
        cumulative_pieces: number
        new_links: number
        cumulative_links: number
        expected_top_10_count: number
        expected_top_3_count: number
        expected_organic_clicks: number
    }>
    model_trace: {
        time_to_rank_inputs: Record<string, unknown>
        content_velocity_per_month: number
        outreach_emails_total: number
        outreach_hours_total: number
        risk_factors: string[]
    }
}

function buildCostTimelineModelingPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const dfs = opts.dfsData as CostTimelineModelingShape | undefined
    if (!dfs) throw new Error('cost_timeline_modeling: dfsData prefetch is required')

    const upstreamWarning = dfs.upstreamMissing.length > 0
        ? `\n**⚠ Upstream חסר:** ${dfs.upstreamMissing.join(', ')}. הסיכמת מנהלים תציין שהמודל פועל על נתונים חלקיים.\n`
        : ''

    const ctx = dfs.business_context
    const smart = dfs.scenarios.smart
    const aggressive = dfs.scenarios.aggressive

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 3500,
        prompt: `# מודל עלויות וזמנים — "${businessName}"

## תיאור העסק
${businessDesc}
${haBlock}
${upstreamWarning}

## קלטים מ-upstream stages

**הקשר עסקי:**
- הדומיין שלנו: \`${ctx.our_domain ?? '—'}\`
- ההערכה שלנו ל-DR שלכם: ${ctx.our_dr_estimate} (מבוסס על link_audit)
- DR של top competitor: ${ctx.top_competitor_dr}
- קישורים ב-top competitor: ${ctx.top_competitor_link_count.toLocaleString()}
- רמת תחרות: ${ctx.competition_level}

## ⚠ Reality framing — חשוב מאוד

**${businessName} משתמש בפלטפורמה (OpenClaw + MATEH agents) — לא משלם לסוכנות.** המשמעות:
- **Content production, technical SEO, strategy, outreach drafting** — כל אלה מתבצעים על-ידי הסוכנים (₪0 marginal labor cost).
- העלויות **האמיתיות** של המשתמש: (1) מנוי לפלטפורמה, (2) Anthropic API key (token usage), (3) **כסף אמיתי לרכישת קישורים** (תשלום על הצבה — סוכן מנסח את ה-outreach, אבל הקישור עצמו עדיין עולה כסף), (4) Paid ads (אם בוחרים), (5) חיצוני tooling (נדיר — DFS/Firecrawl כבר bundled).
- **\`agency_comparison_ils\`** מסופק כ-side-block — "אם הייתם הולכים דרך סוכנות לפני 2025, זה היה עולה X" — נרטיב value-prop, לא תקציב המשתמש.

## בייסליין מחושב — Smart scenario

${renderScenarioBaseline(smart)}

## בייסליין מחושב — Aggressive scenario

${renderScenarioBaseline(aggressive)}

## קונסטנטים (IL market 2026)

**Platform-DIY (מצב ברירת מחדל — מה שהמשתמש משלם בפועל):**
- OpenClaw Business tier: ₪${dfs.constants_snapshot.platform_business_tier_ils_per_month}/חודש (Smart default — 8GB RAM, מספיק ל-MATEH)
- OpenClaw Pro tier: ₪${dfs.constants_snapshot.platform_pro_tier_ils_per_month}/חודש (Aggressive default — 16GB dedicated)
- Anthropic API: ₪350/חודש Smart, ₪1,300/חודש Aggressive (cumulative agent token usage at user-supplied key)
- Backlink acquisition: ₪1,000/חודש Smart, ₪3,000/חודש Aggressive (real placement money — agents draft the outreach)
- Paid ads floor: ₪0 Smart (organic-first), ₪5,000/חודש Aggressive (Google Ads + retargeting)

**Agency comparison rates (legacy — for narrative side-block only):**
- USD→ILS: ${dfs.constants_snapshot.usd_to_ils}
- SEO strategist: ₪${dfs.constants_snapshot.seo_strategist_ils_per_hour}/hour
- Content writer Hebrew: ₪${dfs.constants_snapshot.content_writer_ils_per_hour}/hour
- Tech SEO / dev: ₪${dfs.constants_snapshot.tech_seo_ils_per_hour}/hour
- Tooling SaaS: ₪${dfs.constants_snapshot.tooling_typical_ils_per_month}/month

---

## פקודות עבודה

${HARD_BLOCK_RULES}

${HEBREW_ONLY_BLOCK}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${CONFIDENCE_LABELING}

${JSON_OUTPUT_RULES}

---

## פלט נדרש

### חלק 1: תקציר מנהלים (markdown — בעברית, 2-3 פסקאות)
שלוש שאלות מרכזיות: (א) **מה ההחלטה האסטרטגית** — איזה תקציב חודשי הופך את התרחיש לבר-ביצוע, איזה הופך אותו לבזבוז? (ב) **מה ה-trade-off** — Smart לעומת Aggressive — מתי כל אחד צודק? (ג) **שלוש סיבות שהמודל יכול לפספס** — risk factors שצריך לעקוב אחריהם.

### חלק 2: רשומות JSON — calibrated scenarios (חובה!)

\`\`\`json
{
  "executive_summary": {
    "decision_threshold_ils_per_month": 0,
    "smart_recommended_when": "1-2 משפטים בעברית — מתי לבחור Smart (תקציב, זמן, מטרות)",
    "aggressive_recommended_when": "1-2 משפטים בעברית — מתי לבחור Aggressive",
    "biggest_risk_smart": "1 משפט בעברית",
    "biggest_risk_aggressive": "1 משפט בעברית",
    "confidence": "high | medium | working_hypothesis"
  },
  "records": [
    {
      "scenario": "smart",
      "label_he": "Smart — long-tail-first עם פלטפורמה",
      "best_for": "1 משפט בעברית — איזה לקוח/עסק צריך לבחור את התרחיש הזה (סדר גודל עסקי, time horizon, נכונות לסבלנות אורגנית)",
      "monthly_budget_ils": ${smart.monthly_budget_ils.total},
      "monthly_budget_breakdown_ils": {
        "platform_subscription": ${smart.monthly_budget_ils.platform_subscription},
        "anthropic_api": ${smart.monthly_budget_ils.anthropic_api},
        "backlink_acquisition": ${smart.monthly_budget_ils.backlink_acquisition},
        "paid_ads": ${smart.monthly_budget_ils.paid_ads},
        "external_tooling": ${smart.monthly_budget_ils.external_tooling}
      },
      "duration_months": ${JSON.stringify(smart.duration_months)},
      "total_program_ils": ${smart.total_program_ils},
      "agency_comparison_ils": {
        "_note": "מה זה היה עולה לפני 2025 דרך סוכנות. נרטיב value-prop בלבד.",
        "total_monthly": ${smart.agency_comparison_ils.total_monthly},
        "total_program": ${smart.agency_comparison_ils.total_program},
        "savings_vs_diy_total": ${smart.agency_comparison_ils.savings_vs_diy_total}
      },
      "deliverables_summary": {
        "target_top_3_keywords": ${smart.inputs.target_top_3_keyword_count ?? 'מתוך inputs'},
        "content_pieces_total": ${smart.inputs.content_pieces_total ?? 'מתוך inputs'},
        "links_total": ${smart.inputs.links_total ?? 'מתוך inputs'},
        "tech_seo_hours": ${smart.inputs.tech_seo_hours ?? 'מתוך inputs'}
      },
      "monthly_kpi_projection": ${JSON.stringify(smart.monthly_kpis)},
      "risk_factors": ${JSON.stringify(smart.model_trace.risk_factors)},
      "what_could_go_wrong": ["3 דברים קונקרטיים בעברית — מה יכול לעצור את התרחיש"],
      "early_warning_signs": ["3 leading indicators בעברית שצריך לעקוב אחריהם בחודשים 1-3"],
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["upstream_internal_seo_audit", "upstream_seo_keyword_research", "upstream_link_audit", "il_constants_2026", "platform_diy_baseline"]
    },
    {
      "scenario": "aggressive",
      "label_he": "Aggressive — פלטפורמה + paid acceleration",
      "best_for": "1 משפט בעברית",
      "monthly_budget_ils": ${aggressive.monthly_budget_ils.total},
      "monthly_budget_breakdown_ils": {
        "platform_subscription": ${aggressive.monthly_budget_ils.platform_subscription},
        "anthropic_api": ${aggressive.monthly_budget_ils.anthropic_api},
        "backlink_acquisition": ${aggressive.monthly_budget_ils.backlink_acquisition},
        "paid_ads": ${aggressive.monthly_budget_ils.paid_ads},
        "external_tooling": ${aggressive.monthly_budget_ils.external_tooling}
      },
      "duration_months": ${JSON.stringify(aggressive.duration_months)},
      "total_program_ils": ${aggressive.total_program_ils},
      "agency_comparison_ils": {
        "_note": "מה זה היה עולה לפני 2025 דרך סוכנות.",
        "total_monthly": ${aggressive.agency_comparison_ils.total_monthly},
        "total_program": ${aggressive.agency_comparison_ils.total_program},
        "savings_vs_diy_total": ${aggressive.agency_comparison_ils.savings_vs_diy_total}
      },
      "deliverables_summary": {
        "target_top_3_keywords": ${aggressive.inputs.target_top_3_keyword_count ?? 'מתוך inputs'},
        "content_pieces_total": ${aggressive.inputs.content_pieces_total ?? 'מתוך inputs'},
        "links_total": ${aggressive.inputs.links_total ?? 'מתוך inputs'},
        "tech_seo_hours": ${aggressive.inputs.tech_seo_hours ?? 'מתוך inputs'}
      },
      "monthly_kpi_projection": ${JSON.stringify(aggressive.monthly_kpis)},
      "risk_factors": ${JSON.stringify(aggressive.model_trace.risk_factors)},
      "what_could_go_wrong": ["3 דברים קונקרטיים בעברית"],
      "early_warning_signs": ["3 leading indicators בעברית"],
      "confidence": "high | medium | working_hypothesis",
      "evidence": ["upstream_internal_seo_audit", "upstream_seo_keyword_research", "upstream_link_audit", "il_constants_2026", "platform_diy_baseline"]
    }
  ],
  "decision_guidance": {
    "_note": "מספרים מ-monthly_budget_ils.total של כל תרחיש (Platform-DIY). אם תקציב חודשי < smart → התחילו עם Personal/Business plan + minimum links; אם > aggressive → paid acceleration שווה.",
    "if_budget_under_ils_per_month": ${Math.round(smart.monthly_budget_ils.total * 0.6)},
    "if_budget_over_ils_per_month": ${aggressive.monthly_budget_ils.total},
    "smart_minimum_ils_per_month": ${smart.monthly_budget_ils.total},
    "aggressive_minimum_ils_per_month": ${aggressive.monthly_budget_ils.total},
    "decision_text_he": "1-2 פסקאות בעברית — מנחה את הלקוח: עם הפלטפורמה כל מה שצריך לתקציב הוא backlinks + (אופציונלי) paid ads. ה-MRR breakeven מהיר כי labor=0."
  },
  "key_assumptions": [
    "5-7 הנחות שמהן יצא המודל (לדוגמה: 'הנחנו DR התחלתי 15 על בסיס ourDR estimate; אם DR הוא 30+, ה-timeline יקצר ב-2-3 חודשים'; 'הנחנו 1 writer דדיקציה Smart ו-2 writers + senior Aggressive'; 'הנחנו ROI מבחירת מילים נכונה לפי seo_keyword_research')"
  ],
  "confidence": "high | medium | working_hypothesis"
}
\`\`\`

**חובה:**
- בדיוק 2 records: \`smart\` ו-\`aggressive\`. אסור פחות אסור יותר.
- **אסור לשנות מספרים מהמודל** — המודל המתמטי כבר חישב את \`monthly_budget_ils\`, \`duration_months\`, \`total_program_ils\`, \`monthly_kpi_projection\`. תפקידכם רק להוסיף narrative + best_for + what_could_go_wrong + early_warning_signs.
- \`what_could_go_wrong\` חייב להיות **קונקרטי** (לא "מתחרים יזיזו" אלא "אם avia2000 משחרר 3 long-form pillars ברבעון 1, ה-DR-gap יגדל וה-timeline יימתח ל-${aggressive.duration_months.max} חודשים").
- \`early_warning_signs\` חייב להיות **measurable** (לדוגמה: "פחות מ-50 organic clicks בחודש 3 = לא הולכים לפי המודל").
- אם confidence: working_hypothesis לאיזשהו scenario — חובה לציין למה ב-evidence.

### חלק 3: המלצה אישית (markdown — בעברית בלבד)
לפי ה-business_context (DR שלנו, top competitor DR, רמת תחרות, target keyword count) — **המלצה ספציפית** איזה scenario שווה יותר, מה צריך להחליט קודם, ואיך מתחילים שבוע 1.

### חלק 4: תכנית ביצוע 3 חודשים ראשונים (markdown — בעברית בלבד)
מה קורה בחודש 1 / 2 / 3 בכל scenario:
- מה מתפרסם
- כמה קישורים נרכשים
- איזה tech-debt נסגר
- מה ה-KPI של סוף החודש

---

${QUALITY_GATE_INSTRUCTIONS}
${feedbackLine}`,
    }
}

function renderScenarioBaseline(s: ScenarioBaselineShape): string {
    const inputs = s.inputs as Record<string, unknown>
    return `**Inputs to model:**
- Target top 3 keywords: ${inputs.target_top_3_keyword_count}
- Content pieces total: ${inputs.content_pieces_total}
- Links total: ${inputs.links_total}
- Tech SEO hours: ${inputs.tech_seo_hours}
- Striking distance count: ${inputs.striking_distance_count}
- Target DR: ${inputs.target_dr} (we're at ${inputs.our_dr_estimate})
- Competition: ${inputs.competition_level}

**Monthly budget breakdown — Platform-DIY (₪, מה שהמשתמש משלם בפועל):**
- Platform subscription (OpenClaw): ₪${s.monthly_budget_ils.platform_subscription.toLocaleString()}
- Anthropic API (token usage): ₪${s.monthly_budget_ils.anthropic_api.toLocaleString()}
- Backlink acquisition (real placement money): ₪${s.monthly_budget_ils.backlink_acquisition.toLocaleString()}
- Paid ads: ₪${s.monthly_budget_ils.paid_ads.toLocaleString()}
- External tooling: ₪${s.monthly_budget_ils.external_tooling.toLocaleString()}
- **Total platform-DIY: ₪${s.monthly_budget_ils.total.toLocaleString()}/month**

**Agency comparison side-block (לפני 2025 — for narrative value-prop):**
- Content production: ₪${s.agency_comparison_ils.content_production.toLocaleString()}
- Link outreach labor: ₪${s.agency_comparison_ils.link_outreach_labor.toLocaleString()}
- Technical SEO: ₪${s.agency_comparison_ils.technical_seo.toLocaleString()}
- SEO strategist: ₪${s.agency_comparison_ils.seo_strategist.toLocaleString()}
- Tooling SaaS: ₪${s.agency_comparison_ils.tooling_subscriptions.toLocaleString()}
- **Agency total: ₪${s.agency_comparison_ils.total_monthly.toLocaleString()}/month** | **Savings via platform: ₪${s.agency_comparison_ils.savings_vs_diy_total.toLocaleString()} over program**

**Duration:** ${s.duration_months.min}-${s.duration_months.expected}-${s.duration_months.max} months (min/expected/max)

**Total program: ₪${s.total_program_ils.toLocaleString()}** (${s.duration_months.expected} × ₪${s.monthly_budget_ils.total.toLocaleString()}/mo)

**Monthly KPI projection (top_10 / top_3 / clicks per month):**
${s.monthly_kpis.map(k => `- M${k.month}: top_10=${k.expected_top_10_count} | top_3=${k.expected_top_3_count} | clicks=${k.expected_organic_clicks.toLocaleString()} | cumulative pieces=${k.cumulative_pieces} | cumulative links=${k.cumulative_links}`).join('\n')}

**Model trace:**
- Content velocity: ${s.model_trace.content_velocity_per_month}/month
- Outreach emails total: ${s.model_trace.outreach_emails_total.toLocaleString()}
- Outreach hours total: ${Math.round(s.model_trace.outreach_hours_total)}
- Risk factors: ${s.model_trace.risk_factors.join(' · ')}`
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 4.2.1 — paid_competitor_landscape
//
// Goal of this stage: a senior PPC analyst doing competitor research BEFORE
// touching the user's ad account. The Opus output must:
//   - Bucket each scanned competitor (direct / substitute / adjacent / reference)
//   - Identify creative ANGLES that dominate (price_anchor, social_proof,
//     urgency, identity, problem_agitation, etc.) — citing real ad copy
//   - Spot which competitors run LONG (≥60d) vs experimentation (<14d) ads
//     and what that signals about budget + product-market fit
//   - Synthesize platform mix (FB / IG / GSearch / GDisplay) and what it
//     implies for our channel selection
//   - Audit competitor LPs for CRO patterns the user MUST match (or beat)
//   - Find WHITE-SPACE angles — angles NOT in market we can claim
//   - IL-specific signals: WhatsApp CTAs, Hebrew vs bilingual, IL-paid-market patterns
// ────────────────────────────────────────────────────────────────────────────

import type { PaidCompetitorLandscapePrefetch } from '@/controllers/hosting/research/stages/prefetch/paid_competitor_landscape'
import { renderMetaContextForPrompt } from '@/services/paidResearch/metaAdLibrary'
import { renderLandingPageAuditsForPrompt } from '@/services/paidResearch/landingPageAudit'
import { renderTransparencyContext } from '@/services/googleAdsTransparency'

const CREATIVE_ANGLE_TAXONOMY = `**Creative angle taxonomy** — classify each ad you see into ONE of these (or 'other' with explanation):
- price_anchor       — leads with price / discount / urgency on cost
- social_proof       — "1000 clients", testimonial, rating, brand logos
- problem_agitation  — vivid pain ("הלקוחות שלך עוזבים? הם פשוט לא מוצאים אותך")
- identity           — "for X people who Y" (segment-defined)
- authority          — credentials, certifications, "expert team"
- urgency_scarcity   — countdown, "X spots left", deadline
- transformation     — before/after, outcome-focused ("מ-Z ל-A תוך 60 יום")
- educational        — "guide / playbook / template" lead magnet
- comparison         — "vs other tools" / "instead of X do Y"
- entertainment      — humor, surprise, narrative — pure attention-grab

CRITICAL: cite the actual ad text snippet for every angle you tag. NO inventing.`

const PAID_BUCKETING_RULE = `**Bucket each scanned competitor**:
- **direct**     — same offering, same geography (IL), same persona. Main threat. Top priority for white-space angle search.
- **substitute** — different product, same JTBD. (e.g. self-storage vs moving services for "I need temporary space")
- **adjacent**   — related offering, overlapping audience but different primary value. (Expansion risk OR strategic partnership candidate.)
- **reference** — methodology inspiration only — different geography or business model, included because their angle/creative pattern is exemplary

If a competitor is unclear, ASK the user via a flag in 'questions_for_user' — don't guess wildly.`

const IL_PAID_SIGNALS = `**IL paid-market signals to evaluate**:
- WhatsApp CTAs (wa.me links, "וואטסאפ" mentions) — IL leads convert 2-4× higher via messaging than form fills
- Hebrew-only vs bilingual ads — Hebrew-only = local SMB; bilingual = global brand presence
- Phone number on LP — אזרח ישראלי prefers phone for high-trust transactions (legal, real estate, b2b)
- IL-specific platforms: ynet/calcalist for B2B, mako for B2C, channels that don't exist outside IL
- ATT / Privacy: post-iOS-14 (ATT) Meta attribution is degraded — competitors over-relying on Meta optimization vs Google may signal weak measurement`

export function buildPaidCompetitorLandscapePrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, feedback, historicalAssetsBlock } = opts
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''

    const prefetch = opts.dfsData as PaidCompetitorLandscapePrefetch | undefined
    if (!prefetch) throw new Error('paid_competitor_landscape: prefetch is required')

    const metaBlock = renderMetaContextForPrompt(prefetch.metaAds)
    const googleBlock = prefetch.googleAds
        ? renderTransparencyContext(prefetch.googleAds)
        : '═══ GOOGLE ADS TRANSPARENCY CENTER ═══\n(audit unavailable)'
    const lpBlock = renderLandingPageAuditsForPrompt(prefetch.landingPages)
    const domainSourcesBlock = Object.entries(prefetch.domainSources)
        .map(([d, src]) => `- ${d} (source: ${src})`)
        .join('\n')
    const warningsBlock = prefetch.warnings.length > 0
        ? `\n**Prefetch warnings to acknowledge** (set confidence accordingly):\n${prefetch.warnings.map(w => `- ${w}`).join('\n')}\n`
        : ''

    return {
        agentId: 'menateach',
        useDirectApi: true,        // analytical stage — no need for openclaw CLI MCP
        minLength: 3500,
        prompt: `# ניתוח מתחרים — פרסום ממומן ב-IL — "${businessName}"

## תיאור העסק
${businessDesc}
${prodBlk ? `\n## המוצרים/שירותים\n${prodBlk}\n` : ''}
${haBlock}
${feedbackLine}

---

## נתוני prefetch — להשתמש verbatim, אסור להמציא

**Competitors scanned (${prefetch.competitorDomains.length}):**
${domainSourcesBlock}
${warningsBlock}

${metaBlock}

${googleBlock}

${lpBlock}

---

## פקודות עבודה

${PAID_BUCKETING_RULE}

${CREATIVE_ANGLE_TAXONOMY}

${IL_PAID_SIGNALS}

${CONFIDENCE_INTEGRITY_RULE}

${EVIDENCE_HONESTY_RULE}

${HEBREW_ONLY_BLOCK}

---

## פלט נדרש — בדיוק במבנה הזה (markdown narrative + JSON code-block)

**Part 1 — Narrative analysis (Hebrew, ~2000-3000 words):**

### 1. סיכום נוף השוק הממומן
מה רואים? כמה מתחרים פעילים, איזה פלטפורמות דומיננטיות, איזה ערוצים חסרים. paragraph של 150-200 מילה.

### 2. ניתוח לפי competitor (לכל מתחרה שנסרק):
- **שם המתחרה + bucket** (direct / substitute / adjacent / reference)
- מה הם רצים: Meta ads count (active), Google ads count, platforms mix, אורך ריצה חציוני
- אנגלים יצירתיים שזיהיתי (cite ad text snippets) — לפחות 2 לכל מתחרה אם יש creatives
- מה ה-LP שלהם חזק בו ובמה חלש (form length, hero, social proof, IL signals)
- מה זה אומר אסטרטגית עלינו: מה לקבל / מה להימנע / איפה לתקוף

### 3. דפוסים cross-competitor
- אנגלים שחוזרים אצל 3+ מתחרים → "saturated angles" — חייבים לדפדף בשונה
- אנגלים שאף אחד לא משתמש → "white-space angles" — ההזדמנות שלנו
- פלטפורמות לא ניצולות (אף מתחרה לא ב-IG אבל יש קהל שם → opportunity)
- IL-specific patterns: WhatsApp ratio, Hebrew/bilingual, phone CTAs

### 4. המלצות שאסטרטגיית הפרסום שלנו חייבת לכלול
3-5 conclusions actionable specific to this market analysis. כל המלצה — בלי ניסוח כללי, צמודה לנתון מסוים שראינו.

### 5. שאלות לפני המשך
דברים שלא ברורים מ-prefetch ושצריך לאסוף לפני strategy_options. רשימה 0-5 שאלות לא יותר.

---

**Part 2 — Structured JSON (single code-block, valid JSON):**

\`\`\`json
{
  "records": [
    {
      "domain": "competitor.co.il",
      "bucket": "direct",
      "page_names": ["..."],
      "active_ads_meta": <int>,
      "active_ads_google": <int>,
      "platforms_active": ["meta_facebook", "meta_instagram", "google_search", "google_display"],
      "median_ad_run_days": <int>,
      "longest_running_ad_days": <int>,
      "creative_angles_observed": [
        {
          "angle": "price_anchor",
          "platform": "meta",
          "examples_he": ["citation 1", "citation 2"],
          "is_long_runner": true
        }
      ],
      "landing_page_strengths": ["whatsapp_cta_present", "schema_markup_complete"],
      "landing_page_weaknesses": ["form_too_long_7_fields", "no_hero_video"],
      "strategic_threat_level": "high|medium|low",
      "strategic_threat_rationale_he": "..."
    }
  ],
  "extras": {
    "saturated_angles": ["price_anchor", "..."],
    "white_space_angles": ["transformation", "..."],
    "platform_concentration": { "meta": <pct>, "google_search": <pct>, "google_display": <pct> },
    "il_signals_observed": {
      "whatsapp_cta_ratio": <0..1>,
      "hebrew_only_ratio": <0..1>,
      "phone_number_ratio": <0..1>
    },
    "key_recommendations": [
      "..."
    ],
    "questions_for_user": [
      "..."
    ]
  },
  "confidence": "high|medium|working_hypothesis"
}
\`\`\`

**Quality bar:**
- confidence: 'high' ONLY if ≥3 direct competitors had Meta or Google ads found.
- confidence: 'medium' if 1-2 direct competitors with data.
- confidence: 'working_hypothesis' if 0 paid competitors found (most analysis based on LP audits + organic competitor context).
- Each angle in white_space_angles MUST cite WHY it's white-space (which competitors lack it).
- platform_concentration percentages must sum to ~1.0.`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatch helper — used by per-stage controllers to get prompt by id.
// New prompts (aeo_visibility, social_landscape, email_competitor_audit)
// belong here when they ship (Phase 4).
// ────────────────────────────────────────────────────────────────────────────

export function buildPromptForStage(stageId: StageId, opts: PromptOpts): PromptResult | null {
    switch (stageId) {
        case 'competitor_landscape':       return buildCompetitorLandscapePrompt(opts)
        case 'internal_seo_audit':         return buildInternalSeoAuditPrompt(opts)
        case 'seo_keyword_research':       return buildSeoKeywordResearchPrompt(opts)
        case 'aeo_visibility':             return buildAeoVisibilityPrompt(opts)
        case 'link_audit':                 return buildLinkAuditPrompt(opts)
        case 'audience_personas':          return buildAudiencePersonasPrompt(opts)
        case 'positioning':                return buildPositioningPrompt(opts)
        case 'cost_timeline_modeling':     return buildCostTimelineModelingPrompt(opts)
        case 'strategy_options':           return buildStrategyOptionsPrompt(opts)
        case 'validation':                 return buildValidationPrompt(opts)
        // Phase 4.2.1 — paid research pipeline (new stages)
        case 'paid_competitor_landscape':  return buildPaidCompetitorLandscapePrompt(opts)
        // Phase 4 stages (live integrations) + intent wrappers handle their
        // own prompt construction inside their per-stage controller.
        default: return null
    }
}