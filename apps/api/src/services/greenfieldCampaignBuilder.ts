/**
 * Greenfield Google Ads campaign builder.
 *
 * Wires the monthly-plan paid campaign intent → real Ads campaigns. The
 * monthly-plan task executor (Phase C) only ships briefs; the actual builder
 * `createCampaign` (services/googleAds.ts) is complete but had no generator
 * feeding it a CampaignPlan from research. This module is that generator +
 * orchestrator: research (paid_keyword_research records + paidProfile) →
 * CampaignPlan[] → createCampaign (PAUSED, operating/MCC account aware).
 *
 * Greenfield discipline: launch PAUSED, MAXIMIZE_CLICKS (no conversion history
 * yet — smart bidding is unblocked later by the bid-transition runner once the
 * lead conversion accrues data), geo Israel + Hebrew, account-level negatives,
 * one campaign per intent cluster (MOFU search + brand defense) each with its
 * own ad group so RSAs/keywords stay themed.
 */

import { createCampaign, type CampaignPlan, type GoogleTokens } from './googleAds'
import { readGoogleAdsConfig, readResearchData, resolvePrimaryAgent, resolveAgentById } from './agentContext'
import { getAgentIntegration } from './agentIntegrations'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface KwRec {
    keyword?: string
    text?: string
    match_type?: string
    matchType?: string
    recommended_max_cpc_ils?: number
}

interface AdGroupRec {
    ad_group_label_he?: string
    ad_group_label?: string
    name?: string
    keywords?: KwRec[]
    negative_keywords?: string[]
    intent_tier?: string
    campaign_type_he?: string
    is_brand_defense?: boolean
}

function normMatch(m: string | undefined): 'BROAD' | 'PHRASE' | 'EXACT' {
    const s = String(m || 'phrase').toUpperCase()
    if (s.includes('EXACT')) return 'EXACT'
    if (s.includes('BROAD')) return 'BROAD'
    return 'PHRASE'
}

function isBrand(r: AdGroupRec): boolean {
    return r.is_brand_defense === true
        || /brand|מותג|הגנת/i.test(`${r.ad_group_label_he || ''} ${r.ad_group_label || ''} ${r.campaign_type_he || ''} ${r.intent_tier || ''}`)
}

/**
 * Resolve the Ads operating account + MCC login + a token that can write to it.
 * Mirrors how the executor resolves Ads creds for an (agentless or per-agent)
 * tenant: googleAdsConfig.scope.operatingCustomerId + loginCustomerId + the
 * google integration's refresh token.
 */
export async function resolveAdsWriteContext(instanceId: string, agentId?: string | null): Promise<{
    operating: string; login: string; tokens: GoogleTokens; developerToken: string
} | null> {
    const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
    const { config } = await readGoogleAdsConfig(agent, instanceId)
    if (!config) return null
    const operating = String(config.scope?.operatingCustomerId || config.mccSubAccountId || config.customerId || '').replace(/\D/g, '')
    const login = String(config.loginCustomerId || config.customerId || operating).replace(/\D/g, '')
    const developerToken = String(config.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '')
    const gi = await getAgentIntegration(instanceId, 'mt', 'google', agent?.id || null)
        || await getAgentIntegration(instanceId, 'oc', 'google', agent?.id || null)
    const giCfg: any = gi?.config || {}
    const refreshToken = giCfg.refreshToken || giCfg.refresh_token
    if (!operating || !developerToken || !refreshToken) return null
    const tokens: GoogleTokens = {
        accessToken: giCfg.accessToken || '',
        refreshToken,
        expiresAt: giCfg.expiresAt || 0,
        scopes: giCfg.scopes || [],
        email: giCfg.email || '',
    } as GoogleTokens
    return { operating, login, tokens, developerToken }
}

/**
 * Build CampaignPlan[] from a tenant's research. One SEARCH campaign per intent
 * cluster (MOFU + brand defense). PAUSED, MAXIMIZE_CLICKS, geo IL, Hebrew.
 */
export function buildCampaignPlansFromResearch(rd: any, opts: { finalUrl: string; businessName: string }): CampaignPlan[] {
    const pkw: any = rd?.results?.paid_keyword_research || {}
    const records: AdGroupRec[] = pkw.records || pkw.ad_groups || []
    if (records.length === 0) return []

    const pp: any = rd?.paidProfile || rd?.results?.paid_questionnaire || {}
    const monthly = Number(pp.monthlyBudgetIls || pp.monthlyBudget || 0) || 3000
    // Split daily budget across the two clusters; conservative greenfield start.
    const dailyTotal = Math.max(20, Math.round(monthly / 30))

    const mofu = records.filter(r => !isBrand(r))
    const brand = records.filter(r => isBrand(r))

    const dedupeNeg = (recs: AdGroupRec[]) => [...new Set(recs.flatMap(r => r.negative_keywords || []).map(s => String(s).trim()).filter(Boolean))]
    const kwsOf = (recs: AdGroupRec[]) => recs.flatMap(r => (r.keywords || []).map(k => ({
        text: String(k.keyword || k.text || '').trim(),
        matchType: normMatch(k.match_type || k.matchType),
    }))).filter(k => k.text.length > 0)

    const brandName = opts.businessName || 'Flowmatic'
    const plans: CampaignPlan[] = []

    if (mofu.length > 0) {
        plans.push({
            campaignType: 'SEARCH',
            campaignName: `${brandName} — Search MOFU`,
            dailyBudget: brand.length > 0 ? Math.round(dailyTotal * 0.75) : dailyTotal,
            currency: 'ILS',
            biddingStrategy: 'MAXIMIZE_CLICKS',
            keywords: kwsOf(mofu).slice(0, 20),
            negativeKeywords: dedupeNeg(mofu),
            headlines: [
                brandName, 'שיווק AI שאתם מאשרים', 'אתם מאשרים, המערכת מבצעת',
                '7 סוכני AI לשיווק', 'קמפיינים בלי סוכנות', 'ניהול Google ו-Meta אוטומטי',
                'שיווק על השרת שלכם', 'מחקר שוק אמיתי', 'דוח ביצועים חודשי',
                'התחילו בלי התחייבות',
            ],
            descriptions: [
                'מערכת AI מנהלת קמפיינים, תוכן ומדידה — אתם רק מאשרים. בלי לשכור סוכנות.',
                '7 סוכני AI מבצעים 22 שלבי מחקר ובונים קמפיינים. ביקורת אנושית בכל שלב.',
                'Google Ads, Meta ו-SEO במקום אחד. שקיפות מלאה ודוח חודשי.',
                'שיווק אוטומטי שרץ על השרת שלכם. התחילו היום, בלי התחייבות.',
            ],
            finalUrl: opts.finalUrl,
            launchMode: 'PAUSED',
            geoTargets: ['2376'],
            language: '1027',
        })
    }

    if (brand.length > 0) {
        plans.push({
            campaignType: 'SEARCH',
            campaignName: `${brandName} — Brand Defense`,
            dailyBudget: Math.max(15, Math.round(dailyTotal * 0.25)),
            currency: 'ILS',
            biddingStrategy: 'MAXIMIZE_CLICKS',
            keywords: kwsOf(brand).slice(0, 20),
            negativeKeywords: dedupeNeg(brand),
            headlines: [
                brandName, `${brandName} — האתר הרשמי`, 'אתם מאשרים, המערכת מבצעת',
                'שיווק AI אוטומטי', 'התחילו עכשיו', 'דברו איתנו',
            ],
            descriptions: [
                `${brandName} — פלטפורמת שיווק AI. אתם מאשרים, המערכת מבצעת.`,
                'הדף הרשמי. גלו איך שיווק אוטומטי עובד על השרת שלכם.',
            ],
            finalUrl: opts.finalUrl,
            launchMode: 'PAUSED',
            geoTargets: ['2376'],
            language: '1027',
        })
    }

    return plans
}

export interface GreenfieldBuildResult {
    ok: boolean
    dryRun: boolean
    plans: Array<{ name: string; dailyBudget: number; keywords: number; negatives: number; headlines: number }>
    created: Array<{ name: string; campaignId: string; status: string; errors: string[] }>
    error?: string
}

/**
 * Orchestrate: resolve account → build plans → (unless dryRun) create each PAUSED.
 */
export async function createGreenfieldCampaigns(
    instanceId: string,
    agentId: string | null | undefined,
    opts: { dryRun?: boolean; finalUrl?: string } = {},
): Promise<GreenfieldBuildResult> {
    const dryRun = opts.dryRun !== false // default to dry unless explicitly false
    const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const pp: any = rd?.paidProfile || {}
    const businessName = pp.businessName || rd?.results?.brand_identity?.name || (inst as any)?.businessName || 'Flowmatic'
    const finalUrl = opts.finalUrl
        || rd?.results?.business_classification?.website
        || (inst as any)?.website
        || (rd?.brandWebsite)
        || 'https://flowmatic.co.il'

    const plans = buildCampaignPlansFromResearch(rd, { finalUrl, businessName })
    const planSummary = plans.map(p => ({ name: p.campaignName, dailyBudget: p.dailyBudget, keywords: p.keywords.length, negatives: p.negativeKeywords.length, headlines: p.headlines.length }))
    if (plans.length === 0) return { ok: false, dryRun, plans: planSummary, created: [], error: 'no paid_keyword_research records to build from' }
    if (dryRun) return { ok: true, dryRun: true, plans: planSummary, created: [] }

    const ctx = await resolveAdsWriteContext(instanceId, agentId)
    if (!ctx) return { ok: false, dryRun: false, plans: planSummary, created: [], error: 'could not resolve Ads write context (operating account / token / dev token)' }

    const created: GreenfieldBuildResult['created'] = []
    for (const plan of plans) {
        const res = await createCampaign(ctx.operating, ctx.tokens, plan, ctx.login)
        created.push({ name: plan.campaignName, campaignId: res.campaignId || '', status: res.status, errors: res.errors || [] })
    }
    return { ok: created.every(c => c.status === 'SUCCESS' || c.status === 'PARTIAL'), dryRun: false, plans: planSummary, created }
}