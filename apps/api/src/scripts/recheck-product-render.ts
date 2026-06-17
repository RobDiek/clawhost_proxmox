/** READ-ONLY: confirm product schema meta is set + renders (cache-busted fetch). */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'
async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const base = wp.url.replace(/\/+$/, '')
    const prods = await (await fetch(`${base}/wp-json/wc/v3/products?per_page=3&status=publish&_fields=id,name,price,permalink`, { headers: { Authorization: auth } })).json() as any[]
    for (const p of (prods || [])) {
        // 1) meta set?
        let metaSet = false, types: string[] = [], schemaPrice = ''
        try {
            const post = await (await fetch(`${base}/wp-json/wp/v2/product/${p.id}?context=edit&_fields=meta`, { headers: { Authorization: auth } })).json() as any
            const raw = (post?.meta && post.meta._clawflow_schema_jsonld) || ''
            metaSet = !!raw
            if (raw) { const g = JSON.parse(raw)['@graph'] || []; types = g.map((n: any) => n['@type']); const pr = g.find((n: any) => n['@type'] === 'Product'); schemaPrice = pr?.offers?.price || pr?.offers?.lowPrice || '' }
        } catch (e) { /**/ }
        // 2) rendered on page? (cache-busted)
        let renders = false
        try { const html = await (await fetch(`${p.permalink}?cb=${Date.now()}`)).text(); renders = /"@type"\s*:\s*"Product"/.test(html) && /"@type"\s*:\s*"Offer"/.test(html) } catch { /**/ }
        console.log(`#${p.id} "${String(p.name).slice(0,26)}" wc=${p.price} · metaSet=${metaSet} types=[${types.join(',')}] schemaPrice=${schemaPrice} · rendersOnPage(cb)=${renders}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })