/**
 * GSC Health Audit — systemic, all tenants.
 *
 * Closes the gap discovered 2026-06-21: the platform read ONLY Search Console's
 * Search Analytics endpoint (clicks/impressions). It never polled the surfaces
 * that generate Google's "new issue detected" emails — so indexing/coverage,
 * rich-result, and sitemap problems landed in the user's inbox but never in the
 * platform (no notification, no task, no fix).
 *
 * This detector polls the two API-accessible issue surfaces and turns them into
 * structured findings. The companion runner (seoMonitoringRunner.runGscHealthSweep)
 * dedups against open findings and raises ONE approval task + Telegram notice per
 * NEW finding.
 *
 * Coverage vs the GSC emails Google actually sends:
 *   sitemap couldn't fetch / errors / warnings  → Sitemaps API           ✓ full
 *   indexing/coverage (crawled-not-indexed, discovered, noindex, robots,
 *     canonical chosen by Google, fetch failed) → URL Inspection (per-URL) ✓ rotated
 *   rich results / enhancements invalid items   → URL Inspection rich-results ✓
 *   manual actions / security issues            → NO public API           ⚠ blind
 *                                                  (surfaced indirectly via the
 *                                                   search-traffic cliff check in
 *                                                   the runner + an instruction task)
 *   mobile usability                            → report retired by Google (2023)
 *
 * Auth: the tenant's gscTokens (OAuth refresh token + chosen siteUrl). Scope is
 * webmasters.readonly — enough for Sitemaps list + URL Inspection (both reads).
 * Fixes happen on the SITE (companion / WP), never via the GSC API, so no scope
 * upgrade / re-consent is needed.
 *
 * NOTE: the Sitemaps API `contents[].indexed` field is DEPRECATED and always
 * returns 0 — we deliberately ignore it (it is NOT "0 pages indexed").
 */

const WM = 'https://www.googleapis.com/webmasters/v3'
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type GscSeverity = 'critical' | 'high' | 'medium' | 'info'
export type GscCategory = 'sitemap' | 'indexing' | 'noindex' | 'robots' | 'canonical' | 'crawl' | 'rich_results' | 'traffic'

export interface GscFinding {
    id: string                 // STABLE dedup key (e.g. "noindex:https://site/x")
    severity: GscSeverity
    category: GscCategory
    url?: string
    summary: string            // short Hebrew headline
    detail: string             // Hebrew explanation + what it means
    autoFixable: boolean
    autoFixAction?: { kind: string; payload?: any }
}

export interface GscHealthReport {
    ok: boolean
    reason?: string
    siteUrl?: string
    findings: GscFinding[]
    counts: Record<GscSeverity, number>
    cleanState: boolean
    inspectedUrls: string[]          // which URLs were inspected this run (scope for resolve)
    sitemaps: Array<{ path: string; errors: number; warnings: number; isPending: boolean; lastDownloaded?: string }>
}

export interface GscTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    siteUrl?: string
    sites?: string[]
}

export interface GscAuditInput {
    tokens: GscTokens
    inspectUrls?: string[]           // priority URLs the runner supplies (homepage + rotating set)
    staleSitemapDays?: number        // default 21
    maxInspect?: number              // cap URL Inspection calls/run (rate-limit guard), default 40
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || !clientSecret || !refreshToken) return null
    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
        })
        const j = await res.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

/** Resolve which GSC property (sc-domain: vs URL-prefix) actually has permission
 *  for the stored siteUrl — same logic as gscEnrich, kept local to avoid an
 *  export churn there. */
async function resolveSite(accessToken: string, siteUrl: string): Promise<string> {
    try {
        const res = await fetch(`${WM}/sites`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
        const j = await res.json() as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> }
        const all = (j.siteEntry || []).filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser')
        const host = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '')
        const brand = host.split('.')[0]
        const domainMatch = all.find(s => s.siteUrl === `sc-domain:${host}`)
        const prefixMatch = all.find(s => s.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() === host)
        const brandMatch = all.find(s => s.siteUrl.toLowerCase().includes(brand))
        return domainMatch?.siteUrl || prefixMatch?.siteUrl || brandMatch?.siteUrl || siteUrl
    } catch { return siteUrl }
}

function normCanonical(u?: string): string {
    if (!u) return ''
    return u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
}

/** Functional / system pages that are INTENTIONALLY noindex (WooCommerce cart,
 *  checkout, account, login, feeds, add-to-cart links). Never flag these. */
function isSystemUrl(u: string): boolean {
    return /\/(cart|checkout|my-account|account|wishlist|basket|wp-admin|wp-login|login|lost-password|order-received|kifud-tashlum)(\/|$|\?)/i.test(u)
        || /[?&](add-to-cart|orderby|filter_|s)=/i.test(u)
        || /\/feed\/?$/i.test(u)
}

