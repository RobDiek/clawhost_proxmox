/** READ-ONLY: accurate autonomy audit of a tenant's monthly plan.
 * Buckets each task into: AUTO_NOW (a real executor adapter handles it),
 * SITE_GAP (on OUR property — should be auto, needs an adapter we don't have yet),
 * EXTERNAL (third-party site / outreach — genuinely manual), or
 * INTEGRATION_GAP (e.g. Meta — our integration deferred, not external).
 * Produces the concrete build target for "auto everything except external sites".
 *   node --env-file=.env --import tsx src/scripts/audit-plan-autonomy.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
    isSeoMetaBatchTask, isSeoSchemaTask, isInternalLinksTask, isSlugProposeTask,
    isImageAltTask, isLlmsTxtTask, isLandingPageTask, isAnswerFirstTask,
} from '@/services/monthlyTaskExecutor'

const PAID = new Set(['paid_optimization', 'keyword_expansion', 'audience_expansion', 'creative_refresh', 'experiment'])
const TRACKING = new Set(['tracking_setup', 'measurement_gap'])

function txt(t: any): string {
    return `${t.title || ''} ${t.summary || ''} ${(t.actionPlan || []).map((s: any) => s.step).join(' ')}`
}

// Third-party / outreach work we genuinely CANNOT auto (editing someone else's site).
function isExternal(t: any): boolean {
    const s = txt(t)
    return /שחזור קישור|יחסי ציבור|יח"?צ|פיץ'|רישום ב-?|ספרי(יה|ית)|השוואת מחירים|שיתוף פעולה|פוסט אורח|guest post|מעריב|ישראל היום|the\s*marker|דה.?מרקר|globes|גלובס|\bB144\b|\bZap\b|זאפ|התאחדות|ynet|backlink.*(חיצונ|אתר אחר)|מומלץ ב/i.test(s)
        && !/מעקב|ניטור|ניתוח|סקירה/i.test(t.title || '')   // monitoring/analysis is READ → not external write
}

// Meta = our OAuth deferred (NOT external). Distinct gap.
function isMetaGap(t: any): boolean {
    return t.channel === 'meta' || /\bmeta\b|פייסבוק|אינסטגרם|lookalike|קהל דומה/i.test(t.title || '')
}

// Does a REAL executor adapter already handle it?
function autoNowCaps(t: any): string[] {
    const caps: string[] = []
    try { if (isLandingPageTask(t)) caps.push('landing_page') } catch { /**/ }
    try { if (isSeoMetaBatchTask(t)) caps.push('seo.meta') } catch { /**/ }
    try { if (isSeoSchemaTask(t)) caps.push('seo.schema') } catch { /**/ }
    try { if (isInternalLinksTask(t)) caps.push('seo.internal_links') } catch { /**/ }
    try { if (isSlugProposeTask(t)) caps.push('seo.slug') } catch { /**/ }
    try { if (isImageAltTask(t)) caps.push('seo.image_alt') } catch { /**/ }
    try { if (isLlmsTxtTask(t)) caps.push('aeo.llms_txt') } catch { /**/ }
    try { if (isAnswerFirstTask(t)) caps.push('aeo.answer_first') } catch { /**/ }
    if (PAID.has(t.type) && t.channel !== 'meta') caps.push('paid.google_ads')
    if (TRACKING.has(t.type)) caps.push('tracking.setup')
    if (t.type === 'content_creation' && !/רענון|רענן|הרחב|עדכון דפים קיימ|דפים קיימ|עמיק/i.test(txt(t))) caps.push('content.create')
    return caps
}

// On OUR property but no adapter yet → what to BUILD.
function siteGap(t: any): string | null {
    const s = txt(t)
    if (/רענון|רענן|הרחב(ת|ו)? \d|תוכן דק|דפים קיימ|העמק/i.test(s)) return 'page_refresh (עדכון פוסט קיים: H2/FAQ/schema/קישורים/עומק)'
    if (/whatsapp|וואטסאפ|כפתור חיוג|click.?to.?call|כפתור צף/i.test(s)) return 'site_widget (הזרקת כפתור צף דרך companion)'
    if (/חלון יציאה|exit.?intent|פופ.?אפ|popup|קופון.*עגלה/i.test(s)) return 'site_widget (פופאפ exit-intent דרך companion)'
    if (/core web vitals|iframes?|מהירות|LCP|CLS|חוויית משתמש בליבה/i.test(s)) return 'site_perf (CWV — מורכב, אולי semi)'
    if (/פרופיל גוגל לעסקים|google business|GBP|תמונות.*עסק/i.test(s)) return 'gbp_media (העלאת תמונות ל-GBP API)'
    if (/חפיפת מילות מפתח|ניתוח.*ממומן.*אורגני|keyword overlap/i.test(s)) return 'ads_analysis (קריאה+הצעה, ללא כתיבה)'
    if (/מעקב מתחרים|ניטור מתחרים|wayback|מרכז השקיפות/i.test(s)) return 'competitor_monitoring (DFS+scrape, READ)'
    if (/מסמך|כללי החלטה|דוקטרינ|אסטרטגי(ה|ית)/i.test(s)) return 'doc_generate (הפקת מסמך — content)'
    return null
}

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    const rd: any = a?.researchData || {}
    const tasks: any[] = rd.monthlyPlan?.tasks || []
    const buckets: Record<string, any[]> = { AUTO_NOW: [], SITE_GAP: [], EXTERNAL: [], META_GAP: [], UNKNOWN: [] }
    const gapCount: Record<string, number> = {}

    tasks.forEach((t, i) => {
        const n = i + 1
        const row = { n, p: t.priority, type: t.type, ch: t.channel, title: (t.title || '').slice(0, 70) }
        if (isExternal(t)) { buckets.EXTERNAL.push(row); return }
        if (isMetaGap(t)) { buckets.META_GAP.push(row); return }
        const caps = autoNowCaps(t)
        if (caps.length) { buckets.AUTO_NOW.push({ ...row, caps }); return }
        const gap = siteGap(t)
        if (gap) { buckets.SITE_GAP.push({ ...row, gap }); gapCount[gap.split(' ')[0]] = (gapCount[gap.split(' ')[0]] || 0) + 1; return }
        buckets.UNKNOWN.push(row)
    })

    const N = tasks.length
    for (const [k, arr] of Object.entries(buckets)) {
        if (!arr.length) continue
        console.log(`\n===== ${k}: ${arr.length}/${N} =====`)
        for (const r of arr) console.log(`  ${String(r.n).padStart(2)}. [${r.p}] ${r.title}  · ${r.type}/${r.ch}${r.caps ? ' → ' + r.caps.join('+') : ''}${r.gap ? ' → BUILD: ' + r.gap : ''}`)
    }
    console.log(`\n===== SUMMARY (${N} tasks) =====`)
    console.log(`  AUTO_NOW=${buckets.AUTO_NOW.length} · SITE_GAP=${buckets.SITE_GAP.length} · EXTERNAL=${buckets.EXTERNAL.length} · META_GAP=${buckets.META_GAP.length} · UNKNOWN=${buckets.UNKNOWN.length}`)
    const autoableNonExternal = N - buckets.EXTERNAL.length - buckets.META_GAP.length
    console.log(`  target (non-external, non-meta) = ${autoableNonExternal} · already AUTO_NOW = ${buckets.AUTO_NOW.length} · to BUILD = ${buckets.SITE_GAP.length + buckets.UNKNOWN.length}`)
    console.log(`  gaps to build: ${JSON.stringify(gapCount)}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })