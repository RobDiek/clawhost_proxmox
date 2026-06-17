/** READ-ONLY: verify the meta-description task executed + metas landed in WP. */
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { loadWpConfig } from '@/services/seoMetaBatch'

function stripHtml(s: string) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim() }
function isHe(s: string) { return /[֐-׿]/.test(s) }

async function main() {
    const instanceId = '44f484a852', agentId = process.argv[2] || 'mta_Un9jXRuf'
    // 1) task status + result
    const tasks = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task')))
        .orderBy(desc(agentOutputs.createdAt)) as any[]
    const meta = tasks.find(t => /meta description|תיאורי מטא|meta desc/i.test(t.title || ''))
    if (meta) {
        console.log(`TASK: status=${meta.status} id=${meta.id}`)
        let c: any = meta.content; if (typeof c === 'string') { try { c = JSON.parse(c) } catch { /**/ } }
        console.log('  result/summary:', JSON.stringify((c && (c.result || c.summary || c.outputDescription)) || (typeof meta.editedContent === 'string' ? meta.editedContent.slice(0, 200) : '')).slice(0, 300))
    } else { console.log('meta task NOT FOUND') }

    // 2) sample WP pages/posts meta
    const wp = await loadWpConfig(instanceId, agentId) as any
    const auth = 'Basic ' + Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')
    const base = wp.url.replace(/\/+$/, '')
    let withMeta = 0, total = 0; const samples: any[] = []
    for (const type of ['pages', 'posts']) {
        const url = `${base}/wp-json/wp/v2/${type}?per_page=100&status=publish&_fields=id,title,link,meta,yoast_head_json`
        const items = await (await fetch(url, { headers: { Authorization: auth } })).json() as any[]
        for (const it of (items || [])) {
            total++
            const md = (it.meta && it.meta.rank_math_description) || (it.yoast_head_json && it.yoast_head_json.description) || ''
            if (md && md.trim()) { withMeta++; if (samples.length < 6) samples.push({ id: it.id, title: stripHtml(it.title?.rendered || ''), len: md.length, he: isHe(md), md: md.slice(0, 90) }) }
        }
    }
    console.log(`\nWP meta coverage: ${withMeta}/${total} published pages+posts have a meta description`)
    console.log('samples:')
    for (const s of samples) console.log(`  #${s.id} len=${s.len} he=${s.he} "${s.title}" → ${s.md}…`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })