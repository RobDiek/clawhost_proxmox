/**
 * Shopify Admin API client + SEO writers.
 *
 * Platform parity for the internal-SEO sweep: WordPress is covered by the
 * companion plugin; Shopify is covered here via the Admin GraphQL API. The SEO
 * GENERATION logic stays platform-agnostic — this module is just the WRITER
 * (the "SiteWriter" for Shopify).
 *
 * Auth: a per-store Admin API access token (custom app, scopes read_products /
 * write_products). Stored in agent_integrations (integrationType 'shopify') as
 * { shopDomain, accessToken, apiVersion? } — same store as wordpress/github.
 *
 * v1 scope: product SEO title + meta description (the bulk of an ecom store's
 * on-page SEO, cleanly supported by the `seo` field). Pages/collections/articles
 * + image alt + JSON-LD are v2 (theme/version-dependent).
 */
import { db } from '@/db'
import { agentIntegrations } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

export interface ShopifyCfg { shopDomain: string; accessToken: string; apiVersion: string }

const DEFAULT_API_VERSION = '2024-10'

/** Load a tenant's Shopify config (agent-scoped first, then instance). */
export async function loadShopifyConfig(instanceId: string, agentId?: string | null): Promise<ShopifyCfg | null> {
    const rows = await db.select().from(agentIntegrations).where(and(
        eq(agentIntegrations.instanceId, instanceId),
        eq(agentIntegrations.integrationType, 'shopify'),
    ))
    if (rows.length === 0) return null
    const match = (agentId ? rows.find(r => r.agentId === agentId) : undefined) || rows[0]
    const cfg = (match.config as Record<string, unknown> | null) || {}
    const shopDomainRaw = (typeof cfg.shopDomain === 'string' ? cfg.shopDomain : '') || (typeof cfg.shop === 'string' ? cfg.shop : '')
    const accessToken = (typeof cfg.accessToken === 'string' ? cfg.accessToken : '') || (typeof cfg.token === 'string' ? cfg.token : '')
    if (!shopDomainRaw || !accessToken) return null
    // Normalize: accept "shop", "shop.myshopify.com", "https://shop.myshopify.com".
    let shopDomain = shopDomainRaw.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!/\.myshopify\.com$/i.test(shopDomain)) shopDomain = `${shopDomain.replace(/\..*$/, '')}.myshopify.com`
    return { shopDomain, accessToken, apiVersion: (typeof cfg.apiVersion === 'string' && cfg.apiVersion) || DEFAULT_API_VERSION }
}

export interface ShopifyGqlResult<T = unknown> { ok: boolean; data?: T; errors?: string[]; status: number }

/** Single Admin GraphQL call. */
export async function shopifyGraphQL<T = unknown>(cfg: ShopifyCfg, query: string, variables?: Record<string, unknown>): Promise<ShopifyGqlResult<T>> {
    try {
        const res = await fetch(`https://${cfg.shopDomain}/admin/api/${cfg.apiVersion}/graphql.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.accessToken },
            body: JSON.stringify({ query, variables: variables || {} }),
            signal: AbortSignal.timeout(30000),
        })
        const j = await res.json().catch(() => null) as { data?: T; errors?: Array<{ message?: string }> } | null
        if (!res.ok) return { ok: false, status: res.status, errors: [`HTTP ${res.status}`, ...(j?.errors || []).map(e => e.message || '')] }
        if (j?.errors?.length) return { ok: false, status: res.status, errors: j.errors.map(e => e.message || 'gql error'), data: j.data }
        return { ok: true, status: res.status, data: j?.data }
    } catch (err) { return { ok: false, status: 0, errors: [(err as Error).message] } }
}

export interface ShopifyProduct {
    id: string                 // gid://shopify/Product/123
    title: string
    handle: string
    descriptionPlain: string
    seoTitle: string
    seoDescription: string
}

interface ProductsPage {
    products: {
        pageInfo: { hasNextPage: boolean; endCursor: string }
        nodes: Array<{ id: string; title: string; handle: string; description: string; seo: { title: string | null; description: string | null } }>
    }
}

/** Page through products, returning their current SEO so we can find weak ones. */
export async function listProducts(cfg: ShopifyCfg, maxPages = 20): Promise<{ products: ShopifyProduct[]; error?: string }> {
    const products: ShopifyProduct[] = []
    let cursor: string | null = null
    const q = `query($cursor: String) {
        products(first: 50, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id title handle description seo { title description } }
        }
    }`
    for (let i = 0; i < maxPages; i++) {
        const r: ShopifyGqlResult<ProductsPage> = await shopifyGraphQL<ProductsPage>(cfg, q, { cursor })
        if (!r.ok || !r.data) return { products, error: (r.errors || []).join('; ') || 'list failed' }
        for (const n of r.data.products.nodes) {
            products.push({
                id: n.id, title: n.title, handle: n.handle,
                descriptionPlain: (n.description || '').replace(/\s+/g, ' ').trim(),
                seoTitle: n.seo?.title || '', seoDescription: n.seo?.description || '',
            })
        }
        if (!r.data.products.pageInfo.hasNextPage) break
        cursor = r.data.products.pageInfo.endCursor
    }
    return { products }
}

/** Write SEO title + meta description onto a product. */
export async function updateProductSeo(cfg: ShopifyCfg, productId: string, seo: { title?: string; description?: string }): Promise<{ ok: boolean; error?: string }> {
    const m = `mutation($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
    }`
    const r = await shopifyGraphQL<{ productUpdate: { product: { id: string } | null; userErrors: Array<{ field: string[]; message: string }> } }>(cfg, m, { input: { id: productId, seo } })
    if (!r.ok) return { ok: false, error: (r.errors || []).join('; ') }
    const ue = r.data?.productUpdate?.userErrors || []
    if (ue.length) return { ok: false, error: ue.map(e => `${(e.field || []).join('.')}: ${e.message}`).join('; ') }
    return { ok: !!r.data?.productUpdate?.product }
}

/** Lightweight reachability probe (shop name) — used to verify the token works. */
export async function probeShopify(cfg: ShopifyCfg): Promise<{ ok: boolean; shopName?: string; error?: string }> {
    const r = await shopifyGraphQL<{ shop: { name: string } }>(cfg, `{ shop { name } }`)
    if (!r.ok) return { ok: false, error: (r.errors || []).join('; ') }
    return { ok: true, shopName: r.data?.shop?.name }
}