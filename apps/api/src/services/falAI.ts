/**
 * fal.ai client — image generation (Flux Pro v1.1 / Flux Schnell).
 *
 * API docs: https://fal.ai/models/fal-ai/flux-pro/v1.1/api
 *           https://fal.ai/models/fal-ai/flux/schnell/api
 *
 * Auth: `Key {FAL_KEY}` header. Each instance brings its own key (stored in
 *       researchData.mediaKeys.falKey). Falls back to env FAL_KEY for the
 *       mgmt-side test instance.
 *
 * Costs (April 2026 pricing):
 *   - Flux Pro v1.1:  $0.040 per megapixel
 *   - Flux Schnell:   $0.003 per megapixel (12x cheaper, "fast draft")
 *   - Kling 1.6 Pro:  ~$0.15 per second of video output (Phase M.2)
 *
 * Key endpoints (sync vs queue):
 *   - POST https://fal.run/{model_id}            → sync, waits for result
 *   - POST https://queue.fal.run/{model_id}      → async with polling
 *
 * We use QUEUE API with polling because Flux Pro generation takes 8-25s and
 * some Node runtimes drop long sync HTTP connections on proxies.
 */

export type FalImageModel = 'flux-pro-1.1' | 'flux-schnell'

export interface FalGenerateImageOpts {
    apiKey: string
    prompt: string
    negativePrompt?: string
    width: number
    height: number
    numImages?: number          // default 1, max 4
    model?: FalImageModel       // default flux-pro-1.1
    seed?: number
    safety?: boolean            // default true
}

export interface FalImageResult {
    url: string                 // fal.ai CDN url (valid ~7 days)
    width: number
    height: number
    seed: number
    costUsd: number             // estimated cost for this single image
}

const MODEL_ENDPOINTS: Record<FalImageModel, string> = {
    'flux-pro-1.1': 'fal-ai/flux-pro/v1.1',
    'flux-schnell': 'fal-ai/flux/schnell',
}

// Cost per megapixel (USD)
const COST_PER_MP: Record<FalImageModel, number> = {
    'flux-pro-1.1': 0.04,
    'flux-schnell': 0.003,
}

function estimateCost(model: FalImageModel, width: number, height: number): number {
    const megapixels = (width * height) / 1_000_000
    return COST_PER_MP[model] * megapixels
}

/**
 * Generate one batch of images from fal.ai.
 * Returns N image URLs (hosted on fal.ai CDN — valid ~7 days).
 * Caller must download bytes and push to VPS for long-term storage.
 */
export async function generateImages(opts: FalGenerateImageOpts): Promise<FalImageResult[]> {
    if (!opts.apiKey) throw new Error('fal.ai API key missing')
    if (!opts.prompt) throw new Error('prompt required')

    const model = opts.model || 'flux-pro-1.1'
    const endpoint = MODEL_ENDPOINTS[model]
    const numImages = Math.min(Math.max(opts.numImages || 1, 1), 4)

    // Flux API shape — differs slightly between pro and schnell.
    const body: Record<string, unknown> = {
        prompt: opts.prompt,
        image_size: { width: opts.width, height: opts.height },
        num_images: numImages,
        enable_safety_checker: opts.safety !== false,
        output_format: 'jpeg',
    }
    if (model === 'flux-pro-1.1') {
        body.num_inference_steps = 28
        body.guidance_scale = 3.5
    }
    if (model === 'flux-schnell') {
        body.num_inference_steps = 4
    }
    if (opts.negativePrompt) body.negative_prompt = opts.negativePrompt
    if (typeof opts.seed === 'number') body.seed = opts.seed

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Key ${opts.apiKey}`,
    }

    // Submit job to queue
    const submitRes = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    })
    if (!submitRes.ok) {
        const err = await submitRes.text()
        throw new Error(`fal.ai submit ${submitRes.status}: ${err.substring(0, 300)}`)
    }
    const submitData = await submitRes.json() as { request_id?: string; status?: string; response_url?: string; status_url?: string }
    const requestId = submitData.request_id
    if (!requestId) throw new Error('fal.ai did not return request_id: ' + JSON.stringify(submitData).substring(0, 200))

    // Poll status every 2s (up to 4 min — Flux Pro usually completes in 8-25s)
    const statusUrl = submitData.status_url || `https://queue.fal.run/${endpoint}/requests/${requestId}/status`
    const resultUrl = submitData.response_url || `https://queue.fal.run/${endpoint}/requests/${requestId}`
    let attempts = 0
    const maxAttempts = 120 // 4 min at 2s interval
    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000))
        attempts++
        const statusRes = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(10_000) })
        if (!statusRes.ok) continue
        const statusData = await statusRes.json() as { status?: string; queue_position?: number; logs?: unknown[] }
        if (statusData.status === 'COMPLETED') break
        if (statusData.status === 'FAILED') {
            throw new Error(`fal.ai generation failed: ${JSON.stringify(statusData).substring(0, 300)}`)
        }
        // status === 'IN_QUEUE' | 'IN_PROGRESS' — keep polling
    }
    if (attempts >= maxAttempts) throw new Error('fal.ai polling timed out after 4 minutes')

    // Fetch result
    const resultRes = await fetch(resultUrl, { headers, signal: AbortSignal.timeout(15_000) })
    if (!resultRes.ok) throw new Error(`fal.ai result fetch ${resultRes.status}`)
    const result = await resultRes.json() as {
        images?: Array<{ url: string; width: number; height: number; content_type?: string }>
        seed?: number
        prompt?: string
        has_nsfw_concepts?: boolean[]
    }

    if (!Array.isArray(result.images) || result.images.length === 0) {
        throw new Error('fal.ai returned no images: ' + JSON.stringify(result).substring(0, 300))
    }

    const perImageCost = estimateCost(model, opts.width, opts.height)
    return result.images.map((img, i) => ({
        url: img.url,
        width: img.width,
        height: img.height,
        seed: (result.seed || 0) + i,
        costUsd: perImageCost,
    }))
}