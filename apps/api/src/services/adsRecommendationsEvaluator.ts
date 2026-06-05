/**
 * Google Ads Recommendations Evaluator — systemic, all tenants.
 *
 * Reads Google's full recommendation feed, evaluates EACH against OUR strategy +
 * the tenant's conversion-DATA MATURITY, and emits a verdict per recommendation:
 *   apply   — safe + aligned (additive ad/asset improvements). Recommended to apply.
 *   propose — judgment needed (budget↑, keywords, bidding when data is mature).
 *   defer   — strategy/state-gated (bidding-strategy changes while conversion data
 *             is still maturing — e.g. right after an attribution fix; applying now
 *             would STARVE smart bidding). Revisit when mature.
 *   reject  — conflicts with our approach (broad-match dilution, search-partners…).
 *
 * Why not blind auto-apply: Google's optimization score pushes tROAS/tCPA the
 * moment ANY conversions exist — but on thin or just-corrected data that wrecks
 * bidding. Our evaluator gates bidding recs on real data maturity. Output is an
 * approval task (per platform policy every external write is user-approved); the
 * apply itself runs on approval via applyRecommendationByResource().
 */
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'

const ADS = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Recommendation types we read + how we treat each family.
const BIDDING = new Set(['TARGET_ROAS_OPT_IN', 'TARGET_CPA_OPT_IN', 'MAXIMIZE_CONVERSION_VALUE_OPT_IN', 'MAXIMIZE_CONVERSIONS_OPT_IN', 'RAISE_TARGET_CPA', 'LOWER_TARGET_ROAS', 'FORECASTING_SET_TARGET_ROAS', 'FORECASTING_SET_TARGET_CPA', 'SET_TARGET_ROAS', 'SET_TARGET_CPA', 'IMPROVE_TARGET_CPA', 'ENHANCED_CPC_OPT_IN', 'MAXIMIZE_CLICKS_OPT_IN'])
const BUDGET = new Set(['CAMPAIGN_BUDGET', 'MOVE_UNUSED_BUDGET', 'FORECASTING_CAMPAIGN_BUDGET', 'MARGINAL_ROI_CAMPAIGN_BUDGET'])
const ADS_ASSETS = new Set(['RESPONSIVE_SEARCH_AD', 'TEXT_AD', 'SITELINK_ASSET', 'CALLOUT_ASSET', 'CALL_ASSET', 'STRUCTURED_SNIPPET_ASSET', 'RESPONSIVE_SEARCH_AD_ASSET', 'IMPROVE_RESPONSIVE_SEARCH_AD', 'LEAD_FORM_ASSET', 'IMPROVE_PERFORMANCE_MAX_AD_STRENGTH', 'RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH', 'IMPROVE_DEMAND_GEN_AD_STRENGTH'])
const KEYWORDS = new Set(['KEYWORD', 'KEYWORD_MATCH_TYPE', 'OPTIMIZE_AD_ROTATION'])
const RISKY = new Set(['USE_BROAD_MATCH_KEYWORD', 'SEARCH_PARTNERS_OPT_IN', 'DISPLAY_EXPANSION_OPT_IN', 'UPGRADE_SMART_SHOPPING_CAMPAIGN_TO_PERFORMANCE_MAX', 'UPGRADE_LOCAL_CAMPAIGN_TO_PERFORMANCE_MAX', 'PERFORMANCE_MAX_OPT_IN', 'SEARCH_PLUS_OPT_IN', 'AI_MAX'])

export type Verdict = 'apply' | 'propose' | 'defer' | 'reject'
export interface RecVerdict {
    type: string
    resourceName: string
    category: 'bidding' | 'budget' | 'ad_asset' | 'keyword' | 'risky' | 'other'
    verdict: Verdict
    reason: string
    impact: { conversions?: number; convValue?: number; costIls?: number }
}
export interface EvalResult {
    ok: boolean
    error?: string
    maturity: { mature: boolean; conversions14d: number; healthScore: number; reason: string }
    verdicts: RecVerdict[]
    summary: { apply: number; propose: number; defer: number; reject: number; total: number }
    taskId?: string
}

interface AdsCtx { operating: string; manager: string; dev: string; at: string }

async function accessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || '', csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as any).access_token || null
    } catch { return null }
}

async function resolveAdsCtx(agent: MatehAgentRow): Promise<AdsCtx | null> {
    const cfg: any = (agent.googleAdsConfig as any) || (await db.select().from(instances).where(eq(instances.id, agent.vpsInstanceId)))[0]?.googleAdsConfig || {}
    const manager = String(cfg.customerId || '')
    const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager)
    const dev = cfg.developerToken
    const rt = (agent.googleTokens as any)?.refreshToken || (agent.googleTokens as any)?.refresh_token
    if (!operating || !dev || !rt) return null
    const at = await accessToken(rt)
    return at ? { operating, manager, dev, at } : null
}

async function adsSearch(ctx: AdsCtx, query: string): Promise<any[]> {
    const headers: Record<string, string> = { Authorization: `Bearer ${ctx.at}`, 'developer-token': ctx.dev, 'Content-Type': 'application/json' }
    if (ctx.manager && ctx.manager !== ctx.operating) headers['login-customer-id'] = ctx.manager
    const r = await fetch(`${ADS}/customers/${ctx.operating}/googleAds:search`, { method: 'POST', headers, body: JSON.stringify({ query }) })
    const j = await r.json() as any
    if (!r.ok) throw new Error(`Ads ${r.status}: ${(j?.error?.message || '').slice(0, 200)}`)
    return j.results || []
}

function impactOf(rec: any): RecVerdict['impact'] {
    const pot = rec.impact?.potentialMetrics || {}, base = rec.impact?.baseMetrics || {}
    const d = (k: string) => Math.round((Number(pot[k] || 0) - Number(base[k] || 0)))
    return { conversions: d('conversions'), convValue: Math.round((Number(pot.conversionsValue || 0) - Number(base.conversionsValue || 0))), costIls: Math.round((Number(pot.costMicros || 0) - Number(base.costMicros || 0)) / 1e6) }
}

/** Conversion-data maturity: enough recent conversions + healthy tracking to
 * trust a bidding-strategy change. */
async function assessMaturity(agent: MatehAgentRow, ctx: AdsCtx): Promise<EvalResult['maturity']> {
    // Count ONLY this tenant's PRIMARY purchase conversions (what smart bidding
    // learns from) — NOT the whole shared operating account (which mixes sibling
    // brands + forms and would falsely look "mature").
    const brand = String(agent.name || '').toLowerCase().split(/\s+/)[0] || ''
    let conversions14d = 0
    try {
        const rows = await adsSearch(ctx, `SELECT conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, metrics.conversions FROM conversion_action WHERE segments.date DURING LAST_14_DAYS`)
        for (const r of rows) {
            const ca = r.conversionAction || {}
            const name = String(ca.name || '').toLowerCase()
            if (ca.category === 'PURCHASE' && ca.primaryForGoal && (!brand || name.includes(brand))) {
                conversions14d += Number(r.metrics?.conversions || 0)
            }
        }
    } catch { /* ignore */ }
    let healthScore = 0
    try {
        const { runTrackingHealthCheck } = await import('@/services/trackingHealthCheck')
        healthScore = (await runTrackingHealthCheck(agent.vpsInstanceId, agent.id)).score
    } catch { /* ignore */ }
    // Smart bidding wants ~15-30 conversions / 30d to learn; on shared accounts +
    // a fresh attribution fix, be conservative: require ≥20 in 14d AND health ≥70.
    const mature = conversions14d >= 20 && healthScore >= 70
    const reason = mature
        ? `conversions(14d)=${Math.round(conversions14d)} ≥20 + tracking ${healthScore}/100 — bidding changes can be trusted`
        : `conversions(14d)=${Math.round(conversions14d)} (<20) / tracking ${healthScore}/100 — data still maturing (e.g. post attribution-fix); bidding changes would starve`
    return { mature, conversions14d: Math.round(conversions14d), healthScore, reason }
}

