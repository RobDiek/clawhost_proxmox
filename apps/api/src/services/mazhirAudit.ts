/**
 * Mazhir Audit Service
 *
 * Senior PPC audit at takeover. Reads paidProfile + tracking stack +
 * existing Google Ads account (if connected) + brand/research context,
 * runs an Opus-grade analysis, and produces a structured MazhirAudit
 * stored under researchData.mazhirAudit.
 *
 * Audit framework follows the Optmyzr / Adalysis / Search Engine Land
 * 2025-2026 takeover methodology:
 *   1. Tracking integrity FIRST (fix before optimizing)
 *   2. Account health components that actually matter
 *   3. Search terms n-gram waste analysis (when account history exists)
 *   4. Quality Score as diagnostic only (per Vallaeys 2026)
 *   5. Bidding/structure mismatch flags
 *
 * Hard guardrails surfaced as blockers (Mazhir cannot launch until cleared):
 *   - GA4 + GTM verified
 *   - At least one conversion action firing on real test event
 *   - Phone-call relevant + no call tracking → blocker for leadgen
 *   - PMax-for-leadgen requested + no offline qualified-lead upload → blocker
 */

import { eq } from 'drizzle-orm'
import { buildDataGaps, renderDataGapsForPrompt } from './enrichmentContract'
import { db } from '@/db'
import { instances, brandBooks } from '@/db/schema'
import { resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { getCampaignMetrics, getRecommendations } from '@/services/googleAds'
import type { MazhirAudit, PaidProfile } from '@/controllers/hosting/agentSetup'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

interface CallOpusOpts {
    apiKey: string
    model: string
    system?: string
    user: string
    maxTokens?: number
    timeoutMs?: number
}

async function callOpus(opts: CallOpusOpts): Promise<string> {
    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: opts.model,
            max_tokens: opts.maxTokens || 16000,
            system: opts.system,
            messages: [{ role: 'user', content: opts.user }],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs || 240000),
    })
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Opus ${res.status}: ${t.slice(0, 400)}`)
    }
    const j = await res.json() as any
    const text = j?.content?.[0]?.text
    if (!text || typeof text !== 'string') throw new Error('Opus returned no text')
    return text
}

// Sanitize raw control chars (\n,\r,\t,...) inside JSON string literals AND
// detect+escape unescaped " mid-string. Opus/Sonnet frequently emits both
// in long Hebrew outputs (e.g. quoting a price like "₪29.9 לק"ב" without
// escaping the inner ").
function sanitizeJsonControlChars(src: string): string {
    let out = ''
    let inStr = false
    let esc = false
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { out += ch; esc = false; continue }
            if (ch === '\\') { out += ch; esc = true; continue }
            if (ch === '"') {
                // Determine if this is END of string vs unescaped " inside.
                // Look ahead past whitespace to find the next non-space char.
                let j = i + 1
                while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++
                const next = src[j]
                // If next non-ws is one of structural chars that follow a string
                // value/key, treat as legitimate close. Otherwise escape it.
                if (next === ',' || next === '}' || next === ']' || next === ':' || next === undefined) {
                    out += ch
                    inStr = false
                } else {
                    // Looks like an unescaped " mid-string → escape it
                    out += '\\"'
                }
                continue
            }
            const code = ch.charCodeAt(0)
            if (code === 0x0A) { out += '\\n'; continue }
            if (code === 0x0D) { out += '\\r'; continue }
            if (code === 0x09) { out += '\\t'; continue }
            if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue }
            out += ch
        } else {
            out += ch
            if (ch === '"') { inStr = true; esc = false }
        }
    }
    return out
}
function stripTrailingCommas(src: string): string {
    return src.replace(/,(\s*[}\]])/g, '$1')
}
function aggressiveJsonClean(src: string): string {
    let s = src
    s = s.replace(/^\s*\/\/.*$/gm, '')
    s = s.replace(/\/\*[\s\S]*?\*\//g, '')
    s = s.replace(/,(\s*[}\]])/g, '$1')
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    s = s.replace(/'((?:[^'\\]|\\.)*)'(\s*[:,}\]])/g, '"$1"$2')
    return s
}
function findLastBalancedClose(src: string): number {
    let depth = 0, inStr = false, esc = false, lastValidEnd = -1
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) lastValidEnd = i }
    }
    return lastValidEnd
}

function extractJson<T>(raw: string, hint = 'output'): T {
    const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/)
    const candidate = fenced ? fenced[1] : raw
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end < 0) throw new Error(`No JSON in ${hint}: ${raw.slice(0, 300)}`)
    const json = candidate.slice(start, end + 1)

    const sc = sanitizeJsonControlChars(json)
    const tc = stripTrailingCommas(sc)
    const ag = aggressiveJsonClean(sc)
    const agtc = stripTrailingCommas(ag)
    const attempts: Array<{ name: string; src: string }> = [
        { name: 'raw', src: json },
        { name: 'sanitize-control', src: sc },
        { name: 'strip-trailing', src: tc },
        { name: 'aggressive', src: ag },
        { name: 'aggressive+trailing', src: agtc },
    ]
    let lastErr: Error | null = null
    let posOfFailure = -1
    for (const a of attempts) {
        try { return JSON.parse(a.src) as T }
        catch (err) {
            lastErr = err as Error
            const m = (err as Error).message.match(/position\s+(\d+)/)
            if (m) posOfFailure = parseInt(m[1], 10)
        }
    }
    // Last resort — truncate to last balanced close
    for (const a of [agtc, tc, sc]) {
        const lastClose = findLastBalancedClose(a)
        if (lastClose > 0) {
            const truncated = a.slice(0, lastClose + 1)
            try { return JSON.parse(truncated) as T } catch { /* keep trying */ }
        }
    }
    // Auto-close: walk the JSON tracking braces/brackets/quotes,
    // append missing closers — recovers parseable shape from truncated/malformed.
    {
        const cleaned = stripTrailingCommas(sanitizeJsonControlChars(json))
        let inStr = false, esc = false
        let lastSafe = 0
        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i]
            if (inStr) {
                if (esc) { esc = false; continue }
                if (ch === '\\') { esc = true; continue }
                if (ch === '"') { inStr = false; lastSafe = i + 1 }
                continue
            }
            if (ch === '"') { inStr = true }
            else if (ch === '{' || ch === '[' || ch === '}' || ch === ']' || ch === ',' || ch === ':') lastSafe = i + 1
        }
        let partial = cleaned.slice(0, lastSafe).replace(/,\s*$/, '')
        const openStack: string[] = []
        let inStr2 = false, esc2 = false
        for (let i = 0; i < partial.length; i++) {
            const ch = partial[i]
            if (inStr2) {
                if (esc2) { esc2 = false; continue }
                if (ch === '\\') { esc2 = true; continue }
                if (ch === '"') inStr2 = false
                continue
            }
            if (ch === '"') inStr2 = true
            else if (ch === '{') openStack.push('}')
            else if (ch === '[') openStack.push(']')
            else if (ch === '}' || ch === ']') openStack.pop()
        }
        if (inStr2) partial += '"'
        while (openStack.length > 0) partial += openStack.pop()
        try {
            console.warn(`[mazhirAudit] auto-close recovered truncated JSON (orig len=${json.length}, recovered len=${partial.length})`)
            return JSON.parse(partial) as T
        } catch { /* fall through */ }
    }
    // Dump raw to journalctl in chunks (truncate at 4K each) for forensics.
    const CHUNK = 4000
    for (let i = 0; i < Math.min(raw.length, 32000); i += CHUNK) {
        console.error(`[mazhirAudit][raw chunk ${Math.floor(i / CHUNK)}/${Math.ceil(Math.min(raw.length, 32000) / CHUNK)}] ${raw.slice(i, i + CHUNK)}`)
    }
    const win = posOfFailure > 0
        ? json.slice(Math.max(0, posOfFailure - 200), Math.min(json.length, posOfFailure + 200))
        : json.slice(0, 400)
    console.error(`[mazhirAudit] JSON parse failed. pos=${posOfFailure}, len=${json.length}, window: ${win}`)
    throw new Error(`Invalid JSON in ${hint}: ${(lastErr || new Error('unknown')).message} — pos ${posOfFailure}, window: ${win.slice(0, 200)}`)
}

// ─── Pull existing Google Ads metrics (90d) when account is connected ─────
async function pullExistingAccountSnapshot(
    apiKey: string,
    customerId: string | undefined,
    googleTokens: any,
): Promise<MazhirAudit['existingAccountAudit'] | undefined> {
    if (!customerId || !googleTokens?.refreshToken) return undefined

    try {
        const tokens = {
            accessToken: googleTokens.accessToken || '',
            refreshToken: googleTokens.refreshToken,
            expiresAt: googleTokens.expiresAt || 0,
            scopes: googleTokens.scopes || [],
            email: googleTokens.email || '',
        }

        const metrics = await getCampaignMetrics(customerId, tokens, undefined, 'LAST_90_DAYS') as any[]

        // Aggregate
        let totalCostMicros = 0, totalClicks = 0, totalConversions = 0, totalImpr = 0
        for (const row of metrics) {
            const m = row?.metrics
            if (!m) continue
            totalCostMicros += Number(m.cost_micros || m.costMicros || 0)
            totalClicks += Number(m.clicks || 0)
            totalConversions += Number(m.conversions || 0)
            totalImpr += Number(m.impressions || 0)
        }
        const spendIls = totalCostMicros / 1_000_000
        const ctr = totalImpr > 0 ? totalClicks / totalImpr : 0
        const avgCpcIls = totalClicks > 0 ? spendIls / totalClicks : 0
        const convRate = totalClicks > 0 ? totalConversions / totalClicks : 0

        // Recommendations (Google's own)
        let topRecs: string[] = []
        try {
            const recs = await getRecommendations(customerId, tokens) as any[]
            topRecs = recs.slice(0, 8).map((r: any) => r?.recommendation?.type || 'unknown').filter(Boolean)
        } catch (err) {
            console.warn('[mazhirAudit] getRecommendations failed:', (err as Error).message)
        }

        return {
            accessible: true,
            last90Days: {
                spendIls: Math.round(spendIls * 100) / 100,
                clicks: totalClicks,
                conversions: Math.round(totalConversions * 10) / 10,
                ctr: Math.round(ctr * 10000) / 100,             // %
                avgCpcIls: Math.round(avgCpcIls * 100) / 100,
                convRate: Math.round(convRate * 10000) / 100,   // %
            },
            topRecommendations: topRecs,
        }
    } catch (err) {
        console.warn('[mazhirAudit] account snapshot failed:', (err as Error).message)
        return { accessible: false, topRecommendations: [] }
    }
}

// ─── Main entry point ─────────────────────────────────────────────────────
export async function runMazhirAudit(instanceId: string): Promise<{ audit: MazhirAudit; cost: { model: string; usdEstimate: number } }> {
    const t0 = Date.now()

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const apiKey = (inst as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Anthropic API key missing (instance.aiProviderKey or env)')

    // Phase 4.0(fix16) — multi-tenant fix: read research_data through agent
    // context (mateh_agents.research_data is canonical for tenants; the
    // instances.research_data mirror only updates for the primary agent).
    // Previously this service used inst.researchData directly and wrote
    // via raw db.update(instances) — that worked for single-tenant but
    // silently dropped data for secondary agents AND got overwritten by
    // the wrapper's markWrapperStageCompleted (which uses agent-routed
    // writes that overwrote mazhirAudit with stale rd).
    const { resolvePrimaryAgent, readResearchData, writeResearchData } =
        await import('./agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = await readResearchData(agent, instanceId) || {}
    const pp: PaidProfile | undefined = rd.paidProfile
    if (!pp) throw new Error('paidProfile required — fill it in onboarding first')

    const [brand] = await db.select().from(brandBooks).where(eq(brandBooks.instanceId, instanceId))

    // Token sources are migrating from instance.googleTokens (legacy) to
    // agent_integrations table (current). Legacy field can be stale (missing
    // scopes added later). Prefer agent_integrations + merge scopes from both.
    let googleTokensForAudit: any = inst.googleTokens
    let gscTokens: any = (inst as any).gscTokens
    try {
        const { getAgentIntegration } = await import('./agentIntegrations')
        const [googleInt, gscInt] = await Promise.all([
            getAgentIntegration(instanceId, 'mt' as any, 'google' as any),
            getAgentIntegration(instanceId, 'mt' as any, 'gsc' as any),
        ])
        if (googleInt?.config) {
            const legacyScopes: string[] = Array.isArray((inst.googleTokens as any)?.scopes) ? (inst.googleTokens as any).scopes : []
            const intScopes: string[] = Array.isArray((googleInt.config as any).scopes) ? (googleInt.config as any).scopes : []
            const mergedScopes = [...new Set([...legacyScopes, ...intScopes].map(s => s.toLowerCase()))]
            googleTokensForAudit = { ...(googleInt.config as any), scopes: mergedScopes }
        }
        if (gscInt?.config) gscTokens = gscInt.config
    } catch (err) {
        console.warn('[mazhirAudit] could not read agent_integrations:', (err as Error).message)
    }

    // Existing account snapshot — Phase 4.2.1-K: same ground-truth check as
    // the SQR/changeHistory gate further down. pp.hasExistingAccount was set
    // by the form modal based on a snapshot of instanceData that may be stale.
    const googleAdsConfig: any = inst.googleAdsConfig || {}
    const _baselineCheck = (rd.results as Record<string, unknown> | undefined)?.client_account_baseline as
        { dfsData?: { googleAds?: { available?: boolean; accountMetrics?: { available?: boolean; cost?: number; clicks?: number; conversions?: number; avgCpcIls?: number; conversionRatePct?: number; cpaIls?: number; daysAnalyzed?: number } } } } | undefined
    const _baselineGads = _baselineCheck?.dfsData?.googleAds
    const _hasBaselineGads = !!_baselineGads?.available
    const _hasCreds = !!(googleAdsConfig.customerId
        && googleAdsConfig.developerToken
        && (googleTokensForAudit as { refreshToken?: string } | null)?.refreshToken)
    const _accountConnected = _hasBaselineGads || _hasCreds
    const accountSnapshot = _accountConnected && googleAdsConfig.customerId
        ? await pullExistingAccountSnapshot(apiKey, googleAdsConfig.customerId, googleTokensForAudit)
        : undefined

    // Build the Opus prompt — concrete, structured, with industry methodology baked in
    const businessName = (brand as any)?.businessName || rd.answers?.businessName || 'unknown'
    const businessDesc = rd.answers?.businessDescription || ''
    const targetAudience = rd.answers?.targetAudience || ''
    const competitors = rd.answers?.competitors || ''
    const websiteUrl = rd.answers?.websiteUrl || ''

    // ─── External-data enrichment (parallel) ───────────────────────────
    // DataForSEO: real keyword volumes/CPC for seed terms.
    // GSC: organic top queries (cannibalization signal + paid-lift candidates).
    // Transparency: competitor active ad creatives.
    // PageSpeed: landing page Core Web Vitals (Quality Score signal).
    // All four short-circuit gracefully when not connected — Opus sees a
    // "(not available)" line and weights its analysis accordingly.
    const seedKeywords: string[] = []
    const stage1 = typeof rd.stage1 === 'string' ? rd.stage1 : ''
    const stage2 = typeof rd.stage2 === 'string' ? rd.stage2 : ''
    // Extract Hebrew keywords from research stages — quick heuristic: lines
    // matching markdown bullets containing 2-5 Hebrew words.
    const kwRegex = /^[\s\-*•]+([֐-׿\w]+(?:\s+[֐-׿\w]+){1,4})/gm
    for (const txt of [stage1, stage2]) {
        const matches = txt.match(kwRegex) || []
        for (const m of matches.slice(0, 30)) {
            const cleaned = m.replace(/^[\s\-*•]+/, '').trim()
            if (cleaned.length > 3 && cleaned.length < 60) seedKeywords.push(cleaned)
        }
    }
    // Auto-extract competitor domains. Sources (in priority order):
    //   1. Explicit list in rd.answers.competitors (legacy; comma/newline-separated)
    //   2. Domains mentioned anywhere in stage1..stage5 research (regex-extracted)
    //   3. Domains in brand book or strategy text
    // Filter: keep .co.il / .com / .net / .io and similar (length-bounded), skip
    // social/utility domains and the client's own domain. Cap at 8.
    const competitorDomains: string[] = (() => {
        const own = (websiteUrl || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()
        const found = new Set<string>()
        const skipHosts = new Set([
            'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com',
            'twitter.com', 'x.com', 'linkedin.com', 'whatsapp.com', 'wa.me',
            'maps.google.com', 'goo.gl', 'bit.ly', 'wikipedia.org', 'github.com',
            'flowmatic.co.il', 'openclaw.flowmatic.co.il',
        ])
        const stage1s = typeof rd.stage1 === 'string' ? rd.stage1 : ''
        const stage2s = typeof rd.stage2 === 'string' ? rd.stage2 : ''
        const stage3s = typeof rd.stage3 === 'string' ? rd.stage3 : ''
        const stage4s = typeof rd.stage4 === 'string' ? rd.stage4 : ''
        const stage5s = typeof rd.stage5 === 'string' ? rd.stage5 : ''
        const strategyTxt = typeof rd.strategy === 'string' ? rd.strategy : (typeof rd.strategy === 'object' ? JSON.stringify(rd.strategy) : '')
        const corpus = [
            rd.answers?.competitors || '',
            stage1s, stage2s, stage3s, stage4s, stage5s,
            strategyTxt,
        ].join('\n')
        // Domain regex — handles bare hosts, https:// prefixes, parenthesized
        const re = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:co\.il|org\.il|net\.il|ac\.il|gov\.il|com|net|io|co|app|ai|me|info|biz))\b/gi
        const matches = corpus.toLowerCase().match(re) || []
        for (const m of matches) {
            const host = m.replace(/^www\./, '')
            if (host === own) continue
            if (skipHosts.has(host)) continue
            // skip overly long or short
            if (host.length < 5 || host.length > 50) continue
            found.add(host)
            if (found.size >= 8) break
        }
        return [...found]
    })()

    // Phase 4.2.1-F (mazhir_audit) — DON'T trust pp.hasExistingAccount.
    // That flag is form-driven and goes stale if the modal cached an outdated
    // instanceData (e.g. user connected Google Ads AFTER opening the form).
    // The ground truth is: do we have the actual credentials in DB right now?
    // We require customerId + developerToken + refreshToken; if all 3 present,
    // we can pull, regardless of what the user clicked in the form.
    const _baseline = (rd.results as Record<string, unknown> | undefined)?.client_account_baseline as
        { dfsData?: { googleAds?: { available?: boolean; sqr?: unknown; accountMetrics?: unknown } } } | undefined
    const baselineHasGads = !!_baseline?.dfsData?.googleAds?.available
    const cfgHasCreds = !!(googleAdsConfig.customerId
        && (googleAdsConfig as { developerToken?: string }).developerToken
        && (googleTokensForAudit as { refreshToken?: string } | null)?.refreshToken)
    // Use the real signal — either baseline successfully pulled (best), or
    // raw credentials present in DB (fallback).
    const canPullGoogleAds = baselineHasGads || cfgHasCreds
    const customerIdForDeep = canPullGoogleAds ? googleAdsConfig.customerId : undefined
    const developerTokenForDeep = canPullGoogleAds ? (googleAdsConfig as { developerToken?: string }).developerToken : undefined
    const loginCustomerIdForDeep = (googleAdsConfig as { loginCustomerId?: string }).loginCustomerId
    const rawScopeForDeep = (googleAdsConfig as { scope?: { mode?: string; campaignIds?: string[]; operatingCustomerId?: string } }).scope
    const operatingCustomerIdForDeep = (rawScopeForDeep?.operatingCustomerId || '').replace(/\D/g, '') || undefined
    const scopeForDeep = rawScopeForDeep?.mode === 'account'
        ? { mode: 'account' as const, operatingCustomerId: operatingCustomerIdForDeep }
        : { mode: 'campaigns' as const, operatingCustomerId: operatingCustomerIdForDeep, campaignIds: (rawScopeForDeep?.campaignIds || []).filter(id => /^\d+$/.test(id)) }

    if (canPullGoogleAds) {
        console.log(`[mazhirAudit] ${instanceId} canPullGoogleAds=true (baseline=${baselineHasGads} creds=${cfgHasCreds}) scope=${scopeForDeep.mode}/${(scopeForDeep.campaignIds||[]).length}`)
    }
    const historicalReports = ((pp as any).historicalReports || []) as Array<{ name: string; type: string; size: number; uploadedAt: string; base64: string }>

    const callTrackingCfg = (inst as any).callTrackingConfig || null

    const [dfsData, gscData, transparencyData, psiData, ga4Data, sqrData, auctionData, changeData, gtmInv, csvAggs, callData, ga4Aud, ga4Demo, ga4Fun, ga4Seas, gscPages, metaAds] = await Promise.all([
        (async () => {
            try {
                const { enrichKeywordsWithDFS } = await import('./dataforseoEnrich')
                return await enrichKeywordsWithDFS((inst as any).dataforseoKey, seedKeywords)
            } catch (e) { return { available: false, reason: 'enrichment failed', keywords: [], totalQueries: 0, locationCode: 0, languageCode: '' } }
        })(),
        (async () => {
            try {
                const { enrichWithGSC } = await import('./gscEnrich')
                return await enrichWithGSC(gscTokens)
            } catch (e) { return { available: false, reason: 'enrichment failed', queries: [], daysAnalyzed: 0 } }
        })(),
        (async () => {
            try {
                if (competitorDomains.length === 0) return { available: false, reason: 'No competitor domains', competitorsRequested: [], competitorsFound: [], ads: [] }
                const { enrichWithGoogleAdsTransparency } = await import('./googleAdsTransparency')
                return await enrichWithGoogleAdsTransparency(competitorDomains)
            } catch (e) { return { available: false, reason: 'enrichment failed', competitorsRequested: [], competitorsFound: [], ads: [] } }
        })(),
        (async () => {
            try {
                if (!websiteUrl) return { available: false, reason: 'No website URL', strategy: 'mobile' as const, topOpportunities: [], overallRating: 'critical' as const }
                const { enrichWithPageSpeed } = await import('./pagespeedInsights')
                return await enrichWithPageSpeed(websiteUrl)
            } catch (e) { return { available: false, reason: 'enrichment failed', strategy: 'mobile' as const, topOpportunities: [], overallRating: 'critical' as const } }
        })(),
        (async () => {
            try {
                const { enrichWithGA4 } = await import('./ga4Enrich')
                // Phase 4.1 — prefer explicit propertyId from user's picker
                // selection (agent_integrations.config.ga4PropertyId). Falls
                // back to best-effort website-URL matching only if not set.
                const explicitPropId = (googleTokensForAudit as { ga4PropertyId?: string } | null)?.ga4PropertyId
                return await enrichWithGA4(googleTokensForAudit, {
                    siteUrl: websiteUrl,
                    days: 365,
                    propertyId: explicitPropId,
                })
            } catch (e) { return { available: false, reason: 'enrichment failed', daysAnalyzed: 0, totalConversions: 0, events: [] } }
        })(),
        (async () => {
            try {
                const { pullSearchTermsReport } = await import('./googleAdsDeepEnrich')
                return await pullSearchTermsReport(customerIdForDeep, googleTokensForAudit, 90, scopeForDeep, loginCustomerIdForDeep, developerTokenForDeep)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, totalTerms: 0, totalSpendIls: 0, wasteByPattern: [], topConvertingTerms: [], estimatedWastedSpendPct: 0 } }
        })(),
        (async () => {
            try {
                const { pullAuctionInsights } = await import('./googleAdsDeepEnrich')
                return await pullAuctionInsights(customerIdForDeep, googleTokensForAudit, 90, scopeForDeep, loginCustomerIdForDeep, developerTokenForDeep)
            } catch (e) { return { available: false, reason: (e as Error).message, competitors: [] } }
        })(),
        (async () => {
            try {
                const { pullChangeHistory } = await import('./googleAdsDeepEnrich')
                return await pullChangeHistory(customerIdForDeep, googleTokensForAudit, 180, scopeForDeep, loginCustomerIdForDeep, developerTokenForDeep)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, totalChanges: 0, bigChanges: [] } }
        })(),
        (async () => {
            try {
                const { pullGtmInventory } = await import('./gtmInventory')
                return await pullGtmInventory(googleTokensForAudit, undefined, undefined, undefined, websiteUrl)
            } catch (e) { return { available: false, reason: (e as Error).message, tags: [], triggers: [], variables: [], coverage: { hasConversionLinker: false, hasGoogleAdsConversionTag: false, hasEnhancedConversions: false, hasGa4ConfigTag: false, hasGa4EventTag: false, hasConsentMode: false, hasGclidCapture: false } } }
        })(),
        (async () => {
            try {
                const { aggregateAllCsvs } = await import('./csvAggregator')
                return aggregateAllCsvs(historicalReports)
            } catch (e) { return [] }
        })(),
        (async () => {
            try {
                const { pullCallTracking } = await import('./callTrackingEnrich')
                return await pullCallTracking(callTrackingCfg, 90)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, totalCalls: 0, qualifiedCalls: 0, avgDurationSec: 0, callsBySource: [], topCampaignsByQualified: [], qualificationThresholdSec: 60 } }
        })(),
        (async () => {
            try {
                const { pullGA4Audiences } = await import('./ga4DeepEnrich')
                return await pullGA4Audiences(googleTokensForAudit, websiteUrl)
            } catch (e) { return { available: false, reason: (e as Error).message, audiences: [] } }
        })(),
        (async () => {
            try {
                const { pullGA4Demographics } = await import('./ga4DeepEnrich')
                return await pullGA4Demographics(googleTokensForAudit, websiteUrl, 365)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, byGender: [], byAge: [], byDevice: [], byCity: [] } }
        })(),
        (async () => {
            try {
                const { pullGA4Funnel } = await import('./ga4DeepEnrich')
                return await pullGA4Funnel(googleTokensForAudit, websiteUrl, 90)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, byLandingPage: [], bySource: [] } }
        })(),
        (async () => {
            try {
                const { pullGA4Seasonality } = await import('./ga4DeepEnrich')
                return await pullGA4Seasonality(googleTokensForAudit, websiteUrl, 730)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, monthly: [], seasonalIndex: [] } }
        })(),
        (async () => {
            try {
                const { pullGSCPages } = await import('./gscPagesEnrich')
                // gsc OAuth gave webmasters scope; fall back to general google
                // tokens only if gsc tokens not connected (they won't have scope)
                return await pullGSCPages(gscTokens || googleTokensForAudit, websiteUrl, 90)
            } catch (e) { return { available: false, reason: (e as Error).message, daysAnalyzed: 0, pages: [], topRankingPages: [], underperformingPages: [] } }
        })(),
        (async () => {
            try {
                const { pullMetaAdsLibrary } = await import('./metaAdsLibrary')
                return await pullMetaAdsLibrary(competitorDomains)
            } catch (e) { return { available: false, reason: (e as Error).message, competitorsScanned: 0, creatives: [] } }
        })(),
    ])

    // ─── Auto-derive historical fields when client left them empty ─────────
    // Responsibility rule: if we pulled the data, we MUST use it. Don't leave
    // paidProfile fields blank if CSV/GA4 already gave us the numbers.
    // Persist back to DB so subsequent audits / media plan see the same state.
    const autoDerivations: { field: string; value: any; from: string }[] = []
    const ppMutated: any = { ...pp }
    {
        // historicalCpcIls — from CSV aggregator (real spend ÷ real clicks)
        if (!ppMutated.historicalCpcIls && Array.isArray(csvAggs)) {
            const totals = csvAggs.reduce((acc, a) => {
                acc.cost += (a.totals?.cost || 0)
                acc.clicks += (a.totals?.clicks || 0)
                return acc
            }, { cost: 0, clicks: 0 })
            if (totals.clicks > 100 && totals.cost > 50) {
                const cpc = Math.round((totals.cost / totals.clicks) * 100) / 100
                ppMutated.historicalCpcIls = cpc
                autoDerivations.push({ field: 'historicalCpcIls', value: cpc, from: `CSV aggregation (${totals.clicks} clicks, ₪${totals.cost})` })
            }
        }
        // historicalConversionRatePct — from GA4 conv ÷ sessions OR CSV+GA4
        if (!ppMutated.historicalConversionRatePct) {
            if (ga4Data.available && ga4Data.sessionCount && ga4Data.totalConversions > 0) {
                const cr = Math.round((ga4Data.totalConversions / ga4Data.sessionCount) * 1000) / 10
                ppMutated.historicalConversionRatePct = cr
                autoDerivations.push({ field: 'historicalConversionRatePct', value: cr, from: `GA4 (${ga4Data.totalConversions} conv / ${ga4Data.sessionCount} sessions, ${ga4Data.daysAnalyzed}d)` })
            }
        }
        // historicalNotes — synthesize a clear summary if empty
        if (!ppMutated.historicalNotes && autoDerivations.length > 0) {
            ppMutated.historicalNotes = 'Auto-derived from connected sources: ' + autoDerivations.map(d => `${d.field}=${d.value} (${d.from})`).join('; ')
            autoDerivations.push({ field: 'historicalNotes', value: '(synthesized)', from: 'system' })
        }
        // primaryConversionEvent — from GA4 top event when conversionTypes left blank
        if (ga4Data.available && Array.isArray(ga4Data.events) && ga4Data.events.length > 0) {
            const topEvent = ga4Data.events[0]
            if (topEvent && topEvent.eventCount > 0) {
                ppMutated._derivedPrimaryConversion = { eventName: topEvent.eventName, count: topEvent.eventCount, from: 'ga4_top_event' }
            }
        }
        // Sync trackingStack flags with REAL connection state — client-claimed
        // values often go stale (e.g. user said ga4=false but reconnected later).
        if (ppMutated.trackingStack) {
            if (ga4Data.available && !ppMutated.trackingStack.ga4) {
                ppMutated.trackingStack.ga4 = true
                autoDerivations.push({ field: 'trackingStack.ga4', value: true, from: 'GA4 enrichment succeeded → flag corrected' })
            }
            if (gtmInv.available && !ppMutated.trackingStack.gtm) {
                ppMutated.trackingStack.gtm = true
                autoDerivations.push({ field: 'trackingStack.gtm', value: true, from: 'GTM inventory pulled → flag corrected' })
            }
        }
        // Persist mutations to DB so plan generator + future audits see them.
        // Phase 4.0(fix16) — route through agent context (multi-tenant safe).
        if (autoDerivations.length > 0) {
            try {
                await writeResearchData(agent, instanceId, { ...rd, paidProfile: ppMutated })
                console.log(`[mazhirAudit] auto-derived paidProfile fields:`, autoDerivations.map(d => d.field))
            } catch (err) {
                console.warn('[mazhirAudit] persist auto-derivations failed:', (err as Error).message)
            }
        }
    }

    const { renderDFSContext } = await import('./dataforseoEnrich')
    const { renderGSCContext } = await import('./gscEnrich')
    const { renderTransparencyContext } = await import('./googleAdsTransparency')
    const { renderPageSpeedContext } = await import('./pagespeedInsights')
    const { renderGA4Context } = await import('./ga4Enrich')
    const { renderSearchTermsContext, renderAuctionInsightsContext, renderChangeHistoryContext } = await import('./googleAdsDeepEnrich')
    const { renderGtmInventoryContext } = await import('./gtmInventory')
    const { renderCsvAggregateContext } = await import('./csvAggregator')
    const { renderCallTrackingContext } = await import('./callTrackingEnrich')
    const { renderGA4AudiencesContext, renderGA4DemographicsContext, renderGA4FunnelContext, renderGA4SeasonalityContext } = await import('./ga4DeepEnrich')
    const { renderGSCPagesContext } = await import('./gscPagesEnrich')
    const { renderMetaAdsContext } = await import('./metaAdsLibrary')
    // Phase 4.2.1-K — Account metrics ground-truth block from baseline.
    // Without this, Opus would invent industry-benchmark CR (1.5-3%) even
    // when baseline shows real CR (20.36% for Storage Station).
    let accountMetricsBlock = ''
    const _am = _baselineGads?.accountMetrics
    if (_am?.available) {
        accountMetricsBlock = `═══ ACCOUNT METRICS — REAL DATA FROM YOUR GOOGLE ADS (NOT INDUSTRY ESTIMATES) ═══

Time window: last ${_am.daysAnalyzed} days, scoped to the campaigns the user selected.

  • Total spend: ₪${(_am.cost ?? 0).toLocaleString()}
  • Clicks: ${(_am.clicks ?? 0).toLocaleString()}
  • Conversions: ${_am.conversions ?? 0}
  • Average CPC: ₪${_am.avgCpcIls?.toFixed(2) ?? '?'}
  • Conversion rate: ${_am.conversionRatePct?.toFixed(2) ?? '?'}%
  • CPA: ₪${_am.cpaIls?.toFixed(2) ?? '?'}

🚨 BINDING — use these numbers as ground truth:
  1. estimatedMonthlyConversions MUST anchor on real CR (${_am.conversionRatePct?.toFixed(2) ?? '?'}%), NOT industry benchmark (1.5-3%).
     Math: expected_clicks_per_month × ${_am.conversionRatePct?.toFixed(2) ?? '?'}% = baseline projection.
     If you propose lower CR than the real account, NAME a specific reason (new ad groups in learning / mid-funnel keyword expansion / etc).
  2. CPA range MUST anchor on real CPA (₪${_am.cpaIls?.toFixed(2) ?? '?'}). Industry benchmarks are NOT a substitute when real data exists.
  3. NEVER say "no real conversion data from client" or "client has no existing Google Ads account" — the account is connected and these numbers are real.
  4. CSV uploads (if any) are SUPPLEMENTARY history, not the primary source. The numbers above OVERRIDE any older CSV data.

`
    }

    const enrichmentBlocks = [
        accountMetricsBlock,                          // Phase 4.2.1-K — REAL ground truth, MUST be first
        renderGA4Context(ga4Data),                    // GA4 first — overrides CSV "0 conversions"
        renderGA4DemographicsContext(ga4Demo),
        renderGA4FunnelContext(ga4Fun),
        renderGA4SeasonalityContext(ga4Seas),
        renderGA4AudiencesContext(ga4Aud),
        renderCallTrackingContext(callData),
        renderSearchTermsContext(sqrData),
        renderAuctionInsightsContext(auctionData),
        renderChangeHistoryContext(changeData),
        renderCsvAggregateContext(csvAggs),
        renderGtmInventoryContext(gtmInv),
        renderDFSContext(dfsData),
        renderGSCContext(gscData),
        renderGSCPagesContext(gscPages),
        renderMetaAdsContext(metaAds),
        renderTransparencyContext(transparencyData),
        renderPageSpeedContext(psiData),
    ].join('\n\n')

    // ─── Phase 1: source coverage manifest ─────────────────────────────
    // Built BEFORE Opus call so we can pass it in the prompt as the
    // authoritative status table, and stamp it on the audit afterwards.
    const nowIso = new Date().toISOString()
    const sourceCoverage: any = {
        ga4: ga4Data.available
            ? { status: 'ok', pulledAt: nowIso, totalConversions: ga4Data.totalConversions, sessionCount: ga4Data.sessionCount, daysAnalyzed: ga4Data.daysAnalyzed }
            : { status: ga4Data.reason?.includes('not connected') ? 'missing' : 'failed', reason: ga4Data.reason },
        googleAdsAccount: accountSnapshot?.accessible
            ? { status: 'ok', pulledAt: nowIso, spendIls: accountSnapshot.last90Days?.spendIls, clicks: accountSnapshot.last90Days?.clicks }
            : (accountSnapshot ? { status: 'failed', reason: 'snapshot fetch failed' } : { status: 'n/a', reason: 'client has no existing Google Ads account' }),
        googleAdsRecommendations: accountSnapshot?.topRecommendations?.length
            ? { status: 'ok', pulledAt: nowIso, count: accountSnapshot.topRecommendations.length }
            : { status: 'n/a' },
        searchTermsReport: sqrData.available
            ? { status: 'ok', pulledAt: nowIso, totalTerms: sqrData.totalTerms, wastedPct: sqrData.estimatedWastedSpendPct }
            : { status: customerIdForDeep ? 'failed' : 'n/a', reason: sqrData.reason },
        auctionInsights: auctionData.available
            ? { status: 'ok', pulledAt: nowIso, competitors: auctionData.competitors.length, impressionShare: auctionData.impressionShare }
            : { status: customerIdForDeep ? 'failed' : 'n/a', reason: auctionData.reason },
        changeHistory: changeData.available
            ? { status: 'ok', pulledAt: nowIso, totalChanges: changeData.totalChanges, significant: changeData.bigChanges.length }
            : { status: customerIdForDeep ? 'failed' : 'n/a', reason: changeData.reason },
        gtmInventory: gtmInv.available
            ? { status: 'ok', pulledAt: nowIso, tags: gtmInv.tags.length, hasConversionLinker: gtmInv.coverage.hasConversionLinker, hasGoogleAdsConversionTag: gtmInv.coverage.hasGoogleAdsConversionTag }
            : { status: 'missing', reason: gtmInv.reason },
        ga4Audiences: ga4Aud.available
            ? { status: 'ok', pulledAt: nowIso, count: ga4Aud.audiences.length }
            : { status: 'failed', reason: ga4Aud.reason },
        ga4Demographics: ga4Demo.available
            ? { status: 'ok', pulledAt: nowIso, deviceBreakdown: ga4Demo.byDevice.length, cityBreakdown: ga4Demo.byCity.length }
            : { status: 'failed', reason: ga4Demo.reason },
        ga4Funnel: ga4Fun.available
            ? { status: 'ok', pulledAt: nowIso, landingPages: ga4Fun.byLandingPage.length, sources: ga4Fun.bySource.length }
            : { status: 'failed', reason: ga4Fun.reason },
        ga4Seasonality: ga4Seas.available && ga4Seas.monthly.length >= 6
            ? { status: 'ok', pulledAt: nowIso, monthsAnalyzed: ga4Seas.monthly.length }
            : { status: 'missing', reason: ga4Seas.reason || `only ${ga4Seas.monthly.length} months of data — need 12+` },
        searchConsole: gscData.available
            ? { status: 'ok', pulledAt: nowIso, queryCount: gscData.queries?.length || 0 }
            : { status: 'missing', reason: gscData.reason },
        searchConsolePages: gscPages.available
            ? { status: 'ok', pulledAt: nowIso, pages: gscPages.pages.length, topRanking: gscPages.topRankingPages.length, underperforming: gscPages.underperformingPages.length }
            : { status: 'missing', reason: gscPages.reason },
        callTracking: callData.available
            ? { status: 'ok', pulledAt: nowIso, provider: callData.provider, totalCalls: callData.totalCalls, qualifiedCalls: callData.qualifiedCalls }
            : (pp.trackingStack.callTracking === 'none'
                ? (pp.trackingStack.phoneCallsRelevant ? { status: 'failed', reason: 'phone calls relevant but no tracking provider connected' } : { status: 'n/a', reason: 'phone calls not relevant per client' })
                : { status: 'missing', reason: callData.reason || 'provider not connected to platform yet' }),
        dataforseo: dfsData.available
            ? { status: 'ok', pulledAt: nowIso, queryCount: dfsData.totalQueries }
            : { status: 'failed', reason: dfsData.reason },
        transparency: transparencyData.available
            ? { status: 'ok', pulledAt: nowIso, competitorsFound: transparencyData.competitorsFound?.length || 0, ads: transparencyData.ads?.length || 0 }
            : { status: 'missing', reason: transparencyData.reason },
        pagespeed: psiData.available
            ? { status: 'ok', pulledAt: nowIso, rating: psiData.overallRating }
            : { status: 'missing', reason: psiData.reason },
        metaAdsLibrary: metaAds.available
            ? { status: 'ok', pulledAt: nowIso, competitorsScanned: metaAds.competitorsScanned, creativesFound: metaAds.creatives.length }
            : { status: 'missing', reason: metaAds.reason },
        whatsappBusiness: { status: 'missing', reason: 'phase 6 — not yet implemented' },
        competitorPricing: { status: 'missing', reason: 'phase 6 — not yet implemented' },
        uploadedReports: csvAggs.length > 0
            ? { status: 'ok', pulledAt: nowIso, files: csvAggs.length, totalRows: csvAggs.reduce((s, a) => s + a.rowCount, 0), shapes: [...new Set(csvAggs.map(a => a.detectedShape))].join(',') }
            : (((pp as any).historicalReports?.length > 0)
                ? { status: 'ok', pulledAt: nowIso, files: (pp as any).historicalReports.length, note: 'non-CSV files (PDF/image), not aggregated' }
                : { status: 'n/a' }),
    }

    // Render coverage manifest as a table for Opus
    const coverageManifestForPrompt = Object.entries(sourceCoverage).map(([k, v]: [string, any]) => {
        const status = v.status
        const detail = status === 'ok'
            ? `OK · ${Object.entries(v).filter(([kk]) => !['status', 'pulledAt', 'reason'].includes(kk)).map(([kk, vv]) => `${kk}=${vv}`).join(', ')}`
            : `${status.toUpperCase()}${v.reason ? ' — ' + v.reason : ''}`
        return `  ${k.padEnd(28)} : ${detail}`
    }).join('\n')

    const model = await resolveDirectModel(instanceId, 'mazhir').catch(() => 'claude-opus-4-7')
    const usingOpus = model.startsWith('claude-opus')

    const system = `You are a senior PPC specialist (10+ years agency experience) auditing a new client's paid marketing setup. Your job: produce a STRUCTURED, ACTIONABLE audit grounded in 2025-2026 industry methodology. Apply these references mentally:

- Skagg's SKAG framework is dead since 2021 match-type changes → STAG (Single Theme Ad Group) is the SMB lead-gen default; Hagakure for high-volume e-commerce
- Performance Max for lead-gen is a junk-lead farm without offline qualified-lead conversion upload (Vallaeys, Search Engine Land 2025) — block it unless that pipeline exists
- Google Ads native conversion pixel is non-negotiable for Smart Bidding; GA4 alone is insufficient (10-60% accuracy gap)
- Enhanced Conversions for Web is required (not nice-to-have) in 2026
- Bid strategy thresholds: tCPA needs 30+ conv/30d at campaign level, tROAS 50+ — below these, locked
- Quality Score is a diagnostic, NOT a KPI (Vallaeys 2026 explicit warning)
- For the first 0-7 days of a takeover: fix tracking ONLY, don't touch bidding/structure
- Phone-call relevant businesses (storage, services, local) without call tracking with GCLID capture have zero outcome data → blocker for Smart Bidding

Output STRICT JSON matching the schema described in the user message. No prose outside JSON. Use Hebrew for any user-facing strings (recommendations, findings) since this client operates in Israel. Keywords/technical terms can stay English where natural.`

    const userPrompt = `Run a complete senior-PPC audit on this client and produce a MazhirAudit JSON.

