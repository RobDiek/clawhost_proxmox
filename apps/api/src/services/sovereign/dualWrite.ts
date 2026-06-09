/**
 * Sovereign dual-write (tenant sovereignty Phase 2.1).
 *
 * BEST-EFFORT shadow writes from the central canonical store to the on-VPS
 * sovereign-store. Gated by instances.data_home:
 *   - 'central' → no-op (today's behavior; central is the only store).
 *   - 'dual'    → central stays canonical, we ALSO mirror here.
 *   - 'vps'     → VPS is canonical; central still mirrors as the shadow/rollback
 *                 copy during the P2.2 window.
 *
 * Contract: these helpers NEVER throw and NEVER roll back the central write.
 * A failed shadow write is logged and swallowed — it must not break the agent.
 * They ARE awaited by the caller (after the central write commits) so the
 * snapshot ordering matches central exactly (important for parity checks); the
 * client has its own request timeout so a dead VPS can't hang the caller for long.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import * as sov from './client'
import type { SovereignOutput } from './client'

async function isShadowed(instanceId: string): Promise<boolean> {
    try {
        const [row] = await db
            .select({ dh: instances.dataHome })
            .from(instances)
            .where(eq(instances.id, instanceId))
        return !!row && row.dh !== 'central'
    } catch {
        return false
    }
}

function logFail(kind: string, instanceId: string, scope: string, err: unknown) {
    console.error(
        `[sovereign dual-write] ${kind} ${instanceId}/${scope} failed:`,
        err instanceof Error ? err.message : err
    )
}

/** Shadow a full research_data snapshot for an agent scope. */
export async function shadowResearchData(
    instanceId: string,
    scope: string,
    body: unknown
): Promise<void> {
    try {
        if (!(await isShadowed(instanceId))) return
        await sov.writeResearchData(instanceId, scope, body)
    } catch (err) {
        logFail('research_data', instanceId, scope, err)
    }
}

/** Shadow a full brand_book snapshot for an agent scope. */
export async function shadowBrandBook(
    instanceId: string,
    scope: string,
    body: unknown
): Promise<void> {
    try {
        if (!(await isShadowed(instanceId))) return
        await sov.writeBrandBook(instanceId, scope, body)
    } catch (err) {
        logFail('brand_book', instanceId, scope, err)
    }
}

/** Shadow one agent_outputs row (upsert by id). */
export async function shadowOutput(
    instanceId: string,
    out: SovereignOutput
): Promise<void> {
    try {
        if (!(await isShadowed(instanceId))) return
        await sov.writeOutput(instanceId, out)
    } catch (err) {
        logFail('output', instanceId, out.id, err)
    }
}