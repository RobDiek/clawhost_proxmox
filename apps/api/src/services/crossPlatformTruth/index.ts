/**
 * Cross-platform truth layer — Phase 4.4 orchestrator.
 *
 * `getCrossPlatformTruth(instanceId, opts)` returns the full picture in one
 * call (MER + aMER + truth gap + per-platform trust + composite trust score)
 * so the dashboard widget and the hypothesis-engine generators don't each
 * re-query.
 */

import { runPaidDataInventory } from '../paidDataInventory'
import { aggregateByPlatform, aggregateByEvent } from '../dataIngestion/aggregate'
import { computeMer, type MerResult } from './computeMer'
import { classifyDataTrust, compositeTrustScore, type PlatformTrust } from './dataTrustHierarchy'

export interface CrossPlatformTruth {
    mer: MerResult
    trust: {
        perPlatform: PlatformTrust[]
        compositeScore: number          // 0..1
        weakestPlatform: string | null
    }
    inventoryTier: string               // T0/T1/T2/T3/T4 from paidDataInventory
}

export interface GetTruthOptions {
    windowDays?: number                 // default 30
}

export async function getCrossPlatformTruth(
    instanceId: string,
    opts?: GetTruthOptions,
): Promise<CrossPlatformTruth> {
    const windowDays = opts?.windowDays ?? 30

    // Run independent queries in parallel.
    const [mer, inventory, perEvent, perPlatformAgg] = await Promise.all([
        computeMer(instanceId, windowDays),
        runPaidDataInventory(instanceId),
        aggregateByEvent(instanceId, windowDays),
        aggregateByPlatform(instanceId, windowDays),
    ])

    // Build attributionModesByPlatform from per-event aggregate (each event
    // row carries the attribution window it was reported under).
    const attrModes: Record<string, string[]> = {}
    for (const ev of perEvent) {
        const aw = ev.attributionWindow
        if (!aw) continue
        if (!attrModes[ev.platform]) attrModes[ev.platform] = []
        if (!attrModes[ev.platform].includes(aw)) attrModes[ev.platform].push(aw)
    }

    const platformsWithSpend = perPlatformAgg
        .filter(p => p.spendIls > 0)
        .map(p => p.platform)

    const perPlatformTrust = classifyDataTrust({
        adapters: inventory.adapters,
        platformsWithSpend,
        attributionModesByPlatform: attrModes,
    })

    const spendByPlatform: Record<string, number> = {}
    for (const p of perPlatformAgg) spendByPlatform[p.platform] = p.spendIls
    const { score, weakestPlatform } = compositeTrustScore(perPlatformTrust, spendByPlatform)

    return {
        mer,
        trust: {
            perPlatform: perPlatformTrust,
            compositeScore: score,
            weakestPlatform,
        },
        inventoryTier: inventory.tier,
    }
}

export { computeMer } from './computeMer'
export { classifyDataTrust, compositeTrustScore } from './dataTrustHierarchy'
export type { MerResult, MerPlatformRow } from './computeMer'
export type { PlatformTrust, DataTrustTier } from './dataTrustHierarchy'