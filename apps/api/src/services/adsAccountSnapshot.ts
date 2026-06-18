/**
 * Ads Account Snapshot — Layer 1 of the Campaign Foundation Engine (roadmap/24).
 *
 * A SINGLE read-only call that returns the COMPLETE live picture of a scoped
 * brand's Google Ads account, the way a senior PPC manager reads every setting
 * before touching anything. Nothing here writes. It is the grounding the
 * reconciler (Layer 2) diffs the strategy against, and a deliverable by itself
 * (the "full audit" the operator asked for).
 *
 * Two hard rules from roadmap/24 §0 are baked in here:
 *   • STRUCTURE (campaigns / ad groups / keywords / negatives / geo / budgets /
 *     bidding settings) is the CURRENT snapshot — queried WITHOUT a date filter
 *     so dormant-but-present campaigns are never missed.
 *   • PERFORMANCE (cost / clicks / conv / conv-value / SQR waste) is pulled for
 *     the trailing 14 DAYS ONLY — earlier conversion data is attribution-polluted
 *     (pre-gclid-fix) and must not influence any decision. Perf is a SEPARATE set
 *     of queries, joined to structure in code.
 *
 * Shared-account aware (§0.2/0.4): operates only on the active brand's scoped
 * campaignIds, and separately enumerates SIBLING campaigns (the other brands on
 * the same operating account) so the reconciler can propose cross-brand negatives.
 *
 * Reuses the proven GAQL + MCC login-customer-id resolution pattern from
 * adsRecommendationsEvaluator / campaignGoalIsolation, and folds in
 * pullSearchTermsReport (SQR) + auditGoogleAdsSafety so the snapshot is the one
 * place that holds everything.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { pullSearchTermsReport, type CampaignScope } from '@/services/googleAdsDeepEnrich'
import { auditGoogleAdsSafety, type AdsSafetyReport } from '@/services/googleAdsSafetyAudit'
import { getSiblingBrands, type SiblingBrand } from '@/services/siblingBrands'

const ADS = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ─── Context resolution (mirrors adsRecommendationsEvaluator.resolveAdsCtx) ──

interface SnapshotCtx {
    operating: string            // sub-account we query (URL path)
    manager: string              // MCC / login-customer-id header
    dev: string                  // developer token
    at: string                   // access token
    refreshToken: string
    scopedCampaignIds: string[]  // this brand's campaigns (numeric strings)
    accountMode: boolean         // true = no campaign scope (single-tenant account)
}

async function accessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || '', csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        return ((await r.json()) as { access_token?: string }).access_token || null
    } catch { return null }
}

async function resolveCtx(agent: MatehAgentRow): Promise<SnapshotCtx | null> {
    const cfg: any = (agent.googleAdsConfig as any)
        || (await db.select().from(instances).where(eq(instances.id, agent.vpsInstanceId)))[0]?.googleAdsConfig
        || {}
    const manager = String(cfg.customerId || '').replace(/\D/g, '')
    const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || manager).replace(/\D/g, '')
    const dev = String(cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '')
    const rt = (agent.googleTokens as any)?.refreshToken || (agent.googleTokens as any)?.refresh_token
    const scopedCampaignIds: string[] = (cfg.scope?.campaignIds || []).map((x: any) => String(x).replace(/\D/g, '')).filter(Boolean)
    const accountMode = cfg.scope?.mode === 'account' || scopedCampaignIds.length === 0
    if (!operating || !dev || !rt) return null
    const at = await accessToken(rt)
    return at ? { operating, manager, dev, at, refreshToken: rt, scopedCampaignIds, accountMode } : null
}

// searchStream — handles the batched response shape + surfaces the specific
// Ads error message (not a generic 400) the way the other ads services do.
async function adsStream(ctx: SnapshotCtx, query: string): Promise<any[]> {
    const headers: Record<string, string> = { Authorization: `Bearer ${ctx.at}`, 'developer-token': ctx.dev, 'Content-Type': 'application/json' }
    if (ctx.manager && ctx.manager !== ctx.operating) headers['login-customer-id'] = ctx.manager
    const res = await fetch(`${ADS}/customers/${ctx.operating}/googleAds:searchStream`, {
        method: 'POST', headers, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000),
    })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(`Ads ${res.status}: ${(data?.error?.message || text.slice(0, 200)).toString().replace(/\s+/g, ' ')}`)
    const out: any[] = []
    for (const batch of (Array.isArray(data) ? data : [data])) for (const r of (batch?.results || [])) out.push(r)
    return out
}

const micros = (v: any) => Math.round((Number(v || 0) / 1e6) * 100) / 100
const inClause = (ids: string[]) => ids.length ? `(${ids.join(',')})` : '(0)'

// ─── Typed snapshot shapes ───────────────────────────────────────────────────

export interface SnapCampaign {
    id: string
    name: string
    status: 'ENABLED' | 'PAUSED' | 'REMOVED' | string
    channel: string                  // SEARCH | PERFORMANCE_MAX | SHOPPING | DISPLAY | VIDEO | ...
    channelSubType?: string
    biddingStrategyType: string
    targetRoas?: number              // fraction (e.g. 4.0 = 400%)
    targetCpaIls?: number
    dailyBudgetIls?: number
    sharedBudget?: boolean
    goalConfigLevel?: 'CUSTOMER' | 'CAMPAIGN' | string   // scoped campaigns only
    customConversionGoal?: string                          // scoped campaigns only
    isSibling: boolean               // true = belongs to another brand on the account
    perf14d: Perf
}
export interface SnapAdGroup {
    id: string
    campaignId: string
    name: string
    status: string
    cpcBidIls?: number
    perf14d: Perf
}
export interface SnapKeyword {
    campaignId: string
    adGroupId: string
    criterionId: string
    text: string
    matchType: 'EXACT' | 'PHRASE' | 'BROAD' | string
    status: string
    qualityScore?: number
}
export interface SnapNegative {
    level: 'campaign' | 'ad_group' | 'shared_set'
    campaignId?: string
    adGroupId?: string
    sharedSetId?: string
    sharedSetName?: string
    text: string
    matchType: string
}
export interface SnapGeo {
    campaignId: string
    geoTargetConstant: string        // resource name, e.g. geoTargetConstants/1007754
    geoName?: string                 // resolved canonical name (best-effort)
    bidModifier?: number
    negative: boolean
}
export interface Perf {
    costIls: number
    clicks: number
    impressions: number
    conversions: number
    convValueIls: number
}
const ZERO_PERF: Perf = { costIls: 0, clicks: 0, impressions: 0, conversions: 0, convValueIls: 0 }

export interface AccountSnapshot {
    ok: boolean
    error?: string
    brand: string
    operatingCustomerId: string
    loginCustomerId: string
    accountMode: boolean
    scopedCampaignIds: string[]
    capturedAt: string
    // brand-scoped structure
    campaigns: SnapCampaign[]            // scoped (this brand)
    siblingCampaigns: SnapCampaign[]     // other brands on the same account
    siblingBrands: SiblingBrand[]        // resolved sibling brand names/domains
    adGroups: SnapAdGroup[]
    keywords: SnapKeyword[]
    negatives: SnapNegative[]
    geo: SnapGeo[]
    // brand-scoped performance (14d ONLY)
    perfWindowDays: 14
    perf14dTotal: Perf
    searchTerms?: Awaited<ReturnType<typeof pullSearchTermsReport>>
    safety?: AdsSafetyReport
    // which sources failed (per-source resilience — a failing query never sinks the snapshot)
    sourceErrors: Record<string, string>
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function buildAccountSnapshot(agent: MatehAgentRow): Promise<AccountSnapshot> {
    const brand = String(agent.name || '').trim() || 'agent'
    const empty: AccountSnapshot = {
        ok: false, brand, operatingCustomerId: '', loginCustomerId: '', accountMode: true,
        scopedCampaignIds: [], capturedAt: new Date().toISOString(),
        campaigns: [], siblingCampaigns: [], siblingBrands: [], adGroups: [], keywords: [],
        negatives: [], geo: [], perfWindowDays: 14, perf14dTotal: { ...ZERO_PERF }, sourceErrors: {},
    }
    const ctx = await resolveCtx(agent)
    if (!ctx) { empty.error = 'google_ads_not_connected'; return empty }

    const snap: AccountSnapshot = {
        ...empty, ok: true,
        operatingCustomerId: ctx.operating, loginCustomerId: ctx.manager || ctx.operating,
        accountMode: ctx.accountMode, scopedCampaignIds: ctx.scopedCampaignIds,
    }
    const err = (k: string, e: unknown) => { snap.sourceErrors[k] = (e as Error).message.slice(0, 200) }
    const scoped = new Set(ctx.scopedCampaignIds)

    // ── STRUCTURE: all campaigns (no date filter — current snapshot) ──────────
    try {
        const rows = await adsStream(ctx, `
            SELECT campaign.id, campaign.name, campaign.status,
                   campaign.advertising_channel_type, campaign.advertising_channel_sub_type,
                   campaign.bidding_strategy_type,
                   campaign.maximize_conversion_value.target_roas,
                   campaign.target_roas.target_roas,
                   campaign.target_cpa.target_cpa_micros,
                   campaign.maximize_conversions.target_cpa_micros,
                   campaign_budget.amount_micros, campaign_budget.explicitly_shared
            FROM campaign
            WHERE campaign.status != 'REMOVED'`)
        for (const r of rows) {
            const c = r.campaign || {}, b = r.campaignBudget || {}
            const id = String(c.id || '')
            if (!id) continue
            const troas = c.targetRoas?.targetRoas ?? c.maximizeConversionValue?.targetRoas
            const tcpaMicros = c.targetCpa?.targetCpaMicros ?? c.maximizeConversions?.targetCpaMicros
            // accountMode (no explicit scope) → treat every campaign as "this brand".
            const isSibling = !ctx.accountMode && !scoped.has(id)
            const camp: SnapCampaign = {
                id, name: c.name || '?', status: c.status || 'UNKNOWN',
                channel: c.advertisingChannelType || '?', channelSubType: c.advertisingChannelSubType,
                biddingStrategyType: c.biddingStrategyType || '?',
                targetRoas: troas != null ? Math.round(Number(troas) * 100) / 100 : undefined,
                targetCpaIls: tcpaMicros != null ? micros(tcpaMicros) : undefined,
                dailyBudgetIls: b.amountMicros != null ? micros(b.amountMicros) : undefined,
                sharedBudget: b.explicitlyShared === true,
                isSibling, perf14d: { ...ZERO_PERF },
            }
            if (isSibling) snap.siblingCampaigns.push(camp)
            else snap.campaigns.push(camp)
        }
    } catch (e) { err('campaigns', e) }

    // In accountMode the scope IS every campaign — use it for downstream IN-clauses.
    const brandCampaignIds = ctx.accountMode ? snap.campaigns.map(c => c.id) : ctx.scopedCampaignIds
    const searchBrandIds = snap.campaigns.filter(c => c.channel === 'SEARCH').map(c => c.id)

    // ── Conversion-goal level per scoped campaign (read-only; never re-touch) ──
    if (brandCampaignIds.length) {
        try {
            const rows = await adsStream(ctx, `
                SELECT campaign.id, conversion_goal_campaign_config.goal_config_level,
                       conversion_goal_campaign_config.custom_conversion_goal
                FROM conversion_goal_campaign_config
                WHERE campaign.id IN ${inClause(brandCampaignIds)}`)
            const byId = new Map(snap.campaigns.map(c => [c.id, c]))
            for (const r of rows) {
                const cc = r.conversionGoalCampaignConfig || {}
                const c = byId.get(String(r.campaign?.id))
                if (c) { c.goalConfigLevel = cc.goalConfigLevel; c.customConversionGoal = cc.customConversionGoal }
            }
        } catch (e) { err('goalLevels', e) }
    }

    // ── Ad groups (Search campaigns, structure) ───────────────────────────────
    if (searchBrandIds.length) {
        try {
            const rows = await adsStream(ctx, `
                SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, campaign.id
                FROM ad_group
                WHERE campaign.id IN ${inClause(searchBrandIds)} AND ad_group.status != 'REMOVED'`)
            for (const r of rows) {
                const g = r.adGroup || {}
                snap.adGroups.push({
                    id: String(g.id || ''), campaignId: String(r.campaign?.id || ''),
                    name: g.name || '?', status: g.status || 'UNKNOWN',
                    cpcBidIls: g.cpcBidMicros != null ? micros(g.cpcBidMicros) : undefined,
                    perf14d: { ...ZERO_PERF },
                })
            }
        } catch (e) { err('adGroups', e) }

        // ── Keywords (positive) ───────────────────────────────────────────────
        try {
            const rows = await adsStream(ctx, `
                SELECT ad_group.id, campaign.id, ad_group_criterion.criterion_id,
                       ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
                       ad_group_criterion.status, ad_group_criterion.quality_info.quality_score
                FROM ad_group_criterion
                WHERE campaign.id IN ${inClause(searchBrandIds)}
                  AND ad_group_criterion.type = 'KEYWORD'
                  AND ad_group_criterion.negative = false
                  AND ad_group_criterion.status != 'REMOVED'`)
            for (const r of rows) {
                const ac = r.adGroupCriterion || {}, kw = ac.keyword || {}
                snap.keywords.push({
                    campaignId: String(r.campaign?.id || ''), adGroupId: String(r.adGroup?.id || ''),
                    criterionId: String(ac.criterionId || ''), text: kw.text || '',
                    matchType: kw.matchType || '?', status: ac.status || 'UNKNOWN',
                    qualityScore: ac.qualityInfo?.qualityScore != null ? Number(ac.qualityInfo.qualityScore) : undefined,
                })
            }
        } catch (e) { err('keywords', e) }

        // ── Ad-group-level negatives ──────────────────────────────────────────
        try {
            const rows = await adsStream(ctx, `
                SELECT ad_group.id, campaign.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type
                FROM ad_group_criterion
                WHERE campaign.id IN ${inClause(searchBrandIds)}
                  AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = true`)
            for (const r of rows) {
                const kw = r.adGroupCriterion?.keyword || {}
                snap.negatives.push({ level: 'ad_group', campaignId: String(r.campaign?.id || ''), adGroupId: String(r.adGroup?.id || ''), text: kw.text || '', matchType: kw.matchType || '?' })
            }
        } catch (e) { err('adGroupNegatives', e) }
    }

    // ── Campaign-level negatives ──────────────────────────────────────────────
    if (brandCampaignIds.length) {
        try {
            const rows = await adsStream(ctx, `
                SELECT campaign.id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
                FROM campaign_criterion
                WHERE campaign.id IN ${inClause(brandCampaignIds)}
                  AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = true`)
            for (const r of rows) {
                const kw = r.campaignCriterion?.keyword || {}
                snap.negatives.push({ level: 'campaign', campaignId: String(r.campaign?.id || ''), text: kw.text || '', matchType: kw.matchType || '?' })
            }
        } catch (e) { err('campaignNegatives', e) }

        // ── Shared negative sets attached to scoped campaigns + their keywords ─
        try {
            const attached = await adsStream(ctx, `
                SELECT campaign.id, shared_set.id, shared_set.name, shared_set.type
                FROM campaign_shared_set
                WHERE campaign.id IN ${inClause(brandCampaignIds)} AND shared_set.type = 'NEGATIVE_KEYWORDS'`)
            const setMeta = new Map<string, string>()   // setId → name
            for (const r of attached) {
                const sid = String(r.sharedSet?.id || '')
                if (sid) setMeta.set(sid, r.sharedSet?.name || sid)
            }
            if (setMeta.size) {
                const setIds = [...setMeta.keys()]
                const crit = await adsStream(ctx, `
                    SELECT shared_set.id, shared_criterion.keyword.text, shared_criterion.keyword.match_type
                    FROM shared_set_criterion
                    WHERE shared_set.id IN ${inClause(setIds)}`)
                for (const r of crit) {
                    const sid = String(r.sharedSet?.id || ''), kw = r.sharedCriterion?.keyword || {}
                    snap.negatives.push({ level: 'shared_set', sharedSetId: sid, sharedSetName: setMeta.get(sid), text: kw.text || '', matchType: kw.matchType || '?' })
                }
            }
        } catch (e) { err('sharedSetNegatives', e) }

        // ── Geo targeting + bid modifiers ─────────────────────────────────────
        try {
            const rows = await adsStream(ctx, `
                SELECT campaign.id, campaign_criterion.location.geo_target_constant,
                       campaign_criterion.bid_modifier, campaign_criterion.negative
                FROM campaign_criterion
                WHERE campaign.id IN ${inClause(brandCampaignIds)} AND campaign_criterion.type = 'LOCATION'`)
            for (const r of rows) {
                const cc = r.campaignCriterion || {}
                snap.geo.push({
                    campaignId: String(r.campaign?.id || ''),
                    geoTargetConstant: String(cc.location?.geoTargetConstant || ''),
                    bidModifier: cc.bidModifier != null ? Number(cc.bidModifier) : undefined,
                    negative: cc.negative === true,
                })
            }
            // Best-effort resolve geo names.
            const consts = [...new Set(snap.geo.map(g => g.geoTargetConstant).filter(Boolean))]
            if (consts.length) {
                try {
                    const names = await adsStream(ctx, `
                        SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name, geo_target_constant.name
                        FROM geo_target_constant
                        WHERE geo_target_constant.resource_name IN (${consts.map(c => `'${c}'`).join(',')})`)
                    const nameMap = new Map<string, string>()
                    for (const r of names) {
                        const g = r.geoTargetConstant || {}
                        nameMap.set(String(g.resourceName || ''), g.canonicalName || g.name || '')
                    }
                    for (const g of snap.geo) g.geoName = nameMap.get(g.geoTargetConstant) || undefined
                } catch { /* name resolution non-fatal */ }
            }
        } catch (e) { err('geo', e) }
    }

    // ── PERFORMANCE (14d ONLY) — separate queries, joined to structure ────────
    if (brandCampaignIds.length) {
        try {
            const rows = await adsStream(ctx, `
                SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions,
                       metrics.conversions, metrics.conversions_value
                FROM campaign
                WHERE campaign.id IN ${inClause(brandCampaignIds)} AND segments.date DURING LAST_14_DAYS`)
            const byId = new Map(snap.campaigns.map(c => [c.id, c]))
            for (const r of rows) {
                const c = byId.get(String(r.campaign?.id)); if (!c) continue
                const m = r.metrics || {}
                c.perf14d = {
                    costIls: micros(m.costMicros), clicks: Number(m.clicks || 0), impressions: Number(m.impressions || 0),
                    conversions: Math.round(Number(m.conversions || 0) * 10) / 10, convValueIls: micros(Number(m.conversionsValue || 0) * 1e6),
                }
            }
            snap.perf14dTotal = snap.campaigns.reduce((t, c) => ({
                costIls: Math.round((t.costIls + c.perf14d.costIls) * 100) / 100,
                clicks: t.clicks + c.perf14d.clicks, impressions: t.impressions + c.perf14d.impressions,
                conversions: Math.round((t.conversions + c.perf14d.conversions) * 10) / 10,
                convValueIls: Math.round((t.convValueIls + c.perf14d.convValueIls) * 100) / 100,
            }), { ...ZERO_PERF })
        } catch (e) { err('campaignPerf14d', e) }
    }
    if (searchBrandIds.length) {
        try {
            const rows = await adsStream(ctx, `
                SELECT ad_group.id, campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions,
                       metrics.conversions, metrics.conversions_value
                FROM ad_group
                WHERE campaign.id IN ${inClause(searchBrandIds)} AND segments.date DURING LAST_14_DAYS`)
            const byId = new Map(snap.adGroups.map(g => [g.id, g]))
            for (const r of rows) {
                const g = byId.get(String(r.adGroup?.id)); if (!g) continue
                const m = r.metrics || {}
                g.perf14d = {
                    costIls: micros(m.costMicros), clicks: Number(m.clicks || 0), impressions: Number(m.impressions || 0),
                    conversions: Math.round(Number(m.conversions || 0) * 10) / 10, convValueIls: micros(Number(m.conversionsValue || 0) * 1e6),
                }
            }
        } catch (e) { err('adGroupPerf14d', e) }
    }

    // ── SQR waste (14d) — reuse pullSearchTermsReport, scoped ─────────────────
    try {
        const scope: CampaignScope = ctx.accountMode
            ? { mode: 'account', operatingCustomerId: ctx.operating }
            : { mode: 'campaigns', operatingCustomerId: ctx.operating, campaignIds: ctx.scopedCampaignIds }
        snap.searchTerms = await pullSearchTermsReport(
            ctx.operating, { refreshToken: ctx.refreshToken }, 14, scope, ctx.manager || ctx.operating, ctx.dev,
        )
    } catch (e) { err('searchTerms', e) }

    // ── Safety audit — reuse auditGoogleAdsSafety, scoped ─────────────────────
    try {
        snap.safety = await auditGoogleAdsSafety({
            operatingCustomerId: ctx.operating, loginCustomerId: ctx.manager || ctx.operating,
            tokens: { refreshToken: ctx.refreshToken }, developerToken: ctx.dev,
            scopedCampaignIds: ctx.accountMode ? undefined : ctx.scopedCampaignIds,
        })
    } catch (e) { err('safety', e) }

    // ── Sibling brands (names/domains for cross-brand negatives) ──────────────
    try {
        snap.siblingBrands = await getSiblingBrands(agent.vpsInstanceId, agent.id)
    } catch (e) { err('siblingBrands', e) }

    return snap
}

/** Convenience for scripts/cron: resolve agent by id then snapshot. */
export async function snapshotForAgent(agentId: string): Promise<AccountSnapshot> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ...(await buildAccountSnapshot({} as MatehAgentRow)), error: `agent_not_found:${agentId}` }
    return buildAccountSnapshot(agent as MatehAgentRow)
}

// ─── Human-readable report (the "full audit" deliverable) ────────────────────

export function renderSnapshotReport(s: AccountSnapshot): string {
    if (!s.ok) return `❌ snapshot failed: ${s.error}`
    const L: string[] = []
    const p = (perf: Perf) => `₪${perf.costIls.toLocaleString()} · ${perf.clicks} clk · ${perf.conversions} conv · ₪${perf.convValueIls.toLocaleString()} val`
    L.push(`═══ ACCOUNT SNAPSHOT — ${s.brand} ═══`)
    L.push(`operating=${s.operatingCustomerId} login=${s.loginCustomerId} · ${s.accountMode ? 'ACCOUNT-mode (no scope)' : `scoped ${s.scopedCampaignIds.length} campaigns`}`)
    L.push(`captured ${s.capturedAt} · perf window = ${s.perfWindowDays}d ONLY`)
    L.push('')
    L.push(`── CAMPAIGNS (this brand: ${s.campaigns.length}) ──`)
    for (const c of s.campaigns) {
        const bid = c.biddingStrategyType + (c.targetRoas ? ` tROAS=${Math.round(c.targetRoas * 100)}%` : '') + (c.targetCpaIls ? ` tCPA=₪${c.targetCpaIls}` : '')
        const goal = c.goalConfigLevel ? ` · goal=${c.goalConfigLevel}` : ''
        L.push(`  [${c.status}] ${c.name} (${c.id}) · ${c.channel} · ${bid}${goal} · budget ₪${c.dailyBudgetIls ?? '?'}/d`)
        L.push(`        14d: ${p(c.perf14d)}`)
    }
    L.push(`  14d TOTAL: ${p(s.perf14dTotal)}`)
    L.push('')
    if (s.siblingCampaigns.length) {
        L.push(`── SIBLING CAMPAIGNS (other brands on account: ${s.siblingCampaigns.length}) ──`)
        for (const c of s.siblingCampaigns) L.push(`  [${c.status}] ${c.name} (${c.id}) · ${c.channel}`)
        L.push('')
    }
    if (s.siblingBrands.length) L.push(`── SIBLING BRANDS: ${s.siblingBrands.map(b => `${b.name} (${b.domain})`).join(', ')}`)
    L.push('')
    L.push(`── AD GROUPS (${s.adGroups.length}) ──`)
    for (const g of s.adGroups) L.push(`  [${g.status}] ${g.name} (${g.id}) · cpc ₪${g.cpcBidIls ?? '?'} · 14d ${p(g.perf14d)}`)
    L.push('')
    const byMatch = s.keywords.reduce((m, k) => { m[k.matchType] = (m[k.matchType] || 0) + 1; return m }, {} as Record<string, number>)
    L.push(`── KEYWORDS (${s.keywords.length}) — ${Object.entries(byMatch).map(([k, v]) => `${k}:${v}`).join(' ') || 'none'}`)
    L.push('')
    const negByLevel = s.negatives.reduce((m, n) => { m[n.level] = (m[n.level] || 0) + 1; return m }, {} as Record<string, number>)
    L.push(`── NEGATIVES (${s.negatives.length}) — ${Object.entries(negByLevel).map(([k, v]) => `${k}:${v}`).join(' ') || 'NONE ⚠'}`)
    L.push('')
    L.push(`── GEO TARGETS (${s.geo.length}) — ${s.geo.map(g => g.geoName || g.geoTargetConstant.split('/').pop()).join(', ') || 'none (national/unset) ⚠'}`)
    L.push('')
    if (s.searchTerms?.available) {
        L.push(`── SQR WASTE (14d): ${s.searchTerms.estimatedWastedSpendPct}% est. waste · top: ${s.searchTerms.wasteByPattern.slice(0, 5).map(w => `"${w.pattern}"`).join(', ') || 'none'}`)
    } else L.push(`── SQR WASTE (14d): unavailable (${s.searchTerms?.reason || 'n/a'})`)
    if (s.safety) L.push(`── SAFETY: ${s.safety.summary} (${s.safety.findings.length} findings)`)
    if (Object.keys(s.sourceErrors).length) {
        L.push('')
        L.push(`⚠ SOURCE ERRORS: ${Object.entries(s.sourceErrors).map(([k, v]) => `${k}=${v}`).join(' | ')}`)
    }
    return L.join('\n')
}