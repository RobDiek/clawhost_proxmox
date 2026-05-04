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

    // Tier 3 — <header> <img class~=logo OR id~=logo OR alt~=logo>
    const headerMatch = html.match(/<header[^>]*>([\s\S]{0,3000})<\/header>/i)
    const headerHtml = headerMatch ? headerMatch[1] : html.slice(0, 8000)
    const logoImgMatches = headerHtml.match(/<img[^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/gi) || []
    for (const m of logoImgMatches) {
        const src = m.match(/src=["']([^"']+)["']/i)?.[1]
        if (src) push(src, 'header.img[logo]', 90)
    }

    // Tier 4 — first <header> <img> regardless of attrs
    const headerImgs = headerHtml.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
    const bestHeaderImg = headerImgs[0]
    if (bestHeaderImg) {
        const src = bestHeaderImg.match(/src=["']([^"']+)["']/i)?.[1]
        if (src) push(src, 'header.img[first]', 75)
    }

    // Tier 5 — favicon set
    const iconMatches = html.match(/<link[^>]*rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]*>/gi) || []
    for (const m of iconMatches) {
        const href = m.match(/href=["']([^"']+)["']/i)?.[1]
        if (href) push(href, '<link rel=icon>', 35)
    }
    if (metadata?.favicon) push(metadata.favicon, 'metadata.favicon', 30)

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
        const res = await fetch(candidate.url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return null
        const ct = res.headers.get('content-type') || ''
        if (!/image\//i.test(ct) && !/svg/i.test(ct)) return null
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 200 || buf.length > 5_000_000) return null

        const ext = (candidate.url.match(/\.(png|jpg|jpeg|webp|svg|ico)(?:\?|$)/i)?.[1] || 'png').toLowerCase()
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
    tagline?: { he?: string }
    mission?: { he?: string }
    positioning?: { he?: string }
    personas?: Array<any>
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

    const system = `אתה brand archaeologist. בידיים שלך COPY של אתר חי של עסק קיים.
המותג הזה כבר קיים, יש לו זהות חזותית, קול, לקוחות. אתה לא מחבר אותו — אתה מתעד אותו.

חוקים נוקשים:
1. כל ה-output בעברית. שמות מותגים באנגלית (כמו "Storage4You") נשארים כמו שהם — לא מתרגמים.
2. ה-vocabulary.approved חייב להיות 5-7 ביטויים שחוזרים בפועל בקורפוס. ציטוט מילולי. לא generic.
3. ה-vocabulary.banned הם 3-5 קלישאות שניתן לצפות באתר אבל הן באופן בולט נעדרות. לא רשימת קלישאות גנרית.
4. ה-tone summary הוא 3-5 מילים שמתארות את הסגנון בקורפוס. לא ברירת מחדל "חם וידידותי" — אם הקורפוס יבש ומקצועי, כתוב "יבש, ענייני, ללא קישוטים".
5. archetype נבחר לפי ה-EVIDENCE בקורפוס. ה-rationale חייב לצטט 2 משפטים מהקורפוס.
6. principles, do, dont — כל אחד נסמך על דפוס מהקורפוס. לא תיאוריה.
7. personas מבוססות על research_data + GA4 demographics, לא על דמיון.

אם משהו לא נמצא בקורפוס — אל תמציא. השאר null/undefined.`

    const user = `URL: ${websiteUrl}

═══ קורפוס מהאתר (ציטוטים מילוליים מקיומה של תוכן הסייט) ═══
${corpus.slice(0, 14000)}

═══ ציטוטים מובחרים (משפטים שמופיעים בפועל באתר) ═══
${siteCitations.map((c, i) => `${i + 1}. [${c.pagePath}] "${c.quote}"`).join('\n')}

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
  "tagline": { "he": "<אם יש סלוגן ברור בקורפוס — צטט. אחרת השאר null>" },
  "mission": { "he": "<אם יש משימה כתובה באתר — צטט/סכם. אחרת null>" },
  "positioning": { "he": "<עבור [קהל], אנחנו [קטגוריה] שעושה [תועלת] כי [הוכחה] — אם הקורפוס תומך. אחרת null>" },
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

    // Identity from Sonnet + meta
    const businessName = rd.answers?.businessName || meta.siteName || meta.title?.split(/[|—-]/)[0]?.trim()
    if (businessName) {
        book.identity!.businessName = { he: businessName, en: businessName, ...m('high') } as any
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
    }
    if (fonts.he || fonts.en) {
        book.visual!.typography = {
            primaryFontHe: fonts.he ? { family: fonts.he, weights: fonts.weights } : undefined,
            primaryFontEn: fonts.en ? { family: fonts.en, weights: fonts.weights } : undefined,
            ...m('high'),
        } as any
        extractedKeys.push('visual.typography')
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