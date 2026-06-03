/**
 * Offline Conversion Runner — daily autonomous sweep.
 *
 * For every Mateh agent that has an offline store→Ads conversion action
 * provisioned (researchData.offlineConversions.actionResourceName), upload any
 * NEW store orders carrying a gclid to Google Ads as secondary conversions.
 * This is the recurring half of services/offlineConversionUpload.ts — the
 * onboarding wiring creates the action + watermark; this job keeps it fed.
 *
 * Idempotent (watermark + orderId dedup). Best-effort per agent; one failure
 * never blocks the rest. Runs daily (after the just-created-action 6h cooldown
 * is irrelevant for steady-state tenants).
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { uploadNewStoreOrders } from '@/services/offlineConversionUpload'

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000   // daily
let started = false

export async function runAllOfflineUploads(): Promise<{ agents: number; uploaded: number; errors: number }> {
    let agents = 0, uploaded = 0, errors = 0
    let rows: MatehAgentRow[] = []
    try { rows = await db.select().from(matehAgents) as MatehAgentRow[] }
    catch (e) { console.error('[offlineRunner] load agents failed:', (e as Error).message); return { agents, uploaded, errors: 1 } }

    for (const agent of rows) {
        const rd: any = agent.researchData || {}
        if (!rd.offlineConversions?.actionResourceName) continue   // not provisioned for this tenant
        agents++
        try {
            const r = await uploadNewStoreOrders(agent)
            if (r.status === 'ok') uploaded += r.uploaded || 0
            else if (r.status === 'error') { errors++; console.warn(`[offlineRunner] ${agent.id}: ${r.reason}`) }
        } catch (e) { errors++; console.error(`[offlineRunner] ${agent.id} threw:`, (e as Error).message) }
    }
    console.log(`[offlineRunner] swept ${agents} provisioned agents · uploaded ${uploaded} · errors ${errors}`)
    return { agents, uploaded, errors }
}

export function startOfflineConversionRunner(): void {
    if (started) return
    started = true
    console.log(`[offlineRunner] starting (interval ${RUN_INTERVAL_MS / 3600_000}h)`)
    // Initial run 5 min after startup (let server warm up + avoid the action 6h
    // cooldown noise on the very first deploy).
    setTimeout(() => { runAllOfflineUploads().catch(() => { /* logged inside */ }) }, 5 * 60 * 1000)
    setInterval(() => { runAllOfflineUploads().catch(() => { /* logged inside */ }) }, RUN_INTERVAL_MS)
}