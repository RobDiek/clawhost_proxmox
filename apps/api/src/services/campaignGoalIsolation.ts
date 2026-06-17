/**
 * Campaign Goal Isolation — systemic prevention of cross-brand conversion
 * contamination on shared MCC operating accounts.
 *
 * Problem (Packing Station, 2026-06): when one Google Ads operating account
 * hosts >1 brand, account-level (CUSTOMER) conversion goals mean EVERY brand's
 * primary purchase/lead actions feed EVERY campaign's smart bidding. A sibling
 * brand's conversions silently steer this tenant's budget.
 *
 * Fix primitive: build/reuse a CustomConversionGoal containing only THIS
 * tenant's own conversion actions (everything that is primary+in-conversions
 * and NOT classified as a sibling brand), and switch the tenant's campaigns to
 * goalConfigLevel=CAMPAIGN with that goal. Idempotent: campaigns already on
 * CAMPAIGN level are left untouched.
 *
 * Policy (hybrid, per Sergei 2026-06): auto-apply only when the risk is
 * UNAMBIGUOUS — sibling primary actions present, campaigns still on CUSTOMER
 * level, and no ambiguous-affinity ('none') actions that might be the tenant's
 * own. Otherwise raise a `conversion_isolation_proposal` approval task (applied
 * on approve via triggerPostApprove). Never silently drops a possibly-own
 * action: the isolated goal = all primary+inConv actions EXCEPT confirmed
 * siblings.
 */

import { nanoid } from 'nanoid'
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import telegram from '@/services/telegram'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ADS_API = 'https://googleads.googleapis.com/v22'
const GOAL_NAME_PREFIX = 'Flowmatic isolated — '

export interface IsolationDecision {
    status: 'applied' | 'proposed' | 'noop' | 'skipped' | 'error' | 'resynced'
    reason: string
    siblingNames: string[]
    isolatedActionCount?: number
    campaignsIsolated?: string[]
    customGoalResource?: string
    resyncedGoals?: string[]   // goals whose action membership we corrected
    taskId?: string
}

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

async function adsSearch(at: string, devToken: string, customerId: string, loginCustomerId: string, query: string): Promise<any[]> {
    const r = await fetch(`${ADS_API}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'developer-token': devToken, 'login-customer-id': loginCustomerId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000),
    })
    const data = await r.json() as any
    if (!r.ok) throw new Error(data?.error?.message || `Ads search ${r.status}`)
    const out: any[] = []
    if (Array.isArray(data)) for (const b of data) if (b.results) out.push(...b.results)
    return out
}

// Surface the SPECIFIC Google Ads failure (errorCode + field path), not just the
// generic top-level "Request contains an invalid argument." message — the detail
// lives in error.details[].errors[] and is essential for diagnosing which op/field
// the API rejected (e.g. PMax campaigns refusing campaign-level custom goals).
function extractAdsError(data: any, status: number, label: string): string {
    const top = data?.error?.message
    const det = data?.error?.details?.[0]?.errors?.[0]
    if (det) {
        const code = det.errorCode ? Object.entries(det.errorCode).map(([k, v]) => `${k}=${v}`).join(',') : ''
        const field = det.location?.fieldPathElements?.map((f: any) => f.fieldName).join('.') || ''
        return `${det.message || top}${code ? ` [${code}]` : ''}${field ? ` @${field}` : ''}`
    }
    return top || `Ads ${label} ${status}: ${JSON.stringify(data).slice(0, 300)}`
}

async function adsMutate(at: string, devToken: string, customerId: string, loginCustomerId: string, path: string, body: any): Promise<any> {
    const r = await fetch(`${ADS_API}/customers/${customerId}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'developer-token': devToken, 'login-customer-id': loginCustomerId, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    })
    const data = await r.json() as any
    if (!r.ok) throw new Error(extractAdsError(data, r.status, 'mutate'))
    return data
}

interface Analysis {
    ok: boolean
    reason: string
    operatingCustomerId: string
    loginCustomerId: string
    devToken: string
    accountMode: boolean
    siblingNames: string[]
    isolatedActionResources: string[]   // this + none, primary+inConv (never siblings)
    scopedCampaignIds: string[]          // all of this tenant's scoped campaigns
    hasAmbiguous: boolean                // any 'none'-affinity primary+inConv action
    campaignsNeedingIsolation: string[]  // scoped campaigns still on CUSTOMER level
}

/**
 * Read-only contamination analysis. Reuses the brand-affinity classifier in
 * detectExistingConversionActions, then checks per-campaign goal levels.
 */
async function analyze(agent: MatehAgentRow, at: string): Promise<Analysis> {
    const cfg = (agent.googleAdsConfig || {}) as any
    const operatingCustomerId = String(cfg.scope?.operatingCustomerId || cfg.customerId || '').replace(/\D/g, '')
    const loginCustomerId = String(cfg.loginCustomerId || cfg.customerId || '').replace(/\D/g, '')
    const devToken = String(cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '')
    const campaignIds: string[] = (cfg.scope?.campaignIds || []).map((x: any) => String(x).replace(/\D/g, '')).filter(Boolean)
    const accountMode = cfg.scope?.mode === 'account' || campaignIds.length === 0

    const base: Analysis = {
        ok: false, reason: 'unknown', operatingCustomerId, loginCustomerId, devToken,
        accountMode, siblingNames: [], isolatedActionResources: [], scopedCampaignIds: campaignIds, hasAmbiguous: false,
        campaignsNeedingIsolation: [],
    }
    if (!operatingCustomerId || !devToken) return { ...base, reason: 'incomplete_ads_config' }

    const { detectExistingConversionActions } = await import('./mazhirConversionsDetect')
    const det: any = await detectExistingConversionActions(agent.vpsInstanceId, agent.id)
    if (det?.error || !Array.isArray(det?.candidates)) return { ...base, reason: `detect_failed:${det?.error || 'no_candidates'}` }

    const primaryInConv = det.candidates.filter((c: any) => c.primaryForGoal && c.includeInConversionsMetric)
    const siblings = primaryInConv.filter((c: any) => c.brandAffinity === 'sibling')
    const isolated = primaryInConv.filter((c: any) => c.brandAffinity !== 'sibling')   // this + none
    const ambiguous = primaryInConv.filter((c: any) => c.brandAffinity === 'none')

    base.siblingNames = siblings.map((c: any) => c.name)
    base.isolatedActionResources = isolated.map((c: any) => c.adsResourceName).filter(Boolean)
    base.hasAmbiguous = ambiguous.length > 0

    if (siblings.length === 0) return { ...base, ok: true, reason: 'no_contamination' }
    if (accountMode) return { ...base, ok: true, reason: 'account_mode' }

    // Which scoped campaigns still inherit account-level (CUSTOMER) goals?
    try {
        const rows = await adsSearch(at, devToken, operatingCustomerId, loginCustomerId,
            `SELECT campaign.id, conversion_goal_campaign_config.goal_config_level FROM conversion_goal_campaign_config WHERE campaign.id IN (${campaignIds.join(',')})`)
        base.campaignsNeedingIsolation = rows
            .filter(r => r.conversionGoalCampaignConfig?.goalConfigLevel === 'CUSTOMER')
            .map(r => String(r.campaign?.id))
    } catch (err) {
        return { ...base, reason: `goal_level_query_failed:${(err as Error).message}` }
    }
    base.ok = true
    base.reason = base.campaignsNeedingIsolation.length ? 'contaminated' : 'already_isolated'
    return base
}

/**
 * Write: create/reuse the isolated custom goal and switch the given campaigns
 * to CAMPAIGN-level pointing at it. Returns { customGoalResource, isolated }.
 */
async function applyIsolation(
    at: string, a: Pick<Analysis, 'operatingCustomerId' | 'loginCustomerId' | 'devToken'>,
    brandName: string, isolatedActionResources: string[], campaignIds: string[],
): Promise<{ customGoalResource: string; isolated: string[] }> {
    const { operatingCustomerId: cust, loginCustomerId: login, devToken } = a
    const goalName = `${GOAL_NAME_PREFIX}${brandName}`.slice(0, 80)

    // Find existing goal by our naming convention → reuse/update; else create.
    const existing = await adsSearch(at, devToken, cust, login,
        `SELECT custom_conversion_goal.resource_name, custom_conversion_goal.name, custom_conversion_goal.conversion_actions FROM custom_conversion_goal`)
    const match = existing.find(r => r.customConversionGoal?.name === goalName)

    let goalResource: string
    if (match) {
        goalResource = match.customConversionGoal.resourceName
        const current: string[] = match.customConversionGoal.conversionActions || []
        const desired = [...isolatedActionResources].sort()
        if (JSON.stringify([...current].sort()) !== JSON.stringify(desired)) {
            await adsMutate(at, devToken, cust, login, 'customConversionGoals:mutate', {
                operations: [{ update: { resourceName: goalResource, conversionActions: isolatedActionResources }, updateMask: 'conversionActions' }],
            })
        }
    } else {
        const res = await adsMutate(at, devToken, cust, login, 'customConversionGoals:mutate', {
            operations: [{ create: { name: goalName, conversionActions: isolatedActionResources } }],
        })
        goalResource = res.results[0].resourceName
    }

    // Switch campaigns to CAMPAIGN-level with this goal.
    const ops = campaignIds.map(cid => ({
        update: {
            resourceName: `customers/${cust}/conversionGoalCampaignConfigs/${cid}`,
            goalConfigLevel: 'CAMPAIGN',
            customConversionGoal: goalResource,
        },
        updateMask: 'goalConfigLevel,customConversionGoal',
    }))
    await adsMutate(at, devToken, cust, login, 'conversionGoalCampaignConfigs:mutate', { operations: ops })
    return { customGoalResource: goalResource, isolated: campaignIds }
}

/**
 * Re-sync the conversion-action membership of the custom goal(s) the tenant's
 * already-isolated campaigns currently point at, to the CURRENT desired set
 * (primary + in-conversions, non-sibling). Without this, a purchase action
 * promoted/added AFTER the initial isolation (e.g. the offline store-orders
 * bridge becoming primary) never enters the goal, so smart bidding keeps
 * optimizing on a stale/lossy action. Targets the goal the campaigns ACTUALLY
 * use (read from conversion_goal_campaign_config) — robust to goal naming.
 */
async function resyncIsolatedGoals(at: string, an: Analysis): Promise<string[]> {
    const { operatingCustomerId: cust, loginCustomerId: login, devToken } = an
    if (an.isolatedActionResources.length === 0 || an.scopedCampaignIds.length === 0) return []
    const rows = await adsSearch(at, devToken, cust, login,
        `SELECT campaign.id, conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config WHERE campaign.id IN (${an.scopedCampaignIds.join(',')})`)
    const goalResources = Array.from(new Set(rows
        .filter(r => r.conversionGoalCampaignConfig?.goalConfigLevel === 'CAMPAIGN' && r.conversionGoalCampaignConfig?.customConversionGoal)
        .map(r => String(r.conversionGoalCampaignConfig.customConversionGoal))))
    const desired = [...an.isolatedActionResources].sort()
    const updated: string[] = []
    for (const goalRes of goalResources) {
        const g = await adsSearch(at, devToken, cust, login,
            `SELECT custom_conversion_goal.resource_name, custom_conversion_goal.conversion_actions FROM custom_conversion_goal WHERE custom_conversion_goal.resource_name = '${goalRes}'`)
        const current: string[] = (g[0]?.customConversionGoal?.conversionActions || []).map(String)
        if (JSON.stringify([...current].sort()) === JSON.stringify(desired)) continue   // already correct
        await adsMutate(at, devToken, cust, login, 'customConversionGoals:mutate', {
            operations: [{ update: { resourceName: goalRes, conversionActions: an.isolatedActionResources }, updateMask: 'conversionActions' }],
        })
        updated.push(goalRes)
    }
    return updated
}

async function createProposalTask(agent: MatehAgentRow, an: Analysis): Promise<string> {
    const taskId = nanoid(12)
    const names = an.siblingNames.map(n => `«${n}»`).join(', ')
    const he = `זוהו פעולות המרה של עסק אחר (${names}) המשפיעות על אופטימיזציית הקמפיינים שלכם בחשבון משותף. ` +
        `מומלץ לבודד את מטרות ההמרה ברמת הקמפיין כך שרק ההמרות שלכם ינחו את המכרז. ` +
        `אישור יחיל את הבידוד אוטומטית (פעולה הפיכה).`
    await db.insert(agentOutputs).values({
        id: taskId,
        instanceId: agent.vpsInstanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'conversion_isolation_proposal',
        status: 'pending_review',
        title: 'בידוד מטרות המרה מקמפיינים של עסק אחר',
        content: he,
        metadata: {
            kind: 'conversion_isolation_proposal',
            operatingCustomerId: an.operatingCustomerId,
            loginCustomerId: an.loginCustomerId,
            campaignIds: an.campaignsNeedingIsolation,
            isolatedActionResources: an.isolatedActionResources,
            siblingNames: an.siblingNames,
        } as never,
        createdAt: new Date(),
    } as never).onConflictDoNothing()
    return taskId
}

/**
 * Orchestrator (hybrid policy). Call from setup-success and from the T+24h
 * audit. Auto-applies on unambiguous risk; otherwise raises an approval task.
 */
export async function ensureCampaignGoalIsolation(agent: MatehAgentRow, opts: { source: string }): Promise<IsolationDecision> {
    const tokens = (agent.googleTokens || {}) as any
    const refreshToken: string | undefined = tokens.refreshToken || tokens.refresh_token
    if (!refreshToken) return { status: 'skipped', reason: 'no_oauth', siblingNames: [] }
    const at = await refresh(refreshToken)
    if (!at) return { status: 'skipped', reason: 'oauth_refresh_failed', siblingNames: [] }

    let an: Analysis
    try { an = await analyze(agent, at) }
    catch (err) { return { status: 'error', reason: (err as Error).message, siblingNames: [] } }

    if (!an.ok) return { status: 'skipped', reason: an.reason, siblingNames: an.siblingNames }
    if (an.reason === 'no_contamination') {
        return { status: 'noop', reason: an.reason, siblingNames: an.siblingNames }
    }
    if (an.reason === 'already_isolated') {
        // Campaigns are isolated, but the goal's action membership can drift when a
        // conversion action is promoted/added later. Re-sync it to the current
        // primary set (the only safe mutation here — no campaign re-pointing).
        try {
            const resynced = await resyncIsolatedGoals(at, an)
            if (resynced.length) {
                await notify(agent, `✅ *מטרת ההמרה עודכנה* (${agent.name})\nהקמפיינים שלכם מותאמים כעת לפעולת הרכישה המדויקת והעדכנית בלבד.`)
                return { status: 'resynced', reason: 'goal_membership_resynced', siblingNames: an.siblingNames, isolatedActionCount: an.isolatedActionResources.length, resyncedGoals: resynced }
            }
            return { status: 'noop', reason: 'already_isolated', siblingNames: an.siblingNames }
        } catch (err) {
            return { status: 'noop', reason: `resync_failed:${(err as Error).message}`, siblingNames: an.siblingNames }
        }
    }
    if (an.isolatedActionResources.length === 0) {
        // Contaminated but we can't identify the tenant's own actions → ask a human.
        const taskId = await createProposalTask(agent, an)
        return { status: 'proposed', reason: 'no_own_actions_identified', siblingNames: an.siblingNames, taskId }
    }

    // Ambiguous → propose. Unambiguous → auto-apply.
    if (an.accountMode || an.hasAmbiguous) {
        const taskId = await createProposalTask(agent, an)
        await notify(agent, `🟠 *בידוד מטרות המרה — דרוש אישור* (${agent.name})\nזוהו פעולות של עסק אחר; פתחו את המשימה לאישור הבידוד.`)
        return { status: 'proposed', reason: an.accountMode ? 'account_mode_needs_review' : 'ambiguous_actions', siblingNames: an.siblingNames, taskId }
    }

    try {
        const res = await applyIsolation(at, an, agent.name || 'agent', an.isolatedActionResources, an.campaignsNeedingIsolation)
        console.log(`[goalIsolation] ${agent.id} auto-applied (src=${opts.source}):`, JSON.stringify(res))
        await notify(agent, `✅ *בידוד מטרות המרה הוחל* (${agent.name})\nהקמפיינים שלכם מותאמים כעת רק להמרות שלכם — הוסרה השפעת עסק אחר באותו חשבון.`)
        return { status: 'applied', reason: 'auto_isolated', siblingNames: an.siblingNames, isolatedActionCount: an.isolatedActionResources.length, campaignsIsolated: res.isolated, customGoalResource: res.customGoalResource }
    } catch (err) {
        // Write failed → fall back to an approval task so it's not lost.
        const taskId = await createProposalTask(agent, an)
        return { status: 'proposed', reason: `auto_apply_failed:${(err as Error).message}`, siblingNames: an.siblingNames, taskId }
    }
}

/**
 * Applied when a `conversion_isolation_proposal` task is approved
 * (triggerPostApprove). Resolves the agent, refreshes, and isolates.
 */
export async function applyIsolationFromTask(output: typeof agentOutputs.$inferSelect): Promise<{ ok: boolean; reason: string; result?: any }> {
    const meta = (output.metadata || {}) as any
    const campaignIds: string[] = (meta.campaignIds || []).map((x: any) => String(x).replace(/\D/g, '')).filter(Boolean)
    const isolatedActionResources: string[] = meta.isolatedActionResources || []
    if (!campaignIds.length || !isolatedActionResources.length) return { ok: false, reason: 'incomplete_metadata' }

    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const agent = output.agentId
        ? await resolveAgentById(output.instanceId, output.agentId)
        : await resolvePrimaryAgent(output.instanceId)
    if (!agent) return { ok: false, reason: 'agent_not_found' }

    const tokens = (agent.googleTokens || {}) as any
    const at = await refresh(tokens.refreshToken || tokens.refresh_token)
    if (!at) return { ok: false, reason: 'oauth_refresh_failed' }

    try {
        const result = await applyIsolation(at, {
            operatingCustomerId: String(meta.operatingCustomerId || '').replace(/\D/g, ''),
            loginCustomerId: String(meta.loginCustomerId || '').replace(/\D/g, ''),
            devToken: String((agent.googleAdsConfig as any)?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''),
        }, agent.name || 'agent', isolatedActionResources, campaignIds)
        return { ok: true, reason: 'applied', result }
    } catch (err) {
        return { ok: false, reason: (err as Error).message }
    }
}

async function notify(agent: MatehAgentRow, msg: string): Promise<void> {
    try {
        const chatId = (agent as any).telegramChatId
        if (chatId) await telegram.sendMessage(String(chatId), msg)
        else await telegram.alertAdmin(msg)
    } catch { /* non-fatal */ }
}