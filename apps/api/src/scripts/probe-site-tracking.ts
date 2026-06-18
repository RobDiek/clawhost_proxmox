/** Read-only: probe a tenant's live site tracking stack (companion caps,
 *  tracking-audit, live GTM) — to compare PS (reference) vs MS.
 *   node --env-file=.env --import tsx src/scripts/probe-site-tracking.ts <agentId> <siteUrl>
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { probeWpCapabilities, probeTrackingAudit, scanSiteHtmlForGtm } from '@/services/wpCompanionInstaller'

const INSTANCE = '44f484a852'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const siteUrl = process.argv[3] || 'https://packing-station.co.il/'
    const cfg: any = await loadWpConfig(INSTANCE, agentId)
    if (!cfg) { console.log('no wpConfig'); process.exit(1) }
    console.log(`=== ${agentId} · ${cfg.baseUrl || cfg.url} ===`)
    const caps = await probeWpCapabilities(cfg).catch(() => null)
    console.log('caps:', caps ? JSON.stringify({ pluginVersion: caps.pluginVersion, gtmInstalled: caps.gtmInstalled, woo: caps.wooCommerceActive }) : 'unreachable')
    const live = await scanSiteHtmlForGtm(siteUrl).catch(() => null)
    console.log('live GTM:', JSON.stringify((live as any)?.gtmIds || live))
    const audit = await probeTrackingAudit(cfg).catch((e) => ({ error: (e as Error).message }))
    console.log('tracking-audit:', JSON.stringify(audit, null, 2))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })