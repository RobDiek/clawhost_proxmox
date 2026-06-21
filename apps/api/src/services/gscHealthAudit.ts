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
export type GscCategory = 'sitemap' | 'indexing' | 'noindex' | 'robots' | 'canonical' | 'crawl' | 'rich_results'

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
    const urls = (opts.inspectUrls || []).slice(0, maxInspect)
    for (const url of urls) {
        try {
            const r = await fetch(INSPECT, {
                method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inspectionUrl: url, siteUrl: site }), signal: AbortSignal.timeout(30_000),
            })
            const j = await r.json() as any
            if (!r.ok) {
                // 429 = rate limit; stop further inspection this run (avoid burning quota).
                if (r.status === 429) break
                continue
            }
            inspectedUrls.push(url)
            const idx = j.inspectionResult?.indexStatusResult || {}
            const rr = j.inspectionResult?.richResultsResult

            if (idx.robotsTxtState === 'DISALLOWED') {
                findings.push({
                    id: `robots:${url}`, severity: 'high', category: 'robots', url,
                    summary: 'הדף חסום ב-robots.txt',
                    detail: `גוגל לא יכול לסרוק את ${url} כי robots.txt חוסם אותו. אם הדף אמור להופיע בחיפוש — הסירו את חוק ה-Disallow המתאים.`,
                    autoFixable: false,
                })
            } else if (idx.indexingState === 'BLOCKED_BY_META_TAG' || idx.indexingState === 'BLOCKED_BY_ROBOTS_TXT' || idx.indexingState === 'BLOCKED_BY_HTTP_HEADER') {
                findings.push({
                    id: `noindex:${url}`, severity: 'high', category: 'noindex', url,
                    summary: 'הדף מסומן noindex / חסום מאינדוקס',
                    detail: `${url} מכיל תג/כותרת noindex (${idx.indexingState}) ולכן לא יופיע בגוגל. אם זה לא מכוון — הסירו את ה-noindex (לרוב בהגדרות SEO של הדף).`,
                    autoFixable: false,
                })
            } else if (idx.pageFetchState && idx.pageFetchState !== 'SUCCESSFUL') {
                findings.push({
                    id: `crawl:${url}`, severity: 'high', category: 'crawl', url,
                    summary: 'גוגל נכשל בטעינת הדף',
                    detail: `מצב הסריקה של ${url} הוא ${idx.pageFetchState} (לא SUCCESSFUL). גוגל לא הצליח לטעון את הדף — בדקו זמינות שרת / שגיאות / הפניות.`,
                    autoFixable: false,
                })
            } else if (!isIndexedOk(idx.coverageState)) {
                // Not indexed for a non-config reason → usually quality/thin/discovery.
                const cov = idx.coverageState || idx.verdict || 'לא מאונדקס'
                const thinish = /crawled|discovered|not indexed/i.test(cov)
                findings.push({
                    id: `indexing:${url}`, severity: thinish ? 'medium' : 'high', category: 'indexing', url,
                    summary: `דף לא מאונדקס: ${cov}`,
                    detail: `גוגל לא אינדקס את ${url} (סטטוס: "${cov}"). ${thinish ? 'לרוב הסיבה היא תוכן דק/חלש או חוסר קישורים פנימיים. רענון התוכן + קישורים פנימיים מעלים את הסיכוי לאינדוקס.' : 'בדקו חסימות / קנוניקל / איכות הדף.'}`,
                    autoFixable: thinish,
                    autoFixAction: thinish ? { kind: 'gsc_refresh_page', payload: { url } } : undefined,
                })
            } else if (idx.userCanonical && idx.googleCanonical && normCanonical(idx.userCanonical) !== normCanonical(idx.googleCanonical)) {
                findings.push({
                    id: `canonical:${url}`, severity: 'medium', category: 'canonical', url,
                    summary: 'גוגל בחר קנוניקל שונה מזה שהוגדר',
                    detail: `עבור ${url} הגדרתם קנוניקל ${idx.userCanonical} אך גוגל בחר ${idx.googleCanonical}. ייתכן תוכן כפול. ודאו שהקנוניקל נכון ושאין דפים כמעט-זהים.`,
                    autoFixable: false,
                })
            }

            // Rich results / enhancements
            if (rr && rr.verdict === 'FAIL') {
                const types = (rr.detectedItems || []).map((d: any) => d.richResultType).filter(Boolean)
                findings.push({
                    id: `rich_results:${url}`, severity: 'high', category: 'rich_results', url,
                    summary: `שגיאות בתוצאות עשירות (${types.join(', ') || 'schema'})`,
                    detail: `ב-${url} יש פריטי schema לא תקינים (${types.join(', ') || 'לא ידוע'}) — גוגל לא יציג עבורם תוצאות עשירות. אפשר לייצר מחדש את ה-schema לדף.`,
                    autoFixable: true,
                    autoFixAction: { kind: 'gsc_regen_schema', payload: { url } },
                })
            }
        } catch {
            // per-URL non-fatal
        }
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