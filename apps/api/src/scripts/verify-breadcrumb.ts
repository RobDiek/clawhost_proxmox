/** READ-ONLY: confirm every BreadcrumbList ListItem in product schema has `item`. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'
async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const wp = await loadWpConfig(a.vpsInstanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const base = wp.url.replace(/\/+$/, '')
    const prods = await (await fetch(`${base}/wp-json/wc/v3/products?per_page=3&status=publish&_fields=id`, { headers: { Authorization: auth } })).json() as any[]
    for (const p of (prods || [])) {
        const post = await (await fetch(`${base}/wp-json/wp/v2/product/${p.id}?context=edit&_fields=meta`, { headers: { Authorization: auth } })).json() as any
        const raw = post?.meta?._clawflow_schema_jsonld
        if (!raw) { console.log(`#${p.id} no schema`); continue }
        const g = JSON.parse(raw)['@graph'] || []
        const bc = g.find((n: any) => n['@type'] === 'BreadcrumbList')
        const items = bc?.itemListElement || []
        const missing = items.filter((it: any) => !it.item).length
        console.log(`#${p.id} breadcrumb crumbs=${items.length} missing-item=${missing} → ${items.map((it: any) => `${it.name}:${it.item ? 'OK' : 'MISSING'}`).join(' | ')}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })