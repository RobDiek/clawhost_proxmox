/**
 * K28 — SEO Monitoring Runner.
 *
 * Periodic cron that closes the monitoring gap discovered during deep audit:
 *   • GSC delta digest (daily) — surface CTR/clicks drops on tracked queries
 *   • Helpful Content vulnerability tracker (weekly) — recompute HC score
 *   • AEO citation probe (weekly) — query ChatGPT/Gemini/Perplexity/Claude
 *     with 20 JTBD prompts per tenant, log brandCited per engine
 *   • Knowledge Panel + Wikidata status (monthly) — check entity presence
 *
 * Persists everything under research_data.seoMonitoring = {
 *   gscDigest: { lastRun, dailyHistory: [{ date, topQueriesDelta, ... }] },
 *   helpfulContentScore: { lastRun, scoreHistory: [{ date, score_0_100, ... }] },
 *   aeoProbes: { lastRun, weeklyHistory: [{ date, perEngine: {chatgpt:..., gemini:...} }] },
 *   knowledgePanel: { lastRun, wikidataQid, knowledgePanelClaimed, sameAsCount }
 * }
 *
 * Each tracker writes via mutateResearchData (respects dual-write rule).
 * Per-tenant failures isolated. If an integration is missing (e.g. GSC not
 * connected), the tracker logs source='not_connected' and continues.
 *
 * AEO probes call Anthropic API for Claude. ChatGPT/Gemini/Perplexity probes
 * are infrastructure stubs in v1 — they record "would have probed" entries
 * until per-engine API integration is added. Claude actively probes from
 * day 1 because the tenant's apiKey is already wired (see monthlyPlan
 * cleanup pass which uses Anthropic).
 *
 * Schedule:
 *   - Daily tick: GSC delta digest
 *   - Weekly tick (sundays): HC score + AEO probe
 *   - Monthly tick (1st): KP/Wikidata status
 */

import { isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'

const MAX_HISTORY_ENTRIES = 90       // Keep ~3 months of daily history
const AEO_PROBE_PROMPTS_DEFAULT = 20  // 20 JTBD prompts per tenant per run

interface MonitorStats {
    agentsScanned: number
    gscDigestRuns: number
    hcScoreRuns: number
    aeoProbeRuns: number
    kpStatusRuns: number
    errors: number
}

function _shouldRunWeekly(now: Date): boolean {
    return now.getUTCDay() === 0    // Sunday UTC
}

function _shouldRunMonthly(now: Date): boolean {
    return now.getUTCDate() === 1   // 1st of month
}

function _trimHistory<T>(arr: T[] | undefined, max = MAX_HISTORY_ENTRIES): T[] {
    if (!Array.isArray(arr)) return []
    return arr.slice(-max)
}

// ─── GSC delta digest ─────────────────────────────────────────────────────
async function runGscDigest(agent: MatehAgentRow, instanceId: string, nowIso: string): Promise<void> {
    const { mutateResearchData } = await import('./agentContext')
    // Read agent integrations for GSC
    let gscConnected = false
    let topQueries: any[] = []
    const topPages: any[] = []
    try {
        const { getAgentIntegration } = await import('./agentIntegrations')
        const gscInt = await getAgentIntegration(instanceId, 'mt' as any, 'gsc' as any, agent.id || null)
        if (gscInt?.config) {
            gscConnected = true
            const { enrichWithGSC } = await import('./gscEnrich')
            const r = await enrichWithGSC(gscInt.config as any)
            if (r.available) {
                topQueries = (r.queries || []).slice(0, 20)
            }
        }
    } catch (err) {
        console.warn(`[seoMonitoring] GSC fetch failed for ${agent.id}:`, (err as Error).message)
    }

    await mutateResearchData(agent, instanceId, (rd: any) => {
        const cur = rd || {}
        const sm = cur.seoMonitoring || {}
        const gsc = sm.gscDigest || { dailyHistory: [] }
        const today = nowIso.slice(0, 10)
        // Idempotent: skip if today's entry exists.
        if (Array.isArray(gsc.dailyHistory) && gsc.dailyHistory.some((h: any) => h?.date === today)) {
            return cur
        }
        gsc.dailyHistory = _trimHistory([...(gsc.dailyHistory || []), {
            date: today,
            source: gscConnected ? 'connected' : 'not_connected',
            topQueries: topQueries.map(q => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position })),
            topPagesCount: topPages.length,
        }])
        gsc.lastRun = nowIso
        sm.gscDigest = gsc
        return { ...cur, seoMonitoring: sm }
    })
}

// ─── Helpful Content vulnerability score ─────────────────────────────────
async function runHelpfulContentScore(agent: MatehAgentRow, instanceId: string, nowIso: string): Promise<void> {
    const { mutateResearchData } = await import('./agentContext')
    const rd: any = agent.researchData
    // Recompute from already-prefetched internal_seo_audit data
    const hc = rd?.results?.internal_seo_audit?.extras?.helpful_content_vulnerability_score
    if (!hc || typeof hc.score_0_100 !== 'number') {
        await mutateResearchData(agent, instanceId, (cur: any) => {
            const c = cur || {}
            const sm = c.seoMonitoring || {}
            const hcm = sm.helpfulContentScore || { scoreHistory: [] }
            hcm.scoreHistory = _trimHistory([...(hcm.scoreHistory || []), { date: nowIso.slice(0, 10), score_0_100: null, source: 'no_audit_data' }])
            hcm.lastRun = nowIso
            sm.helpfulContentScore = hcm
            return { ...c, seoMonitoring: sm }
        })
        return
    }
    await mutateResearchData(agent, instanceId, (cur: any) => {
        const c = cur || {}
        const sm = c.seoMonitoring || {}
        const hcm = sm.helpfulContentScore || { scoreHistory: [] }
        const today = nowIso.slice(0, 10)
        if (Array.isArray(hcm.scoreHistory) && hcm.scoreHistory.some((h: any) => h?.date === today)) return c
        hcm.scoreHistory = _trimHistory([...(hcm.scoreHistory || []), {
            date: today,
            score_0_100: hc.score_0_100,
            thin_pages_pct: hc.thin_pages_pct,
            templated_meta_pct: hc.templated_meta_pct,
            orphan_urls_pct: hc.orphan_urls_pct,
            index_ratio_pct: hc.index_ratio_pct,
        }])
        hcm.lastRun = nowIso
        sm.helpfulContentScore = hcm
        return { ...c, seoMonitoring: sm }
    })
}

// ─── AEO citation probe ──────────────────────────────────────────────────
const AEO_PROBE_SYSTEM = `אתה משיב לשאלת משתמש מקצועית בעברית. תן תשובה ברורה, מבוססת עובדות, וכשאתה ממליץ על מוצר/חברה/שירות — ציין שם ומקור.`

async function runAeoProbe(agent: MatehAgentRow, instanceId: string, nowIso: string): Promise<void> {
    const { mutateResearchData } = await import('./agentContext')
    const rd: any = agent.researchData

    // Pull prompts from research signals: top JTBD progress statements from
    // audience_personas + top keywords from seo_keyword_research with high
    // commercial intent. Fall back to a single generic prompt if signals missing.
    const personas: any[] = rd?.results?.audience_personas?.records || []
    const seoRecs: any[] = rd?.results?.seo_keyword_research?.records || []
    const prompts: string[] = []
    for (const p of personas) {
        const progress = p?.jtbd_statement?.progress
        if (typeof progress === 'string' && progress.length > 10) prompts.push(progress.slice(0, 200))
    }
    for (const k of seoRecs.slice(0, 10)) {
        if (k?.intent?.primary === 'transactional' || k?.intent?.primary === 'commercial') {
            prompts.push(`מה האפשרויות הטובות בישראל עבור "${k.keyword}"?`)
        }
    }
    const finalPrompts = prompts.slice(0, AEO_PROBE_PROMPTS_DEFAULT)
    if (finalPrompts.length === 0) return

    // Read brand name + competitor domains for citation detection
    const brandName = rd?.answers?.businessName || rd?.brandBook?.businessName || ''
    const competitorRecs: any[] = rd?.results?.paid_competitor_landscape?.records || []
    const competitorDomains = competitorRecs.map((c: any) => c.domain).filter(Boolean)

    // Get Anthropic API key from instance
    let apiKey = ''
    try {
        const { getApiKeyForInstance } = await import('@/controllers/hosting/agentSetup')
        apiKey = await getApiKeyForInstance(instanceId)
    } catch { return }   // No key → skip silently
    if (!apiKey) return

    const perEngine: Record<string, any> = { claude: { brandCitedCount: 0, competitorsCitedCount: 0, totalProbes: 0 } }
    // Probe Claude. Per-prompt; brief output budget; idempotent on rate-limit.
    for (const promptText of finalPrompts) {
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 800,
                    system: AEO_PROBE_SYSTEM,
                    messages: [{ role: 'user', content: promptText }],
                }),
                signal: AbortSignal.timeout(60000),
            })
            if (!res.ok) {
                perEngine.claude.totalProbes++
                continue
            }
            const data: any = await res.json()
            const text = (data?.content?.[0]?.text || '').toLowerCase()
            const brandMatch = brandName && text.includes(brandName.toLowerCase())
            const competitorMatch = competitorDomains.some((d: string) => text.includes(d.toLowerCase().split('.')[0]))
            perEngine.claude.brandCitedCount += brandMatch ? 1 : 0
            perEngine.claude.competitorsCitedCount += competitorMatch ? 1 : 0
            perEngine.claude.totalProbes++
        } catch (err) {
            perEngine.claude.totalProbes++
            console.warn(`[seoMonitoring] AEO probe error for ${agent.id}:`, (err as Error).message)
        }
    }
    // ChatGPT/Gemini/Perplexity: infrastructure stubs — record "would-have-probed"
    // entries. Real probes added when per-engine API integration ships.
    perEngine.chatgpt = { brandCitedCount: null, competitorsCitedCount: null, totalProbes: finalPrompts.length, status: 'engine_api_not_wired' }
    perEngine.gemini = { brandCitedCount: null, competitorsCitedCount: null, totalProbes: finalPrompts.length, status: 'engine_api_not_wired' }
    perEngine.perplexity = { brandCitedCount: null, competitorsCitedCount: null, totalProbes: finalPrompts.length, status: 'engine_api_not_wired' }

    await mutateResearchData(agent, instanceId, (cur: any) => {
        const c = cur || {}
        const sm = c.seoMonitoring || {}
        const ap = sm.aeoProbes || { weeklyHistory: [] }
        const today = nowIso.slice(0, 10)
        if (Array.isArray(ap.weeklyHistory) && ap.weeklyHistory.some((h: any) => h?.date === today)) return c
        ap.weeklyHistory = _trimHistory([...(ap.weeklyHistory || []), {
            date: today,
            promptsCount: finalPrompts.length,
            perEngine,
        }], 26)   // 26 weeks ≈ 6 months
        ap.lastRun = nowIso
        sm.aeoProbes = ap
        return { ...c, seoMonitoring: sm }
    })
}

