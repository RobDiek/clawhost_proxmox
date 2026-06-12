// Pipeline state accessors with legacy fallback.
//
// Old layout (live in production today):
//   researchData.report                 → research_paid output
//   researchData.stage1..stage5         → research_paid intermediate stages
//   researchData.strategy               → strategy output
//   researchData.scenarios              → strategy.scenarios
//   researchData.mazhirAudit            → mazhir_audit output
//   researchData.mediaPlan              → mazhir_media_plan output
//   researchData.mazhirGtm              → mazhir_gtm_setup output
//   researchData.mazhirConversions      → mazhir_conversions output
//   researchData.mazhirExecutionLog     → mazhir_executor history
//
// New layout:
//   researchData.marketingIntents:        MarketingIntent[]
//   researchData.integrationsState:       Record<string, { connected, connectedAt, ... }>
//   researchData.pipelineState[ns]: { lastRun, runs[], result, version }
//
// All readers/writers go through these accessors. They check NEW path first,
// then fall back to LEGACY paths. Writers ALWAYS write to NEW path. Over time
// (e.g. 30 days), a one-shot migration job can move legacy data into pipelineState.

import type { MarketingIntent } from './intents'
import type { PipelineId } from './pipelines'

export interface IntegrationConnectionRecord {
    connected: boolean
    connectedAt?: string
    disconnectedAt?: string
    scopes?: string[]
    accountInfo?: Record<string, unknown>     // e.g. customerId, gscSiteUrl, etc.
    usedBy?: PipelineId[]                     // which pipelines have read from it
}

export interface PipelineRun {
    runId: string
    startedAt: string
    completedAt?: string
    status: 'running' | 'success' | 'failed' | 'cancelled'
    qualityScore?: number                     // captured at run-time from relevance engine
    integrationsUsed?: string[]
    error?: string
    result?: unknown                          // pipeline-specific payload
}

export interface PipelineNamespace {
    lastRun?: PipelineRun
    runs?: PipelineRun[]                      // historical runs (capped)
    result?: unknown                          // shortcut for current best output
    version?: string                          // schema version of result payload
}

export interface MarketingResearchData {
    // ── New layout ──
    marketingIntents?: MarketingIntent[]
    integrationsState?: Record<string, IntegrationConnectionRecord>
    pipelineState?: Record<string, PipelineNamespace>

    // ── Inputs (always top-level — they drive pipelines) ──
    answers?: Record<string, unknown>         // questionnaire (businessName, etc)
    paidProfile?: Record<string, unknown>
    brandBook?: Record<string, unknown>

    // ── Legacy paths (read-only fallback) ──
    report?: unknown
    stage1?: unknown
    stage2?: unknown
    stage3?: unknown
    stage4?: unknown
    stage5?: unknown
    strategy?: unknown
    strategyStage1?: unknown
    scenarios?: unknown
    chosenScenario?: string
    mazhirAudit?: unknown
    mediaPlan?: unknown
    mazhirGtm?: unknown
    mazhirConversions?: unknown
    mazhirExecutionLog?: unknown[]
    researchAnswers?: unknown                 // Mateh wizard answers

    [key: string]: unknown
}

// Legacy field map — pipeline namespace → (legacy field path within researchData).
// First match wins.
const LEGACY_PATHS: Partial<Record<PipelineId, string[]>> = {
    research_paid:        ['report', 'stage5', 'stage4', 'stage3', 'stage2', 'stage1'],
    strategy:             ['strategy', 'strategyStage1'],
    mazhir_audit:         ['mazhirAudit'],
    mazhir_media_plan:    ['mediaPlan'],
    mazhir_gtm_setup:     ['mazhirGtm'],
    mazhir_conversions:   ['mazhirConversions'],
    mazhir_executor:      ['mazhirExecutionLog'],
}

// Read pipeline result with legacy fallback.
export function readPipelineResult<T = unknown>(
    rd: MarketingResearchData | null | undefined,
    pipelineId: PipelineId
): T | undefined {
    if (!rd) return undefined
    const ns = rd.pipelineState?.[pipelineId]
    if (ns?.result !== undefined) return ns.result as T
    const legacy = LEGACY_PATHS[pipelineId]
    if (legacy) {
        for (const path of legacy) {
            const v = rd[path]
            if (v !== undefined && v !== null) return v as T
        }
    }
    return undefined
}

export function readPipelineRun(
    rd: MarketingResearchData | null | undefined,
    pipelineId: PipelineId
): PipelineRun | undefined {
    return rd?.pipelineState?.[pipelineId]?.lastRun
}

// Has the pipeline ever produced a successful output? Used by gating UI.
export function pipelineHasOutput(
    rd: MarketingResearchData | null | undefined,
    pipelineId: PipelineId
): boolean {
    return readPipelineResult(rd, pipelineId) !== undefined
}

// Build a list of pipeline namespaces that have ANY data — used by autoDerive
// to keep prior intents enabled.
export function pipelineNamespacesWithData(
    rd: MarketingResearchData | null | undefined
): string[] {
    if (!rd) return []
    const result: string[] = []
    if (rd.pipelineState) {
        for (const [ns, val] of Object.entries(rd.pipelineState)) {
            if (val && (val.result !== undefined || (val.runs && val.runs.length > 0))) result.push(ns)
        }
    }
    // Legacy presence
    if (rd.report || rd.stage1) result.push('research_paid')
    if (rd.strategy) result.push('strategy')
    if (rd.mazhirAudit) result.push('mazhir_audit')
    if (rd.mediaPlan) result.push('mazhir_media_plan')
    if (rd.mazhirGtm) result.push('mazhir_gtm_setup')
    if (rd.mazhirConversions) result.push('mazhir_conversions')
    if (rd.mazhirExecutionLog) result.push('mazhir_executor')
    return Array.from(new Set(result))
}

// Producer-side helper: builds a partial pipelineState mutation. Caller merges
// into the DB jsonb. Pure function — no side effects.
export function pipelineStateUpdate(
    pipelineId: PipelineId,
    run: PipelineRun,
    keepHistoryN = 5
): { pipelineState: Record<string, PipelineNamespace> } {
    const ns: PipelineNamespace = {
        lastRun: run,
        runs: run.status === 'success' && run.completedAt ? [run] : [],   // caller may merge with prior history
        result: run.status === 'success' ? run.result : undefined,
        version: 'v1',
    }
    void keepHistoryN
    return { pipelineState: { [pipelineId]: ns } }
}

// Connection record helpers ─────────────────────────────────────────────────
export function readIntegrationConnection(
    rd: MarketingResearchData | null | undefined,
    integrationId: string
): IntegrationConnectionRecord | undefined {
    return rd?.integrationsState?.[integrationId]
}

export function listConnectedIntegrationIds(
    rd: MarketingResearchData | null | undefined
): string[] {
    if (!rd?.integrationsState) return []
    return Object.entries(rd.integrationsState)
        .filter(([, rec]) => rec?.connected)
        .map(([id]) => id)
}

// Integrations that are available WITHOUT an explicit user connection, so they
// must be counted as "connected" even though they never appear in
// integrationsState (which only records integrations the user actively connects):
//   • public no-auth services Flowmatic queries centrally — PageSpeed, Google Ads
//     Transparency, Meta Ad Library ('builtin' auth in the registry).
//   • DataForSEO when the tenant is on the Flowmatic proxy: auto-provisioned for
//     every tenant with a starter balance (dfs_use_proxy=true). Without this it
//     renders as "מומלץ לחיבור" even though it is connected by default.
// NOTE: telegram is also 'builtin' in the registry but genuinely needs a bot
// token, so it is NOT auto-connected here — its status stays token-driven.
export const ALWAYS_ON_INTEGRATION_IDS = ['pagespeed', 'google_ads_transparency', 'meta_ad_library']

export function autoConnectedIntegrationIds(
    inst: { dfsUseProxy?: boolean | null } | null | undefined
): string[] {
    const ids = [...ALWAYS_ON_INTEGRATION_IDS]
    if (inst?.dfsUseProxy) ids.push('dataforseo')
    return ids
}
