/**
 * fal.ai client — multi-model image generation (April 2026 catalog).
 *
 * Each model has its own endpoint slug, request body shape, and cost model.
 * Dispatch happens in `generateImages({ model, ... })` — one public entry.
 *
 * Supported models (per April 2026 research — see project_media_pipeline.md):
 *   flux-2-pro       fal-ai/flux-2-pro                     $0.03/MP  DEFAULT
 *   flux-pro-1.1     fal-ai/flux-pro/v1.1                  $0.04/MP  legacy
 *   flux-schnell     fal-ai/flux/schnell                   $0.003/MP cheap drafts
 *   nano-banana-pro  fal-ai/nano-banana-pro                ~$0.15/img Hebrew/typography
 *   seedream-4.5     fal-ai/bytedance/seedream/v4.5/text-to-image  $0.03/img cinematic
 *   ideogram-v3      fal-ai/ideogram/v3                    $0.03-$0.09 English typography
 *
 * Auth: `Key {FAL_KEY}` header. Queue API with polling (status → response).
 */

export type FalImageModel =
    | 'flux-2-pro'
    | 'flux-pro-1.1'
    | 'flux-schnell'
    | 'nano-banana-pro'
    | 'seedream-4.5'
    | 'ideogram-v3'

export interface FalGenerateImageOpts {
    apiKey: string
    prompt: string
    negativePrompt?: string
    width: number
    height: number
    numImages?: number
    model?: FalImageModel
    seed?: number
    safety?: boolean
}

export interface FalImageResult {
    url: string
    width: number
    height: number
    seed: number
    costUsd: number
}

interface ModelSpec {
    endpoint: string
    // Build the request body. May use any param shape the model expects.
    buildBody: (opts: FalGenerateImageOpts) => Record<string, unknown>
    // Parse the final result into FalImageResult[]. Defaults to standard shape.
    parseResult?: (data: unknown, opts: FalGenerateImageOpts) => FalImageResult[]
    // Per-image cost estimator (takes width/height; returns USD)
    estimateCost: (w: number, h: number) => number
}

function costByMP(rate: number) {
    return (w: number, h: number) => rate * ((w * h) / 1_000_000)
}

// Map aspect ratio to fal.ai aspect_ratio strings used by newer models
function aspectKey(w: number, h: number): string {
    const r = w / h
    if (Math.abs(r - 1) < 0.05) return '1:1'
    if (Math.abs(r - 4 / 5) < 0.05) return '4:5'
    if (Math.abs(r - 16 / 9) < 0.05) return '16:9'
    if (Math.abs(r - 9 / 16) < 0.05) return '9:16'
    if (Math.abs(r - 3 / 2) < 0.05) return '3:2'
    if (Math.abs(r - 2 / 3) < 0.05) return '2:3'
    if (Math.abs(r - 1.91) < 0.1) return '16:9' // FB feed — nearest common
    return '1:1'
}

const MODELS: Record<FalImageModel, ModelSpec> = {
    'flux-2-pro': {
        endpoint: 'fal-ai/flux-2-pro',
        buildBody: (o) => {
            const body: Record<string, unknown> = {
                prompt: o.prompt,
                image_size: { width: o.width, height: o.height },
                num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
                output_format: 'jpeg',
                enable_safety_checker: o.safety !== false,
            }
            if (o.negativePrompt) body.negative_prompt = o.negativePrompt
            if (typeof o.seed === 'number') body.seed = o.seed
            return body
        },
        estimateCost: costByMP(0.03),
    },
    'flux-pro-1.1': {
        endpoint: 'fal-ai/flux-pro/v1.1',
        buildBody: (o) => {
            const body: Record<string, unknown> = {
                prompt: o.prompt,
                image_size: { width: o.width, height: o.height },
                num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
                num_inference_steps: 28,
                guidance_scale: 3.5,
                output_format: 'jpeg',
                enable_safety_checker: o.safety !== false,
            }
            if (o.negativePrompt) body.negative_prompt = o.negativePrompt
            if (typeof o.seed === 'number') body.seed = o.seed
            return body
        },
        estimateCost: costByMP(0.04),
    },
    'flux-schnell': {
        endpoint: 'fal-ai/flux/schnell',
        buildBody: (o) => ({
            prompt: o.prompt,
            image_size: { width: o.width, height: o.height },
            num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
            num_inference_steps: 4,
            output_format: 'jpeg',
            enable_safety_checker: o.safety !== false,
            ...(typeof o.seed === 'number' ? { seed: o.seed } : {}),
        }),
        estimateCost: costByMP(0.003),
    },
    'nano-banana-pro': {
        // Google Gemini 3 Pro Image wrapped by fal — supports Hebrew + 100 langs
        endpoint: 'fal-ai/nano-banana-pro',
        buildBody: (o) => ({
            prompt: o.prompt,
            aspect_ratio: aspectKey(o.width, o.height),
            num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
            resolution: o.width >= 2048 || o.height >= 2048 ? '4K' : o.width >= 1024 || o.height >= 1024 ? '2K' : '1K',
            output_format: 'jpeg',
        }),
        // Flat cost per image — 1K/2K ~$0.15, 4K ~$0.24
        estimateCost: (w, h) => (w >= 2048 || h >= 2048) ? 0.24 : 0.15,
    },
    'seedream-4.5': {
        endpoint: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
        buildBody: (o) => ({
            prompt: o.prompt,
            image_size: `${o.width}x${o.height}`,
            num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
            ...(typeof o.seed === 'number' ? { seed: o.seed } : {}),
        }),
        estimateCost: () => 0.03,
    },
    'ideogram-v3': {
        endpoint: 'fal-ai/ideogram/v3',
        buildBody: (o) => ({
            prompt: o.prompt,
            aspect_ratio: aspectKey(o.width, o.height),
            num_images: Math.min(Math.max(o.numImages || 1, 1), 4),
            rendering_speed: 'BALANCED', // TURBO | BALANCED | QUALITY
            ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
            ...(typeof o.seed === 'number' ? { seed: o.seed } : {}),
        }),
        estimateCost: () => 0.06,
    },
}

