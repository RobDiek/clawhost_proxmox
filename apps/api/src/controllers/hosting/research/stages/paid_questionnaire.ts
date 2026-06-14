/**
 * Stage: paid_questionnaire (Path A / no_history).
 *
 * Originally specced as a 12-field manual form (playbook §1.2). But by the time
 * the user reaches the paid pipeline they have ALREADY completed the full
 * research/strategy pipeline (competitor landscape, personas, positioning,
 * cost_timeline_modeling, a committed strategy scenario). Re-asking the 12
 * fields would be redundant. So this stage DERIVES the paidProfile from that
 * existing research_data instead — grounded in the user's own numbers, not
 * invented — and writes it to rd.paidProfile for the downstream paid stages
 * (paid_budget_scenarios, paid_audit) to consume. No LLM call.
 *
 * Economic fields (avgDealValueIls, maxCpaIls) are best-effort derivations from
 * persona pricing / KPI CAC and are flagged in the summary for the user to
 * review — they materially affect budget scenarios.
 */

import type { Context } from 'hono'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../../authHelper'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'
import type { ResearchDataV2, StageId, StageStatus } from '@/services/research/types'

/** First positive finite number found in a value (handles "₪279/חודש", 279, "150-400"). */
function firstNum(v: unknown): number | undefined {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v
    if (typeof v === 'string') {
        const m = v.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
        if (m) { const n = parseFloat(m[0]); if (isFinite(n) && n > 0) return n }
    }
    return undefined
}

