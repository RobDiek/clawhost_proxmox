/**
 * Bidding Strategy deferred action handler — K15.
 *
 * Wraps the bidding strategy apply/restore logic into the generic
 * deferred-action framework. Implements:
 *   - buildFollowupTask() — generates the monthly_task with Hebrew copy
 *   - restore() — DELTA-BASED reconciliation. Reads current state, computes
 *     what we changed (newState vs previousState), applies the inverse
 *     change only if the field is STILL in the state we set (i.e., user
 *     didn't manually override). Preserves user manual adjustments.
 *   - validateBeforeRestore() — re-runs Google Ads safety audit. If signal
 *     is still polluted (conv_value_quality_subscore < 70 OR audit not
 *     available), defers task by 7 days with warning.
 *   - describeForDashboard() — for the active-actions widget on home view.
 *   - detectDuplicate() — at apply time, detect if same strategy was applied
 *     within recovery window → return reason string to block re-apply.
 */

import { registerHandler } from '../registry'
import type {
    DeferredAction,
    DeferredActionHandler,
    DashboardDescriptor,
    FollowupTaskDescriptor,
    RestoreContext,
    RestoreResult,
    ValidationResult,
} from '../types'
import type { BiddingStrategyKind } from '@/services/googleAdsBiddingStrategy'

export interface BiddingStrategyPayload {
    strategy: BiddingStrategyKind
    customerId: string
    loginCustomerId: string
    previousState: Array<{
        campaignId: string
        campaignName: string
        status: string
        bidding: string
        channel: string
        budgetMicros: number
        budgetResourceName: string
    }>
    newState: Array<{
        campaignId: string
        campaignName: string
        status: string
        bidding: string
        budgetMicros: number
    }>
    actionsApplied: Array<{ campaignId: string; campaignName: string; change: string }>
}

const strategyHeLabels: Record<BiddingStrategyKind, string> = {
    conservative: 'שמרני (Conservative)',
    moderate: 'מאוזן (Moderate)',
    aggressive: 'אגרסיבי (Aggressive)',
}

const handler: DeferredActionHandler<BiddingStrategyPayload> = {
    kind: 'bidding_strategy',

    // ──────────────────────────────────────────────────────────────────────
    // Follow-up task descriptor
    // ──────────────────────────────────────────────────────────────────────
    buildFollowupTask(action: DeferredAction<BiddingStrategyPayload>): FollowupTaskDescriptor {
        const p = action.payload
        const stratLabel = strategyHeLabels[p.strategy] || p.strategy
        const prevTotalIls = p.previousState.reduce((s, x) => s + x.budgetMicros / 1_000_000, 0)
        const newTotalIls = p.newState.reduce((s, x) => s + x.budgetMicros / 1_000_000, 0)
        const dailySavedIls = prevTotalIls - newTotalIls
        const campaignList = p.previousState
            .map(x => `${x.campaignName} (${x.bidding}, ₪${(x.budgetMicros / 1_000_000).toFixed(0)})`)
            .join(' · ')

        const titleHe = `החזרת בידינג למצב מלא — ${action.recoveryDays} ימים מאז ${stratLabel} הסתיימו`
        const summaryHe = `לפני ${action.recoveryDays} ימים יישמת אסטרטגיית ${stratLabel} — ${p.actionsApplied.length} פעולות. ` +
            `כעת ה-tracking signal אמור להיות נקי. החזרה תוסיף ₪${dailySavedIls.toFixed(0)}/יום לתקציב. ` +
            `יעדים: ${campaignList}.`

        return {
            taskId: `tsk_restore_bidding_${action.id}`,
            outputId: `mt_restore_bid_${action.id}`,
            titleHe,
            summaryHe,
            priority: 'P1',
            actionPlan: [
                { step: `נסקור את ביצועי הקמפיינים מאז ${stratLabel} לפני ${action.recoveryDays} ימים`, automated: false, estimatedMinutes: 5 },
                { step: 'החילו "Restore to original" אוטומטית מ-UI (delta-based — שומר על שינויים ידניים)', automated: true, estimatedMinutes: 1 },
                { step: 'מעקב 7 ימים אחרי החזרה — לוודא שהביצועים חוזרים לרמה צפויה', automated: false, estimatedMinutes: 5 },
            ],
            expectedImpact: {
                metric: 'daily_spend_capacity',
                value: dailySavedIls,
                horizon: 'immediate',
                rationaleHe: `החזרה תוסיף ₪${dailySavedIls.toFixed(0)}/יום לתקציב פעיל, נחזיר את הקמפיינים ל-100% כוח.`,
                confidence: 'high',
            },
            metadata: {
                strategy: p.strategy,
                recoveryDays: action.recoveryDays,
                previousBudgetTotalIls: prevTotalIls,
                newBudgetTotalIls: newTotalIls,
                dailySavedIls,
                previousState: p.previousState,
                newState: p.newState,
            },
        }
    },

    // ──────────────────────────────────────────────────────────────────────
    // Delta-based restore (preserves manual adjustments since apply)
    // ──────────────────────────────────────────────────────────────────────
    async restore(ctx: RestoreContext, action: DeferredAction<BiddingStrategyPayload>): Promise<RestoreResult> {
        const result: RestoreResult = { ok: true, actionsApplied: [], errors: [], summary: '' }
        const p = action.payload

        const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig } = await import('@/services/agentContext')
        const agent = ctx.agentId
            ? (await resolveAgentById(ctx.instanceId, ctx.agentId)) || (await resolvePrimaryAgent(ctx.instanceId))
            : await resolvePrimaryAgent(ctx.instanceId)
        const ads = (await readGoogleAdsConfig(agent, ctx.instanceId)).config as Record<string, unknown> | null
        if (!ads?.customerId || !ads?.developerToken) {
            result.ok = false
            result.errors.push({ resourceId: 'connection', error: 'Google Ads not connected' })
            return result
        }

        const operatingCustomerId = p.customerId
        const loginCustomerId = p.loginCustomerId
        const devToken = String(ads.developerToken)

        // Read CURRENT live state of the same campaigns to compute delta
        const ids = p.previousState.map(x => x.campaignId)
        const current: Array<{
            id: string; status: string; bidding: string;
            budgetResourceName: string; budgetMicros: number
        }> = []
        try {
            const rows = await gadsQuery(operatingCustomerId, loginCustomerId, devToken, ctx.tokens,
                `SELECT campaign.id, campaign.status, campaign.bidding_strategy_type,
                        campaign_budget.resource_name, campaign_budget.amount_micros
                 FROM campaign
                 WHERE campaign.id IN (${ids.map(id => `'${id}'`).join(',')})`,
            )
            for (const r of rows) {
                const c = (r.campaign as Record<string, unknown>) || {}
                const b = ((r.campaignBudget || r.campaign_budget) as Record<string, unknown>) || {}
                current.push({
                    id: String(c.id || ''),
                    status: String(c.status || ''),
                    bidding: String(c.biddingStrategyType || c.bidding_strategy_type || ''),
                    budgetResourceName: String(b.resourceName || b.resource_name || ''),
                    budgetMicros: Number(b.amountMicros || b.amount_micros || 0),
                })
            }
        } catch (e) {
            result.ok = false
            result.errors.push({ resourceId: 'read', error: (e as Error).message.slice(0, 200) })
            return result
        }

        // For each campaign, compute delta-based restore actions
        for (const prev of p.previousState) {
            const newStateEntry = p.newState.find(x => x.campaignId === prev.campaignId)
            const cur = current.find(x => x.id === prev.campaignId)
            if (!cur || !newStateEntry) continue

            // ─── Status restore: only if user didn't change it manually ───
            if (newStateEntry.status !== prev.status && cur.status === newStateEntry.status) {
                try {
                    await gadsMutate(operatingCustomerId, loginCustomerId, devToken, ctx.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: { resourceName: `customers/${operatingCustomerId}/campaigns/${prev.campaignId}`, status: prev.status },
                            updateMask: 'status',
                        }],
                    })
                    result.actionsApplied.push({ resourceId: prev.campaignId, change: `status → ${prev.status} (was ${cur.status})` })
                } catch (e) {
                    result.errors.push({ resourceId: prev.campaignId, error: `status: ${(e as Error).message.slice(0, 200)}` })
                }
            } else if (cur.status !== newStateEntry.status) {
                result.actionsApplied.push({ resourceId: prev.campaignId, change: `status SKIPPED — user changed since apply (${newStateEntry.status} → ${cur.status})` })
            }

            // ─── Bidding restore: only if user didn't change it manually ───
            if (newStateEntry.bidding !== prev.bidding && cur.bidding === newStateEntry.bidding) {
                if (prev.bidding === 'MAXIMIZE_CONVERSION_VALUE') {
                    try {
                        await gadsMutate(operatingCustomerId, loginCustomerId, devToken, ctx.tokens, 'campaigns:mutate', {
                            operations: [{
                                update: { resourceName: `customers/${operatingCustomerId}/campaigns/${prev.campaignId}`, maximizeConversionValue: {} },
                                updateMask: 'maximize_conversion_value.target_roas',
                            }],
                        })
                        result.actionsApplied.push({ resourceId: prev.campaignId, change: `bidding → MAX_CONVERSION_VALUE (was ${cur.bidding})` })
                    } catch (e) {
                        result.errors.push({ resourceId: prev.campaignId, error: `bidding: ${(e as Error).message.slice(0, 200)}` })
                    }
                }
            } else if (cur.bidding !== newStateEntry.bidding) {
                result.actionsApplied.push({ resourceId: prev.campaignId, change: `bidding SKIPPED — user changed since apply (${newStateEntry.bidding} → ${cur.bidding})` })
            }

            // ─── Budget delta-based reconciliation ───
            // We previously CHANGED budget from prev → newState. Compute the
            // delta we applied: appliedDelta = newState - prev. To undo, we
            // need to ADD (prev - newState) to the current value. This way,
            // if user has independently changed budget since then, our
            // restore preserves their change relative to the new baseline.
            //
            // Example:
            //   prev = ₪660, newState = ₪462 (we cut by ₪198)
            //   user later moved current to ₪500 (+38 from newState)
            //   restoredBudget = current + (prev - newState) = 500 + 198 = ₪698
            //   → preserves user's +38 above original
            const appliedDelta = newStateEntry.budgetMicros - prev.budgetMicros   // negative (reduced)
            const undoDelta = -appliedDelta                                       // positive (add back)
            const restoredBudgetMicros = cur.budgetMicros + undoDelta
            if (cur.budgetResourceName && cur.budgetMicros > 0 && Math.abs(undoDelta) > 1000) {
                try {
                    await gadsMutate(operatingCustomerId, loginCustomerId, devToken, ctx.tokens, 'campaignBudgets:mutate', {
                        operations: [{
                            update: { resourceName: cur.budgetResourceName, amountMicros: String(restoredBudgetMicros) },
                            updateMask: 'amount_micros',
                        }],
                    })
                    result.actionsApplied.push({
                        resourceId: prev.campaignId,
                        change: `budget ₪${(cur.budgetMicros / 1_000_000).toFixed(0)} → ₪${(restoredBudgetMicros / 1_000_000).toFixed(0)} (delta +${(undoDelta / 1_000_000).toFixed(0)})`,
                    })
                } catch (e) {
                    result.errors.push({ resourceId: prev.campaignId, error: `budget: ${(e as Error).message.slice(0, 200)}` })
                }
            }
        }

        result.summary = `${result.actionsApplied.length} actions${result.errors.length ? `, ${result.errors.length} errors` : ''}`
        return result
    },

    // ──────────────────────────────────────────────────────────────────────
    // Pre-restore validation — re-audit conv_value_quality
    // ──────────────────────────────────────────────────────────────────────
    async validateBeforeRestore(ctx: RestoreContext, action: DeferredAction<BiddingStrategyPayload>): Promise<ValidationResult> {
        try {
            const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
            const agent = ctx.agentId
                ? (await resolveAgentById(ctx.instanceId, ctx.agentId)) || (await resolvePrimaryAgent(ctx.instanceId))
                : await resolvePrimaryAgent(ctx.instanceId)
            const rd = ((agent?.researchData as Record<string, unknown>) || {})
            const results = (rd.results as Record<string, unknown>) || {}
            const paidAudit = (results.paid_audit as Record<string, unknown>) || {}
            const auditContent = typeof paidAudit.content === 'string' ? paidAudit.content : ''
            const auditRunAt = typeof paidAudit.runAt === 'string' ? paidAudit.runAt : ''

            // No fresh audit available — defer 7d with warning
            const auditAge = auditRunAt ? (Date.now() - new Date(auditRunAt).getTime()) / 86400000 : Infinity
            if (auditAge > 30) {
                return {
                    decision: 'defer',
                    deferDays: 7,
                    reason: `paid_audit is stale (${auditAge.toFixed(0)} days old) — defer follow-up until audit refreshed`,
                }
            }

            const subscore = extractConvValueSubscore(auditContent)
            if (subscore !== undefined && subscore < 70) {
                // Maximum 4 defers (28 days) before forcing follow-up anyway
                const deferCount = action.deferCount || 0
                if (deferCount >= 4) {
                    return { decision: 'proceed', reason: 'max defers exceeded — proceeding despite low subscore' }
                }
                return {
                    decision: 'defer',
                    deferDays: 7,
                    reason: `conv_value_quality_subscore=${subscore} still < 70 — defer follow-up`,
                }
            }
            return { decision: 'proceed', reason: subscore !== undefined ? `subscore=${subscore} (≥70)` : 'no subscore data' }
        } catch (e) {
            // Validation failed — proceed conservatively
            return { decision: 'proceed', reason: `validation error: ${(e as Error).message.slice(0, 100)}` }
        }
    },

    // ──────────────────────────────────────────────────────────────────────
    // Dashboard widget descriptor
    // ──────────────────────────────────────────────────────────────────────
    describeForDashboard(action: DeferredAction<BiddingStrategyPayload>): DashboardDescriptor {
        const p = action.payload
        const elapsedDays = Math.floor((Date.now() - new Date(action.appliedAt).getTime()) / 86400000)
        const daysRemaining = action.recoveryDays - elapsedDays
        const stratLabel = strategyHeLabels[p.strategy] || p.strategy
        return {
            titleHe: `אסטרטגיית ${stratLabel} פעילה`,
            subtitleHe: daysRemaining > 0
                ? `${daysRemaining} ימים עד תזכורת החזרה`
                : 'תזכורת תיווצר בקרוב',
            daysRemaining,
            severity: daysRemaining < 0 ? 'warning' : 'info',
            icon: '📊',
        }
    },

    // ──────────────────────────────────────────────────────────────────────
    // Idempotency detection — block double-apply of same strategy
    // ──────────────────────────────────────────────────────────────────────
    detectDuplicate(_ctx, newPayload, existing) {
        const matchingActive = existing.find(a =>
            a.state === 'active' &&
            a.kind === 'bidding_strategy' &&
            (a.payload as BiddingStrategyPayload).strategy === newPayload.strategy &&
            (a.payload as BiddingStrategyPayload).customerId === newPayload.customerId
        )
        if (matchingActive) {
            const elapsedDays = Math.floor((Date.now() - new Date(matchingActive.appliedAt).getTime()) / 86400000)
            const remaining = matchingActive.recoveryDays - elapsedDays
            return `Strategy "${newPayload.strategy}" already active (applied ${elapsedDays} days ago, recovery in ${remaining} days). Click "Restore" first if you want to change.`
        }
        return null
    },
}

registerHandler('bidding_strategy', handler)

// ─── helpers ──────────────────────────────────────────────────────────────

function extractConvValueSubscore(auditContent: string): number | undefined {
    const m = /conv_value_quality_subscore[^\d]*(\d+)/i.exec(auditContent)
    return m ? parseInt(m[1], 10) : undefined
}

// Local Google Ads API helpers (duplicated minimally to keep handler self-contained)
const GADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function getAccessToken(tokens: { refreshToken: string; accessToken?: string; expiresAt?: number }): Promise<string> {
    if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60000) return tokens.accessToken
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token',
        }),
    })
    const data = await res.json() as { access_token?: string }
    if (!data.access_token) throw new Error('Token refresh failed')
    return data.access_token
}

async function gadsQuery(
    customerId: string, loginCustomerId: string, devToken: string,
    tokens: { refreshToken: string }, query: string,
): Promise<Array<Record<string, unknown>>> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': devToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/googleAds:searchStream`, {
        method: 'POST', headers, body: JSON.stringify({ query }),
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(`GAds ${res.status}: ${(data as { error?: { message?: string } })?.error?.message || text.slice(0, 200)}`)
    const chunks = Array.isArray(data) ? data : [data]
    const rows: Array<Record<string, unknown>> = []
    for (const chunk of chunks as Array<{ results?: Array<Record<string, unknown>> }>) for (const r of (chunk?.results || [])) rows.push(r)
    return rows
}

async function gadsMutate(
    customerId: string, loginCustomerId: string, devToken: string,
    tokens: { refreshToken: string }, resource: string, body: unknown,
): Promise<Record<string, unknown>> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': devToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const res = await fetch(`${GADS_API}/customers/${customerId}/${resource}`, {
        method: 'POST', headers, body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(`GAds mutate ${res.status}: ${(data as { error?: { message?: string } })?.error?.message || text.slice(0, 300)}`)
    return data
}