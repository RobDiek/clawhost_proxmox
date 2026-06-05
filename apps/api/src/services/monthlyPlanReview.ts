/**
 * Monthly-Plan Agent Review — per-task verdict + recommendation, BEFORE approval.
 *
 * Mirrors the Ads-recommendations evaluator, for monthly-plan tasks: each task is
 * judged against the tenant's REAL state (dependency satisfaction, integration
 * availability, on-site risk, propose-vs-write autonomy) so the kabinet can show
 * only what is sensible to do NOW — with the agent's reasoning — instead of
 * dumping all generated tasks on the user.
 *
 * DETERMINISTIC (no LLM): fast, free, hang-proof, reproducible. The "judgment"
 * is encoded as ordered rules that reuse the executor's own classification
 * (classifyTask → capabilityId/autonomy/requires + isExternalOutreachTask), so
 * the review never drifts from what the executor can actually do.
 *
 * Verdict is written to each monthly_task row's metadata.agentReview. Re-runnable
 * + idempotent. Runs awaited post-save in the generator (verdicts ready when the
 * plan returns) and is exposed standalone (reviewSavedPlan / script).
 */
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'
import { classifyTask } from '@/services/executorCapabilities'
import { isExternalOutreachTask } from '@/services/monthlyTaskExecutor'
import { loadWpConfig } from '@/services/seoMetaBatch'
import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'

export type ReviewVerdict =
    | 'recommend_now'      // deps met, integration ready, low risk → do it now
    | 'propose'            // propose_only capability — produces a suggestion, user applies
    | 'defer'              // blocked by an unmet/dangling dependency
    | 'needs_integration'  // a required integration is not connected
    | 'review_risk'        // auto-capable but needs human verification first
    | 'manual'             // external outreach or no automatable capability

export interface TaskReview {
    verdict: ReviewVerdict
    capabilityId: string
    autonomy: string
    reasonHe: string
    readyWhen?: string         // defer: what unblocks it
    missing?: string[]         // needs_integration: which integrations
    risk?: string              // review_risk: the specific check
    reviewedAt: string
}

const PREFIX_RE = /^(P\d+)\s*·\s*/

interface ReviewCtx {
    integrations: Record<string, boolean>
    statusByTaskId: Map<string, string>
    titleByTaskId: Map<string, string>
    knownTaskIds: Set<string>
}

/** Probe the tenant's real integration connections (mirrors what the executor checks). */
async function gatherIntegrations(agent: MatehAgentRow, instanceId: string): Promise<Record<string, boolean>> {
    const rd: any = agent.researchData || {}
    const wp = await loadWpConfig(instanceId, agent.id).catch(() => null)
    let adsCfg: any = agent.googleAdsConfig
    if (!adsCfg?.customerId) {
        try { adsCfg = (await db.select().from(instances).where(eq(instances.id, instanceId)))[0]?.googleAdsConfig } catch { /* ignore */ }
    }
    let apiKey = false
    try { apiKey = !!(await getApiKeyForInstance(instanceId)) } catch { apiKey = false }
    const gtmTarget = rd.mazhirGtm?.target || {}
    return {
        wordpress: !!wp,
        github: !!((agent as any).githubConfig?.repo || rd.githubConfig?.repo),
        google_ads: !!(adsCfg?.customerId && adsCfg?.developerToken),
        gtm: !!gtmTarget.containerId,
        ga4: !!gtmTarget.measurementId,
        meta: !!((agent as any).metaTokens || rd.metaConfig?.pixelId),
        whatsapp: !!(rd.waConfig?.phoneNumberId || rd.integrationsState?.whatsapp?.connected),
        gbp: !!(rd.gbpConfig?.locationId || rd.integrationsState?.gbp?.connected),
        api_key: apiKey,
    }
}

const INTEGRATION_HE: Record<string, string> = {
    wordpress: 'WordPress', github: 'GitHub', google_ads: 'Google Ads',
    gtm: 'מנהל תגיות (GTM)', ga4: 'Google Analytics 4', meta: 'Meta', whatsapp: 'WhatsApp Business',
    gbp: 'Google Business Profile', api_key: 'מפתח AI',
}

/** Does the capability's `requires` list resolve against current connections?
 * Each entry is AND; '|' inside an entry is OR (e.g. 'wordpress|github'). */
function unmetRequirements(requires: string[], integrations: Record<string, boolean>): string[] {
    const missing: string[] = []
    for (const entry of requires) {
        const opts = entry.split('|')
        if (!opts.some(o => integrations[o.trim()])) missing.push(opts.map(o => INTEGRATION_HE[o.trim()] || o).join(' / '))
    }
    return missing
}

const RISK_AGG = /aggregate\s?rating|aggregaterating|ביקורות.*דפי|דירוג.*סכמ|סכמת.*ביקור|review schema/i
const BIDDING_TARGET = /troas|t-roas|יעד.*roas|roas\s*\d|החזר הוצאה|target_roas/i

// classifyTask matches by TYPE (e.g. experiment→paid.google_ads, measurement→
// tracking.setup, anything→seo.schema), so some tasks LOOK auto but are not
// executable that way. These overrides keep the verdict honest. Ordered;
// checked only for tasks that would otherwise land auto / propose.
const NOT_AUTO: Array<{ re: RegExp; verdict: ReviewVerdict; reasonHe: string; missing?: string[] }> = [
    { re: /\bCRO\b|מפת חום|heatmap|הקלטות מושב|session record|hotjar|clarity/i, verdict: 'manual', reasonHe: 'אודיט CRO (מפות חום / הקלטות מושב) — דורש כלי צד-שלישי (Hotjar/Clarity) והתקנה + ניתוח ידני.' },
    { re: /פיקסל meta|meta.*capi|\bcapi\b|המרות.*meta/i, verdict: 'needs_integration', reasonHe: 'הגדרת Meta Pixel + CAPI — דרושה אינטגרציית Meta (טרם מחוברת).', missing: ['Meta'] },
    { re: /bigquery|מחסן נתונים/i, verdict: 'manual', reasonHe: 'ייצוא ל-BigQuery — דורש פרויקט Google Cloud והגדרה ידנית.' },
    { re: /wikidata|knowledge panel|ישות מותג/i, verdict: 'manual', reasonHe: 'ישות מותג (Wikidata / Knowledge Panel) — עריכה חיצונית, לא אוטומטית באתר.' },
    { re: /ניטור.*sitemap|sitemap.*ניטור|הגשה אוטומטית.*gsc/i, verdict: 'manual', reasonHe: 'ניטור sitemap / הגשה ל-GSC — תהליך תשתית מתמשך, לא פעולת אתר חד-פעמית.' },
    { re: /מעקב ציטוט|ציטוט.*מנוע|מנוע.*ציטוט|prompts?\s*[×x]\s*\d/i, verdict: 'manual', reasonHe: 'מעקב ציטוטים ב-AI — מדידה תקופתית חיצונית, לא פעולת אתר אוטומטית.' },
    { re: /רבעוני|quarterly|לוח רענון/i, verdict: 'manual', reasonHe: 'לוח רענון תוכן רבעוני — מסמך תכנון, לא ביצוע אוטומטי בודד.' },
    { re: /youtube|ערוץ.*וידאו/i, verdict: 'manual', reasonHe: 'הקמת ערוץ YouTube + העלאה — דורש פעולה ידנית בפלטפורמה חיצונית.' },
]

function computeVerdict(task: MonthlyTask, capabilityId: string, autonomy: string, requires: string[], ctx: ReviewCtx): TaskReview {
    const base = { capabilityId, autonomy, reviewedAt: new Date().toISOString() }
    const title = task.title || ''

    // 1) external / no automatable capability → human executes
    let external = false
    try { external = isExternalOutreachTask(task) } catch { /* ignore */ }
    if (autonomy === 'manual') {
        return { ...base, verdict: 'manual', reasonHe: external ? 'פעולה חיצונית (יחסי ציבור / קישורים / אינדקסים) — דורשת ביצוע אנושי.' : 'אין יכולת אוטומציה לפעולה זו — דורשת ביצוע ידני.' }
    }

    // 2) dependency satisfaction (dep must be completed; dangling = blocked)
    const deps: string[] = (task as any).dependsOn || []
    const blockers: string[] = []
    for (const d of deps) {
        if (!ctx.knownTaskIds.has(d)) { blockers.push(`תלות חסרה (${d})`); continue }
        const st = ctx.statusByTaskId.get(d)
        if (st !== 'completed') blockers.push(ctx.titleByTaskId.get(d) || d)
    }
    if (blockers.length) {
        return { ...base, verdict: 'defer', reasonHe: `ממתין להשלמת תלות: ${blockers.slice(0, 2).join('; ')}${blockers.length > 2 ? '…' : ''}.`, readyWhen: blockers.join('; ') }
    }

    // 3) required integration connected?
    const missing = unmetRequirements(requires, ctx.integrations)
    if (missing.length) {
        return { ...base, verdict: 'needs_integration', reasonHe: `דרוש חיבור: ${missing.join(', ')}. לאחר החיבור ניתן להריץ אוטומטית.`, missing }
    }

    // 4) on-site risk that needs human verification before applying
    if (capabilityId === 'seo.schema' && RISK_AGG.test(title)) {
        return { ...base, verdict: 'review_risk', reasonHe: 'סכמת דירוג/ביקורות — להוסיף רק אם יש ביקורות אמיתיות גלויות בדף, אחרת סיכון לעונש Structured-Data מ-Google.', risk: 'aggregate_rating_needs_real_reviews' }
    }
    // bidding-target tasks: never recommend before conversion data accrues (deps
    // usually catch this; this is the belt-and-suspenders for a loose plan)
    if (capabilityId === 'paid.google_ads' && BIDDING_TARGET.test(title)) {
        return { ...base, verdict: 'defer', reasonHe: 'מעבר ליעד ROAS — רק אחרי צבירת ≥30 רכישות נקיות תחת המעקב החדש ואימות שיעור המרה. מוקדם מדי כעת.', readyWhen: 'צבירת ≥30 רכישות + אימות CR 14 יום' }
    }

    // 4.5) honesty override: TYPE-matched as auto but not actually executable
    // that way (CRO tooling, Meta CAPI, BigQuery, Wikidata, sitemap monitoring…).
    for (const p of NOT_AUTO) {
        if (p.re.test(title)) return { ...base, verdict: p.verdict, reasonHe: p.reasonHe, missing: p.missing }
    }

    // 5) propose-only capability — produces a concrete suggestion, user applies
    if (autonomy === 'propose_only') {
        return { ...base, verdict: 'propose', reasonHe: `מייצר הצעה קונקרטית (${capabilityId}) — לא כותב ישירות; מאשרים ומיישמים.` }
    }

    // 6) clean auto
    return { ...base, verdict: 'recommend_now', reasonHe: `מוכן להרצה: יכולת ${capabilityId} מחוברת, תלויות הושלמו, ללא סיכון מיוחד.` }
}

