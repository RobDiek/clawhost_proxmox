/**
 * Creative DNA Decomposer — decomposes a competitor ad (or our own winning render)
 * into 12 structured tags using Claude Vision.
 *
 * Usage:
 *   1. Reference mining: given a winning competitor ad, extract DNA → inject as
 *      few-shot in Yotzer Gate 1 prompt so generated concepts follow patterns that
 *      empirically convert (without copying the ad).
 *   2. Own creative learning: after we render our own creatives, decompose them
 *      the same way → store in Neo4j via openclaw-facts → menateach queries
 *      correlations (e.g. "hookType=testimonial + emotion=validation → highest ROAS").
 *
 * Input: image URL OR text content (for image-less ads where we only have copy).
 * Output: CreativeDNA struct with 12 categorical tags + confidence.
 *
 * Cost: ~$0.01 per decompose call (Haiku vision is cheap). Batch 10-20 winning
 * ads costs ~$0.10-0.20 total — acceptable for MVP.
 */

export interface CreativeDNA {
    // Hook (first 3 sec / headline)
    hookType:    'problem' | 'unlock' | 'testimony' | 'curiosity' | 'social_proof' | 'contrarian' | 'pattern_interrupt' | 'unknown'
    hookFormat:  'POV' | 'UGC' | 'stats' | 'before_after' | 'question' | 'direct_address' | 'lifestyle_scene' | 'unknown'
    hookEmotion: 'fear' | 'aspiration' | 'relief' | 'validation' | 'desire' | 'curiosity' | 'urgency' | 'unknown'

    // Pacing + structure
    pacingType:  'slow' | 'medium' | 'fast' | 'mixed'
    sceneCount:  number             // estimated distinct scenes (for static image: 1)
    avgSceneSec: number | null      // for video; null for static

    // Visual
    dominantColors:    string[]     // 2-5 hex codes actually prominent
    textPlacement:     'overlay' | 'inside_scene' | 'none' | 'subtitle_only'
    voiceStyle:        'none' | 'narrator' | 'ugc_casual' | 'interview' | 'authoritative' | 'unknown'
    musicStyle:        'none' | 'uplifting' | 'dramatic' | 'minimal' | 'trendy' | 'unknown'

    // Content / claim
    claimStyle:        'direct' | 'implied' | 'testimonial' | 'data_driven' | 'comparative' | 'unknown'
    ctaType:           'learn_more' | 'buy_now' | 'sign_up' | 'download' | 'watch_video' | 'contact' | 'none'
    ctaPlacement:      'opening' | 'mid' | 'closing' | 'persistent' | 'none'

    // Subject
    brandLogoPresence: 'none' | 'subtle' | 'prominent'
    faceCentric:       boolean
    backgroundBusy:    boolean

    // Meta
    confidence:        'high' | 'medium' | 'low'
    languageDetected:  string      // ISO code: 'he', 'en', 'ar', etc
    summary:           string      // 1-sentence English summary of what the ad does
    summaryHe:         string      // Hebrew version
}

// ═══════════════════════════════════════════════════════════════════════════
// Main — decompose single ad
// ═══════════════════════════════════════════════════════════════════════════

export async function decomposeCreative(params: {
    anthropicKey: string
    imageUrl?: string               // Full image URL (will be fetched)
    videoThumbnailUrl?: string      // For video: use thumbnail frame
    copyText?: string               // Ad body + title + description concatenated
    businessContext?: string        // Our client's business — so DNA is relative
}): Promise<{ dna: CreativeDNA | null; error?: string }> {
    const { anthropicKey, imageUrl, videoThumbnailUrl, copyText, businessContext } = params

    const visualUrl = imageUrl || videoThumbnailUrl
    if (!visualUrl && !copyText) {
        return { dna: null, error: 'Either imageUrl/videoThumbnailUrl or copyText required' }
    }

    // Build messages — if image provided, include as base64; otherwise text-only
    const contentBlocks: Array<Record<string, unknown>> = []
    if (visualUrl) {
        try {
            const { base64, mimeType } = await fetchImageAsBase64(visualUrl)
            contentBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64 },
            })
        } catch (err) {
            console.warn('DNA image fetch failed, falling back to text-only:', err)
            if (!copyText) return { dna: null, error: 'Image fetch failed and no copyText fallback' }
        }
    }

    const textPrompt = buildDecomposePrompt(copyText, businessContext)
    contentBlocks.push({ type: 'text', text: textPrompt })

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5',
                max_tokens: 1500,
                system: 'You are a performance-marketing creative analyst. Decompose ads into structured DNA tags. Return ONLY valid JSON — no markdown fences, no prose outside JSON.',
                messages: [{ role: 'user', content: contentBlocks }],
            }),
            signal: AbortSignal.timeout(60000),
        })

        if (!res.ok) {
            const errText = await res.text()
            return { dna: null, error: `Claude Haiku HTTP ${res.status}: ${errText.substring(0, 200)}` }
        }

        const data = await res.json() as { content?: Array<{ text: string }> }
        const text = data.content?.[0]?.text || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { dna: null, error: 'No JSON in decomposer response' }

        const parsed = JSON.parse(jsonMatch[0])
        return { dna: coerceDNA(parsed) }
    } catch (err) {
        return { dna: null, error: err instanceof Error ? err.message : String(err) }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch decompose — useful for bulk reference mining
// ═══════════════════════════════════════════════════════════════════════════

export async function decomposeCreativeBatch(params: {
    anthropicKey: string
    items: Array<{ id: string; imageUrl?: string; videoThumbnailUrl?: string; copyText?: string }>
    businessContext?: string
    concurrency?: number   // default 3
}): Promise<Array<{ id: string; dna: CreativeDNA | null; error?: string }>> {
    const concurrency = params.concurrency || 3
    const results: Array<{ id: string; dna: CreativeDNA | null; error?: string }> = []
    const queue = [...params.items]

    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift()
            if (!item) return
            const out = await decomposeCreative({
                anthropicKey: params.anthropicKey,
                imageUrl: item.imageUrl,
                videoThumbnailUrl: item.videoThumbnailUrl,
                copyText: item.copyText,
                businessContext: params.businessContext,
            })
            results.push({ id: item.id, ...out })
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    return results
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function buildDecomposePrompt(copyText: string | undefined, businessContext: string | undefined): string {
    return `Decompose this ad into the JSON schema below. Base judgments on BOTH the visual (if provided) AND the copy text.

${copyText ? `COPY TEXT:\n"""\n${copyText.substring(0, 2000)}\n"""\n` : ''}
${businessContext ? `CONTEXT: Our client's business is: ${businessContext}. Tag the ad AS IT RELATES to this client's space — but be objective about the ad's own style.\n\n` : ''}

Return this JSON exactly (ALL FIELDS REQUIRED, use 'unknown'/null/empty where you're not sure):

{
  "hookType":        "problem|unlock|testimony|curiosity|social_proof|contrarian|pattern_interrupt|unknown",
  "hookFormat":      "POV|UGC|stats|before_after|question|direct_address|lifestyle_scene|unknown",
  "hookEmotion":     "fear|aspiration|relief|validation|desire|curiosity|urgency|unknown",
  "pacingType":      "slow|medium|fast|mixed",
  "sceneCount":      <integer, 1 for static image>,
  "avgSceneSec":     <number or null for static>,
  "dominantColors":  ["#RRGGBB", ...],    // 2-5 hex codes actually prominent in the ad
  "textPlacement":   "overlay|inside_scene|none|subtitle_only",
  "voiceStyle":      "none|narrator|ugc_casual|interview|authoritative|unknown",
  "musicStyle":      "none|uplifting|dramatic|minimal|trendy|unknown",
  "claimStyle":      "direct|implied|testimonial|data_driven|comparative|unknown",
  "ctaType":         "learn_more|buy_now|sign_up|download|watch_video|contact|none",
  "ctaPlacement":    "opening|mid|closing|persistent|none",
  "brandLogoPresence":"none|subtle|prominent",
  "faceCentric":     true|false,
  "backgroundBusy":  true|false,
  "confidence":      "high|medium|low",
  "languageDetected":"he|en|ar|...",
  "summary":         "One English sentence describing what the ad does + main technique.",
  "summaryHe":       "משפט אחד בעברית — מה הפרסומת עושה + הטכניקה המרכזית."
}

Guidance:
- hookType: problem=calls out a pain; unlock=shows a how-to; testimony=user quote; curiosity=cliffhanger; social_proof=crowd/badges; contrarian=unexpected stance; pattern_interrupt=visual shock.
- Choose the BEST fit. Don't force multi-labels.
- For dominantColors: pick from the actual image. If text-only, extract from copy-implied colors (e.g. if copy says "blue sky" infer blue).
- Confidence LOW if visual is missing + copy is generic.
- Return valid JSON, no trailing commas, no comments, no markdown fence.`
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Image fetch HTTP ${res.status}`)
    const mimeType = res.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 5 * 1024 * 1024) throw new Error('Image too large (>5MB)')
    // Claude accepts: image/jpeg, image/png, image/gif, image/webp
    const validMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
        ? mimeType : 'image/jpeg'
    return { base64: buf.toString('base64'), mimeType: validMime }
}

function coerceDNA(parsed: unknown): CreativeDNA {
    const p = parsed as Record<string, unknown>
    const asStr = (v: unknown, fallback: string): string => typeof v === 'string' ? v : fallback
    const asNum = (v: unknown, fallback: number | null): number | null => {
        if (typeof v === 'number') return v
        if (v === null) return null
        const n = typeof v === 'string' ? parseFloat(v) : NaN
        return isNaN(n) ? fallback : n
    }
    const asBool = (v: unknown): boolean => v === true || v === 'true' || v === 1
    const asStrArr = (v: unknown): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') as string[] : []

    return {
        hookType: asStr(p.hookType, 'unknown') as CreativeDNA['hookType'],
        hookFormat: asStr(p.hookFormat, 'unknown') as CreativeDNA['hookFormat'],
        hookEmotion: asStr(p.hookEmotion, 'unknown') as CreativeDNA['hookEmotion'],
        pacingType: asStr(p.pacingType, 'medium') as CreativeDNA['pacingType'],
        sceneCount: (asNum(p.sceneCount, 1) || 1) as number,
        avgSceneSec: asNum(p.avgSceneSec, null),
        dominantColors: asStrArr(p.dominantColors).filter(s => /^#[0-9A-Fa-f]{6}$/.test(s)).map(s => s.toUpperCase()),
        textPlacement: asStr(p.textPlacement, 'none') as CreativeDNA['textPlacement'],
        voiceStyle: asStr(p.voiceStyle, 'unknown') as CreativeDNA['voiceStyle'],
        musicStyle: asStr(p.musicStyle, 'unknown') as CreativeDNA['musicStyle'],
        claimStyle: asStr(p.claimStyle, 'unknown') as CreativeDNA['claimStyle'],
        ctaType: asStr(p.ctaType, 'none') as CreativeDNA['ctaType'],
        ctaPlacement: asStr(p.ctaPlacement, 'none') as CreativeDNA['ctaPlacement'],
        brandLogoPresence: asStr(p.brandLogoPresence, 'none') as CreativeDNA['brandLogoPresence'],
        faceCentric: asBool(p.faceCentric),
        backgroundBusy: asBool(p.backgroundBusy),
        confidence: asStr(p.confidence, 'medium') as CreativeDNA['confidence'],
        languageDetected: asStr(p.languageDetected, 'unknown'),
        summary: asStr(p.summary, ''),
        summaryHe: asStr(p.summaryHe, ''),
    }
}