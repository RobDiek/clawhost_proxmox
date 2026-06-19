/**
 * Full-Site SEO Sweep — Layer 0: bring EVERY existing page up to the 2026
 * internal-optimization baseline in one idempotent pass.
 *
 * This is the foundational "полная внутренняя проработка всех страниц" step:
 * structured data + meta descriptions + internal links + image alt + product
 * schema across the whole site (classic, Gutenberg AND Elementor — the batch
 * services are now builder-aware via [[wpBuilderInfo]]). Distinct from
 * page-refresh, which DEEPENS content on a few high-opportunity pages.
 *
 * Each batch service caps at N items/run for safety, so we LOOP each one until
 * it stops finding work (or a round cap) → full coverage from a single call.
 * Idempotent: re-running only touches pages still missing/stale.
 *
 * Approval-gated like every external write ([[feedback_no_automatic_actions]]):
 * the caller passes dryRun for preview; a real run writes after user approval.
 */
import { runSeoSchemaBatch } from '@/services/seoSchemaBatch'
import { runSeoMetaBatch, loadWpConfig } from '@/services/seoMetaBatch'
import { runInternalLinks } from '@/services/seoInternalLinks'
import { runImageAltBatch } from '@/services/seoImageAlt'
import { runProductSchemaForAgent } from '@/services/seoProductSchema'

export interface SweepStage {
    ran: number          // rounds executed
    updated: number      // items written (or, in dryRun, that WOULD be written)
    failures: number
    remaining: number    // candidates still pending after the last round
}
export interface FullSiteSweepResult {
    ok: boolean
    integrationMissing?: boolean
    dryRun: boolean
    stages: {
        schema: SweepStage
        meta: SweepStage
        internalLinks: SweepStage
        imageAlt: SweepStage
        productSchema?: SweepStage
    }
    errors: string[]
}

type BatchResult = { updated?: unknown[]; failures?: unknown[]; candidates?: number; integrationMissing?: boolean }

/**
 * Run a capped batch service repeatedly until it stops making progress. In
 * dryRun we run ONCE (a dryRun never shrinks the candidate set, so looping would
 * repeat the same items) and report the candidate count as "remaining".
 */
async function loopBatch(fn: () => Promise<BatchResult>, dryRun: boolean, maxRounds = 8): Promise<SweepStage> {
    let updated = 0, failures = 0, ran = 0, remaining = 0
    const rounds = dryRun ? 1 : maxRounds
    for (let i = 0; i < rounds; i++) {
        const r = await fn().catch(() => ({ updated: [], failures: [{}], candidates: 0 } as BatchResult))
        ran++
        const u = Array.isArray(r.updated) ? r.updated.length : 0
        updated += u
        failures += Array.isArray(r.failures) ? r.failures.length : 0
        remaining = typeof r.candidates === 'number' ? Math.max(0, r.candidates - u) : 0
        if (dryRun) { remaining = typeof r.candidates === 'number' ? r.candidates : 0; break }
        if (u === 0) break               // no progress (done, or only failures) → stop
        if (remaining === 0) break       // processed everything
    }
    return { ran, updated, failures, remaining }
}

export type SweepStageName = 'schema' | 'meta' | 'internalLinks' | 'imageAlt' | 'productSchema'

export async function runFullSiteSeoSweep(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; sameAs?: string[]; dryRun?: boolean; ecommerce?: boolean; only?: SweepStageName[] } = {},
): Promise<FullSiteSweepResult> {
    const want = (s: SweepStageName) => !opts.only || opts.only.includes(s)
    const dryRun = !!opts.dryRun
    const errors: string[] = []
    const out: FullSiteSweepResult = {
        ok: false, dryRun,
        stages: {
            schema: { ran: 0, updated: 0, failures: 0, remaining: 0 },
            meta: { ran: 0, updated: 0, failures: 0, remaining: 0 },
            internalLinks: { ran: 0, updated: 0, failures: 0, remaining: 0 },
            imageAlt: { ran: 0, updated: 0, failures: 0, remaining: 0 },
        },
        errors,
    }

    const agentId = opts.agentId
    const businessName = opts.businessName || 'העסק'
    const sameAs = opts.sameAs

    // WordPress reachable at all? (schema/meta write via WP REST.)
    const cfg = await loadWpConfig(instanceId, agentId).catch(() => null)
    if (!cfg) { out.integrationMissing = true; return out }

    // 1) Structured data (Org+WebSite+Breadcrumb+page-node+FAQ/Product) — every page.
    if (want('schema')) out.stages.schema = await loopBatch(() => runSeoSchemaBatch(instanceId, { agentId, businessName, sameAs, dryRun }), dryRun)
    // 2) Meta descriptions — every weak/empty page.
    if (want('meta')) out.stages.meta = await loopBatch(() => runSeoMetaBatch(instanceId, { agentId, businessName, dryRun }), dryRun)
    // 3) Internal links — classic/Gutenberg posts (Elementor skipped, by design).
    if (want('internalLinks')) out.stages.internalLinks = await loopBatch(() => runInternalLinks(instanceId, { agentId, dryRun }), dryRun)
    // 4) Image alt — accessibility + image SEO.
    if (want('imageAlt')) out.stages.imageAlt = await loopBatch(() => runImageAltBatch(instanceId, { agentId, businessName, dryRun }), dryRun)
    // 5) Product schema (ecommerce only) — runs once (paginates internally).
    if (want('productSchema') && opts.ecommerce && agentId) {
        try {
            // ProductSchemaResult uses numeric updated/failures (not arrays) and
            // paginates internally over the whole catalog in one call.
            const r = await runProductSchemaForAgent(agentId, { dryRun })
            out.stages.productSchema = { ran: 1, updated: Number(r.updated || 0), failures: Number(r.failures || 0), remaining: 0 }
            if (r.status === 'no_store') errors.push('product schema: WooCommerce not reachable')
            else if (r.status === 'error') errors.push('product schema: ' + (r.reason || 'error'))
        } catch (e) { errors.push('product schema: ' + (e as Error).message) }
    }

    out.ok = true
    return out
}