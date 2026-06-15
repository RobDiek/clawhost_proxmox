/**
 * Connected-stack resolver — single source of truth for "what can this tenant
 * actually execute right now".
 *
 * Phase 0 (Archetype Strategy Framework) rule #1 — integration-grounding:
 * the monthly-plan generator must never recommend a channel/tool the connected
 * stack can't run (e.g. WordPress steps when only GitHub is connected) and must
 * never say "create a new Google Ads account" when one is already linked.
 *
 * The probing logic used to live, duplicated, inside monthlyPlanReview's
 * gatherIntegrations(). This module centralizes it so the LLM passes
 * (skeleton/detailer), the deterministic fillers, and the post-save review all
 * read the SAME resolved stack — agent-scoped, with an instance-level fallback
 * for agentless tenants (no mateh_agents row, e.g. the dogfood tenant `flow`).
 *
 * Resolution priority for the publish channel: WordPress (live CMS, writable
 * via REST) > GitHub (the registry's WordPress alternative) > none. This matches
 * the marketing registry's `content_publisher requires wordpress|github`.
 */

import type { MatehAgentRow } from './agentContext'
import { readResearchData, readGoogleAdsConfig } from './agentContext'
import { loadWpConfig } from './seoMetaBatch'
import { loadGithubConfig } from './seoGithubBatch'

export type PublishChannel = 'wordpress' | 'github' | 'none'

export interface ConnectedStack {
    /** Live WordPress with writable REST creds (loadWpConfig returns null if unwritable). */
    wordpress: boolean
    /** GitHub repo connected (per-agent config or research_data fallback). */
    github: boolean
    githubRepo?: string
    /** Where content/website/schema changes get authored. */
    publishChannel: PublishChannel
    /** Google Ads ACCOUNT linked (customerId present) — operate inside it, never
     *  "create new". This is what the prompt directive keys on. */
    googleAds: boolean
    /** Google Ads fully EXECUTABLE (customerId + developerToken) — what the review
     *  verdict gates on, since mutations need the developer token too. */
    googleAdsExecutable: boolean
    googleAdsCustomerId?: string
    googleAdsOperatingCustomerId?: string
    googleAdsMode?: string
    gtm: boolean
    ga4: boolean
    meta: boolean
    whatsapp: boolean
    gbp: boolean
    apiKey: boolean
}

/**
 * Resolve the connected stack for an agent (or agentless instance when
 * `agent` is null). Never throws — every probe degrades to `false`/undefined.
 */
export async function resolveConnectedStack(
    agent: MatehAgentRow | null,
    instanceId: string,
): Promise<ConnectedStack> {
    const rd: any = await readResearchData(agent, instanceId).catch(() => ({}))

    // WordPress — only "connected" when REST creds are present & writable.
    const wp = await loadWpConfig(instanceId, agent?.id).catch(() => null)
    const wordpress = !!wp

    // GitHub — canonical resolver: matehAgents.githubConfig → instances.githubConfig
    // (the latter is the agentless-tenant home, e.g. flow). Validates token+repo.
    const gh = await loadGithubConfig(instanceId, agent?.id).catch(() => null)
    const githubRepo: string | undefined = gh?.repo
    const github = !!gh

    // Google Ads — per-agent config (instance-level fallback for agentless/legacy).
    let adsCustomerId: string | undefined
    let adsOperating: string | undefined
    let adsMode: string | undefined
    let adsDevToken = false
    try {
        const { config } = await readGoogleAdsConfig(agent, instanceId)
        adsCustomerId = config?.customerId
        adsOperating = config?.scope?.operatingCustomerId
        adsMode = config?.scope?.mode
        adsDevToken = !!config?.developerToken
    } catch { /* ignore — treated as not connected */ }
    const googleAds = !!adsCustomerId
    const googleAdsExecutable = !!adsCustomerId && adsDevToken

    // Tags / analytics / messaging channels — mirror monthlyPlanReview signals.
    const gtmTarget = (rd as any)?.mazhirGtm?.target || {}
    const gtm = !!gtmTarget.containerId
    const ga4 = !!gtmTarget.measurementId
    const meta = !!((agent as any)?.metaTokens || (rd as any)?.metaConfig?.pixelId)
    const whatsapp = !!((rd as any)?.waConfig?.phoneNumberId || (rd as any)?.integrationsState?.whatsapp?.connected)
    const gbp = !!((rd as any)?.gbpConfig?.locationId || (rd as any)?.integrationsState?.gbp?.connected)

    let apiKey = false
    try {
        const { getApiKeyForInstance } = await import('@/controllers/hosting/agentSetup')
        apiKey = !!(await getApiKeyForInstance(instanceId))
    } catch { apiKey = false }

    const publishChannel: PublishChannel = wordpress ? 'wordpress' : github ? 'github' : 'none'

    return {
        wordpress, github, githubRepo, publishChannel,
        googleAds, googleAdsExecutable, googleAdsCustomerId: adsCustomerId,
        googleAdsOperatingCustomerId: adsOperating, googleAdsMode: adsMode,
        gtm, ga4, meta, whatsapp, gbp, apiKey,
    }
}

/** Maps the stack to the boolean record shape monthlyPlanReview's verdict logic
 *  expects (keys match capability `requires` entries: wordpress|github|google_ads|…). */
export function stackToIntegrationsRecord(stack: ConnectedStack): Record<string, boolean> {
    return {
        wordpress: stack.wordpress,
        github: stack.github,
        // Review verdicts gate on EXECUTABILITY (customerId + developerToken),
        // preserving the pre-refactor gatherIntegrations semantics.
        google_ads: stack.googleAdsExecutable,
        gtm: stack.gtm,
        ga4: stack.ga4,
        meta: stack.meta,
        whatsapp: stack.whatsapp,
        gbp: stack.gbp,
        api_key: stack.apiKey,
    }
}

/**
 * Build the directive block injected into the skeleton + detailer prompts.
 * English (prompt language) with Hebrew prerequisite-task titles, since the
 * model's output must stay Hebrew. Deterministic from the resolved stack.
 */
export function buildConnectedStackDirective(stack: ConnectedStack): string {
    const lines: string[] = []
    lines.push('═══ CONNECTED STACK — GROUND EVERY TASK IN THIS (NON-NEGOTIABLE) ═══')

    if (stack.publishChannel === 'github') {
        lines.push(`Publish channel: GitHub${stack.githubRepo ? ` (repo: ${stack.githubRepo})` : ''}. Author ALL content / website / schema / meta changes as git commits or pull requests to markdown/code (adapter: github_create_pr). This tenant has NO WordPress — DO NOT mention WordPress, WooCommerce, Yoast, RankMath, Elementor, or any CMS plugin in any task title or actionPlan step.`)
    } else if (stack.publishChannel === 'wordpress') {
        lines.push(`Publish channel: WordPress (live CMS, writable via REST). Author content / website / schema changes via the WordPress REST API / SEO plugin (adapter: wordpress_publish_draft).`)
    } else {
        lines.push(`Publish channel: NONE connected. Any content / website / schema task MUST be preceded by a P1 prerequisite task titled "לחבר ערוץ פרסום (WordPress או GitHub)". Do NOT assume a CMS or name any CMS plugin.`)
    }

    if (stack.googleAds) {
        const acct = stack.googleAdsOperatingCustomerId || stack.googleAdsCustomerId
        lines.push(`Google Ads: CONNECTED — operate INSIDE the existing account (customerId ${acct}). NEVER propose "create / open a new Google Ads account" — it already exists. Every paid-search task acts on THIS account.`)
    } else {
        lines.push(`Google Ads: NOT connected — any paid-search task MUST be preceded by a P0 prerequisite titled "לחבר את חשבון Google Ads". Do NOT propose creating campaigns before the account is connected.`)
    }

    lines.push(`Tracking: GTM ${stack.gtm ? 'connected' : 'NOT connected'}, GA4 ${stack.ga4 ? 'connected' : 'NOT connected'}.`)
    lines.push(`Other channels: Meta ${stack.meta ? 'connected' : 'NOT connected'}, WhatsApp ${stack.whatsapp ? 'connected' : 'NOT connected'}, Google Business Profile ${stack.gbp ? 'connected' : 'NOT connected'}.`)
    lines.push('RULES: (1) Never recommend a channel/tool the stack cannot execute. (2) For a MISSING integration a task needs, emit an explicit "לחבר X" prerequisite task instead of assuming it. (3) Implementation steps must match the publish channel above.')

    return lines.join('\n')
}