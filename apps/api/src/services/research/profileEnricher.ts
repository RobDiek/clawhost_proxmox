/**
 * Phase 2.3.I — auto-enrich profile from website URL.
 *
 * The user is asked for businessDescription / targetAudience / etc. in the
 * questionnaire, but typing 1-2 sentences yields a thin profile that
 * downstream prompts can't reason about. We already have the URL — fetch
 * 3-5 key pages, extract the relevant fields with Sonnet, and merge them
 * into the existing answers (user-provided text WINS where present).
 *
 * Used by:
 *   - setupAgents (questionnaire submit) — auto-fires when blanks/shorts
 *     detected so user doesn't have to think about it
 *   - POST /profile/enrich (standalone) — explicit user trigger from the
 *     preflight modal "fill from website" button
 *
 * Phase 2.3.I/fix — crawl uses DIRECT HTTP fetch from the management
 * server, not Crawl4AI on the VPS. Crawl4AI isn't installed on every
 * VPS, and even when it is, it's an overkill for a one-shot 3-page
 * extraction. Direct fetch + strip-tags + Sonnet (which handles messy
 * HTML well) is faster, cheaper, and works without VPS deps.
 */

type EnrichmentInput = {
    websiteUrl: string
    /** Existing answers — user text wins where present + non-empty. */
    existing: Record<string, unknown>
    /** Instance ref kept for backward compatibility — no longer used for
     *  the crawl (we fetch directly from the management server). */
    instance: { ip: string; rootPassword: string | null }
    apiKey: string
    /** Optional Firecrawl API key — used as fallback when direct fetch
     *  fails or returns too-thin content (SPA, anti-bot, geo-blocking).
     *  Firecrawl renders JS + bypasses common bot detection. */
    firecrawlKey?: string | null
}

/**
 * Lightweight HTML → plain-text extraction. Strips scripts/styles,
 * preserves headings/paragraphs as line breaks, normalizes whitespace.
 * Trades some fidelity for zero deps — good enough for LLM consumption.
 */
function htmlToText(html: string): { title: string; text: string; links: string[] } {
    // Title from <title> or first <h1>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    const title = (titleMatch ? titleMatch[1] : '').replace(/\s+/g, ' ').trim()

    // Collect internal links before stripping HTML
    const links: string[] = []
    const linkRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(html)) !== null) {
        if (m[1] && !m[1].startsWith('#') && !m[1].startsWith('mailto:') && !m[1].startsWith('tel:')) {
            links.push(m[1])
        }
        if (links.length > 200) break
    }

    // Strip scripts, styles, comments, noscript
    let cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')

    // Convert block tags to newlines so structure is preserved
    cleaned = cleaned
        .replace(/<\/(p|div|h[1-6]|li|article|section|header|footer|nav|aside|main|tr)>/gi, '\n')
        .replace(/<(br|hr)\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')

    // Strip all remaining tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')

    // Decode common HTML entities (basic set — Sonnet handles the rest)
    cleaned = cleaned
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")

    // Normalize whitespace: collapse runs of spaces, allow up to 2 newlines
    cleaned = cleaned
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => l.length > 0)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')

    return { title, text: cleaned, links: [...new Set(links)] }
}

/**
 * Firecrawl fallback — uses the user's connected Firecrawl API key to
 * scrape pages that direct fetch can't reach (SPA needing JS render,
 * Cloudflare bot protection, geo-blocking). Slower (~10-20s/page) and
 * costs ~$0.001/page, so we only use it when direct fetch returns
 * null or too-thin markdown.
 */
async function fetchPageWithFirecrawl(
    url: string,
    apiKey: string,
): Promise<{ title: string; markdown: string; links: string[] } | null> {
    if (!/^https?:\/\//i.test(url)) return null
    if (!apiKey) return null
    try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                url,
                formats: ['markdown', 'links'],
                onlyMainContent: true,
                waitFor: 1500,  // give SPA JS time to render
                timeout: 30_000,
            }),
            signal: AbortSignal.timeout(45_000),
        })
        if (!res.ok) {
            console.warn(`[profileEnricher] Firecrawl ${url} → HTTP ${res.status}`)
            return null
        }
        const data = await res.json() as {
            success?: boolean
            data?: {
                markdown?: string
                links?: string[]
                metadata?: { title?: string }
            }
            error?: string
        }
        if (!data.success || !data.data?.markdown) {
            console.warn(`[profileEnricher] Firecrawl ${url} → empty (${data.error || 'unknown'})`)
            return null
        }
        return {
            title: data.data.metadata?.title || '',
            markdown: data.data.markdown.substring(0, 15_000),
            links: (data.data.links || []).slice(0, 200),
        }
    } catch (err) {
        console.warn(`[profileEnricher] Firecrawl ${url} failed:`, (err as Error).message)
        return null
    }
}

/**
 * Fetch with automatic fallback: try direct first (free, fast), then
 * Firecrawl if direct failed or returned too-thin content. Returns null
 * only if both routes failed.
 */
async function fetchPageWithFallback(
    url: string,
    firecrawlKey: string | null | undefined,
    notes: string[],
): Promise<{ title: string; markdown: string; links: string[]; via: 'direct' | 'firecrawl' } | null> {
    // Try direct first (free + fast)
    const direct = await fetchPage(url)
    const MIN_USEFUL_MARKDOWN = 200  // shell HTML without body content < 200c
    if (direct && direct.markdown.length >= MIN_USEFUL_MARKDOWN) {
        return { ...direct, via: 'direct' }
    }

    // Fall back to Firecrawl if available
    if (firecrawlKey) {
        const reason = !direct ? 'direct-fetch-failed' : `direct-too-thin-${direct.markdown.length}c`
        console.log(`[profileEnricher] ${url}: ${reason}, retrying via Firecrawl`)
        const fc = await fetchPageWithFirecrawl(url, firecrawlKey)
        if (fc && fc.markdown.length >= MIN_USEFUL_MARKDOWN) {
            notes.push(`firecrawl-fallback:${reason}`)
            return { ...fc, via: 'firecrawl' }
        }
        notes.push(`firecrawl-fallback-also-failed:${reason}`)
    } else if (!direct) {
        notes.push('direct-failed-no-firecrawl-key')
    } else {
        notes.push(`direct-too-thin-${direct.markdown.length}c-no-firecrawl-key`)
    }

    // Last resort: return whatever direct fetch got (even if thin) — better
    // than nothing if Sonnet can squeeze something out.
    if (direct && direct.markdown.length > 0) {
        return { ...direct, via: 'direct' }
    }
    return null
}

/**
 * Fetch a URL with timeout + size cap. Returns null on any failure.
 * SSRF-protected (no internal IPs).
 */
async function fetchPage(url: string): Promise<{ title: string; markdown: string; links: string[] } | null> {
    if (!/^https?:\/\//i.test(url)) return null
    const ssrfBlocked = /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i
    if (ssrfBlocked.test(url)) return null

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FlowmaticBot/1.0; +https://flowmatic.co.il)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
            console.warn(`[profileEnricher] fetch ${url} → HTTP ${res.status}`)
            return null
        }
        const ctype = res.headers.get('content-type') || ''
        if (!ctype.includes('html')) {
            console.warn(`[profileEnricher] skip non-HTML ${url} (${ctype})`)
            return null
        }
        // Cap body at 500KB to avoid OOM on huge pages
        const reader = res.body?.getReader()
        if (!reader) return null
        const chunks: Uint8Array[] = []
        let totalSize = 0
        const MAX_BYTES = 500_000
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
                chunks.push(value)
                totalSize += value.length
                if (totalSize >= MAX_BYTES) {
                    reader.cancel().catch(() => { /* ignore */ })
                    break
                }
            }
        }
        const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
        const html = buf.toString('utf-8')
        const { title, text, links } = htmlToText(html)
        return { title, markdown: text.substring(0, 15_000), links }
    } catch (err) {
        console.warn(`[profileEnricher] fetch ${url} failed:`, (err as Error).message)
        return null
    }
}

export type EnrichedProfile = {
    businessDescription?: string
    targetAudience?: string
    valuePropositions?: string[]
    productCategories?: string[]
    competitors?: string[]
    conversionMechanism?: string
    /** Phase 4.0(fix10) — mandatory for integration gate's business_profile
     *  check. Without these, downstream stages (validation, content_plan)
     *  return 422. */
    businessModel?: 'ecommerce' | 'saas' | 'service' | 'local' | 'content' | 'b2b' | 'marketplace' | 'other'
    geography?: string
    /** Raw debug fields so caller can inspect / log. */
    _meta: {
        pagesCrawled: string[]
        confidence: 'high' | 'medium' | 'low'
        notes: string[]
    }
}

const ENRICHMENT_TIMEOUT_MS = 180_000  // 3 min total budget
const MAX_PAGES = 5

/**
 * Pick the most informative pages on the user's site to feed into the
 * extractor. Heuristic: homepage + about/contact/products/services pages
 * if discoverable from the homepage's internal links.
 */
function selectPagesToCrawl(homepageLinks: string[], homepageUrl: string, domain: string): string[] {
    const targetSlugs = [
        'about', 'אודות', 'about-us',
        'services', 'service', 'שירותים',
        'products', 'product', 'מוצרים', 'collections',
        'contact', 'צור-קשר', 'contact-us',
        'pricing', 'plans', 'מחירים',
        'faq', 'שאלות',
    ]
    const matches = new Set<string>()
    for (const link of homepageLinks) {
        try {
            // Resolve relative links against homepage URL
            const u = new URL(link, homepageUrl)
            // Same domain only
            if (!u.hostname.includes(domain) && !domain.includes(u.hostname)) continue
            const path = decodeURIComponent(u.pathname).toLowerCase()
            if (targetSlugs.some(s => path.includes(`/${s}`))) {
                const clean = u.toString().replace(/#.*$/, '').replace(/\/$/, '')
                matches.add(clean)
            }
        } catch { /* invalid URL */ }
        if (matches.size >= MAX_PAGES - 1) break
    }
    return Array.from(matches)
}

const EXTRACTION_PROMPT = `אתה אנליסט שיווק שמקבל markdown של עמודי אתר ומחזיר JSON מובנה על העסק.

המשימה: לחלץ את הפרטים הבאים על העסק. החזר JSON אחד בלבד, ללא טקסט מסביב, ללא code fences.

## פלט נדרש (כל השדות אופציונליים — אם לא ברור, השאר ריק):

{
  "businessDescription": "1-3 משפטים בעברית. מה העסק עושה, למי, ומה הערך שלו. דוגמה טובה: 'חבילות אריזה מוכנות למעבר דירה — קרטונים, סרטי דבק, גלילי בועות, נייר עטיפה. משלוח מהיר ברחבי הארץ. מתאים למשפחות, סטודנטים ועסקים.'",
  "businessModel": "ENUM אחד מבין: 'ecommerce' (חנות אונליין שמוכרת מוצרים) / 'saas' (תוכנה במנוי) / 'service' (שירות פיזי או דיגיטלי — אחסון, ניקיון, הובלות, ייעוץ, ביטוח, רפואה) / 'local' (עסק מקומי תלוי-מיקום — מסעדה, מספרה, סטודיו יוגה) / 'content' (אתר תוכן / בלוג / מדיה) / 'b2b' (מוכרים לעסקים בלבד) / 'marketplace' (פלטפורמה שמחברת ספקים ולקוחות) / 'other'. חובה למלא — חיוני להמשך המחקר.",
  "geography": "אזור גיאוגרפי שהעסק משרת. דוגמאות: 'ישראל — מרכז (תל אביב, רמת גן, גבעתיים, פתח תקווה)' / 'ישראל — ארצי' / 'ישראל + ארה״ב' / 'גלובלי, אנגלית'. חובה למלא.",
  "targetAudience": "1-2 משפטים בעברית. מי הלקוח האידיאלי — דמוגרפיה + מה הם רוצים + מה הכאב. דוגמה: 'משפחות וסטודנטים בגילאי 25-50 שעוברים דירה ורוצים פתרון אריזה מהיר ונוח. עסקים קטנים שמשנים משרד.'",
  "valuePropositions": ["3-5 USP'ים קצרים שהאתר עצמו מדגיש (משלוח מהיר, מחיר טוב, איכות גבוהה, מבחר רחב, וכו')"],
  "productCategories": ["קטגוריות עיקריות שהאתר מציג (למשל: 'קרטונים', 'סרטי דבק', 'אריזת מתנות'). אם זה אתר שירות — סוגי שירותים."],
  "competitors": ["שמות חברות שהאתר עצמו מזכיר כאלטרנטיבה / משווה אליהן (לרוב ריק)"],
  "conversionMechanism": "איך לקוח קונה / ממיר. אופציות: 'רכישה ישירה באתר' / 'טופס ליד' / 'שיחת טלפון' / 'WhatsApp' / 'ביקור בחנות' / 'פגישת ייעוץ'. אפשר כמה מופרדים בפסיק.",
  "confidence": "high אם המידע מהאתר ברור ומפורט, medium אם חלקי, low אם רוב השדות נשארים ריקים",
  "notes": ["הערות קצרות לקאלר אם משהו לא ברור או חסר"]
}

## חוקים
- עברית בלבד בכל הטקסטים. אם האתר באנגלית, תרגם.
- אל תמציא — אם לא רואים, השאר ריק.
- businessDescription חייב להיות קונקרטי, לא משווקי-מנופח. עדיף "מוכרים חבילות אריזה למעברי דירה" מאשר "המקום שלכם לכל צרכי האריזה!".
- businessModel + geography הם חובה — אם לא ברור מהאתר, החזר את ההערכה הסבירה ביותר על סמך התוכן (לא להשאיר ריק).

## העמודים שנסרקו:`

type SonnetResponse = {
    businessDescription?: string
    targetAudience?: string
    valuePropositions?: string[]
    productCategories?: string[]
    competitors?: string[]
    conversionMechanism?: string
    businessModel?: 'ecommerce' | 'saas' | 'service' | 'local' | 'content' | 'b2b' | 'marketplace' | 'other'
    geography?: string
    confidence?: 'high' | 'medium' | 'low'
    notes?: string[]
}

async function extractWithSonnet(
    apiKey: string,
    pages: Array<{ url: string; markdown: string; title: string }>,
): Promise<SonnetResponse | null> {
    if (pages.length === 0) return null

    // Cap per-page markdown to keep total prompt under ~30K tokens
    const blocks = pages.map(p => {
        const truncated = (p.markdown || '').substring(0, 8000)
        return `### ${p.title || p.url}\n${p.url}\n\n${truncated}`
    }).join('\n\n---\n\n')

    const fullPrompt = `${EXTRACTION_PROMPT}\n\n${blocks}\n\nעכשיו החזר JSON.`

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 2000,
                messages: [{ role: 'user', content: fullPrompt }],
            }),
            signal: AbortSignal.timeout(90_000),
        })
        if (!res.ok) {
            console.warn(`[profileEnricher] Sonnet HTTP ${res.status}`)
            return null
        }
        const data = await res.json() as { content?: Array<{ text?: string }> }
        const text = (data.content?.[0]?.text || '').trim()
        // Strip code fences if present
        const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
        const firstBrace = cleaned.indexOf('{')
        const lastBrace = cleaned.lastIndexOf('}')
        if (firstBrace < 0 || lastBrace < 0) return null
        try {
            return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
        } catch (e) {
            console.warn('[profileEnricher] JSON parse failed:', (e as Error).message, text.substring(0, 300))
            return null
        }
    } catch (e) {
        console.warn('[profileEnricher] Anthropic call failed:', (e as Error).message)
        return null
    }
}

/**
 * Determine which fields are "blank or thin" in the existing answers and
 * worth filling from the URL. User-provided non-empty values are NEVER
 * overwritten — enrichment only fills blanks or replaces strings shorter
 * than the minimum quality threshold.
 */
function shouldEnrichField(
    field: keyof EnrichedProfile,
    existing: Record<string, unknown>,
): boolean {
    const v = existing[field]
    switch (field) {
        case 'businessDescription':
            return typeof v !== 'string' || v.trim().length < 30
        case 'targetAudience':
            return typeof v !== 'string' || v.trim().length < 20
        case 'competitors':
            return typeof v !== 'string' || v.trim().length < 3
        case 'conversionMechanism':
            return typeof v !== 'string' || v.trim().length < 5
        case 'businessModel':
        case 'geography':
            // Phase 4.0(fix10) — mandatory for integration gate's
            // business_profile check. Fill if blank.
            return typeof v !== 'string' || v.trim().length < 3
        case 'valuePropositions':
        case 'productCategories':
            return !Array.isArray(v) || v.length === 0
        default:
            return false
    }
}

export async function enrichProfileFromUrl(input: EnrichmentInput): Promise<EnrichedProfile | null> {
    const { websiteUrl, existing, apiKey, firecrawlKey } = input
    const url = (websiteUrl || '').trim()
    if (!url || !apiKey) return null

    const startedAt = Date.now()
    const notes: string[] = []

    let domain = ''
    let normalizedUrl = url
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`)
        domain = u.hostname.replace(/^www\./, '')
        normalizedUrl = u.toString()
    } catch {
        return null
    }

    // Step 1: fetch homepage with auto-fallback (direct → Firecrawl if thin/failed)
    console.log(`[profileEnricher] fetching homepage: ${normalizedUrl}`)
    const homepage = await fetchPageWithFallback(normalizedUrl, firecrawlKey, notes)
    if (!homepage || !homepage.markdown || homepage.markdown.length < 100) {
        notes.push('fetch-homepage-failed-or-empty')
        console.warn(`[profileEnricher] homepage fetch failed for ${normalizedUrl}`)
        return { _meta: { pagesCrawled: [], confidence: 'low', notes } }
    }
    console.log(`[profileEnricher] homepage via ${homepage.via}: ${homepage.markdown.length}c`)
    const pagesCrawled = [normalizedUrl]
    const allPages = [{ url: normalizedUrl, markdown: homepage.markdown, title: homepage.title || domain }]

    // Step 2: pick + fetch key sub-pages (about / products / services / contact).
    // Sub-pages also use the fallback chain, but we cap Firecrawl spend by
    // using direct-only after the first FC hit succeeded on the homepage
    // (homepage Firecrawl-rendered HTML usually has the relative links we
    // need; the actual /about etc. pages may be hit directly with their
    // permalink and might work via direct).
    if (Date.now() - startedAt < ENRICHMENT_TIMEOUT_MS - 60_000) {
        const subPages = selectPagesToCrawl(homepage.links || [], normalizedUrl, domain).slice(0, MAX_PAGES - 1)
        console.log(`[profileEnricher] selected ${subPages.length} sub-pages: ${subPages.join(', ')}`)
        for (const subUrl of subPages) {
            const p = await fetchPageWithFallback(subUrl, firecrawlKey, notes)
            if (p && p.markdown.length > 100) {
                allPages.push({ url: subUrl, markdown: p.markdown, title: p.title })
                pagesCrawled.push(subUrl)
            }
        }
    }
    console.log(`[profileEnricher] total pages collected: ${allPages.length}`)

    // Step 3: extract with Sonnet
    const extracted = await extractWithSonnet(apiKey, allPages)
    if (!extracted) {
        notes.push('extraction-failed')
        return { _meta: { pagesCrawled, confidence: 'low', notes } }
    }

    // Step 4: merge — only fill fields where existing is blank/thin
    const merged: EnrichedProfile = {
        _meta: {
            pagesCrawled,
            confidence: extracted.confidence || 'medium',
            notes: [...notes, ...(extracted.notes || [])],
        },
    }
    if (extracted.businessDescription && shouldEnrichField('businessDescription', existing)) {
        merged.businessDescription = extracted.businessDescription.trim()
    }
    if (extracted.targetAudience && shouldEnrichField('targetAudience', existing)) {
        merged.targetAudience = extracted.targetAudience.trim()
    }
    if (Array.isArray(extracted.valuePropositions) && shouldEnrichField('valuePropositions', existing)) {
        merged.valuePropositions = extracted.valuePropositions.filter(Boolean).slice(0, 5)
    }
    if (Array.isArray(extracted.productCategories) && shouldEnrichField('productCategories', existing)) {
        merged.productCategories = extracted.productCategories.filter(Boolean).slice(0, 10)
    }
    if (Array.isArray(extracted.competitors) && extracted.competitors.length > 0 && shouldEnrichField('competitors', existing)) {
        merged.competitors = extracted.competitors.filter(Boolean).slice(0, 5)
    }
    if (extracted.conversionMechanism && shouldEnrichField('conversionMechanism', existing)) {
        merged.conversionMechanism = extracted.conversionMechanism.trim()
    }
    // Phase 4.0(fix10) — businessModel + geography (mandatory for downstream gate)
    if (extracted.businessModel && shouldEnrichField('businessModel', existing)) {
        merged.businessModel = extracted.businessModel
    }
    if (extracted.geography && shouldEnrichField('geography', existing)) {
        merged.geography = extracted.geography.trim()
    }
    return merged
}

/**
 * Convenience: take an EnrichedProfile and produce the patch object that
 * should be merged into answers via writeResearchData. Converts arrays
 * to comma-separated strings (legacy storage format) and skips _meta.
 */
export function enrichmentToAnswersPatch(e: EnrichedProfile): Record<string, unknown> {
    const patch: Record<string, unknown> = {}
    if (e.businessDescription) patch.businessDescription = e.businessDescription
    if (e.targetAudience) patch.targetAudience = e.targetAudience
    if (e.competitors && e.competitors.length > 0) patch.competitors = e.competitors.join(', ')
    if (e.conversionMechanism) patch.conversionMechanism = e.conversionMechanism
    // Phase 4.0(fix10) — mandatory for integration gate
    if (e.businessModel) patch.businessModel = e.businessModel
    if (e.geography) patch.geography = e.geography
    // valuePropositions + productCategories are stored as arrays for now
    if (e.valuePropositions && e.valuePropositions.length > 0) patch.valuePropositions = e.valuePropositions
    if (e.productCategories && e.productCategories.length > 0) patch.productCategories = e.productCategories
    patch._enrichedAt = new Date().toISOString()
    patch._enrichmentMeta = e._meta
    return patch
}