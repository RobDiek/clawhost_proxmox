/** READ-ONLY: the approved Product-schema task outcome + native WC schema check. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'
async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const tasks = (a?.researchData?.monthlyPlan?.tasks || [])
    const t = tasks.find((x: any) => /הטמעת.*Product|Product \+ Offer|65 דפי מוצר/i.test(x.title || ''))
    if (t) {
        console.log(`TASK: "${String(t.title).slice(0,55)}" status=${t.status} execOut=${t.executionOutputId || '-'}`)
        if (t.executionOutputId) {
            const [eo] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, t.executionOutputId)) as any[]
            let c: any = eo?.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
            console.log('  outputDescription:', (c && c.outputDescription) || '-')
            if (c && c.stepResults) for (const s of c.stepResults) console.log('   step:', s.step, '·', s.ok, '·', String(s.detail).slice(0, 120))
        }
    } else { console.log('Product-schema task NOT FOUND') }

    // native WC schema on a product page (what Google already sees)
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const base = wp.url.replace(/\/+$/, '')
    const prods = await (await fetch(`${base}/wp-json/wc/v3/products?per_page=2&status=publish&_fields=id,name,price,permalink`, { headers: { Authorization: auth } })).json() as any[]
    for (const p of (prods || [])) {
        let html = ''
        try { html = await (await fetch(p.permalink)).text() } catch { /**/ }
        const hasProduct = /"@type"\s*:\s*"Product"/.test(html)
        const hasOffer = /"@type"\s*:\s*"Offer"/.test(html)
        const priceM = html.match(/"price"\s*:\s*"?([\d.]+)"?/)
        console.log(`\nproduct #${p.id} "${String(p.name).slice(0,28)}" wc_price=${p.price}`)
        console.log(`  page HTML: Product=${hasProduct} Offer=${hasOffer} schemaPrice=${priceM ? priceM[1] : '-'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })