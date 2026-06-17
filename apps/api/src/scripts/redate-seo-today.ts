/** Re-date the auto-executable ON-SITE SEO tasks to TODAY; leave everything else
 * on its generator-assigned spread. Agent-reviewed selection (allow ∧ ¬deny).
 *   node --env-file=.env --import tsx src/scripts/redate-seo-today.ts <agentId> <YYYY-MM-DD> [--apply]
 */
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'

// on-site auto-SEO we WANT today
const ALLOW = /סכמ|schema|aggregaterating|localbusiness|breadcrumb|organization|videoobject|product|מטא|meta desc|קישורים פנימיים|internal link|תמונות|alt|דפי ערים|דף נחיתה|פרסונה|השוואה|תוכן דליל|העמקת|spoke|ציטוטיות|quotab/i
// exclude even if it matched ALLOW / is seo channel
const DENY = /פיץ'|פיץ|pitch|שחזור קישור|התאחדות|lahav|אינדקס|b144|zap|dapei|מעקב מתחרים|competitor|slug|url|wikidata|ישות מותג|ניטור sitemap|ציטוט.*מנוע|מנוע.*ציטוט|youtube|רבעוני|bigquery|קטגוריות|product-category/i

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const today = process.argv[3] || '2026-06-05'
    const apply = process.argv.includes('--apply')
    const since = new Date(Date.now() - 36 * 3600 * 1000)
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agentId), eq(agentOutputs.outputType, 'monthly_task'), gt(agentOutputs.createdAt, since))) as any[]
    let latestGen = ''
    for (const r of rows) { const g = (r.metadata as any)?.monthlyPlanGeneratedAt || ''; if (g > latestGen) latestGen = g }
    const planRows = rows.filter(r => (r.metadata as any)?.monthlyPlanGeneratedAt === latestGen)

    const today_: any[] = [], deferred: any[] = []
    for (const r of planRows) {
        const md: any = r.metadata || {}
        const ch = md.channel, title = r.title || ''
        const isSeo = ch === 'seo' || ch === 'content'
        const pick = isSeo && ALLOW.test(title) && !DENY.test(title)
        ;(pick ? today_ : deferred).push({ row: r, md, title })
    }

    console.log(`gen=${latestGen} · total=${planRows.length} · TODAY(auto-SEO)=${today_.length} · deferred=${deferred.length}\n`)
    console.log('===== → TODAY (auto on-site SEO) =====')
    for (const t of today_) console.log(`  [${t.md.priority}/${t.md.channel}] ${t.title}`)
    console.log('\n===== stays spread (sample of deferred) =====')
    for (const t of deferred.slice(0, 50)) console.log(`  [${t.md.priority}/${t.md.channel}] wk${t.md.weekOfMonth} ${t.md.scheduledFor || ''} ${t.title}`)

    if (apply) {
        for (const t of today_) {
            const newMd = { ...t.md, scheduledFor: today, weekOfMonth: 1 }
            await db.update(agentOutputs).set({ metadata: newMd }).where(eq(agentOutputs.id, t.row.id))
        }
        console.log(`\n✅ APPLIED — ${today_.length} tasks dated ${today}; ${deferred.length} left on their spread.`)
    } else {
        console.log('\n(dry-run — pass --apply to write dates)')
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })