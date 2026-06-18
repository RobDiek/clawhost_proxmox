/** MS — turn off PixelYourSite's GTM container, then install OUR GTM-WLZ3CX7B.
 *  Surgical + reversible: clears the pys_gtm_options option (PYS GTM → default
 *  off), keeps Meta (pys_facebook_options untouched). Scans at every step; only
 *  installs our container once K47TWPCT is gone (never double-GTM).
 *   node --env-file=.env --import tsx src/scripts/ms-gtm-swap.ts [--apply]
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { buildGtmHeadSnippet, buildGtmBodySnippet } from '@/services/mazhirGtmSetup'
import { deleteOrphanedWpOptions, installGtmSnippet, scanSiteHtmlForGtm } from '@/services/wpCompanionInstaller'

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
const show = (l: string, s: any) => console.log(`  [${l}] GTM=${JSON.stringify(s.gtm)} GA4=${JSON.stringify(s.ga4)} Meta=${s.meta ? 'present' : 'NONE'}`)

async function main() {
    const apply = process.argv.includes('--apply')
    const cfg: any = await loadWpConfig(INSTANCE, AGENT)
    if (!cfg) throw new Error('no wpConfig')
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n')
    show('before', await snap())
    if (!apply) { console.log('\nwould: delete pys_gtm_options → verify K47TWPCT gone → install', OURS); process.exit(0) }

    // C1 — clear PixelYourSite GTM container option(s)
    for (const keys of [['pys_gtm_options'], ['pys_gtm'], ['pys_gtm_settings']]) {
        const r = await deleteOrphanedWpOptions(cfg, keys).catch(e => ({ error: (e as Error).message }))
        console.log(`delete ${JSON.stringify(keys)} →`, JSON.stringify(r))
    }
    await new Promise(r => setTimeout(r, 4000))
    const mid = await snap(); show('after C1', mid)

    if (mid.gtm.includes(STALE)) {
        console.log(`\n⏸ ${STALE} STILL present — PYS GTM option key differs. NOT installing ours (avoid double). Need the exact pys gtm option key.`)
        process.exit(2)
    }

    // C2 — install our container via companion
    const ins = await installGtmSnippet(cfg, OURS, buildGtmHeadSnippet(OURS), buildGtmBodySnippet(OURS)).catch(e => ({ ok: false, error: (e as Error).message }))
    console.log('\ninstall', OURS, '→', JSON.stringify(ins))
    await new Promise(r => setTimeout(r, 4000))
    const after = await snap(); show('after C2', after)

    const clean = after.gtm.length === 1 && after.gtm[0] === OURS && after.meta
    console.log(`\n${clean ? '✅ CLEAN' : '⚠ CHECK'}: site GTM=${JSON.stringify(after.gtm)} (want [${OURS}]) · Meta=${after.meta ? 'ok' : 'LOST'} · GA4=${JSON.stringify(after.ga4)}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })