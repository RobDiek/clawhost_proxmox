/**
 * DataForSEO cache layer — per-tenant, per-endpoint TTLs.
 *
 * Why per-tenant: each tenant pays DFS directly with their own key. A
 * cache hit for tenant B that was paid for by tenant A would scramble
 * billing semantics. v1 = strict per-tenant isolation.
 *
 * TTL policy (playbook §17 — DataForSEO data freshness):
 *   - 30-day: bulk endpoints — keyword_ideas, related_keywords,
 *     ranked_keywords, backlinks_summary, competitors_domain
 *   - 7-day:  middle-ground — search_volume, on_page audits, business
 *     data, trustpilot reviews
 *   - 1-day:  SERP live (positions/features) — needs freshness for
 *     valuation accuracy
 *
 * Sweep policy: lazy. Expired rows are detected at read-time and ignored;
 * a separate background job (admin-triggered or cron) can DELETE WHERE
 * expires_at < NOW() — not yet wired.
 */

import { createHash } from 'crypto'
import { eq, gt, and } from 'drizzle-orm'
import { db } from '@/db'
import { dfsCache } from '@/db/schema'

// TTL constants in seconds
const SECOND = 1
const HOUR   = 60 * 60 * SECOND
const DAY    = 24 * HOUR

/**
 * Endpoint-class TTL table. Entries match endpoint path prefixes — the
 * cache layer matches the longest prefix. New endpoints default to 7-day
 * if unmatched (sensible middle ground).
 */
const TTL_BY_ENDPOINT_PREFIX: Array<{ prefix: string; ttlSec: number }> = [
    // 1-day: needs freshness for valuation
    { prefix: 'serp/google/organic/live',           ttlSec: 1 * DAY },

    // 30-day: bulk, monthly-granularity data
    { prefix: 'dataforseo_labs/google/keyword_ideas',     ttlSec: 30 * DAY },
    { prefix: 'dataforseo_labs/google/related_keywords',  ttlSec: 30 * DAY },
    { prefix: 'dataforseo_labs/google/ranked_keywords',   ttlSec: 30 * DAY },
    { prefix: 'dataforseo_labs/google/competitors_domain', ttlSec: 30 * DAY },
    { prefix: 'dataforseo_labs/google/serp_competitors',  ttlSec: 30 * DAY },
    { prefix: 'dataforseo_labs/google/keyword_difficulty', ttlSec: 30 * DAY },
    { prefix: 'backlinks/summary',                        ttlSec: 30 * DAY },
    { prefix: 'backlinks/competitors',                    ttlSec: 30 * DAY },

    // 7-day: middle-ground (default)
    { prefix: 'keywords_data/google_ads/search_volume',   ttlSec: 7 * DAY },
    { prefix: 'backlinks/anchors',                        ttlSec: 7 * DAY },
    { prefix: 'backlinks/referring_domains',              ttlSec: 7 * DAY },
    { prefix: 'on_page/live/instant_pages',               ttlSec: 7 * DAY },
    { prefix: 'business_data/google',                     ttlSec: 7 * DAY },
    { prefix: 'business_data/trustpilot',                 ttlSec: 7 * DAY },
]

const DEFAULT_TTL_SEC = 7 * DAY

export function ttlForEndpoint(endpoint: string): number {
    // Prefer longest matching prefix — handles overlapping namespaces.
    let bestMatch = { prefix: '', ttl: DEFAULT_TTL_SEC }
    for (const entry of TTL_BY_ENDPOINT_PREFIX) {
        if (endpoint.startsWith(entry.prefix) && entry.prefix.length > bestMatch.prefix.length) {
            bestMatch = { prefix: entry.prefix, ttl: entry.ttlSec }
        }
    }
    return bestMatch.ttl
}

/**
 * Cache key = sha256(instanceId + endpoint + JSON.stringify(params)).
 * Order-sensitive on params keys — caller MUST canonicalize before
 * calling (alphabetical sort of object keys). cacheGet/cacheSet here
 * just hash whatever's passed.
 */
export function cacheKey(instanceId: string, endpoint: string, params: unknown): string {
    const stable = canonicalJson(params)
    return createHash('sha256')
        .update(instanceId)
        .update('|')
        .update(endpoint)
        .update('|')
        .update(stable)
        .digest('hex')
}

/**
 * Stable JSON serialization — sorts object keys recursively so two
 * params objects with same fields in different order produce same hash.
 */
function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

/**
 * Read from cache. Returns null on miss (no row, expired, or db error).
 * Never throws — cache failures degrade to "uncached, fetch fresh".
 */
export async function cacheGet<T>(
    instanceId: string,
    endpoint: string,
    params: unknown,
): Promise<T | null> {
    try {
        const key = cacheKey(instanceId, endpoint, params)
        const [row] = await db.select({ response: dfsCache.response })
            .from(dfsCache)
            .where(and(
                eq(dfsCache.cacheKey, key),
                gt(dfsCache.expiresAt, new Date()),
            ))
            .limit(1)
        return (row?.response as T) || null
    } catch (err) {
        console.warn(`[dfs/cache] read failed for ${endpoint}:`, (err as Error).message)
        return null
    }
}

/**
 * Write to cache. Idempotent — uses ON CONFLICT to overwrite stale entry.
 * Never throws — cache failures don't affect caller's response.
 */
export async function cacheSet<T>(
    instanceId: string,
    endpoint: string,
    params: unknown,
    response: T,
    cost: number,
    ttlSec?: number,
): Promise<void> {
    try {
        const key = cacheKey(instanceId, endpoint, params)
        const ttl = ttlSec ?? ttlForEndpoint(endpoint)
        const expiresAt = new Date(Date.now() + ttl * 1000)
        await db.insert(dfsCache).values({
            cacheKey: key,
            instanceId,
            endpoint,
            response: response as never,
            cost: cost.toFixed(4),
            expiresAt,
        }).onConflictDoUpdate({
            target: dfsCache.cacheKey,
            set: {
                response: response as never,
                cost: cost.toFixed(4),
                expiresAt,
                createdAt: new Date(),
            },
        })
    } catch (err) {
        console.warn(`[dfs/cache] write failed for ${endpoint}:`, (err as Error).message)
    }
}