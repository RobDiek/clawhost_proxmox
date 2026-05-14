/**
 * Landing-page CRO audit for paid competitor research.
 *
 * For each competitor we know about, fetch their main money-page and run
 * deterministic heuristics looking for the CRO signals that matter for
 * paid traffic conversion:
 *
 *   - H1 / hero copy (what's their value prop above the fold)
 *   - Primary CTA (button text, position, contrast — but only the text;
 *     visual position is hard to extract without rendering)
 *   - Form field count (1-3 fields = low friction; 7+ = high friction)
 *   - Hero imagery presence (image/video hero vs. text-only hero)
 *   - Social proof signals (testimonials, ratings, review counts, logos)
 *   - Trust signals (security badges, money-back, contact info)
 *   - Pricing visibility (is price shown above the fold? Hidden behind form?)
 *   - WhatsApp / phone CTAs (IL-specific — WhatsApp drives more leads in IL)
 *   - Schema markup type (Product / LocalBusiness / FAQPage)
 *
 * Approach: prefer Firecrawl (renders JS, handles cookie walls). Fall
 * back to plain fetch if no Firecrawl key. Same fallback ladder as
 * profileEnricher.ts.
 *
 * Output: structured per-page record consumed by paid_competitor_landscape
 * Opus prompt → "competitor LP X has 7-field form + no hero video + only
 * 2 testimonials → our LP should test 3-field form + hero video".
 */

export interface LandingPageAudit {
    url: string
    fetchOk: boolean
    fetchError?: string
    fetchSource: 'firecrawl' | 'direct' | 'failed'
    /** Page title from <title> or og:title. */
    title?: string
    /** First H1 found. */
    h1?: string
    /** First paragraph of main content (≤300 chars). */
    leadParagraph?: string
    /** All button-like CTAs we found, in order of appearance. */
    ctaButtons: Array<{
        text: string
        href?: string
        /** Heuristic: 'primary' if first prominent + above estimated fold, 'secondary' otherwise. */
        position: 'primary' | 'secondary'
    }>
    /** Number of <input> fields counted on the page. */
    formFieldCount: number
    /** True if a <form> exists at all. */
    hasForm: boolean
    /** True if page has hero img/video at top. */
    heroMediaPresent: boolean
    /** Social proof signals detected — testimonials, ratings, review counts, brand logos. */
    socialProof: {
        testimonialBlocks: number     // count of testimonial-shaped HTML chunks
        starRatingsShown: boolean     // ★ or "X/5" or "X stars"
        reviewCountMentioned?: number // extracted "based on 142 reviews"
        brandLogos: number            // count of <img> in trust-bar shape (small, repeated)
    }
    /** Trust signals — security, money-back, contact, address. */
    trustSignals: {
        sslBadge: boolean
        moneyBackMentioned: boolean
        phoneNumber?: string          // first phone number found in he/en format
        addressMentioned: boolean
        whatsappCTA: boolean          // wa.me links or "WhatsApp" mentions
    }
    /** Pricing visibility */
    pricing: {
        priceShown: boolean
        priceText?: string             // first price match (₪/$/€)
        pricingHidden: boolean         // form-gated pricing (no price + form)
    }
    /** Schema.org types found in JSON-LD blocks. */
    schemaTypes: string[]
    /** CRO warnings synthesized from the above (Hebrew strings, ≤200 chars). */
    croWarnings: string[]
    /** Performance hints (Firecrawl returns render time; rough proxy for actual load speed). */
    estimatedLoadHint?: 'fast' | 'medium' | 'slow' | 'unknown'
}

const HEBREW_FORM_FIELD_NAMES = ['שם', 'טלפון', 'אימייל', 'דוא"ל', 'הודעה', 'עיר', 'כתובת']

/** Try direct fetch first (zero cost). Returns null if fails / not enough content. */
async function fetchDirect(url: string): Promise<{ html: string; markdown: string } | null> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FlowmaticPaidAudit/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok) return null
        const html = await res.text()
        if (html.length < 1000) return null
        return { html, markdown: '' }
    } catch { return null }
}

/** Firecrawl fetch (renders JS — needed for SPA landing pages). */
async function fetchWithFirecrawl(url: string, apiKey: string): Promise<{ html: string; markdown: string } | null> {
    try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                url,
                formats: ['html', 'markdown'],
                onlyMainContent: false,    // CRO audit needs forms/CTAs which are often in footer/headers
                waitFor: 2000,
                timeout: 30_000,
            }),
            signal: AbortSignal.timeout(50_000),
        })
        if (!res.ok) return null
        const data = await res.json() as {
            success?: boolean
            data?: { html?: string; markdown?: string }
        }
        if (!data.success || !data.data?.html) return null
        return {
            html: data.data.html,
            markdown: (data.data.markdown || '').slice(0, 15_000),
        }
    } catch { return null }
}

// ─── Heuristic extractors ─────────────────────────────────────────────────

function extractFirst(html: string, regex: RegExp): string | undefined {
    const m = html.match(regex)
    return m ? m[1].trim() : undefined
}

function extractAllCtas(html: string): LandingPageAudit['ctaButtons'] {
    const out: LandingPageAudit['ctaButtons'] = []
    // <button> with text
    const buttonRe = /<button[^>]*>([\s\S]*?)<\/button>/gi
    let m: RegExpExecArray | null
    let idx = 0
    while ((m = buttonRe.exec(html)) !== null) {
        const text = m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ').slice(0, 60)
        if (text.length > 0 && text.length < 80) {
            out.push({ text, position: idx < 2 ? 'primary' : 'secondary' })
            idx++
        }
        if (out.length >= 12) break
    }
    // <a> with button-ish classes (best-effort heuristic)
    const linkBtnRe = /<a[^>]*\b(class|data-component)=['"][^'"]*(?:btn|button|cta|action)[^'"]*['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi
    while ((m = linkBtnRe.exec(html)) !== null) {
        const text = m[3].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ').slice(0, 60)
        const href = m[2]
        if (text.length > 0 && text.length < 80) {
            out.push({ text, href, position: out.length < 2 ? 'primary' : 'secondary' })
        }
        if (out.length >= 15) break
    }
    return out
}

function countFormFields(html: string): { fieldCount: number; hasForm: boolean } {
    const hasForm = /<form\b/i.test(html)
    const inputRe = /<(input|select|textarea)\b[^>]*>/gi
    const matches = [...html.matchAll(inputRe)]
    // Filter out hidden/submit/csrf
    const visibleInputs = matches.filter(m => {
        const tag = m[0].toLowerCase()
        if (/type=["']?hidden/.test(tag)) return false
        if (/type=["']?submit/.test(tag)) return false
        if (/type=["']?button/.test(tag)) return false
        return true
    })
    return { fieldCount: visibleInputs.length, hasForm }
}

function detectHeroMedia(html: string): boolean {
    // Look for hero img/video in first 5000 chars (above-fold approximation)
    const head = html.slice(0, 6000)
    if (/<video\b/i.test(head)) return true
    if (/<img\b[^>]*\b(class|id)=['"][^'"]*(?:hero|banner|cover)[^'"]*['"]/i.test(head)) return true
    // Look for og:image (typically the hero or product image)
    if (/<meta[^>]*property=['"]og:image['"][^>]*content=['"][^'"]+['"]/i.test(head)) return true
    return false
}

function detectSocialProof(html: string): LandingPageAudit['socialProof'] {
    const testimonialMarkers = [
        /testimonial/i, /\bהמלצ/u, /\breviews?\b/i, /\bביקור[ות]?\b/u, /case study/i,
    ]
    let testimonialBlocks = 0
    for (const re of testimonialMarkers) {
        const matches = html.match(new RegExp(re.source, 'gi'))
        if (matches) testimonialBlocks += Math.min(matches.length, 5)
    }
    const starRatingsShown = /★|⭐|[1-5]\s*\/\s*5|[1-5]\.\d\s*(stars?|כוכבים)/iu.test(html)
    const reviewCountMatch = html.match(/(?:based\s+on\s+|מתוך\s+)(\d{1,5})\s+(?:reviews?|ביקור)/iu)
    const reviewCountMentioned = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : undefined
    // Brand logos = small repeated <img> in a trust bar — proxy with `clients` / `partners` / `as-seen-in`
    const trustBarMatches = (html.match(/(?:trusted|featured|seen on|partners|clients|brands)/gi) || []).length
    const brandLogos = Math.min(trustBarMatches * 2, 10)
    return { testimonialBlocks, starRatingsShown, reviewCountMentioned, brandLogos }
}

function detectTrustSignals(html: string, url: string): LandingPageAudit['trustSignals'] {
    const sslBadge = url.startsWith('https://')
        || /secure|ssl|encrypted|מאובטח/iu.test(html.slice(0, 8000))
    const moneyBackMentioned = /money[\s-]?back|ערבות|החזר כספי|guarantee/iu.test(html)
    const phoneRe = /(?:tel:|whatsapp[^"']*)((?:\+972|0)5\d[\s-]?\d{3}[\s-]?\d{4})/u
    const phoneMatch = html.match(phoneRe)
    const phoneNumber = phoneMatch ? phoneMatch[1] : undefined
    const addressMentioned = /<address\b/i.test(html) || /\bכתובת\b|\baddress\b/iu.test(html)
    const whatsappCTA = /wa\.me|whatsapp|וואטסאפ/iu.test(html)
    return { sslBadge, moneyBackMentioned, phoneNumber, addressMentioned, whatsappCTA }
}

function detectPricing(html: string, hasForm: boolean): LandingPageAudit['pricing'] {
    const priceRe = /(₪|ש["׳]ח|NIS|\$|€)\s*\d{1,5}(?:[.,]\d{1,2})?/u
    const priceMatch = html.match(priceRe)
    const priceShown = !!priceMatch
    const priceText = priceMatch ? priceMatch[0] : undefined
    const pricingHidden = !priceShown && hasForm
    return { priceShown, priceText, pricingHidden }
}

function extractSchemaTypes(html: string): string[] {
    const out = new Set<string>()
    const blocks = html.match(/<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)
    if (!blocks) return []
    for (const b of blocks) {
        const m = b.match(/['"]@type['"]\s*:\s*['"]?(\w+)['"]?/g) || []
        for (const t of m) {
            const v = t.match(/(\w+)\s*$/)?.[1]
            if (v) out.add(v)
        }
    }
    return Array.from(out).sort()
}

function synthesizeWarnings(a: LandingPageAudit): string[] {
    const warnings: string[] = []
    if (a.formFieldCount >= 7) warnings.push(`טופס ארוך (${a.formFieldCount} שדות) — חיכוך גבוה. שקלו לקצר ל-3-4 שדות חיוניים`)
    if (!a.heroMediaPresent) warnings.push('אין hero media (תמונה/סרטון) מעל הקיפול — דף נחיתה ללא visual hook')
    if (a.socialProof.testimonialBlocks === 0) warnings.push('אין testimonials או social proof — אמינות נמוכה לדף Paid traffic')
    if (!a.trustSignals.phoneNumber && !a.trustSignals.whatsappCTA) warnings.push('אין מספר טלפון או WhatsApp CTA — חסר נתיב conversion עבור IL audience')
    if (a.pricing.pricingHidden) warnings.push('מחירים מוסתרים מאחורי טופס — נהוג לרוב לעבוד טוב, אבל בודקים במגזר העסקי. במגזר B2C → להציג')
    if (a.ctaButtons.length === 0) warnings.push('לא זוהו CTAs ברורים — חוסר Action על הדף')
    if (a.ctaButtons.length > 0 && a.ctaButtons[0].text.length > 35) warnings.push('CTA טקסט ארוך (>35 תווים) — להעדיף 1-3 מילים פעולה ("שלחו עכשיו")')
    if (!a.trustSignals.sslBadge && a.url.startsWith('http://')) warnings.push('אין SSL (HTTPS) — Quality Score נפגע + אמינות נמוכה')
    if (a.schemaTypes.length === 0) warnings.push('אין JSON-LD schema markup — מאבדים Rich Results ב-Google Ads + AEO')
    return warnings
}

// ─── Public entry point ──────────────────────────────────────────────────

export interface AuditOpts {
    url: string
    firecrawlKey?: string | null
    /** Prefer Firecrawl even when direct fetch succeeds (SPA-likely sites). */
    preferFirecrawl?: boolean
}

export async function auditLandingPage(opts: AuditOpts): Promise<LandingPageAudit> {
    const base: LandingPageAudit = {
        url: opts.url,
        fetchOk: false,
        fetchSource: 'failed',
        ctaButtons: [],
        formFieldCount: 0,
        hasForm: false,
        heroMediaPresent: false,
        socialProof: { testimonialBlocks: 0, starRatingsShown: false, brandLogos: 0 },
        trustSignals: { sslBadge: opts.url.startsWith('https://'), moneyBackMentioned: false, addressMentioned: false, whatsappCTA: false },
        pricing: { priceShown: false, pricingHidden: false },
        schemaTypes: [],
        croWarnings: [],
    }

    // 1. Fetch — direct first (free), Firecrawl fallback if direct fails or short
    let payload: { html: string; markdown: string } | null = null
    if (!opts.preferFirecrawl) {
        payload = await fetchDirect(opts.url)
        if (payload) base.fetchSource = 'direct'
    }
    if (!payload && opts.firecrawlKey) {
        payload = await fetchWithFirecrawl(opts.url, opts.firecrawlKey)
        if (payload) base.fetchSource = 'firecrawl'
    }
    if (!payload) {
        base.fetchError = 'Both direct fetch and Firecrawl returned no content'
        return base
    }

    base.fetchOk = true
    const { html } = payload

    // 2. Extract — heuristics
    base.title = extractFirst(html, /<title[^>]*>([^<]+)<\/title>/i) ||
        extractFirst(html, /<meta[^>]*property=['"]og:title['"][^>]*content=['"]([^'"]+)['"]/i)
    base.h1 = extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, '').trim().slice(0, 200)
    base.leadParagraph = extractFirst(html, /<p[^>]*>([\s\S]{40,300}?)<\/p>/i)?.replace(/<[^>]+>/g, '').trim().slice(0, 300)
    base.ctaButtons = extractAllCtas(html)
    const formStats = countFormFields(html)
    base.formFieldCount = formStats.fieldCount
    base.hasForm = formStats.hasForm
    base.heroMediaPresent = detectHeroMedia(html)
    base.socialProof = detectSocialProof(html)
    base.trustSignals = detectTrustSignals(html, opts.url)
    base.pricing = detectPricing(html, formStats.hasForm)
    base.schemaTypes = extractSchemaTypes(html)
    base.croWarnings = synthesizeWarnings(base)

    return base
}

/**
 * Render a compact context block for the Opus prompt. Each LP becomes
 * a ~10-line summary; whole block kept under ~3K chars even with 5 LPs.
 */
export function renderLandingPageAuditsForPrompt(audits: LandingPageAudit[]): string {
    if (audits.length === 0) return '═══ LANDING PAGE CRO AUDITS ═══\n\n(no audits — no competitor LPs fetched)'

    const blocks = audits.map(a => {
        if (!a.fetchOk) return `LP: ${a.url}\n   ERROR: ${a.fetchError}`
        return [
            `LP: ${a.url}`,
            `   title: ${a.title?.slice(0, 80) || '(no title)'}`,
            `   H1: ${a.h1?.slice(0, 80) || '(no H1)'}`,
            `   primary CTA: ${a.ctaButtons[0]?.text || '(none detected)'}`,
            `   form: ${a.hasForm ? a.formFieldCount + ' fields' : 'no form'}`,
            `   hero media: ${a.heroMediaPresent ? 'yes' : 'no'}`,
            `   social proof: ${a.socialProof.testimonialBlocks} testimonials${a.socialProof.starRatingsShown ? ', stars shown' : ''}${a.socialProof.reviewCountMentioned ? `, ${a.socialProof.reviewCountMentioned} reviews mentioned` : ''}`,
            `   pricing: ${a.pricing.priceShown ? `shown (${a.pricing.priceText})` : a.pricing.pricingHidden ? 'HIDDEN behind form' : 'not detected'}`,
            `   IL signals: phone=${a.trustSignals.phoneNumber || 'no'}, whatsapp=${a.trustSignals.whatsappCTA ? 'yes' : 'no'}, schema=${a.schemaTypes.join('/')||'none'}`,
            a.croWarnings.length > 0 ? `   CRO warnings: ${a.croWarnings.slice(0, 4).join(' | ')}` : '',
        ].filter(Boolean).join('\n')
    }).join('\n\n')

    return [
        '═══ LANDING PAGE CRO AUDITS — Competitor money-pages ═══',
        '',
        blocks,
        '',
        'USE THIS TO REASON ABOUT:',
        '- Where competitors create friction (long forms, hidden pricing, no trust signals)',
        '- What CRO patterns are common in your category (so you match the bar)',
        '- IL-specific: are they offering WhatsApp CTA? phone number visible? — IL leads strongly prefer messaging channels',
        '- Schema markup: missing = lost rich results in Google Ads (sitelinks, ratings, prices)',
    ].join('\n')
}