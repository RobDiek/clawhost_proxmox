/**
 * Stage: paid_csv_ingest (Path B-2 — has_history + no live integration).
 *
 * The actual CSV parsing already exists and runs at upload time
 * (uploadHistoricalReports → ingestFile + csvAggregator). This stage is the
 * pipeline-board representation: it reads the CSV reports the user already
 * uploaded to paidProfile.historicalReports, aggregates them via the existing
 * csvAggregator, validates that something usable is present, and persists a
 * normalized summary to rd.results.paid_csv_ingest for the board + downstream.
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

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const agent = await resolveActiveAgent(c, instanceId)
    const rd = await readResearchData(agent, instanceId) as Rec
    const reports = asArr(asRec(rd.paidProfile).historicalReports) as Array<{ name: string; type: string; base64: string }>
    const csvReports = reports.filter(r => /csv/i.test(r.type) || /\.csv$/i.test(r.name || ''))
    if (csvReports.length === 0) {
        return fail(
            c,
            'לא נמצאו קבצי CSV שהועלו. העלו תחילה דוחות CSV (Google Ads / Meta / GA4) דרך כפתור "העלאת CSV" בפאנל הכנת הנתונים, ואז הריצו שלב זה.',
            422,
        )
    }

    const { aggregateAllCsvs, renderCsvAggregateContext } = await import('@/services/csvAggregator')
    const aggs = aggregateAllCsvs(reports)
    const usable = aggs.filter(a => a.detectedShape !== 'unknown' && a.rowCount > 0)
    const context = renderCsvAggregateContext(aggs)

    const fileList = aggs.map(a => `• ${a.fileName} — ${a.detectedShape} (${a.rowCount} שורות)`).join('\n')
    const content = `# קליטת דוחות CSV\n\nנקלטו ${aggs.length} קבצים, מתוכם ${usable.length} זוהו ונותחו:\n\n${fileList}\n\n${context}`

    const results = { ...(asRec(rd.results)) }
    const runAt = new Date().toISOString()
    results.paid_csv_ingest = {
        content,
        source: 'csv',
        runAt,
        integrationsUsed: [],
        records: [],
        extras: { aggregates: aggs, fileCount: aggs.length, usableCount: usable.length },
        confidence: usable.length > 0 ? 'medium' : 'working_hypothesis',
    }
    const plan = asRec(rd.plan) as { stages?: StageId[]; status?: Record<StageId, StageStatus> }
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>
    status.paid_csv_ingest = { state: 'completed', runAt }

    await writeResearchData(agent, instanceId, { ...rd, results, plan: { ...plan, status } })
    console.log(`[research/paid_csv_ingest] ${instanceId} agent=${agent?.id} files=${aggs.length} usable=${usable.length}`)

    return ok(c, { fileCount: aggs.length, usableCount: usable.length, next_stage: 'client_account_baseline_csv' }, 'דוחות ה-CSV נקלטו.')
}