/**
 * Phase 4.2.3-B3 — Conversion Mapping Scorer
 *
 * Auto-detects which existing conversion_actions in a user's Google Ads account
 * represent THIS instance's signals (form_submit / phone_call / etc.). Uses 4
 * evidence layers ranked by certainty:
 *
 *   Layer A (HARD)    — campaign.selective_optimization.conversion_actions
 *                       lists exact actions a campaign uses, if selective
 *                       optimization is enabled. Score: +90.
 *
 *   Layer B (HARD)    — Empirical attribution: how many conversions did this
 *                       action drive for OUR campaigns in the last 90 days?
 *                       Score: +5 per conv, cap +50.
 *
 *   Layer C (HARD)    — GTM-tag evidence: if the user's GTM container has an
 *                       awct/gaawe tag pointing at this action's
 *                       (conversionId, conversionLabel), that proves the action
 *                       receives signals from THIS site (because the container
 *                       is installed on the site). Score: +100.
 *
 *   Layer D (FALLBACK) — Type-based heuristics:
 *                       WEBPAGE_CODELESS (Enhanced Conversions, account-wide) → +5
 *                       AD_CALL (account-wide call tracking) → +5
 *                       Name contains other-business indicator → −10
 *
 * GA4 is NOT consulted here. It's only a fallback (Phase 4.2.3-B3-fallback) when
 * scoring is ambiguous (confidence < 50 for any spec).
 */

import { db } from '@/db'
import { instances } from '@/db/schema'

const GADS_API = 'https://googleads.googleapis.com/v22'
const GTM_API = 'https://www.googleapis.com/tagmanager/v2'
const FETCH_TIMEOUT_MS = 12_000

export type Confidence = 'high' | 'medium' | 'low'

export interface MappingEvidence {
    /** Set of conversion_action resourceNames that are in our scope campaigns' selective optimization. */
    selectiveOptActions: Set<string>
    /** Map<conversionActionResourceName, last90dConv-attributed-to-our-campaigns>. */
    attributedConv: Map<string, number>
    /** Set of (conversionId|conversionLabel) keys found in GTM tags on THIS site. */
    gtmTaggedKeys: Set<string>
    /** Hint: instance domain (lowercase, no protocol) to help name heuristics. */
    instanceDomainHint: string | null
    /** Hint: business indicator words to BOOST when present in action name. */
    ownBusinessKeywords: string[]
    /** Hint: business indicator words to PENALIZE when present in action name. */
    otherBusinessKeywords: string[]
}

export interface CandidateScore {
    score: number
    confidence: Confidence
    rationaleHe: string                 // single-line Hebrew explanation
    breakdown: Record<string, number>   // contribution per layer for debugging
}

// ─── Auth helper (local copy to avoid circular imports) ─────────────────
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || '',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const j = await res.json() as any
        return j.access_token || null
    } catch { return null }
}

async function gaqlStream(
    customerId: string, accessToken: string, developerToken: string,
    query: string, loginCustomerId?: string,
): Promise<any[]> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': developerToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST', headers, body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`GAds ${res.status}: ${text.slice(0, 300)}`)
    let data: any
    try { data = JSON.parse(text) } catch { throw new Error(`GAds non-JSON: ${text.slice(0, 200)}`) }
    const rows: any[] = []
    const chunks = Array.isArray(data) ? data : [data]
    for (const chunk of chunks) {
        if (chunk.results) rows.push(...chunk.results)
    }
    return rows
}

// ═════════════════════════════════════════════════════════════════════════
// Layer A — campaign.selective_optimization
// ═════════════════════════════════════════════════════════════════════════
// Returns the set of conversion_action resourceNames that scope's campaigns
// explicitly list as their bidding-conversions. Empty set when campaigns use
// account-level goals (most common).
export async function getCampaignSelectiveOptActions(
    customerId: string, accessToken: string, developerToken: string,
    campaignIds: string[], loginCustomerId?: string,
): Promise<Set<string>> {
    const out = new Set<string>()
    if (campaignIds.length === 0) return out
    const idList = campaignIds.map(id => `'${id}'`).join(',')
    try {
        const rows = await gaqlStream(customerId, accessToken, developerToken, `
            SELECT campaign.id, campaign.selective_optimization.conversion_actions
            FROM campaign
            WHERE campaign.id IN (${idList})
        `, loginCustomerId)
        for (const r of rows) {
            const so = r.campaign?.selectiveOptimization || r.campaign?.selective_optimization
            const actions: string[] = so?.conversionActions || so?.conversion_actions || []
            for (const ra of actions) out.add(String(ra))
        }
    } catch (err) {
        // Non-fatal — scoring just won't have Layer A boost
        console.warn('[conversionScorer] getCampaignSelectiveOptActions failed:', (err as Error).message)
    }
    return out
}

// ═════════════════════════════════════════════════════════════════════════
// Layer B — empirical attribution of conversions to our campaigns
// ═════════════════════════════════════════════════════════════════════════
// For each conversion_action that drove conversions for OUR scope campaigns in
// the last 90 days, returns the total conversion count. The conversion_action
// segment exposes its resource_name via segments.conversion_action.
export async function getCampaignAttributedConversions(
    customerId: string, accessToken: string, developerToken: string,
    campaignIds: string[], loginCustomerId?: string,
): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (campaignIds.length === 0) return out
    const idList = campaignIds.map(id => `'${id}'`).join(',')
    // 90-day window, ending yesterday (Ads metrics aren't realtime)
    const today = new Date()
    const end = new Date(today.getTime() - 24 * 3600 * 1000)
    const start = new Date(today.getTime() - 91 * 24 * 3600 * 1000)
    const endStr = end.toISOString().slice(0, 10)
    const startStr = start.toISOString().slice(0, 10)
    try {
        const rows = await gaqlStream(customerId, accessToken, developerToken, `
            SELECT segments.conversion_action, campaign.id, metrics.all_conversions
            FROM campaign
            WHERE campaign.id IN (${idList})
                  AND segments.date BETWEEN '${startStr}' AND '${endStr}'
        `, loginCustomerId)
        for (const r of rows) {
            const ra = r.segments?.conversionAction || r.segments?.conversion_action
            if (!ra) continue
            const conv = Number(r.metrics?.allConversions || r.metrics?.all_conversions || 0)
            out.set(String(ra), (out.get(String(ra)) || 0) + conv)
        }
    } catch (err) {
        console.warn('[conversionScorer] getCampaignAttributedConversions failed:', (err as Error).message)
    }
    return out
}

