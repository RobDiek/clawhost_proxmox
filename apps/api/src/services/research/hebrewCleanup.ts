/**
 * Phase QA round-9 — final-pass Hebrew cleanup.
 *
 * After the main stage Anthropic call + scrubber + selfCritique, the
 * markdown narrative + records[] still leak English jargon despite
 * HEBREW_ONLY_BLOCK + FORBID_LIST scrubs. Rounds 4-7 chased a long tail
 * of dictionary words and never converged — there's always a new word.
 *
 * This pass takes a different approach: a single Sonnet 4.6 call that
 * REWRITES content into pure Hebrew, preserving:
 *   - JSON record structure (keys + types + numeric values verbatim)
 *   - Schema.org type names (FAQPage, Organization, BlogPosting, etc) — English
 *   - Brand names (Storage Station, Box-it, Yad2, etc) — as-is
 *   - SEO/marketing acronyms in allowlist (SEO, SERP, AEO, GMB, CTR, JTBD,
 *     LTV, CAC, MRR, ARPU, ROI, KPI, B2B, B2C, FAQ, NAP, AI, API, URL)
 *   - File paths, technical identifiers, code-like strings
 *
 * Cost: ~$0.03-0.10 per stage (Sonnet pricing × ~25K-50K tokens roundtrip).
 * Adds ~20-40 sec to each stage runtime. Worth it: stops the round-after-
 * round dictionary expansion arms race.
 *
 * Used in two contexts:
 *   1. Pipeline (default-on for all stages with Hebrew output) —
 *      runs in _runStageGeneric.ts after scrubEnglishFiller, before persist.
 *   2. Standalone DB patch — for already-persisted stages with code-switch
 *      content (script: scripts/db-patch-hebrew-cleanup.ts).
 */

import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'

interface HebrewCleanupInput {
    /** Stage content (markdown narrative + JSON code-blocks) */
    content: string
    /** Parsed records array (will be JSON-stringified for cleanup, then re-parsed) */
    records?: unknown[]
    /** For Anthropic API key lookup */
    instanceId: string
    /** For logging only */
    stageId: string
}

interface HebrewCleanupResult {
    cleanedContent: string
    cleanedRecords?: unknown[]
    /** True if cleanup ran successfully */
    applied: boolean
    /** Skipped due to API key issues, network errors, etc */
    skipped: boolean
    /** Approximate token count for cost telemetry */
    inputTokensApprox?: number
    outputTokensApprox?: number
}

// Phase 4.0(fix8) — REVERT to Sonnet. Tried Haiku (fix in 98d81c5d) to cut
// the 8-min cleanup time. Haiku has an 8K output-token cap, so on a
// ~16K-input run (typical competitor_landscape) it truncated the body
// silently: v6 saw content 34865→1516 chars — 95% content loss.
// Sonnet handles 13-16K output tokens reliably; 8min cost stands, but
// truncating the user's report is a strictly worse outcome.
const SONNET_MODEL = 'claude-sonnet-4-6'

const ALLOWLIST_BLOCK = `**ALLOWLIST — חייבים להישאר באנגלית כפי שהן:**

Schema.org types: FAQPage, Question, Answer, Organization, LocalBusiness, SelfStorage, Article, BlogPosting, NewsArticle, Product, Service, Review, AggregateRating, BreadcrumbList, WebSite, WebPage, ItemList, HowTo, Recipe, Event, Person, ImageObject, VideoObject, sameAs, mainEntityOfPage, contactPoint, areaServed, openingHoursSpecification, priceRange, geo, address, telephone, name, legalName, logo, url, image, headline, author, datePublished, dateModified, publisher, articleBody, byline, potentialAction, SearchAction, acceptedAnswer.

SEO/marketing acronyms: SEO, SEM, SERP, SERPs, AEO, GEO, AIO, GSC, GA4, GMB, GBP, YMYL, EAT, EEAT, E-E-A-T, CTR, CPC, CPM, CPA, ROI, KPI, KPIs, ROAS, AOV, LTV, CAC, MRR, ARR, ARPU, JTBD, ICP, UX, UI, CRO, CMS, CRM, ERP, SaaS, B2B, B2C, SMB, D2C, FAQ, NAP, PPC, FOMO.

Tech: HTTP, HTTPS, HTML, CSS, JS, JSON, JSON-LD, XML, CSV, PDF, CDN, DNS, SSL, TLS, URL, URLs, URI, UTM, API, APIs, REST, OAuth, OAuth2.

Brand/Tool names: Google, Bing, ChatGPT, Claude, Perplexity, Gemini, Anthropic, OpenAI, Meta, Facebook, Instagram, YouTube, TikTok, LinkedIn, Twitter, WhatsApp, Telegram, WordPress, Shopify, WooCommerce, Wix, Webflow, Ahrefs, Semrush, Moz, Screaming Frog, DataForSEO, Firecrawl, Search Console, Google Analytics, Google Ads, Meta Ads, Google Maps, Google Business Profile, Google My Business, Yad2, Box-it, BoxBee, StoreNext, Storage Station.

Standard SEO terms (Hebrew has no clean substitute): authority, anchor, anchors, pillar, cluster, spoke, silo, evergreen, listicle, snippet, snippets, schema, microdata, Open Graph, OpenGraph, robots.txt, sitemap, canonical, hreflang, noindex, nofollow, dofollow, breadcrumb, breadcrumbs, money page, money pages, topical authority, domain authority, page authority, striking distance, featured snippet, rich results, rich snippet, knowledge panel, knowledge graph, People Also Ask, PAA, AI Overview, core web vitals, web vitals, crawl budget, search intent, user intent, transactional intent, commercial intent, informational intent, navigational intent, long tail, short tail, fat head, mid tail, zero click, zero-click, click through rate, evergreen content, pillar page, pillar content, topic cluster, content hub, content silo, link building, link velocity, link earning, link bait, inbound link, outbound link, internal link, external link, best practice, best practices, use case, use cases, intent ladder, awareness, consideration, decision, conversion, retention, funnel, top of funnel, middle of funnel, bottom of funnel, MOFU, BOFU, TOFU, churn.`

const CLEANUP_PROMPT_TEMPLATE = (content: string, recordsJson: string | null, stageId: string) => `אתה עורך תוכן עברי מקצועי. המשימה: לקחת תוכן שבו מעורבים מילים אנגליות סלנגיות בתוך משפטים עבריים, ולשכתב אותו לעברית טהורה — תוך שמירה דבקה על מבנה JSON, שמות schema, שמות מותגים, ומונחים מקצועיים מה-allowlist.

## כלל ברזל

⚠ **אל תשנה מספרים. אל תשנה values בתוך JSON. אל תשנה מבני JSON.**
- מספרים נשארים בדיוק כמו שהם (volume_monthly: 880 → נשאר 880)
- שמות שדות JSON נשארים באנגלית כפי שהם (records, monthly_budget_ils, scenario, וכו')
- ערכי enum (high/medium/working_hypothesis, take_now/backlog, awareness/consideration וכו') — נשארים באנגלית
- URLs נשארים זהים
- timestamps נשארים זהים

⚠ **תרגם רק narrative + טקסט חופשי בתוך string values עבריים.** מילה אנגלית בתוך משפט עברי שיש לה תרגום עברי טבעי — לתרגם.

## ${ALLOWLIST_BLOCK}

## דוגמאות

❌ "ב-bandwidth של הצוות" → ✅ "בקיבולת הצוות"
❌ "runway של 4 שנים" → ✅ "מסלול הון של 4 שנים"
❌ "iteration ב-30%" → ✅ "איטרציה של 30%"
❌ "go-live ב-30 יום" → ✅ "השקה תוך 30 יום"
❌ "cut underperformers" → ✅ "חיתוך כשלים"
❌ "scale ב-30%" → ✅ "הגדלה של 30%"
❌ "ramp-up" → ✅ "הרצה הדרגתית"
❌ "breakeven" → ✅ "נקודת איזון"
❌ "wave 1 / wave 2" → ✅ "גל 1 / גל 2"
❌ "fallback" → ✅ "חלופה"
❌ "buffer" → ✅ "מרווח ביטחון"
❌ "cashflow" → ✅ "תזרים מזומנים"
❌ "broadcast" → ✅ "שידור"
❌ "velocity של תוכן" → ✅ "קצב הוצאת התוכן"
❌ "one-stop-shop" → ✅ "נקודת מגע אחת"
❌ "feeder" → ✅ "ספק קלט"
❌ "lock-in" → ✅ "נעילה / מחויבות"
❌ "headstart" → ✅ "יתרון פתיחה"
❌ "tradeoff" → ✅ "פשרה / איזון בין"
❌ "extractability" → ✅ "יכולת חילוץ"

## K16 — מזהים תכנותיים אסורים בטקסט פונה-משתמש

❌ snake_case ו-camelCase של מזהים תכנותיים בתוך **נראטיב עברית** או בתוך **string values** עבריים — חייבים תרגום.

דוגמאות אסורות שנצפו בייצור (יש לתרגם):

❌ "static_value_pollution" → ✅ "זיהום ערכי המרות סטטיים"
❌ "conv_value_quality_subscore" → ✅ "ציון איכות ערך ההמרה"
❌ "fix_tracking_first" → ✅ "תיקון מעקב ראשון"
❌ "Smart Bidding" → ✅ "אופטימיזציית הצעות חכמה"
❌ "createGtmContainer" → ✅ "יצירת מנהל תגיות (GTM)"
❌ "MAXIMIZE_CONVERSION_VALUE" → ✅ "אופטימיזציה לערך מרבי מהמרות"
❌ "MANUAL_CPC" → ✅ "הצעות ידניות לעלות לקליק"
❌ "ENABLED" / "PAUSED" → ✅ "פעיל" / "מושהה"
❌ "Conversion Linker" → ✅ "מקשר המרות"
❌ "Consent Mode v2" → ✅ "מצב הסכמה (Consent Mode v2)"
❌ "audience match" → ✅ "התאמת קהל"
❌ "snippet install" → ✅ "התקנת קטע הקוד"

חוק: כל מחרוזת ב-snake_case או SCREAMING_SNAKE_CASE שלא ב-allowlist, ושמופיעה בתוך text/title/summary/rationale/description שעברית — חייבת תרגום עם הסבר טבעי בעברית. אסור להשאיר את המזהה התכנותי כתחליף לטקסט פונה-משתמש.

✅ "FAQPage schema" — נשאר (Schema.org type)
✅ "ה-CTR נמוך" — נשאר (allowlist acronym)
✅ "Storage Station" — נשאר (שם מותג)
✅ "Yad2" — נשאר (שם מותג)
✅ "long-tail" / "head term" — נשאר (allowlist SEO term)
✅ "campaign.id = '23184792647'" — נשאר (numeric ID, technical context)
✅ JSON field names באנגלית — נשארים: { "campaignId": "...", "status": "..." }

## פלט — טקסט גולמי, לא JSON עוטף

⚠ **אל תעטוף את הפלט ב-JSON.** החזר ישירות את התוכן הנקי כפי שהוא (markdown narrative + JSON code-blocks פנימיים ככתוב במקור), רק עם תרגום לעברית של מילים אנגליות שאינן ב-allowlist. בלי הקדמה, בלי הסבר, בלי code-fence עוטף סביב הכל.

${recordsJson
    ? `אחרי כל התוכן, הוסף שורה אחת בדיוק שמכילה רק את הסמן הזה:\n\n<<<CLEANED_RECORDS_JSON>>>\n\nואחרי הסמן — את מערך ה-records כ-JSON תקין (JSON.parse-able, בלי trailing commas, בלי הערות), נקי באותו אופן. אם אין שינוי — החזר את המערך כפי שהוא.`
    : `אין records לשכתב — החזר רק את התוכן, בלי הסמן.`}

## תוכן לשכתוב (stageId: ${stageId})

\`\`\`
${content}
\`\`\`

${recordsJson ? `## רשומות לשכתוב (records JSON)\n\n\`\`\`json\n${recordsJson}\n\`\`\`` : ''}