/** Shared queue-poll helper — most fal.ai models return the same shape. */
async function submitAndPoll(
    endpoint: string,
    body: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
    }

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
    const submitData = await submitRes.json() as { request_id?: string; status_url?: string; response_url?: string }
    const requestId = submitData.request_id
    if (!requestId) throw new Error('fal.ai did not return request_id: ' + JSON.stringify(submitData).substring(0, 200))

    const statusUrl = submitData.status_url || `https://queue.fal.run/${endpoint}/requests/${requestId}/status`
    const resultUrl = submitData.response_url || `https://queue.fal.run/${endpoint}/requests/${requestId}`

    // Most models 8-60s; Nano Banana Pro at 4K can take 60-120s. Poll up to 5 min.
    const maxAttempts = 150
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const sRes = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(10_000) })
        if (!sRes.ok) continue
        const sData = await sRes.json() as { status?: string }
        if (sData.status === 'COMPLETED') break
        if (sData.status === 'FAILED') {
            throw new Error(`fal.ai generation failed: ${JSON.stringify(sData).substring(0, 300)}`)
        }
    }

    const resultRes = await fetch(resultUrl, { headers, signal: AbortSignal.timeout(15_000) })
    if (!resultRes.ok) throw new Error(`fal.ai result fetch ${resultRes.status}`)
    return await resultRes.json()
}

/** Generic parser — fal.ai models mostly return { images: [{ url, width, height }] } */
function defaultParse(data: unknown, opts: FalGenerateImageOpts, costPerImage: number): FalImageResult[] {
    const d = data as {
        images?: Array<{ url: string; width?: number; height?: number }>
        seed?: number
    }
    if (!Array.isArray(d.images) || d.images.length === 0) {
        throw new Error('fal.ai returned no images: ' + JSON.stringify(data).substring(0, 300))
    }
    return d.images.map((img, i) => ({
        url: img.url,
        width: img.width || opts.width,
        height: img.height || opts.height,
        seed: (d.seed || 0) + i,
        costUsd: costPerImage,
    }))
}

/**
 * Generate one batch of images from fal.ai. Routes to the right endpoint
 * based on `opts.model`. Returns URLs on fal.ai CDN (valid ~7 days).
 * Caller must download + persist for long-term storage (we SFTP to the
 * client's VPS — see mediaOrchestrator).
 */
export async function generateImages(opts: FalGenerateImageOpts): Promise<FalImageResult[]> {
    if (!opts.apiKey) throw new Error('fal.ai API key missing')
    if (!opts.prompt) throw new Error('prompt required')

    const model = opts.model || 'flux-2-pro'
    const spec = MODELS[model]
    if (!spec) throw new Error(`Unsupported model: ${model}`)

    const body = spec.buildBody(opts)
    const raw = await submitAndPoll(spec.endpoint, body, opts.apiKey)

    const costPerImage = spec.estimateCost(opts.width, opts.height)
    const parser = spec.parseResult || ((d: unknown, o: FalGenerateImageOpts) => defaultParse(d, o, costPerImage))
    return parser(raw, opts)
}