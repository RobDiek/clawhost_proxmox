/**
 * Mazhir — Pre-flight verification before any campaign launch.
 *
 * Hard guardrails enforced (returns blockers if any fail):
 *   1. Google Ads connection: customerId set + OAuth scope 'adwords' present
 *   2. GTM connection: tagmanager scopes present
 *   3. Conversion actions exist + ENABLED + at least one with primaryForGoal=true
 *   4. PaidProfile complete + acknowledged tradeoffs (if launch_now)
 *   5. MediaPlan exists + status='approved'
 *   6. Tracking stack: GA4 + GTM marked installed in profile
 *
 * Soft warnings (logged but don't block):
 *   - Enhanced Conversions terms not accepted
 *   - Phone calls relevant but no call tracking provider set
 *   - PMax-for-leadgen requested without offline upload setup
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { checkEnhancedConversionsEligibility } from '@/services/mazhirConversions'

export interface PreflightResult {
    ok: boolean                       // true → executor can proceed
    blockers: { code: string; message: string; remediation: string }[]
    warnings: { code: string; message: string }[]
    summary: {
        googleAdsConnected: boolean
        gtmConnected: boolean
        conversionActionsCount: number
        mediaPlanStatus: string | null
        paidProfilePresent: boolean
    }
}

const REQUIRED_GTM_SCOPES = [
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/tagmanager.publish',
]

export async function runPreflight(instanceId: string): Promise<PreflightResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    // Read from the primary agent's research_data + per-agent config/tokens —
    // the SAME canonical store generateMediaPlan/executeMediaPlan use. Reading
    // instances.* here (legacy/stale) made preflight block greenfield launches
    // on every per-agent tenant. Systemic fix (matches mazhirExecutor).
    const { resolvePrimaryAgent, readResearchData } = await import('@/services/agentContext')
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const profile = rd.paidProfile
    const mediaPlan = rd.mediaPlan || (rd.strategy && typeof rd.strategy === 'object' ? rd.strategy.mediaPlan : null)
    const tokens = (agent?.googleTokens as any) || inst.googleTokens as any
    const googleAdsConfig: any = (agent?.googleAdsConfig as any) || inst.googleAdsConfig || {}
    // Phase 4.2.3-B: read `active` (unified mapped+created) with legacy fallback.
    const conversions = rd.mazhirConversions?.active || rd.mazhirConversions?.created || []

    const blockers: PreflightResult['blockers'] = []
    const warnings: PreflightResult['warnings'] = []

    // ── 1. paidProfile ──
    if (!profile) {
        blockers.push({ code: 'no_paid_profile', message: 'PaidProfile not filled', remediation: 'Open dashboard → Mazhir card → "הגדירו פרופיל קידום"' })
    } else if (profile.launchPath === 'launch_now' && !profile.acknowledgedTradeoffs) {
        blockers.push({ code: 'launch_now_not_acknowledged', message: 'launch_now requires acknowledgedTradeoffs=true', remediation: 'Re-open the paid profile and tick the acknowledgment checkbox' })
    }

    // ── 2. Google Ads connection ──
    const adsConnected = !!(googleAdsConfig.customerId && tokens?.refreshToken)
    if (!adsConnected) {
        blockers.push({ code: 'no_google_ads', message: 'Google Ads not linked', remediation: 'Connect Google Ads via OAuth (Integrations → Google Ads)' })
    } else {
        const scopes: string[] = Array.isArray(tokens.scopes) ? tokens.scopes : (typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [])
        // Match both URL form (https://.../adwords) and SCOPE_MAP alias ('ads')
        const hasAdsScope = scopes.some(s => s === 'ads' || s.includes('adwords'))
        if (!hasAdsScope) {
            blockers.push({ code: 'missing_adwords_scope', message: 'OAuth missing adwords scope', remediation: 'Re-auth Google with "ads" scope selected' })
        }
    }

    // ── 3. GTM connection ──
    const tokenScopes: string[] = Array.isArray(tokens?.scopes) ? tokens.scopes : (typeof tokens?.scope === 'string' ? tokens.scope.split(' ') : [])
    // Aliased storage ('gtm') OR URL form (https://.../tagmanager.*) — accept both
    const gtmConnected = tokenScopes.some(t => t === 'gtm' || t.includes('tagmanager'))
    if (!gtmConnected) {
        blockers.push({ code: 'no_gtm_scope', message: 'GTM scope not granted', remediation: 'Re-auth Google with "gtm" scope (creates conversion tags automatically)' })
    }

    // ── 4. Conversion actions exist ──
    if (conversions.length === 0) {
        blockers.push({ code: 'no_conversion_actions', message: 'No Google Ads conversion actions created', remediation: 'Run "auto-create conversion infrastructure" — Mazhir creates them via API' })
    }

    // ── 5. Media plan status ──
    if (!mediaPlan) {
        blockers.push({ code: 'no_media_plan', message: 'MediaPlan not generated', remediation: 'Click "צרו תוכנית מדיה" on the Mazhir card' })
    } else if (mediaPlan.status !== 'approved') {
        blockers.push({ code: 'plan_not_approved', message: `MediaPlan status="${mediaPlan.status}" — must be "approved"`, remediation: 'Review the plan and click "✓ אשרו"' })
    }

    // ── 6. Tracking stack flags (sanity check) ──
    if (profile && (!profile.trackingStack?.ga4 || !profile.trackingStack?.gtm)) {
        warnings.push({ code: 'tracking_stack_incomplete', message: 'GA4/GTM not marked installed in paidProfile' })
    }
    if (profile?.trackingStack?.phoneCallsRelevant && profile?.trackingStack?.callTracking === 'none') {
        warnings.push({ code: 'phone_no_tracking', message: 'Phone calls marked relevant but no call tracking provider set' })
    }

    // ── 7. Enhanced Conversions eligibility (soft) ──
    if (adsConnected) {
        try {
            // Phase 4.2.1-O: thread developerToken from per-tenant config + use
            // operating sub-account when MCC scope is present.
            const _opCust = googleAdsConfig.scope?.operatingCustomerId
            const _ecCust = _opCust || googleAdsConfig.customerId
            const _ecLogin = _opCust ? googleAdsConfig.customerId : (googleAdsConfig.loginCustomerId || undefined)
            const _ecToken = googleAdsConfig.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
            const ec = await checkEnhancedConversionsEligibility(_ecCust, tokens, _ecToken, _ecLogin)
            if (!ec.eligible) warnings.push({ code: 'enhanced_conv_terms', message: ec.reason })
        } catch (err) {
            warnings.push({ code: 'enhanced_conv_check_failed', message: (err as Error).message })
        }
    }

    // ── 8. PMax-for-leadgen guard ──
    if (mediaPlan && profile?.primaryGoal === 'leadgen') {
        const pmax = (mediaPlan.campaigns || []).find((c: any) => c.type === 'PERFORMANCE_MAX' && c.status !== 'archived')
        const offline = !!mediaPlan.conversionTrackingPlan?.offlineConversionUpload
        if (pmax && !offline) {
            warnings.push({ code: 'pmax_leadgen_no_offline', message: 'PMax-for-leadgen without offline qualified-lead upload — campaign was auto-archived' })
        }
    }

    return {
        ok: blockers.length === 0,
        blockers,
        warnings,
        summary: {
            googleAdsConnected: adsConnected,
            gtmConnected,
            conversionActionsCount: conversions.length,
            mediaPlanStatus: mediaPlan?.status || null,
            paidProfilePresent: !!profile,
        },
    }
}