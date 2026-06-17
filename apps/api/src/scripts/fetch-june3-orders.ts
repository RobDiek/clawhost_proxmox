/** READ-ONLY: dump all June-3 WooCommerce orders with full attribution detail. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

async function main() {
    const instanceId = '44f484a852', agentId = 'mta_Un9jXRuf'
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const url = `${wp.url.replace(/\/+$/, '')}/wp-json/wc/v3/orders?after=2026-06-03T00:00:00&before=2026-06-03T23:59:59&per_page=100&status=any&_fields=id,number,total,status,date_created_gmt,payment_method,payment_method_title,created_via,customer_note,billing,meta_data`
    const orders = await (await fetch(url, { headers: { Authorization: auth } })).json() as any[]
    console.log(`=== ${orders.length} orders on 2026-06-03 ===\n`)
    for (const o of orders) {
        const m: Record<string, any> = {}
        for (const md of o.meta_data || []) m[md.key] = md.value
        const interesting = Object.keys(m).filter(k => /gclid|utm|source|referr|clawflow|wc_order_attribution|origin|medium|campaign|device/i.test(k))
        console.log(`#${o.number} · ₪${o.total} · ${o.status} · ${o.date_created_gmt}`)
        console.log(`   pay=${o.payment_method_title || o.payment_method} via=${o.created_via} phone=${o.billing?.phone || '—'}`)
        if (o.customer_note) console.log(`   note: ${String(o.customer_note).slice(0, 80)}`)
        for (const k of interesting) console.log(`   ${k} = ${String(m[k]).slice(0, 90)}`)
        console.log('')
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })