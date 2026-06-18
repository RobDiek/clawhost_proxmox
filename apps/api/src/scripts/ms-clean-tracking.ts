/** MS Stage C cleanup — disable conflicting tracking, OBSERVE before installing
 *  our GTM. Reversible. Keeps PixelYourSite Meta Pixel intact.
 *   node --env-file=.env --import tsx src/scripts/ms-clean-tracking.ts [--apply]
 *
 * Steps (apply): disable google-listings-and-ads google_ads; disable
 * pixelyoursite ga4 + google_ads (NOT meta). Then rescan. Does NOT install our
 * GTM yet — we verify K47TWPCT is gone + Meta survives first.
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { disablePluginTrackingFeature, scanSiteHtmlForGtm } from '@/services/wpCompanionInstaller'

const INSTANCE = '44f484a852', AGENT = 'mta_Xm8CfS3K', SITE = 'https://moving-station.co.il/'

async function scan(label: string) {
    const gtm = await scanSiteHtmlForGtm(SITE).catch(() => null)
    const res = await fetch(SITE, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
    const html = res ? await res.text() : ''
    const fbq = /fbq\(|connect\.facebook\.net|facebook.*pixel|"pixel_id"|pys_/i.test(html)
    const metaIds = [...new Set([...html.matchAll(/"pixel_id"\s*:\s*"?(\d{10,16})"?/g)].map(m => m[1]))]
    const ga4 = [...new Set([...html.matchAll(/G-[A-Z0-9]{6,}/g)].map(m => m[0]))]
    console.log(`  [${label}] GTM=${JSON.stringify((gtm as any)?.gtmIds || [])} · GA4=${JSON.stringify(ga4)} · MetaPixel=${fbq ? 'present' : 'NONE'}${metaIds.length ? ' ids=' + JSON.stringify(metaIds) : ''}`)
}

async function main() {
    const apply = process.argv.includes('--apply')
    const cfg: any = await loadWpConfig(INSTANCE, AGENT)
    if (!cfg) throw new Error('no wpConfig')
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    console.log('BEFORE:'); await scan('before')

    if (!apply) { console.log('\ndry-run — would disable google-listings-and-ads(google_ads) + pixelyoursite(ga4,google_ads).'); process.exit(0) }

    console.log('\n→ disable google-listings-and-ads google_ads')
    console.log('  ', JSON.stringify(await disablePluginTrackingFeature(cfg, 'google-listings-and-ads', 'google_ads').catch(e => ({ error: (e as Error).message }))))
    console.log('→ disable pixelyoursite ga4')
    console.log('  ', JSON.stringify(await disablePluginTrackingFeature(cfg, 'pixelyoursite', 'ga4').catch(e => ({ error: (e as Error).message }))))
    console.log('→ disable pixelyoursite google_ads')
    console.log('  ', JSON.stringify(await disablePluginTrackingFeature(cfg, 'pixelyoursite', 'google_ads').catch(e => ({ error: (e as Error).message }))))

    await new Promise(r => setTimeout(r, 4000))
    console.log('\nAFTER:'); await scan('after')
    console.log('\n⏸ STOP — verify above: K47TWPCT gone? GA4 single/none? Meta still present? Then run GTM install (C2) separately.')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })