/**
 * Phase 4.3-R — Schema Drift detector
 *
 * Walks cached DFS responses for this instance and verifies that every
 * field path our extractor depends on EXISTS in the actual response.
 * Catches bugs like the H1 path drift (`meta.h1` → real path was
 * `meta.htags.h1`) — symptom: extractor returns null/empty, downstream
 * deterministic checks generate false "missing_X" claims.
 *
 * The pattern we ratify here is the CLEANEST defensive position:
 *   1. Type definition documents the REAL path
 *   2. Extractor reads from the real path with a legacy fallback
 *   3. Per-claim cross-check uses DFS's own `checks.no_X_tag` matrix as
 *      ground truth — so even if extraction silently drifts, the claim
 *      "missing_X" can only fire when DFS itself reports no_X_tag=true.
 *
 * This check VERIFIES (1) by sampling cached responses and asserting the
 * documented field paths actually contain data, and reports any missing
 * paths as drift candidates.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { dfsCache } from '@/db/schema'
import type { AuditFinding, AuditContext } from './types'

// Field paths the code currently depends on, by endpoint. Each entry is
// dot-path into `response.tasks[0].result[0].items[].X`. When this check
// runs against a real cached response, an empty value at one of these
// paths suggests either (a) DFS didn't extract it (page-specific) or
// (b) the path is wrong (drift — the dangerous case).
const ENDPOINT_FIELD_PATHS: Record<string, string[]> = {
    'on_page/instant_pages': [
        'url',
        'meta.title',
        'meta.description',
        'meta.canonical',
        'meta.htags.h1',
        'meta.htags.h2',
        'meta.content.plain_text_word_count',
        'onpage_score',
        'checks.no_title',
        'checks.no_description',
        'checks.no_h1_tag',
        'checks.is_redirect',
        'page_timing.largest_contentful_paint',
        'status_code',
    ],
    'serp/google/organic/live/advanced': [
        // items array directly
    ],
    'backlinks/summary/live': [
        'target',
        'backlinks',
        'referring_domains',
        'backlinks_spam_score',
    ],
    'backlinks/anchors/live': [
        'anchor',
        'backlinks',
        'referring_domains',
    ],
    'backlinks/referring_domains/live': [
        'domain',
        'rank',
        'backlinks',
    ],
    'dataforseo_labs/google/ranked_keywords/live': [
        'keyword_data.keyword',
        'keyword_data.keyword_info.search_volume',
        'keyword_data.keyword_info.cpc',
        'ranked_serp_element.serp_item.rank_absolute',
        'ranked_serp_element.serp_item.url',
        // 'ranked_serp_element.serp_item.etv', // optional — added in some response variants
    ],
    'dataforseo_labs/google/keyword_ideas/live': [
        'keyword',
        'keyword_info.search_volume',
        'keyword_info.cpc',
    ],
    'keywords_data/google_ads/search_volume/live': [
        'keyword',
        'search_volume',
        'cpc',
    ],
    'business_data/google/my_business_info/live': [
        // 'title', // present at items[0] level
    ],
}

function getNested(obj: unknown, path: string): unknown {
    const parts = path.split('.')
    let cur: unknown = obj
    for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[p]
        } else {
            return undefined
        }
    }
    return cur
}

function looksPresent(v: unknown): boolean {
    if (v === undefined || v === null) return false
    if (typeof v === 'string') return v.length > 0
    if (Array.isArray(v)) return true   // empty array is still "present" — DFS returns []
    if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0
    return true
}

export const schemaDriftCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []

    // Sample 1 cached response per endpoint type for this instance.
    const rows = await db
        .select({ endpoint: dfsCache.endpoint, response: dfsCache.response })
        .from(dfsCache)
        .where(eq(dfsCache.instanceId, ctx.instanceId))
        .limit(500)

    if (rows.length === 0) {
        findings.push({
            category: 'schema_drift',
            id: 'dfs_cache_empty',
            title: 'אין DFS cache לדגום',
            severity: 'info',
            detail: 'No cached DataForSEO responses to validate against. Run a research stage first; schema-drift check needs real responses to compare against.',
            scope: { instanceId: ctx.instanceId },
        })
        return findings
    }

    const byEndpoint = new Map<string, Array<{ response: unknown }>>()
    for (const r of rows) {
        if (!byEndpoint.has(r.endpoint)) byEndpoint.set(r.endpoint, [])
        const bucket = byEndpoint.get(r.endpoint)!
        if (bucket.length < 3) bucket.push({ response: r.response })   // sample 3 per endpoint
    }

    for (const [endpoint, samples] of byEndpoint) {
        const paths = ENDPOINT_FIELD_PATHS[endpoint]
        if (!paths || paths.length === 0) continue

        // Aggregate: for each path, count "present in N/M sampled items"
        const counts: Record<string, { present: number; total: number }> = {}
        for (const p of paths) counts[p] = { present: 0, total: 0 }

        for (const s of samples) {
            const items = getItemsArray(s.response)
            for (const item of items.slice(0, 5)) {       // up to 5 items per response
                for (const p of paths) {
                    counts[p].total++
                    if (looksPresent(getNested(item, p))) counts[p].present++
                }
            }
        }

        // A path with 0/N present across samples is highly suspicious — that's
        // exactly the symptom of the H1 drift bug (always 0). A path with
        // partial coverage (e.g. 7/20) is normal (page-specific data missing
        // on some URLs).
        for (const [path, c] of Object.entries(counts)) {
            if (c.total === 0) continue
            const ratio = c.present / c.total
            if (ratio === 0) {
                findings.push({
                    category: 'schema_drift',
                    id: `path_always_empty:${endpoint}:${path}`,
                    title: `שדה ${path} ריק ב-100% מהדגימות (${endpoint})`,
                    severity: 'fail',
                    detail:
                        `Sampled ${c.total} items from ${samples.length} cached ${endpoint} responses; ` +
                        `field path "${path}" was empty in ALL of them. This is the classic field-drift symptom — ` +
                        `either DFS never returns this path (extractor is reading the wrong key), or the data is ` +
                        `genuinely never available (rare). Verify against a fresh sample of DFS docs.`,
                    fixHint:
                        `Read services/research/dataforseo/types.ts and confirm the type defines the path "${path}". ` +
                        `If type says one thing but real responses always lack it, fix the type + every consumer that reads it.`,
                    evidence: { endpoint, path, sampled: c.total, present: 0 },
                    scope: { instanceId: ctx.instanceId },
                })
            } else if (ratio < 0.1 && c.total >= 10) {
                // Less than 10% — sus but not damning
                findings.push({
                    category: 'schema_drift',
                    id: `path_rarely_present:${endpoint}:${path}`,
                    title: `שדה ${path} מופיע נדיר מאוד (${Math.round(ratio * 100)}%)`,
                    severity: 'warn',
                    detail:
                        `Path "${path}" present in only ${c.present}/${c.total} sampled items from ${endpoint}. ` +
                        `Could be legitimate (page-specific) or could be a parser quirk. Worth a manual spot-check.`,
                    evidence: { endpoint, path, ratio: Math.round(ratio * 100) / 100 },
                    scope: { instanceId: ctx.instanceId },
                })
            }
        }
    }

    if (findings.filter(f => f.severity === 'fail').length === 0) {
        findings.push({
            category: 'schema_drift',
            id: 'schema_drift_clean',
            title: 'אין drift בין סכמת DFS לבין הExtractors',
            severity: 'pass',
            detail: `Validated ${byEndpoint.size} endpoint types against cached samples; every documented field path returns data in at least one sample.`,
            scope: { instanceId: ctx.instanceId },
        })
    }

    return findings
}

function getItemsArray(response: unknown): unknown[] {
    if (!response || typeof response !== 'object') return []
    const tasks = (response as { tasks?: unknown[] }).tasks
    if (!Array.isArray(tasks) || tasks.length === 0) return []
    const result = (tasks[0] as { result?: unknown[] }).result
    if (!Array.isArray(result) || result.length === 0) return []
    const items = (result[0] as { items?: unknown[] }).items
    if (Array.isArray(items)) return items
    return [result[0]]   // some endpoints (backlinks/summary) return data directly at result[0]
}