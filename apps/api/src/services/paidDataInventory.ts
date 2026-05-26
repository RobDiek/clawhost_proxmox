/**
 * Paid Data Inventory Service (Phase 4.1)
 *
 * Builds the inventory of what's connected, what's missing, and what
 * paid-track capabilities are unlocked for this instance. Tier classification
 * (T0-T4) drives downstream stages (paid_audit cold/warm mode, paid_media_plan
 * bidding ladder, paid_execution gates).
 *
 * Extends the previous mazhirDataPreflight (which surfaced "what we lose")
 * with a structured tier + capabilities model + multi-source signal reading
 * (agent_integrations table, paidProfile.historicalReports, real-time
 * Google Ads API account summary when connected, etc.).
 *
 * Reference: 2026 best practices — Smart Bidding requires ≥30 conv/30d for
 * tCPA stability (Optmyzr/Vallaeys); Customer Match 100-user minimum unlocks
 * audience signals (Google Ads, Dec 2024); EC + Consent Mode v2 + sGTM are
 * the durable architecture post-Privacy-Sandbox shutdown.
 *
 * Anti-pattern from previous version: this service does NOT call Anthropic.
 * It's a pure inventory + classification engine. Cheap, fast, deterministic.
 * Anthropic-driven recommendations live in paid_audit (next stage).
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentIntegrations } from '@/db/schema'

export type PaidTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

export type SignalSeverity = 'critical' | 'recommended' | 'advanced'

export type AdapterId =
    | 'google_ads' | 'meta_ads' | 'microsoft_ads' | 'tiktok_ads' | 'linkedin_ads'
    | 'ga4' | 'gtm' | 'sgtm' | 'gsc'
    | 'call_tracking' | 'crm' | 'email_platform'
    | 'payment_processor' | 'cdp'
    | 'historical_reports'

export interface AdapterStatus {
    id: AdapterId
    label: string                    // Hebrew display name
    severity: SignalSeverity
    connected: boolean
    /** Where we detected the connection: agent_integrations row / instance field / paidProfile flag / autodetected. */
    source?: 'agent_integrations' | 'instance_field' | 'paid_profile' | 'detected' | null
    connectedAt?: string
    /** Adapter-specific metadata (customer_id, property_id, conv counts, match rates, etc.). */
    metadata?: Record<string, unknown>
}

export type PaidCapability =
    | 'max_clicks'
    | 'max_conversions'
    | 'target_cpa'
    | 'target_roas'
    | 'pmax_basic'
    | 'pmax_with_audience_signals'
    | 'customer_match_targeting'
    | 'customer_match_exclusion'
    | 'enhanced_conversions_web'
    | 'enhanced_conversions_leads'
    | 'offline_conversion_import'
    | 'meta_capi'
    | 'meta_advantage_plus_audience'
    | 'value_based_bidding'

export interface CapabilityBlockedReason {
    capability: PaidCapability
    reason: string
    reasonHe: string
    unlocksWhen: string
}

export interface InventoryAction {
    actionId: string
    title: string
    titleHe: string
    severity: SignalSeverity
    /** Who needs to act. */
    owner: 'user' | 'platform_auto' | 'user_action_required'
    estimatedMinutes: number
    /** Rationale grounded in 2026 research findings. */
    rationale: string
    rationaleHe: string
    /** Optional verification check to mark this action "completed". */
    verification?: {
        method: 'tag_assistant_check' | 'consent_state_test' | 'manual_test_event'
            | 'ec_diagnostics_check' | 'emq_check' | 'test_call_with_gclid' | 'checklist'
        criteria: string
    }
    /** Which capabilities unlock when this action is completed. */
    unlocksCapabilities: PaidCapability[]
    /** Recurring cost estimate (₪/mo), if user pays a third party. */
    costRecurringIls?: number
    /** One-time setup cost estimate, if applicable. */
    costOneTimeIls?: number
}

export interface PaidDataInventory {
    instanceId: string
    agentId?: string
    tier: PaidTier
    tierRationale: string
    tierRationaleHe: string
    generatedAt: string

    /**
     * Phase 2026.02 — soft validator output. Surfaces fork_override events
     * (user choice overriding heuristic), CSV-path provisional tier flags,
     * etc. Downstream stages + UI can show these as ⚠ warnings without
     * blocking. Hard validators move to paidConsistency.ts in Block 6.
     */
    tierWarnings?: string[]
    /** Source flag for fork-aware downstream stages. */
    forkPath?: 'has_history' | 'no_history' | null
    forkHasIntegration?: boolean

    adapters: AdapterStatus[]
    capabilities: {
        available: PaidCapability[]
        blocked: CapabilityBlockedReason[]
    }
    actions: InventoryAction[]
    summary: {
        criticalGaps: number
        recommendedGaps: number
        advancedGaps: number
        estimatedDaysToNextTier: number | null
        estimatedSetupCostOneTimeIls: number
        estimatedSetupCostMonthlyIls: number
    }
    // Phase 4.1 hardening — per-platform breakdown so downstream consumers
    // (Hypothesis Engine, paid_audit) never cross-sum conversions across
    // platforms with different attribution windows.
    perPlatform?: Array<{
        platform: string
        tier: PaidTier
        spend90dIls: number
        conv30d: number
    }>
    dominantPlatform?: string | null

    // Phase 2026.01 — orthogonal tracking_quality dimension + ASC/IL checks.
    // See specs/research-stages/paid_data_inventory.yaml v2026.01.
    trackingQuality?: {
        status: 'broken' | 'partial' | 'mature'
        rationaleHe: string
        signals: {
            enhanced_conversions_match_rate_pct: number | null
            oci_present_if_needed: boolean | null
            consent_mode_v2_status: 'disabled' | 'basic' | 'advanced' | 'unknown'
            il_currency_consistent: boolean | null
            hebrew_phone_compliance_pct: number | null
        }
    }
    advantagePlusEligibility?: {
        asc_viable: boolean
        meta_purchases_4w: number | null
        reason_he: string
    }
    attributionReadiness?: {
        status: 'ready' | 'thin' | 'insufficient'
        rationale_he: string
    }
}

// ─── Tier classification logic ─────────────────────────────────────────────
// Per research deep-dive: cold-warm taxonomy from Optmyzr + practitioner
// consensus. Statistical justification: standard error of CVR at n=30 conv
// ≈ 18%, at n=50 ≈ 14%. Below 30, Smart Bidding "thrashes" (Vallaeys 2026).
// We assess BY ACCOUNT not by campaign because at SMB scale most accounts
// run 1-2 campaigns total.
interface TierInputs {
    googleAdsConnected: boolean
    metaConnected: boolean
    spend90dIls: number               // sum across all paid platforms
    conv90d: number                   // sum
    conv30d: number
    daysSinceLastSpend: number | null
    trackingHealthy: boolean          // GA4 + ≥1 conversion firing + EC if Google Ads
    /** Phase 4.1 — true if we have ingested rows even without OAuth (manual-mode warm). */
    hasIngestedHistory?: boolean
}
function classifyTier(i: TierInputs): { tier: PaidTier; rationaleHe: string; rationale: string } {
    const hasAnyPaidAccount = i.googleAdsConnected || i.metaConnected
    // Phase 4.1 — "manual mode warm start". If the user uploaded historical
    // reports (so we have real spend/conversions in ingested_data_points)
    // but never connected OAuth, we still know enough to tier them. Their
    // active-account signal is the ingestion data itself.
    const hasManualWarmSignal = !hasAnyPaidAccount && i.hasIngestedHistory === true && i.spend90dIls > 0
    if (!hasAnyPaidAccount && !hasManualWarmSignal) {
        return {
            tier: 'T0',
            rationale: 'No paid ad account connected and no ingested historical data. True cold start.',
            rationaleHe: 'אין חשבון פרסום מחובר ואין נתונים היסטוריים שהועלו. cold start מוחלט.',
        }
    }
    if (i.spend90dIls === 0 && !hasManualWarmSignal) {
        return {
            tier: 'T0',
            rationale: 'No paid ad account connected or zero spend in last 90 days. True cold start.',
            rationaleHe: 'אין חשבון פרסום מחובר או אפס הוצאה ב-90 הימים האחרונים. cold start מוחלט.',
        }
    }
    if (i.daysSinceLastSpend !== null && i.daysSinceLastSpend > 90 && i.conv30d < 30) {
        return {
            tier: 'T3',
            rationale: `Account inactive >90 days (last spend ${i.daysSinceLastSpend}d ago) but historical data exists. Zombie state — restart posture required, not optimization.`,
            rationaleHe: `החשבון לא פעיל מעל 90 ימים (הוצאה אחרונה לפני ${i.daysSinceLastSpend} ימים) אך יש היסטוריה. מצב "zombie" — נדרשת חזרה לפוסטור cold-start עם learning מחדש, לא אופטימיזציה.`,
        }
    }
    if (i.conv30d < 10) {
        return {
            tier: 'T1',
            rationale: `Account active but data-thin (${i.conv30d} conv/30d). Smart Bidding cannot stabilize below 15 conv/30d.`,
            rationaleHe: `החשבון פעיל אך ${i.conv30d} המרות ב-30 ימים אחרונים בלבד. Smart Bidding לא יוכל להתייצב מתחת ל-15. נשארים על Max Clicks ואוספים סיגנל.`,
        }
    }
    if (i.conv30d < 30) {
        return {
            tier: 'T2',
            rationale: `Warming up (${i.conv30d} conv/30d). Eligible for Max Conversions; tCPA needs ≥30 stable for 14d.`,
            rationaleHe: `במצב התחממות (${i.conv30d} המרות ב-30 ימים). זכאי ל-Maximize Conversions; tCPA דורש ≥30 יציבות במשך 14 ימים.`,
        }
    }
    if (i.trackingHealthy) {
        return {
            tier: 'T4',
            rationale: `Mature account: ${i.conv30d} conv/30d AND tracking infrastructure healthy. Optimization mode unlocked: tCPA stable, tROAS possible with value-based tracking.`,
            rationaleHe: `חשבון בוגר: ${i.conv30d} המרות ב-30 ימים + תשתית מעקב תקינה. מצב אופטימיזציה: tCPA יציב, tROAS אפשרי עם value-based tracking.`,
        }
    }
    return {
        tier: 'T2',
        rationale: `${i.conv30d} conv/30d but tracking infrastructure incomplete (no Enhanced Conversions / no Consent v2 / no GA4 link). Smart Bidding will optimize on noisy signal — degraded mode.`,
        rationaleHe: `${i.conv30d} המרות ב-30 ימים, אך תשתית המעקב לא מלאה (אין Enhanced Conversions / Consent v2 / קישור GA4). Smart Bidding יאמן על סיגנל רועש — מצב מוגבל.`,
    }
}

// ─── Capability matrix ─────────────────────────────────────────────────────
// Maps tier × tracking-infrastructure to allowed bidding/audience capabilities.
// Reference: 2026 deep-dive — bidding ladder transitions Max Clicks → Max Conv
// → tCPA → tROAS at 15 / 30 / 50 conv/30d thresholds.
interface CapabilityInputs {
    tier: PaidTier
    enhancedConversionsActive: boolean
    consentModeAdvanced: boolean
    metaCapiActive: boolean
    customerMatchSeedAvailable: number   // count of hashed users available
    valueBasedTrackingReady: boolean
    callTrackingReady: boolean
    phoneCallsRelevant: boolean
}
function deriveCapabilities(i: CapabilityInputs): { available: PaidCapability[]; blocked: CapabilityBlockedReason[] } {
    const available: PaidCapability[] = ['max_clicks']   // always available
    const blocked: CapabilityBlockedReason[] = []

    // Max Conversions: needs ≥15 conv/30d (i.e. tier ≥ T2 OR with cross-account modeling — we're cautious)
    if (i.tier === 'T2' || i.tier === 'T4') {
        available.push('max_conversions')
    } else if (i.tier === 'T1' || i.tier === 'T3') {
        blocked.push({
            capability: 'max_conversions',
            reason: 'Needs ≥15 conv/30d signal density',
            reasonHe: 'דורש ≥15 המרות ב-30 ימים',
            unlocksWhen: 'Accumulate 15+ conversions over 30 days on Max Clicks',
        })
    } else {
        blocked.push({
            capability: 'max_conversions',
            reason: 'No paid account connected',
            reasonHe: 'אין חשבון פרסום מחובר',
            unlocksWhen: 'Connect Google Ads or Meta + spend until 15 conv/30d',
        })
    }

    // tCPA: needs ≥30 conv/30d stable for 14 days (proxy: T4)
    if (i.tier === 'T4') {
        available.push('target_cpa')
    } else {
        blocked.push({
            capability: 'target_cpa',
            reason: 'Needs ≥30 conv/30d stable for 14 days',
            reasonHe: 'דורש ≥30 המרות ב-30 ימים יציבות למשך 14 ימים',
            unlocksWhen: 'Reach 30+ conversions over 30 days AND complete tracking infrastructure',
        })
    }

    // tROAS: needs ≥50 conv/30d + value-based tracking
    if (i.tier === 'T4' && i.valueBasedTrackingReady) {
        available.push('target_roas')
    } else {
        blocked.push({
            capability: 'target_roas',
            reason: 'Needs ≥50 conv/30d AND value-based conversion tracking (LTV pipeline)',
            reasonHe: 'דורש ≥50 המרות ב-30 ימים + מעקב המרות מבוסס-ערך (LTV pipeline)',
            unlocksWhen: 'Reach 50+ conversions over 30 days + upload conversion values per OCI',
        })
    }

    // Enhanced Conversions
    if (i.enhancedConversionsActive) {
        available.push('enhanced_conversions_web', 'enhanced_conversions_leads')
    } else {
        blocked.push({
            capability: 'enhanced_conversions_web',
            reason: 'Not enabled in Google Ads conversion action',
            reasonHe: 'לא מופעל בפעולת ההמרה ב-Google Ads',
            unlocksWhen: 'Enable in Goals → Conversions → [action] → Enhanced conversions',
        })
    }

    // Offline Conversion Import (OCI)
    if (i.tier !== 'T0') {
        // OCI is always technically available if Google Ads connected — but useful only with GCLID capture
        available.push('offline_conversion_import')
    }

    // Meta CAPI
    if (i.metaCapiActive) {
        available.push('meta_capi')
    } else {
        blocked.push({
            capability: 'meta_capi',
            reason: 'CAPI not configured for Meta ad account',
            reasonHe: 'CAPI לא מוגדר עבור חשבון Meta',
            unlocksWhen: 'Connect via Events Manager (one-click) or implement custom server endpoint',
        })
    }

    // Meta Advantage+ Audience — needs Pixel + CAPI working
    if (i.metaCapiActive) {
        available.push('meta_advantage_plus_audience')
    } else {
        blocked.push({
            capability: 'meta_advantage_plus_audience',
            reason: 'Advantage+ requires Pixel + CAPI signals to learn',
            reasonHe: 'Advantage+ דורש סיגנלים מ-Pixel + CAPI כדי ללמוד',
            unlocksWhen: 'Activate Meta CAPI',
        })
    }

    // Customer Match (Dec 2024: 100-user minimum across all networks)
    if (i.customerMatchSeedAvailable >= 100) {
        available.push('customer_match_targeting', 'customer_match_exclusion')
    } else if (i.customerMatchSeedAvailable > 0) {
        // exclusion-only at any size
        available.push('customer_match_exclusion')
        blocked.push({
            capability: 'customer_match_targeting',
            reason: `Need 100+ matched users; currently ${i.customerMatchSeedAvailable}`,
            reasonHe: `נדרשים 100+ משתמשים מותאמים; נכון לעכשיו ${i.customerMatchSeedAvailable}`,
            unlocksWhen: 'Accumulate 100+ customers via lead forms / CRM connection',
        })
    } else {
        blocked.push({
            capability: 'customer_match_exclusion',
            reason: 'No Customer Match seed available (no CRM connected, no historical customers uploaded)',
            reasonHe: 'אין seed ל-Customer Match (אין CRM מחובר, אין לקוחות היסטוריים)',
            unlocksWhen: 'Connect CRM OR upload historical customers list',
        })
    }

    // PMax (gated on audience signals + at least Max Conv tier)
    if (i.tier === 'T4' && i.customerMatchSeedAvailable >= 100) {
        available.push('pmax_with_audience_signals')
    } else if (i.tier === 'T2' || i.tier === 'T4') {
        available.push('pmax_basic')
        blocked.push({
            capability: 'pmax_with_audience_signals',
            reason: 'PMax with audience signals needs Customer Match ≥100 users',
            reasonHe: 'PMax עם audience signals דורש Customer Match ≥100',
            unlocksWhen: 'Reach 100+ Customer Match seed',
        })
    }

    // Value-based bidding requires LTV pipeline
    if (i.valueBasedTrackingReady && i.tier === 'T4') {
        available.push('value_based_bidding')
    } else {
        blocked.push({
            capability: 'value_based_bidding',
            reason: 'Needs LTV-per-conversion uploaded via OCI adjustments',
            reasonHe: 'דורש העלאת LTV per conversion דרך OCI adjustments',
            unlocksWhen: 'Build CRM → ETL → Google Ads conversionAdjustments pipeline',
        })
    }

    return { available, blocked }
}

// ─── Helper: detect adapters from existing data sources ────────────────────
// Phase 2026.02 — accepts optional agentId. When provided, scopes integrations
// to that agent only (matters for multi-agent VPS where secondary agents have
// their own OAuth tokens). Falls back to instance-wide when null (legacy).
async function readAgentIntegrations(
    instanceId: string,
    agentId?: string | null,
): Promise<Map<string, { config: Record<string, unknown>; status: string; updatedAt: Date }>> {
    const baseWhere = agentId
        ? and(eq(agentIntegrations.instanceId, instanceId), eq(agentIntegrations.agentId, agentId))
        : eq(agentIntegrations.instanceId, instanceId)
    const rows = await db.select().from(agentIntegrations).where(baseWhere)
    const map = new Map<string, { config: Record<string, unknown>; status: string; updatedAt: Date }>()
    for (const r of rows) {
        const key = String(r.integrationType)
        // Keep most recent per type
        if (!map.has(key) || (map.get(key)!.updatedAt < r.updatedAt)) {
            map.set(key, {
                config: (r.config as Record<string, unknown>) || {},
                status: String(r.status),
                updatedAt: r.updatedAt,
            })
        }
    }
    return map
}

