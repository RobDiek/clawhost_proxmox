import type { CacheEntry, PolarSubscription } from '@/ts/Interfaces'

const SUB_CACHE_TTL = 60_000
const subCache = new Map<string, CacheEntry<PolarSubscription>>()
const subInflight = new Map<string, Promise<PolarSubscription | null>>()

export { SUB_CACHE_TTL, subCache, subInflight }