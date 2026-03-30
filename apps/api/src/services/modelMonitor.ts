/**
 * Model Monitor Service
 *
 * Daily health check of AI model availability.
 * Alerts admin via Telegram if models are unavailable.
 * Auto-fallback chain when model fails at runtime.
 */

import { MODEL_REGISTRY, getFallbackModel, type ModelDef } from '@openclaw/shared'

const CHECK_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours
const ADMIN_CHAT_ID = process.env.TELEGRAM_SUPPORT_CHAT_ID || ''
const ADMIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

interface ModelCheckResult {
    modelId: string
    provider: string
    available: boolean
    latencyMs: number
    error?: string
    checkedAt: string
}

let lastCheckResults: ModelCheckResult[] = []

/**
 * Check if an Anthropic model is available
 */
async function checkAnthropicModel(modelId: string, apiKey?: string): Promise<ModelCheckResult> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY || ''
    const start = Date.now()

    if (!key) {
        return { modelId, provider: 'anthropic', available: false, latencyMs: 0, error: 'no_api_key', checkedAt: new Date().toISOString() }
    }

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: 5,
                messages: [{ role: 'user', content: 'ping' }],
            }),
        })

        const latency = Date.now() - start
        const data = await res.json() as { type?: string; error?: { type?: string; message?: string } }

        // 200 = ok, 400 with "credit balance" = model exists but no credits
        if (res.ok) {
            return { modelId, provider: 'anthropic', available: true, latencyMs: latency, checkedAt: new Date().toISOString() }
        }

        if (data.error?.message?.includes('credit balance')) {
            // Model exists, just no credits — it's available
            return { modelId, provider: 'anthropic', available: true, latencyMs: latency, error: 'no_credits', checkedAt: new Date().toISOString() }
        }

        if (data.error?.type === 'not_found_error' || res.status === 404) {
            return { modelId, provider: 'anthropic', available: false, latencyMs: latency, error: 'model_not_found', checkedAt: new Date().toISOString() }
        }

        // Rate limit = model exists
        if (res.status === 429) {
            return { modelId, provider: 'anthropic', available: true, latencyMs: latency, error: 'rate_limited', checkedAt: new Date().toISOString() }
        }

        return { modelId, provider: 'anthropic', available: true, latencyMs: latency, error: `status_${res.status}`, checkedAt: new Date().toISOString() }
    } catch (err) {
        return { modelId, provider: 'anthropic', available: false, latencyMs: Date.now() - start, error: String(err).substring(0, 100), checkedAt: new Date().toISOString() }
    }
}

/**
 * Check if an OpenAI model is available
 */
async function checkOpenAIModel(modelId: string, apiKey?: string): Promise<ModelCheckResult> {
    const key = apiKey || process.env.OPENAI_API_KEY || ''
    const start = Date.now()

    if (!key) {
        return { modelId, provider: 'openai', available: false, latencyMs: 0, error: 'no_api_key', checkedAt: new Date().toISOString() }
    }

    try {
        // Check model exists via /models endpoint (doesn't cost tokens)
        const res = await fetch(`https://api.openai.com/v1/models/${modelId}`, {
            headers: { 'Authorization': `Bearer ${key}` },
        })

        const latency = Date.now() - start

        if (res.ok) {
            return { modelId, provider: 'openai', available: true, latencyMs: latency, checkedAt: new Date().toISOString() }
        }

        if (res.status === 404) {
            return { modelId, provider: 'openai', available: false, latencyMs: latency, error: 'model_not_found', checkedAt: new Date().toISOString() }
        }

        return { modelId, provider: 'openai', available: true, latencyMs: latency, error: `status_${res.status}`, checkedAt: new Date().toISOString() }
    } catch (err) {
        return { modelId, provider: 'openai', available: false, latencyMs: Date.now() - start, error: String(err).substring(0, 100), checkedAt: new Date().toISOString() }
    }
}

/**
 * Run health check on all registered models
 */
async function checkAllModels(): Promise<ModelCheckResult[]> {
    const results: ModelCheckResult[] = []

    for (const model of Object.values(MODEL_REGISTRY)) {
        let result: ModelCheckResult

        if (model.provider === 'anthropic') {
            result = await checkAnthropicModel(model.id)
        } else if (model.provider === 'openai') {
            result = await checkOpenAIModel(model.id)
        } else {
            result = {
                modelId: model.id,
                provider: model.provider,
                available: true, // Assume local/other models are available
                latencyMs: 0,
                checkedAt: new Date().toISOString(),
            }
        }

        results.push(result)
    }

    return results
}

/**
 * Alert admin via Telegram about unavailable models
 */
async function alertAdmin(unavailable: ModelCheckResult[]): Promise<void> {
    if (!ADMIN_BOT_TOKEN || !ADMIN_CHAT_ID || unavailable.length === 0) return

    const lines = unavailable.map(r =>
        `❌ ${r.modelId} (${r.provider}): ${r.error || 'unavailable'}`
    )

    const message = `⚠️ *Model Health Alert*\n\n${lines.join('\n')}\n\n` +
        `Checked at: ${new Date().toISOString()}\n` +
        `Action: Update model IDs in packages/shared/src/models.ts`

    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
            }),
        })
    } catch (err) {
        console.error('Failed to send model alert:', err)
    }
}

/**
 * Run scheduled model health check
 */
async function runModelCheck(): Promise<void> {
    console.log('Model health check starting...')
    const results = await checkAllModels()
    lastCheckResults = results

    const unavailable = results.filter(r => !r.available && r.error !== 'no_api_key')

    if (unavailable.length > 0) {
        console.warn(`Model health: ${unavailable.length} models unavailable:`,
            unavailable.map(r => `${r.modelId}:${r.error}`).join(', '))
        await alertAdmin(unavailable)
    } else {
        console.log(`Model health: all ${results.length} models OK`)
    }
}

/**
 * Get last check results (for admin API)
 */
export function getModelHealth(): ModelCheckResult[] {
    return lastCheckResults
}

/**
 * Try calling a model with auto-fallback
 */
export async function callWithFallback(
    primaryModelId: string,
    callFn: (modelId: string) => Promise<{ ok: boolean; data?: unknown; error?: string }>
): Promise<{ modelId: string; data?: unknown; error?: string }> {
    // Try primary
    const primaryResult = await callFn(primaryModelId)
    if (primaryResult.ok) {
        return { modelId: primaryModelId, data: primaryResult.data }
    }

    // Try fallback chain
    let currentId = primaryModelId
    while (true) {
        const fallback = getFallbackModel(currentId)
        if (!fallback) break

        console.log(`Model fallback: ${currentId} → ${fallback.id} (reason: ${primaryResult.error})`)
        const fallbackResult = await callFn(fallback.id)
        if (fallbackResult.ok) {
            return { modelId: fallback.id, data: fallbackResult.data }
        }

        currentId = fallback.id
    }

    return { modelId: primaryModelId, error: primaryResult.error || 'all_models_failed' }
}

/**
 * Start the model monitoring service
 */
export function startModelMonitor(): void {
    console.log(`Model monitor started (interval: ${CHECK_INTERVAL / 1000}s)`)

    // First check after 30 seconds (let API boot)
    setTimeout(() => runModelCheck(), 30000)

    // Then every 6 hours
    setInterval(() => runModelCheck(), CHECK_INTERVAL)
}
