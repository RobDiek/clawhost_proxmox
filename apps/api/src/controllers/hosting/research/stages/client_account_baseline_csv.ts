/**
 * Stage: client_account_baseline_csv (Path B-2 — has_history + no integration).
 *
 * Mirrors client_account_baseline.ts but builds the account baseline from the
 * uploaded/parsed CSVs (csvAggregator) instead of the live Google Ads + GA4
 * APIs. Writes the SAME schema to rd.results.client_account_baseline — the key
 * downstream stages (paid_keyword_research, paid_budget_scenarios, paid_audit)
 * already read — so they don't need to know the data came from CSV. Also writes
 * its own rd.results.client_account_baseline_csv for the pipeline board card.
 * No LLM call.
 */

import type { Context } from 'hono'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../../authHelper'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'
import type { StageId, StageStatus } from '@/services/research/types'

type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec => (v && typeof v === 'object' ? v as Rec : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const round2 = (n: number): number => Math.round(n * 100) / 100

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const agent = await resolveActiveAgent(c, instanceId)
    const rd = await readResearchData(agent, instanceId) as Rec
    const reports = asArr(asRec(rd.paidProfile).historicalReports) as Array<{ name: string; type: string; base64: string }>
    if (reports.filter(r => /csv/i.test(r.type) || /\.csv$/i.test(r.name || '')).length === 0) {
        return fail(c, 'אין דוחות CSV. הריצו תחילה את שלב "קליטת דוחות CSV" (paid_csv_ingest) לאחר העלאת הדוחות.', 422)
    }

    const { aggregateAllCsvs, renderCsvAggregateContext } = await import('@/services/csvAggregator')
    const aggs = aggregateAllCsvs(reports)

    // Sum the Google Ads campaign/keyword/search-term aggregates into one
    // account-level total (the live baseline's accountMetrics equivalent).
    const adsAggs = aggs.filter(a => /^google_ads_/.test(a.detectedShape) && a.totals)
    let cost = 0, clicks = 0, conversions = 0, impressions = 0
    for (const a of adsAggs) {
        const t = a.totals || {}
        cost += Number(t.cost || 0)
        clicks += Number(t.clicks || 0)
        conversions += Number(t.conversions || 0)
        impressions += Number(t.impressions || 0)
    }
    const hasAds = adsAggs.length > 0 && (cost > 0 || clicks > 0)
    const accountMetrics = hasAds
        ? {
            available: true,
            cost: round2(cost),
            clicks,
            conversions: round2(conversions),
            impressions,
            avgCpcIls: clicks > 0 ? round2(cost / clicks) : undefined,
            conversionRatePct: clicks > 0 ? round2((conversions / clicks) * 100) : undefined,
            cpaIls: conversions > 0 ? round2(cost / conversions) : undefined,
            source: 'csv_upload',
            periodNote: '90 ימים (לפי הדוחות שהועלו)',
        }
        : { available: false, reason: 'לא נמצאו נתוני Google Ads בדוחות שהועלו' }

    const context = renderCsvAggregateContext(aggs)
    const content = `# ביסוס נתוני חשבון — מתוך דוחות CSV\n\n${hasAds
        ? `**Google Ads (מצטבר מהדוחות):** עלות ₪${accountMetrics.cost?.toLocaleString()} · ${clicks.toLocaleString()} קליקים · ${round2(conversions)} המרות` +
          (accountMetrics.avgCpcIls ? ` · CPC ממוצע ₪${accountMetrics.avgCpcIls}` : '') +
          (accountMetrics.cpaIls ? ` · CPA ₪${accountMetrics.cpaIls}` : '') +
          (accountMetrics.conversionRatePct ? ` · CR ${accountMetrics.conversionRatePct}%` : '')
        : '**Google Ads:** לא נמצאו נתונים בדוחות. שלבי התקציב יסתמכו על benchmarks של הענף במקום על נתוני החשבון.'}\n\n${context}`

    const baselineResult = {
        content,
        source: 'csv',
        runAt: new Date().toISOString(),
        integrationsUsed: [],
        records: [],
        dfsData: { googleAds: { accountMetrics } },
        extras: { fromCsv: true, accountMetrics },
        confidence: hasAds ? 'medium' : 'working_hypothesis',
    }

    const results = { ...(asRec(rd.results)) }
    results.client_account_baseline_csv = baselineResult
    // Mirror into the canonical key downstream stages already read.
    results.client_account_baseline = baselineResult
    const plan = asRec(rd.plan) as { stages?: StageId[]; status?: Record<StageId, StageStatus> }
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>
    const runAt = baselineResult.runAt
    status.client_account_baseline_csv = { state: 'completed', runAt }

    await writeResearchData(agent, instanceId, { ...rd, results, plan: { ...plan, status } })
    console.log(`[research/client_account_baseline_csv] ${instanceId} agent=${agent?.id} hasAds=${hasAds} cost=${round2(cost)} clicks=${clicks} conv=${round2(conversions)}`)

    return ok(c, {
        ...baselineResult,
        status: { state: 'completed', runAt },
        accountMetrics,
        next_stage: 'paid_competitor_landscape',
    }, 'בוסס בסיס הנתונים מהדוחות.')
}