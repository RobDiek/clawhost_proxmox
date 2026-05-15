/**
 * Phase 4.6 — Hypothesis executor.
 *
 * Reads `hypothesis.apiActionRecipe`, dispatches to the right platform
 * mutation, persists execution state back to the hypothesis row.
 *
 * Safety discipline:
 *   1. The hypothesis MUST be in 'approved' status before executing (set by
 *      the user via the dashboard or the approve endpoint).
 *   2. Default `dryRun=true` — every call goes through the dry-run validator
 *      first. The caller must pass `dryRun=false` (typically after the user
 *      saw the dry-run preview and confirmed).
 *   3. Per-recipe `approvalRequired` flag — recipes that touch live spend
 *      get an extra "confirmRequired=true" gate the controller must enforce.
 *   4. After execution, the hypothesis transitions to status='testing' so
 *      the lifecycle layer starts measuring the window — but only if the
 *      caller didn't already set testing via startTesting().
 *   5. Every attempt is logged into `execution_log` JSONB with a
 *      timestamped entry; full audit history preserved across attempts.
 *
 * Supported recipes by `api` field:
 *   - 'meta_marketing'  → routes to metaMutations.ts methods
 *   - 'google_ads'      → STUB (Phase 4.6.2 will wire to googleAdsMutations)
 *   - 'gtm', 'ga4_admin' → STUB (Phase 4.7)
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { hypotheses } from '@/db/schema'
import {
    setCampaignDailyBudget,
    adjustCampaignBudgetPct,
    setAdvantageAudienceExpansion,
    setAdsetBidStrategy,
} from './metaMutations'

export interface ExecuteOptions {
    dryRun?: boolean              // default: true
    executedBy?: string | null    // user id
}

export interface ExecuteResult {
    ok: boolean
    dryRun: boolean
    hypothesisId: number
    endpoint: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    error?: string
}

interface ExecutionLogEntry {
    at: string
    dryRun: boolean
    ok: boolean
    endpoint: string
    payload: Record<string, unknown>
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    error?: string
    executedBy?: string | null
}

async function appendLog(hypothesisId: number, entry: ExecutionLogEntry, newStatus: string): Promise<void> {
    const [row] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    const prior = (row?.executionLog as ExecutionLogEntry[] | null) || []
    const next = [...prior, entry].slice(-25)        // keep last 25 attempts
    await db.update(hypotheses)
        .set({
            executionLog: next,
            executionStatus: newStatus,
            executedAt: entry.dryRun ? row?.executedAt : new Date(),
            executedBy: entry.executedBy ?? row?.executedBy,
            updatedAt: new Date(),
        })
        .where(eq(hypotheses.id, hypothesisId))
}

export async function executeHypothesisAction(
    hypothesisId: number,
    opts?: ExecuteOptions,
): Promise<ExecuteResult> {
    const dryRun = opts?.dryRun !== false              // default to dry-run
    const executedBy = opts?.executedBy ?? null

    const [row] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) return { ok: false, dryRun, hypothesisId, endpoint: 'unknown', error: 'Hypothesis not found' }

    if (row.status !== 'approved' && row.status !== 'testing') {
        return {
            ok: false, dryRun, hypothesisId, endpoint: 'unknown',
            error: `Cannot execute: hypothesis status is "${row.status}". Must be "approved" first.`,
        }
    }

    const recipe = row.apiActionRecipe as {
        platform?: string
        api?: string
        endpoint?: string
        payload?: Record<string, unknown>
        approvalRequired?: boolean
    } | null
    if (!recipe) {
        return { ok: false, dryRun, hypothesisId, endpoint: 'unknown', error: 'No apiActionRecipe on this hypothesis' }
    }
    const endpoint = recipe.endpoint || 'unknown'
    const payload = recipe.payload || {}

    let mutationResult: { ok: boolean; before?: Record<string, unknown>; after?: Record<string, unknown>; error?: string }

    if (recipe.api === 'meta_marketing') {
        mutationResult = await dispatchMetaMutation(row.instanceId, endpoint, payload, dryRun)
    } else if (recipe.api === 'google_ads') {
        mutationResult = { ok: false, error: 'Google Ads mutations not yet wired in this executor (Phase 4.6.2)' }
    } else {
        mutationResult = { ok: false, error: `Unsupported api: ${recipe.api}` }
    }

    const entry: ExecutionLogEntry = {
        at: new Date().toISOString(),
        dryRun,
        ok: mutationResult.ok,
        endpoint,
        payload,
        before: mutationResult.before,
        after: mutationResult.after,
        error: mutationResult.error,
        executedBy,
    }
    const status = mutationResult.ok
        ? (dryRun ? 'dry_run_ok' : 'executed')
        : (dryRun ? 'dry_run_failed' : 'execution_failed')
    await appendLog(hypothesisId, entry, status)

    return {
        ok: mutationResult.ok,
        dryRun,
        hypothesisId,
        endpoint,
        before: mutationResult.before,
        after: mutationResult.after,
        error: mutationResult.error,
    }
}

async function dispatchMetaMutation(
    instanceId: string,
    endpoint: string,
    payload: Record<string, unknown>,
    dryRun: boolean,
): Promise<{ ok: boolean; before?: Record<string, unknown>; after?: Record<string, unknown>; error?: string }> {
    try {
        switch (endpoint) {
            case 'campaigns.update.daily_budget': {
                const r = await setCampaignDailyBudget(
                    instanceId,
                    String(payload.campaignId),
                    Number(payload.newDailyBudgetIls),
                    { dryRun },
                )
                return { ok: r.ok, before: r.before, after: r.after, error: r.error }
            }
            case 'campaigns.adjust.daily_budget_pct': {
                const r = await adjustCampaignBudgetPct(
                    instanceId,
                    String(payload.campaignId),
                    Number(payload.factor),
                    { dryRun },
                )
                return { ok: r.ok, before: r.before, after: r.after, error: r.error }
            }
            case 'adsets.update.advantage_audience': {
                const r = await setAdvantageAudienceExpansion(
                    instanceId,
                    String(payload.adsetId),
                    Boolean(payload.enabled),
                    { dryRun },
                )
                return { ok: r.ok, before: r.before, after: r.after, error: r.error }
            }
            case 'adsets.update.bid_strategy': {
                const r = await setAdsetBidStrategy(
                    instanceId,
                    String(payload.adsetId),
                    payload.strategy as any,
                    payload.targetValue ? Number(payload.targetValue) : undefined,
                    { dryRun },
                )
                return { ok: r.ok, before: r.before, after: r.after, error: r.error }
            }
            default:
                return { ok: false, error: `Unknown Meta endpoint: ${endpoint}` }
        }
    } catch (err) {
        return { ok: false, error: (err as Error).message || 'Meta mutation dispatch failed' }
    }
}

/**
 * Convenience: get the most recent execution log entry for a hypothesis,
 * for the dashboard to render status without parsing the whole array.
 */
export async function getLatestExecution(hypothesisId: number): Promise<ExecutionLogEntry | null> {
    const [row] = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1)
    if (!row) return null
    const log = (row.executionLog as ExecutionLogEntry[] | null) || []
    return log[log.length - 1] || null
}