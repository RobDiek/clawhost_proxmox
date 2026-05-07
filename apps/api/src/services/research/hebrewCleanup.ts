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

const SONNET_MODEL = 'claude-sonnet-4-5'

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

✅ "FAQPage schema" — נשאר (Schema.org type)
✅ "ה-CTR נמוך" — נשאר (allowlist acronym)
✅ "Storage Station" — נשאר (שם מותג)
✅ "Yad2" — נשאר (שם מותג)
✅ "long-tail" / "head term" — נשאר (allowlist SEO term)

## פלט

החזר JSON אחד עם המבנה הבא:

\`\`\`json
{
  "cleaned_content": "<התוכן הנקי — markdown narrative + JSON code-blocks ככתוב במקור, רק עם תרגום לעברית של מילים אנגליות שאינן ב-allowlist>",
  "cleaned_records_json": "<אם סופקו records, כאן ה-JSON.stringify של מערך records נקי. אחרת null.>"
}
\`\`\`

⚠ \`cleaned_content\` ו-\`cleaned_records_json\` חייבים להיות parseable ב-JSON.parse. בלי trailing commas, בלי הערות.

## תוכן לשכתוב (stageId: ${stageId})

\`\`\`
${content}
\`\`\`

${recordsJson ? `## רשומות לשכתוב (records JSON)\n\n\`\`\`json\n${recordsJson}\n\`\`\`` : ''}

החזר JSON אחד עם cleaned_content ו-cleaned_records_json. ${recordsJson ? '' : '(records לא סופקו → cleaned_records_json: null)'}`

export async function runHebrewCleanup(input: HebrewCleanupInput): Promise<HebrewCleanupResult> {
    const { content, records, instanceId, stageId } = input

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
            signal: AbortSignal.timeout(360_000),
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

    // Parse the JSON response — find the first top-level { ... }
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
        console.warn(`[hebrewCleanup/${stageId}] response had no JSON object — skipping`)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true, inputTokensApprox, outputTokensApprox }
    }
    let parsed: { cleaned_content?: string; cleaned_records_json?: string | null }
    try {
        parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1))
    } catch (err) {
        console.warn(`[hebrewCleanup/${stageId}] JSON parse failed — skipping:`, (err as Error).message)
        return { cleanedContent: content, cleanedRecords: records, applied: false, skipped: true, inputTokensApprox, outputTokensApprox }
    }

    const cleanedContent = typeof parsed.cleaned_content === 'string' ? parsed.cleaned_content : content
    let cleanedRecords: unknown[] | undefined = records
    if (parsed.cleaned_records_json && typeof parsed.cleaned_records_json === 'string') {
        try {
            const parsedRecs = JSON.parse(parsed.cleaned_records_json)
            if (Array.isArray(parsedRecs)) cleanedRecords = parsedRecs
        } catch (err) {
            console.warn(`[hebrewCleanup/${stageId}] records JSON parse failed — keeping originals:`, (err as Error).message)
        }
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