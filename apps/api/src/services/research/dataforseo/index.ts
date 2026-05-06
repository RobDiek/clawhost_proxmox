/**
 * DataForSEO research client — barrel export.
 *
 * Phase 3.5b foundation. Per-stage prompt builders (Phase 3.5c) import
 * from here:
 *
 *   import { searchVolume, keywordIdeas, serpAdvanced, parseSerpFeatures,
 *            competitorsDomain, backlinksSummary, backlinksAnchors,
 *            DfsError } from '@/services/research/dataforseo'
 *
 * Architecture: every endpoint wrapper checks per-tenant cache first
 * (per-endpoint TTL from cache.ts), falls through to dfsPost on miss,
 * stores response on success. Hard-fails on DFS error (no graceful
 * degradation — playbook §17 says no SEO without data).
 */

export * from './client'
export * from './cache'
export * from './endpoints'
export * from './types'