function categoryOf(type: string): RecVerdict['category'] {
    if (BIDDING.has(type)) return 'bidding'
    if (BUDGET.has(type)) return 'budget'
    if (ADS_ASSETS.has(type)) return 'ad_asset'
    if (KEYWORDS.has(type)) return 'keyword'
    if (RISKY.has(type)) return 'risky'
    return 'other'
}

function evaluate(rec: any, type: string, maturity: EvalResult['maturity']): RecVerdict {
    const category = categoryOf(type)
    const impact = impactOf(rec)
    const resourceName = rec.resourceName || ''
    let verdict: Verdict = 'propose'
    let reason = ''
    switch (category) {
        case 'bidding':
            verdict = maturity.mature ? 'propose' : 'defer'
            reason = maturity.mature
                ? `שינוי אסטרטגיית הצעות — הנתונים בשלים (${maturity.conversions14d} המרות/14 ימים). מומלץ לבחון מול האסטרטגיה שבחרתם לפני יישום.`
                : `דחייה: ${maturity.reason}. אסטרטגיית הצעות חכמה (tROAS/tCPA) דורשת נתוני המרה בשלים — יישום עכשיו "ירעיב" את ה-bidding. נחזור לזה בעוד ~2-3 שבועות.`
            break
        case 'budget':
            verdict = maturity.mature ? 'propose' : 'defer'
            reason = maturity.mature
                ? `הגדלת/העברת תקציב — שקלו רק אם ה-ROAS בריא ויש ביקוש. הצעה לאישור.`
                : `דחייה: הנתונים עדיין מתבססים — אל תגדילו תקציב על סמך bidding לא בשל.`
            break
        case 'ad_asset':
            verdict = 'apply'
            reason = `שיפור מודעה/נכסים (תוספת תוסף/וריאציה) — חיובי ובטוח (לא נוגע ב-bidding). מומלץ ליישם. ודאו התאמה לקול המותג.`
            break
        case 'keyword':
            verdict = 'propose'
            reason = `מילות מפתח / רוטציית מודעות — לאישור: בדקו רלוונטיות מותגית והתאמה לכוונת קנייה.`
            break
        case 'risky':
            verdict = 'reject'
            reason = `דילול תנועה (broad match / Search Partners / Display / PMax / AI Max) — נדחה כברירת מחדל: פוגע באיכות התנועה. ליישום רק בהחלטה מפורשת.`
            break
        default:
            verdict = 'propose'
            reason = `סוג המלצה לא מסווג — לבחינה ידנית.`
    }
    return { type, resourceName, category, verdict, reason, impact }
}

export async function evaluateAdsRecommendations(agent: MatehAgentRow, opts: { createTask?: boolean } = {}): Promise<EvalResult> {
    const result: EvalResult = { ok: false, maturity: { mature: false, conversions14d: 0, healthScore: 0, reason: '' }, verdicts: [], summary: { apply: 0, propose: 0, defer: 0, reject: 0, total: 0 } }
    const ctx = await resolveAdsCtx(agent)
    if (!ctx) { result.error = 'google_ads_not_connected'; return result }

    result.maturity = await assessMaturity(agent, ctx)

    // Read ALL recommendation types (no WHERE — invalid enum names 400 the query;
    // classify whatever Google returns via categoryOf).
    let recs: any[]
    try {
        recs = await adsSearch(ctx, `SELECT recommendation.type, recommendation.resource_name, recommendation.impact FROM recommendation`)
    } catch (e) { result.error = `read_recommendations: ${(e as Error).message}`; return result }

    for (const row of recs) {
        const rec = row.recommendation || {}
        const type = rec.type || 'UNKNOWN'
        const v = evaluate(rec, type, result.maturity)
        result.verdicts.push(v)
        result.summary[v.verdict]++
    }
    result.summary.total = result.verdicts.length
    result.ok = true

    // Persist latest evaluation on the agent for the dashboard + audit trail.
    try {
        const { mutateResearchData } = await import('./agentContext')
        await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
            const c = cur || {}
            c.adsRecommendations = { evaluatedAt: new Date().toISOString(), maturity: result.maturity, summary: result.summary, verdicts: result.verdicts }
            return c
        })
    } catch { /* best-effort */ }

    // Create ONE approval task summarising the actionable recommendations.
    if (opts.createTask && result.verdicts.length) {
        try {
            const apply = result.verdicts.filter(v => v.verdict === 'apply')
            const defer = result.verdicts.filter(v => v.verdict === 'defer')
            const propose = result.verdicts.filter(v => v.verdict === 'propose')
            const lines = result.verdicts.map(v => `${v.verdict === 'apply' ? '✅' : v.verdict === 'propose' ? '🟡' : v.verdict === 'defer' ? '⏸️' : '🚫'} [${v.type}] ${v.reason}`).join('\n')
            // Human-readable Hebrew rendering (convention: content.displayHe) so the
            // kabinet shows a readable card, not a raw-JSON dump.
            const m = result.maturity
            const displayHe = [
                '## המלצות Google Ads',
                '',
                `**בשלות נתונים:** ${m.conversions14d} המרות ב-14 ימים · בריאות מעקב ${m.healthScore}/100 · ${m.mature ? 'בשל ✅' : 'עדיין נצבר ⏳'}`,
                m.reason ? `_${m.reason}_` : '',
                '',
                `**סיכום:** ${apply.length} ליישום · ${propose.length} לבחינה · ${defer.length} בהמתנה · ${result.summary.reject} נדחו`,
                '',
                '### פירוט ההמלצות',
                lines,
            ].filter(Boolean).join('\n')
            const [row] = await db.insert(agentOutputs).values({
                id: 'rec_' + randomBytes(6).toString('hex'),
                instanceId: agent.vpsInstanceId,
                agentId: agent.id,
                agentRole: 'mazhir',
                outputType: 'ads_recommendations_review',
                platform: 'google_ads',
                status: 'pending_review',
                title: `המלצות Google Ads — ${apply.length} ליישום · ${propose.length} לבחינה · ${defer.length} בהמתנה`,
                content: JSON.stringify({ displayHe, maturity: result.maturity, summary: result.summary, verdicts: result.verdicts, narrative: lines }, null, 2).slice(0, 12000),
                metadata: { evaluatedAt: new Date().toISOString(), applyResourceNames: apply.map(a => a.resourceName), maturity: result.maturity } as any,
            }).returning()
            result.taskId = row?.id
        } catch (e) { console.warn('[adsRecEvaluator] task create failed:', (e as Error).message) }
    }
    return result
}

/** Apply one recommendation by resource name (called on user approval). */
export async function applyRecommendationByResource(agent: MatehAgentRow, resourceName: string): Promise<{ ok: boolean; error?: string }> {
    const ctx = await resolveAdsCtx(agent)
    if (!ctx) return { ok: false, error: 'google_ads_not_connected' }
    try {
        const headers: Record<string, string> = { Authorization: `Bearer ${ctx.at}`, 'developer-token': ctx.dev, 'Content-Type': 'application/json' }
        if (ctx.manager && ctx.manager !== ctx.operating) headers['login-customer-id'] = ctx.manager
        const r = await fetch(`${ADS}/customers/${ctx.operating}/recommendations:apply`, { method: 'POST', headers, body: JSON.stringify({ operations: [{ resourceName }] }) })
        if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}` }
        return { ok: true }
    } catch (e) { return { ok: false, error: (e as Error).message } }
}

/** Convenience for scripts/cron. */
export async function runEvaluatorForAgent(agentId: string, opts: { createTask?: boolean } = {}): Promise<EvalResult> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ok: false, error: `agent_not_found:${agentId}`, maturity: { mature: false, conversions14d: 0, healthScore: 0, reason: '' }, verdicts: [], summary: { apply: 0, propose: 0, defer: 0, reject: 0, total: 0 } }
    return evaluateAdsRecommendations(agent as MatehAgentRow, opts)
}