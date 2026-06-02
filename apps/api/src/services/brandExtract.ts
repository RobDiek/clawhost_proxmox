/**
 * Brand Extract Service
 *
 * Given a website URL, extracts structured brand signals:
 *   - Business name (og:site_name, <title>, schema.org)
 *   - Logo URL (<img> with logo hints, apple-touch-icon, og:image, favicon)
 *   - Color palette (top hex/rgb from inline + linked CSS)
 *   - Typography (font-family declarations, Google Fonts links)
 *   - Meta (description, keywords, locale)
 *   - Copy samples (h1-h3 + hero paragraphs) for voice analysis
 *
 * No external dependencies. Pure fetch + regex. Works on 90% of
 * IL SMB sites (Wix, Webflow, Framer, WordPress — all SSR).
 *
 * For JS-heavy SPAs where <body> is empty, we return an empty result
 * with `needsHeadlessBrowser: true` — caller can decide to fallback
 * to Claude Vision on screenshot or reject the URL.
 */

export interface ExtractedBrandSignals {
    url: string
    fetchedAt: string
    httpStatus: number

    identity: {
        businessName: string | null
        title: string | null
        description: string | null
        locale: string | null        // "he-IL", "en-US"
        language: string | null      // <html lang="he">
        direction: 'rtl' | 'ltr' | null
    }

    logo: {
        candidates: Array<{
            url: string
            source: 'img_tag' | 'apple_touch_icon' | 'og_image' | 'favicon' | 'schema_logo'
            priority: number   // 0-100, higher = more likely the logo
            hints: string[]    // reasons we picked it
        }>
    }

    colors: {
        all: Array<{ hex: string; count: number }>     // all unique colors with freq
        top: string[]                                    // top 7 by frequency, dedup similar
    }

    typography: {
        fontFamilies: Array<{ family: string; count: number }>
        googleFonts: string[]                            // from <link href="...fonts.googleapis...">
        hebrewFonts: string[]                            // Hebrew-capable families detected
    }

    copy: {
        headings: string[]          // h1-h3 text
        heroParagraphs: string[]    // first 3 <p> with length > 50
        ctas: string[]              // button/a text that looks like CTA
    }

    media: {
        ogImage: string | null
        ogImageSecure: string | null
        themeColor: string | null   // <meta name="theme-color">
    }

    raw: {
        htmlLength: number
        bodyLength: number           // length of <body> content
        needsHeadlessBrowser: boolean  // true if body appears empty (SPA)
    }
}

const USER_AGENT =
    'Mozilla/5.0 (compatible; FlowmaticBrandBot/1.0; +https://clawflow.flowmatic.co.il)'

const FETCH_TIMEOUT_MS = 15000
const MAX_HTML_BYTES = 2 * 1024 * 1024   // 2MB cap

// Hebrew-capable font families (web-safe + Google Fonts that support Hebrew)
const HEBREW_FONT_LIST = [
    'Rubik', 'Heebo', 'Assistant', 'Alef', 'Frank Ruhl Libre',
    'Secular One', 'Varela Round', 'Amatic SC', 'Suez One',
    'Bellefair', 'David Libre', 'Miriam Libre', 'Tinos',
    'Arial', 'Arial Hebrew', 'Tahoma', 'Verdana',
]

export async function extractBrandFromUrl(
    inputUrl: string,
): Promise<ExtractedBrandSignals> {
    // Normalize URL
    const url = normalizeUrl(inputUrl)

    const result: ExtractedBrandSignals = {
        url,
        fetchedAt: new Date().toISOString(),
        httpStatus: 0,
        identity: {
            businessName: null, title: null, description: null,
            locale: null, language: null, direction: null,
        },
        logo: { candidates: [] },
        colors: { all: [], top: [] },
        typography: { fontFamilies: [], googleFonts: [], hebrewFonts: [] },
        copy: { headings: [], heroParagraphs: [], ctas: [] },
        media: { ogImage: null, ogImageSecure: null, themeColor: null },
        raw: { htmlLength: 0, bodyLength: 0, needsHeadlessBrowser: false },
    }

    let html = ''
    try {
        const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
        result.httpStatus = res.status
        if (!res.ok) return result

        html = await readLimitedText(res, MAX_HTML_BYTES)
        result.raw.htmlLength = html.length
    } catch (err) {
        console.error('brandExtract fetch error:', err)
        return result
    }

    // ── Identity ──────────────────────────────────────────────────────────
    result.identity.title = extractMeta(html, 'og:title')
        || firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i)?.trim()
        || null

    result.identity.description = extractMeta(html, 'og:description')
        || extractMeta(html, 'description', 'name')
        || null

    result.identity.businessName = extractMeta(html, 'og:site_name')
        || extractMeta(html, 'application-name', 'name')
        || result.identity.title

    result.identity.locale = extractMeta(html, 'og:locale')
    const htmlLangMatch = firstMatch(html, /<html[^>]*\slang=["']([^"']+)["']/i)
    result.identity.language = htmlLangMatch || null

    const dirMatch = firstMatch(html, /<html[^>]*\sdir=["'](rtl|ltr)["']/i)
    if (dirMatch === 'rtl' || dirMatch === 'ltr') {
        result.identity.direction = dirMatch
    } else if (result.identity.language?.startsWith('he') || result.identity.language?.startsWith('ar')) {
        result.identity.direction = 'rtl'
    } else if (result.identity.language) {
        result.identity.direction = 'ltr'
    }

    // ── Media / OG ────────────────────────────────────────────────────────
    result.media.ogImage = extractMeta(html, 'og:image')
    result.media.ogImageSecure = extractMeta(html, 'og:image:secure_url')
    result.media.themeColor = extractMeta(html, 'theme-color', 'name')

    // ── Logo candidates (priority-scored) ─────────────────────────────────
    const baseUrl = new URL(url)
    const candidates = new Map<string, ExtractedBrandSignals['logo']['candidates'][number]>()

    // Brand name for alt-matching (we may use it below)
    const brandNameCandidate = (result.identity.businessName || result.identity.title || '').split(/[—|·:•]/)[0].trim().toLowerCase()

    // Priority 1: <img> with logo hints in class/alt/id/src
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)]
    for (const match of imgTags) {
        const tag = match[0]
        const src = firstMatch(tag, /\ssrc=["']([^"']+)["']/i)
        if (!src) continue
        // Accept data: URIs (inline SVG/PNG) — they are valid logo sources
        const absSrc = /^data:/i.test(src) ? src : absoluteUrl(src, baseUrl)
        const altText = firstMatch(tag, /\salt=["']([^"']*)["']/i) || ''
        const className = firstMatch(tag, /\sclass=["']([^"']*)["']/i) || ''
        const idName = firstMatch(tag, /\sid=["']([^"']*)["']/i) || ''
        const combined = (altText + ' ' + className + ' ' + idName).toLowerCase()

        let priority = 0
        const hints: string[] = []
        if (/\blogo\b/.test(combined))   { priority += 40; hints.push('contains "logo"') }
        if (/\bbrand\b/.test(combined))  { priority += 20; hints.push('contains "brand"') }
        if (/\bheader\b/.test(combined)) { priority += 10; hints.push('in header') }
        if (/\bnav\b/.test(combined))    { priority += 10; hints.push('in nav') }
        if (/\blogo\b/.test(src.toLowerCase())) { priority += 25; hints.push('src contains "logo"') }
        if (/\.svg(\?|$)/i.test(absSrc)) { priority += 15; hints.push('SVG format') }
        // Alt text equals (or closely matches) business name — strong signal
        // BUT only if alt is SHORT (real logo alt is "Flowmatic", not a marketing caption mentioning the brand)
        const altLower = altText.toLowerCase().trim()
        if (brandNameCandidate && altText && altText.length <= 40) {
            const isExact = altLower === brandNameCandidate
            const isCloseMatch = altLower.includes(brandNameCandidate) && altText.length < brandNameCandidate.length + 20
            if (isExact) { priority += 35; hints.push(`alt exactly matches business name ("${altText}")`) }
            else if (isCloseMatch) { priority += 20; hints.push(`alt closely matches business name ("${altText}")`) }
        }
        if (/\.(png|webp)(\?|$)/i.test(absSrc) && /\blogo\b/.test(combined)) { priority += 5 }

        if (priority > 0) {
            const existing = candidates.get(absSrc)
            if (!existing || existing.priority < priority) {
                candidates.set(absSrc, { url: absSrc, source: 'img_tag', priority, hints })
            }
        }
    }

    // Priority 2: apple-touch-icon
    const touchIcon = firstMatch(
        html,
        /<link[^>]*\brel=["'](apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*>/i,
    )
    if (touchIcon) {
        const hrefMatch = firstMatch(touchIcon, /\shref=["']([^"']+)["']/i)
        if (hrefMatch) {
            const absHref = absoluteUrl(hrefMatch, baseUrl)
            candidates.set(absHref, { url: absHref, source: 'apple_touch_icon', priority: 35, hints: ['apple-touch-icon'] })
        }
    }

    // Priority 3: schema.org logo
    const schemaLogo = firstMatch(
        html,
        /"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*"url"\s*:\s*"([^"]+)")/i,
    )
    if (schemaLogo) {
        const logoUrl = absoluteUrl(schemaLogo, baseUrl)
        candidates.set(logoUrl, { url: logoUrl, source: 'schema_logo', priority: 50, hints: ['schema.org logo'] })
    }

    // Priority 4: og:image (fallback)
    if (result.media.ogImage) {
        const abs = absoluteUrl(result.media.ogImage, baseUrl)
        if (!candidates.has(abs)) {
            candidates.set(abs, { url: abs, source: 'og_image', priority: 15, hints: ['og:image fallback'] })
        }
    }

    // Priority 5: favicon (last resort) — can be URL or data: URI (inline SVG)
    const favicon = firstMatch(
        html,
        /<link[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/i,
    )
    if (favicon) {
        const hrefMatch = firstMatch(favicon, /\shref=["']([^"']+)["']/i)
        if (hrefMatch) {
            const isDataUri = /^data:/i.test(hrefMatch)
            const absHref = isDataUri ? hrefMatch : absoluteUrl(hrefMatch, baseUrl)
            if (!candidates.has(absHref)) {
                const hints = isDataUri ? ['inline SVG data URI favicon (brand mark)'] : ['favicon.ico']
                // Inline SVG favicons for modern sites ARE the brand mark — higher priority
                const priority = isDataUri ? 25 : 5
                candidates.set(absHref, { url: absHref, source: 'favicon', priority, hints })
            }
        }
    }

    // Priority 6: CSS background-image in logo/header elements
    // Pattern: <element class="..logo.."> ... style="background-image: url(...)"
    for (const match of html.matchAll(/<[a-z]+\b[^>]*class=["'][^"']*\blogo\b[^"']*["'][^>]*style=["'][^"']*background-image\s*:\s*url\(([^)]+)\)/gi)) {
        const rawUrl = match[1].trim().replace(/^["']|["']$/g, '')
        if (rawUrl) {
            const absHref = absoluteUrl(rawUrl, baseUrl)
            if (!candidates.has(absHref)) {
                candidates.set(absHref, { url: absHref, source: 'img_tag', priority: 38, hints: ['CSS background-image on .logo element'] })
            }
        }
    }

    // Priority 7: inline <svg> inside header/nav with logo class — signal only, we can't URL it
    // but flag that logo is inline SVG and pass it along for later retrieval
    const inlineSvgNearLogo = /<(?:header|nav)\b[\s\S]{0,2000}?<svg\b[^>]*(?:class=["'][^"']*\blogo\b[^"']*["']|aria-label=["'][^"']*logo[^"']*["'])[\s\S]*?<\/svg>/i
    if (inlineSvgNearLogo.test(html)) {
        // Signal via pseudo-URL — caller can use this to trigger headless-browser extraction
        const signalUrl = baseUrl.origin + '/#inline-svg-logo'
        candidates.set(signalUrl, {
            url: signalUrl,
            source: 'img_tag',
            priority: 30,
            hints: ['inline <svg> with logo class detected in header/nav (needs browser capture)'],
        })
    }

    result.logo.candidates = [...candidates.values()]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10)

    // ── Colors ────────────────────────────────────────────────────────────
    // Extract from inline <style> blocks + style="" attributes + linked CSS (limited fetch)
    const colorCounts = new Map<string, number>()

    // Inline styles
    const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
        .map(m => m[1]).join('\n')
    collectColors(inlineStyles, colorCounts)
    collectColors(html, colorCounts, { weight: 0.3 })  // style="..." in tags, lower weight

    // Fetch critical CSS (1-2 main stylesheets max, to respect time)
    const cssLinks = [...html.matchAll(/<link[^>]*\brel=["']stylesheet["'][^>]*\shref=["']([^"']+)["']/gi)]
        .map(m => absoluteUrl(m[1], baseUrl))
        .slice(0, 2)
    for (const cssUrl of cssLinks) {
        try {
            const res = await fetchWithTimeout(cssUrl, 5000)
            if (res.ok) {
                const cssText = await readLimitedText(res, 512 * 1024)  // 512KB per CSS
                collectColors(cssText, colorCounts)
            }
        } catch { /* ignore individual CSS failures */ }
    }

    const allColors = [...colorCounts.entries()]
        .map(([hex, count]) => ({ hex, count: Math.round(count) }))
        .sort((a, b) => b.count - a.count)
    result.colors.all = allColors
    result.colors.top = dedupSimilarColors(allColors.slice(0, 30)).slice(0, 7).map(c => c.hex)

    // Include theme-color if present
    if (result.media.themeColor && isValidHex(result.media.themeColor)) {
        const normalized = normalizeHex(result.media.themeColor)
        if (!result.colors.top.includes(normalized)) {
            result.colors.top.unshift(normalized)
            result.colors.top = result.colors.top.slice(0, 7)
        }
    }

    // ── Typography ────────────────────────────────────────────────────────
    // Only parse font-family from:
    //   1. inline <style> blocks (already extracted)
    //   2. style="..." attributes (each one, parsed separately)
    // NOT full HTML — that's where `<span style="font-family:inherit"/> text...` leaks.
    const fontCounts = new Map<string, number>()

    // Collect font-family from inline <style> blocks
    for (const match of inlineStyles.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)) {
        addFonts(match[1], fontCounts)
    }

    // Collect from individual style="..." attributes (bounded — won't leak across tags)
    for (const match of html.matchAll(/\sstyle=["']([^"']*font-family[^"']*)["']/gi)) {
        const styleAttr = match[1]
        const ffMatch = styleAttr.match(/font-family\s*:\s*([^;]+)/i)
        if (ffMatch) addFonts(ffMatch[1], fontCounts)
    }
    result.typography.fontFamilies = [...fontCounts.entries()]
        .map(([family, count]) => ({ family, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

    // Google Fonts links
    const googleFontLinks = [...html.matchAll(/<link[^>]*\shref=["']([^"']*fonts\.googleapis\.com[^"']+)["']/gi)]
    for (const match of googleFontLinks) {
        const familyParam = firstMatch(match[1], /family=([^&]+)/)
        if (familyParam) {
            for (const f of familyParam.split('|')) {
                const familyName = decodeURIComponent(f.split(':')[0].replace(/\+/g, ' ')).trim()
                if (familyName && !result.typography.googleFonts.includes(familyName)) {
                    result.typography.googleFonts.push(familyName)
                }
            }
        }
    }

    // Hebrew fonts detected
    const allDetectedFamilies = [
        ...result.typography.fontFamilies.map(f => f.family),
        ...result.typography.googleFonts,
    ]
    result.typography.hebrewFonts = allDetectedFamilies.filter(f =>
        HEBREW_FONT_LIST.some(h => f.toLowerCase() === h.toLowerCase() || f.toLowerCase().includes(h.toLowerCase())),
    )

    // ── Copy samples ──────────────────────────────────────────────────────
    // Strip tags for headings; filter template placeholders + code leftovers
    const h1to3 = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
        .map(m => stripTags(m[1]).trim())
        .filter(t => t.length >= 2 && t.length <= 200)
        .filter(isRealCopy)
    result.copy.headings = [...new Set(h1to3)].slice(0, 10)

    // Hero paragraphs
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(m => stripTags(m[1]).trim())
        .filter(t => t.length >= 50 && t.length <= 400)
        .filter(isRealCopy)
    result.copy.heroParagraphs = [...new Set(paragraphs)].slice(0, 5)

    // CTAs (button + a with short text that looks like action)
    const ctaCandidates = [
        ...[...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)].map(m => stripTags(m[1]).trim()),
        ...[...html.matchAll(/<a\b[^>]*class=["'][^"']*\b(?:btn|button|cta)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => stripTags(m[1]).trim()),
    ].filter(t => t.length >= 2 && t.length <= 40).filter(isRealCopy)
    result.copy.ctas = [...new Set(ctaCandidates)].slice(0, 10)

    // ── Detect SPA / empty body ───────────────────────────────────────────
    const bodyMatch = firstMatch(html, /<body[^>]*>([\s\S]*)<\/body>/i)
    result.raw.bodyLength = bodyMatch?.length || 0
    // SPA detection: body present but very short OR mostly empty div#root
    const bodyText = stripTags(bodyMatch || '').replace(/\s+/g, ' ').trim()
    if (bodyMatch && bodyText.length < 200 && html.includes('id="root"')) {
        result.raw.needsHeadlessBrowser = true
    }

    return result
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function normalizeUrl(input: string): string {
    let u = input.trim()
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    try { return new URL(u).toString() } catch { return u }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
        return await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,text/css,*/*',
                'Accept-Language': 'he,en;q=0.8',
            },
            redirect: 'follow',
            signal: ctrl.signal,
        })
    } finally {
        clearTimeout(timer)
    }
}

async function readLimitedText(res: Response, maxBytes: number): Promise<string> {
    // Read body with a size limit to avoid OOM on huge pages
    if (!res.body) return await res.text()
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
        while (total < maxBytes) {
            const { value, done } = await reader.read()
            if (done) break
            if (value) {
                chunks.push(value)
                total += value.byteLength
            }
        }
    } finally {
        try { await reader.cancel() } catch { /* ignore */ }
    }
    const combined = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { combined.set(c, offset); offset += c.byteLength }
    return new TextDecoder('utf-8').decode(combined)
}

function firstMatch(text: string, regex: RegExp): string | null {
    const m = text.match(regex)
    return m ? m[1] : null
}

function extractMeta(html: string, key: string, attr: 'property' | 'name' = 'property'): string | null {
    // <meta property="og:title" content="..."> or <meta name="description" content="...">
    const re = new RegExp(
        `<meta\\b[^>]*\\b${attr}=["']${escapeRegex(key)}["'][^>]*\\bcontent=["']([^"']*)["']`,
        'i',
    )
    const m = html.match(re)
    if (m) return m[1]
    // Try reverse order (content= before property=)
    const re2 = new RegExp(
        `<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${escapeRegex(key)}["']`,
        'i',
    )
    const m2 = html.match(re2)
    return m2 ? m2[1] : null
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function absoluteUrl(href: string, base: URL): string {
    try {
        if (href.startsWith('//')) return base.protocol + href
        return new URL(href, base).toString()
    } catch {
        return href
    }
}

function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

/** Filter out i18n template placeholders and code leftovers from scraped copy */
function isRealCopy(s: string): boolean {
    // Reject i18n templates: ${t('...')}, {{var}}, {t('...')}
    if (/\$\{[^}]*\}|\{\{[^}]+\}\}|\{t\(/.test(s)) return false
    // Reject HTML entity-heavy (likely unrendered markup)
    if (/&#?[a-z0-9]+;/i.test(s)) return false
    // Reject markup fragments
    if (/[<>]/.test(s)) return false
    // Reject too-whitespacey
    const compact = s.replace(/\s+/g, '')
    if (compact.length < 2) return false
    return true
}

function addFonts(familiesStr: string, out: Map<string, number>): void {
    // Reject leaks from malformed HTML (e.g. "inherit/>")
    if (/[<>/=]/.test(familiesStr)) {
        // Try to salvage the part before first bad char
        const safe = familiesStr.split(/[<>/=]/)[0]
        if (!safe) return
        familiesStr = safe
    }
    const families = familiesStr
        .split(',')
        .map(f => f.trim().replace(/["']/g, '').replace(/[{};]/g, '').trim())
        .filter(f => f.length > 0 && f.length < 60)
        .filter(f => !/[<>=]/.test(f))  // any residual markup chars
    const GENERIC = new Set([
        'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
        'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
        'inherit', 'initial', 'unset', 'revert',
        '-apple-system', 'blinkmacsystemfont', 'segoe ui',
        'roboto', 'oxygen', 'ubuntu', 'cantarell', 'fira sans',
        'droid sans', 'helvetica neue', 'sans', 'serif', 'var',
    ])
    for (const family of families) {
        if (GENERIC.has(family.toLowerCase())) continue
        // Reject CSS variable syntax `--foo`, `var(`, etc.
        if (/^--|^var\(|^calc\(/.test(family)) continue
        out.set(family, (out.get(family) || 0) + 1)
    }
}

function collectColors(css: string, out: Map<string, number>, opts: { weight?: number } = {}): void {
    const weight = opts.weight ?? 1

    // Hex codes: #RRGGBB, #RGB
    for (const match of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
        const hex = normalizeHex(match[0])
        // Skip black/white (too generic) unless theme-color — they still count but lower
        const w = (hex === '#000000' || hex === '#FFFFFF') ? weight * 0.3 : weight
        out.set(hex, (out.get(hex) || 0) + w)
    }
    // rgb() / rgba()
    for (const match of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/g)) {
        const r = parseInt(match[1], 10), g = parseInt(match[2], 10), b = parseInt(match[3], 10)
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1
        if (a < 0.5) continue  // skip very transparent colors
        if (r > 255 || g > 255 || b > 255) continue
        const hex = rgbToHex(r, g, b)
        const w = (hex === '#000000' || hex === '#FFFFFF') ? weight * 0.3 : weight
        out.set(hex, (out.get(hex) || 0) + w)
    }
}

function normalizeHex(hex: string): string {
    let h = hex.replace(/^#/, '').toUpperCase()
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    return '#' + h
}

function isValidHex(s: string): boolean {
    return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(s.trim())
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function dedupSimilarColors(colors: Array<{ hex: string; count: number }>, threshold = 15): Array<{ hex: string; count: number }> {
    // Merge colors within `threshold` Euclidean distance in RGB space
    const result: Array<{ hex: string; count: number }> = []
    for (const c of colors) {
        const rgb = hexToRgb(c.hex)
        if (!rgb) continue
        const similar = result.find(r => {
            const rrgb = hexToRgb(r.hex)
            if (!rrgb) return false
            const d = Math.sqrt(
                Math.pow(rgb.r - rrgb.r, 2) +
                Math.pow(rgb.g - rrgb.g, 2) +
                Math.pow(rgb.b - rrgb.b, 2),
            )
            return d < threshold
        })
        if (similar) {
            similar.count += c.count   // merge freq
        } else {
            result.push({ ...c })
        }
    }
    return result.sort((a, b) => b.count - a.count)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/)
    if (!m) return null
    const int = parseInt(m[1], 16)
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}