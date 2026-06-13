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

// A model returned by the provider's /v1/models endpoint, classified against
// our registry. `isNewer` = a model in a family (opus/sonnet/haiku) whose
// version exceeds what the registry currently pins for that family — i.e. a
// candidate the admin should review + apply.
interface DiscoveredModel {
    id: string
    family: string          // 'opus' | 'sonnet' | 'haiku' | 'other'
    version: number         // major*1000 + minor, for comparison
    versionLabel: string    // e.g. '4.8'
    inRegistry: boolean
    isNewer: boolean
    createdAt?: string
}

let lastCheckResults: ModelCheckResult[] = []
let lastDiscovered: DiscoveredModel[] = []
let lastDiscoveryAt = ''
const alertedNewModelIds = new Set<string>()

// claude-opus-4-8 → {family:'opus', major:4, minor:8}. Handles the three id shapes:
//   claude-opus-4-8                 → 4.8
//   claude-haiku-4-5-20251001       → 4.5  (trailing 8-digit date snapshot)
//   claude-opus-4-20250514          → 4.0  (legacy .0 release; the group after the
//                                            major IS the date, not a minor version)
// A numeric group ≥5 digits is a date, not a minor — otherwise "4-20250514" would
// parse as minor 20250514 and falsely flag the original 4.0 model as "newer".
function parseClaudeId(id: string): { family: string; major: number; minor: number } | null {
    const m = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/.exec(id)
    if (!m) return null
    const minor = m[3].length >= 5 ? 0 : parseInt(m[3], 10)
    return { family: m[1], major: parseInt(m[2], 10), minor }
}
const verNum = (major: number, minor: number) => major * 1000 + minor

// Highest version per claude family currently pinned in the registry.
function registryMaxByFamily(): Record<string, number> {
    const max: Record<string, number> = {}
    for (const def of Object.values(MODEL_REGISTRY)) {
        if (def.provider !== 'anthropic') continue
        const p = parseClaudeId(def.id)
        if (!p) continue
        const v = verNum(p.major, p.minor)
        if (v > (max[p.family] ?? -1)) max[p.family] = v
    }
    return max
}

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
 * Discover NEW models via the provider /v1/models endpoint.
 *
 * The availability check above only tells us "is my pinned model still alive" —
 * it stays green forever while a stale-but-working model (Opus 4.7 when 4.8 ships)
 * rots. This is the forward-looking half: list what the provider actually offers,
 * flag any claude family version newer than the registry pins, and alert the admin
 * to review/apply via Admin → Models. We never auto-switch — picking which tier a
 * brand-new model belongs to is a human judgment call.
 */
async function fetchAnthropicModelList(): Promise<Array<{ id: string; created_at?: string }>> {
    const key = process.env.ANTHROPIC_API_KEY || ''
    if (!key) return []
    try {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        })
        if (!res.ok) return []
        const data = await res.json() as { data?: Array<{ id: string; created_at?: string }> }
        return data.data || []
    } catch (err) {
        console.warn('[modelMonitor] /v1/models fetch failed:', String(err).substring(0, 100))
        return []
    }
}

async function discoverNewModels(): Promise<void> {
    const list = await fetchAnthropicModelList()
    if (!list.length) return

    const regMax = registryMaxByFamily()
    const discovered: DiscoveredModel[] = []

    for (const m of list) {
        const p = parseClaudeId(m.id)
        const family = p ? p.family : 'other'
        const version = p ? verNum(p.major, p.minor) : 0
        const versionLabel = p ? `${p.major}.${p.minor}` : ''
        const inRegistry = !!MODEL_REGISTRY[m.id]
        const isNewer = !!p && version > (regMax[family] ?? -1)
        discovered.push({ id: m.id, family, version, versionLabel, inRegistry, isNewer, createdAt: m.created_at })
    }

    discovered.sort((a, b) => (b.version - a.version) || a.id.localeCompare(b.id))
    lastDiscovered = discovered
    lastDiscoveryAt = new Date().toISOString()

    // Alert once per newly-seen newer model.
    const freshNewer = discovered.filter(d => d.isNewer && !alertedNewModelIds.has(d.id))
    if (freshNewer.length) {
        freshNewer.forEach(d => alertedNewModelIds.add(d.id))
        await alertNewModels(freshNewer, regMax)
    }
}

async function alertNewModels(models: DiscoveredModel[], regMax: Record<string, number>): Promise<void> {
    if (!ADMIN_BOT_TOKEN || !ADMIN_CHAT_ID) return
    const familyLabel = (fam: string) => {
        const v = regMax[fam]
        if (v == null) return '(none in registry)'
        return `${Math.floor(v / 1000)}.${v % 1000}`
    }
    const lines = models.map(d =>
        `🆕 ${d.id} (${d.family} ${d.versionLabel}) — registry pins ${d.family}=${familyLabel(d.family)}`
    )
    const message = `🆕 *New model(s) available*\n\n${lines.join('\n')}\n\n` +
        `Review + apply linkage in *Admin → Models* (no deploy needed).`
    try {
        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: message, parse_mode: 'Markdown' }),
        })
    } catch (err) {
        console.error('Failed to send new-model alert:', err)
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

    // Forward-looking: detect newer models the registry hasn't adopted yet.
    try {
        await discoverNewModels()
        const newer = lastDiscovered.filter(d => d.isNewer).length
        console.log(`Model discovery: ${lastDiscovered.length} models listed, ${newer} newer than registry`)
    } catch (err) {
        console.warn('Model discovery failed:', String(err).substring(0, 120))
    }
}

/**
 * Get last check results (for admin API)
 */
export function getModelHealth(): ModelCheckResult[] {
    return lastCheckResults
}

/**
 * Get last /v1/models discovery (for Admin → Models). `newer` are candidates
 * the admin should review and apply to a tier.
 */
export function getModelDiscovery(): { models: DiscoveredModel[]; discoveredAt: string } {
    return { models: lastDiscovered, discoveredAt: lastDiscoveryAt }
}

/** Force a discovery pass now (admin "refresh" button). */
export async function refreshModelDiscovery(): Promise<{ models: DiscoveredModel[]; discoveredAt: string }> {
    await discoverNewModels()
    return getModelDiscovery()
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