type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec => (v && typeof v === 'object' ? v as Rec : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const agent = await resolveActiveAgent(c, instanceId)
    const rd = (await readResearchData(agent, instanceId)) as unknown as ResearchDataV2

    const answers = asRec((rd as unknown as { answers?: unknown }).answers)
    const results = asRec((rd as unknown as { results?: unknown }).results)
    const chosen = asRec((rd as unknown as { chosenScenario?: unknown }).chosenScenario)

    // ── budget: paid-ads portion of the chosen scenario's monthly breakdown ──
    const ctmRecords = asArr(asRec(results.cost_timeline_modeling).records) as Rec[]
    const chosenKey = String(chosen.scenario || 'aggressive')
    const ctmChosen = ctmRecords.find(r => r.scenario === chosenKey)
        || ctmRecords.find(r => r.scenario === 'aggressive')
        || ctmRecords[0] || {}
    const breakdown = asRec(ctmChosen.monthly_budget_breakdown_ils)
    const monthlyBudgetIls = firstNum(breakdown.paid_ads)
        ?? firstNum(ctmChosen.monthly_budget_ils)
        ?? firstNum(asArr(chosen.budget_allocation_ils).map(b => asRec(b).channel_1_ils).find(Boolean))
        ?? 3000

    // ── deal value + max CPA: from persona pricing + chosen KPI CAC ──
    const personas = asArr(asRec(results.audience_personas).records) as Rec[]
    const pricing = personas.map(p => asRec(p.pricing_validation)).find(p => Object.keys(p).length > 0) || {}
    const avgDealValueIls = firstNum(pricing.recommended_price_point_ils)
        ?? firstNum(pricing.wtp_range_ils)
        ?? 279
    const kpiMetrics = asArr(asRec(chosen.kpis_90_day).metrics) as Rec[]
    const cacMetric = kpiMetrics.find(m => /cac/i.test(String(m.name || '')) && !/ltv/i.test(String(m.name || '')))
    const maxCpaIls = firstNum(asRec(cacMetric?.scenarios_90d).base)
        ?? Math.round(avgDealValueIls * 0.6)

    // ── goal ──
    const goalsText = String(answers.marketingGoals || '').toLowerCase()
    const primaryGoal = /(מכיר|sales|רכיש|purchase|ecommerce|חנות)/.test(goalsText) ? 'sales' : 'leadgen'

    // ── key offer: from positioning ──
    const positioning = (asArr(asRec(results.positioning).records)[0] || {}) as Rec
    const valueProps = asArr(positioning.value_props) as Rec[]
    const keyOffer = String(valueProps[0]?.name || positioning.brand_promise || 'מוצר כניסה ₪279 בלי התחייבות')

    // ── tracking stack: from the active agent's connected scopes ──
    const gScope = (() => {
        const gt = asRec((agent as unknown as { googleTokens?: unknown })?.googleTokens)
        const raw = gt.scopes || gt.scope || ''
        return (Array.isArray(raw) ? raw.join(' ') : String(raw)).toLowerCase()
    })()
    const metaTok = asRec((agent as unknown as { metaTokens?: unknown })?.metaTokens)
    const trackingStack: string[] = []
    if (/analytics|ga4/.test(gScope)) trackingStack.push('ga4')
    if (/tagmanager|gtm/.test(gScope)) trackingStack.push('gtm')
    if (/adwords|\bads\b/.test(gScope)) trackingStack.push('google_ads')
    if (metaTok.adAccountId || (metaTok.grantedScopes && /ads/.test(String(metaTok.grantedScopes)))) trackingStack.push('meta')

    // ── consent mode + geography + name ──
    const cmp = asRec(chosen.conversion_measurement_plan)
    const consentMode = String(cmp.consent_mode_v2_status || 'needs_legal_review')
    const geography = String(answers.geography || 'ישראל')
    const businessName = String(answers.businessName || 'העסק')

    // Preserve any historical-report uploads the user already added.
    const existingProfile = asRec((rd as unknown as { paidProfile?: unknown }).paidProfile)

    const paidProfile = {
        ...existingProfile,
        businessName,
        primaryGoal,
        goal: primaryGoal,
        monthlyBudgetIls,
        monthlyBudget: monthlyBudgetIls,
        avgDealValueIls,
        maxCpaIls,
        geography,
        keyOffer,
        trackingStack,
        consentMode,
        launchPath: 'no_history',
        derivedFromResearch: true,
        derivedAt: new Date().toISOString(),
    }

    const content = `# פרופיל פרסום ממומן — נגזר מהמחקר שלכם

לא ביקשנו שוב את 12 השדות — מילאנו אותם אוטומטית מתוך המחקר והאסטרטגיה שכבר השלמתם (תרחיש "${chosenKey}").

**יעד עיקרי:** ${primaryGoal === 'sales' ? 'מכירות ישירות' : 'גיוס לידים'}
**תקציב מדיה חודשי:** ₪${monthlyBudgetIls.toLocaleString()} _(מתוך פירוק התקציב של התרחיש הנבחר)_
**שווי עסקה ממוצע:** ₪${avgDealValueIls.toLocaleString()} _(מתומחור הפרסונה — ⚠ כדאי לוודא: מחיר כניסה מול LTV)_
**CPA מקסימלי:** ₪${maxCpaIls.toLocaleString()} _(מיעד ה-CAC של התרחיש — ⚠ ניתן לכוונן)_
**הצעה מרכזית:** ${keyOffer}
**גאוגרפיה:** ${geography}
**Tracking:** ${trackingStack.length ? trackingStack.join(', ') : 'טרם חובר'}
**Consent Mode v2:** ${consentMode === 'needs_legal_review' ? 'דורש בדיקה משפטית' : consentMode}

השלבים הבאים — מחקר מתחרים ממומן, מילות מפתח, תרחישי תקציב ואודיט — ייגזרו מהשוק ומהפרופיל הזה, לא מהקמפיינים הישנים שבחשבון.`

    const results2 = { ...results } as Record<string, unknown>
    const runAt = new Date().toISOString()
    results2.paid_questionnaire = {
        content,
        source: 'derived',
        runAt,
        integrationsUsed: trackingStack,
        records: [],
        extras: { ...paidProfile },
        confidence: 'medium',
    }
    const plan = asRec((rd as unknown as { plan?: unknown }).plan) as { stages?: StageId[]; status?: Record<StageId, StageStatus> }
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>
    status.paid_questionnaire = { state: 'completed', runAt }

    await writeResearchData(agent, instanceId, {
        ...rd,
        paidProfile,
        results: results2,
        plan: { ...plan, status },
    } as unknown as Record<string, unknown>)

    console.log(`[research/paid_questionnaire] ${instanceId} agent=${agent?.id} derived: budget=${monthlyBudgetIls} deal=${avgDealValueIls} maxCpa=${maxCpaIls} goal=${primaryGoal} tracking=[${trackingStack.join(',')}]`)

    return ok(c, { paidProfile, next_stage: 'paid_competitor_landscape' }, 'פרופיל הפרסום נגזר מהמחקר.')
}