/**
 * Google OAuth scope normalization + checks.
 *
 * The dashboard stores scopes in a SHORT form (e.g. ["ads", "gtm",
 * "analytics"]) but Google's APIs operate on full URL scopes
 * (e.g. "https://www.googleapis.com/auth/tagmanager.readonly").
 *
 * Different enrichment services were checking inconsistently:
 *   - ga4Enrich.ts looked for "analytics" — passes both forms
 *   - gtmInventory.ts looked for "tagmanager" — FAILS on short "gtm"
 *   - gscPagesEnrich.ts looked for "webmasters"/"search-console" — FAILS on short "gsc"
 *
 * This module is the single source of truth: pass any list of scope
 * strings (mixed forms allowed), get a normalized capability set.
 */

export interface GoogleScopeCapabilities {
    ads: boolean
    analytics: boolean
    tagmanager: boolean
    searchConsole: boolean
    drive: boolean
    youtube: boolean
}

export function normalizeGoogleScopes(scopes: string[] | null | undefined): GoogleScopeCapabilities {
    const lc = (scopes || []).map(s => (s || '').toLowerCase())
    const matchAny = (needles: string[]) => lc.some(s => needles.some(n => s === n || s.includes(n)))
    return {
        ads:           matchAny(['ads', 'adwords']),
        analytics:     matchAny(['analytics', 'ga4']),
        tagmanager:    matchAny(['tagmanager', 'gtm']),
        searchConsole: matchAny(['webmasters', 'search-console', 'searchconsole', 'gsc']),
        drive:         matchAny(['drive']),
        youtube:       matchAny(['youtube']),
    }
}
