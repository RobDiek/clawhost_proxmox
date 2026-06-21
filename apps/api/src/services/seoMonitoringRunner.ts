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

import { randomBytes } from 'crypto'
import { isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import type { GscFinding, GscSeverity } from './gscHealthAudit'

const MAX_HISTORY_ENTRIES = 90       // Keep ~3 months of daily history
const AEO_PROBE_PROMPTS_DEFAULT = 20  // 20 JTBD prompts per tenant per run

interface MonitorStats {
    agentsScanned: number
    gscDigestRuns: number
    gscHealthRuns: number
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

// ─── GSC Health Sweep (sitemaps + URL inspection → notify + task) ─────────
// Closes the gap where the platform only read Search Analytics and never saw
// the indexing/coverage/sitemap/rich-result issues Google emails about.
// Systemic: runs for EVERY agent with a connected GSC. Baseline-then-alert —
// the first run per agent records current issues silently (baseline); only
// issues that appear AFTER baseline raise a task + Telegram (mirrors how GSC
// emails only NEW problems).

/** Pull page URLs from a site's sitemap (follows one level of nested index). */
async function fetchSitemapUrls(homeUrl: string, cap = 1000): Promise<string[]> {
    const origin = homeUrl.replace(/\/$/, '')
    const candidates = [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`]
    const out: string[] = []
    const seen = new Set<string>()
    const grab = async (url: string, depth: number): Promise<void> => {
        if (out.length >= cap || seen.has(url)) return
        seen.add(url)
        let xml = ''
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
            if (!r.ok) return
            xml = await r.text()
        } catch { return }
        const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1])
        for (const loc of locs) {
            if (out.length >= cap) break
            if (/\.xml($|\?)/i.test(loc) || /sitemap/i.test(loc)) {
                if (depth < 1) await grab(loc, depth + 1)
            } else {
                out.push(loc)
            }
        }
    }
    for (const c of candidates) {
        if (out.length < cap) await grab(c, 0)
        if (out.length) break
    }
    return out
}

/** Detect a sudden organic-traffic cliff from gscDigest history — the only
 *  API-visible proxy for a manual action / deindex / penalty (GSC has no
 *  public manual-actions API). Conservative thresholds avoid false alarms. */
function detectTrafficCliff(agent: MatehAgentRow): GscFinding | null {
    const hist: any[] = (agent.researchData as any)?.seoMonitoring?.gscDigest?.dailyHistory || []
    const connected = hist.filter(h => h?.source === 'connected' && Array.isArray(h.topQueries))
    if (connected.length < 10) return null
    const dayClicks = (h: any) => h.topQueries.reduce((s: number, q: any) => s + (q.clicks || 0), 0)
    const recent = connected.slice(-3)
    const prior = connected.slice(-17, -3)
    if (prior.length < 7) return null
    const recentAvg = recent.reduce((s, h) => s + dayClicks(h), 0) / recent.length
    const priorAvg = prior.reduce((s, h) => s + dayClicks(h), 0) / prior.length
    if (priorAvg < 30) return null
    const dropPct = (priorAvg - recentAvg) / priorAvg
    if (dropPct < 0.5) return null
    return {
        id: 'traffic_cliff',
        severity: 'high',
        category: 'traffic',
        summary: `צניחה חדה בתנועה האורגנית (−${Math.round(dropPct * 100)}%)`,
        detail: `קליקים אורגניים ירדו מ~${Math.round(priorAvg)}/יום ל~${Math.round(recentAvg)}/יום (−${Math.round(dropPct * 100)}%). צניחה כזו עלולה להעיד על דה-אינדוקס, פעולה ידנית (Manual Action) או עדכון אלגוריתם. ל-GSC אין API לפעולות ידניות — בדקו ב-Search Console → Security & Manual Actions, ואם קיבלתם מייל מגוגל העבירו אותו אלינו.`,
        autoFixable: false,
    }
}

/** Create a pending_review task + push it to the tenant's Telegram. Mirrors the
 *  adsRecommendationsEvaluator output pattern (content.displayHe + metadata). */
async function createGscHealthTask(agent: MatehAgentRow, instanceId: string, f: GscFinding, siteUrl: string, nowIso: string): Promise<string | undefined> {
    const sigil = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : 'ℹ️'
    const displayHe = [
        `## ${sigil} בעיה ב-Google Search Console`,
        '',
        `**${f.summary}**`,
        f.url ? `כתובת: ${f.url}` : '',
        '',
        f.detail,
        '',
        f.autoFixable ? '_ניתן לתיקון אוטומטי — אשרו את המשימה._' : '_דורש בדיקה/תיקון ידני (ראו הסבר)._',
    ].filter(Boolean).join('\n')
    const [row] = await db.insert(agentOutputs).values({
        id: 'gsc_' + randomBytes(6).toString('hex'),
        instanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'gsc_health_issue',
        platform: 'gsc',
        status: 'pending_review',
        title: `${sigil} GSC: ${f.summary}`.slice(0, 200),
        content: JSON.stringify({ displayHe, finding: { id: f.id, severity: f.severity, category: f.category, url: f.url, summary: f.summary, detail: f.detail, autoFixable: f.autoFixable } }, null, 2),
        metadata: { findingId: f.id, severity: f.severity, category: f.category, url: f.url, autoFixable: f.autoFixable, autoFixAction: f.autoFixAction, siteUrl, detectedAt: nowIso } as any,
    }).returning()
    if (row?.id) {
        import('./approvalQueueTelegram')
            .then(m => m.sendApprovalQueueMessage(row.id))
            .catch((err: Error) => console.warn('[gscHealth] telegram send failed:', err.message))
    }
    return row?.id
}

async function runGscHealthSweep(agent: MatehAgentRow, instanceId: string, nowIso: string, opts: { createTasks?: boolean } = {}): Promise<void> {
    const { mutateResearchData } = await import('./agentContext')

    // Resolve GSC tokens (same path as runGscDigest — per-agent isolation).
    let gscCfg: any = null
    try {
        const { getAgentIntegration } = await import('./agentIntegrations')
        const gscInt = await getAgentIntegration(instanceId, 'mt' as any, 'gsc' as any, agent.id || null)
        if (gscInt?.config) gscCfg = gscInt.config
    } catch { /* not connected */ }
    const refreshToken = gscCfg?.refreshToken || gscCfg?.refresh_token
    const siteUrl = gscCfg?.siteUrl
    if (!refreshToken || !siteUrl) return   // GSC not connected → skip silently

    const tokens = { refreshToken, accessToken: gscCfg.accessToken, expiresAt: gscCfg.expiresAt, siteUrl, sites: gscCfg.sites }

    const state: any = (agent.researchData as any)?.seoMonitoring?.gscHealth || {}
    const isBaseline = !state.openFindings   // first run per agent → record silently
    const cursor = Number(state.cursor || 0)
    const PER_RUN = 30

    // Priority URLs: homepage + a rotating slice of sitemap URLs.
    const bare = siteUrl.replace(/^sc-domain:/, '').replace(/\/$/, '')
    const home = (bare.startsWith('http') ? bare : `https://${bare}`) + '/'
    let allUrls: string[] = []
    try { allUrls = await fetchSitemapUrls(home) } catch { /* ignore */ }
    let slice: string[] = []
    if (allUrls.length) {
        slice = allUrls.slice(cursor, cursor + PER_RUN)
        if (slice.length < PER_RUN) slice = slice.concat(allUrls.slice(0, Math.max(0, PER_RUN - slice.length)))
    }
    const inspectUrls = Array.from(new Set([home, ...slice]))
    const nextCursor = allUrls.length ? (cursor + PER_RUN) % allUrls.length : 0

    const { auditGscHealth } = await import('./gscHealthAudit')
    const report = await auditGscHealth({ tokens, inspectUrls })
    if (!report.ok) {
        await mutateResearchData(agent, instanceId, (cur: any) => {
            const c = cur || {}
            const sm = c.seoMonitoring || {}
            sm.gscHealth = { ...(sm.gscHealth || {}), lastRun: nowIso, lastReason: report.reason }
            return { ...c, seoMonitoring: sm }
        })
        return
    }

    const cliff = detectTrafficCliff(agent)
    const allFindings: GscFinding[] = [...report.findings, ...(cliff ? [cliff] : [])]

    // Dedup against open findings. Findings are aggregated per-category (stable
    // IDs) and recomputed each run over a rotating URL window — so resolve with a
    // 1-run grace (a finding can transiently drop when its URLs aren't in this
    // run's slice). Resolve only after 2 consecutive misses.
    const open: Record<string, any> = { ...(state.openFindings || {}) }
    const currentIds = new Set(allFindings.map(f => f.id))
    for (const id of Object.keys(open)) {
        if (currentIds.has(id)) { open[id].misses = 0; continue }
        open[id].misses = (open[id].misses || 0) + 1
        if (open[id].misses >= 2) delete open[id]   // resolved
    }
    const newFindings = allFindings.filter(f => !open[f.id])
    for (const f of newFindings) {
        let taskId: string | undefined
        if (opts.createTasks && !isBaseline) {
            try { taskId = await createGscHealthTask(agent, instanceId, f, report.siteUrl || siteUrl, nowIso) }
            catch (e) { console.warn(`[gscHealth] task create failed for ${f.id}:`, (e as Error).message) }
        }
        open[f.id] = { firstSeen: nowIso, lastSeen: nowIso, severity: f.severity, category: f.category, url: f.url || null, summary: f.summary, taskId: taskId || null, baselined: isBaseline, misses: 0 }
    }
    // Refresh summary/severity/lastSeen on still-open findings so state mirrors latest.
    for (const f of allFindings) {
        if (open[f.id]) { open[f.id].severity = f.severity; open[f.id].summary = f.summary; open[f.id].lastSeen = nowIso }
    }

    await mutateResearchData(agent, instanceId, (cur: any) => {
        const c = cur || {}
        const sm = c.seoMonitoring || {}
        const gh = sm.gscHealth || {}
        gh.lastRun = nowIso
        gh.siteUrl = report.siteUrl
        gh.cursor = nextCursor
        gh.counts = report.counts
        gh.openFindings = open
        gh.history = _trimHistory([...(gh.history || []), {
            date: nowIso.slice(0, 10),
            counts: report.counts,
            newCount: isBaseline ? 0 : newFindings.length,
            baselinedCount: isBaseline ? newFindings.length : 0,
            inspected: report.inspectedUrls.length,
            openTotal: Object.keys(open).length,
        }], 60)
        sm.gscHealth = gh
        return { ...c, seoMonitoring: sm }
    })
}

/** Script/cron convenience — run the GSC health sweep for one agent. */
export async function runGscHealthForAgent(agentId: string, opts: { createTasks?: boolean } = {}): Promise<any> {
    const { eq } = await import('drizzle-orm')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ok: false, error: `agent_not_found:${agentId}` }
    await runGscHealthSweep(agent as MatehAgentRow, agent.vpsInstanceId, new Date().toISOString(), opts)
    const [after] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    return { ok: true, gscHealth: (after?.researchData as any)?.seoMonitoring?.gscHealth }
}

// ─── CTR opportunity sweep (ranking-but-low-CTR → propose title/meta rewrite) ──
// Systemic companion to seoCtrOptimizer: weekly, GSC-only detection (no LLM),
// raises ONE approval task with a one-click apply (apply_ctr_optimization) that
// runs the optimizer. Deduped: skips while an open opportunity task exists.
async function runCtrOpportunitySweep(agent: MatehAgentRow, instanceId: string, nowIso: string, opts: { createTasks?: boolean } = {}): Promise<void> {
    const { eq, and } = await import('drizzle-orm')
    if (opts.createTasks) {
        const open = await db.select().from(agentOutputs).where(and(
            eq(agentOutputs.agentId, agent.id),
            eq(agentOutputs.outputType, 'seo_ctr_opportunity'),
            eq(agentOutputs.status, 'pending_review'),
        ))
        if (open.length) return   // already an open opportunity task — don't spam
    }
    const { detectCtrCandidates } = await import('./seoCtrOptimizer')
    const det = await detectCtrCandidates(instanceId, { agentId: agent.id, minImpressions: 100 })
    if (!det.ok || det.reason || det.candidates.length < 3) return   // not connected / too few to bother

    const top = det.candidates.slice(0, 10)
    const { mutateResearchData } = await import('./agentContext')
    await mutateResearchData(agent, instanceId, (rd: any) => {
        const c = rd || {}; const sm = c.seoMonitoring || {}
        sm.ctrOpportunity = { lastRun: nowIso, shown: top.length, total: det.candidates.length }
        return { ...c, seoMonitoring: sm }
    })
    if (!opts.createTasks) return

    const lines = top.map(c => `• מיקום ${c.position.toFixed(0)} · ${c.impressions} חשיפות · CTR ${(c.ctr * 100).toFixed(1)}% · "${c.topQuery}"`).join('\n')
    const displayHe = [
        '## 🎯 הזדמנות CTR — דפים מדורגים שלא מקבלים קליקים',
        '',
        `${det.candidates.length} דפים מדורגים במיקום טוב (4-15) אך עם CTR נמוך מהצפוי — הדירוג כבר הושג, רק הכותרת/תיאור ב-SERP לא גורמים לקליק. שכתוב כותרת+תיאור הוא הטראפיק האורגני הזול ביותר.`,
        '',
        '### הדפים המובילים',
        lines,
        '',
        '_אשרו כדי לשכתב כותרת + תיאור אוטומטית, מעוגן בביטוי החיפוש האמיתי של כל דף._',
    ].join('\n')
    const [row] = await db.insert(agentOutputs).values({
        id: 'ctr_' + randomBytes(6).toString('hex'),
        instanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'seo_ctr_opportunity',
        platform: 'gsc',
        status: 'pending_review',
        title: `🎯 CTR: ${det.candidates.length} דפים מדורגים ללא קליקים`,
        content: JSON.stringify({ displayHe, candidates: top.map(c => ({ url: c.url, query: c.topQuery, imp: c.impressions, ctr: c.ctr, pos: c.position })) }, null, 2),
        metadata: { autoFixable: true, autoFixAction: { kind: 'apply_ctr_optimization', payload: { agentId: agent.id, limit: 8, minImpressions: 100 } }, candidateCount: det.candidates.length, detectedAt: nowIso } as any,
    }).returning()
    if (row?.id) {
        import('./approvalQueueTelegram').then(m => m.sendApprovalQueueMessage(row.id)).catch((err: Error) => console.warn('[ctrOpportunity] telegram send failed:', err.message))
    }
}

/** Script/cron convenience — run the CTR opportunity sweep for one agent. */
export async function runCtrOpportunityForAgent(agentId: string, opts: { createTasks?: boolean } = {}): Promise<any> {
    const { eq } = await import('drizzle-orm')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ok: false, error: `agent_not_found:${agentId}` }
    await runCtrOpportunitySweep(agent as MatehAgentRow, agent.vpsInstanceId, new Date().toISOString(), opts)
    return { ok: true }
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
            const res = await fetch(url, { headers: { 'User-Agent': 'Flowmatic-K28-Monitor/1.0' }, signal: AbortSignal.timeout(15000) })
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
    const stats: MonitorStats = { agentsScanned: 0, gscDigestRuns: 0, gscHealthRuns: 0, hcScoreRuns: 0, aeoProbeRuns: 0, kpStatusRuns: 0, errors: 0 }
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
            try {
                await runGscHealthSweep(row as MatehAgentRow, row.vpsInstanceId, nowIso, { createTasks: true })
                stats.gscHealthRuns++
            } catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} GSC health error:`, (err as Error).message) }
            if (runWeekly) {
                try { await runHelpfulContentScore(row as MatehAgentRow, row.vpsInstanceId, nowIso); stats.hcScoreRuns++ }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} HC error:`, (err as Error).message) }
                try { await runAeoProbe(row as MatehAgentRow, row.vpsInstanceId, nowIso); stats.aeoProbeRuns++ }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} AEO error:`, (err as Error).message) }
                try { await runCtrOpportunitySweep(row as MatehAgentRow, row.vpsInstanceId, nowIso, { createTasks: true }) }
                catch (err) { stats.errors++; console.error(`[seoMonitoring] ${row.id} CTR-opportunity error:`, (err as Error).message) }
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