// ═════════════════════════════════════════════════════════════════════════
// Layer C — GTM-tag evidence: what awct/gaawe tags fire on THIS site?
// ═════════════════════════════════════════════════════════════════════════
// Inspects the user's GTM container LIVE version (the one actually published).
// For each awct tag, extracts (conversionId, conversionLabel) parameters → these
// are the signals firing on this site. Cross-reference with conversion_action
// tag_snippets to identify the matching conversion_actions.
//
// Returns a set of "conversionId|conversionLabel" keys. Caller matches each
// conversion_action's extracted (id, label) against this set to detect overlap.
export async function getGtmAwctTagSignals(
    googleTokens: any,
    target: { accountId: string; containerId: string } | undefined,
): Promise<Set<string>> {
    const out = new Set<string>()
    if (!target?.accountId || !target?.containerId) return out
    if (!googleTokens?.refreshToken) return out
    const accessToken = await refreshAccessToken(googleTokens.refreshToken)
    if (!accessToken) return out
    try {
        const res = await fetch(`${GTM_API}/accounts/${target.accountId}/containers/${target.containerId}:live`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return out
        const data = await res.json() as any
        const tags: any[] = data.tag || []
        for (const tag of tags) {
            if (tag.type !== 'awct' && tag.type !== 'gaawe') continue
            const params: any[] = tag.parameter || []
            let conversionId: string | null = null
            let conversionLabel: string | null = null
            for (const p of params) {
                if (p.key === 'conversionId') conversionId = String(p.value || '').trim()
                if (p.key === 'conversionLabel') conversionLabel = String(p.value || '').trim()
            }
            if (conversionId && conversionLabel) {
                out.add(`${conversionId}|${conversionLabel}`)
            }
        }
    } catch (err) {
        console.warn('[conversionScorer] getGtmAwctTagSignals failed:', (err as Error).message)
    }
    return out
}

// ═════════════════════════════════════════════════════════════════════════
// Top-level: collect all evidence for an instance's scope campaigns
// ═════════════════════════════════════════════════════════════════════════

export async function collectMappingEvidence(instanceId: string): Promise<MappingEvidence> {
    const { eq } = await import('drizzle-orm')
    const [instReal] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instReal) throw new Error('Instance not found')

    const rd: any = instReal.researchData || {}
    const cfg: any = instReal.googleAdsConfig || {}
    const tokens: any = instReal.googleTokens || {}

    const rootCustomerId: string | undefined = cfg.customerId
    const operatingCustomerId: string | undefined = cfg.scope?.operatingCustomerId
    const customerId: string | undefined = operatingCustomerId || rootCustomerId
    const loginCustomerId: string | undefined = operatingCustomerId ? rootCustomerId : cfg.loginCustomerId
    const developerToken: string = cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
    const campaignIds: string[] = (cfg.scope?.campaignIds || []).map((id: any) => String(id))

    // Instance domain — used for name heuristics
    let instanceDomainHint: string | null = null
    const siteUrl: string | undefined = rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl
    if (siteUrl) {
        try {
            const u = siteUrl.indexOf('://') >= 0 ? siteUrl : `https://${siteUrl}`
            const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase()
            instanceDomainHint = host
        } catch { /* ignore */ }
    }

    // Business name keywords — derive from instance/agent name + paidProfile.businessName
    const ownKeywords: string[] = []
    const tryAdd = (s: string | undefined | null) => {
        if (!s) return
        const norm = s.trim().toLowerCase()
        if (norm.length >= 3) ownKeywords.push(norm)
    }
    tryAdd((instReal as any).name)
    tryAdd(rd.paidProfile?.businessName)
    tryAdd(instanceDomainHint?.split('.')[0])    // e.g. "storage-station" from domain

    // Other business keywords: derive heuristically from action names we'll see (not known upfront).
    // We'll let scoring detect by exclusion: anything in action name that's a known "Station"-style
    // brand prefix NOT matching our own = other.
    // For Phase 1 keep this empty; can be extended.
    const otherBusinessKeywords: string[] = []

    // Discover evidence in parallel (each is independent)
    const evidence: MappingEvidence = {
        selectiveOptActions: new Set(),
        attributedConv: new Map(),
        gtmTaggedKeys: new Set(),
        instanceDomainHint,
        ownBusinessKeywords: ownKeywords,
        otherBusinessKeywords,
    }

    if (!customerId || !developerToken || !tokens.refreshToken) {
        // No Ads connection or no token — Layer A/B unavailable
        // Still try GTM (Layer C uses its own tokens path)
        evidence.gtmTaggedKeys = await getGtmAwctTagSignals(tokens, rd.mazhirGtm?.target)
        return evidence
    }

    const accessToken = await refreshAccessToken(tokens.refreshToken)
    if (!accessToken) {
        evidence.gtmTaggedKeys = await getGtmAwctTagSignals(tokens, rd.mazhirGtm?.target)
        return evidence
    }

    const [selectiveOpt, attributed, gtmKeys] = await Promise.all([
        getCampaignSelectiveOptActions(customerId, accessToken, developerToken, campaignIds, loginCustomerId),
        getCampaignAttributedConversions(customerId, accessToken, developerToken, campaignIds, loginCustomerId),
        getGtmAwctTagSignals(tokens, rd.mazhirGtm?.target),
    ])

    evidence.selectiveOptActions = selectiveOpt
    evidence.attributedConv = attributed
    evidence.gtmTaggedKeys = gtmKeys

    return evidence
}

// ═════════════════════════════════════════════════════════════════════════
// Scoring: combine evidence into a per-candidate score + Hebrew rationale
// ═════════════════════════════════════════════════════════════════════════

export interface CandidateInput {
    resourceName: string
    name: string
    category: string
    type: string
    primaryForGoal: boolean
    googleAdsConversionId?: string
    googleAdsConversionLabel?: string
    isMazhirOwned: boolean
}

// Name semantic match: which action-name keywords correspond to our actionKey?
// Used in Layer E (name semantic) — if the candidate's name contains a keyword
// matching its actionKey purpose, that's a positive signal (action was named by
// user to represent that exact event).
const ACTION_KEY_NAME_KEYWORDS: Record<string, string[]> = {
    form_submit:        ['form_submit', 'form submit', 'lead_form', 'lead form', 'submit_lead', 'טופס', 'יצירת קשר', 'contact form'],
    generate_lead:      ['form_submit', 'lead_form', 'lead form', 'generate_lead', 'טופס', 'יצירת קשר'],
    phone_call:         ['phone_call', 'phone call', 'phone click', 'calls from', 'call from', 'phone_call_from', 'שיחה', 'טלפון'],
    phone_call_offline: ['phone_call', 'phone call', 'offline call', 'שיחה'],
    purchase:           ['purchase', 'רכישה', 'order', 'checkout'],
    qualified_lead:     ['qualified', 'מוסמך', 'qualified_lead'],
}

export function scoreCandidate(c: CandidateInput, ev: MappingEvidence, actionKey?: string): CandidateScore {
    const breakdown: Record<string, number> = {}
    let score = 0
    const reasons: string[] = []

    // Layer C: GTM tag points to this action → strongest evidence (signal from THIS site)
    const gtmKey = (c.googleAdsConversionId && c.googleAdsConversionLabel)
        ? `${c.googleAdsConversionId}|${c.googleAdsConversionLabel}`
        : null
    if (gtmKey && ev.gtmTaggedKeys.has(gtmKey)) {
        score += 100
        breakdown.gtm_tag_match = 100
        reasons.push('GTM tag פעיל באתר fires לאקשן זה')
    }

    // Layer A: selective optimization explicit list
    if (ev.selectiveOptActions.has(c.resourceName)) {
        score += 90
        breakdown.selective_optimization = 90
        reasons.push('הקמפיין משתמש באקשן זה במפורש (selective_optimization)')
    }

    // Layer B: empirical attribution — log-scale weighting so 80 conv beats 10
    // (log scale prevents the linear cap from flattening big differences in
    // attribution. Formula: 5 + 35 * log10(1 + conv), capped at 70.)
    const conv = ev.attributedConv.get(c.resourceName) || 0
    if (conv > 0) {
        const raw = 5 + 35 * Math.log10(1 + conv)
        const capped = Math.min(70, raw)
        score += capped
        breakdown.attribution = Math.round(capped)
        reasons.push(`${Math.round(conv)} המרות אטריבוטו לקמפיין שלכם`)
    }

    // Layer D: type fallback (smaller weight — empirical attribution should
    // dominate. Type is a tiebreaker, not a primary signal.)
    if (c.type === 'WEBPAGE_CODELESS') {
        score += 5
        breakdown.type_account_wide = 5
        if (reasons.length === 0) reasons.push('Enhanced Conversions account-wide — בטוח')
    } else if (c.type === 'AD_CALL') {
        score += 5
        breakdown.type_account_wide = 5
        if (reasons.length === 0) reasons.push('שיחות מהמודעות (account-wide) — בטוח')
    } else if (c.type === 'WEBPAGE') {
        score += 5
        breakdown.type_gtm_native = 5
    }

    // Layer E: name semantic match — does the action name suggest it represents
    // this actionKey's event? This is what separates "Calls from ads" (clearly
    // a phone signal) from "Contact" (generic).
    if (actionKey) {
        const keywords = ACTION_KEY_NAME_KEYWORDS[actionKey] || []
        const nameLower = c.name.toLowerCase()
        const matched = keywords.find(kw => nameLower.includes(kw.toLowerCase()))
        if (matched) {
            score += 10
            breakdown.name_semantic_match = 10
            reasons.push(`שם האקשן תואם semantically ל-${actionKey}`)
        }
    }

    // Layer D continued: name heuristic for own/other business
    const nameLower = c.name.toLowerCase()
    if (ev.ownBusinessKeywords.some(kw => kw && nameLower.includes(kw))) {
        score += 10
        breakdown.name_own_business = 10
        reasons.push('שם האקשן כולל את שם העסק שלכם')
    }
    if (ev.otherBusinessKeywords.some(kw => kw && nameLower.includes(kw))) {
        score -= 10
        breakdown.name_other_business = -10
        reasons.push('שם האקשן כולל אינדיקטור עסק אחר')
    }

    // Mazhir-owned with 0 conv and no other evidence — weak signal (just stale-create)
    if (c.isMazhirOwned && conv === 0 && !ev.gtmTaggedKeys.has(gtmKey || '')) {
        score -= 5
        breakdown.mazhir_orphan_penalty = -5
    }

    // Confidence buckets
    const confidence: Confidence = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
    const rationaleHe = reasons.length > 0 ? reasons.join(' · ') : 'אין evidence ייעודי — fallback ברירת מחדל'

    return { score, confidence, rationaleHe, breakdown }
}