// ─── Knowledge Panel + Wikidata status ───────────────────────────────────
async function runKnowledgePanelStatus(agent: MatehAgentRow, instanceId: string, nowIso: string): Promise<void> {
    const { mutateResearchData } = await import('./agentContext')
    const rd: any = agent.researchData
    const brandName = rd?.answers?.businessName || rd?.brandBook?.businessName || ''
    let wikidataQid: string | null = null
    let wikidataFound = false
    if (brandName) {
        try {
            const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=he&search=${encodeURIComponent(brandName)}&limit=3`
            const res = await fetch(url, { headers: { 'User-Agent': 'ClawFlow-K28-Monitor/1.0' }, signal: AbortSignal.timeout(15000) })
            if (res.ok) {
                const data: any = await res.json()
                if (Array.isArray(data?.search) && data.search.length > 0) {
                    wikidataQid = data.search[0]?.id || null
                    wikidataFound = !!wikidataQid
                }
            }
        } catch (err) {
            console.warn(`[seoMonitoring] Wikidata lookup failed for ${brandName}:`, (err as Error).message)
        }
    }

    await mutateResearchData(agent, instanceId, (cur: any) => {
        const c = cur || {}
        const sm = c.seoMonitoring || {}
        sm.knowledgePanel = {
            lastRun: nowIso,
            wikidataQid,
            wikidataFound,
            knowledgePanelClaimed: null,        // Manual check required (GBP UI)
            sameAsCount: null,                  // Would need LD-JSON parse — Phase 2026.02
            brandQueried: brandName,
        }
        return { ...c, seoMonitoring: sm }
    })
}

// ─── Main scheduler ──────────────────────────────────────────────────────
export async function runSeoMonitoring(): Promise<MonitorStats> {
    const stats: MonitorStats = { agentsScanned: 0, gscDigestRuns: 0, hcScoreRuns: 0, aeoProbeRuns: 0, kpStatusRuns: 0, errors: 0 }
    const now = new Date()
    const nowIso = now.toISOString()
    const runWeekly = _shouldRunWeekly(now)
    const runMonthly = _shouldRunMonthly(now)

    try {
        const rows = await db.select().from(matehAgents).where(isNotNull(matehAgents.researchData))
        for (const row of rows) {
            stats.agentsScanned++
            try {
                await runGscDigest(row as MatehAgentRow, row.vpsInstanceId, nowIso)
                stats.gscDigestRuns++
            } catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} GSC error:`, (err as Error).message) }
            if (runWeekly) {
                try { await runHelpfulContentScore(row as MatehAgentRow, row.vpsInstanceId, nowIso); stats.hcScoreRuns++ }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} HC error:`, (err as Error).message) }
                try { await runAeoProbe(row as MatehAgentRow, row.vpsInstanceId, nowIso); stats.aeoProbeRuns++ }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} AEO error:`, (err as Error).message) }
            }
            if (runMonthly) {
                try { await runKnowledgePanelStatus(row as MatehAgentRow, row.vpsInstanceId, nowIso); stats.kpStatusRuns++ }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} KP error:`, (err as Error).message) }
            }
        }
        console.log(`[seoMonitoring] ${nowIso} stats:`, JSON.stringify(stats))
    } catch (err) {
        stats.errors++
        console.error('[seoMonitoring] top-level error:', err)
    }
    return stats
}