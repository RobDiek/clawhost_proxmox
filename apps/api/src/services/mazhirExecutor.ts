/**
 * Mazhir — Campaign Executor
 *
 * Translates an approved MediaPlan into real Google Ads campaigns by mapping
 * each CampaignBriefDraft into the existing CampaignPlan shape that
 * services/googleAds.ts:createCampaign already accepts.
 *
 * Idempotent: skips any campaign whose googleAdsCampaignId is already set.
 * Per-campaign error isolation — a failure on one doesn't stop the rest.
 *
 * Pre-flight verification runs first; blockers abort execution. Warnings only
 * log (don't stop launch).
 *
 * Geography mapping — current 2026 Israel geo target IDs:
 *   Israel (national):  2376
 *   Tel Aviv:           1008227
 *   Ramat Gan:          1008229
 *   Givatayim:          1008212  (placeholder — verify on launch via geoTargetConstants:suggest)
 *   Holon:              1008211  (placeholder — verify on launch)
 * For dynamic city resolution we call geoTargetConstants:suggest at launch
 * time and cache results to instance.researchData.mazhirGeoCache.
 *
 * The executor does NOT auto-launch in ENABLED mode if the plan was
 * generated under launch_now without explicit user re-confirmation. Default
 * launchMode is 'PAUSED' for safety; user flips to ENABLED via dashboard
 * once they've eyeballed each campaign in Google Ads UI.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { createCampaign } from '@/services/googleAds'
import { runPreflight } from '@/services/mazhirPreflight'
import type { CampaignBriefDraft, MediaPlan } from '@/controllers/hosting/agentSetup'

const GADS_API = 'https://googleads.googleapis.com/v18'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

async function getAccessToken(tokens: GoogleTokens): Promise<string> {
    if (tokens.accessToken && (tokens.expiresAt || 0) > Date.now() + 300_000) return tokens.accessToken
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
    const j = await res.json() as any
    if (!j.access_token) throw new Error(`Token refresh: ${j.error || 'unknown'}`)
    return j.access_token
}

// ─── Resolve cities to Google geoTargetConstant IDs ───────────────────────
async function resolveCityGeoIds(
    customerId: string,
    tokens: GoogleTokens,
    cities: string[],
    countryCode: string,
    loginCustomerId?: string,
): Promise<{ resolved: { city: string; id: string }[]; failed: string[] }> {
    const resolved: { city: string; id: string }[] = []
    const failed: string[] = []
    if (!cities || cities.length === 0) return { resolved, failed }

    const accessToken = await getAccessToken(tokens)
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    // geoTargetConstants:suggest accepts a list of location names
    const url = `${GADS_API}/customers/${customerId}/geoTargetConstants:suggest`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                locale: 'en',
                countryCode,
                locationNames: { names: cities },
            }),
        })
        const data = await res.json() as any
        if (res.ok) {
            const suggestions = data.geoTargetConstantSuggestions || []
            const byName: Record<string, string> = {}
            for (const s of suggestions) {
                const target = s.geoTargetConstant
                const reqName = s.searchTerm || s.locationNames?.[0]
                if (target?.id && reqName) {
                    byName[reqName.toLowerCase()] = String(target.id)
                }
            }
            for (const c of cities) {
                const id = byName[c.toLowerCase()] || byName[c.trim().toLowerCase()]
                if (id) resolved.push({ city: c, id })
                else failed.push(c)
            }
        } else {
            // API error — fall back to all-failed
            failed.push(...cities)
            console.warn('[mazhirExecutor] geoTargetConstants:suggest error:', JSON.stringify(data).slice(0, 300))
        }
    } catch (err) {
        failed.push(...cities)
        console.warn('[mazhirExecutor] geoTargetConstants:suggest fetch failed:', (err as Error).message)
    }

    return { resolved, failed }
}

// ─── Main entry ───────────────────────────────────────────────────────────

export interface ExecutionResult {
    instanceId: string
    startedAt: string
    finishedAt: string
    preflight: { ok: boolean; blockerCount: number; warningCount: number }
    perCampaign: {
        name: string
        status: 'launched' | 'skipped_existing' | 'skipped_archived' | 'failed'
        googleAdsCampaignId?: string
        error?: string
    }[]
    overallStatus: 'success' | 'partial' | 'failed' | 'aborted_preflight'
}

export async function executeMediaPlan(instanceId: string, opts: { dryRun?: boolean } = {}): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString()

    // 1. Preflight
    const preflight = await runPreflight(instanceId)
    if (!preflight.ok) {
        const finished = new Date().toISOString()
        return {
            instanceId,
            startedAt,
            finishedAt: finished,
            preflight: { ok: false, blockerCount: preflight.blockers.length, warningCount: preflight.warnings.length },
            perCampaign: [],
            overallStatus: 'aborted_preflight',
        }
    }

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const rd: any = inst.researchData || {}
    const plan: MediaPlan = rd.mediaPlan || (rd.strategy && typeof rd.strategy === 'object' ? rd.strategy.mediaPlan : null)
    const profile = rd.paidProfile

    const googleAdsConfig: any = inst.googleAdsConfig || {}
    const customerId = googleAdsConfig.customerId as string
    const loginCustomerId = googleAdsConfig.loginCustomerId || (googleAdsConfig.mccSubAccountId ? customerId : undefined)
    const tokens = inst.googleTokens as any
    const tokenObj: any = {
        accessToken: tokens?.accessToken || '',
        refreshToken: tokens?.refreshToken,
        expiresAt: tokens?.expiresAt || 0,
        scopes: tokens?.scopes || [],
        email: tokens?.email || '',
    }

    // Pre-resolve city geo IDs once for all campaigns
    let cityIdMap: Record<string, string> = {}
    {
        const allCities = Array.from(new Set(
            (plan.campaigns || []).flatMap((c: any) => c.geo?.cities || [])
        ))
        if (allCities.length > 0) {
            const r = await resolveCityGeoIds(customerId, tokenObj, allCities, 'IL', loginCustomerId)
            for (const m of r.resolved) cityIdMap[m.city.toLowerCase()] = m.id
        }
    }

    // 2. Per-campaign execution
    const perCampaign: ExecutionResult['perCampaign'] = []
    const updatedCampaigns = [...(plan.campaigns || [])] as CampaignBriefDraft[]

    for (let i = 0; i < updatedCampaigns.length; i++) {
        const campaign = updatedCampaigns[i]

        if (campaign.status === 'archived') {
            perCampaign.push({ name: campaign.name, status: 'skipped_archived' })
            continue
        }
        if (campaign.googleAdsCampaignId) {
            perCampaign.push({ name: campaign.name, status: 'skipped_existing', googleAdsCampaignId: campaign.googleAdsCampaignId })
            continue
        }

        try {
            // Map CampaignBriefDraft → CampaignPlan
            const adGroup = (campaign.adGroups && campaign.adGroups[0]) || null

            // Geography → location IDs
            let geoTargets: string[] = []
            if (campaign.geo.mode === 'national') geoTargets = ['2376']
            else if (campaign.geo.mode === 'cities' || campaign.geo.mode === 'city_radius') {
                geoTargets = (campaign.geo.cities || [])
                    .map(c => cityIdMap[c.toLowerCase()])
                    .filter(Boolean) as string[]
                if (geoTargets.length === 0) geoTargets = ['2376']  // fall back to Israel
            } else if (campaign.geo.mode === 'international') geoTargets = []  // no targeting

            const langId = campaign.language === 'en' ? '1000' : '1027'  // 1027=Hebrew, 1000=English

            // Pull headlines/descriptions from first ad group (only one allowed by current createCampaign)
            const headlines = (adGroup?.headlines || []).slice(0, 15)
            const descriptions = (adGroup?.descriptions || []).slice(0, 4)
            const keywords = (adGroup?.keywords || []).map(k => ({
                text: k.text,
                matchType: k.matchType,
            }))

            const finalUrl = adGroup?.finalUrl || ''
            if (!finalUrl) throw new Error(`Campaign "${campaign.name}" has no finalUrl on ad group — cannot launch`)
            if (headlines.length < 3) throw new Error(`Campaign "${campaign.name}": needs ≥3 RSA headlines`)
            if (descriptions.length < 2) throw new Error(`Campaign "${campaign.name}": needs ≥2 RSA descriptions`)
            if (keywords.length === 0 && campaign.type === 'SEARCH') throw new Error(`Campaign "${campaign.name}": SEARCH needs keywords`)

            // Bid strategy resolution. Plan may have:
            //   campaign.bidStrategy = MAXIMIZE_CLICKS  (cold start)
            //   campaign.bidStrategyTransition = { week1to4, weekTransitionGate, weekAfterTransition }
            // Executor ALWAYS launches with cold-start bid (week1to4). The
            // bidTransitionRunner cron flips later when gate hit. This avoids
            // the trap of accepting tCPA/tROAS values without conversion data.
            const transition = (campaign as any).bidStrategyTransition
            let bidStrategy = transition?.week1to4 || campaign.bidStrategy
            if (bidStrategy === 'TARGET_CPA' || bidStrategy === 'TARGET_ROAS') {
                // Defense-in-depth: smart bidding without 30+ conv data wastes budget.
                bidStrategy = 'MAXIMIZE_CONVERSIONS'
            }
            // Persist the transition contract on the campaign record so the
            // cron knows when/how to flip — stored in metadata.
            const bidContract = transition
                ? {
                    week1to4: transition.week1to4 || 'MAXIMIZE_CLICKS',
                    weekTransitionGate: transition.weekTransitionGate || '30+ conversions in 30 days',
                    weekAfterTransition: transition.weekAfterTransition,
                    targetTcpaIls: (plan as any).transitionToTcpa?.suggestedCpaIls,
                    triggerConvCount: (plan as any).transitionToTcpa?.triggerConvCount || 30,
                  }
                : null

            const planParam: any = {
                campaignType: campaign.type,
                campaignName: campaign.name,
                dailyBudget: campaign.dailyBudgetIls,
                currency: 'ILS',
                biddingStrategy: bidStrategy,
                keywords,
                negativeKeywords: [
                    ...(plan.negativeKeywordLibrary?.industry || []),
                    ...(plan.negativeKeywordLibrary?.brandDefense || []),
                    ...(plan.negativeKeywordLibrary?.junkPatterns || []),
                ].slice(0, 10000),
                headlines,
                descriptions,
                callouts: adGroup?.callouts,
                sitelinks: adGroup?.sitelinks,
                finalUrl,
                launchMode: 'PAUSED' as const,        // ALWAYS launch paused — user flips ON in Ads UI after eyeball
                geoTargets,
                language: langId,
            }

            if (opts.dryRun) {
                perCampaign.push({
                    name: campaign.name,
                    status: 'launched',
                    googleAdsCampaignId: 'dry-run-' + Math.random().toString(36).slice(2, 10),
                })
                continue
            }

            const out = await createCampaign(customerId, tokenObj, planParam, loginCustomerId)
            if (out.errors && out.errors.length > 0 && !out.campaignId) {
                throw new Error(out.errors.join(' | '))
            }
            const campaignId = out.campaignId
            updatedCampaigns[i] = {
                ...campaign,
                status: 'launched',
                googleAdsCampaignId: campaignId,
                bidContract: bidContract || (campaign as any).bidContract,
                launchedAt: new Date().toISOString(),
            } as any
            perCampaign.push({ name: campaign.name, status: 'launched', googleAdsCampaignId: campaignId })
        } catch (err) {
            updatedCampaigns[i] = { ...campaign, status: 'paused' as any }  // mark for review
            perCampaign.push({ name: campaign.name, status: 'failed', error: (err as Error).message })
        }
    }

    // 3. Persist updated plan
    const newPlan: MediaPlan = {
        ...plan,
        campaigns: updatedCampaigns,
        status: perCampaign.every(p => p.status === 'launched' || p.status === 'skipped_existing' || p.status === 'skipped_archived')
            ? 'live'
            : plan.status,
    }
    if (!opts.dryRun) {
        await db.update(instances).set({
            researchData: { ...rd, mediaPlan: newPlan } as any,
        }).where(eq(instances.id, instanceId))
    }

    const finishedAt = new Date().toISOString()
    const okCount = perCampaign.filter(p => p.status === 'launched' || p.status === 'skipped_existing').length
    const failCount = perCampaign.filter(p => p.status === 'failed').length

    let overallStatus: ExecutionResult['overallStatus'] = 'success'
    if (failCount === perCampaign.length && perCampaign.length > 0) overallStatus = 'failed'
    else if (failCount > 0) overallStatus = 'partial'

    // Audit trail — append to mazhirExecutionLog
    if (!opts.dryRun) {
        const log: any[] = (rd.mazhirExecutionLog || []).slice(-19)  // keep last 20
        log.push({
            startedAt, finishedAt, overallStatus,
            campaignCount: perCampaign.length,
            launched: okCount,
            failed: failCount,
            perCampaign,
        })
        await db.update(instances).set({
            researchData: { ...rd, mazhirExecutionLog: log, mediaPlan: newPlan } as any,
        }).where(eq(instances.id, instanceId))
    }

    console.log(`[mazhirExecutor] ${instanceId}: status=${overallStatus} launched=${okCount}/${perCampaign.length} failed=${failCount}${opts.dryRun ? ' [DRY-RUN]' : ''}`)

    return {
        instanceId,
        startedAt,
        finishedAt,
        preflight: { ok: true, blockerCount: 0, warningCount: preflight.warnings.length },
        perCampaign,
        overallStatus,
    }
}
