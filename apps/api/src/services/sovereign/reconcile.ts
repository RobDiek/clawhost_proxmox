/**
 * Sovereign reconciler (tenant sovereignty Phase 2.1).
 *
 * research_data has a single clean write chokepoint (agentContext.writeResearchData),
 * so it is shadowed in real time. agent_outputs and brand_books do NOT — they are
 * written + status-mutated across 20+ scattered call sites (inserts plus approve /
 * reject / publish / edit transitions). Intercepting each is fragile, so instead we
 * RECONCILE: read the central canonical rows for an instance and upsert them into the
 * on-VPS sovereign-store. This converges inserts, updates and re-runs uniformly, and
 * doubles as the one-time bulk migration for P2.2.
 *
 * Only runs for instances with data_home != 'central' (during the soak that is the
 * master alone). All sovereign writes are best-effort; a failure is recorded in the
 * result.errors and never throws out of the per-instance loop.
 */
import { eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { instances, matehAgents, agentOutputs, brandBooks } from '@/db/schema'
import * as sov from './client'

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface ReconcileResult {
    instanceId: string
    agents: number
    researchData: number
    brandBooks: number
    outputs: number
    errors: string[]
}

/**
 * Mirror one instance's canonical tenant content (research_data per agent, the
 * active brand_book per agent, every agent_outputs row) into its sovereign-store.
 * Scope = the mateh_agent id, falling back to the primary agent, then instanceId
 * (mirrors agentContext's null-agent handling + the agentOutputs backfill rule).
 */
export async function syncInstanceToSovereign(
    instanceId: string
): Promise<ReconcileResult> {
    const res: ReconcileResult = {
        instanceId,
        agents: 0,
        researchData: 0,
        brandBooks: 0,
        outputs: 0,
        errors: []
    }

    const agents = await db
        .select({
            id: matehAgents.id,
            isPrimary: matehAgents.isPrimary,
            researchData: matehAgents.researchData
        })
        .from(matehAgents)
        .where(eq(matehAgents.vpsInstanceId, instanceId))
    res.agents = agents.length
    const primary = agents.find((a) => a.isPrimary) ?? agents[0] ?? null
    const scopeFor = (agentId: string | null): string =>
        agentId ?? primary?.id ?? instanceId

    // research_data — per agent (or the instance mirror for legacy no-agent VPSes)
    for (const a of agents) {
        try {
            await sov.writeResearchData(instanceId, a.id, a.researchData ?? {})
            res.researchData++
        } catch (e) {
            res.errors.push(`rd ${a.id}: ${msg(e)}`)
        }
    }
    if (agents.length === 0) {
        const [inst] = await db
            .select({ rd: instances.researchData })
            .from(instances)
            .where(eq(instances.id, instanceId))
        if (inst) {
            try {
                await sov.writeResearchData(instanceId, instanceId, inst.rd ?? {})
                res.researchData++
            } catch (e) {
                res.errors.push(`rd legacy: ${msg(e)}`)
            }
        }
    }

    // brand_book — one singleton per scope; prefer 'approved', else highest version
    const bbs = await db
        .select()
        .from(brandBooks)
        .where(eq(brandBooks.instanceId, instanceId))
    const bestByScope = new Map<string, (typeof bbs)[number]>()
    const score = (x: (typeof bbs)[number]): number =>
        (x.status === 'approved' ? 1_000_000 : 0) + (x.version ?? 0)
    for (const bb of bbs) {
        const scope = scopeFor(bb.agentId)
        const cur = bestByScope.get(scope)
        if (!cur || score(bb) >= score(cur)) bestByScope.set(scope, bb)
    }
    for (const [scope, bb] of bestByScope) {
        try {
            await sov.writeBrandBook(instanceId, scope, bb)
            res.brandBooks++
        } catch (e) {
            res.errors.push(`bb ${scope}: ${msg(e)}`)
        }
    }

    // agent_outputs — every row (the משימות פעילות queue)
    const outs = await db
        .select()
        .from(agentOutputs)
        .where(eq(agentOutputs.instanceId, instanceId))
    for (const o of outs) {
        try {
            await sov.writeOutput(instanceId, {
                id: o.id,
                scope: scopeFor(o.agentId),
                type: o.outputType,
                status: o.status,
                createdAt: o.createdAt ? o.createdAt.getTime() : null,
                body: o
            })
            res.outputs++
        } catch (e) {
            res.errors.push(`out ${o.id}: ${msg(e)}`)
        }
    }

    return res
}

/**
 * Cron entry: reconcile every non-'central' instance. No-op when none are opted
 * in (the common case until the soak begins). Wired in index.ts on an interval.
 */
export async function runSovereignReconcile(): Promise<void> {
    const rows = await db
        .select({ id: instances.id })
        .from(instances)
        .where(ne(instances.dataHome, 'central'))
    if (rows.length === 0) return
    for (const r of rows) {
        try {
            const res = await syncInstanceToSovereign(r.id)
            if (res.errors.length) {
                console.error(
                    `[sovereign reconcile] ${r.id}: ${res.errors.length} errors`,
                    res.errors.slice(0, 5)
                )
            } else {
                console.log(
                    `[sovereign reconcile] ${r.id}: agents=${res.agents} rd=${res.researchData} bb=${res.brandBooks} out=${res.outputs}`
                )
            }
        } catch (e) {
            console.error(`[sovereign reconcile] ${r.id} failed:`, msg(e))
        }
    }
}