/** Real Google fetch-error states (vs *_UNSPECIFIED which means "no data yet",
 *  NOT a failure — flagging those produced false "crawl failed" on new pages). */
const REAL_FETCH_ERRORS = new Set(['SOFT_404', 'NOT_FOUND', 'ACCESS_DENIED', 'ACCESS_FORBIDDEN', 'SERVER_ERROR', 'REDIRECT_ERROR', 'BLOCKED_4XX', 'INTERNAL_CRAWL_ERROR', 'INVALID_URL', 'BLOCKED_ROBOTS_TXT'])

function sampleList(urls: string[], n = 5): string {
    return urls.slice(0, n).join(', ') + (urls.length > n ? ` ועוד ${urls.length - n}` : '')
}

/** URL Inspection matches Google's KNOWN URL form. For non-Latin (Hebrew) slugs
 *  Google stores the DECODED UTF-8 URL, but sitemaps emit percent-encoded <loc> —
 *  inspecting the encoded form falsely returns "URL is unknown to Google".
 *  Always inspect the decoded form. (Verified via A/B: encoded=unknown,
 *  decoded=Submitted and indexed.) */
function decodeForInspect(u: string): string {
    try { return decodeURIComponent(u) } catch { return u }
}

/** A coverageState string means "indexed and fine" — guard against the many
 *  "... not indexed" variants. */
function isIndexedOk(coverageState?: string): boolean {
    const s = (coverageState || '').toLowerCase()
    if (!s) return false
    if (s.includes('not indexed')) return false
    return s.includes('indexed')
}

export async function auditGscHealth(opts: GscAuditInput): Promise<GscHealthReport> {
    const findings: GscFinding[] = []
    const inspectedUrls: string[] = []
    const sitemaps: GscHealthReport['sitemaps'] = []
    const staleDays = opts.staleSitemapDays ?? 21
    const maxInspect = opts.maxInspect ?? 40

    if (!opts.tokens?.refreshToken || !opts.tokens?.siteUrl) {
        return { ok: false, reason: 'gsc_not_connected', findings, counts: emptyCounts(), cleanState: true, inspectedUrls, sitemaps }
    }
    const accessToken = (opts.tokens.expiresAt && opts.tokens.expiresAt > Date.now() && opts.tokens.accessToken)
        ? opts.tokens.accessToken
        : await refreshAccessToken(opts.tokens.refreshToken)
    if (!accessToken) {
        return { ok: false, reason: 'token_refresh_failed', findings, counts: emptyCounts(), cleanState: true, inspectedUrls, sitemaps }
    }
    const site = await resolveSite(accessToken, opts.tokens.siteUrl)
    const authHeader = { Authorization: `Bearer ${accessToken}` }

    // ── 1. Sitemaps ───────────────────────────────────────────────────────
    try {
        const r = await fetch(`${WM}/sites/${encodeURIComponent(site)}/sitemaps`, { headers: authHeader, signal: AbortSignal.timeout(20_000) })
        const j = await r.json() as { sitemap?: Array<{ path: string; errors?: string | number; warnings?: string | number; isPending?: boolean; lastDownloaded?: string }> }
        const list = j.sitemap || []
        if (list.length === 0) {
            findings.push({
                id: 'sitemap_missing', severity: 'high', category: 'sitemap',
                summary: 'לא הוגש Sitemap ל-Search Console',
                detail: 'אין אף מפת אתר מוגשת ב-GSC. בלי Sitemap גוגל מגלה דפים לאט יותר ועלול לפספס דפים חדשים. הגישו את sitemap_index.xml ב-Search Console → Sitemaps.',
                autoFixable: false,
            })
        }
        for (const s of list) {
            const errors = Number(s.errors || 0)
            const warnings = Number(s.warnings || 0)
            const ageDays = s.lastDownloaded ? (Date.now() - new Date(s.lastDownloaded).getTime()) / 86_400_000 : Infinity
            sitemaps.push({ path: s.path, errors, warnings, isPending: !!s.isPending, lastDownloaded: s.lastDownloaded })
            if (errors > 0) {
                findings.push({
                    id: `sitemap_error:${s.path}`, severity: 'high', category: 'sitemap', url: s.path,
                    summary: `ב-Sitemap יש ${errors} שגיאות`,
                    detail: `גוגל דיווח על ${errors} שגיאות ב-${s.path}. שגיאות Sitemap מונעות אינדוקס תקין. בדקו ב-Search Console → Sitemaps את פירוט השגיאות (לרוב: URL לא נגיש / 404 / חסום ב-robots).`,
                    autoFixable: false,
                })
            }
            if (warnings > 0) {
                findings.push({
                    id: `sitemap_warning:${s.path}`, severity: 'medium', category: 'sitemap', url: s.path,
                    summary: `ב-Sitemap יש ${warnings} אזהרות`,
                    detail: `גוגל דיווח על ${warnings} אזהרות ב-${s.path}. אזהרות לא חוסמות אינדוקס אך כדאי לתקן (לרוב: URLs שחוסמים ב-robots או דפי noindex שנכללו ב-Sitemap).`,
                    autoFixable: false,
                })
            }
            if (Number.isFinite(ageDays) && ageDays > staleDays) {
                findings.push({
                    id: `sitemap_stale:${s.path}`, severity: 'medium', category: 'sitemap', url: s.path,
                    summary: `Sitemap לא נקרא ${Math.round(ageDays)} ימים`,
                    detail: `גוגל לא הוריד את ${s.path} כבר ${Math.round(ageDays)} ימים. ייתכן שהקובץ לא נגיש או שהשרת מחזיר שגיאה. ודאו שה-Sitemap נטען ושלחו אותו מחדש ב-Search Console.`,
                    autoFixable: false,
                })
            }
            if (s.isPending && (!Number.isFinite(ageDays) || ageDays > 2)) {
                findings.push({
                    id: `sitemap_pending:${s.path}`, severity: 'medium', category: 'sitemap', url: s.path,
                    summary: 'Sitemap תקוע בעיבוד',
                    detail: `${s.path} מסומן "בהמתנה" ועדיין לא עובד על-ידי גוגל. אם זה נמשך מעל יממה — בדקו שהקובץ נגיש ושלחו מחדש.`,
                    autoFixable: false,
                })
            }
        }
    } catch (e) {
        findings.push({
            id: 'sitemap_read_failed', severity: 'medium', category: 'sitemap',
            summary: 'לא ניתן לקרוא את נתוני ה-Sitemap',
            detail: `קריאת Sitemaps API נכשלה: ${(e as Error).message.slice(0, 160)}`,
            autoFixable: false,
        })
    }

    // ── 2. URL Inspection (per-URL coverage / canonical / rich-results) ────
    // Bucket per-URL signals, then emit ONE aggregated finding per category —
    // mirrors GSC's own emails ("N pages have issue X") and avoids spamming a
    // task per URL. System/functional pages are excluded (intentionally noindex).
    const urls = (opts.inspectUrls || []).map(decodeForInspect).filter(u => !isSystemUrl(u)).slice(0, maxInspect)
    const buckets = {
        noindex: [] as string[],
        robots: [] as string[],
        crawlErr: [] as Array<{ url: string; state: string }>,
        notIndexed: [] as Array<{ url: string; cov: string; thin: boolean }>,
        canonical: [] as Array<{ url: string; user: string; google: string }>,
        richFail: [] as Array<{ url: string; types: string }>,
    }
    for (const url of urls) {
        try {
            const r = await fetch(INSPECT, {
                method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inspectionUrl: url, siteUrl: site }), signal: AbortSignal.timeout(30_000),
            })
            const j = await r.json() as any
            if (!r.ok) {
                if (r.status === 429) break   // rate limit → stop, resume next run
                continue
            }
            inspectedUrls.push(url)
            const idx = j.inspectionResult?.indexStatusResult || {}
            const rr = j.inspectionResult?.richResultsResult

            if (idx.robotsTxtState === 'DISALLOWED') {
                buckets.robots.push(url)
            } else if (idx.indexingState === 'BLOCKED_BY_META_TAG' || idx.indexingState === 'BLOCKED_BY_HTTP_HEADER') {
                buckets.noindex.push(url)
            } else if (idx.pageFetchState && REAL_FETCH_ERRORS.has(idx.pageFetchState)) {
                buckets.crawlErr.push({ url, state: idx.pageFetchState })
            } else if (!isIndexedOk(idx.coverageState)) {
                const cov = idx.coverageState || idx.verdict || 'לא מאונדקס'
                // thin/discovery → page refresh helps; "unknown to Google" = not yet discovered.
                const thin = /crawled|discovered|not indexed|unknown/i.test(cov)
                buckets.notIndexed.push({ url, cov, thin })
            } else if (idx.userCanonical && idx.googleCanonical && normCanonical(idx.userCanonical) !== normCanonical(idx.googleCanonical)) {
                buckets.canonical.push({ url, user: idx.userCanonical, google: idx.googleCanonical })
            }

            if (rr && rr.verdict === 'FAIL') {
                const types = (rr.detectedItems || []).map((d: any) => d.richResultType).filter(Boolean).join(', ')
                buckets.richFail.push({ url, types })
            }
        } catch {
            // per-URL non-fatal
        }
    }

    // ── Aggregate buckets → findings (stable per-category IDs for dedup) ────
    if (buckets.robots.length) {
        findings.push({
            id: 'robots_bulk', severity: 'high', category: 'robots',
            summary: `${buckets.robots.length} דפים חסומים ב-robots.txt`,
            detail: `גוגל לא יכול לסרוק ${buckets.robots.length} דפים בגלל robots.txt (לדוגמה: ${sampleList(buckets.robots)}). אם הם אמורים להופיע בחיפוש — הסירו את חוקי ה-Disallow.`,
            autoFixable: false,
        })
    }
    if (buckets.noindex.length) {
        findings.push({
            id: 'noindex_bulk', severity: 'high', category: 'noindex',
            summary: `${buckets.noindex.length} דפי תוכן מסומנים noindex`,
            detail: `${buckets.noindex.length} דפים (לא דפי מערכת) מכילים תג noindex ולכן לא יופיעו בגוגל (לדוגמה: ${sampleList(buckets.noindex)}). אם זה לא מכוון — הסירו את ה-noindex בהגדרות ה-SEO של הדפים.`,
            autoFixable: false,
        })
    }
    if (buckets.crawlErr.length) {
        const sample = buckets.crawlErr.slice(0, 5).map(x => `${x.url} (${x.state})`).join(', ')
        findings.push({
            id: 'crawl_errors', severity: 'high', category: 'crawl',
            summary: `${buckets.crawlErr.length} דפים עם שגיאת סריקה`,
            detail: `גוגל נכשל בטעינת ${buckets.crawlErr.length} דפים (לדוגמה: ${sample}). בדקו זמינות שרת / שגיאות 4xx-5xx / הפניות שבורות.`,
            autoFixable: false,
        })
    }
    if (buckets.notIndexed.length) {
        const all = buckets.notIndexed.map(x => x.url)
        const thinUrls = buckets.notIndexed.filter(x => x.thin).map(x => x.url)
        findings.push({
            id: 'not_indexed_bulk', severity: 'medium', category: 'indexing',
            summary: `${all.length} דפים לא מאונדקסים בגוגל`,
            detail: `גוגל לא אינדקס ${all.length} דפים (לדוגמה: ${sampleList(all)}). סיבות נפוצות: דף חדש שטרם נסרק, תוכן דק, או מעט קישורים פנימיים. רענון תוכן + קישורים פנימיים מזרז אינדוקס.`,
            autoFixable: thinUrls.length > 0,
            autoFixAction: thinUrls.length > 0 ? { kind: 'gsc_refresh_page', payload: { urls: thinUrls.slice(0, 20) } } : undefined,
        })
    }
    if (buckets.canonical.length) {
        findings.push({
            id: 'canonical_bulk', severity: 'medium', category: 'canonical',
            summary: `${buckets.canonical.length} דפים: גוגל בחר קנוניקל אחר`,
            detail: `ב-${buckets.canonical.length} דפים גוגל בחר כתובת קנונית שונה מזו שהוגדרה (לדוגמה: ${sampleList(buckets.canonical.map(x => x.url))}). ייתכן תוכן כפול — ודאו קנוניקל נכון ושאין דפים כמעט-זהים.`,
            autoFixable: false,
        })
    }
    if (buckets.richFail.length) {
        const types = Array.from(new Set(buckets.richFail.flatMap(x => x.types.split(', ').filter(Boolean))))
        findings.push({
            id: 'rich_results_bulk', severity: 'high', category: 'rich_results',
            summary: `${buckets.richFail.length} דפים עם שגיאות schema / תוצאות עשירות`,
            detail: `ב-${buckets.richFail.length} דפים יש פריטי schema לא תקינים (${types.join(', ') || 'schema'}) — גוגל לא יציג עבורם תוצאות עשירות. אפשר לייצר מחדש את ה-schema אוטומטית.`,
            autoFixable: true,
            autoFixAction: { kind: 'gsc_regen_schema', payload: { urls: buckets.richFail.map(x => x.url).slice(0, 20) } },
        })
    }

    return finalize(findings, site, inspectedUrls, sitemaps)
}

function emptyCounts(): Record<GscSeverity, number> {
    return { critical: 0, high: 0, medium: 0, info: 0 }
}

function finalize(findings: GscFinding[], siteUrl: string, inspectedUrls: string[], sitemaps: GscHealthReport['sitemaps']): GscHealthReport {
    const counts = emptyCounts()
    for (const f of findings) counts[f.severity]++
    return {
        ok: true,
        siteUrl,
        findings,
        counts,
        cleanState: counts.critical === 0 && counts.high === 0,
        inspectedUrls,
        sitemaps,
    }
}

const SEV_SIGIL: Record<GscSeverity, string> = { critical: '🔴', high: '🟠', medium: '🟡', info: 'ℹ️' }
export function sigilFor(sev: GscSeverity): string { return SEV_SIGIL[sev] }