export interface ReviewResult {
    status: 'ok' | 'no_plan' | 'error'
    reason?: string
    scanned?: number
    byVerdict?: Record<string, number>
    reviews?: Array<{ title: string; priority: string; channel: string; verdict: ReviewVerdict; reasonHe: string }>
    dryRun?: boolean
}

/** Review the latest saved plan's tasks for an agent; write metadata.agentReview. */
export async function reviewSavedPlan(agent: MatehAgentRow, opts: { dryRun?: boolean } = {}): Promise<ReviewResult> {
    const dryRun = !!opts.dryRun
    const instanceId = agent.vpsInstanceId
    const since = new Date(Date.now() - 36 * 3600 * 1000)
    const rows = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agent.id), eq(agentOutputs.outputType, 'monthly_task'), gt(agentOutputs.createdAt, since))) as any[]
    if (!rows.length) return { status: 'no_plan', reason: 'no recent monthly_task rows' }
    let latestGen = ''
    for (const r of rows) { const g = (r.metadata as any)?.monthlyPlanGeneratedAt || ''; if (g > latestGen) latestGen = g }
    const planRows = rows.filter(r => (r.metadata as any)?.monthlyPlanGeneratedAt === latestGen)

    const integrations = await gatherIntegrations(agent, instanceId)
    const statusByTaskId = new Map<string, string>()
    const titleByTaskId = new Map<string, string>()
    const knownTaskIds = new Set<string>()
    for (const r of planRows) {
        const md: any = r.metadata || {}
        if (md.taskId) { knownTaskIds.add(md.taskId); statusByTaskId.set(md.taskId, r.status); titleByTaskId.set(md.taskId, (r.title || '').replace(PREFIX_RE, '')) }
    }
    const ctx: ReviewCtx = { integrations, statusByTaskId, titleByTaskId, knownTaskIds }

    const { CAPABILITIES } = await import('@/services/executorCapabilities')
    const byVerdict: Record<string, number> = {}
    const reviews: ReviewResult['reviews'] = []
    for (const r of planRows) {
        const md: any = r.metadata || {}
        let c: any = r.content
        if (typeof c === 'string') { try { c = JSON.parse(c) } catch { c = {} } }
        const task = {
            id: md.taskId, title: (r.title || '').replace(PREFIX_RE, ''), summary: c.summary,
            type: md.type, channel: md.channel, priority: md.priority, dependsOn: md.dependsOn || [],
            actionPlan: c.actionPlan, expectedImpact: c.expectedImpact,
        } as unknown as MonthlyTask
        const { capabilityId, autonomy } = classifyTask(task)
        // capability's declared integration prerequisites (for needs_integration)
        const requires = CAPABILITIES.find(cp => cp.id === capabilityId)?.requires || []
        const review = computeVerdict(task, capabilityId, autonomy, requires, ctx)
        byVerdict[review.verdict] = (byVerdict[review.verdict] || 0) + 1
        reviews.push({ title: (r.title || ''), priority: md.priority || '', channel: md.channel || '', verdict: review.verdict, reasonHe: review.reasonHe })
        if (!dryRun) {
            await db.update(agentOutputs).set({ metadata: { ...md, agentReview: review } }).where(eq(agentOutputs.id, r.id))
        }
    }
    console.log(`[monthlyPlanReview] ${agent.id}: ${dryRun ? 'DRY ' : ''}reviewed ${planRows.length} tasks · ${JSON.stringify(byVerdict)} (gen=${latestGen})`)
    return { status: 'ok', scanned: planRows.length, byVerdict, reviews, dryRun }
}

/** Convenience: load agent row by id, then review. */
export async function reviewSavedPlanForAgent(agentId: string, opts: { dryRun?: boolean } = {}): Promise<ReviewResult> {
    const { matehAgents } = await import('@/db/schema')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    if (!agent) return { status: 'error', reason: `agent_not_found:${agentId}` }
    return reviewSavedPlan(agent as MatehAgentRow, opts)
}