/**
 * Offline verification for the seoSchemaBatch "enrich, don't skip-if-any" logic
 * (#2) and the VideoObject extractor. Pure functions only — no DB, no network.
 *
 *   npx tsx src/scripts/verify-schema-enrich.ts
 */
import { analyzeStored, detectVideos } from '@/services/seoSchemaBatch'

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}

// ── analyzeStored: candidacy (no schema / stale / complete) ──────────────────
console.log('\n=== analyzeStored ===')

// 1. Empty meta → not ours, not a stale-enrich (it's a brand-new "new" candidate
//    handled by !hasOurSchema upstream).
const empty = analyzeStored('')
check('empty → hasOurSchema=false, stale=false', empty.hasOurSchema === false && empty.stale === false)

// 2. A COMPLETE current-version graph (Org + WebSite+SearchAction + Breadcrumb,
//    stamped at current version) → ours, NOT stale → skipped (idempotent).
const complete = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
        { '@type': 'Organization', '@id': 'x#org' },
        { '@type': 'WebSite', potentialAction: { '@type': 'SearchAction' } },
        { '@type': 'BreadcrumbList' },
        { '@type': 'Article' },
    ],
    _fmSchemaV: 2,
})
const c = analyzeStored(complete)
check('complete v2 graph → hasOurSchema=true, stale=false', c.hasOurSchema === true && c.stale === false)

// 3. An OLD graph with all base nodes + SearchAction but NO version stamp (v0)
//    → ours but stale (below current version) → re-generated to pick up VideoObject.
const oldUnstamped = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
        { '@type': 'Organization' },
        { '@type': 'WebSite', potentialAction: { '@type': 'SearchAction' } },
        { '@type': 'BreadcrumbList' },
    ],
})
check('old unstamped (v0) graph → stale=true', analyzeStored(oldUnstamped).stale === true)

// 4. Graph missing SearchAction → stale (the explicit gap we set out to fix).
const noSearch = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization' }, { '@type': 'WebSite' }, { '@type': 'BreadcrumbList' }],
    _fmSchemaV: 2,
})
check('WebSite without SearchAction → stale=true', analyzeStored(noSearch).stale === true)

// 5. Graph missing a base node (no BreadcrumbList) → stale.
const noBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization' }, { '@type': 'WebSite', potentialAction: {} }],
    _fmSchemaV: 2,
})
check('missing BreadcrumbList → stale=true', analyzeStored(noBreadcrumb).stale === true)

// 6. Unparseable stored value → treat as ours + stale (force re-gen), never crash.
const broken = analyzeStored('{not valid json')
check('unparseable → hasOurSchema=true, stale=true', broken.hasOurSchema === true && broken.stale === true)

// ── detectVideos: real embeds only, no fabrication ───────────────────────────
console.log('\n=== detectVideos ===')

const yt = detectVideos('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"></iframe>')
check('YouTube embed → 1 video, correct id/urls',
    yt.length === 1 && yt[0].provider === 'youtube'
    && yt[0].contentUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    && yt[0].embedUrl === 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    && yt[0].thumbnailUrl === 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    JSON.stringify(yt))

const ytShort = detectVideos('watch here: https://youtu.be/dQw4w9WgXcQ thanks')
check('youtu.be short link → resolves to same id', ytShort.length === 1 && ytShort[0].contentUrl.endsWith('dQw4w9WgXcQ'))

const vimeo = detectVideos('<iframe src="https://player.vimeo.com/video/123456789"></iframe>')
check('Vimeo embed → 1 video, no fabricated thumbnail',
    vimeo.length === 1 && vimeo[0].provider === 'vimeo' && vimeo[0].embedUrl === 'https://player.vimeo.com/video/123456789' && vimeo[0].thumbnailUrl === undefined,
    JSON.stringify(vimeo))

const selfHosted = detectVideos('<video><source src="https://cdn.site.co.il/clip.mp4" type="video/mp4"></video>')
check('self-hosted mp4 → file provider', selfHosted.length === 1 && selfHosted[0].provider === 'file' && selfHosted[0].contentUrl.endsWith('clip.mp4'))

const none = detectVideos('<p>just text, a link to https://example.com and an image</p>')
check('no video → empty array (no false positives)', none.length === 0, JSON.stringify(none))

const dupes = detectVideos('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe> and again https://youtu.be/dQw4w9WgXcQ')
check('same video twice → deduped to 1', dupes.length === 1)

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)