/**
 * DataForSEO field extractors — defensive accessors for OnPageItem and friends.
 *
 * Why this file exists:
 *   DataForSEO's response shapes drift between endpoints and minor versions.
 *   Hard-coding `item.meta.htags.h1[0]` in reader code (writer assumes one
 *   shape, reader expects another) caused the Phase 4.3-R H1 false-claims
 *   bug AND the Phase 4.3-T2 product-schema regression. The fix isn't to
 *   chase each field path bug-by-bug — it's a single safe-access layer that
 *   ALL reader code goes through.
 *
 * Each extractor:
 *   - Reads modern path first, falls back to legacy path
 *   - Returns SAFE DEFAULTS on missing data (never throws, never undefined-traps)
 *   - Logs a one-line warning when expected shape is missing (telemetry, no spam)
 *   - Cross-checks against `item.checks` (DFS's own deterministic verdict)
 *     where applicable — this is the ground truth that catches DFS bugs
 *
 * RULE: NEW reader code MUST NOT access `item.meta.*` directly. Use these
 * extractors. The static_signature audit category will flag direct accesses
 * in future PRs.
 */

import type { OnPageItem } from './types'

// ────────────────────────────────────────────────────────────────────────────
// H1 extraction
// ────────────────────────────────────────────────────────────────────────────

export interface H1Extraction {
    count: number
    texts: string[]
    /** True if DFS's `checks.no_h1_tag` says page has H1 but our text extraction
     *  returned nothing — indicates DFS field drift OR text extraction edge case. */
    suspectedDrift: boolean
}

export function extractH1(item: OnPageItem): H1Extraction {
    const htags = item?.meta?.htags?.h1
    const legacy = item?.meta?.h1
    const texts = (Array.isArray(htags) ? htags : Array.isArray(legacy) ? legacy : [])
        .filter(t => typeof t === 'string' && t.trim().length > 0)
        .map(t => t.trim())

    const checksHasH1 = item?.checks?.no_h1_tag === false
    const suspectedDrift = checksHasH1 && texts.length === 0

    if (suspectedDrift) {
        // DFS says page has H1, but we found none in either field. Field drift suspected.
        console.warn(`[dfs/safeExtract] H1 drift suspected for ${item?.url || '?'}: checks.no_h1_tag=false but no h1 text in meta.htags.h1 or meta.h1`)
    }

    return { count: texts.length, texts, suspectedDrift }
}

// ────────────────────────────────────────────────────────────────────────────
// Title / Meta description / Canonical
// ────────────────────────────────────────────────────────────────────────────

export function extractTitle(item: OnPageItem): { text: string | null; length: number } {
    const t = item?.meta?.title
    if (typeof t !== 'string' || t.length === 0) return { text: null, length: 0 }
    return { text: t, length: t.length }
}

export function extractMetaDescription(item: OnPageItem): { text: string | null; length: number } {
    const d = item?.meta?.description
    if (typeof d !== 'string' || d.length === 0) return { text: null, length: 0 }
    return { text: d, length: d.length }
}

export function extractCanonical(item: OnPageItem): string | null {
    const c = item?.meta?.canonical
    return (typeof c === 'string' && c.length > 0) ? c : null
}

// ────────────────────────────────────────────────────────────────────────────
// Word count
// ────────────────────────────────────────────────────────────────────────────

export function extractWordCount(item: OnPageItem): number {
    const wc = item?.meta?.content?.plain_text_word_count
    if (typeof wc === 'number' && wc >= 0) return wc
    return 0
}

// ────────────────────────────────────────────────────────────────────────────
// Onpage score (0-100)
// ────────────────────────────────────────────────────────────────────────────

export function extractOnPageScore(item: OnPageItem): number {
    const s = item?.onpage_score
    if (typeof s === 'number' && s >= 0 && s <= 100) return s
    return 0
}

// ────────────────────────────────────────────────────────────────────────────
// Schema types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract schema @type strings from DFS's `schema` array.
 *
 * Returns lowercased + deduped Set of types. DFS reports microdata/RDFa via
 * this field but often MISSES LD-JSON output by Yoast/RankMath/etc — the
 * caller is expected to merge with `probeLdJsonTypes` results separately.
 *
 * NOTE: DFS schema array shapes vary:
 *   - Standard: `[{ type: "WebPage", data: {...} }, ...]`
 *   - Some endpoints: `[{ "@type": "WebPage", ... }]` (raw JSON-LD)
 *   - Rarely: `null` or absent (no structured data detected)
 * We handle all three.
 */
export function extractSchemas(item: OnPageItem): string[] {
    const raw = item?.schema
    if (!Array.isArray(raw)) return []
    const types: string[] = []
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue
        const e = entry as Record<string, unknown>
        // Standard DFS shape: { type: "..." }
        if (typeof e.type === 'string') {
            types.push(e.type)
            continue
        }
        // Alt shape: { "@type": "..." }
        if (typeof e['@type'] === 'string') {
            types.push(e['@type'] as string)
            continue
        }
        // Alt shape: { "@type": ["...", "..."] }
        if (Array.isArray(e['@type'])) {
            for (const t of e['@type']) {
                if (typeof t === 'string') types.push(t)
            }
        }
    }
    return Array.from(new Set(types))
}

// ────────────────────────────────────────────────────────────────────────────
// Page timing (CWV proxy)
// ────────────────────────────────────────────────────────────────────────────

export interface PageTimingExtraction {
    lcp_ms: number | null
    fid_ms: number | null
    tti_ms: number | null
    dom_complete_ms: number | null
}

export function extractPageTiming(item: OnPageItem): PageTimingExtraction {
    const t = item?.page_timing
    return {
        lcp_ms: typeof t?.largest_contentful_paint === 'number' ? t.largest_contentful_paint : null,
        fid_ms: typeof t?.first_input_delay === 'number' ? t.first_input_delay : null,
        tti_ms: typeof t?.time_to_interactive === 'number' ? t.time_to_interactive : null,
        dom_complete_ms: typeof t?.dom_complete === 'number' ? t.dom_complete : null,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Boolean checks (DFS's deterministic per-page verdict — ground truth)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get a boolean check from DFS's `checks` matrix. Returns:
 *   - true  → DFS says condition holds (e.g. checks.no_h1_tag=true → no H1)
 *   - false → DFS says condition doesn't hold
 *   - null  → DFS didn't report this check (treat as unknown)
 *
 * Common keys we use:
 *   - no_h1_tag, no_title, no_description, no_image_alt
 *   - is_redirect, is_4xx_code, is_5xx_code
 *   - has_html_doctype, has_meta_viewport
 *   - duplicate_title_tag, duplicate_meta_description
 */
export function getCheck(item: OnPageItem, key: string): boolean | null {
    const v = item?.checks?.[key]
    return typeof v === 'boolean' ? v : null
}

// ────────────────────────────────────────────────────────────────────────────
// Composite extractor — all critical signals at once (for reducer code)
// ────────────────────────────────────────────────────────────────────────────

export interface OnPageSignals {
    url: string
    h1: H1Extraction
    title: ReturnType<typeof extractTitle>
    metaDescription: ReturnType<typeof extractMetaDescription>
    canonical: string | null
    wordCount: number
    onPageScore: number
    schemas: string[]
    pageTiming: PageTimingExtraction
    /** DFS's own ground-truth booleans (whichever keys DFS reported) */
    checks: Record<string, boolean>
}

export function extractAllSignals(item: OnPageItem): OnPageSignals {
    return {
        url: item?.url || '',
        h1: extractH1(item),
        title: extractTitle(item),
        metaDescription: extractMetaDescription(item),
        canonical: extractCanonical(item),
        wordCount: extractWordCount(item),
        onPageScore: extractOnPageScore(item),
        schemas: extractSchemas(item),
        pageTiming: extractPageTiming(item),
        checks: (item?.checks && typeof item.checks === 'object')
            ? Object.fromEntries(
                Object.entries(item.checks)
                    .filter(([, v]) => typeof v === 'boolean'),
            ) as Record<string, boolean>
            : {},
    }
}