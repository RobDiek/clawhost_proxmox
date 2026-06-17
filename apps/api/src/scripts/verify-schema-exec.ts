/** READ-ONLY: verify the Product-schema task executed + schema on product pages. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    // 1) task + execution output
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const t = (a?.researchData?.monthlyPlan?.tasks || []).find((x: any) => /סכמת Product|Product \+ Offer|schema.*product|סכמת.*מוצר/i.test(x.title || ''))
    if (t) {
        console.log(`TASK: id=${t.id} status=${t.status} execOut=${t.executionOutputId || '-'}`)
        if (t.executionOutputId) {
            const [eo] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, t.executionOutputId)) as any[]
            let c: any = eo?.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
            console.log('  outputDescription:', (c && c.outputDescription) || '-')
            if (c && c.stepResults) for (const s of c.stepResults) console.log('   step:', s.step, '·', s.ok, '·', s.detail)
        }
    } else { console.log('schema task NOT FOUND in plan') }

    // 2) spot-check product pages' schema vs real WC price
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const base = wp.url.replace(/\/+$/, '')
    const prods = await (await fetch(`${base}/wp-json/wc/v3/products?per_page=4&status=publish&_fields=id,name,price,permalink`, { headers: { Authorization: auth } })).json() as any[]
    console.log(`\nspot-check ${(prods || []).length} products:`)
    for (const p of (prods || [])) {
        // read companion schema meta via WP post
        let schemaRaw = ''
        try {
            const post = await (await fetch(`${base}/wp-json/wp/v2/product/${p.id}?_fields=meta`, { headers: { Authorization: auth } })).json() as any
            schemaRaw = (post?.meta && post.meta._clawflow_schema_jsonld) || ''
        } catch { /**/ }
        let types: string[] = [], offerPrice = ''
        if (schemaRaw) {
            try {
                const g = (JSON.parse(schemaRaw)['@graph'] || []) as any[]
                types = g.map(n => String(n['@type'] || ''))
                const off = g.find(n => n['@type'] === 'Product')?.offers || g.find(n => n['@type'] === 'Offer')
                offerPrice = off ? String(off.price || (off.priceSpecification && off.priceSpecification.price) || '') : ''
            } catch { types = ['<parse-fail>'] }
        }
        console.log(`  #${p.id} "${String(p.name).slice(0,30)}" wc_price=${p.price} · schema=${schemaRaw ? 'YES' : 'NONE'} types=[${types.join(',')}] schemaPrice=${offerPrice || '-'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })