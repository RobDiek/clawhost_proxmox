/** MS — clean ALL site analytics → single OUR stack (Sergei: "всё наше").
 *  Deactivates PixelYourSite (removes GTM-K47TWPCT + its tags), then installs
 *  our GTM-WLZ3CX7B via companion. Scans at each step. Reversible (reactivate
 *  PYS if needed). Google-for-Woo conversion already disabled earlier.
 *   node --env-file=.env --import tsx src/scripts/ms-gtm-final.ts [--apply]
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { buildGtmHeadSnippet, buildGtmBodySnippet } from '@/services/mazhirGtmSetup'
import { disablePluginTrackingFeature, installGtmSnippet, scanSiteHtmlForGtm } from '@/services/wpCompanionInstaller'

const INSTANCE = '44f484a852', AGENT = 'mta_Xm8CfS3K', SITE = 'https://moving-station.co.il/'
const OURS = 'GTM-WLZ3CX7B', STALE = 'GTM-K47TWPCT'

async function snap() {
    const gtm = await scanSiteHtmlForGtm(SITE).catch(() => null)
    const res = await fetch(SITE, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
    const html = res ? await res.text() : ''
    const meta = /fbq\(|connect\.facebook\.net|"pixel_id"|pys_/i.test(html)
    const ga4 = [...new Set([...html.matchAll(/G-[A-Z0-9]{6,}/g)].map(m => m[0]))]
    return { gtm: (gtm as any)?.gtmIds || [], ga4, meta }
}
const show = (l: string, s: any) => console.log(`  [${l}] GTM=${JSON.stringify(s.gtm)} GA4=${JSON.stringify(s.ga4)} Meta/PYS=${s.meta ? 'present' : 'NONE'}`)

async function main() {
    const apply = process.argv.includes('--apply')
    const cfg: any = await loadWpConfig(INSTANCE, AGENT)
    if (!cfg) throw new Error('no wpConfig')
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    show('before', await snap())
    if (!apply) { console.log('\nwould: deactivate pixelyoursite → install', OURS); process.exit(0) }

    console.log('\n→ deactivate pixelyoursite')
    console.log('  ', JSON.stringify(await disablePluginTrackingFeature(cfg, 'pixelyoursite', 'deactivate_plugin').catch(e => ({ error: (e as Error).message }))))
    await new Promise(r => setTimeout(r, 5000))
    const mid = await snap(); show('after deactivate', mid)

    if (mid.gtm.includes(STALE)) {
        console.log(`\n⏸ ${STALE} STILL present after PYS deactivate — another source. NOT installing ours.`)
        process.exit(2)
    }

    console.log(`\n→ install ${OURS} via companion`)
    console.log('  ', JSON.stringify(await installGtmSnippet(cfg, OURS, buildGtmHeadSnippet(OURS), buildGtmBodySnippet(OURS)).catch(e => ({ ok: false, error: (e as Error).message }))))
    await new Promise(r => setTimeout(r, 5000))
    const after = await snap(); show('after install', after)

    const clean = after.gtm.length === 1 && after.gtm[0] === OURS
    console.log(`\n${clean ? '✅ CLEAN — single OUR container' : '⚠ CHECK'}: GTM=${JSON.stringify(after.gtm)} GA4=${JSON.stringify(after.ga4)}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })