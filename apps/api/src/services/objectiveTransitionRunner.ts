/**
 * Objective Transition Runner — apply the tenant's chosen bidding objective to
 * IMPORTED / existing Google Ads campaigns (the ones ClawFlow didn't launch, so
 * they have no bidContract and the launch-path bidTransitionRunner never touches
 * them — e.g. Packing Station's Pmax/Search campaigns on a shared MCC).
 *
 * Daily sweep over mateh_agents that have:
 *   • research_data.biddingObjective with goal target_roas / target_cpa, and
 *   • google_ads_config.scope.campaignIds (scoped imported campaigns).
 * When the scoped campaigns have accrued enough conversions, it PROPOSES a
 * bidding transition (pending_review + Telegram) — never auto-applies. On
 * approval, applyImportedObjectiveTransition flips the live strategy.
 *
 * Handles the two real-world field differences that the generic transition
 * executor does not:
 *   • Performance Max sets the target on maximize_conversion_value.target_roas
 *     (or maximize_conversions.target_cpa_micros), NOT a TARGET_ROAS strategy.
 *   • Standard campaigns use the TARGET_ROAS / TARGET_CPA strategy fields.
 * And it routes through the MCC via login-customer-id + operating customer id.
 *
 * Policy: propose-only, human approves (feedback_no_automatic_actions).
 */

import { eq, and, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import telegram from '@/services/telegram'
import { getTransitionForObjective, type BiddingObjective } from '@/services/biddingObjective'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADS_API = 'https://googleads.googleapis.com/v22'

async function refresh(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        const j = await r.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

function adsHeaders(at: string, devToken: string, loginCustomerId: string): Record<string, string> {
    const h: Record<string, string> = {
        Authorization: `Bearer ${at}`,
        'developer-token': devToken,
        'Content-Type': 'application/json',
    }
    if (loginCustomerId) h['login-customer-id'] = loginCustomerId
    return h
}

async function adsSearch(at: string, devToken: string, operatingCustomerId: string, loginCustomerId: string, query: string): Promise<any[]> {
    const r = await fetch(`${ADS_API}/customers/${operatingCustomerId}/googleAds:searchStream`, {
        method: 'POST', headers: adsHeaders(at, devToken, loginCustomerId),
        body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000),
    })
    const data = await r.json() as any
    if (!r.ok) throw new Error(data?.error?.message || `Ads search ${r.status}`)
    const out: any[] = []
    if (Array.isArray(data)) for (const b of data) if (b.results) out.push(...b.results)
    return out
}

interface CampaignRow { id: string; name: string; channelType: string; biddingType: string; conversions: number }

async function fetchScopedCampaigns(at: string, devToken: string, operatingCustomerId: string, loginCustomerId: string, campaignIds: string[]): Promise<CampaignRow[]> {
    const rows = await adsSearch(at, devToken, operatingCustomerId, loginCustomerId,
        `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type, metrics.conversions FROM campaign WHERE campaign.id IN (${campaignIds.join(',')}) AND segments.date DURING LAST_30_DAYS`)
    // One row per campaign (aggregated over the window). De-dup defensively.
    const byId = new Map<string, CampaignRow>()
    for (const r of rows) {
        const id = String(r.campaign?.id)
        const prev = byId.get(id)
        const conv = Number(r.metrics?.conversions || 0)
        if (prev) { prev.conversions += conv; continue }
        byId.set(id, {
            id,
            name: r.campaign?.name || id,
            channelType: r.campaign?.advertisingChannelType || '',
            biddingType: r.campaign?.biddingStrategyType || '',
            conversions: conv,
        })
    }
    return [...byId.values()]
}

/**
 * Build + send the correct campaigns:mutate for the campaign type + goal.
 * Performance Max and standard campaigns carry the target on different fields.
 */
async function applyObjectiveToCampaign(params: {
    at: string; devToken: string; operatingCustomerId: string; loginCustomerId: string
    campaignId: string; channelType: string; goal: 'target_roas' | 'target_cpa'
    targetRoas?: number; targetCpaIls?: number
}): Promise<{ ok: boolean; reason?: string; mask: string }> {
    const { at, devToken, operatingCustomerId, loginCustomerId, campaignId, channelType, goal } = params
    const resourceName = `customers/${operatingCustomerId}/campaigns/${campaignId}`
    const isPmax = channelType === 'PERFORMANCE_MAX'
    const update: Record<string, unknown> = { resourceName }
    let mask = ''

    if (goal === 'target_roas') {
        const troas = params.targetRoas || 4.0
        if (isPmax) { update.maximizeConversionValue = { targetRoas: troas }; mask = 'maximize_conversion_value.target_roas' }
        else { update.targetRoas = { targetRoas: troas }; mask = 'target_roas.target_roas' }
    } else {
        const micros = String(Math.round((params.targetCpaIls || 50) * 1_000_000))
        if (isPmax) { update.maximizeConversions = { targetCpaMicros: micros }; mask = 'maximize_conversions.target_cpa_micros' }
        else { update.targetCpa = { targetCpaMicros: micros }; mask = 'target_cpa.target_cpa_micros' }
    }

    try {
        const r = await fetch(`${ADS_API}/customers/${operatingCustomerId}/campaigns:mutate`, {
            method: 'POST', headers: adsHeaders(at, devToken, loginCustomerId),
            body: JSON.stringify({ operations: [{ update, updateMask: mask }] }),
            signal: AbortSignal.timeout(30000),
        })
        const data = await r.json() as any
        if (!r.ok) {
            const msg = data?.error?.details?.[0]?.errors?.[0]?.message || data?.error?.message || JSON.stringify(data).slice(0, 200)
            return { ok: false, reason: `API ${r.status}: ${msg}`, mask }
        }
        return { ok: true, mask }
    } catch (err) {
        return { ok: false, reason: (err as Error).message, mask }
    }
}

function adsConfigOf(agent: MatehAgentRow) {
    const cfg = (agent.googleAdsConfig || {}) as any
    return {
        operatingCustomerId: String(cfg.scope?.operatingCustomerId || cfg.customerId || '').replace(/\D/g, ''),
        loginCustomerId: String(cfg.loginCustomerId || cfg.customerId || '').replace(/\D/g, ''),
        devToken: String(cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''),
        campaignIds: (cfg.scope?.campaignIds || []).map((x: any) => String(x).replace(/\D/g, '')).filter(Boolean) as string[],
    }
}

export async function runObjectiveTransitionSweep(): Promise<{ scanned: number; proposed: number; blockedByConv: number; skipped: number; errors: number }> {
    const stats = { scanned: 0, proposed: 0, blockedByConv: 0, skipped: 0, errors: 0 }
    let rows: MatehAgentRow[] = []
    try {
        rows = await db.select().from(matehAgents).where(isNotNull(matehAgents.researchData)) as MatehAgentRow[]
    } catch (err) { console.error('[objectiveTransition] list error:', (err as Error).message); return stats }

    for (const agent of rows) {
        if (agent.status !== 'running') continue
        const rd = (agent.researchData || {}) as any
        const objective = rd.biddingObjective as BiddingObjective | undefined
        if (!objective?.goal || objective.goal === 'max_sales') continue
        const { operatingCustomerId, loginCustomerId, devToken, campaignIds } = adsConfigOf(agent)
        if (!operatingCustomerId || !devToken || campaignIds.length === 0) continue
        const tokens = (agent.googleTokens || {}) as any
        const refreshToken: string | undefined = tokens.refreshToken || tokens.refresh_token
        if (!refreshToken) continue

        stats.scanned++
        try {
            const at = await refresh(refreshToken)
            if (!at) { stats.errors++; continue }
            const objT = getTransitionForObjective(objective)
            const campaigns = await fetchScopedCampaigns(at, devToken, operatingCustomerId, loginCustomerId, campaignIds)
            const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0)
            if (totalConv < objT.triggerConvCount) { stats.blockedByConv++; continue }

            const targetStrategy = objective.goal === 'target_roas' ? 'TARGET_ROAS' : 'TARGET_CPA'
            for (const c of campaigns) {
                // Skip standard campaigns already on the target strategy (idempotent).
                if (c.channelType !== 'PERFORMANCE_MAX' && c.biddingType === targetStrategy) { stats.skipped++; continue }
                // Skip if an open proposal already exists for this campaign.
                if (await hasOpenProposal(agent.id, c.id)) { stats.skipped++; continue }

                const proposalId = 'oit_' + nanoid(8)
                const targetHe = objective.goal === 'target_roas'
                    ? `יעד ROAS ${objective.targetRoasPct || 400}%`
                    : `יעד CPA ₪${objective.targetCpaIls}`
                const contentHe = [
                    `הקמפיין "${c.name}" (${c.channelType}) צבר ${Math.round(totalConv)} המרות ב-30 ימים — מספיק כדי לעבור להצעות-מחיר לפי המטרה שבחרתם.`,
                    ``,
                    `מעבר מוצע: ${c.biddingType || 'אסטרטגיה נוכחית'} → ${targetHe}.`,
                    `ודאו שמדידת ההמרות נקייה (לאחר בידוד ההמרות של עסקים אחרים) לפני אישור.`,
                    ``,
                    `אם תאשרו, נחיל את היעד אוטומטית על הקמפיין.`,
                ].join('\n')
                await db.insert(agentOutputs).values({
                    id: proposalId,
                    instanceId: agent.vpsInstanceId,
                    agentId: agent.id,
                    agentRole: 'mazhir',
                    outputType: 'imported_objective_transition',
                    platform: 'google_ads',
                    status: 'pending_review',
                    title: `מעבר ל${targetHe} — קמפיין "${c.name}"`,
                    content: contentHe,
                    metadata: {
                        kind: 'imported_objective_transition',
                        operatingCustomerId, loginCustomerId,
                        campaignId: c.id, campaignName: c.name, channelType: c.channelType,
                        goal: objective.goal,
                        targetRoas: objT.targetRoas, targetCpaIls: objT.targetCpaIls ?? objective.targetCpaIls,
                        conversionsLast30d: totalConv, triggerThreshold: objT.triggerConvCount,
                    } as never,
                    createdAt: new Date(),
                } as never).onConflictDoNothing()
                stats.proposed++
                try {
                    const { sendApprovalQueueMessage } = await import('./approvalQueueTelegram')
                    await sendApprovalQueueMessage(proposalId)
                } catch (err) { console.warn('[objectiveTransition] telegram failed:', (err as Error).message) }
            }
        } catch (err) {
            stats.errors++
            console.error(`[objectiveTransition] ${agent.id} error:`, (err as Error).message)
        }
    }
    console.log(`[objectiveTransition] ${JSON.stringify(stats)}`)
    return stats
}

async function hasOpenProposal(agentId: string, campaignId: string): Promise<boolean> {
    const rows = await db.select({ id: agentOutputs.id, metadata: agentOutputs.metadata }).from(agentOutputs).where(and(
        eq(agentOutputs.outputType, 'imported_objective_transition'),
        eq(agentOutputs.status, 'pending_review'),
        eq(agentOutputs.agentId, agentId),
    ))
    return rows.some(r => (r.metadata as any)?.campaignId === campaignId)
}

/** Applied when an `imported_objective_transition` task is approved. */
export async function applyImportedObjectiveTransition(output: typeof agentOutputs.$inferSelect): Promise<{ ok: boolean; reason?: string }> {
    const meta = (output.metadata || {}) as any
    const { operatingCustomerId, loginCustomerId, campaignId, channelType, goal, targetRoas, targetCpaIls } = meta
    if (!operatingCustomerId || !campaignId || !goal) return { ok: false, reason: 'incomplete_metadata' }

    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
    const agent = output.agentId ? await resolveAgentById(output.instanceId, output.agentId) : await resolvePrimaryAgent(output.instanceId)
    if (!agent) return { ok: false, reason: 'agent_not_found' }
    const tokens = (agent.googleTokens || {}) as any
    const devToken = String((agent.googleAdsConfig as any)?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '')
    const at = await refresh(tokens.refreshToken || tokens.refresh_token)
    if (!at) return { ok: false, reason: 'oauth_refresh_failed' }

    const r = await applyObjectiveToCampaign({
        at, devToken,
        operatingCustomerId: String(operatingCustomerId).replace(/\D/g, ''),
        loginCustomerId: String(loginCustomerId || '').replace(/\D/g, ''),
        campaignId: String(campaignId), channelType: String(channelType || ''),
        goal: goal === 'target_cpa' ? 'target_cpa' : 'target_roas',
        targetRoas, targetCpaIls,
    })
    if (!r.ok) return r

    // Record what we applied, for transparency (per-agent, safe write).
    try {
        await mutateResearchData(agent, output.instanceId, (rd: any) => {
            const c = rd || {}
            const applied = c.objectiveApplied || {}
            applied[String(campaignId)] = { goal, targetRoas, targetCpaIls, appliedAt: new Date().toISOString() }
            c.objectiveApplied = applied
            return c
        })
    } catch { /* non-fatal */ }
    return { ok: true }
}

let started = false
export function startObjectiveTransitionRunner(): void {
    if (started) return
    started = true
    console.log('[objectiveTransition] starting (daily; first run in 6.5h after boot)')
    setTimeout(() => { runObjectiveTransitionSweep().catch(() => { /* logged inside */ }) }, 6.5 * 60 * 60 * 1000)
    setInterval(() => { runObjectiveTransitionSweep().catch(() => { /* logged inside */ }) }, 24 * 60 * 60 * 1000)
}