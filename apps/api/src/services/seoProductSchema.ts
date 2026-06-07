/**
 * seo.product_schema — Product + Offer JSON-LD for WooCommerce product pages,
 * built from REAL WooCommerce data (never LLM-guessed). Deterministic → fast,
 * reliable, no fabrication. Writes the full @graph to `_clawflow_schema_jsonld`
 * (companion v1.12.0+ registers it for the `product` post type + renders it in
 * <head> on single-product pages, suppressing Yoast's competing graph).
 *
 * Why a dedicated capability: seoSchemaBatch only scans posts/pages and emits
 * Article/WebPage/FAQ schema — it can't produce Product+Offer with real price /
 * availability / rating. Google Product rich results need: name + image +
 * offers(price, priceCurrency, availability). aggregateRating is added ONLY when
 * the product has real reviews (rating_count > 0) — fabricated ratings risk a
 * Google structured-data manual action.
 *
 * Refs: https://developers.google.com/search/docs/appearance/structured-data/product
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { loadWpConfig } from '@/services/seoMetaBatch'

const MAX_PRODUCTS = 300            // safety cap per run
const PER_PAGE = 100

export interface ProductSchemaResult {
    status: 'ok' | 'no_store' | 'no_products' | 'error'
    reason?: string
    scanned?: number
    updated?: number
    skipped?: number
    failures?: number
    dryRun?: boolean
    samples?: Array<{ id: number; name: string; price: string; availability: string; hasRating: boolean }>
    errors?: string[]
}

interface WpCfg { url: string; user: string; appPassword: string }

function stripHtml(s: string): string {
    return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

const AVAILABILITY: Record<string, string> = {
    instock: 'https://schema.org/InStock',
    outofstock: 'https://schema.org/OutOfStock',
    onbackorder: 'https://schema.org/BackOrder',
}

async function wcGet(cfg: WpCfg, path: string): Promise<any> {
    const base = cfg.url.replace(/\/+$/, '')
    const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
    const r = await fetch(`${base}${path}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) })
    if (!r.ok) throw new Error(`WC GET ${path} → ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`)
    return r.json()
}

/** Build the Product+Offer @graph from one WooCommerce product object. */
function buildProductGraph(p: any, ctx: { base: string; orgId: string; orgName: string; currency: string }): Record<string, unknown> {
    const { base, orgId, orgName, currency } = ctx
    const priceStr = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '' }
    const current = priceStr(p.sale_price) || priceStr(p.price) || priceStr(p.regular_price)
    const images = Array.isArray(p.images) ? p.images.map((i: any) => i?.src).filter(Boolean) : []
    const availability = AVAILABILITY[p.stock_status] || 'https://schema.org/InStock'
    const ratingCount = Number(p.rating_count) || 0
    const avgRating = Number(p.average_rating) || 0

    // Offer (simple) or AggregateOffer (variable — lowPrice from the displayed min).
    let offers: Record<string, unknown> | undefined
    if (current) {
        if (p.type === 'variable') {
            offers = {
                '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: current,
                availability, url: p.permalink, itemCondition: 'https://schema.org/NewCondition',
                seller: { '@id': orgId },
            }
        } else {
            offers = {
                '@type': 'Offer', url: p.permalink, price: current, priceCurrency: currency,
                availability, itemCondition: 'https://schema.org/NewCondition', seller: { '@id': orgId },
            }
            if (p.on_sale && p.date_on_sale_to) (offers as any).priceValidUntil = String(p.date_on_sale_to).slice(0, 10)
        }
    }

    const product: Record<string, unknown> = {
        '@type': 'Product',
        '@id': `${p.permalink}#product`,
        name: stripHtml(p.name),
        url: p.permalink,
        brand: { '@type': 'Brand', name: orgName },
    }
    const desc = stripHtml(p.short_description) || stripHtml(p.description)
    if (desc) product.description = desc.slice(0, 320)
    if (images.length) product.image = images
    if (p.sku) product.sku = String(p.sku)
    if (offers) product.offers = offers
    if (ratingCount > 0 && avgRating > 0) {
        product.aggregateRating = { '@type': 'AggregateRating', ratingValue: avgRating.toFixed(1), reviewCount: String(ratingCount) }
    }

    // Breadcrumb: Home → [category if it has a real URL] → product. EVERY
    // ListItem MUST carry `item` (a URL) or Google flags "Missing field 'item'
    // in itemListElement" (critical). The category crumb is added only when we
    // can build a concrete URL from its slug; otherwise skip it (Home→Product is
    // valid) rather than emit an item-less ListItem.
    const cat = Array.isArray(p.categories) && p.categories[0] ? p.categories[0] : null
    const crumbs: any[] = [{ '@type': 'ListItem', position: 1, name: orgName, item: base + '/' }]
    if (cat?.name && cat?.slug) {
        crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: stripHtml(cat.name), item: `${base}/product-category/${cat.slug}/` })
    }
    crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: stripHtml(p.name), item: p.permalink })

    return {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'Organization', '@id': orgId, name: orgName, url: base + '/' },
            { '@type': 'BreadcrumbList', itemListElement: crumbs },
            product,
        ],
    }
}

async function writeProductSchema(cfg: WpCfg, id: number, jsonLd: string): Promise<boolean> {
    const base = cfg.url.replace(/\/+$/, '')
    const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
    const res = await fetch(`${base}/wp-json/wp/v2/product/${id}`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { _clawflow_schema_jsonld: jsonLd } }), signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`write #${id} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
    // verify persisted (companion must have 'product' registered — v1.12.0+)
    const check = await fetch(`${base}/wp-json/wp/v2/product/${id}?context=edit&_fields=meta`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20000) })
    const j = await check.json().catch(() => ({})) as any
    return ((j?.meta || {})._clawflow_schema_jsonld as string || '') === jsonLd
}

export async function runProductSchema(agent: MatehAgentRow, opts: { dryRun?: boolean } = {}): Promise<ProductSchemaResult> {
    const dryRun = !!opts.dryRun
    const instanceId = agent.vpsInstanceId
    const wp = await loadWpConfig(instanceId, agent.id) as WpCfg | null
    if (!wp) return { status: 'no_store', reason: 'wordpress_not_connected' }
    const base = wp.url.replace(/\/+$/, '')
    const rd: any = agent.researchData || {}
    const orgName = rd.answers?.businessName || agent.name || 'Store'
    const orgId = base + '/#organization'

    let currency = 'ILS'
    try {
        const cur = await wcGet(wp, '/wp-json/wc/v3/settings/general/woocommerce_currency')
        if (cur?.value) currency = String(cur.value)
    } catch { /* default ILS */ }

    // paginate products
    const products: any[] = []
    for (let page = 1; products.length < MAX_PRODUCTS; page++) {
        let batch: any[]
        try {
            batch = await wcGet(wp, `/wp-json/wc/v3/products?per_page=${PER_PAGE}&page=${page}&status=publish&_fields=id,name,permalink,sku,type,price,regular_price,sale_price,on_sale,date_on_sale_to,stock_status,short_description,description,images,average_rating,rating_count,categories`)
        } catch (e) { if (page === 1) return { status: 'error', reason: `products_fetch: ${(e as Error).message}` }; break }
        if (!Array.isArray(batch) || !batch.length) break
        products.push(...batch)
        if (batch.length < PER_PAGE) break
    }
    if (!products.length) return { status: 'no_products', reason: 'no published products' }

    const ctx = { base, orgId, orgName, currency }
    let updated = 0, skipped = 0, failures = 0
    const errors: string[] = []
    const samples: ProductSchemaResult['samples'] = []
    for (const p of products.slice(0, MAX_PRODUCTS)) {
        try {
            const graph = buildProductGraph(p, ctx)
            const jsonLd = JSON.stringify(graph)
            const offer: any = (graph['@graph'] as any[]).find(n => n['@type'] === 'Product')?.offers
            if (samples.length < 6) samples.push({ id: p.id, name: stripHtml(p.name).slice(0, 30), price: offer?.price || offer?.lowPrice || '—', availability: (offer?.availability || '').split('/').pop() || '—', hasRating: Number(p.rating_count) > 0 })
            if (dryRun) { updated++; continue }
            const ok = await writeProductSchema(wp, p.id, jsonLd)
            if (ok) updated++
            else { skipped++; if (errors.length < 5) errors.push(`#${p.id}: not persisted (companion 'product' meta not registered? need v1.12.0)`) }
        } catch (e) { failures++; if (errors.length < 5) errors.push(`#${p.id}: ${(e as Error).message}`) }
    }
    console.log(`[seoProductSchema] ${agent.id}: ${dryRun ? 'DRY ' : ''}products=${products.length} updated=${updated} skipped=${skipped} failures=${failures}`)
    return { status: 'ok', scanned: products.length, updated, skipped, failures, dryRun, samples, errors: errors.length ? errors : undefined }
}

export async function runProductSchemaForAgent(agentId: string, opts: { dryRun?: boolean } = {}): Promise<ProductSchemaResult> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    if (!agent) return { status: 'error', reason: `agent_not_found:${agentId}` }
    return runProductSchema(agent, opts)
}