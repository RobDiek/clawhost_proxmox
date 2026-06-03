/** READ-ONLY: diagnose server-side MP attribution capture on a tenant store.
 * Checks companion plugin version + serverside-enabled, then samples recent
 * WooCommerce orders for captured _clawflow_ga_client_id / _clawflow_gclid /
 * _clawflow_mp_sent meta — to see if client_id capture is actually working or
 * falling back to the deterministic 555... id (= "(not set)" in GA4).
 *   node --env-file=.env --import tsx src/scripts/probe-mp-attribution.ts <instanceId> <agentId>
 */
import { loadWpConfig } from '@/services/seoMetaBatch'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const cfg = await loadWpConfig(instanceId, agentId)
    if (!cfg) throw new Error('no WP config')
    const base = cfg.url.replace(/\/+$/, '')
    const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')

    const cap = await (await fetch(`${base}/wp-json/clawflow/v1/capabilities`, { headers: { Authorization: auth } })).json().catch(() => ({})) as any
    console.log(`\n=== companion @ ${base} ===`)
    console.log(`  pluginVersion: ${cap?.pluginVersion || '(none / plugin not installed)'}`)
    console.log(`  serverSideEnabled: ${cap?.serverSideEnabled}`)

    // sample last 30 orders with the clawflow attribution meta
    const orders = await (await fetch(`${base}/wp-json/wc/v3/orders?per_page=30&orderby=date&order=desc&_fields=id,date_created,status,meta_data`, { headers: { Authorization: auth } })).json().catch(() => []) as any[]
    if (!Array.isArray(orders)) { console.log('  orders fetch failed:', JSON.stringify(orders).slice(0, 200)); process.exit(0) }
    let withCid = 0, fallbackCid = 0, withGclid = 0, mpSent = 0, noCid = 0
    for (const o of orders) {
        const m: Record<string, any> = {}
        for (const md of o.meta_data || []) m[md.key] = md.value
        const cid = m['_clawflow_ga_client_id']
        const gclid = m['_clawflow_gclid']
        if (m['_clawflow_mp_sent']) mpSent++
        if (gclid) withGclid++
        if (cid) withCid++; else noCid++
        if (cid && /^555/.test(String(cid))) fallbackCid++
    }
    console.log(`\n=== last ${orders.length} orders ===`)
    console.log(`  with real _ga client_id: ${withCid}`)
    console.log(`  fallback 555 client_id : ${fallbackCid}`)
    console.log(`  NO client_id meta      : ${noCid}  (capture hook never ran / cookie absent)`)
    console.log(`  with gclid             : ${withGclid}`)
    console.log(`  MP purchase sent       : ${mpSent}`)
    console.log('\n  sample (id · status · cid · gclid):')
    for (const o of orders.slice(0, 8)) {
        const m: Record<string, any> = {}
        for (const md of o.meta_data || []) m[md.key] = md.value
        console.log(`    #${o.id} ${o.status} · cid=${m['_clawflow_ga_client_id'] || '—'} · gclid=${m['_clawflow_gclid'] ? 'yes' : '—'}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })