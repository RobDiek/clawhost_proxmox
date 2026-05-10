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
 */

import { crawlMultiple } from '@/services/crawl4ai'

type EnrichmentInput = {
    websiteUrl: string
    /** Existing answers — user text wins where present + non-empty. */
    existing: Record<string, unknown>
    /** Crawl runs on the agent's VPS — needs IP + root password. */
    instance: { ip: string; rootPassword: string | null }
    apiKey: string
}

export type EnrichedProfile = {
    businessDescription?: string
    targetAudience?: string
    valuePropositions?: string[]
    productCategories?: string[]
    competitors?: string[]
    conversionMechanism?: string
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
function selectPagesToCrawl(homepageLinks: string[], domain: string): string[] {
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
            const u = new URL(link)
            // Same domain only
            if (!u.hostname.includes(domain) && !domain.includes(u.hostname)) continue
            const path = u.pathname.toLowerCase()
            if (targetSlugs.some(s => path.includes(`/${s}`))) {
                matches.add(u.toString().replace(/\/$/, ''))
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

## העמודים שנסרקו:`

type SonnetResponse = {
    businessDescription?: string
    targetAudience?: string
    valuePropositions?: string[]
    productCategories?: string[]
    competitors?: string[]
    conversionMechanism?: string
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
        case 'valuePropositions':
        case 'productCategories':
            return !Array.isArray(v) || v.length === 0
        default:
            return false
    }
}

export async function enrichProfileFromUrl(input: EnrichmentInput): Promise<EnrichedProfile | null> {
    const { websiteUrl, existing, instance, apiKey } = input
    const url = (websiteUrl || '').trim()
    if (!url || !instance.ip || !apiKey) return null

    const startedAt = Date.now()
    const notes: string[] = []

    let domain = ''
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`)
        domain = u.hostname.replace(/^www\./, '')
    } catch {
        return null
    }

    // Step 1: crawl homepage
    const { crawlUrl } = await import('@/services/crawl4ai')
    const homepage = await crawlUrl(instance.ip, url, instance.rootPassword || undefined)
    if (!homepage || !homepage.markdown) {
        notes.push('crawl-homepage-failed')
        return { _meta: { pagesCrawled: [], confidence: 'low', notes } }
    }
    const pagesCrawled = [url]
    const allPages = [{ url, markdown: homepage.markdown, title: homepage.title || domain }]

    // Step 2: pick + crawl key sub-pages (about / products / services / contact)
    if (Date.now() - startedAt < ENRICHMENT_TIMEOUT_MS - 60_000) {
        const subPages = selectPagesToCrawl(homepage.links || [], domain).slice(0, MAX_PAGES - 1)
        if (subPages.length > 0) {
            const sub = await crawlMultiple(instance.ip, subPages, instance.rootPassword || undefined, 2)
            for (const p of sub) {
                allPages.push({ url: p.url, markdown: p.markdown, title: p.title })
                pagesCrawled.push(p.url)
            }
        }
    }

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
    // valuePropositions + productCategories are stored as arrays for now
    if (e.valuePropositions && e.valuePropositions.length > 0) patch.valuePropositions = e.valuePropositions
    if (e.productCategories && e.productCategories.length > 0) patch.productCategories = e.productCategories
    patch._enrichedAt = new Date().toISOString()
    patch._enrichmentMeta = e._meta
    return patch
}