═══ CLIENT CONTEXT ═══

Business: ${businessName}
Description: ${businessDesc.slice(0, 600)}
Website: ${websiteUrl}
Target audience: ${targetAudience.slice(0, 400)}
Competitors mentioned: ${competitors.slice(0, 400)}

═══ HISTORICAL PERFORMANCE GROUND TRUTH (client memory — OVERRIDES "0 conversions" in CSVs) ═══

When previous campaigns ran without conversion pixel, CSVs report 0 conversions —
but real leads existed. The client has provided their honest recollection:

Historical avg CPC (real): ${(ppMutated as any).historicalCpcIls != null ? '₪' + (ppMutated as any).historicalCpcIls : '(not provided)'}
Historical click-to-lead rate (estimated): ${(ppMutated as any).historicalConversionRatePct != null ? (ppMutated as any).historicalConversionRatePct + '%' : '(not provided)'}
Notes: ${(ppMutated as any).historicalNotes || '(none)'}

CRITICAL — IF THESE NUMBERS ARE PROVIDED:
- DO NOT use "0 conversions" from CSV reports as basis for tCPA / ROI math.
- Compute REAL historical CPA = historicalCpcIls / (historicalConversionRatePct/100).
  Example: ₪22 CPC × (1 / 60% conv rate) = ~₪37 cost per lead. THAT is the real CPA baseline.
