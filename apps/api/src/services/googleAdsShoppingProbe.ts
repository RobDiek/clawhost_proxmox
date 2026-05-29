/**
 * Google Ads Shopping/PMax/Merchant Center probe — Phase 2026.02 Block 6 K9
 *
 * Auto-detects whether a tenant USES Google Shopping / Performance Max /
 * Merchant Center on their Ads account. Used by trackingConflicts to
 * decide whether deactivating "Google for WooCommerce" plugin is SAFE
 * (no Shopping/PMax/MC dependencies) or DESTRUCTIVE (would break active
 * product feed sync + ad campaigns).
 *
 * The platform should NEVER ask the user "do you use X?" when the API
 * can tell us. This service eliminates that bad UX.
 */

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

const GADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken
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
    if (!data.access_token) throw new Error('Refresh failed for Google Ads token')
    return data.access_token
}

async function gadsQuery(
    customerId: string,
    loginCustomerId: string,
    devToken: string,
    tokens: GoogleTokens,
    query: string,
): Promise<any[]> {
    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': devToken,
    }
    if (loginCustomerId && loginCustomerId !== customerId) headers['login-customer-id'] = loginCustomerId
    const url = `${GADS_API}/customers/${customerId}/googleAds:searchStream`
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
    })
    const text = await res.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) {
        const msg = data?.error?.message || text.slice(0, 200)
        throw new Error(`Google Ads ${res.status}: ${msg}`)
    }
    const chunks = Array.isArray(data) ? data : [data]
    const rows: any[] = []
    for (const chunk of chunks) {
        for (const r of (chunk?.results || [])) rows.push(r)
    }
    return rows
}

export interface ShoppingUsageResult {
    hasShoppingCampaigns: boolean
    hasPmaxCampaigns: boolean
    hasMerchantCenterLink: boolean
    activeShoppingCount: number
    activePmaxCount: number
    merchantCenterAccountIds: string[]
    campaignSummaries: Array<{ id: string; name: string; type: string; status: string }>
    safeToDeactivateGoogleForWoo: boolean
    summary: string                    // human-readable headline
    diagnostic?: string                // error trace if probe failed
}

/**
 * Probe the Ads account for Shopping/PMax campaigns + Merchant Center
 * links. Returns a deterministic safety verdict for the
 * "Google for WooCommerce" deactivation decision.
 */
export async function probeShoppingUsage(opts: {
    operatingCustomerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
}): Promise<ShoppingUsageResult> {
    const result: ShoppingUsageResult = {
        hasShoppingCampaigns: false,
        hasPmaxCampaigns: false,
        hasMerchantCenterLink: false,
        activeShoppingCount: 0,
        activePmaxCount: 0,
        merchantCenterAccountIds: [],
        campaignSummaries: [],
        safeToDeactivateGoogleForWoo: false,
        summary: '',
    }
    try {
        // 1. Find active Shopping + PMax campaigns
        const campaignRows = await gadsQuery(
            opts.operatingCustomerId,
            opts.loginCustomerId,
            opts.developerToken,
            opts.tokens,
            `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
             FROM campaign
             WHERE campaign.advertising_channel_type IN ('SHOPPING', 'PERFORMANCE_MAX')
                   AND campaign.status IN ('ENABLED', 'PAUSED')`,
        )
        for (const r of campaignRows) {
            const c = r.campaign || {}
            const type = String(c.advertisingChannelType || c.advertising_channel_type || '')
            const status = String(c.status || '')
            result.campaignSummaries.push({
                id: String(c.id || ''),
                name: String(c.name || ''),
                type,
                status,
            })
            if (status === 'ENABLED') {
                if (type === 'SHOPPING') result.activeShoppingCount++
                if (type === 'PERFORMANCE_MAX') result.activePmaxCount++
            }
        }
        result.hasShoppingCampaigns = result.activeShoppingCount > 0
        result.hasPmaxCampaigns = result.activePmaxCount > 0

        // 2. Find Merchant Center links
        try {
            const mcRows = await gadsQuery(
                opts.operatingCustomerId,
                opts.loginCustomerId,
                opts.developerToken,
                opts.tokens,
                `SELECT merchant_center_link.id, merchant_center_link.merchant_center_id, merchant_center_link.status
                 FROM merchant_center_link
                 WHERE merchant_center_link.status = 'ENABLED'`,
            )
            for (const r of mcRows) {
                const mc = r.merchantCenterLink || r.merchant_center_link || {}
                const mcId = String(mc.merchantCenterId || mc.merchant_center_id || '')
                if (mcId) result.merchantCenterAccountIds.push(mcId)
            }
            result.hasMerchantCenterLink = result.merchantCenterAccountIds.length > 0
        } catch (e) {
            // merchant_center_link query may 403 on accounts without manager
            // access — non-fatal, just unable to confirm
            console.warn(`[shoppingProbe] merchant_center_link query failed (non-fatal): ${(e as Error).message.slice(0, 200)}`)
        }

        // 3. Decide safety
        result.safeToDeactivateGoogleForWoo =
            !result.hasShoppingCampaigns &&
            !result.hasPmaxCampaigns &&
            !result.hasMerchantCenterLink

        if (result.safeToDeactivateGoogleForWoo) {
            result.summary = `✓ Safe to deactivate — no Shopping/PMax campaigns + no Merchant Center links on this Ads account.`
        } else {
            const parts: string[] = []
            if (result.activePmaxCount > 0) parts.push(`${result.activePmaxCount} active Performance Max campaign${result.activePmaxCount > 1 ? 's' : ''}`)
            if (result.activeShoppingCount > 0) parts.push(`${result.activeShoppingCount} active Shopping campaign${result.activeShoppingCount > 1 ? 's' : ''}`)
            if (result.hasMerchantCenterLink) parts.push(`Merchant Center link to MC ID ${result.merchantCenterAccountIds.join(', ')}`)
            result.summary = `⚠ DO NOT deactivate — found ${parts.join(' + ')}. Disable conversion tracking inside the plugin's settings instead.`
        }

        return result
    } catch (err) {
        result.diagnostic = (err as Error).message.slice(0, 300)
        result.summary = `Could not verify Shopping/PMax usage: ${result.diagnostic}. Decide manually based on whether you use Google Shopping or Performance Max.`
        result.safeToDeactivateGoogleForWoo = false  // err on side of caution
        return result
    }
}