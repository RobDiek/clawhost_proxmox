/**
 * Google Ads Transition Executor — flip a campaign's bidding strategy.
 *
 * Used by:
 *   - bidTransitionRunner: when 30+ conversions accumulated and client approves
 *   - manual approval queue actions
 *
 * Wraps googleAds.ts's customer.{id}.campaigns:mutate with operation:UPDATE
 * and update_mask covering only bidding fields (no other side effects).
 */

// v18 was deprecated and returns 404 as of early 2026. v22 is latest stable.
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
}

async function refreshAccessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec) return null
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

export interface BidTransitionParams {
    customerId: string
    tokens: GoogleTokens
    campaignId: string
    newStrategy: 'MAXIMIZE_CLICKS' | 'MAXIMIZE_CONVERSIONS' | 'TARGET_CPA' | 'TARGET_ROAS'
    targetCpaIls?: number
    targetRoas?: number
    loginCustomerId?: string
}

export async function updateCampaignBiddingStrategy(p: BidTransitionParams): Promise<{ ok: boolean; reason?: string }> {
    if (!p.tokens.refreshToken) return { ok: false, reason: 'no refresh token' }
    const at = await refreshAccessToken(p.tokens.refreshToken)
    if (!at) return { ok: false, reason: 'token refresh failed' }

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${at}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    }
    if (p.loginCustomerId) headers['login-customer-id'] = p.loginCustomerId

    const resourceName = `customers/${p.customerId}/campaigns/${p.campaignId}`
    const update: Record<string, unknown> = { resourceName }
    let mask = ''
    switch (p.newStrategy) {
        case 'MAXIMIZE_CLICKS':
            update.maximizeClicks = {}
            mask = 'maximize_clicks'
            break
        case 'MAXIMIZE_CONVERSIONS':
            update.maximizeConversions = {}
            mask = 'maximize_conversions'
            break
        case 'TARGET_CPA':
            update.targetCpa = { targetCpaMicros: String(Math.round((p.targetCpaIls || 50) * 1_000_000)) }
            mask = 'target_cpa.target_cpa_micros'
            break
        case 'TARGET_ROAS':
            update.targetRoas = { targetRoas: p.targetRoas || 4.0 }
            mask = 'target_roas.target_roas'
            break
    }

    try {
        const url = `${GOOGLE_ADS_API}/customers/${p.customerId}/campaigns:mutate`
        const body = {
            operations: [{ update, updateMask: mask }],
        }
        const r = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        })
        const data = await r.json() as any
        if (!r.ok) {
            const msg = data?.error?.details?.[0]?.errors?.[0]?.message
                || data?.error?.message
                || JSON.stringify(data).slice(0, 200)
            return { ok: false, reason: `API ${r.status}: ${msg}` }
        }
        return { ok: true }
    } catch (err) {
        return { ok: false, reason: (err as Error).message }
    }
}