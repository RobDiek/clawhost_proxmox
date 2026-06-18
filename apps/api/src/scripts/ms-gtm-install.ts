/** MS — install OUR GTM-WLZ3CX7B via companion (PYS already deactivated → site
 *  is clean). Verifies with a CACHE-BUSTED fetch (nginx caches the root).
 *   node --env-file=.env --import tsx src/scripts/ms-gtm-install.ts [--apply]
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { buildGtmHeadSnippet, buildGtmBodySnippet } from '@/services/mazhirGtmSetup'
import { installGtmSnippet } from '@/services/wpCompanionInstaller'

const INSTANCE = '44f484a852', AGENT = 'mta_Xm8CfS3K', SITE = 'https://moving-station.co.il/'
const OURS = 'GTM-WLZ3CX7B'

async function freshScan(tag: string) {
    const res = await fetch(`${SITE}?cb=${tag}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
    const html = res ? await res.text() : ''
    const gtm = [...new Set([...html.matchAll(/GTM-[A-Z0-9]+/g)].map(m => m[0]))]
    const ga4 = [...new Set([...html.matchAll(/G-[A-Z0-9]{6,}/g)].map(m => m[0]))]
    const meta = /fbq\(|connect\.facebook\.net|pys_/i.test(html)
    return { gtm, ga4, meta }
}

async function main() {
    const apply = process.argv.includes('--apply')
    const cfg: any = await loadWpConfig(INSTANCE, AGENT)
    if (!cfg) throw new Error('no wpConfig')
    const before = await freshScan(`b${process.pid}`)
    console.log('before (cache-busted):', JSON.stringify(before))
    if (!apply) { console.log('would install', OURS); process.exit(0) }

    const ins = await installGtmSnippet(cfg, OURS, buildGtmHeadSnippet(OURS), buildGtmBodySnippet(OURS)).catch(e => ({ ok: false, error: (e as Error).message }))
    console.log('install', OURS, '→', JSON.stringify(ins))
    await new Promise(r => setTimeout(r, 4000))
    const after = await freshScan(`a${process.pid}`)
    console.log('after (cache-busted):', JSON.stringify(after))
    const clean = after.gtm.length === 1 && after.gtm[0] === OURS
    console.log(`\n${clean ? '✅ single OUR container live' : '⚠ check'}: GTM=${JSON.stringify(after.gtm)} GA4=${JSON.stringify(after.ga4)} Meta=${after.meta}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })