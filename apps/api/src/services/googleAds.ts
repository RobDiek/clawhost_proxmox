/**
 * Google Ads Service
 *
 * Manages campaigns, ad groups, keywords, ads, and conversion tracking
 * via Google Ads API REST endpoints.
 *
 * Uses the existing Google OAuth refresh_token (scope: adwords)
 * stored in instances.googleTokens.
 */

// v18 was deprecated and returns 404 as of early 2026. v22 is latest stable.
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v22'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Developer token — set in .env (from MCC → Tools → API Center)
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

interface GoogleTokens {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes: string[]
    email: string
}

interface CampaignPlan {
    campaignType: 'SEARCH' | 'PERFORMANCE_MAX' | 'DISPLAY' | 'VIDEO' | 'DEMAND_GEN'
    campaignName: string
    dailyBudget: number  // in ILS (or user's currency)
    currency: string
    biddingStrategy: 'MAXIMIZE_CLICKS' | 'MAXIMIZE_CONVERSIONS' | 'TARGET_CPA' | 'TARGET_ROAS'
    targetCpa?: number
    targetRoas?: number
    keywords: Array<{ text: string; matchType: 'BROAD' | 'PHRASE' | 'EXACT' }>
    negativeKeywords: string[]
    headlines: string[]      // up to 15
    descriptions: string[]   // up to 4
    sitelinks?: Array<{ text: string; url: string; description1?: string; description2?: string }>
    callouts?: string[]
    finalUrl: string
    launchMode: 'ENABLED' | 'PAUSED'
    geoTargets?: string[]    // location IDs (Israel = 2376)
    language?: string        // language ID (Hebrew = 1027)
}

interface CampaignResult {
    campaignId: string
    adGroupId: string
    budgetId: string
    status: string
    errors: string[]
}

// ── Token refresh ──
async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    // Check if current token is still valid (with 5 min buffer)
    if (tokens.accessToken && tokens.expiresAt > Date.now() + 300000) {
        return tokens.accessToken
    }

    // Refresh
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token',
        }),
    })

    const data = await res.json() as { access_token?: string; expires_in?: number; error?: string }
    if (!data.access_token) {
        throw new Error(`Token refresh failed: ${data.error || 'unknown'}`)
    }

    return data.access_token
}

// ── API call helper ──
async function adsApiCall(
    method: string,
    path: string,
    customerId: string,
    tokens: GoogleTokens,
    body?: unknown,
    loginCustomerId?: string
): Promise<unknown> {
    const accessToken = await getAccessToken(tokens)

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': DEVELOPER_TOKEN,
    }

    if (loginCustomerId) {
        headers['login-customer-id'] = loginCustomerId
    }

    const url = `${GOOGLE_ADS_API}/customers/${customerId}/${path}`
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })

    const responseData = await res.json()

    if (!res.ok) {
        const error = (responseData as any)?.error?.message ||
                      (responseData as any)?.error?.details?.[0]?.errors?.[0]?.message ||
                      JSON.stringify(responseData).substring(0, 300)
        throw new Error(`Google Ads API error (${res.status}): ${error}`)
    }

    return responseData
}

// ── GAQL query helper ──
async function adsQuery(
    customerId: string,
    tokens: GoogleTokens,
    query: string,
    loginCustomerId?: string
): Promise<unknown[]> {
    const data = await adsApiCall('POST', 'googleAds:searchStream', customerId, tokens, { query }, loginCustomerId) as any
    // searchStream returns array of batches
    const results: unknown[] = []
    if (Array.isArray(data)) {
        for (const batch of data) {
            if (batch.results) results.push(...batch.results)
        }
    }
    return results
}

// ── Create a full campaign from plan ──
export async function createCampaign(
    customerId: string,
    tokens: GoogleTokens,
    plan: CampaignPlan,
    loginCustomerId?: string
): Promise<CampaignResult> {
    const errors: string[] = []
    const customerPath = `customers/${customerId}`

    // 1. Create Campaign Budget
    let budgetResourceName = ''
    try {
        const budgetRes = await adsApiCall('POST', 'campaignBudgets:mutate', customerId, tokens, {
            operations: [{
                create: {
                    // Unique suffix — Ads rejects duplicate budget names, so a
                    // retry after a partial failure would 400 on the collision.
                    name: `Budget — ${plan.campaignName} — ${Date.now().toString(36)}`,
                    amountMicros: String(Math.round(plan.dailyBudget * 1_000_000)), // micros
                    deliveryMethod: 'STANDARD',
                }
            }]
        }, loginCustomerId) as any

        budgetResourceName = budgetRes.results?.[0]?.resourceName
        if (!budgetResourceName) throw new Error('No budget resource name returned')
    } catch (e) {
        errors.push(`Budget creation failed: ${String(e)}`)
        return { campaignId: '', adGroupId: '', budgetId: '', status: 'FAILED', errors }
    }

    // 2. Create Campaign
    let campaignResourceName = ''
    try {
        const biddingConfig: Record<string, unknown> = {}
        switch (plan.biddingStrategy) {
            case 'MAXIMIZE_CLICKS':
                // "Maximize Clicks" is the TargetSpend strategy in the Ads API —
                // there is no `maximizeClicks` campaign field (400 Cannot find field).
                biddingConfig.targetSpend = {}
                break
            case 'MAXIMIZE_CONVERSIONS':
                biddingConfig.maximizeConversions = {}
                break
            case 'TARGET_CPA':
                biddingConfig.targetCpa = { targetCpaMicros: String(Math.round((plan.targetCpa || 50) * 1_000_000)) }
                break
            case 'TARGET_ROAS':
                biddingConfig.targetRoas = { targetRoas: plan.targetRoas || 4.0 }
                break
        }

        const campaignData: Record<string, unknown> = {
            name: plan.campaignName,
            advertisingChannelType: plan.campaignType,
            status: plan.launchMode,
            campaignBudget: budgetResourceName,
            ...biddingConfig,
        }

        // Geo targeting (default: Israel)
        if (plan.campaignType === 'SEARCH') {
            campaignData.networkSettings = {
                targetGoogleSearch: true,
                targetSearchNetwork: true,
                targetContentNetwork: false,
            }
        }

        const campaignRes = await adsApiCall('POST', 'campaigns:mutate', customerId, tokens, {
            operations: [{ create: campaignData }]
        }, loginCustomerId) as any

        campaignResourceName = campaignRes.results?.[0]?.resourceName
        if (!campaignResourceName) throw new Error('No campaign resource name returned')
    } catch (e) {
        errors.push(`Campaign creation failed: ${String(e)}`)
        return { campaignId: '', adGroupId: '', budgetId: budgetResourceName, status: 'FAILED', errors }
    }

    // 3. Set geo targeting (Israel by default)
    try {
        const locationIds = plan.geoTargets || ['2376'] // 2376 = Israel
        for (const locId of locationIds) {
            await adsApiCall('POST', 'campaignCriteria:mutate', customerId, tokens, {
                operations: [{
                    create: {
                        campaign: campaignResourceName,
                        location: { geoTargetConstant: `geoTargetConstants/${locId}` },
                    }
                }]
            }, loginCustomerId)
        }
    } catch (e) {
        errors.push(`Geo targeting: ${String(e)}`)
    }

    // 4. Set language targeting (Hebrew by default)
    try {
        const langId = plan.language || '1027' // 1027 = Hebrew
        await adsApiCall('POST', 'campaignCriteria:mutate', customerId, tokens, {
            operations: [{
                create: {
                    campaign: campaignResourceName,
                    language: { languageConstant: `languageConstants/${langId}` },
                }
            }]
        }, loginCustomerId)
    } catch (e) {
        errors.push(`Language targeting: ${String(e)}`)
    }

    // 5. Create Ad Group
    let adGroupResourceName = ''
    try {
        const adGroupRes = await adsApiCall('POST', 'adGroups:mutate', customerId, tokens, {
            operations: [{
                create: {
                    name: `Ad Group — ${plan.campaignName}`,
                    campaign: campaignResourceName,
                    status: plan.launchMode,
                    type: 'SEARCH_STANDARD',
                }
            }]
        }, loginCustomerId) as any

        adGroupResourceName = adGroupRes.results?.[0]?.resourceName
        if (!adGroupResourceName) throw new Error('No ad group resource name returned')
    } catch (e) {
        errors.push(`Ad Group creation failed: ${String(e)}`)
        return { campaignId: campaignResourceName, adGroupId: '', budgetId: budgetResourceName, status: 'PARTIAL', errors }
    }

    // 6. Add Keywords
    try {
        const keywordOps = plan.keywords.slice(0, 20).map(kw => ({
            create: {
                adGroup: adGroupResourceName,
                status: 'ENABLED',
                keyword: {
                    text: kw.text,
                    matchType: kw.matchType,
                },
            }
        }))

        if (keywordOps.length > 0) {
            await adsApiCall('POST', 'adGroupCriteria:mutate', customerId, tokens, {
                operations: keywordOps
            }, loginCustomerId)
        }
    } catch (e) {
        errors.push(`Keywords: ${String(e)}`)
    }

    // 7. Add Negative Keywords
    try {
        if (plan.negativeKeywords.length > 0) {
            const negOps = plan.negativeKeywords.map(kw => ({
                create: {
                    campaign: campaignResourceName,
                    negative: true,
                    keyword: { text: kw, matchType: 'BROAD' },
                }
            }))
            await adsApiCall('POST', 'campaignCriteria:mutate', customerId, tokens, {
                operations: negOps
            }, loginCustomerId)
        }
    } catch (e) {
        errors.push(`Negative keywords: ${String(e)}`)
    }

    // 8. Create Responsive Search Ad (RSA)
    try {
        const headlines = plan.headlines.slice(0, 15).map((h, i) => ({
            text: h.substring(0, 30), // 30 char limit
            pinnedField: i === 0 ? 'HEADLINE_1' : undefined, // pin first headline only
        })).filter(h => h.text.length > 0)

        const descriptions = plan.descriptions.slice(0, 4).map(d => ({
            text: d.substring(0, 90), // 90 char limit
        })).filter(d => d.text.length > 0)

        await adsApiCall('POST', 'adGroupAds:mutate', customerId, tokens, {
            operations: [{
                create: {
                    adGroup: adGroupResourceName,
                    status: 'ENABLED',
                    ad: {
                        responsiveSearchAd: {
                            headlines,
                            descriptions,
                        },
                        finalUrls: [plan.finalUrl],
                    }
                }
            }]
        }, loginCustomerId)
    } catch (e) {
        errors.push(`RSA Ad creation: ${String(e)}`)
    }

    // 9. Add Sitelinks
    try {
        if (plan.sitelinks && plan.sitelinks.length > 0) {
            for (const sl of plan.sitelinks.slice(0, 4)) {
                // Create sitelink asset
                const assetRes = await adsApiCall('POST', 'assets:mutate', customerId, tokens, {
                    operations: [{
                        create: {
                            sitelinkAsset: {
                                linkText: sl.text.substring(0, 25),
                                description1: sl.description1?.substring(0, 35) || '',
                                description2: sl.description2?.substring(0, 35) || '',
                            },
                            finalUrls: [sl.url],
                        }
                    }]
                }, loginCustomerId) as any

                const assetResourceName = assetRes.results?.[0]?.resourceName
                if (assetResourceName) {
                    // Link asset to campaign
                    await adsApiCall('POST', 'campaignAssets:mutate', customerId, tokens, {
                        operations: [{
                            create: {
                                asset: assetResourceName,
                                campaign: campaignResourceName,
                                fieldType: 'SITELINK',
                            }
                        }]
                    }, loginCustomerId)
                }
            }
        }
    } catch (e) {
        errors.push(`Sitelinks: ${String(e)}`)
    }

    // 10. Add Callout assets
    try {
        if (plan.callouts && plan.callouts.length > 0) {
            for (const callout of plan.callouts.slice(0, 10)) {
                const assetRes = await adsApiCall('POST', 'assets:mutate', customerId, tokens, {
                    operations: [{
                        create: {
                            calloutAsset: { calloutText: callout.substring(0, 25) },
                        }
                    }]
                }, loginCustomerId) as any

                const assetResourceName = assetRes.results?.[0]?.resourceName
                if (assetResourceName) {
                    await adsApiCall('POST', 'campaignAssets:mutate', customerId, tokens, {
                        operations: [{
                            create: {
                                asset: assetResourceName,
                                campaign: campaignResourceName,
                                fieldType: 'CALLOUT',
                            }
                        }]
                    }, loginCustomerId)
                }
            }
        }
    } catch (e) {
        errors.push(`Callouts: ${String(e)}`)
    }

    const status = errors.length === 0 ? 'SUCCESS' : 'PARTIAL'
    console.log(`Google Ads campaign created: ${campaignResourceName} (${status}, ${errors.length} errors)`)

    return {
        campaignId: campaignResourceName,
        adGroupId: adGroupResourceName,
        budgetId: budgetResourceName,
        status,
        errors,
    }
}

// ── Create Conversion Action + generate tracking snippet ──
export async function createConversionAction(
    customerId: string,
    tokens: GoogleTokens,
    name: string,
    loginCustomerId?: string
): Promise<{ conversionActionId: string; trackingSnippet: string; globalTag: string }> {
    const res = await adsApiCall('POST', 'conversionActions:mutate', customerId, tokens, {
        operations: [{
            create: {
                name,
                type: 'WEBPAGE',
                category: 'PURCHASE',
                status: 'ENABLED',
                countingType: 'ONE_PER_CLICK',
                valueSettings: {
                    defaultValue: 0,
                    alwaysUseDefaultValue: false,
                },
            }
        }]
    }, loginCustomerId) as any

    const resourceName = res.results?.[0]?.resourceName || ''

    // Extract conversion ID from customer ID for tag
    const conversionId = `AW-${customerId}`

    const globalTag = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${conversionId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${conversionId}');
</script>`

    const trackingSnippet = `<!-- Conversion tracking — place on thank you / confirmation page -->
<script>
  gtag('event', 'conversion', {
    'send_to': '${conversionId}/${name.replace(/\s/g, '_')}',
    'value': 1.0,
    'currency': 'ILS'
  });
</script>`

    return { conversionActionId: resourceName, trackingSnippet, globalTag }
}

// ── Get campaign performance metrics ──
export async function getCampaignMetrics(
    customerId: string,
    tokens: GoogleTokens,
    campaignId?: string,
    dateRange: string = 'LAST_30_DAYS',
    loginCustomerId?: string
): Promise<unknown[]> {
    let query = `
        SELECT
            campaign.id, campaign.name, campaign.status,
            metrics.impressions, metrics.clicks, metrics.cost_micros,
            metrics.conversions, metrics.conversions_value,
            metrics.average_cpc, metrics.ctr,
            metrics.search_impression_share
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        AND segments.date DURING ${dateRange}
    `

    if (campaignId) {
        query += ` AND campaign.id = ${campaignId}`
    }

    return adsQuery(customerId, tokens, query, loginCustomerId)
}

// ── Get Google's optimization recommendations ──
export async function getRecommendations(
    customerId: string,
    tokens: GoogleTokens,
    loginCustomerId?: string
): Promise<unknown[]> {
    const query = `
        SELECT
            recommendation.type,
            recommendation.impact,
            recommendation.campaign_budget_recommendation,
            recommendation.keyword_recommendation,
            recommendation.text_ad_recommendation,
            recommendation.responsive_search_ad_recommendation
        FROM recommendation
        WHERE recommendation.type IN (
            'CAMPAIGN_BUDGET', 'KEYWORD', 'TEXT_AD',
            'RESPONSIVE_SEARCH_AD', 'TARGET_CPA_OPT_IN',
            'MAXIMIZE_CONVERSIONS_OPT_IN'
        )
    `

    return adsQuery(customerId, tokens, query, loginCustomerId)
}

// ── Apply a recommendation ──
export async function applyRecommendation(
    customerId: string,
    tokens: GoogleTokens,
    recommendationResourceName: string,
    loginCustomerId?: string
): Promise<void> {
    await adsApiCall('POST', 'recommendations:apply', customerId, tokens, {
        operations: [{
            resourceName: recommendationResourceName,
        }]
    }, loginCustomerId)
}

export type { CampaignPlan, CampaignResult, GoogleTokens }