// ─── Main entry ────────────────────────────────────────────────────────────
// Phase 2026.02 — agentId parameter is now REQUIRED in practice for
// multi-agent VPS (primary agent's data leaks into secondary's inventory
// otherwise). Stage controllers pass the active agent's id. When omitted,
// falls back to primary for backward compat with legacy callers (cron jobs).
export async function runPaidDataInventory(
    instanceId: string,
    agentId?: string | null,
): Promise<PaidDataInventory> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const { resolvePrimaryAgent, resolveAgentById, readResearchData } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    if (!agent && agentId) {
        throw new Error(`paidDataInventory: agent ${agentId} not found for instance ${instanceId}`)
    }
    const rd: any = await readResearchData(agent, instanceId) || {}
    const pp: any = rd.paidProfile || {}
    const answers: any = rd.answers || {}

    // Phase 2026.02 — read fork extras (playbook §6.1). User-explicit choice
    // overrides any heuristic-based tier classification: if user picked
    // "no_history" they get T0 regardless of API spend signals (Garbage
    // historical ingestion ≠ active state). If they picked "has_history"
    // but only have CSV data (no live OAuth), the tier must NOT drop to T0
    // even if Layer-1 ingestion is empty during the window between fork
    // commit and CSV ingest completion.
    const fork = (rd?.results?.paid_setup_fork?.extras || {}) as {
        path?: 'has_history' | 'no_history'
        has_integration?: boolean
        chosen_by_user?: boolean
    }
    const forkPath = fork.path || null
    const forkHasIntegration = !!fork.has_integration
    // CSV-source flag set when user is on Path B-2 (has_history but no OAuth).
    // We infer it here from fork extras until paid_csv_ingest writes its own
    // source field (Block 1D). The inference: has_history && !has_integration.
    const forkUsesCsv = forkPath === 'has_history' && !forkHasIntegration

    const integrations = await readAgentIntegrations(instanceId, agent?.id || null)

    // Detect each adapter from one or more sources, in priority order.
    const adapters: AdapterStatus[] = []

    // Google Ads — primary signal: instance.googleAdsConfig.customerId OR
    // agent_integrations row of type 'google' with adwords scope.
    const adsCfg: any = inst.googleAdsConfig || {}
    const googleInt = integrations.get('google')
    const googleAdsConnected = !!adsCfg.customerId || !!(googleInt && Array.isArray(googleInt.config.scopes)
        && (googleInt.config.scopes as string[]).some((s: string) => /adwords|\/ads/i.test(s)))
    adapters.push({
        id: 'google_ads',
        label: 'Google Ads',
        severity: 'critical',
        connected: googleAdsConnected,
        source: adsCfg.customerId ? 'instance_field' : (googleInt ? 'agent_integrations' : null),
        connectedAt: googleInt?.updatedAt ? googleInt.updatedAt.toISOString() : adsCfg.connectedAt || undefined,
        metadata: {
            customerId: adsCfg.customerId || null,
            developerTokenPresent: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        },
    })

    // GA4 — agent_integrations type 'google' with analytics.readonly scope
    const ga4Connected = !!(googleInt && Array.isArray(googleInt.config.scopes)
        && (googleInt.config.scopes as string[]).some((s: string) => /analytics/i.test(s)))
    adapters.push({
        id: 'ga4',
        label: 'Google Analytics 4',
        severity: 'critical',
        connected: ga4Connected,
        source: googleInt ? 'agent_integrations' : null,
        metadata: {
            propertyId: (googleInt?.config.ga4PropertyId as string) || null,
        },
    })

    // GTM — Tag Manager scope
    const gtmConnected = !!(googleInt && Array.isArray(googleInt.config.scopes)
        && (googleInt.config.scopes as string[]).some((s: string) => /tagmanager/i.test(s)))
    adapters.push({
        id: 'gtm',
        label: 'Google Tag Manager',
        severity: 'critical',
        connected: gtmConnected,
        source: googleInt ? 'agent_integrations' : null,
    })

    // sGTM — server-side; clients own and bring their own (D2 directive).
    // We detect via paidProfile.trackingStack.sgtmEndpoint or future explicit
    // integration_type 'sgtm'. For V1 — just check paidProfile flag.
    const sgtmConfigured = !!(pp?.trackingStack?.sgtmEndpoint)
    adapters.push({
        id: 'sgtm',
        label: 'Server-side GTM (אופציונלי, אם הלקוח החזיק)',
        severity: 'advanced',
        connected: sgtmConfigured,
        source: sgtmConfigured ? 'paid_profile' : null,
        metadata: pp?.trackingStack?.sgtmEndpoint ? { endpoint: pp.trackingStack.sgtmEndpoint } : undefined,
    })

    // Meta Ads — mateh_agents.meta_tokens OR agent_integrations type 'meta'
    const metaInt = integrations.get('meta')
    const metaTokens: any = (agent as { metaTokens?: unknown } | null)?.metaTokens
    const metaConnected = !!metaTokens || (!!metaInt && metaInt.status === 'connected')
    adapters.push({
        id: 'meta_ads',
        label: 'Meta Business (Facebook + Instagram Ads)',
        severity: 'critical',
        connected: metaConnected,
        source: metaTokens ? 'instance_field' : (metaInt ? 'agent_integrations' : null),
        metadata: {
            adAccountId: (metaInt?.config.adAccountId as string) || (metaTokens?.adAccountId as string) || null,
            pixelId: (metaInt?.config.pixelId as string) || null,
            capiTokenPresent: !!(metaInt?.config.capiToken || metaTokens?.capiToken),
        },
    })

    // Microsoft Ads (Bing) — placeholder
    adapters.push({
        id: 'microsoft_ads',
        label: 'Microsoft Ads (Bing)',
        severity: 'advanced',
        connected: !!integrations.get('microsoft'),
        source: integrations.get('microsoft') ? 'agent_integrations' : null,
    })

    // GSC — Search Console
    const gscInt = integrations.get('gsc')
    adapters.push({
        id: 'gsc',
        label: 'Google Search Console',
        severity: 'recommended',
        connected: !!gscInt,
        source: gscInt ? 'agent_integrations' : null,
    })

    // Call tracking — paidProfile.trackingStack.callTracking + provider config
    const callProvider = pp?.trackingStack?.callTracking || 'unknown'
    const callConnected = callProvider !== 'none' && callProvider !== 'unknown'
        && !!(inst as any).callTrackingConfig?.apiKey
    adapters.push({
        id: 'call_tracking',
        label: pp?.trackingStack?.phoneCallsRelevant
            ? 'מעקב שיחות (CallRail / WhatConverts) — קריטי כי שיחות = לידים'
            : 'מעקב שיחות (אופציונלי — שיחות לא מהוות ליד עיקרי)',
        severity: pp?.trackingStack?.phoneCallsRelevant ? 'critical' : 'advanced',
        connected: callConnected,
        source: callConnected ? 'instance_field' : null,
        metadata: { provider: callProvider },
    })

    // CRM — placeholder for future
    adapters.push({
        id: 'crm',
        label: 'CRM (HubSpot / Salesforce / Pipedrive — לידים + סגירות)',
        severity: 'recommended',
        connected: false,    // not yet implemented
        source: null,
    })

    // Email platform — placeholder
    adapters.push({
        id: 'email_platform',
        label: 'פלטפורמת אימייל (Mailchimp / Klaviyo / ActiveCampaign)',
        severity: 'advanced',
        connected: false,
        source: null,
    })

    // Payment processor — detect from Meta/Google/AllPay/Pelecard/Cardcom
    const pmHints: string[] = []
    if ((answers.conversionMechanism || '').toLowerCase().includes('pelecard')) pmHints.push('pelecard')
    if ((answers.conversionMechanism || '').toLowerCase().includes('cardcom')) pmHints.push('cardcom')
    if ((answers.conversionMechanism || '').toLowerCase().includes('tranzilla')) pmHints.push('tranzilla')
    adapters.push({
        id: 'payment_processor',
        label: 'מערכת תשלום (Pelecard / Cardcom / Tranzilla / Stripe / PayPal)',
        severity: pmHints.length > 0 ? 'critical' : 'advanced',
        connected: false,    // server-side conversion webhook not yet implemented for any
        source: null,
        metadata: { detected: pmHints },
    })

    // Historical reports upload
    const reportsCount = Array.isArray(pp?.historicalReports) ? pp.historicalReports.length : 0
    adapters.push({
        id: 'historical_reports',
        label: 'דוחות היסטוריים (PDF/CSV מ-Google Ads / Meta)',
        severity: 'recommended',
        connected: reportsCount > 0,
        source: reportsCount > 0 ? 'paid_profile' : null,
        metadata: { count: reportsCount },
    })

    // ─── Tier inputs — read from Layer-1 ingestion if available, else stub.
    // Phase 4.1 hardening: tier classification is now PER-PLATFORM.
    // Meta 7d-click+1d-view conversions and Google 30d-data-driven conversions
    // are not the same kind of conversion — adding them double-counts. So we
    // tier each platform separately and the final account tier = max tier
    // achievable on ANY connected platform (matches Smart Bidding reality:
    // each platform's algorithm trains on its own data).
    let aggregate90dSpend = 0
    let aggregateConv90d = 0
    let aggregateConv30d = 0
    let daysSinceLastSpend: number | null = null
    let hasIngestedHistory = false
    let dominantPlatform: string | null = null
    let perPlatformTiers: Array<{ platform: string; tier: PaidTier; spend90: number; conv30: number }> = []
    try {
        const { aggregateForTier } = await import('./dataIngestion/aggregate')
        const agg = await aggregateForTier(instanceId)
        aggregate90dSpend = agg.spend90dIls
        aggregateConv90d = agg.conv90d
        aggregateConv30d = agg.conv30d
        daysSinceLastSpend = agg.daysSinceLastSpend
        hasIngestedHistory = agg.rowsCount > 0
        dominantPlatform = agg.dominantPlatform

        // Per-platform tier: each platform tier-classified on ITS OWN conv/spend.
        // To get per-platform 30d conv we need a second call — but aggregateForTier
        // already returned 90d per-platform. For 30d we approximate by scaling:
        // since rows include daily-grain and the aggregator already prorates
        // across periods, conv90d/3 is a reasonable proxy for conv30d-per-platform
        // when we don't have a separate per-platform 30d aggregate. We could
        // add aggregateForTierPerPlatform30d() later if precision matters.
        perPlatformTiers = agg.byPlatform.map(p => {
            const platformConv30d = Math.round(p.conversions / 3)
            const tierForPlatform = classifyTier({
                googleAdsConnected: p.platform === 'google_ads',
                metaConnected: p.platform === 'meta',
                spend90dIls: p.spendIls,
                conv90d: p.conversions,
                conv30d: platformConv30d,
                daysSinceLastSpend,
                trackingHealthy: googleAdsConnected && ga4Connected && gtmConnected,
                hasIngestedHistory: true,
            }).tier
            return { platform: p.platform, tier: tierForPlatform, spend90: p.spendIls, conv30: platformConv30d }
        })
    } catch (err) {
        // Aggregation failure shouldn't break inventory. Fall back to historical-notes parse.
        console.warn('[paidDataInventory] ingestion aggregate failed:', (err as Error).message)
    }
    // Legacy fallback: paidProfile.historicalNotes free-text hints (kept so we
    // don't regress instances pre-dating Layer-1 ingestion).
    if (aggregate90dSpend === 0 && aggregateConv90d === 0) {
        const histNotes = String(pp?.historicalNotes || '')
        const spendMatch = histNotes.match(/spend[^\d]*([\d,]+)/i)
        const convMatch = histNotes.match(/conv(?:ersions)?[^\d]*([\d,]+)/i)
        if (spendMatch) aggregate90dSpend = parseInt(spendMatch[1].replace(/,/g, ''), 10) || 0
        if (convMatch) aggregateConv90d = parseInt(convMatch[1].replace(/,/g, ''), 10) || 0
        aggregateConv30d = Math.round(aggregateConv90d / 3)
    }
    const trackingHealthy = googleAdsConnected && ga4Connected && gtmConnected

    // Final tier = max tier achievable on any platform with real data.
    // If no platform-level data, fall back to the legacy aggregated path
    // (so instances pre-dating Phase 4.1 still classify sensibly).
    let tierInfo: ReturnType<typeof classifyTier>
    if (perPlatformTiers.length > 0) {
        const tierRank = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as const
        const best = perPlatformTiers.reduce((max, p) =>
            tierRank[p.tier] > tierRank[max.tier] ? p : max,
            perPlatformTiers[0])
        // Re-run classifyTier on the best platform's numbers so the rationale
        // text reflects that platform specifically.
        tierInfo = classifyTier({
            googleAdsConnected: best.platform === 'google_ads',
            metaConnected: best.platform === 'meta',
            spend90dIls: best.spend90,
            conv90d: best.spend90 > 0 ? Math.max(best.conv30 * 3, aggregateConv90d) : 0,
            conv30d: best.conv30,
            daysSinceLastSpend,
            trackingHealthy,
            hasIngestedHistory: true,
        })
    } else {
        tierInfo = classifyTier({
            googleAdsConnected, metaConnected,
            spend90dIls: aggregate90dSpend, conv90d: aggregateConv90d, conv30d: aggregateConv30d,
            daysSinceLastSpend, trackingHealthy, hasIngestedHistory,
        })
    }

    // Phase 2026.02 — fork-aware overrides (playbook §6.1).
    // The fork was committed by the user with an explicit click; that beats
    // any heuristic. Soft validator entries persist so downstream stages
    // and the UI can flag legitimate mismatches.
    const tierWarnings: string[] = []
    const tierRank = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as const
    if (forkPath === 'no_history' && tierInfo.tier !== 'T0') {
        tierWarnings.push(
            `fork_override: user chose no_history but heuristic returned ${tierInfo.tier} ` +
            `(spend90d=${aggregate90dSpend}, conv30d=${aggregateConv30d}). ` +
            `Forcing T0 per playbook §6.1 (explicit user choice wins).`,
        )
        tierInfo = {
            tier: 'T0',
            rationale: `User explicitly chose "no_history" path in paid_setup_fork. ` +
                `Treating as cold start regardless of any residual ingestion data.`,
            rationaleHe: 'הלקוח בחר במפורש במסלול "מתחילים מאפס" (paid_setup_fork). ' +
                'תייגנו כ-T0 (cold start) ללא תלות בנתונים היסטוריים שעלולים להיוותר במערכת.',
        }
    } else if (forkUsesCsv && tierRank[tierInfo.tier] < tierRank.T2) {
        // Path B-2: user confirmed history exists but only via CSV. paid_csv_ingest
        // (Block 1D) will fill ingested_data_points; until then the tier can read
        // empty and drop to T0/T1, which contradicts the user's stated history.
        // Bump to T2 with a source_note so downstream knows it's a provisional tier.
        tierWarnings.push(
            `fork_override: user chose has_history without OAuth (CSV path). ` +
            `Heuristic returned ${tierInfo.tier} (likely paid_csv_ingest hasn't ` +
            `populated yet). Bumping to T2 provisionally per playbook §6.1.`,
        )
        tierInfo = {
            tier: 'T2',
            rationale: `User confirmed paid history via fork (has_history, CSV ingest path). ` +
                `Provisional T2 — re-classify after paid_csv_ingest completes and ` +
                `aggregate90dSpend/aggregateConv30d reflect uploaded reports.`,
            rationaleHe: 'הלקוח אישר היסטוריה דרך paid_setup_fork (מסלול CSV). ' +
                'tier זמני T2 — סיווג מחדש לאחר paid_csv_ingest ועדכון aggregateSpend/Conv.',
        }
    }

    // ─── Capabilities matrix ────────────────────────────────────────────────
    const enhancedConversionsActive = false  // V1: not yet detectable without Google Ads API call
    const consentModeAdvanced = false        // V1: detect via GTM scan in Phase B
    const metaCapiActive = !!(metaInt?.config.capiToken)
    const customerMatchSeedAvailable = 0     // V1: CRM not connected yet → 0
    const valueBasedTrackingReady = false
    const callTrackingReady = callConnected

    const capabilities = deriveCapabilities({
        tier: tierInfo.tier,
        enhancedConversionsActive,
        consentModeAdvanced,
        metaCapiActive,
        customerMatchSeedAvailable,
        valueBasedTrackingReady,
        callTrackingReady,
        phoneCallsRelevant: !!pp?.trackingStack?.phoneCallsRelevant,
    })

    // ─── Action roadmap ─────────────────────────────────────────────────────
    // For each missing adapter / disabled capability, generate an executable
    // action with severity + owner + estimated time + verification.
    const actions: InventoryAction[] = []

    // Tier T0 → must connect at least one paid platform
    if (!googleAdsConnected && !metaConnected) {
        actions.push({
            actionId: 'connect_google_ads_or_meta',
            title: 'Connect Google Ads or Meta ad account',
            titleHe: 'חברו חשבון Google Ads או Meta',
            severity: 'critical',
            owner: 'user',
            estimatedMinutes: 5,
            rationale: 'No paid ad account = no execution path. Pick at least one to start.',
            rationaleHe: 'אין חשבון פרסום מחובר — אי אפשר להפעיל קמפיינים. בחרו לפחות אחד להתחיל.',
            unlocksCapabilities: ['max_clicks', 'max_conversions'],
        })
    }
    if (!ga4Connected) {
        actions.push({
            actionId: 'connect_ga4',
            title: 'Connect Google Analytics 4',
            titleHe: 'חברו Google Analytics 4',
            severity: 'critical',
            owner: 'user',
            estimatedMinutes: 5,
            rationale: 'GA4 + conversion event firing is the minimum for Smart Bidding to work mathematically. Without it, every shekel of paid budget is optimization on a missing signal.',
            rationaleHe: 'GA4 + אירוע המרה פעיל = מינימום מתמטי כדי ש-Smart Bidding יעבוד. בלי זה — כל שקל בתקציב הוא אופטימיזציה על סיגנל ריק.',
            unlocksCapabilities: ['max_conversions', 'target_cpa'],
            verification: { method: 'manual_test_event', criteria: 'Real-time event seen in GA4 within 60 seconds' },
        })
    }
    if (!gtmConnected) {
        actions.push({
            actionId: 'connect_gtm',
            title: 'Connect Google Tag Manager',
            titleHe: 'חברו Google Tag Manager',
            severity: 'critical',
            owner: 'user',
            estimatedMinutes: 10,
            rationale: 'GTM allows the platform to auto-install Google Ads conversion pixels, Consent Mode v2, and Enhanced Conversions without manual tag editing.',
            rationaleHe: 'GTM מאפשר לפלטפורמה להתקין אוטומטית פיקסל המרה של Google Ads, Consent Mode v2 ו-Enhanced Conversions בלי עריכת תגים ידנית.',
            unlocksCapabilities: ['enhanced_conversions_web', 'enhanced_conversions_leads'],
        })
    }
    if (googleAdsConnected && !enhancedConversionsActive) {
        actions.push({
            actionId: 'enable_enhanced_conversions',
            title: 'Enable Enhanced Conversions for Web',
            titleHe: 'הפעילו Enhanced Conversions for Web',
            severity: 'recommended',
            owner: 'platform_auto',
            estimatedMinutes: 5,
            rationale: 'Recovers 20-30% of conversions blocked by ITP + Consent rejection. Target match rate ≥30% within 14 days.',
            rationaleHe: 'משחזר 20-30% מההמרות שנחסמות על ידי ITP + סירוב Consent. יעד match rate ≥30% תוך 14 יום.',
            unlocksCapabilities: ['enhanced_conversions_web', 'enhanced_conversions_leads'],
            verification: { method: 'ec_diagnostics_check', criteria: 'match_rate ≥ 30%' },
        })
    }
    if (metaConnected && !metaCapiActive) {
        actions.push({
            actionId: 'activate_meta_capi',
            title: 'Activate Meta Conversions API (CAPI)',
            titleHe: 'הפעילו Meta Conversions API (CAPI)',
            severity: 'recommended',
            owner: 'user_action_required',
            estimatedMinutes: 15,
            rationale: 'Without CAPI, Meta sees only 30-50% of conversions on iOS users. With CAPI: -17.8% cost per result, 70-90% attribution coverage.',
            rationaleHe: 'בלי CAPI, Meta רואה רק 30-50% מההמרות במשתמשי iOS. עם CAPI: -17.8% עלות לתוצאה, 70-90% כיסוי attribution.',
            unlocksCapabilities: ['meta_capi', 'meta_advantage_plus_audience'],
            verification: { method: 'emq_check', criteria: 'Event Match Quality ≥ 6.0' },
        })
    }
    if (pp?.trackingStack?.phoneCallsRelevant && !callConnected) {
        actions.push({
            actionId: 'setup_call_tracking',
            title: 'Set up phone call tracking with GCLID capture',
            titleHe: 'הקימו מעקב שיחות עם capture של GCLID',
            severity: 'critical',
            owner: 'user_action_required',
            estimatedMinutes: 60,
            costRecurringIls: 150,
            rationale: 'Phone is your primary conversion channel. Without call tracking + GCLID capture, Smart Bidding is trained on half the conversion signal — algo guesses on under-data.',
            rationaleHe: 'טלפון = ערוץ המרה ראשי. בלי call tracking + GCLID, Smart Bidding מאומן על מחצית הסיגנל בלבד — האלגוריתם מנחש על under-data.',
            unlocksCapabilities: ['offline_conversion_import'],
            verification: { method: 'test_call_with_gclid', criteria: 'GCLID captured + call ≥60s = conversion in Google Ads' },
        })
    }
    if (customerMatchSeedAvailable === 0) {
        actions.push({
            actionId: 'connect_crm_or_upload_customers',
            title: 'Connect CRM or upload existing customers list (≥300 rows)',
            titleHe: 'חברו CRM או העלו רשימת לקוחות קיימים (≥300 רשומות)',
            severity: 'recommended',
            owner: 'user_action_required',
            estimatedMinutes: 30,
            rationale: 'Customer Match needs ≥100 matched users to activate audiences (Dec 2024 minimum). Practical floor: 300 raw rows to clear 100 matched at 30-50% match rate. Critical for exclusion (saves 15-25% of paid budget by not retargeting existing customers).',
            rationaleHe: 'Customer Match דורש ≥100 משתמשים מותאמים כדי להפעיל קהלים (מינימום דצמבר 2024). רצפה מעשית: 300 שורות גולמיות כדי לעבור 100 מותאמים ב-30-50% match. קריטי לשלילה (חוסך 15-25% מהתקציב על-ידי אי-targeting לקוחות קיימים).',
            unlocksCapabilities: ['customer_match_targeting', 'customer_match_exclusion', 'pmax_with_audience_signals'],
        })
    }
    if (reportsCount === 0 && (googleAdsConnected || metaConnected)) {
        actions.push({
            actionId: 'upload_historical_reports',
            title: 'Upload historical campaign reports (PDF/CSV)',
            titleHe: 'העלו דוחות קמפיינים היסטוריים (PDF/CSV)',
            severity: 'recommended',
            owner: 'user',
            estimatedMinutes: 10,
            rationale: 'Historical performance data lets us calibrate tCPA targets to your actual numbers instead of industry priors. We parse PDFs via Vision automatically.',
            rationaleHe: 'נתוני ביצועים היסטוריים מאפשרים לנו לכייל יעדי tCPA לפי המספרים האמיתיים שלכם במקום industry priors. אנחנו מפענחים PDFs דרך Vision אוטומטית.',
            unlocksCapabilities: [],
        })
    }

    // ─── Summary ────────────────────────────────────────────────────────────
    const criticalGaps = actions.filter(a => a.severity === 'critical').length
    const recommendedGaps = actions.filter(a => a.severity === 'recommended').length
    const advancedGaps = actions.filter(a => a.severity === 'advanced').length
    const setupOneTime = actions.reduce((s, a) => s + (a.costOneTimeIls || 0), 0)
    const setupMonthly = actions.reduce((s, a) => s + (a.costRecurringIls || 0), 0)
    const estimatedDaysToNextTier = tierInfo.tier === 'T4' ? null
        : tierInfo.tier === 'T0' ? 7
            : tierInfo.tier === 'T1' ? 30
                : tierInfo.tier === 'T2' ? 14
                    : 30

    // ── Phase 2026.01 — orthogonal tracking_quality + ASC + attribution checks ──
    const trackingQuality = computeTrackingQuality({ adapters, capabilities, paidProfile: pp, answers })
    const advantagePlusEligibility = computeAdvantagePlusEligibility({ adapters, perPlatform: perPlatformTiers })
    const attributionReadiness = computeAttributionReadiness({ conv30d: aggregateConv30d })

    return {
        instanceId,
        agentId: agent?.id,
        tier: tierInfo.tier,
        tierRationale: tierInfo.rationale,
        tierRationaleHe: tierInfo.rationaleHe,
        generatedAt: new Date().toISOString(),
        // Phase 2026.02 — surface fork awareness for downstream stages.
        tierWarnings: tierWarnings.length > 0 ? tierWarnings : undefined,
        forkPath,
        forkHasIntegration,
        adapters,
        capabilities,
        actions,
        summary: {
            criticalGaps,
            recommendedGaps,
            advancedGaps,
            estimatedDaysToNextTier,
            estimatedSetupCostOneTimeIls: setupOneTime,
            estimatedSetupCostMonthlyIls: setupMonthly,
        },
        perPlatform: perPlatformTiers.length > 0
            ? perPlatformTiers.map(p => ({
                platform: p.platform,
                tier: p.tier,
                spend90dIls: Number(p.spend90.toFixed(2)),
                conv30d: p.conv30,
            }))
            : undefined,
        dominantPlatform: dominantPlatform || undefined,
        trackingQuality,
        advantagePlusEligibility,
        attributionReadiness,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2026.01 — Tracking quality / ASC / Attribution checks
// ────────────────────────────────────────────────────────────────────────────

function computeTrackingQuality(args: {
    adapters: AdapterStatus[]
    capabilities: { available: PaidCapability[]; blocked: CapabilityBlockedReason[] }
    paidProfile: Record<string, unknown>
    answers: Record<string, unknown>
}): NonNullable<PaidDataInventory['trackingQuality']> {
    const { adapters, capabilities, paidProfile } = args
    const adsAdapter = adapters.find(a => a.id === 'google_ads')
    const ga4Adapter = adapters.find(a => a.id === 'ga4')

    // EC match rate — pulled from googleAdsConfig.enhancedConversionsStatus if present
    const ecMatchRate = (adsAdapter?.metadata?.enhancedConversionsMatchRate as number | undefined) ?? null

    // OCI presence — for service businesses ONLY
    const ts = (paidProfile?.trackingStack as { phoneCallsRelevant?: boolean; ociEnabled?: boolean } | undefined) || {}
    const isService = String(paidProfile?.businessKind || '').toLowerCase().includes('service')
        || ts.phoneCallsRelevant === true
    const ociPresent = capabilities.available.includes('enhanced_conversions_for_leads' as PaidCapability)
        || ts.ociEnabled === true
    const oci_present_if_needed = isService ? ociPresent : true

    // Consent Mode v2 — read from paidProfile.consentMode or default unknown
    const consentMode = (paidProfile?.consentMode as 'disabled' | 'basic' | 'advanced' | undefined) || 'unknown'

    // IL currency consistency — best-effort from adapter metadata
    const adsCurrency = (adsAdapter?.metadata?.currency as string | undefined) || null
    const ga4Currency = (ga4Adapter?.metadata?.currency as string | undefined) || null
    const il_currency_consistent = adsCurrency && ga4Currency
        ? (adsCurrency === 'ILS' && ga4Currency === 'ILS')
        : null

    // Hebrew phone compliance — sample customer_match list if available
    const customerMatchSample = (paidProfile?.customerMatchSample as string[] | undefined) || []
    const hebrew_phone_compliance_pct = customerMatchSample.length > 0
        ? Math.round((customerMatchSample.filter(p => /^\+972\d{8,9}$/.test(p.trim())).length / customerMatchSample.length) * 100)
        : null

    // Classify
    const isBroken = (
        (ecMatchRate !== null && ecMatchRate < 50)
        || (isService && !ociPresent)
    )
    const isMature = (
        (ecMatchRate !== null && ecMatchRate >= 70)
        && (oci_present_if_needed)
        && (consentMode !== 'disabled')
        && (hebrew_phone_compliance_pct === null || hebrew_phone_compliance_pct >= 80)
    )
    let status: 'broken' | 'partial' | 'mature'
    let rationaleHe: string
    if (isBroken) {
        status = 'broken'
        rationaleHe = ecMatchRate !== null && ecMatchRate < 50
            ? `Enhanced Conversions match rate נמוך (${ecMatchRate}% < 50%) — 20-40% מהאותות אבודים`
            : 'חסר Offline Conversion Import לעסק שירות — לידים איכותיים לא נספרים'
    } else if (isMature) {
        status = 'mature'
        rationaleHe = 'אותות מלאים — EC ≥70%, OCI ✓, Consent Mode v2 ✓'
    } else {
        status = 'partial'
        rationaleHe = ecMatchRate !== null
            ? `EC match rate ${ecMatchRate}% (50-70%) — מספיק לפעולה אבל לא מקסימלי`
            : 'מצב חלקי — חלק מהאותות הוגדרו, חסר מעט להשלמה'
    }

    return {
        status,
        rationaleHe,
        signals: {
            enhanced_conversions_match_rate_pct: ecMatchRate,
            oci_present_if_needed,
            consent_mode_v2_status: consentMode,
            il_currency_consistent,
            hebrew_phone_compliance_pct,
        },
    }
}

function computeAdvantagePlusEligibility(args: {
    adapters: AdapterStatus[]
    perPlatform: Array<{ platform: string; conv30: number }>
}): NonNullable<PaidDataInventory['advantagePlusEligibility']> {
    const metaAdapter = args.adapters.find(a => a.id === 'meta_ads')
    if (!metaAdapter?.connected) {
        return {
            asc_viable: false,
            meta_purchases_4w: null,
            reason_he: 'Meta Ads לא מחובר — לא ניתן להעריך ASC',
        }
    }
    // Estimate weekly purchases — Meta conv30d / 30 × 7
    const meta = args.perPlatform.find(p => p.platform.toLowerCase().includes('meta'))
    const metaPurchases4w = meta?.conv30 ?? null
    if (metaPurchases4w === null) {
        return {
            asc_viable: false,
            meta_purchases_4w: null,
            reason_he: 'לא נמצאו נתוני רכישה ב-Meta ל-30 הימים האחרונים',
        }
    }
    // ASC threshold: 50 purchases/week = 200/month
    const ascViable = metaPurchases4w >= 200
    return {
        asc_viable: ascViable,
        meta_purchases_4w: metaPurchases4w,
        reason_he: ascViable
            ? `${metaPurchases4w} רכישות ב-30 ימים — מעל סף ASC (200)`
            : `${metaPurchases4w} רכישות ב-30 ימים — מתחת לסף ASC (200). השתמשו ב-Conversion campaigns מסורתיים.`,
    }
}

function computeAttributionReadiness(args: { conv30d: number }): NonNullable<PaidDataInventory['attributionReadiness']> {
    if (args.conv30d >= 300) {
        return { status: 'ready', rationale_he: `${args.conv30d} המרות ב-30 ימים — data-driven attribution מוכן` }
    }
    if (args.conv30d >= 100) {
        return { status: 'thin', rationale_he: `${args.conv30d} המרות ב-30 ימים — DDA אפשרי אבל רעש משמעותי. שקלו last-click כברירת מחדל.` }
    }
    return { status: 'insufficient', rationale_he: `${args.conv30d} המרות ב-30 ימים — לא מספיק ל-DDA. last-click default מומלץ.` }
}