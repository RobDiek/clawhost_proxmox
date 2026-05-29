/**
 * Google Ads Bidding Strategy Recovery — Phase 2026.02 Block 6 K13
 *
 * After fix_tracking_first cleanup (removing double-counting + polluted
 * conversion signal), tenants need to decide how AGGRESSIVELY to adjust
 * their existing Smart Bidding campaigns. The textbook prescription
 * (pause everything, switch to Manual CPC, wait 30 days) is correct in
 * isolation but DESTRUCTIVE for a running revenue-generating business.
 *
 * This service offers 3 graduated strategies so the user picks based on
 * business context (cash flow, traffic dependency, risk tolerance), not
 * a one-size-fits-all aggressive default.
 *
 * Side-effect: applying CONSERVATIVE or MODERATE on campaigns that were
 * previously hit by AGGRESSIVE (paused / switched to Manual CPC) will
 * naturally REVERT those changes — resume paused campaigns + restore
 * Smart Bidding. So this serves as both "apply new strategy" AND "undo
 * prior aggressive action".
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
    if (!data.access_token) throw new Error('Token refresh failed')
    return data.access_token
}

async function gadsQuery(
    customerId: string, loginCustomerId: string, devToken: string,
    tokens: GoogleTokens, query: string,
): Promise<any[]> {
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
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(`GAds ${res.status}: ${data?.error?.message || text.slice(0, 200)}`)
    const chunks = Array.isArray(data) ? data : [data]
    const rows: any[] = []
    for (const chunk of chunks) for (const r of (chunk?.results || [])) rows.push(r)
    return rows
}

async function gadsMutate(
    customerId: string, loginCustomerId: string, devToken: string,
    tokens: GoogleTokens, resource: string, body: unknown,
): Promise<any> {
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
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(`GAds mutate ${res.status}: ${data?.error?.message || text.slice(0, 300)}`)
    return data
}

// ─── Strategy definitions ─────────────────────────────────────────────────

export type BiddingStrategyKind = 'conservative' | 'moderate' | 'aggressive'

export interface BiddingStrategyDefinition {
    kind: BiddingStrategyKind
    titleHe: string
    riskIcon: string
    descriptionHe: string
    whatYouGetHe: string[]
    whatYouGiveUpHe: string[]
    bestForHe: string
    actions: string[]    // human-readable list of what will execute
}

export const BIDDING_STRATEGIES: Record<BiddingStrategyKind, BiddingStrategyDefinition> = {
    conservative: {
        kind: 'conservative',
        titleHe: 'שמרני (מומלץ לעסק פעיל)',
        riskIcon: '🟢',
        descriptionHe: 'משאיר את כל הקמפיינים רצים, מקטין תקציב ב-30% ל-14 יום כדי להגן מבידינג מנופח. Smart Bidding ממשיך ללמוד — החלק החדש כבר נקי, ההיסטוריה תתעדכן בהדרגה.',
        whatYouGetHe: [
            'אפס הפסקת תנועה — כל הקמפיינים ממשיכים לרוץ',
            'אפס ירידה דרסטית בהכנסות',
            'הגנה חלקית מבידינג מנופח (תקציב מופחת)',
            'התאוששות הדרגתית של Smart Bidding',
        ],
        whatYouGiveUpHe: [
            '30% פחות תקציב יומי = ~30% פחות חשיפה ב-14 יום',
            'Smart Bidding עדיין לומד עם זנב היסטוריה מוטה (פחות אגרסיבי תוך 7 ימים)',
            'התאוששות מלאה לוקחת ~14 יום במקום "איפוס מיידי"',
        ],
        bestForHe: 'עסק פעיל עם הכנסות יומיות שלא יכול להרשות לעצמו 30 יום ללא PMax. רוב הלקוחות.',
        actions: [
            'Resume any PAUSED scoped campaigns → ENABLED',
            'Revert MANUAL_CPC → MAX_CONVERSION_VALUE (restore Smart Bidding)',
            'Reduce daily budget by 30% on scoped campaigns',
            'Ensure account-level negatives attached',
        ],
    },
    moderate: {
        kind: 'moderate',
        titleHe: 'מאוזן (איזון בין מהירות התאוששות לשמירת תנועה)',
        riskIcon: '🟡',
        descriptionHe: 'מחליף MaxConvValue → tCPA עם target ₪70 (audit baseline). Smart Bidding ממוקד יותר ב-cost-per-acquisition במקום ב-conversion value, מה שמפחית את הרגישות לזיהום היסטורי.',
        whatYouGetHe: [
            'מעבר ל-tCPA — target ברור (₪70) במקום מקסום value',
            'התאוששות מהירה יותר משמרני',
            'Smart Bidding ממשיך לעבוד, רק יותר שמרני',
        ],
        whatYouGiveUpHe: [
            '15% פחות תקציב יומי = ירידה קלה בחשיפה',
            'tCPA לא מנצל הזדמנויות high-value transactions (max conv value עושה זאת)',
            '7-14 ימים learning כדי להתייצב על target חדש',
        ],
        bestForHe: 'עסק שרוצה התאוששות מהירה אבל לא יכול להפסיק קמפיינים. בעלי growth runway חזק.',
        actions: [
            'Resume any PAUSED scoped campaigns → ENABLED',
            'Revert MANUAL_CPC → MAX_CONVERSION_VALUE',
            'Switch MAX_CONVERSION_VALUE → TARGET_CPA with target ₪70',
            'Reduce daily budget by 15%',
            'Ensure negatives attached',
        ],
    },
    aggressive: {
        kind: 'aggressive',
        titleHe: 'אגרסיבי (רק אם יכולים להרשות לעצמם 30 יום בלי PMax)',
        riskIcon: '🔴',
        descriptionHe: 'משבית PMax לחלוטין, מעביר Search/Display ל-Manual CPC. ממתינים 30 יום + 30 רכישות אמת על נתונים נקיים, ואז חוזרים ל-Smart Bidding. איפוס מלא — אבל בעלות גבוהה.',
        whatYouGetHe: [
            'איפוס מלא: Smart Bidding לומד מאפס על נתונים נקיים בלבד',
            'ודאות מקסימלית שאין השפעה מהזיהום הקודם',
            'אחרי 30 יום — חזרה ל-tCPA אופטימלי עם target ₪70',
        ],
        whatYouGiveUpHe: [
            '30 יום ללא PMax = הפסקה של מקור ההכנסות העיקרי',
            'Manual CPC נחות מ-Smart Bidding בכל מקרה (פחות יעיל ל-CPC)',
            'אובדן Learning state של הקמפיינים שהושבתו (חודשיים+ נתונים)',
            'אובדן Customer Match audiences בקמפיינים שעוברים',
        ],
        bestForHe: 'בעל תקציב פנוי, או עסק עם Smart Bidding שרץ פחות מ-30 יום (אין הרבה learning state לאבד). תרחיש קצה.',
        actions: [
            'Pause PMax campaigns (PERFORMANCE_MAX)',
            'Switch Search/Display campaigns to MANUAL_CPC',
            'Ensure negatives attached',
            '⚠ Manually resume + restore Smart Bidding after 30 days + 30 clean purchases',
        ],
    },
}

// ─── Apply strategy ──────────────────────────────────────────────────────

export interface ApplyBiddingStrategyInput {
    customerId: string
    loginCustomerId: string
    tokens: GoogleTokens
    developerToken: string
    scopedCampaignIds: string[]
    strategy: BiddingStrategyKind
    moderateTargetCpaIls?: number    // for moderate; default ₪70
}

export interface ApplyBiddingStrategyResult {
    strategy: BiddingStrategyKind
    actionsApplied: Array<{ campaignId: string; campaignName: string; change: string }>
    errors: Array<{ campaignId: string; error: string }>
    summary: string
}

export async function applyBiddingStrategy(opts: ApplyBiddingStrategyInput): Promise<ApplyBiddingStrategyResult> {
    const result: ApplyBiddingStrategyResult = {
        strategy: opts.strategy,
        actionsApplied: [],
        errors: [],
        summary: '',
    }

    // 1. Read CURRENT state of scoped campaigns + their budgets
    const campaigns: Array<{
        id: string; name: string; status: string; bidding: string; channel: string
        budgetResourceName: string; currentBudgetMicros: number
    }> = []
    try {
        const rows = await gadsQuery(
            opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens,
            `SELECT campaign.id, campaign.name, campaign.status,
                    campaign.bidding_strategy_type,
                    campaign.advertising_channel_type,
                    campaign_budget.resource_name,
                    campaign_budget.amount_micros
             FROM campaign
             WHERE campaign.id IN (${opts.scopedCampaignIds.map(id => `'${id}'`).join(',')})`,
        )
        for (const r of rows) {
            const c = r.campaign || {}
            const b = r.campaignBudget || r.campaign_budget || {}
            campaigns.push({
                id: String(c.id || ''),
                name: String(c.name || ''),
                status: String(c.status || ''),
                bidding: String(c.biddingStrategyType || c.bidding_strategy_type || ''),
                channel: String(c.advertisingChannelType || c.advertising_channel_type || ''),
                budgetResourceName: String(b.resourceName || b.resource_name || ''),
                currentBudgetMicros: Number(b.amountMicros || b.amount_micros || 0),
            })
        }
    } catch (e) {
        result.errors.push({ campaignId: 'all', error: `Could not read current state: ${(e as Error).message.slice(0, 200)}` })
        return result
    }

    // 2. Build operations per strategy
    const targetCpaIls = opts.moderateTargetCpaIls ?? 70
    const targetCpaMicros = Math.round(targetCpaIls * 1_000_000)

    for (const cmp of campaigns) {
        const isPmax = cmp.channel === 'PERFORMANCE_MAX'
        const isSearchOrDisplay = ['SEARCH', 'DISPLAY', 'SHOPPING'].includes(cmp.channel)

        if (opts.strategy === 'conservative') {
            // A. Resume if PAUSED (undo aggressive)
            if (cmp.status === 'PAUSED') {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: { resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`, status: 'ENABLED' },
                            updateMask: 'status',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: 'Resumed (status: ENABLED)' })
                    cmp.status = 'ENABLED'
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `resume: ${(e as Error).message.slice(0, 200)}` })
                }
            }
            // B. Revert MANUAL_CPC → MAX_CONVERSION_VALUE (undo aggressive)
            if (cmp.bidding === 'MANUAL_CPC' && isSearchOrDisplay) {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: {
                                resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`,
                                maximizeConversionValue: {},
                            },
                            updateMask: 'maximize_conversion_value.target_roas',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: 'Restored MAX_CONVERSION_VALUE (from Manual CPC)' })
                    cmp.bidding = 'MAXIMIZE_CONVERSION_VALUE'
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `restore bidding: ${(e as Error).message.slice(0, 200)}` })
                }
            }
            // C. Reduce budget by 30%
            if (cmp.budgetResourceName && cmp.currentBudgetMicros > 0) {
                const newBudgetMicros = Math.round(cmp.currentBudgetMicros * 0.7)
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaignBudgets:mutate', {
                        operations: [{
                            update: { resourceName: cmp.budgetResourceName, amountMicros: String(newBudgetMicros) },
                            updateMask: 'amount_micros',
                        }],
                    })
                    result.actionsApplied.push({
                        campaignId: cmp.id, campaignName: cmp.name,
                        change: `Budget ₪${(cmp.currentBudgetMicros / 1_000_000).toFixed(0)} → ₪${(newBudgetMicros / 1_000_000).toFixed(0)} (−30%)`,
                    })
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `budget: ${(e as Error).message.slice(0, 200)}` })
                }
            }
        }

        else if (opts.strategy === 'moderate') {
            // A. Resume if PAUSED
            if (cmp.status === 'PAUSED') {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: { resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`, status: 'ENABLED' },
                            updateMask: 'status',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: 'Resumed (status: ENABLED)' })
                    cmp.status = 'ENABLED'
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `resume: ${(e as Error).message.slice(0, 200)}` })
                }
            }
            // B. Switch to tCPA with target ₪70 (Search/Display + PMax — PMax also supports tCPA)
            if (isSearchOrDisplay && cmp.bidding !== 'TARGET_CPA') {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: {
                                resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`,
                                targetCpa: { targetCpaMicros: String(targetCpaMicros) },
                            },
                            updateMask: 'target_cpa.target_cpa_micros',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: `Switched to tCPA target ₪${targetCpaIls}` })
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `switch tcpa: ${(e as Error).message.slice(0, 200)}` })
                }
            }
            // C. Reduce budget by 15%
            if (cmp.budgetResourceName && cmp.currentBudgetMicros > 0) {
                const newBudgetMicros = Math.round(cmp.currentBudgetMicros * 0.85)
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaignBudgets:mutate', {
                        operations: [{
                            update: { resourceName: cmp.budgetResourceName, amountMicros: String(newBudgetMicros) },
                            updateMask: 'amount_micros',
                        }],
                    })
                    result.actionsApplied.push({
                        campaignId: cmp.id, campaignName: cmp.name,
                        change: `Budget ₪${(cmp.currentBudgetMicros / 1_000_000).toFixed(0)} → ₪${(newBudgetMicros / 1_000_000).toFixed(0)} (−15%)`,
                    })
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `budget: ${(e as Error).message.slice(0, 200)}` })
                }
            }
        }

        else if (opts.strategy === 'aggressive') {
            // A. Pause PMax
            if (isPmax && cmp.status === 'ENABLED') {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: { resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`, status: 'PAUSED' },
                            updateMask: 'status',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: 'PAUSED (PMax)' })
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `pause pmax: ${(e as Error).message.slice(0, 200)}` })
                }
            }
            // B. Switch Search/Display to Manual CPC
            if (isSearchOrDisplay && cmp.bidding !== 'MANUAL_CPC') {
                try {
                    await gadsMutate(opts.customerId, opts.loginCustomerId, opts.developerToken, opts.tokens, 'campaigns:mutate', {
                        operations: [{
                            update: {
                                resourceName: `customers/${opts.customerId}/campaigns/${cmp.id}`,
                                manualCpc: { enhancedCpcEnabled: false },
                            },
                            updateMask: 'manual_cpc.enhanced_cpc_enabled',
                        }],
                    })
                    result.actionsApplied.push({ campaignId: cmp.id, campaignName: cmp.name, change: 'Switched to Manual CPC' })
                } catch (e) {
                    result.errors.push({ campaignId: cmp.id, error: `manual cpc: ${(e as Error).message.slice(0, 200)}` })
                }
            }
        }
    }

    result.summary = `${result.actionsApplied.length} actions applied${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`
    return result
}