/**
 * Brand Website Scanner v2 — REFLECT-NOT-INVENT.
 *
 * Principle: client's brand already EXISTS on their website. Our job is to
 * MIRROR it, not invent a new one. AI generation only fills explicit gaps
 * the user approved.
 *
 * Pipeline:
 *   PASS A — Visual extraction
 *     • Full HTML + computed CSS scrape (Firecrawl with html=true)
 *     • Color palette: top-6 non-neutral hex from CSS custom properties +
 *       inline styles, weighted by occurrence frequency
 *     • Fonts: priority h1 > h2 > body > nav (DOM walk)
 *     • Logo: 5-tier retry (og:image → schema.org → header img.logo →
 *       any header img with logo-ish alt → topmost img in first 200 lines)
 *     • Hero / brand imagery: 3-5 product/lifestyle photos
 *
 *   PASS B — Corpus collection
 *     • Targeted scrape: homepage / about / pricing / faq / services /
 *       contact / testimonials / blog (link-discovery + heuristic)
 *     • Concatenate as canonical brand voice corpus (~20K chars)
 *
 *   PASS C — Brand archaeology (Sonnet 4.6, NEW prompt)
 *     • Hebrew-only output
 *     • Vocabulary.approved = phrases REPEATING in corpus (cite indices)
 *     • Vocabulary.banned = clichés CONSPICUOUSLY ABSENT from corpus
 *     • Tone summary = describes the existing language pattern
 *     • Archetype + rationale tied to ≥2 quotes from corpus
 *     • Personas synthesized from research_data + GA4 audit (NOT invented)
 *     • All output: confidence='high' (came from real site) where applicable
 *
 *   PASS D — Confirmation prep
 *     • Build "site-citations" list: 8-12 phrases user can verify came
 *       from their actual site (so they can validate output is real)
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { uploadAssetToVps } from './brandAssetStorage'
import type { BrandBookV2 } from '../../../../packages/shared/src/brand/brandBookV2'

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

interface ScanArgs {
    instanceId: string
    websiteUrl: string
    /** Page paths (besides homepage) to attempt scraping */
    extraPaths?: string[]
}

export interface ScanResult {
    success: boolean
    url: string
    pagesScanned: number
    pagesScrapedUrls: string[]
    extractedKeys: string[]
    book: Partial<BrandBookV2>
    /** Phrases pulled directly from site — shown to user for validation */
    siteCitations: Array<{ quote: string; pagePath: string }>
    /** Color palette extracted from CSS, raw before user approval */
    rawColorCandidates: Array<{ hex: string; occurrences: number; sourcePages: string[] }>
    /** Font candidates extracted from CSS */
    rawFontCandidates: { he?: string; en?: string; weights: number[] }
    /** Logo candidates with reliability scores — top one auto-adopted */
    logoCandidates: Array<{ url: string; localUrl?: string; source: string; score: number }>
    notes: string[]
}

const HEBREW_FONTS_HINT = ['Heebo', 'Rubik', 'Assistant', 'Open Sans Hebrew', 'Frank Ruhl', 'Almoni', 'Karantina', 'Suez', 'Varela']

// ─── Firecrawl helper ─────────────────────────────────────────────────────

interface FirecrawlResult {
    markdown?: string
    html?: string
    links?: string[]
    metadata?: {
        title?: string
        description?: string
        ogImage?: string
        ogTitle?: string
        ogDescription?: string
        siteName?: string
        favicon?: string
        language?: string
    }
}

async function firecrawlScrape(apiKey: string, url: string): Promise<FirecrawlResult | null> {
    try {
        const res = await fetch(FIRECRAWL_API, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                formats: ['markdown', 'html'],
                onlyMainContent: false,
            }),
            signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) return null
        const j = await res.json() as { success?: boolean; data?: FirecrawlResult }
        return j.data || null
    } catch {
        return null
    }
}

// ─── Logo discovery (5-tier retry) ────────────────────────────────────────

interface LogoCandidate {
    url: string
    source: string
    score: number
}

function discoverLogoCandidates(html: string, metadata: any, baseUrl: string): LogoCandidate[] {
    const out: LogoCandidate[] = []
    const seen = new Set<string>()
    const base = new URL(baseUrl)
    const abs = (u: string): string => {
        if (!u) return ''
        if (u.startsWith('http')) return u
        if (u.startsWith('//')) return base.protocol + u
        if (u.startsWith('/')) return base.origin + u
        try { return new URL(u, baseUrl).toString() } catch { return '' }
    }
    const push = (u: string, source: string, score: number) => {
        const a = abs(u)
        if (!a || seen.has(a)) return
        seen.add(a)
        out.push({ url: a, source, score })
    }

    // Tier 1 — og:image (typically the brand image)
    if (metadata?.ogImage) push(metadata.ogImage, 'og:image', 70)

    // Tier 2 — Schema.org Organization logo
    const schemaMatch = html.match(/"logo"\s*:\s*"([^"]+)"/i)
    if (schemaMatch) push(schemaMatch[1], 'schema.org/logo', 80)

    // Tier 3 — <header> img attribute hints. Look for class/id/alt containing
    // either "logo" (English) or "לוגו" (Hebrew) — Israeli sites overwhelmingly
    // use Hebrew alt text. Also catch src filename hints like "LOGO-NEW.png".
    const headerMatch = html.match(/<header[^>]*>([\s\S]{0,3000})<\/header>/i)
    const headerHtml = headerMatch ? headerMatch[1] : html.slice(0, 8000)
    const logoAttrPattern = /<img[^>]*(?:class|id|alt|title)=["'][^"']*(?:logo|לוגו)[^"']*["'][^>]*>/gi
    const logoSrcPattern = /<img[^>]*src=["'][^"']*(?:logo|לוגו)[^"']*["'][^>]*>/gi
    const logoImgMatches = [
        ...(headerHtml.match(logoAttrPattern) || []),
        ...(headerHtml.match(logoSrcPattern) || []),
    ]
    for (const m of logoImgMatches) {
        const src = m.match(/src=["']([^"']+)["']/i)?.[1]
        if (src) push(src, 'header.img[logo]', 90)
    }

    // Tier 3b — same patterns, but anywhere in the document (some WP themes
    // render the logo outside <header>, e.g. in a custom .site-branding div).
    const docLogoMatches = [
        ...(html.slice(0, 20_000).match(logoAttrPattern) || []),
        ...(html.slice(0, 20_000).match(logoSrcPattern) || []),
    ]
    for (const m of docLogoMatches) {
        const src = m.match(/src=["']([^"']+)["']/i)?.[1]
        if (src) push(src, 'document.img[logo]', 85)
    }

    // Tier 4 — first <header> <img> regardless of attrs
    const headerImgs = headerHtml.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
    const bestHeaderImg = headerImgs[0]
    if (bestHeaderImg) {
        const src = bestHeaderImg.match(/src=["']([^"']+)["']/i)?.[1]
        if (src) push(src, 'header.img[first]', 75)
    }

    // Note: favicons (<link rel=icon> / metadata.favicon) and Apple touch icons
    // are intentionally EXCLUDED from logo candidates. They are 16-32px raster
    // images at best — never the actual brand logo. Adopting them produces a
    // pixelated mess in PDFs and crops in social-card composers. If no real
    // logo can be discovered, we'd rather show "no logo found, please upload"
    // than mislead the user with their favicon.

    // Tier 6 — first 300 lines of body, any reasonable img
    const earlyImgs = html.slice(0, 6000).match(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
    for (const m of earlyImgs.slice(0, 3)) {
        const src = m.match(/src=["']([^"']+)["']/i)?.[1]
        if (src && !/sprite|icon|background|bg|placeholder/i.test(src)) push(src, 'body.early-img', 50)
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 8)
}

async function fetchAndStoreLogoToVps(instanceId: string, candidate: LogoCandidate): Promise<string | null> {
    try {
        // Hard reject: .ico files are favicons in disguise, never real logos.
        if (/\.ico(\?|$)/i.test(candidate.url)) return null
        // Hard reject: URLs hinting at favicon/touch-icon — even when reached
        // via a different tier (e.g. og:image accidentally points to favicon).
        if (/favicon|apple-touch-icon|app-icon-\d+/i.test(candidate.url)) return null

        const res = await fetch(candidate.url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return null
        const ct = res.headers.get('content-type') || ''
        if (!/image\//i.test(ct) && !/svg/i.test(ct)) return null
        const buf = Buffer.from(await res.arrayBuffer())
        // Min 1.5KB heuristic — favicons are typically 200-1200 bytes, real
        // brand logos almost always exceed 1.5KB even at modest dimensions.
        // SVG is exempt (vector logos can be tiny strings).
        const isSvg = /svg/i.test(ct)
        if (!isSvg && buf.length < 1500) return null
        if (buf.length > 5_000_000) return null

        const ext = (candidate.url.match(/\.(png|jpg|jpeg|webp|svg|ico)(?:\?|$)/i)?.[1] || 'png').toLowerCase()
        // Defense in depth: refuse .ico extension explicitly (Tier filter
        // already drops favicons, but a tier-1 og:image MIGHT point to .ico
        // on poorly-configured sites).
        if (ext === 'ico') return null
        const filename = `extracted-logo-${candidate.source.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.${ext}`
        const ctyp = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`

        const upload = await uploadAssetToVps({
            instanceId,
            category: 'logo',
            filename,
            contentBase64: buf.toString('base64'),
            contentType: ctyp,
        })
        return upload.publicUrl
    } catch { return null }
}

// ─── CSS palette extraction ───────────────────────────────────────────────

function extractCssPalette(allHtml: string[]): Array<{ hex: string; occurrences: number; sourcePages: string[] }> {
    const counter: Map<string, { count: number; pages: Set<number> }> = new Map()

    for (let pageIdx = 0; pageIdx < allHtml.length; pageIdx++) {
        const html = allHtml[pageIdx]

        // CSS custom properties — heavily weighted (these ARE brand colors)
        const customMatches = html.match(/--[\w-]*(?:brand|primary|accent|color|theme|main)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi) || []
        for (const m of customMatches) {
            const hex = normalizeHex(m.match(/(#[0-9a-fA-F]{3,8})/i)?.[1] || '')
            if (hex && !isNeutral(hex)) addColor(counter, hex, pageIdx, 8)
        }

        // Inline styles + style blocks
        const styleMatches = html.match(/(?:background-color|color|background|border-color|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi) || []
        for (const m of styleMatches) {
            const colorMatch = m.match(/(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/i)
            if (!colorMatch) continue
            const hex = normalizeHex(colorMatch[1])
            if (hex && !isNeutral(hex)) addColor(counter, hex, pageIdx, 1)
        }

        // SVG fills
        const svgMatches = html.match(/(?:fill|stroke)=["'](#[0-9a-fA-F]{3,8})["']/g) || []
        for (const m of svgMatches) {
            const hex = normalizeHex(m.match(/(#[0-9a-fA-F]{3,8})/)?.[1] || '')
            if (hex && !isNeutral(hex)) addColor(counter, hex, pageIdx, 3)
        }
    }

    return [...counter.entries()]
        .map(([hex, v]) => ({ hex, occurrences: v.count, sourcePages: [...v.pages].map(p => `page-${p}`) }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 8)
}

function addColor(counter: Map<string, { count: number; pages: Set<number> }>, hex: string, pageIdx: number, weight: number) {
    const cur = counter.get(hex) || { count: 0, pages: new Set<number>() }
    cur.count += weight
    cur.pages.add(pageIdx)
    counter.set(hex, cur)
}

function normalizeHex(input: string): string | null {
    const lower = (input || '').trim().toLowerCase()
    if (lower.startsWith('#')) {
        if (lower.length === 4) return '#' + lower.slice(1).split('').map(c => c + c).join('')
        if (lower.length === 7) return lower
        if (lower.length === 9) return lower.slice(0, 7)
    }
    if (lower.startsWith('rgb')) {
        const m = lower.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
        if (m) return '#' + [+m[1], +m[2], +m[3]].map(n => n.toString(16).padStart(2, '0')).join('')
    }
    return null
}

function isNeutral(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const range = Math.max(r, g, b) - Math.min(r, g, b)
    if (range < 25) return true                // grayscale
    const max = Math.max(r, g, b)
    if (max < 30) return true                  // near-black
    if (Math.min(r, g, b) > 235) return true   // near-white
    return false
}

// ─── Font extraction (DOM-priority weighted) ──────────────────────────────

function extractFonts(html: string): { he?: string; en?: string; weights: number[] } {
    const fonts = new Set<string>()
    const weights = new Set<number>()

    // CSS font-family (any source)
    const familyMatches = html.match(/font-family\s*:\s*([^;"'}]+)/gi) || []
    for (const m of familyMatches) {
        const stack = m.replace(/font-family\s*:\s*/i, '').trim()
        const first = stack.split(',')[0].replace(/['"]/g, '').trim()
        if (first && first.length < 50 && !/system|sans-serif|serif|monospace|inherit|initial|var\(/i.test(first)) {
            fonts.add(first)
        }
    }

    // Google Fonts <link> declarations
    const gfontMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^&"']+)/g) || []
    for (const m of gfontMatch) {
        const fam = m.match(/family=([^&:"']+)/)?.[1]
        if (fam) fonts.add(decodeURIComponent(fam.replace(/\+/g, ' ')).split(':')[0])
    }

    // Weight declarations
    const weightMatches = html.match(/font-weight\s*:\s*(\d+)/gi) || []
    for (const m of weightMatches) {
        const w = parseInt(m.match(/\d+/)?.[0] || '0', 10)
        if (w >= 100 && w <= 900) weights.add(Math.round(w / 100) * 100)
    }

    const list = [...fonts]
    const isHebFont = (n: string) => HEBREW_FONTS_HINT.some(h => n.toLowerCase().includes(h.toLowerCase()))
    const heFont = list.find(isHebFont) || list[0]
    const enFont = list.find(f => !isHebFont(f)) || list[0]
    return { he: heFont, en: enFont, weights: [...weights].sort((a, b) => a - b) }
}

// ─── Site citations extraction ────────────────────────────────────────────
// Pull short, distinctive phrases from corpus that user can verify
function extractSiteCitations(corpusByPage: Array<{ path: string; text: string }>): Array<{ quote: string; pagePath: string }> {
    const out: Array<{ quote: string; pagePath: string }> = []
    for (const page of corpusByPage) {
        // Find Hebrew sentences 30-120 chars, with strong claim signals
        const lines = page.text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 25 && l.length < 140)
        const heLines = lines.filter(l => /[֐-׿]/.test(l))                                    // contains Hebrew
        const claimLines = heLines.filter(l => /₪|\d+|כל|בלי|ללא|שעה|חודש|24|7|מיוחד|מאובטח|מובטח|חופשי|חינם|זמין|ייחודי|ראשון/i.test(l))
        for (const l of claimLines.slice(0, 4)) {
            if (out.find(c => c.quote === l)) continue
            out.push({ quote: l, pagePath: page.path })
        }
        if (out.length >= 12) break
    }
    return out.slice(0, 12)
}

// ─── Sonnet brand archaeology ─────────────────────────────────────────────

interface ArchaeologyArgs {
    apiKey: string
    websiteUrl: string
    corpus: string                              // concatenated voice corpus
    siteCitations: Array<{ quote: string; pagePath: string }>
    research?: any                              // researchData for personas
    auditDemographics?: any                     // top cities + devices
}

interface ArchaeologyResult {
    archetype?: string
    archetypeRationale?: string                 // cites ≥2 quotes
    toneSummary?: { he: string }
    principles?: string[]
    do?: string[]                               // each ties back to real-site pattern
    dont?: string[]
    vocabulary?: { approved: string[]; banned: string[] }
    // tagline carries both the LITERAL slogan from site (verbatim quote, never
    // dropped even if salesy) and an optional refined variant. tagline.he is
    // a duplicate of literal so existing consumers keep working.
    tagline?: { he?: string; literal?: string; refined?: string }
    mission?: { he?: string }
    positioning?: { he?: string }
    personas?: Array<any>
}

// Pull verifiable numeric facts out of the corpus (locations, branches,
// employees, years in business, etc.) so the LLM can cite them verbatim
// instead of hallucinating. Returns ≤ 8 facts, each with the literal quote
// the number came from. Hebrew-aware; matches Hebrew + Arabic numerals.
function extractGroundTruthFacts(corpus: string): Array<{ fact: string; quote: string }> {
    const facts: Array<{ fact: string; quote: string }> = []
    const seenFacts = new Set<string>()
    // Patterns: "<digit>+ סניפים", "<digit>+ years", "<digit>+ דק", "<word-num>
    // סניפים" (שני, שלושה, ארבעה, חמישה, שישה, שבעה, שמונה, תשעה, עשרה).
    // Each row: { regex, factTemplate(matchGroup) }
    const HEB_NUM_TO_DIGIT: Record<string, string> = {
        'שני': '2', 'שתי': '2', 'שלושה': '3', 'שלוש': '3', 'ארבעה': '4', 'ארבע': '4',
        'חמישה': '5', 'חמש': '5', 'שישה': '6', 'שש': '6', 'שבעה': '7', 'שבע': '7',
        'שמונה': '8', 'תשעה': '9', 'תשע': '9', 'עשרה': '10', 'עשר': '10',
    }
    const NOUN_LABELS: Array<{ noun: string; label: string }> = [
        { noun: 'סניפים', label: 'מספר סניפים' },
        { noun: 'סניף', label: 'מספר סניפים' },
        { noun: 'מוקדים', label: 'מספר מוקדים' },
        { noun: 'מוקד', label: 'מספר מוקדים' },
        { noun: 'מיקומים', label: 'מספר מיקומים' },
        { noun: 'אתרים', label: 'מספר אתרים' },
        { noun: 'מחסנים', label: 'מספר מחסנים' },
        { noun: 'שנים', label: 'ותק (שנים)' },
        { noun: 'שנה', label: 'ותק (שנים)' },
        { noun: 'עובדים', label: 'מספר עובדים' },
        { noun: 'לקוחות', label: 'מספר לקוחות' },
        { noun: 'דקות', label: 'זמן (דקות)' },
        { noun: 'שעות', label: 'זמן (שעות)' },
        { noun: 'גדלים', label: 'מספר גדלים זמינים' },
        { noun: 'יחידות', label: 'מספר יחידות' },
        { noun: 'חנויות', label: 'מספר חנויות' },
        { noun: 'משרדים', label: 'מספר משרדים' },
        { noun: 'תחנות', label: 'מספר תחנות' },
    ]
    for (const { noun, label } of NOUN_LABELS) {
        // Digit followed by the Hebrew noun, with up to 30 chars of context window.
        const digitRe = new RegExp(`([^.\\n]{0,40}?\\b(\\d{1,4})\\s+${noun}\\b[^.\\n]{0,40})`, 'g')
        let m: RegExpExecArray | null
        while ((m = digitRe.exec(corpus)) !== null) {
            const quote = m[1].trim()
            const num = m[2]
            const factKey = `${label}:${num}`
            if (seenFacts.has(factKey)) continue
            seenFacts.add(factKey)
            facts.push({ fact: `${label}: ${num}`, quote: quote.slice(0, 200) })
            if (facts.length >= 8) return facts
        }
        // Hebrew word number followed by the noun.
        for (const [hebWord, digit] of Object.entries(HEB_NUM_TO_DIGIT)) {
            const wordRe = new RegExp(`([^.\\n]{0,40}?\\b${hebWord}\\s+${noun}\\b[^.\\n]{0,40})`, 'g')
            let mw: RegExpExecArray | null
            while ((mw = wordRe.exec(corpus)) !== null) {
                const quote = mw[1].trim()
                const factKey = `${label}:${digit}`
                if (seenFacts.has(factKey)) continue
                seenFacts.add(factKey)
                facts.push({ fact: `${label}: ${digit}`, quote: quote.slice(0, 200) })
                if (facts.length >= 8) return facts
            }
        }
    }
    // 24/7 access pattern (specific to storage / service businesses).
    if (/\b24\/?7\b/.test(corpus)) {
        const m = corpus.match(/[^.\n]{0,30}24\/?7[^.\n]{0,30}/)
        if (m) facts.push({ fact: 'גישה: 24/7', quote: m[0].trim().slice(0, 200) })
    }
    return facts
}

async function runBrandArchaeology(args: ArchaeologyArgs): Promise<ArchaeologyResult> {
    const { apiKey, websiteUrl, corpus, siteCitations, research, auditDemographics } = args

    const researchSummary = research ? JSON.stringify({
        targetAudience: research.answers?.targetAudience?.slice?.(0, 600),
        businessDescription: research.answers?.businessDescription?.slice?.(0, 600),
        chosenScenario: research.chosenScenario?.title || research.chosenScenario,
        valueProp: research.answers?.valueProp,
    }).slice(0, 2000) : ''

    const auditCtx = auditDemographics ? JSON.stringify(auditDemographics).slice(0, 1500) : ''

    // Ground-truth fact extraction — count concrete numbers in the corpus so
    // the LLM can't invent "3 branches" when the site says 4. We surface a
    // small fact-list and require the LLM to cite verbatim or stay silent.
    const groundTruth = extractGroundTruthFacts(corpus)
    const groundTruthBlock = groundTruth.length
        ? '═══ עובדות קשיחות שחולצו מהקורפוס (ציטוטים מילוליים — לא לשנות מספרים) ═══\n' +
          groundTruth.map(f => `• ${f.fact} (מקור: "${f.quote}")`).join('\n')
        : '═══ עובדות קשיחות ═══\n(לא חולצו מספרים מהקורפוס — אל תזכיר מספרים ב-positioning/mission אם אינם בקורפוס)'

    const system = `אתה brand archaeologist. בידיים שלך COPY של אתר חי של עסק קיים.
המותג הזה כבר קיים, יש לו זהות חזותית, קול, לקוחות. אתה לא מחבר אותו — אתה מתעד אותו.

חוקים נוקשים:
1. כל ה-output בעברית. שמות מותגים באנגלית (כמו "Storage4You") נשארים כמו שהם — לא מתרגמים.
2. ה-vocabulary.approved חייב להיות 5-7 ביטויים שחוזרים בפועל בקורפוס. ציטוט מילולי. לא generic.
3. ה-vocabulary.banned הם 3-5 קלישאות שניתן לצפות באתר אבל הן באופן בולט נעדרות. לא רשימת קלישאות גנרית.
4. ★ ה-tone summary הוא **3-5 מילים בלבד**, לא משפט. דוגמה תקפה: "יבש, ענייני, ישיר". דוגמה לא תקפה: "מדבר בן-אדם שמבין שמאחורי כל קרטון..." — זה משפט, לא 3-5 מילים. אסור לחרוג.
5. archetype נבחר לפי ה-EVIDENCE בקורפוס. ה-rationale חייב לצטט 2 משפטים מהקורפוס.
6. principles, do, dont — כל אחד נסמך על דפוס מהקורפוס. לא תיאוריה.
7. personas מבוססות על research_data + GA4 demographics, לא על דמיון.
8. ★ מספרים אסור להמציא. אם בקורפוס כתוב "4 סניפים" — כתוב "4". אם לא חולץ מספר — אל תכלול אותו ב-tagline/mission/positioning. אסור להגיד "שלושה סניפים" אם בקורפוס מופיע "4". העדיפו "מספר סניפים" / "פריסה רחבה" אם המספר לא ברור — לא מספר שהומצא.
9. ★ אסור להמציא שירותים, פיצ'רים, יתרונות שאינם מופיעים בקורפוס. בעיקר ב-positioning.proof — חייב להיות אקט-אובדן ציטטה.
10. ★★ tagline.literal: אם באתר יש סלוגן/כותרת ראשית/hero text שנראה כמו slogan (h1, large heading, hero banner) — **חייבים לצטט אותו verbatim** ב-tagline.literal, גם אם הוא נשמע "מכירותי" או "salesy". זה הסלוגן הקיים שלהם. אל תמציאו רפיינמנט במקומו.
11. tagline.refined: רק אם tagline.literal קיים, אפשר להציע גרסה משופרת. אם literal ריק — refined גם null.
12. ★★ ב-positioning **חובה לצטט מספרים אם חולצו** (כמה סניפים, ותק, וכו') ו**הצעות-מחיר/יתרונות שמופיעים בקורפוס** (כמו "המחיר הזול ביותר", "התחייבות"), במקום generic "אנחנו מחזיקים את הדברים שלך באותה רצינות". זה לא marketing copy — זה fact-grounded statement.

אם משהו לא נמצא בקורפוס — אל תמציא. השאר null/undefined.`

    const user = `URL: ${websiteUrl}

═══ קורפוס מהאתר (ציטוטים מילוליים מקיומה של תוכן הסייט) ═══
${corpus.slice(0, 14000)}

═══ ציטוטים מובחרים (משפטים שמופיעים בפועל באתר) ═══
${siteCitations.map((c, i) => `${i + 1}. [${c.pagePath}] "${c.quote}"`).join('\n')}

${groundTruthBlock}

═══ Research data (מחקר שוק שכבר עשינו) ═══
${researchSummary}

═══ נתוני קהל מ-GA4 (לפי ערים + מכשירים) ═══
${auditCtx}

═══ הוצא JSON בדיוק במבנה הזה (כל הערכים בעברית, שמות מותג באנגלית כמו שהם) ═══

{
  "archetype": "<אחד מ-12 ארכיטיפים — בחר בהתבסס על הקורפוס: caregiver, sage, hero, explorer, lover, jester, everyman, ruler, creator, magician, innocent, outlaw>",
  "archetypeRationale": "<משפט אחד שמסביר למה הארכיטיפ הזה, עם 2 ציטוטים מילוליים מהקורפוס בתוך המשפט>",
  "toneSummary": { "he": "<3-5 מילים מדויקות שמתארות את הסגנון, לא ברירת מחדל>" },
  "principles": [
    "<עיקרון 1, מבוסס על דפוס מהקורפוס. אופציונלי לכלול ציטוט בסוגריים>",
    "<עיקרון 2>",
    "<עיקרון 3 — אם יש בסיס בקורפוס. אם לא, השאר 2 בלבד.>"
  ],
  "do": [
    "<דוגמה ספציפית לאיך אנחנו כותבים, עם ציטוט מהקורפוס>",
    "<דוגמה 2>"
  ],
  "dont": [
    "<קלישאה שאנחנו לא משתמשים בה (אבל יכולנו). הסבר למה היא לא הולמת לקורפוס הזה>",
    "<קלישאה 2>"
  ],
  "vocabulary": {
    "approved": [
      "<ביטוי מילולי שחוזר בקורפוס 1>",
      "<ביטוי 2>",
      "<ביטוי 3>",
      "<ביטוי 4>",
      "<ביטוי 5>"
    ],
    "banned": [
      "<קלישאה שאינה בקורפוס — שלא תיכתב לעולם>",
      "<קלישאה 2>",
      "<קלישאה 3>"
    ]
  },
  "tagline": {
    "he": "<החזירו כאן את ה-LITERAL — הסלוגן הקיים באתר. אם יש hero heading / slogan — צטטו verbatim. אם אין — null>",
    "literal": "<דופליקציה של ה-tagline.he — הסלוגן המקורי כפי שהוא, ללא שיפור>",
    "refined": "<אופציונלי: גרסה משופרת אם הסלוגן הקיים מכירותי-מדי. אבל literal הוא תמיד מקור-אמת. אם אין literal — null>"
  },
  "mission": { "he": "<אם יש משימה כתובה באתר — צטט/סכם. אחרת null>" },
  "positioning": { "he": "<עבור [קהל], אנחנו [קטגוריה] שעושה [תועלת ספציפית מצוטטת/מודגמת בקורפוס] כי [הוכחה — מספרים מ-ground-truth, יתרונות שצוטטו]. אם אין מספיק עדויות — null>" },
  "personas": [
    {
      "id": "p1",
      "name": "<שם תיאורי בעברית>",
      "demographics": { "ageRange": [number, number], "gender": "mixed|m|f", "location": "<אזור>" },
      "painPoints": ["<3 כאבים ספציפיים מ-research או מהקורפוס>"],
      "decisionTriggers": ["<2 טריגרים>"],
      "messageHooks": ["<3 משפטים שדוברים אליהם — בקול הברנד>"],
      "channelPreferences": ["search", "whatsapp"]
    }
  ]
}

החזר JSON בלבד. ללא טקסט נוסף.`

    try {
        const res = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 8000,
                system,
                messages: [{ role: 'user', content: user }],
            }),
            signal: AbortSignal.timeout(120_000),
        })
        if (!res.ok) {
            console.warn(`[brandWebsiteScanner] Sonnet ${res.status}`)
            return {}
        }
        const j = await res.json() as any
        const text = j?.content?.[0]?.text || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) return {}
        return JSON.parse(m[0])
    } catch (err) {
        console.warn('[brandWebsiteScanner] archaeology failed:', (err as Error).message)
        return {}
    }
}

// ─── Main entry ──────────────────────────────────────────────────────────

const PRIORITY_PATHS = ['/', '/about', '/אודות', '/מי-אנחנו', '/pricing', '/מחירון', '/services', '/שירותים', '/contact', '/צרו-קשר', '/faq', '/שאלות', '/blog', '/testimonials']

const META = (confidence: 'high' | 'medium' | 'low' = 'high') => ({
    confidence, source: 'extracted' as const,
    updatedAt: new Date().toISOString(),
})

export async function scanWebsiteForBrand(args: ScanArgs): Promise<ScanResult> {
    const { instanceId, websiteUrl } = args
    const notes: string[] = []
    const extractedKeys: string[] = []

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const firecrawlKey = (inst as any).firecrawlKey
    const aiKey = (inst as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
    if (!firecrawlKey) throw new Error('Firecrawl API key not configured for this instance')
    if (!aiKey) throw new Error('Anthropic API key not configured')

    const rd: any = inst.researchData || {}

    // ── PASS A — Visual ──
    notes.push('Pass A: Scraping homepage…')
    const homepage = await firecrawlScrape(firecrawlKey, websiteUrl)
    if (!homepage) throw new Error(`Homepage scrape failed for ${websiteUrl}`)
    const homepageHtml = homepage.html || ''
    const homepageMd = homepage.markdown || ''
    const meta = homepage.metadata || {}

    // ── PASS B — Targeted multi-page corpus ──
    notes.push('Pass B: Discovering linked pages…')
    const allHtml: string[] = [homepageHtml]
    const corpusByPage: Array<{ path: string; text: string }> = [{ path: '/', text: homepageMd }]
    const scrapedUrls: string[] = [websiteUrl]

    // Resolve candidate URLs from sitemap-style discovery
    const candidatePaths = new Set<string>()
    for (const p of (homepage.links || []).slice(0, 50)) {
        try {
            const u = new URL(p, websiteUrl)
            if (u.host !== new URL(websiteUrl).host) continue
            const path = u.pathname || '/'
            if (path === '/') continue
            if (/\.(pdf|jpg|png|svg|webp|ico|css|js)$/i.test(path)) continue
            if (/privacy|terms|cookie|sitemap|admin|wp-/i.test(path)) continue
            // Heuristic: prefer paths matching priority hints
            if (PRIORITY_PATHS.some(pp => path.toLowerCase().includes(pp.replace('/', '').toLowerCase()))) {
                candidatePaths.add(u.toString())
            }
        } catch { /* ignore bad URL */ }
    }

    // Add up to 6 priority pages (rate-limit Firecrawl to keep total <90s)
    const targets = [...candidatePaths].slice(0, 6)
    for (const target of targets) {
        const p = await firecrawlScrape(firecrawlKey, target)
        if (!p) continue
        if (p.html) allHtml.push(p.html)
        if (p.markdown) corpusByPage.push({ path: new URL(target).pathname || target, text: p.markdown })
        scrapedUrls.push(target)
    }
    notes.push(`Pass B complete: ${scrapedUrls.length} pages scraped`)

    // ── Visual extraction ──
    const cssPalette = extractCssPalette(allHtml)
    notes.push(`Extracted ${cssPalette.length} non-neutral colors from CSS (top: ${cssPalette[0]?.hex || 'none'})`)

    const fonts = extractFonts(homepageHtml)
    notes.push(`Fonts detected: he=${fonts.he || '(none)'}, en=${fonts.en || '(none)'}`)

    const logoCandidates = discoverLogoCandidates(homepageHtml, meta, websiteUrl)
    notes.push(`Logo candidates: ${logoCandidates.length} (sources: ${logoCandidates.map(c => c.source).join(' · ')})`)

    // Try to fetch+store top logo candidates (3 retries down score order)
    let storedLogoUrl: string | null = null
    let storedSource: string = ''
    for (const cand of logoCandidates.slice(0, 4)) {
        const stored = await fetchAndStoreLogoToVps(instanceId, cand)
        if (stored) {
            storedLogoUrl = stored
            storedSource = cand.source
            ;(cand as any).localUrl = stored
            notes.push(`Logo stored from "${cand.source}" tier: ${stored}`)
            break
        }
    }
    if (!storedLogoUrl) notes.push('All logo candidates failed to download — will require manual upload')

    // ── Site citations ──
    const siteCitations = extractSiteCitations(corpusByPage)
    notes.push(`Extracted ${siteCitations.length} verifiable site quotes`)

    // ── PASS C — Sonnet brand archaeology ──
    notes.push('Pass C: Running brand archaeology (Sonnet 4.6)…')
    const corpus = corpusByPage.map(p => `\n\n[${p.path}]\n${p.text}`).join('\n').slice(0, 14000)
    const archaeology = await runBrandArchaeology({
        apiKey: aiKey,
        websiteUrl,
        corpus,
        siteCitations,
        research: rd,
        auditDemographics: rd.mazhirAudit?.sourceCoverage?.ga4Demographics,
    })
    notes.push(`Archaeology done: archetype=${archaeology.archetype || 'none'}, vocab.approved=${archaeology.vocabulary?.approved?.length || 0}`)

    // Server-side enforcement: tone summary must be 3-5 words. Sonnet sometimes
    // returns a sentence anyway; we trim to first 5 Hebrew words, joined by
    // " · ", and surface the truncation in notes for transparency.
    if (archaeology.toneSummary?.he) {
        const tone = archaeology.toneSummary.he.trim()
        const words = tone.split(/[\s,;.—–-]+/).filter(Boolean)
        if (words.length > 6) {
            const trimmed = words.slice(0, 5).join(' · ')
            notes.push(`Tone summary trimmed (Sonnet returned ${words.length} words, requirement is 3-5): "${trimmed}"`)
            archaeology.toneSummary = { he: trimmed }
        }
    }

    // ── Build BrandBookV2 partial ──
    const book: Partial<BrandBookV2> = {
        identity: {},
        visual: {},
        voice: {},
        audience: {},
        compliance: {},
        channelAssets: {},
    }
    const m = META

    // Business name resolution — site-aware priority order. Critical: this
    // must NOT fall back to h1 / category headings. Israeli sites' h1 is
    // usually the SEO category ("אחסון תכולת דירה") not the brand name.
    //
    // Priority:
    //   1. Logo's alt attribute (the actual brand-name commitment in markup)
    //   2. og:site_name (meta-defined brand identity)
    //   3. <title> first segment before separator
    //   4. og:title first segment
    //   5. researchData.answers.businessName (user-provided in profile)
    const titleStr = (meta.title || '').trim()
    const ogTitleStr = (meta.ogTitle || '').trim()
    const ogSiteName = (meta.siteName || '').trim()
    const HEBREW_RANGE = /[֐-׿]/

    function splitOnSep(s: string): string[] {
        return s.split(/[|—\-·•]|–/).map(p => p.trim()).filter(Boolean)
    }
    function pickHebrewSegment(s: string): string | null {
        if (!s) return null
        const heb = splitOnSep(s).find(p => HEBREW_RANGE.test(p))
        return heb ? heb.replace(/^\(([^)]+)\)$/, '$1').trim() : null
    }
    function pickEnglishSegment(s: string): string | null {
        if (!s) return null
        const eng = splitOnSep(s).find(p => /^[A-Za-z][A-Za-z0-9 \-&'.]+$/.test(p))
        return eng || null
    }

    // Pull the alt of the highest-scoring logo candidate as the most reliable
    // brand-name source (sites that bother to write a logo alt almost always
    // put the actual brand name there).
    let logoAlt: string | null = null
    {
        const logoImgPattern = /<img[^>]*(?:class|id|alt|title)=["'][^"']*(?:logo|לוגו)[^"']*["'][^>]*>/i
        const m1 = homepageHtml.match(logoImgPattern)
        const altMatch = m1?.[0].match(/alt=["']([^"']+)["']/i)
        if (altMatch?.[1]) {
            const alt = altMatch[1].trim()
            // alt may be "BrandName - לוגו אתר ..." — strip the descriptive tail
            // ("- לוגו ..." / "- logo ..." patterns).
            logoAlt = alt
                .replace(/\s*[-—|·]\s*(?:לוגו|logo)[\s\S]*$/i, '')
                .trim() || alt
        }
    }

    function chooseName(prefer: 'he' | 'en'): string | null {
        const sources = [logoAlt, ogSiteName, ogTitleStr, titleStr, rd.answers?.businessName].filter(Boolean) as string[]
        for (const s of sources) {
            const seg = prefer === 'he' ? pickHebrewSegment(s) : pickEnglishSegment(s)
            if (seg) return seg
        }
        // Fallback: first segment of any non-empty source.
        for (const s of sources) {
            const seg = splitOnSep(s)[0]
            if (seg) return seg
        }
        return null
    }
    const businessNameHe = chooseName('he')
    const businessNameEn = chooseName('en')
    notes.push(`Business name resolved: he="${businessNameHe || '∅'}", en="${businessNameEn || '∅'}" (logoAlt="${logoAlt || '∅'}", ogSiteName="${ogSiteName || '∅'}")`)
    if (businessNameEn || businessNameHe) {
        book.identity!.businessName = {
            he: businessNameHe || businessNameEn,
            en: businessNameEn || businessNameHe,
            ...m('high'),
        } as any
        extractedKeys.push('identity.businessName')
    }
    if (archaeology.tagline?.he) {
        book.identity!.tagline = { he: archaeology.tagline.he, ...m('high') } as any
        extractedKeys.push('identity.tagline')
    }
    if (archaeology.mission?.he) {
        book.identity!.mission = { he: archaeology.mission.he, ...m('high') } as any
        extractedKeys.push('identity.mission')
    }
    if (archaeology.positioning?.he) {
        book.identity!.positioningStatement = { he: archaeology.positioning.he, ...m('high') } as any
        extractedKeys.push('identity.positioningStatement')
    }

    // Visual — from CSS, not AI
    if (storedLogoUrl) {
        book.visual!.logo = {
            primary: { url: storedLogoUrl, format: 'png' as any, intendedUsage: `extracted from ${storedSource}` },
            ...m('high'),
        } as any
        extractedKeys.push('visual.logo.primary')
    }
    if (cssPalette.length >= 1) {
        book.visual!.colors = {
            primary: { hex: cssPalette[0].hex, name: 'ראשי (מהאתר)', usage: `דומיננטי באתר — ${cssPalette[0].occurrences} מופעים` },
            secondary: cssPalette.slice(1, 4).map(c => ({ hex: c.hex, name: 'משני (מהאתר)' })),
            accent: cssPalette.slice(4, 6).map(c => ({ hex: c.hex, name: 'דגש (מהאתר)' })),
            ...m('high'),
        } as any
        extractedKeys.push('visual.colors')
    } else {
        // Honest signal: scan ran, but the site uses only neutrals or wraps colors
        // in external CSS we can't see. Prefer telling the user this directly
        // (via notes) over silently pretending no scan attempt was made.
        notes.push('Color extraction: no non-neutral CSS colors found in scraped pages — site likely uses only black/white/gray, or styles are in external CSS bundles. User should pick palette manually or via AI.')
    }
    if (fonts.he || fonts.en) {
        book.visual!.typography = {
            primaryFontHe: fonts.he ? { family: fonts.he, weights: fonts.weights } : undefined,
            primaryFontEn: fonts.en ? { family: fonts.en, weights: fonts.weights } : undefined,
            ...m('high'),
        } as any
        extractedKeys.push('visual.typography')
    } else {
        notes.push('Typography extraction: no font-family declarations parseable from inline CSS — likely Google Fonts loaded via JS or external CSS. User should set typography manually.')
    }

    // Voice from Sonnet
    if (archaeology.archetype || archaeology.toneSummary) {
        book.voice!.voice = {
            archetype: archaeology.archetype as any,
            archetypeRationale: archaeology.archetypeRationale,
            toneSummary: archaeology.toneSummary,
            principles: archaeology.principles,
            do: archaeology.do,
            dont: archaeology.dont,
            vocabulary: archaeology.vocabulary,
            ...m('high'),
        } as any
        extractedKeys.push('voice.voice')
    }

    if (archaeology.personas && archaeology.personas.length > 0) {
        book.audience!.personas = {
            items: archaeology.personas,
            ...m('medium'),                     // synthesized — medium confidence
        } as any
        extractedKeys.push('audience.personas')
    }

    return {
        success: extractedKeys.length > 0,
        url: websiteUrl,
        pagesScanned: scrapedUrls.length,
        pagesScrapedUrls: scrapedUrls,
        extractedKeys,
        book,
        siteCitations,
        rawColorCandidates: cssPalette,
        rawFontCandidates: fonts,
        logoCandidates,
        notes,
    }
}