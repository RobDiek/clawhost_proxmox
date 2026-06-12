/**
 * Model tier overrides — admin "apply a new model without deploy".
 *
 * agentSetup.roleModel() reads these over the compiled @openclaw/shared registry
 * defaults. When modelMonitor detects a newer model via /v1/models and the admin
 * clicks "apply" in Admin → Models, we persist {tier → modelId} here and all new
 * provisioning follows immediately — no code change, no redeploy.
 *
 * Defensive by design: every read is wrapped so a missing table (before the
 * migration lands) degrades to "no overrides" → registry defaults. Provisioning
 * must never break because of this layer.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { modelOverrides } from '@/db/schema'

const CACHE_TTL_MS = 60_000
let cache: { at: number; data: Record<string, string> } | null = null
let tableEnsured = false

/** Idempotent CREATE TABLE IF NOT EXISTS — guarantees the table exists even
 *  before drizzle migrations run on the box. Cheap; gated to run once. */
async function ensureTable(): Promise<void> {
    if (tableEnsured) return
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS model_overrides (
            tier        text PRIMARY KEY,
            model_id    text NOT NULL,
            updated_by  text,
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    `)
    tableEnsured = true
}

/** {tier → modelId} of all active overrides. Cached 60s. Returns {} on any error. */
export async function getTierOverrides(): Promise<Record<string, string>> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
    try {
        await ensureTable()
        const rows = await db.select().from(modelOverrides)
        const data: Record<string, string> = {}
        for (const r of rows) data[r.tier] = r.modelId
        cache = { at: Date.now(), data }
        return data
    } catch (err) {
        console.warn('[modelOverrides] read failed, using registry defaults:', (err as Error).message)
        return cache?.data || {}
    }
}

/** Upsert a tier → modelId override and bust the cache. */
export async function setTierOverride(tier: string, modelId: string, updatedBy?: string): Promise<void> {
    await ensureTable()
    await db.insert(modelOverrides)
        .values({ tier, modelId, updatedBy: updatedBy || null, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: modelOverrides.tier,
            set: { modelId, updatedBy: updatedBy || null, updatedAt: new Date() },
        })
    cache = null
}

/** Remove a tier override (revert to registry default). */
export async function clearTierOverride(tier: string): Promise<void> {
    await ensureTable()
    await db.delete(modelOverrides).where(sql`tier = ${tier}`)
    cache = null
}

export function bustOverrideCache(): void {
    cache = null
}