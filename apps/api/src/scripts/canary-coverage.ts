/** Coverage canary: create ONE temp published post on the tenant's WP (thin
 * content + YouTube embed + FAQ), exercise the write-paths that mature sites
 * never trigger (page_refresh expand / schema VideoObject+FAQ / answer_first /
 * internal_links), then DELETE it. Proves these adapters work end-to-end without
 * waiting for real site conditions. dryRun for generation; one real schema write
 * to confirm persistence; everything cleaned up.
 *   node --env-file=.env --import tsx src/scripts/canary-coverage.ts [agentId]
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { runSeoSchemaBatch } from '@/services/seoSchemaBatch'
import { runAnswerFirst } from '@/services/seoAnswerFirst'
import { runInternalLinks } from '@/services/seoInternalLinks'
import { runPageRefresh } from '@/services/seoPageRefresh'

const INSTANCE = '44f484a852'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const cfg = await loadWpConfig(INSTANCE, agentId)
    if (!cfg) { console.log('no WP config'); process.exit(1) }
    const base = cfg.url.replace(/\/+$/, '')
    const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
    const TITLE = 'ZZZ Flowmatic QA — temp (delete)'

    // Pull a real published post's title-core so internal_links has a VERBATIM
    // anchor to match (it only links exact title-cores — by design conservative).
    let anchorPhrase = 'קרטונים למעבר דירה'
    try {
        const lr = await fetch(`${base}/wp-json/wp/v2/posts?per_page=20&status=publish&_fields=id,title,link`, { headers: { Authorization: auth } })
        const posts = await lr.json() as any[]
        for (const p of (posts || [])) {
            const t = String(p?.title?.rendered || '').replace(/&#\d+;|&amp;|&quot;/g, ' ').trim()
            const core = t.split(/[:–—|?!]/)[0].trim()
            if (core.length >= 12 && core.length <= 40) { anchorPhrase = core; break }
        }
    } catch { /* fallback */ }
    console.log(`anchor for internal_links test: "${anchorPhrase}"\n`)

    const content = [
        '<p>פוסט בדיקה זמני של Flowmatic לבדיקת כיסוי. תוכן דק במכוון.</p>',
        `<p>בנושא ${anchorPhrase} כדאי לקרוא עוד על אריזה נכונה למעבר.</p>`,
        '<figure><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="test"></iframe></figure>',
        '<h3>שאלה: כמה קרטונים צריך למעבר דירה?</h3>',
        '<p>תשובה: תלוי בגודל הדירה — בדרך כלל 20-40 קרטונים לדירת 3 חדרים.</p>',
    ].join('\n')

    // 1) Create temp published post
    const cr = await fetch(`${base}/wp-json/wp/v2/posts`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: TITLE, content, status: 'publish' }),
    })
    if (!cr.ok) { console.log('create failed', cr.status, (await cr.text()).slice(0, 200)); process.exit(1) }
    const post = await cr.json() as any
    const id = post.id as number
    console.log(`✓ created temp post #${id} (${post.link})\n`)

    let exitCode = 0
    try {
        // 2) schema (dry) — expect Article + FAQPage + VideoObject
        const sch = await runSeoSchemaBatch(INSTANCE, { agentId, onlyIds: [id], dryRun: true, businessName: 'פקינג סטיישן' })
        const types = sch.updated[0]?.types || []
        console.log(`[schema dry] updated=${sch.updated.length} types=${types.join(', ')}`)
        console.log(`   VideoObject:${types.includes('VideoObject') ? 'YES' : 'no'} FAQPage:${types.includes('FAQPage') ? 'YES' : 'no'} Article:${types.includes('Article') ? 'YES' : 'no'}`)

        // 3) answer_first (dry)
        const ans = await runAnswerFirst(INSTANCE, { agentId, onlyIds: [id], dryRun: true, businessName: 'פקינג סטיישן' })
        console.log(`[answer_first dry] candidates=${ans.candidates} updated=${ans.updated.length}` + (ans.updated[0] ? ` answer="${String((ans.updated[0] as any).answer || '').slice(0, 70)}"` : ''))

        // 4) internal_links (dry)
        const lnk = await runInternalLinks(INSTANCE, { agentId, onlyIds: [id], dryRun: true })
        const ins = (lnk.updated[0] as any)?.inserted || []
        console.log(`[internal_links dry] candidates=${lnk.candidates} updated=${lnk.updated.length} insertions=${ins.length}` + (ins[0] ? ` e.g. "${ins[0].anchor}"→${ins[0].toUrl}` : ''))

        // 5) page_refresh (dry) — target by name so it refreshes our thin post
        const pr = await runPageRefresh(INSTANCE, { agentId, namedPages: [TITLE], dryRun: true, businessName: 'פקינג סטיישן', targetWords: 600 })
        console.log(`[page_refresh dry] candidates=${pr.candidates} updated=${pr.updated.length}` + (pr.updated[0] ? ` ${(pr.updated[0] as any).beforeWords}→${(pr.updated[0] as any).afterWords} words` : ''))

        // 6) ONE REAL write — schema — to confirm persistence end-to-end
        const real = await runSeoSchemaBatch(INSTANCE, { agentId, onlyIds: [id], dryRun: false, businessName: 'פקינג סטיישן' })
        console.log(`[schema REAL] updated=${real.updated.length} failures=${real.failures.length}` + (real.failures[0] ? ` err=${real.failures[0].error}` : ' — persisted ✓'))
    } catch (e) {
        console.log('CANARY ERROR:', (e as Error).message); exitCode = 1
    } finally {
        // 7) delete temp post
        const del = await fetch(`${base}/wp-json/wp/v2/posts/${id}?force=true`, { method: 'DELETE', headers: { Authorization: auth } })
        console.log(`\n✓ deleted temp post #${id} (status ${del.status})`)
    }
    process.exit(exitCode)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })