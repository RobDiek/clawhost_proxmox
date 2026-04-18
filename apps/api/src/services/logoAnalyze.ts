/**
 * Logo Analyzer Service
 *
 * Given a logo URL (from brandExtract output OR user upload), analyzes the image
 * and returns structured usage rules + visual metadata.
 *
 * Handles:
 *   1. http(s) URLs — fetched, content-type detected, sent to Claude Vision
 *   2. data: URIs — parsed (common for modern favicons: `data:image/svg+xml,...`)
 *   3. SVG content — XML parsed directly for colors/viewBox (no Vision call needed)
 *   4. Raster (PNG/JPEG/WebP/GIF) — sent to Claude Vision for semantic analysis
 *
 * Uses Claude Haiku 4.5 for cost (vision-capable, ~$0.01/image).
 * Anthropic API key is user's BYOK from instance.anthropicKey.
 */

interface LogoAnalysisResult {
    ok: boolean
    error?: string

    source: {
        url: string
        format: 'svg' | 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown'
        sizeBytes: number
        isDataUri: boolean
    }

    visual: {
        style: 'wordmark' | 'lettermark' | 'pictorial' | 'abstract' | 'combination' | 'emblem' | 'unknown'
        // wordmark:    text-only (e.g. Coca-Cola, Google)
        // lettermark:  initial letters (CF, IBM)
        // pictorial:   recognizable icon (Apple, Twitter)
        // abstract:    non-representational shape (Nike swoosh)
        // combination: text + symbol (Flowmatic, Adidas)
        // emblem:      text inside a badge (Starbucks, Harley)
        description: string                // 1-2 sentence English description
        descriptionHe: string               // Hebrew version
        hasText: boolean
        dominantColors: string[]            // hex codes from the logo itself (2-5)
        hasTransparentBackground: boolean
        inferredDimensions: { width: number; height: number } | null  // approx px
        aspectRatio: 'square' | 'horizontal' | 'vertical' | 'circular' | null
    }

    usageRules: {
        minSizePx: number                    // minimum legible size
        safeZonePx: number                   // clear space around logo
        allowedBackgrounds: string[]         // hex codes where logo works well
        forbiddenContexts: string[]          // what NOT to do
        recommendedVariants: string[]        // ['monochrome-dark', 'monochrome-light', 'full-color']
    }

    // For overlay composition (Yotzer Gate 4)
    composition: {
        defaultPosition: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
        opacity: number                      // 1.0 = fully opaque
        requiresLightBackground: boolean
        requiresDarkBackground: boolean
    }
}

const DEFAULT_RULES: Omit<LogoAnalysisResult['usageRules'], 'allowedBackgrounds'> & { allowedBackgrounds: string[] } = {
    minSizePx: 32,
    safeZonePx: 16,
    allowedBackgrounds: ['#FFFFFF'],
    forbiddenContexts: ['busy photographic backgrounds', 'low contrast surfaces'],
    recommendedVariants: ['full-color'],
}

export async function analyzeLogo(
    logoUrl: string,
    anthropicKey: string,
): Promise<LogoAnalysisResult> {
    const baseResult: LogoAnalysisResult = {
        ok: false,
        source: { url: logoUrl, format: 'unknown', sizeBytes: 0, isDataUri: logoUrl.startsWith('data:') },
        visual: {
            style: 'unknown', description: '', descriptionHe: '',
            hasText: false, dominantColors: [], hasTransparentBackground: false,
            inferredDimensions: null, aspectRatio: null,
        },
        usageRules: { ...DEFAULT_RULES },
        composition: {
            defaultPosition: 'bottom_right', opacity: 1.0,
            requiresLightBackground: false, requiresDarkBackground: false,
        },
    }

    // ── Step 1: load bytes + detect format ───────────────────────────────
    const { bytes, mimeType, error } = await loadImageBytes(logoUrl)
    if (error || !bytes) {
        return { ...baseResult, ok: false, error: error || 'Could not load image' }
    }
    baseResult.source.sizeBytes = bytes.byteLength
    baseResult.source.format = mimeToFormat(mimeType)

    // ── Step 2: SVG gets a different path (XML parse, no vision) ─────────
    if (baseResult.source.format === 'svg') {
        const svgText = new TextDecoder('utf-8').decode(bytes)
        return analyzeSvgLocally(svgText, baseResult)
    }

    // ── Step 3: Raster → Claude Vision ───────────────────────────────────
    if (!['png', 'jpeg', 'webp', 'gif'].includes(baseResult.source.format)) {
        return { ...baseResult, ok: false, error: `Unsupported format: ${baseResult.source.format}` }
    }

    try {
        const base64 = bufferToBase64(bytes)
        const visionResult = await callClaudeVision(base64, mimeType, anthropicKey)
        return mergeVisionResult(baseResult, visionResult)
    } catch (err) {
        console.error('logoAnalyze vision call error:', err)
        return { ...baseResult, ok: false, error: 'Vision analysis failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

async function loadImageBytes(url: string): Promise<{ bytes: Uint8Array | null; mimeType: string; error?: string }> {
    if (url.startsWith('data:')) {
        // data:[<mediatype>][;base64],<data>
        const m = url.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
        if (!m) return { bytes: null, mimeType: '', error: 'Invalid data URI' }
        const mimeType = m[1] || 'application/octet-stream'
        const isBase64 = !!m[2]
        const data = m[3]

        try {
            if (isBase64) {
                return { bytes: base64ToBytes(data), mimeType }
            }
            // URL-encoded text (common for SVG favicons)
            const decoded = decodeURIComponent(data)
            return { bytes: new TextEncoder().encode(decoded), mimeType }
        } catch (err) {
            return { bytes: null, mimeType: '', error: 'data URI decode failed' }
        }
    }

    try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClawFlowBrandBot/1.0)' },
            redirect: 'follow',
            signal: ctrl.signal,
        })
        clearTimeout(timer)
        if (!res.ok) return { bytes: null, mimeType: '', error: `HTTP ${res.status}` }
        const mimeType = res.headers.get('content-type')?.split(';')[0].trim() || 'application/octet-stream'
        const ab = await res.arrayBuffer()
        if (ab.byteLength > 10 * 1024 * 1024) {
            return { bytes: null, mimeType, error: 'Image too large (>10MB)' }
        }
        return { bytes: new Uint8Array(ab), mimeType }
    } catch (err) {
        return { bytes: null, mimeType: '', error: 'Fetch failed: ' + (err instanceof Error ? err.message : String(err)) }
    }
}

function mimeToFormat(mime: string): LogoAnalysisResult['source']['format'] {
    const m = mime.toLowerCase()
    if (m.includes('svg')) return 'svg'
    if (m.includes('png')) return 'png'
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpeg'
    if (m.includes('webp')) return 'webp'
    if (m.includes('gif')) return 'gif'
    return 'unknown'
}

function bufferToBase64(bytes: Uint8Array): string {
    // Node/Bun/Edge-compatible: use Buffer if available, else manual
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64')
    }
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(b64, 'base64'))
    }
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

// ── SVG analyzed locally (no Vision call) ───────────────────────────────────
function analyzeSvgLocally(
    svgText: string,
    base: LogoAnalysisResult,
): LogoAnalysisResult {
    // Extract viewBox / width / height
    const viewBoxMatch = svgText.match(/viewBox\s*=\s*["']([\d\.\s\-]+)["']/i)
    const widthMatch = svgText.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)[^"']*["']/i)
    const heightMatch = svgText.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)[^"']*["']/i)

    let w = 0, h = 0
    if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).filter(Boolean).map(Number)
        if (parts.length === 4) {
            w = parts[2]
            h = parts[3]
        }
    }
    if (widthMatch) w = parseFloat(widthMatch[1]) || w
    if (heightMatch) h = parseFloat(heightMatch[1]) || h
    if (w > 0 && h > 0) {
        base.visual.inferredDimensions = { width: Math.round(w), height: Math.round(h) }
        const ratio = w / h
        if (Math.abs(ratio - 1) < 0.15) base.visual.aspectRatio = 'square'
        else if (ratio > 1.15) base.visual.aspectRatio = 'horizontal'
        else base.visual.aspectRatio = 'vertical'
    }

    // Extract colors from fill= and stroke= attributes + inline style
    const colors = new Set<string>()
    for (const match of svgText.matchAll(/\b(?:fill|stroke)\s*=\s*["']#([0-9a-fA-F]{3,6})["']/g)) {
        colors.add(normalizeSvgHex('#' + match[1]))
    }
    for (const match of svgText.matchAll(/\b(?:fill|stroke)\s*:\s*#([0-9a-fA-F]{3,6})/g)) {
        colors.add(normalizeSvgHex('#' + match[1]))
    }
    for (const match of svgText.matchAll(/\b(?:fill|stroke)\s*=\s*["']rgb\((\d+),\s*(\d+),\s*(\d+)\)["']/g)) {
        const r = parseInt(match[1], 10), g = parseInt(match[2], 10), b = parseInt(match[3], 10)
        if (r <= 255 && g <= 255 && b <= 255) {
            colors.add('#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase())
        }
    }
    base.visual.dominantColors = [...colors].filter(c => c !== '#NONE').slice(0, 5)

    // Text detection — SVG <text> elements
    base.visual.hasText = /<text\b/i.test(svgText)

    // Most SVG logos are transparent by default (no <rect> covering full area)
    const hasFullBgRect = /<rect[^>]*(?:width\s*=\s*["']100%["']|width\s*=\s*["']?\d+["']?[^>]*height)/i.test(svgText)
    base.visual.hasTransparentBackground = !hasFullBgRect

    // Style heuristic
    if (base.visual.hasText && colors.size <= 2) base.visual.style = 'wordmark'
    else if (base.visual.hasText && colors.size > 2) base.visual.style = 'combination'
    else if (!base.visual.hasText) base.visual.style = 'abstract'
    else base.visual.style = 'unknown'

    base.visual.description = `SVG ${base.visual.style} logo${base.visual.aspectRatio ? ` (${base.visual.aspectRatio})` : ''} with ${colors.size} color${colors.size === 1 ? '' : 's'}`
    base.visual.descriptionHe = `לוגו SVG בסגנון ${base.visual.style}${base.visual.aspectRatio ? ` (${base.visual.aspectRatio})` : ''} עם ${colors.size} צבע${colors.size === 1 ? '' : 'ים'}`

    // Usage rules — SVG is scalable
    base.usageRules.minSizePx = 24
    base.usageRules.safeZonePx = 12
    base.usageRules.allowedBackgrounds = base.visual.hasTransparentBackground
        ? ['#FFFFFF', '#0F172A', 'any solid color with sufficient contrast']
        : ['#FFFFFF']
    base.usageRules.recommendedVariants = ['full-color (SVG scales infinitely)']

    base.ok = true
    return base
}

function normalizeSvgHex(hex: string): string {
    let h = hex.replace(/^#/, '').toUpperCase()
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    if (h.length !== 6) return '#NONE'
    return '#' + h
}

// ── Claude Vision call for raster images ────────────────────────────────────

interface VisionPayload {
    style: LogoAnalysisResult['visual']['style']
    descriptionEn: string
    descriptionHe: string
    hasText: boolean
    dominantColors: string[]
    hasTransparentBackground: boolean
    aspectRatio: LogoAnalysisResult['visual']['aspectRatio']
    inferredWidth: number | null
    inferredHeight: number | null
    minSizePx: number
    safeZonePx: number
    allowedBackgrounds: string[]
    forbiddenContexts: string[]
    recommendedVariants: string[]
    defaultOverlayPosition: LogoAnalysisResult['composition']['defaultPosition']
    requiresLightBackground: boolean
    requiresDarkBackground: boolean
}

async function callClaudeVision(
    base64Image: string,
    mimeType: string,
    apiKey: string,
): Promise<VisionPayload> {
    const systemPrompt = `You are a brand identity analyst. Analyze the logo image and return STRICT JSON with usage rules.`

    const userPrompt = `Analyze this logo. Return ONLY a single JSON object (no markdown, no prose) with this exact schema:

{
  "style": "wordmark" | "lettermark" | "pictorial" | "abstract" | "combination" | "emblem" | "unknown",
  "descriptionEn": "1-2 sentences in English describing the logo",
  "descriptionHe": "אותו דבר בעברית, משפט-שניים",
  "hasText": true | false,
  "dominantColors": ["#RRGGBB", ...],   // 2-5 hex codes actually used in the logo
  "hasTransparentBackground": true | false,
  "aspectRatio": "square" | "horizontal" | "vertical" | "circular" | null,
  "inferredWidth": null | number,        // approx px if clear
  "inferredHeight": null | number,
  "minSizePx": 32,                        // smallest size that remains legible (16-64 typical)
  "safeZonePx": 16,                       // clear space around logo
  "allowedBackgrounds": ["#FFFFFF", ...], // hex codes where logo works (based on color/contrast)
  "forbiddenContexts": ["busy photographic backgrounds", ...],
  "recommendedVariants": ["full-color", "monochrome-dark", "monochrome-light"],
  "defaultOverlayPosition": "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center",
  "requiresLightBackground": true | false,   // true if logo is dark and needs light bg
  "requiresDarkBackground": true | false
}

Guidelines:
- Style definitions: wordmark = text-only; lettermark = initials; pictorial = recognizable icon; abstract = geometric symbol; combination = text + symbol; emblem = text inside a badge/shield.
- Be conservative on transparency — only claim transparent if you clearly see it.
- dominantColors: use a color picker mindset — pick the 2-5 hex codes that appear in the logo itself, not white space.
- forbiddenContexts: be specific (e.g. "photos with similar color range", "dark mode without inverted variant").
- If logo is very small or unclear, set style=unknown but still attempt colors + text detection.
- Return valid JSON only. No trailing commas. No comments.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mimeType,
                            data: base64Image,
                        },
                    },
                    { type: 'text', text: userPrompt },
                ],
            }],
        }),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Claude Vision HTTP ${res.status}: ${errText.substring(0, 300)}`)
    }

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text || ''

    // Extract JSON — strip possible markdown fences defensively
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude returned no JSON: ' + text.substring(0, 200))

    let parsed: VisionPayload
    try {
        parsed = JSON.parse(jsonMatch[0])
    } catch (err) {
        throw new Error('Claude JSON parse failed: ' + text.substring(0, 200))
    }

    return parsed
}

function mergeVisionResult(base: LogoAnalysisResult, v: VisionPayload): LogoAnalysisResult {
    base.visual.style = v.style || 'unknown'
    base.visual.description = v.descriptionEn || ''
    base.visual.descriptionHe = v.descriptionHe || ''
    base.visual.hasText = !!v.hasText
    base.visual.dominantColors = (v.dominantColors || []).filter(c => /^#[0-9A-Fa-f]{6}$/.test(c)).map(c => c.toUpperCase())
    base.visual.hasTransparentBackground = !!v.hasTransparentBackground
    base.visual.aspectRatio = v.aspectRatio || null
    if (v.inferredWidth && v.inferredHeight) {
        base.visual.inferredDimensions = { width: v.inferredWidth, height: v.inferredHeight }
    }

    base.usageRules.minSizePx = Math.max(16, Math.min(128, v.minSizePx || 32))
    base.usageRules.safeZonePx = Math.max(4, Math.min(64, v.safeZonePx || 16))
    base.usageRules.allowedBackgrounds = (v.allowedBackgrounds || ['#FFFFFF']).filter(c => /^#[0-9A-Fa-f]{6}$/.test(c))
    if (base.usageRules.allowedBackgrounds.length === 0) base.usageRules.allowedBackgrounds = ['#FFFFFF']
    base.usageRules.forbiddenContexts = v.forbiddenContexts || DEFAULT_RULES.forbiddenContexts
    base.usageRules.recommendedVariants = v.recommendedVariants || DEFAULT_RULES.recommendedVariants

    base.composition.defaultPosition = v.defaultOverlayPosition || 'bottom_right'
    base.composition.requiresLightBackground = !!v.requiresLightBackground
    base.composition.requiresDarkBackground = !!v.requiresDarkBackground

    base.ok = true
    return base
}
