/**
 * Call Tracking Enrichment — CallRail / WhatConverts.
 *
 * For phone-call-relevant businesses (storage, services, local), pulls real
 * call duration + qualified-vs-junk breakdown so Mazhir can:
 *   - exclude short (<30s) calls from "real lead" count
 *   - identify which keywords/campaigns drove qualified calls
 *   - feed offline conversion uploads (qualified leads → Google Ads)
 *
 * Both providers expose REST APIs with API-key auth. We support both,
 * picking whichever the client connected. Returns a normalized shape.
 *
 * Connection: instances.callTrackingConfig = { provider, apiKey, accountId? }
 * (added in dashboard onboarding when paidProfile.trackingStack.callTracking !== 'none')
 */

export interface CallTrackingResult {
    available: boolean
    reason?: string
    provider?: 'callrail' | 'whatconverts' | 'native_google_ads'
    daysAnalyzed: number
    totalCalls: number
    qualifiedCalls: number          // duration >= threshold (default 60s)
    avgDurationSec: number
    callsBySource: Array<{ source: string; total: number; qualified: number }>
    topCampaignsByQualified: Array<{ campaign: string; qualified: number; total: number }>
    qualificationThresholdSec: number
}

interface CallTrackingConfig {
    provider?: 'callrail' | 'whatconverts'
    apiKey?: string
    accountId?: string
    qualifiedThresholdSec?: number
}

export async function pullCallTracking(
    cfg: CallTrackingConfig | null | undefined,
    days = 90,
): Promise<CallTrackingResult> {
    const empty = (reason: string): CallTrackingResult => ({
        available: false, reason, daysAnalyzed: 0, totalCalls: 0, qualifiedCalls: 0,
        avgDurationSec: 0, callsBySource: [], topCampaignsByQualified: [], qualificationThresholdSec: 60,
    })
    if (!cfg?.provider || !cfg?.apiKey) return empty('Call tracking provider not connected')
    const threshold = cfg.qualifiedThresholdSec ?? 60

    if (cfg.provider === 'callrail') {
        return pullCallRail(cfg, days, threshold).catch((err) => empty(`CallRail fetch failed: ${err.message}`))
    }
    if (cfg.provider === 'whatconverts') {
        return pullWhatConverts(cfg, days, threshold).catch((err) => empty(`WhatConverts fetch failed: ${err.message}`))
    }
    return empty(`Unknown provider: ${cfg.provider}`)
}

async function pullCallRail(cfg: CallTrackingConfig, days: number, threshold: number): Promise<CallTrackingResult> {
    if (!cfg.accountId || !cfg.apiKey) throw new Error('Missing CallRail accountId or apiKey')
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
    const url = `https://api.callrail.com/v3/a/${cfg.accountId}/calls.json?per_page=250&start_date=${since}&fields=campaign,source,duration,answered`

    const res = await fetch(url, {
        headers: { 'Authorization': `Token token="${cfg.apiKey}"` },
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json() as { calls?: Array<{ duration: number; campaign?: string; source?: string; answered?: boolean }> }
    const calls = j.calls || []

    let totalDur = 0
    let qualified = 0
    const bySource = new Map<string, { total: number; qualified: number }>()
    const byCampaign = new Map<string, { total: number; qualified: number }>()
    for (const c of calls) {
        const dur = Number(c.duration || 0)
        totalDur += dur
        const isQ = c.answered && dur >= threshold
        if (isQ) qualified++
        const src = c.source || 'unknown'
        const camp = c.campaign || 'no-campaign'
        const sCur = bySource.get(src) || { total: 0, qualified: 0 }
        sCur.total++; if (isQ) sCur.qualified++
        bySource.set(src, sCur)
        const cCur = byCampaign.get(camp) || { total: 0, qualified: 0 }
        cCur.total++; if (isQ) cCur.qualified++
        byCampaign.set(camp, cCur)
    }
    return {
        available: true, provider: 'callrail',
        daysAnalyzed: days, totalCalls: calls.length, qualifiedCalls: qualified,
        avgDurationSec: calls.length > 0 ? Math.round(totalDur / calls.length) : 0,
        callsBySource: [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
        topCampaignsByQualified: [...byCampaign.entries()].map(([campaign, v]) => ({ campaign, ...v })).sort((a, b) => b.qualified - a.qualified).slice(0, 10),
        qualificationThresholdSec: threshold,
    }
}

async function pullWhatConverts(cfg: CallTrackingConfig, days: number, threshold: number): Promise<CallTrackingResult> {
    if (!cfg.apiKey) throw new Error('Missing WhatConverts apiKey')
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
    const url = `https://app.whatconverts.com/api/v1/leads?per_page=250&start_date=${since}`

    const res = await fetch(url, {
        headers: { 'Authorization': `Basic ${Buffer.from(cfg.apiKey + ':').toString('base64')}` },
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json() as { leads?: Array<{ duration?: number; lead_source?: string; campaign?: string; quotable?: string }> }
    const leads = j.leads || []

    let totalDur = 0
    let qualified = 0
    const bySource = new Map<string, { total: number; qualified: number }>()
    const byCampaign = new Map<string, { total: number; qualified: number }>()
    for (const l of leads) {
        const dur = Number(l.duration || 0)
        totalDur += dur
        const isQ = dur >= threshold && (l.quotable || '').toLowerCase() !== 'no'
        if (isQ) qualified++
        const src = l.lead_source || 'unknown'
        const camp = l.campaign || 'no-campaign'
        const sCur = bySource.get(src) || { total: 0, qualified: 0 }
        sCur.total++; if (isQ) sCur.qualified++
        bySource.set(src, sCur)
        const cCur = byCampaign.get(camp) || { total: 0, qualified: 0 }
        cCur.total++; if (isQ) cCur.qualified++
        byCampaign.set(camp, cCur)
    }
    return {
        available: true, provider: 'whatconverts',
        daysAnalyzed: days, totalCalls: leads.length, qualifiedCalls: qualified,
        avgDurationSec: leads.length > 0 ? Math.round(totalDur / leads.length) : 0,
        callsBySource: [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
        topCampaignsByQualified: [...byCampaign.entries()].map(([campaign, v]) => ({ campaign, ...v })).sort((a, b) => b.qualified - a.qualified).slice(0, 10),
        qualificationThresholdSec: threshold,
    }
}

export function renderCallTrackingContext(r: CallTrackingResult): string {
    if (!r.available) return `═══ CALL TRACKING ═══\n\n(${r.reason || 'unavailable'})`
    const qPct = r.totalCalls > 0 ? Math.round((r.qualifiedCalls / r.totalCalls) * 100) : 0
    const sources = r.callsBySource.slice(0, 5).map(s => `  ${s.source.padEnd(20)} | total=${s.total}, qualified=${s.qualified}`).join('\n')
    return `═══ CALL TRACKING (${r.provider}, last ${r.daysAnalyzed} days) ═══

Total calls: ${r.totalCalls}
Qualified (>= ${r.qualificationThresholdSec}s and answered): ${r.qualifiedCalls} (${qPct}%)
Avg duration: ${r.avgDurationSec}s

By source:
${sources || '  (no source attribution)'}

USE THIS DATA:
- qualifiedCalls is the REAL lead count from phone — not totalCalls. Use for tCPA math.
- If qualifiedCalls / totalCalls < 30% → wrong audience or unclear ad copy. Recommend keyword/copy revision.
- If qualified-by-source heavily skewed to one channel → other channels should be tested separately, not bundled.`
}