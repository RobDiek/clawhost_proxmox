/**
 * Shopify SEO sweep — platform-parity for the internal-SEO baseline on Shopify
 * stores. v1: generates a unique SEO title + meta description for every product
 * with weak/empty SEO and writes them via the Admin API ([[shopify]]).
 *
 * Same shape + guarantees as the WordPress sweep: idempotent (products with good
 * SEO are skipped), dryRun for preview, approval-gated by the caller. The SEO
 * GENERATION is the same platform-agnostic quality bar; only the WRITER differs.
 *
 * NOTE: needs a real Shopify store + Admin API token to live-verify (no test
 * store available at build time). Pages/collections/articles + image alt +
 * JSON-LD are v2 (theme/version-dependent).
 */
import { loadShopifyConfig, probeShopify, listProducts, updateProductSeo, type ShopifyProduct } from '@/services/shopify'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const WEAK_DESC = 70   // seo.description shorter than this = weak
const MAX_PER_RUN = 100

export interface ShopifySeoResult {
    ok: boolean
    integrationMissing: boolean
    shopName?: string
    scanned: number
    candidates: number
    updated: Array<{ id: string; handle: string; seoTitle: string; seoDescription: string }>
    failures: Array<{ id: string; error: string }>
    error?: string
}

function isWeak(p: ShopifyProduct): boolean {
    return (p.seoTitle || '').trim().length < 10 || (p.seoDescription || '').trim().length < WEAK_DESC
}

/** Generate {title, description} for a chunk of products in one call. */
async function generateChunk(apiKey: string, model: string, businessName: string, items: ShopifyProduct[]): Promise<Map<string, { title: string; description: string }>> {
    const out = new Map<string, { title: string; description: string }>()
    const list = items.map(p => ({ id: p.id, name: p.title, snippet: p.descriptionPlain.slice(0, 300) }))
    const prompt = `אתם עורך SEO של חנות ${businessName}. עבור כל מוצר, כתבו כותרת SEO ותיאור meta בעברית.

## חוקים
- "title": כותרת SEO עד 60 תווים — שם המוצר + ערך/קטגוריה. בלי שם החנות בסוף (מתווסף אוטומטית).
- "description": תיאור meta 140-155 תווים — מפתה לקליק, כולל מילת מפתח טבעית, פנייה בלשון רבים. בלי גרשיים כפולים, בלי שורות חדשות.
- 100% עברית (חוץ משמות מותג). אל תמציאו מאפיינים שלא בתיאור.

## מוצרים
${JSON.stringify(list, null, 2)}

## תפוקה — JSON בלבד
{ "items": [ { "id": "<gid>", "title": "<≤60>", "description": "<140-155>" } ] }`
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(120000),
        })
        if (!res.ok) return out
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        const f = text.indexOf('{'), l = text.lastIndexOf('}')
        if (f < 0 || l < 0) return out
        const parsed = JSON.parse(text.slice(f, l + 1)) as { items?: Array<{ id?: string; title?: string; description?: string }> }
        for (const it of parsed.items || []) {
            if (it.id && it.title && it.description) out.set(it.id, { title: it.title.slice(0, 60), description: it.description.slice(0, 160) })
        }
    } catch { /* partial generation is fine */ }
    return out
}

export async function runShopifySeoSweep(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; limit?: number } = {},
): Promise<ShopifySeoResult> {
    const result: ShopifySeoResult = { ok: false, integrationMissing: false, scanned: 0, candidates: 0, updated: [], failures: [] }
    const cfg = await loadShopifyConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    const probe = await probeShopify(cfg)
    if (!probe.ok) { result.error = `Shopify auth failed: ${probe.error}`; return result }
    result.shopName = probe.shopName

    const { products, error } = await listProducts(cfg)
    if (error && products.length === 0) { result.error = `Shopify list failed: ${error}`; return result }
    result.scanned = products.length

    const weak = products.filter(isWeak).slice(0, Math.min(opts.limit || MAX_PER_RUN, MAX_PER_RUN))
    result.candidates = weak.length
    if (weak.length === 0) { result.ok = true; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || probe.shopName || 'החנות'

    for (let i = 0; i < weak.length; i += 8) {
        const chunk = weak.slice(i, i + 8)
        const gen = await generateChunk(apiKey, model, businessName, chunk)
        for (const p of chunk) {
            const seo = gen.get(p.id)
            if (!seo) { result.failures.push({ id: p.id, error: 'no SEO generated' }); continue }
            if (!opts.dryRun) {
                const w = await updateProductSeo(cfg, p.id, { title: seo.title, description: seo.description })
                if (!w.ok) { result.failures.push({ id: p.id, error: w.error || 'write failed' }); continue }
            }
            result.updated.push({ id: p.id, handle: p.handle, seoTitle: seo.title, seoDescription: seo.description })
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}