- Compute REAL historical conversions/month from CSV clicks: clicks × historicalConversionRatePct/100 / months_run.
- Set transitionToTcpa.suggestedCpaIls based on this REAL baseline (e.g. 1.2-1.5× to give algorithm headroom), NOT a generic budget/expected formula.
- estimatedMonthlyConversions.expected should reflect REAL historical performance + offer impact, not theoretical 8.

═══ KEY OFFER & DIFFERENTIATORS (client-provided — TREAT AS GROUND TRUTH FOR RSA COPY) ═══

Current offer: ${(pp as any).keyOffer || '(not provided)'}
Key differentiators (vs competitors):
${((pp as any).keyDifferentiators || []).map((d: string, i: number) => `  ${i + 1}. ${d}`).join('\n') || '  (not provided)'}

Treat these as the strongest USPs. Reference in:
- mediaPlan headlines (each ad group must have ≥2 headlines featuring the offer/USPs)
- mediaPlan descriptions (mention price/access advantage explicitly)
- mediaPlan callouts/sitelinks
- Audit recommendedActions: if offer is genuinely better than market (e.g. half competitor's price), call it out as the lead-in story.

═══ PAID PROFILE (filled by client in onboarding) ═══

Monthly budget: ₪${pp.monthlyBudgetIls.toLocaleString()}
Primary goal: ${pp.primaryGoal}
Avg deal value: ₪${pp.avgDealValueIls.toLocaleString()}${pp.avgLtvIls ? ` (LTV ₪${pp.avgLtvIls.toLocaleString()})` : ''}
Decision cycle: ${pp.decisionCycle}
Geography: ${JSON.stringify(pp.geography)}
Has existing Google Ads account: ${pp.hasExistingAccount}
Tracking stack: GA4=${pp.trackingStack.ga4}, GTM=${pp.trackingStack.gtm}, callTracking=${pp.trackingStack.callTracking}, phoneCallsRelevant=${pp.trackingStack.phoneCallsRelevant}
Launch path: ${pp.launchPath}${pp.launchPath === 'launch_now' ? ' (acknowledged tradeoffs)' : ''}
Industry hint: ${pp.industryHint || '(none)'}

═══ PLATFORM CAPABILITIES YOU MUST RECOMMEND VIA THE PRODUCT, NOT MANUALLY ═══

DO NOT recommend the user manually install Google Ads conversion pixel via GTM —
the platform has an automated pipeline that does this:

  • mazhir_gtm_setup: creates Conversion Linker tag, GCLID Capture tag,
    customEvent triggers, awct (Google Ads conversion) tags, gaawe (GA4) tags,
    Enhanced Conversions config, Consent Mode v2 — and PUBLISHES the GTM
    workspace via Tag Manager API. One click in 'ניהול שיווק' tab.

  • mazhir_conversions: creates ConversionAction records inside the
    customer's Google Ads account via the Ads API and links them to the
    GTM tags.

When recommending tracking fixes, frame them as: "Run the platform's GTM
auto-setup pipeline (one click in ניהול שיווק tab) — it installs Conversion
Linker, native Google Ads pixel, Enhanced Conversions, and Consent Mode v2.
Then run mazhir_conversions to create matching ConversionAction records."

DO NOT tell the user to do it by hand unless OAuth scope tagmanager is missing.

═══ AVG DEAL VALUE GUIDANCE ═══

If paidProfile.avgDealValueIls is 0 or missing, DO NOT block on it. Compute
a heuristic from:
  - strategy unit-economics if available (look for ARPU / LTV / contract length)
  - persona WTP × decision-cycle from research stage5 validation interviews
  - industry benchmark if neither: storage IL ≈ ₪400-1,500/mo × 4-6 mo avg
Output the heuristic value in 'derivedAvgDealValueIls' field in your JSON
response, and flag as a "warning" (not blocker) telling user to confirm.

═══ MATH SANITY CHECK ═══

Before returning, verify: 'recommendedTcpa' × 'estimatedMonthlyConversions.expected'
should be within ±25% of 'monthlyBudgetIls'. If wildly off, recompute tCPA as
(monthlyBudget / expected_conversions). NEVER recommend tCPA based on theoretical
30-conv threshold if your own estimate is < 30 — that creates inconsistent math
and burns the user's budget.

${enrichmentBlocks}

═══ EXISTING ACCOUNT SNAPSHOT (last 90 days, if connected) ═══

${accountSnapshot
            ? (accountSnapshot.accessible
                ? JSON.stringify(accountSnapshot, null, 2)
                : 'Account configured but data fetch failed — surface as a finding')
            : '(client has no existing Google Ads account, or not linked yet)'}

═══ CLIENT-UPLOADED NON-CSV REPORTS ═══

${(() => {
                const reports = ((pp as any).historicalReports || []) as Array<{ name: string; type: string; size: number; uploadedAt: string }>
                const nonCsv = reports.filter(r => r.type !== 'text/csv' && !r.name.toLowerCase().endsWith('.csv'))
                if (nonCsv.length === 0) return '(no PDF/image reports — CSV reports already aggregated above)'
                return nonCsv.map(r => `${r.name} (${r.type}, ${(r.size / 1024).toFixed(0)} KB) — cannot extract text/images server-side. Recommend client export CSV for full analysis.`).join('\n')
            })()}

═══ DATA SOURCE COVERAGE MANIFEST ═══

This is what we DID and DID NOT pull for this audit. EVERY recommendation
you make must be defensible from these sources alone. If a recommendation
DEPENDS on a missing source, you MUST flag it in qualityWarnings.

${coverageManifestForPrompt}

${(() => {
                try {
                    const gaps = buildDataGaps(sourceCoverage, pp.primaryGoal)
                    return renderDataGapsForPrompt(gaps)
                } catch { return '' }
            })()}

═══ DATA RECONCILIATION POLICY (CRITICAL — DO NOT SKIP) ═══

When sources disagree, you MUST surface the conflict explicitly. Common case
in this codebase: Google Ads CSV reports 0 conversions (no native pixel) while
GA4 shows hundreds (tracking was working). DO NOT silently merge.

Priority order for "ground truth" when sources contradict:
  1. Client memory (paidProfile.historicalCpcIls / historicalConversionRatePct / historicalNotes)
     — explicit, recent, comes from someone watching their own bank account
  2. GA4 conversion events — direct measurement, regardless of pixel
  3. Google Ads native conversions — only trust when pixel was deployed correctly
  4. Google Ads CSV preview — last resort, often stale or missing
  5. DataForSEO benchmarks — industry baseline, never override client reality

For EVERY meaningful number you output (CPA, conversions, budget split, CPC),
you MUST output a 'derivation' field with the formula and inputs in plain Hebrew.

Example:
  "estimatedMonthlyConversions": {
    "low": 30, "expected": 60, "high": 120,
    "derivation": "תקציב ₪3000 / חודש ÷ CPA ריאליסטי ₪50 (1.5× CPA היסטורי ₪33 לטובת מרחב למידה לאלגוריתם) = 60 לידים. טווח 30-120 משקף תנודתיות עונתית ב-IL."
  }

═══ YOUR TASK ═══

Produce JSON matching this exact schema. Fields marked OPTIONAL can be omitted.
EVERY numeric field that affects budget MUST have a 'derivation' field next to it.

{
  "summary": "2-3 sentence Hebrew executive summary of where they are and the headline recommendation",
  "trackingHealth": {
    "score": "critical | poor | good | excellent",
    "issues": [
      { "severity": "blocker | high | medium | low", "finding": "Hebrew", "recommendation": "Hebrew, concrete action" }
    ]
  },
  "existingAccountAudit": OPTIONAL — only if account snapshot present {
    "accessible": true,
    "last90Days": <copy from snapshot>,
    "wasteAnalysis": { "estimatedWastedSpendPct": <number 0-100>, "topWasteTerms": [<3-5 likely junk patterns based on industry>] },
    "topRecommendations": [<3-5 Hebrew strings>]
  },
  "industrySignals": {
    "keywordSuggestions": [
      { "theme": "Hebrew theme name", "keywords": ["keyword 1", "keyword 2", ...], "estimatedSearches": "low|medium|high" }
    ],
    "competitorObservations": [<2-4 Hebrew observations>],
    "seasonality": OPTIONAL Hebrew note
  },
  "recommendedActions": {
    "immediate": [<3-6 Hebrew strings, 0-7 days>],
    "shortTerm": [<3-6 Hebrew strings, 7-30 days. MUST include channel-mix expansion suggestion: e.g. "אחרי 30+ המרות שקלו להוסיף Display Remarketing (תקציב נפרד ₪400/חודש) — תפעיל את audience website-visitors-30d מ-GA4". For e-commerce + budget ≥ ₪10K → suggest PMax + Demand Gen. For awareness goal → suggest YouTube + Discovery">],
    "ongoing": [<3-5 Hebrew strings, 30+ days. MUST include long-term channel diversification: e.g. "Search כיסוי נוכחי 12-15% IS — חודש 2-3 הוסיפו Performance Max כשתשתית offline conversion upload תהיה פעילה". Mention seasonal shifts in channel mix.>]
  },
  "methodology": "STAG | STAG+PMax | Hagakure | Hagakure+PMax+DemandGen | compressed_launch_now",
  "methodologyRationale": "Hebrew, 2-3 sentences. Defend WHY this methodology vs alternatives, given THIS client's data — not a generic textbook answer.",
  "estimatedMonthlyConversions": {
    "low": <number>, "expected": <number>, "high": <number>,
    "derivation": "Hebrew formula+inputs"
  },
  "derivedAvgDealValueIls": OPTIONAL — only when paidProfile.avgDealValueIls is 0 {
    "value": <number>, "derivation": "Hebrew formula+inputs", "confidence": "high|medium|low"
  },
  "dataReconciliation": {
    "conflicts": [
      {
        "topic": "conversions_last_90d",
        "sources": [
          { "source": "google_ads_csv", "value": 0, "note": "no native pixel during period" },
          { "source": "ga4", "value": 306, "note": "lead+submit+phone events" },
          { "source": "client_memory", "value": "~60% conv rate at ₪22 CPC", "note": "from historicalNotes" }
        ],
        "chosenSource": "client_memory + ga4",
        "chosenValue": "~180 lead events/year, ~60% click-to-quote",
        "rationale": "Hebrew: client confirmed conv rate, GA4 corroborates with similar magnitude, CSV is invalid (no pixel)."
      }
    ],
    "groundTruthChosen": "Hebrew: priority order applied, e.g. 'historical client memory + GA4 events as primary; CSV ignored due to missing pixel'",
    "requiresClientConfirmation": <true if any conflict resolution differs by >30% from any source>
  },
  "assumptions": [
    {
      "text": "Hebrew assumption description",
      "confidence": "high | medium | low",
      "ifWrongImpact": "Hebrew: what changes if this assumption is wrong"
    }
  ],
  "blockers": [<Hebrew strings, things that prevent any launch — empty array if none>]
}

═══ METHODOLOGY SELECTION RULES (apply rigidly) ═══

If launchPath = "launch_now" → methodology MUST be "compressed_launch_now" (a single STAG with safe defaults, Max Clicks bid, top-30 keywords, deferred research catching up weekly).

Else:
  primaryGoal = "leadgen" + budget < ₪7,000 → "STAG"
  primaryGoal = "leadgen" + budget >= ₪7,000 + has working offline conv upload → "STAG+PMax"
  primaryGoal = "leadgen" + budget >= ₪7,000 + no offline upload → "STAG" (and add a blocker requiring offline upload before PMax)
  primaryGoal = "ecommerce" + budget < ₪10,000 → "Hagakure"
  primaryGoal = "ecommerce" + budget >= ₪10,000 → "Hagakure+PMax+DemandGen"
  primaryGoal = "awareness" → "Hagakure+PMax+DemandGen" with awareness emphasis (weighted to Demand Gen + Display)
  primaryGoal = "store_visits" or "app_installs" → "STAG+PMax"

═══ BLOCKERS — APPEND EACH IF TRUE ═══

- If trackingStack.ga4 = false → "GA4 לא מותקן — Smart Bidding לא יעבוד עד ש-GA4 מחובר ויורה אירועים"
- If trackingStack.gtm = false → "אין GTM — לא ניתן ליצור tags לאישור המרות; חיבור GTM נדרש"
- If phoneCallsRelevant = true AND callTracking = "none" → "שיחות טלפון = ליד עיקרי, אבל אין מעקב שיחות — Google Ads מקבל רק לחיצה על tel:, לא תוצאה. נדרש CallRail/WhatConverts"
- If methodology contains "PMax" AND primaryGoal = "leadgen" AND no offline qualified-lead upload mentioned → "Performance Max עבור leadgen ללא העלאת המרות לידים מוסמכים יוצר קמפיין של junk-leads. נחסם עד שתשתית ה-offline upload פעילה"
- If hasExistingAccount = true AND accountSnapshot.accessible = false → "חשבון Google Ads קיים אך לא מחובר ל-Mazhir — נדרש OAuth"

Return ONLY the JSON object. No markdown fences, no commentary.`

    const raw = await callOpus({
        apiKey,
        model,
        system,
        user: userPrompt,
        maxTokens: usingOpus ? 32000 : 12000,
        timeoutMs: 300000,
    })

    const parsed = extractJson<MazhirAudit>(raw, 'mazhirAudit')

    // Phase 1 validation — show-your-math contract.
    // Every numeric recommendation must carry a derivation. We reject silently
    // by surfacing missing derivations as quality warnings; the audit still
    // saves so the client gets value, but UI hides the suspect numbers.
    const qualityWarnings: string[] = (parsed as any).qualityWarnings || []
    const checkDerivation = (path: string, val: any) => {
        if (val == null) return
        if (typeof val === 'object') {
            if (typeof val.derivation !== 'string' || val.derivation.length < 10) {
                qualityWarnings.push(`חסר חישוב מסביר ב-${path} — מספר לא מאומת`)
            }
        }
    }
    checkDerivation('estimatedMonthlyConversions', parsed.estimatedMonthlyConversions)
    if ((parsed as any).derivedAvgDealValueIls) {
        checkDerivation('derivedAvgDealValueIls', (parsed as any).derivedAvgDealValueIls)
    }

    // Phase 4 — devil's-advocate second pass.
    // Sonnet review of audit + paidProfile + sourceCoverage looking for
    // missing assumptions, math errors, missing-data dependencies. Adds
    // findings to qualityWarnings. Failures are non-fatal — primary audit
    // still saves; user just sees fewer extra warnings.
    try {
        const { runDevilsAdvocate } = await import('./mazhirDevilsAdvocate')
        const adversarial = await runDevilsAdvocate({
            apiKey,
            audit: parsed,
            paidProfile: pp,
            sourceCoverage,
        })
        for (const w of adversarial) {
            if (!qualityWarnings.includes(w)) qualityWarnings.push(w)
        }
    } catch (err) {
        console.warn('[mazhirAudit] devil\'s-advocate skipped:', (err as Error).message)
    }

    // Stamp server-authoritative fields
    let dataGaps: any[] = []
    try {
        const { buildDataGaps } = await import('./enrichmentContract')
        dataGaps = buildDataGaps(sourceCoverage, pp.primaryGoal)
    } catch (err) {
        console.warn('[mazhirAudit] dataGaps build failed:', (err as Error).message)
    }
    const audit: MazhirAudit = {
        ...parsed,
        generatedAt: new Date().toISOString(),
        sourceCoverage,                  // server-built, never trust LLM-emitted
        qualityWarnings,
        dataGaps,                        // server-built — registry-driven impact + fallback per gap
    }

    // Phase 5 — audit diff (compare to previous audit if any)
    let auditDiff: any = undefined
    const prevAudit = rd.mazhirAudit as MazhirAudit | undefined
    if (prevAudit && prevAudit.generatedAt) {
        try {
            const { computeAuditDiff } = await import('./mazhirAuditDiff')
            auditDiff = computeAuditDiff(prevAudit, audit)
        } catch (err) {
            console.warn('[mazhirAudit] diff failed:', (err as Error).message)
        }
    }

    // Persist (audit + diff together so UI can render movement vs prior run).
    // Phase 4.0(fix16) — route through agent context so mateh_agents.research_data
    // (canonical for multi-tenant) gets updated; primary agent mirrors to
    // instances.research_data automatically.
    await writeResearchData(agent, instanceId, {
        ...rd,
        mazhirAudit: audit,
        mazhirAuditDiff: auditDiff,
        mazhirAuditPrev: prevAudit,    // keep one prior for diff next time
    })

    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[mazhirAudit] ${instanceId}: audit ready in ${elapsedSec}s (model=${model}, methodology=${audit.methodology}, blockers=${audit.blockers.length})`)

    // Rough cost estimate based on model
    const usdEstimate = usingOpus ? 0.4 : 0.08
    return { audit, cost: { model, usdEstimate } }
}