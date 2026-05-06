/**
 * Tiny KV wrapper around the `system_config` table. Used for runtime-mutable
 * config that's too small to deserve its own table — currently just the
 * USD→ILS FX rate (refreshed daily by cron, includes AllPay-fee buffer).
 *
 * Cached in-process for 60s to avoid hammering the DB on every top-up
 * checkout render. Cache invalidates on `setSystemConfig` so admin updates
 * land instantly.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { systemConfig } from '@/db/schema'

interface CacheEntry { value: string; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

export async function getSystemConfig(key: string, fallback: string): Promise<string> {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.value
    try {
        const [row] = await db.select({ value: systemConfig.value })
            .from(systemConfig).where(eq(systemConfig.key, key)).limit(1)
        const value = row?.value ?? fallback
        cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
        return value
    } catch (err) {
        console.warn(`[systemConfig] read ${key} failed:`, (err as Error).message)
        return fallback
    }
}

export async function setSystemConfig(key: string, value: string): Promise<void> {
    await db.insert(systemConfig).values({ key, value }).onConflictDoUpdate({
        target: systemConfig.key,
        set: { value, updatedAt: new Date() },
    })
    cache.delete(key)
}