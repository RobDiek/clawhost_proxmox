/**
 * Stage: internal_seo_audit — comprehensive technical + on-page audit of OUR
 * site. Phase E1.2.
 *
 * Outputs feed into:
 *   - aeo_visibility: knows which schema we have / are missing
 *   - link_audit: knows which pages need authority injection most
 *   - strategy_options: knows technical-debt hours to budget
 *   - content_plan: knows existing pages to refresh vs new pages to create
 *
 * Lean MVP scope (avoid Firecrawl for now — DFS onPageInstant is rich enough):
 *   1. Sitemap.xml fetch + URL inventory (cap 50 URLs)
 *   2. DFS onPageInstant per URL (cached, parallel batched)
 *   3. Aggregate: schema coverage, duplicates, thin content, IA depth proxy
 *      (URL path depth instead of full crawl IA — full IA would need Firecrawl
 *      HTML scrape + link extraction; deferred to Phase E2.x)
 *   4. Robots.txt + sitemap.xml structural sanity
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'internal_seo_audit')
}