החזר את התוכן הנקי${recordsJson ? ' ואחריו <<<CLEANED_RECORDS_JSON>>> + מערך ה-records הנקי' : ''}, בלי שום עטיפה נוספת.`

/**
 * Phase QA round-10 — output is now RAW text, not a JSON envelope.
 *
 * The old format wrapped the whole cleaned report inside a JSON string
 * (`{ "cleaned_content": "<full markdown>", ... }`). That doubled the
 * effective output pressure (the model re-emitted the entire report PLUS
 * escaped every \n and "), so a ~66K-char internal_seo_audit overran
 * Sonnet's 32K-token cap and truncated mid-JSON ("Unterminated string at
 * position 66149") → parse failed → whole cleanup lost.
 *
 * Now the model returns the cleaned markdown verbatim, optionally followed
 * by a `<<<CLEANED_RECORDS_JSON>>>` sentinel + the records array. No
 * escaping overhead, and the content (emitted FIRST) survives even if the
 * trailing records JSON gets cut — we just fall back to original records in
 * that case. So the threshold can be much higher; content up to ~80K chars
 * fits comfortably in the 32K-token output budget as raw text.
 */
const SKIP_THRESHOLD_CHARS = 90_000
const RECORDS_SENTINEL = '<<<CLEANED_RECORDS_JSON>>>'

export async function runHebrewCleanup(input: HebrewCleanupInput): Promise<HebrewCleanupResult> {
    const { content, records, instanceId, stageId } = input

    // Skip oversized stages entirely — see comment above.
    if (content.length > SKIP_THRESHOLD_CHARS) {
        console.log(`[hebrewCleanup/${stageId}] content ${content.length} > ${SKIP_THRESHOLD_CHARS} threshold — skipping (would overflow Sonnet output cap)`)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
    }

    let apiKey: string
    try {
        apiKey = await getApiKeyForInstance(instanceId)
    } catch (err) {
        console.warn(`[hebrewCleanup/${stageId}] no API key — skipping:`, (err as Error).message)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
    }
    if (!apiKey) {
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
    }

    const recordsJson = records && records.length > 0 ? JSON.stringify(records) : null
    const prompt = CLEANUP_PROMPT_TEMPLATE(content, recordsJson, stageId)
    const inputTokensApprox = Math.ceil(prompt.length / 3.5)

    let raw = ''
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: SONNET_MODEL,
                max_tokens: 32000,
                stream: true,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(900_000),
        })
        if (!res.ok) {
            console.warn(`[hebrewCleanup/${stageId}] HTTP ${res.status} — skipping`)
            return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
        }
        if (!res.body) return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        try {
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buf.indexOf('\n\n')) >= 0) {
                    const event = buf.substring(0, nl)
                    buf = buf.substring(nl + 2)
                    for (const line of event.split('\n')) {
                        if (!line.startsWith('data: ')) continue
                        const data = line.substring(6).trim()
                        if (!data || data === '[DONE]') continue
                        try {
                            const j = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                            if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
                                raw += j.delta.text
                            }
                        } catch { /* skip non-JSON SSE chatter */ }
                    }
                }
            }
        } finally {
            try { reader.releaseLock() } catch { /* noop */ }
        }
    } catch (err) {
        console.warn(`[hebrewCleanup/${stageId}] network error — skipping:`, (err as Error).message)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true }
    }

    const outputTokensApprox = Math.ceil(raw.length / 3.5)

    if (!raw.trim()) {
        console.warn(`[hebrewCleanup/${stageId}] empty response — skipping`)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true, inputTokensApprox, outputTokensApprox }
    }

    // Split on the records sentinel. Content comes FIRST so it survives even
    // if the trailing records JSON was truncated — in that case we keep the
    // original records. Strip an accidental whole-output markdown fence.
    const stripWrapFence = (s: string): string => {
        const m = s.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
        return m ? m[1].trim() : s.trim()
    }
    const sentinelIdx = raw.indexOf(RECORDS_SENTINEL)
    let cleanedContent: string
    let cleanedRecords: unknown[] | undefined = records
    if (sentinelIdx >= 0) {
        cleanedContent = stripWrapFence(raw.slice(0, sentinelIdx))
        if (records && records.length > 0) {
            let recsRaw = raw.slice(sentinelIdx + RECORDS_SENTINEL.length).trim()
            const fence = recsRaw.match(/```(?:json)?\s*([\s\S]*?)```/i)
            if (fence) recsRaw = fence[1].trim()
            const arrStart = recsRaw.indexOf('[')
            const arrEnd = recsRaw.lastIndexOf(']')
            if (arrStart >= 0 && arrEnd > arrStart) {
                try {
                    const parsedRecs = JSON.parse(recsRaw.substring(arrStart, arrEnd + 1))
                    if (Array.isArray(parsedRecs)) cleanedRecords = parsedRecs
                } catch (err) {
                    console.warn(`[hebrewCleanup/${stageId}] records JSON parse failed — keeping originals:`, (err as Error).message)
                }
            }
        }
    } else {
        cleanedContent = stripWrapFence(raw)
    }

    // Phase 4.0(fix8) — safety guard. If the model output is dramatically
    // shorter than the input (>50% loss), it almost certainly truncated
    // (hit max_tokens cap mid-stream — saw this with Haiku output limit).
    // Reject the cleanup and ship the original content instead. We lose
    // the filler-scrubbing pass but keep the report intact.
    const lossRatio = content.length > 0 ? (content.length - cleanedContent.length) / content.length : 0
    if (lossRatio > 0.5) {
        console.warn(`[hebrewCleanup/${stageId}] suspected truncation — content ${content.length}→${cleanedContent.length} (${Math.round(lossRatio * 100)}% loss). REJECTING cleanup, keeping original.`)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true, inputTokensApprox, outputTokensApprox }
    }

    console.log(`[hebrewCleanup/${stageId}] applied — input ${inputTokensApprox} tok, output ${outputTokensApprox} tok, content ${content.length}→${cleanedContent.length} chars, records ${records?.length ?? 0}→${cleanedRecords?.length ?? 0}`)

    return {
        cleanedContent,
        cleanedRecords,
        applied: true,
        skipped: false,
        inputTokensApprox,
        outputTokensApprox,
    }
}