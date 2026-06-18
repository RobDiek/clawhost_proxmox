/**
 * Foundation Applier — Layer 4 of the Campaign Foundation Engine (roadmap/24).
 *
 * Runs ONLY on approval (triggerPostApprove → ads_foundation_review). Applies
 * the deltas stored in the task's metadata via the google-ads-api SDK, using
 * the PER-AGENT operating account (NOT the instance-level config — this is a
 * shared multi-brand account). Every new ad group is created PAUSED (§0.12);
 * negatives + keyword edits apply live (low-risk, reversible). Per-delta
 * try/catch — one failure never blocks the rest; results report back per delta.
 *
 * Only deltas carrying an `apply` hint are actuated:
 *   add_campaign_negatives  → campaign-level negative keywords (PHRASE)
 *   convert_broad_keywords  → remove BROAD criterion, re-add as PHRASE
 *   create_ad_group_paused  → new ad group (PAUSED) + its exact/phrase keywords
 *   add_keywords            → add missing exact/phrase keywords to an ad group
 * Advisory deltas (geo overlap, bidding-defer, budget, exact-coverage,
 * brand-defense narrative) are review-only and not auto-applied.
 */
import { GoogleAdsApi, enums } from 'google-ads-api'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

const MATCH: Record<string, any> = { exact: enums.KeywordMatchType.EXACT, phrase: enums.KeywordMatchType.PHRASE, broad: enums.KeywordMatchType.BROAD }

interface ApplyCustomer { customer: any; cid: string }

async function resolveCustomer(agent: MatehAgentRow): Promise<ApplyCustomer | { error: string }> {
    const cfg: any = (agent.googleAdsConfig as any)
        || (await db.select().from(instances).where(eq(instances.id, agent.vpsInstanceId)))[0]?.googleAdsConfig
        || {}
    const cid = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || cfg.customerId || '').replace(/\D/g, '')
    const login = String(cfg.loginCustomerId || cfg.customerId || cid).replace(/\D/g, '')
    const dev = cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const rt = (agent.googleTokens as any)?.refreshToken || (agent.googleTokens as any)?.refresh_token
    if (!cid || !dev || !rt) return { error: 'google_ads_not_connected' }
    const client = new GoogleAdsApi({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, developer_token: dev })
    const customer = client.Customer({ customer_id: cid, refresh_token: rt, login_customer_id: login })
    return { customer, cid }
}

export interface DeltaApplyResult { id: string; kind: string; ok: boolean; detail?: string; error?: string }
export interface FoundationApplyResult { ok: boolean; error?: string; applied: DeltaApplyResult[]; failed: DeltaApplyResult[] }

async function applyDelta(c: ApplyCustomer, d: any): Promise<DeltaApplyResult> {
    const base = { id: d.id, kind: d.kind }
    const p = d.apply?.payload || {}
    try {
        switch (d.apply?.kind) {
            case 'add_campaign_negatives': {
                const campaign = `customers/${c.cid}/campaigns/${String(p.campaignId).replace(/\D/g, '')}`
                const mt = MATCH[String(p.matchType || 'phrase').toLowerCase()] || enums.KeywordMatchType.PHRASE
                const ops = (p.keywords || []).map((kw: string) => ({ campaign, negative: true, keyword: { text: String(kw), match_type: mt } }))
                if (!ops.length) return { ...base, ok: true, detail: 'no keywords' }
                await c.customer.campaignCriteria.create(ops)
                return { ...base, ok: true, detail: `+${ops.length} campaign negatives` }
            }
            case 'convert_broad_keywords': {
                const items: Array<{ adGroupId: string; criterionId: string; text: string }> = p.criterionIds || []
                let removed = 0, added = 0
                for (const it of items) {
                    const agId = String(it.adGroupId).replace(/\D/g, ''), critId = String(it.criterionId).replace(/\D/g, '')
                    if (!agId || !critId) continue
                    try {
                        await c.customer.adGroupCriteria.remove([`customers/${c.cid}/adGroupCriteria/${agId}~${critId}`])
                        removed++
                        await c.customer.adGroupCriteria.create([{ ad_group: `customers/${c.cid}/adGroups/${agId}`, status: enums.AdGroupCriterionStatus.ENABLED, keyword: { text: String(it.text), match_type: enums.KeywordMatchType.PHRASE } }])
                        added++
                    } catch (e) { /* keep converting the rest */ void e }
                }
                return { ...base, ok: added > 0 || items.length === 0, detail: `broad→phrase: removed ${removed}, added ${added}/${items.length}` }
            }
            case 'create_ad_group_paused': {
                const campaign = `customers/${c.cid}/campaigns/${String(p.campaignId).replace(/\D/g, '')}`
                const [ag] = await c.customer.adGroups.create([{ campaign, name: String(p.label).slice(0, 250), status: enums.AdGroupStatus.PAUSED, type: enums.AdGroupType.SEARCH_STANDARD }])
                const agResource = ag.resource_name
                const kws = (p.keywords || []).filter((k: any) => k.matchType !== 'broad').map((k: any) => ({
                    ad_group: agResource, status: enums.AdGroupCriterionStatus.ENABLED,
                    keyword: { text: String(k.keyword), match_type: MATCH[String(k.matchType || 'phrase').toLowerCase()] || enums.KeywordMatchType.PHRASE },
                }))
                if (kws.length) await c.customer.adGroupCriteria.create(kws)
                return { ...base, ok: true, detail: `ad group "${p.label}" PAUSED + ${kws.length} keywords` }
            }
            case 'add_keywords': {
                const agId = String(p.adGroupId).replace(/\D/g, '')
                const kws = (p.keywords || []).filter((k: any) => k.matchType !== 'broad').map((k: any) => ({
                    ad_group: `customers/${c.cid}/adGroups/${agId}`, status: enums.AdGroupCriterionStatus.ENABLED,
                    keyword: { text: String(k.keyword), match_type: MATCH[String(k.matchType || 'phrase').toLowerCase()] || enums.KeywordMatchType.PHRASE },
                }))
                if (!kws.length) return { ...base, ok: true, detail: 'no exact/phrase keywords' }
                await c.customer.adGroupCriteria.create(kws)
                return { ...base, ok: true, detail: `+${kws.length} keywords` }
            }
            default:
                return { ...base, ok: false, error: `unknown_apply_kind:${d.apply?.kind}` }
        }
    } catch (e) {
        return { ...base, ok: false, error: (e as Error).message.slice(0, 240) }
    }
}

/** Applied when an `ads_foundation_review` task is approved. */
export async function applyFoundationFromTask(output: typeof agentOutputs.$inferSelect): Promise<FoundationApplyResult> {
    const meta = (output.metadata || {}) as any
    const deltas: any[] = (meta.deltas || []).filter((d: any) => d?.apply)
    if (!deltas.length) return { ok: true, applied: [], failed: [] }

    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const agent = output.agentId
        ? await resolveAgentById(output.instanceId, output.agentId)
        : await resolvePrimaryAgent(output.instanceId)
    if (!agent) return { ok: false, error: 'agent_not_found', applied: [], failed: [] }

    const c = await resolveCustomer(agent as MatehAgentRow)
    if ('error' in c) return { ok: false, error: c.error, applied: [], failed: [] }

    const applied: DeltaApplyResult[] = [], failed: DeltaApplyResult[] = []
    // Order: negatives first (protect spend), then structure. Sibling/account
    // negatives are the highest-value, lowest-risk change — land them first.
    const order = (k: string) => ({ add_sibling_negatives: 0, add_account_negatives: 1, convert_broad_keywords: 2, create_ad_group: 3, add_keywords: 4 } as Record<string, number>)[k] ?? 9
    for (const d of [...deltas].sort((a, b) => order(a.kind) - order(b.kind))) {
        const r = await applyDelta(c, d)
        ;(r.ok ? applied : failed).push(r)
    }
    return { ok: failed.length === 0, applied, failed }
}