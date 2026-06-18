/**
 * WordPress companion plugin installer + GTM migration helper.
 * Phase 2026.02 Block 6 Pattern J.
 *
 * Handles:
 *   - Build Flowmatic companion plugin .zip from scripts/clawflow-companion-plugin.php
 *   - Install + activate plugin via WP REST /wp/v2/plugins endpoint
 *   - Scan site for stale GTM- snippets after install
 *   - Remove stale snippet wp_options after user confirmation
 *   - POST new GTM snippet to /wp-json/clawflow/v1/gtm-snippet
 *
 * Auth flow: uses agent_integrations.wordpress { url, user, appPassword }
 * (set during onboarding). Basic Auth via Application Password — works
 * for any WP 5.6+ site with the user role having manage_options.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface WpCfg {
    url: string                // https://example.com (no trailing slash)
    user: string
    appPassword: string
}

interface InstallResult {
    installed: boolean
    activated: boolean
    pluginSlug: string
    method: 'rest_upload' | 'rest_install_existing' | 'already_active'
    notes: string[]
    error?: string
}

interface ScanFinding {
    source: string             // 'wp_options' | 'theme_file'
    key: string                // option_name or file name
    gtmIds: string[]           // foreign GTM- IDs found
    excerpt: string
}

interface ScanResult {
    ourPublicId: string
    findings: ScanFinding[]
    foreignCount: number
}

interface InstallSnippetResult {
    ok: boolean
    publicId?: string
    error?: string
}

// ─── Plugin file lookup + zip builder ─────────────────────────────────────

function findPluginPhpPath(): string | null {
    const candidates = [
        join(process.cwd(), 'scripts', 'clawflow-companion-plugin.php'),
        join(process.cwd(), '..', 'scripts', 'clawflow-companion-plugin.php'),
        join(process.cwd(), '..', '..', 'scripts', 'clawflow-companion-plugin.php'),
        '/opt/openclaw-hosting/scripts/clawflow-companion-plugin.php',
    ]
    for (const p of candidates) {
        if (existsSync(p)) return p
    }
    return null
}

/**
 * Builds an in-memory ZIP buffer containing the companion plugin file.
 * WordPress REST /wp/v2/plugins endpoint expects a multipart upload of a
 * zipped plugin folder. The folder name inside the zip becomes the slug.
 */
async function buildPluginZipBuffer(): Promise<Buffer> {
    const phpPath = findPluginPhpPath()
    if (!phpPath) throw new Error('Companion plugin PHP file not found in scripts/ directory')
    const phpContent = readFileSync(phpPath, 'utf8')

    // Use node 'zlib' for deflate; we need full ZIP archive structure.
    // archiver is not part of stdlib — use a minimal hand-rolled ZIP since
    // we only have ONE file. ZIP local file header + central directory.
    return makeMinimalZip([
        { path: 'clawflow-companion/clawflow-companion.php', content: Buffer.from(phpContent, 'utf8') },
    ])
}

/**
 * Minimal ZIP archive (one file, stored uncompressed). Avoids dep on
 * archiver/adm-zip. Enough for tiny plugin packaging.
 *
 * Format reference: https://www.iana.org/assignments/media-types/application/zip
 */
function makeMinimalZip(entries: Array<{ path: string; content: Buffer }>): Buffer {
    const localHeaders: Buffer[] = []
    const centralDir: Buffer[] = []
    let offset = 0

    for (const e of entries) {
        const pathBuf = Buffer.from(e.path, 'utf8')
        const crc = crc32(e.content)
        const size = e.content.length

        // Local file header
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)          // signature
        local.writeUInt16LE(20, 4)                  // version needed
        local.writeUInt16LE(0, 6)                   // flags
        local.writeUInt16LE(0, 8)                   // compression method (0 = stored)
        local.writeUInt16LE(0, 10)                  // last mod time
        local.writeUInt16LE(0, 12)                  // last mod date
        local.writeUInt32LE(crc, 14)                // CRC-32
        local.writeUInt32LE(size, 18)               // compressed size
        local.writeUInt32LE(size, 22)               // uncompressed size
        local.writeUInt16LE(pathBuf.length, 26)     // file name length
        local.writeUInt16LE(0, 28)                  // extra field length

        const localBlock = Buffer.concat([local, pathBuf, e.content])
        localHeaders.push(localBlock)

        // Central directory entry
        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)        // signature
        central.writeUInt16LE(20, 4)                // version made by
        central.writeUInt16LE(20, 6)                // version needed
        central.writeUInt16LE(0, 8)                 // flags
        central.writeUInt16LE(0, 10)                // compression method
        central.writeUInt16LE(0, 12)                // last mod time
        central.writeUInt16LE(0, 14)                // last mod date
        central.writeUInt32LE(crc, 16)              // CRC-32
        central.writeUInt32LE(size, 20)             // compressed size
        central.writeUInt32LE(size, 24)             // uncompressed size
        central.writeUInt16LE(pathBuf.length, 28)   // file name length
        central.writeUInt16LE(0, 30)                // extra field length
        central.writeUInt16LE(0, 32)                // comment length
        central.writeUInt16LE(0, 34)                // disk number start
        central.writeUInt16LE(0, 36)                // internal file attrs
        central.writeUInt32LE(0, 38)                // external file attrs
        central.writeUInt32LE(offset, 42)           // relative offset of local header

        centralDir.push(Buffer.concat([central, pathBuf]))
        offset += localBlock.length
    }

    const centralDirBuf = Buffer.concat(centralDir)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)               // signature
    eocd.writeUInt16LE(0, 4)                        // disk number
    eocd.writeUInt16LE(0, 6)                        // disk where cdir starts
    eocd.writeUInt16LE(entries.length, 8)           // num entries on disk
    eocd.writeUInt16LE(entries.length, 10)          // total entries
    eocd.writeUInt32LE(centralDirBuf.length, 12)    // cdir size
    eocd.writeUInt32LE(offset, 16)                  // cdir offset
    eocd.writeUInt16LE(0, 20)                       // comment length

    return Buffer.concat([...localHeaders, centralDirBuf, eocd])
}

const CRC_TABLE: number[] = (() => {
    const table: number[] = []
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
        }
        table[i] = c >>> 0
    }
    return table
})()

function crc32(buf: Buffer): number {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

// ─── WP REST helpers ──────────────────────────────────────────────────────

function authHeader(cfg: WpCfg): string {
    return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
}

function normalizeWpUrl(url: string): string {
    return url.replace(/\/+$/, '')
}

async function wpGet(cfg: WpCfg, path: string): Promise<any> {
    const res = await fetch(`${normalizeWpUrl(cfg.url)}${path}`, {
        headers: { Authorization: authHeader(cfg) },
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`WP GET ${path} → ${res.status}: ${txt.slice(0, 300)}`)
    try { return JSON.parse(txt) } catch { return txt }
}

async function wpPostJson(cfg: WpCfg, path: string, body: unknown): Promise<any> {
    const res = await fetch(`${normalizeWpUrl(cfg.url)}${path}`, {
        method: 'POST',
        headers: {
            Authorization: authHeader(cfg),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`WP POST ${path} → ${res.status}: ${txt.slice(0, 300)}`)
    try { return JSON.parse(txt) } catch { return txt }
}

async function wpDelete(cfg: WpCfg, path: string): Promise<any> {
    const res = await fetch(`${normalizeWpUrl(cfg.url)}${path}?force=true`, {
        method: 'DELETE',
        headers: { Authorization: authHeader(cfg) },
    })
    const txt = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`WP DELETE ${path} → ${res.status}: ${txt.slice(0, 300)}`)
    try { return JSON.parse(txt) } catch { return txt }
}

// ─── Plugin install via REST /wp/v2/plugins ───────────────────────────────

/**
 * Build the companion plugin zip on demand — used by the
 * `/hosting/instances/:id/wp/companion-plugin.zip` download endpoint so
 * users can upload via WP Admin → Plugins → Add New → Upload Plugin.
 */
export async function buildCompanionPluginZip(): Promise<Buffer> {
    return await buildPluginZipBuffer()
}

/**
 * Check + activate the Flowmatic companion plugin via WP REST API.
 *
 * WordPress's POST /wp/v2/plugins requires a `slug` from the public
 * WP.org plugin directory — there is NO standard REST mechanism for
 * uploading a CUSTOM plugin .zip (by design, security). So the install
 * flow is necessarily HYBRID:
 *   1. List installed plugins. If 'clawflow-companion' is active → ok.
 *   2. If installed but inactive → activate via POST {status:'active'}.
 *   3. If not installed → surface a clear notInstalled state to caller
 *      so the UI can offer the .zip download + manual upload instruction.
 *      A retry path then runs steps 1+2 once user finishes.
 *
 * Requires Application Password owner with manage_options.
 */
export async function installCompanionPlugin(cfg: WpCfg): Promise<InstallResult> {
    const notes: string[] = []
    const pluginSlug = 'clawflow-companion/clawflow-companion'

    // 1. Check current state
    let plugins: any[] = []
    try {
        plugins = await wpGet(cfg, '/wp-json/wp/v2/plugins')
        notes.push(`listed ${plugins.length} installed plugins`)
    } catch (err) {
        notes.push(`plugin list failed: ${(err as Error).message.slice(0, 150)}`)
    }

    const existing = plugins.find((p) => p.plugin === pluginSlug || (p.plugin || '').endsWith('clawflow-companion'))
    if (existing && existing.status === 'active') {
        return { installed: true, activated: true, pluginSlug, method: 'already_active', notes }
    }
    if (existing) {
        // Inactive — activate
        try {
            await wpPostJson(cfg, `/wp-json/wp/v2/plugins/${encodeURIComponent(existing.plugin)}`, { status: 'active' })
            notes.push('activated existing inactive plugin')
            return { installed: true, activated: true, pluginSlug, method: 'rest_install_existing', notes }
        } catch (err) {
            notes.push(`activate failed: ${(err as Error).message.slice(0, 200)}`)
            return { installed: true, activated: false, pluginSlug, method: 'rest_install_existing', notes, error: (err as Error).message }
        }
    }

    // 2. Plugin not installed. WP REST does NOT accept custom plugin .zip
    //    uploads (only WP.org slugs). Surface the manual install path so
    //    the wizard UI can offer a download link + clear Hebrew instructions.
    notes.push('plugin not installed — manual upload required via WP Admin (REST does not accept custom plugin uploads)')
    return {
        installed: false,
        activated: false,
        pluginSlug,
        method: 'rest_upload',
        notes,
        error: 'NOT_INSTALLED_MANUAL_REQUIRED',
    }
}

// ─── Flowmatic REST helpers ────────────────────────────────────────────────

export async function scanStaleGtmSnippets(cfg: WpCfg): Promise<ScanResult> {
    return await wpPostJson(cfg, '/wp-json/clawflow/v1/scan-other-gtm', {})
}

export async function removeStaleGtmOptions(cfg: WpCfg, optionKeys: string[]): Promise<{ ok: boolean; removed: string[] }> {
    return await wpPostJson(cfg, '/wp-json/clawflow/v1/remove-stale-gtm', { confirm: true, removeOptionKeys: optionKeys })
}

export async function installGtmSnippet(
    cfg: WpCfg,
    publicId: string,
    head: string,
    body: string,
): Promise<InstallSnippetResult> {
    try {
        const res = await wpPostJson(cfg, '/wp-json/clawflow/v1/gtm-snippet', { publicId, head, body })
        return { ok: !!res.ok, publicId: res.publicId }
    } catch (err) {
        return { ok: false, error: (err as Error).message }
    }
}

/**
 * Point a third-party tracking plugin's GTM container at OURS (the "integrate"
 * conflict-resolution path) — keeps the plugin + its Meta/Woo, swaps only the
 * GTM container id. `probe:true` asks the companion whether it supports the
 * endpoint (older companions return 404 → supported:false → caller falls back
 * to "replace" or prompts a companion update). Currently knows PixelYourSite.
 */
export async function setPluginGtmContainer(
    cfg: WpCfg,
    plugin: string,
    publicId: string,
    opts: { probe?: boolean } = {},
): Promise<{ ok: boolean; supported: boolean; error?: string; changes?: string[] }> {
    try {
        const res = await wpPostJson(cfg, '/wp-json/clawflow/v1/set-plugin-gtm', { plugin, publicId, probe: !!opts.probe })
        return { ok: !!res.ok, supported: true, changes: res.changes }
    } catch (err) {
        const msg = (err as Error).message
        if (/\b404\b|rest_no_route|no route|not.?found/i.test(msg)) return { ok: false, supported: false, error: 'endpoint_not_available' }
        return { ok: false, supported: true, error: msg }
    }
}

export interface WpCapabilities {
    pluginVersion: string
    wordpressVersion: string
    wooCommerceActive: boolean
    wooCommerceVersion: string | null
    gtmInstalled: boolean
    siteUrl: string
}

export interface TrackingSend {
    platform: 'meta_pixel' | 'google_ads' | 'ga4' | 'gtm' | 'pinterest' | 'tiktok' | 'datalayer'
    id: string
    feature: string
}

export interface DetectedTrackingPlugin {
    plugin: string
    name: string
    version: string
    active: boolean
    sends: TrackingSend[]
    resolutionHint: string
}

export interface TrackingAuditResult {
    detected: DetectedTrackingPlugin[]
    unknownTracking: string[]
    raw?: Record<string, unknown>
    scannedAt: string
}

/**
 * Probe the companion plugin's /capabilities endpoint to discover what
 * plugins/features the site has — so the UI can show "WooCommerce v8.5
 * detected → ecommerce dataLayer hooks active" or similar. Returns null
 * if plugin isn't installed yet OR endpoint is unreachable (legacy v1.0
 * plugin without /capabilities — caller should treat as "unknown").
 */
export async function probeWpCapabilities(cfg: WpCfg): Promise<WpCapabilities | null> {
    try {
        const res = await wpGet(cfg, '/wp-json/clawflow/v1/capabilities')
        if (!res || typeof res !== 'object') return null
        return res as WpCapabilities
    } catch {
        return null
    }
}

/**
 * Run the tracking conflict audit on the site. Requires companion plugin
 * v1.3.0+. Returns null if endpoint not available (older plugin) or
 * request fails — caller should surface this as "upgrade plugin to v1.3+
 * to enable conflict detection".
 */
export async function probeTrackingAudit(cfg: WpCfg): Promise<TrackingAuditResult | null> {
    try {
        const res = await wpGet(cfg, '/wp-json/clawflow/v1/tracking-audit')
        if (!res || typeof res !== 'object') return null
        return res as TrackingAuditResult
    } catch {
        return null
    }
}

/**
 * Disable a tracking feature on a specific plugin. Used to resolve
 * conflicts surgically (e.g. keep PixelYourSite for Facebook Pixel,
 * disable its Google Ads tracking).
 */
export async function disablePluginTrackingFeature(
    cfg: WpCfg,
    plugin: string,
    feature: 'google_ads' | 'ga4' | 'meta_pixel' | 'all' | 'deactivate_plugin',
): Promise<{ ok: boolean; changes: string[] }> {
    return await wpPostJson(cfg, '/wp-json/clawflow/v1/disable-plugin-feature', { plugin, feature })
}

export async function deleteOrphanedWpOptions(
    cfg: WpCfg,
    keys: string[],
): Promise<{ ok: boolean; deleted: string[]; rejected: string[] }> {
    return await wpPostJson(cfg, '/wp-json/clawflow/v1/delete-wp-options', { keys })
}

export interface SiteGtmScan {
    url: string
    gtmIds: string[]
    status: number
    contexts: Array<{ gtmId: string; excerpt: string; hint: string }>
}

export interface DirectTrackingLoad {
    platform: 'google_ads' | 'ga4' | 'gtm' | 'meta_pixel'
    id: string
    // Script src URL (for gtag/js loads) or inline-script context (for fbq init)
    sourceUrl?: string
    // Short excerpt of surrounding HTML — helps identify which plugin owns it
    excerpt: string
    // Heuristic hint based on excerpt patterns
    hint: string
}

export interface SiteTrackingScan {
    url: string
    status: number
    directLoads: DirectTrackingLoad[]   // gtag/js?id=AW-/G-, GTM scripts, fbq init scripts
}

/**
 * Scan the live homepage HTML for GTM- snippets — does NOT require the
 * companion plugin (works on any WP/non-WP site). Used as a sanity check
 * before AND after migration.
 *
 * Phase 2026.02 Block 6 enhancement: also captures ~100 chars of context
 * around each match so we can hint at where the snippet is loaded from
 * (header.php inline, third-party plugin, CDN worker, gtm-loader script,
 * etc.). Helps users find OLD GTM- snippets our automatic cleanup can't
 * reach (anything outside wp_options or theme header.php/functions.php).
 */
export async function scanSiteHtmlForGtm(siteUrl: string): Promise<SiteGtmScan> {
    const url = normalizeWpUrl(siteUrl)
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Flowmatic GTM Scanner/1.0' } })
        const html = await res.text().catch(() => '')
        const re = /GTM-[A-Z0-9]{4,}/g
        const seen = new Set<string>()
        const contexts: SiteGtmScan['contexts'] = []
        let m: RegExpExecArray | null
        while ((m = re.exec(html)) !== null) {
            const id = m[0]
            if (seen.has(id)) continue
            seen.add(id)
            const idx = m.index
            const start = Math.max(0, idx - 120)
            const end = Math.min(html.length, idx + 120)
            const excerpt = html.slice(start, end).replace(/\s+/g, ' ').trim()
            // Best-effort hint: look for typical loader patterns within the excerpt
            let hint = 'unknown loader'
            if (/<!--\s*google\s+tag\s+manager/i.test(excerpt)) hint = 'inline GTM bootstrap script (hardcoded or theme)'
            else if (/gtm\.js|gtm-loader|googletagmanager/i.test(excerpt)) hint = 'GTM loader (gtm.js / googletagmanager.com)'
            else if (/dataLayer/i.test(excerpt)) hint = 'dataLayer push pattern (could be plugin or theme)'
            else if (/<iframe[^>]+ns\.html/i.test(excerpt)) hint = 'noscript iframe (gtm.js fallback)'
            contexts.push({ gtmId: id, excerpt: excerpt.slice(0, 240), hint })
        }
        return { url, gtmIds: Array.from(seen), status: res.status, contexts }
    } catch {
        return { url, gtmIds: [], status: 0, contexts: [] }
    }
}

/**
 * Scan live HTML for ALL tracking ID loads — not just GTM. Catches:
 *   gtag/js?id=AW-XXX       → direct Google Ads conversion gtag
 *   gtag/js?id=G-XXX        → direct GA4 gtag
 *   gtag/js?id=GTM-XXX      → GTM via gtag wrapper
 *   fbq('init', '12345')    → Meta Pixel inline init
 *
 * Works independently of WP plugin slug detection. Detects tracking
 * even when our /tracking-audit endpoint missed the plugin (because
 * its option key wasn't recognized). Returns context around each match
 * with a heuristic hint about which plugin/source emits it.
 */
export async function scanSiteHtmlForTrackingIds(siteUrl: string): Promise<SiteTrackingScan> {
    const url = normalizeWpUrl(siteUrl)
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Flowmatic Tracking Scanner/1.0' } })
        const html = await res.text().catch(() => '')
        const directLoads: DirectTrackingLoad[] = []

        const captureContext = (idx: number, idLen: number): { excerpt: string; hint: string } => {
            const start = Math.max(0, idx - 200)
            const end = Math.min(html.length, idx + idLen + 200)
            const excerpt = html.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 400)
            // Heuristic hint — extract plugin name from comments / src paths
            let hint = 'unknown source'
            if (/google\s+for\s+woocommerce/i.test(excerpt)) hint = 'Google for WooCommerce plugin'
            else if (/google-listings-and-ads/i.test(excerpt)) hint = 'Google Listings & Ads plugin'
            else if (/pixelyoursite|pys[._-]/i.test(excerpt)) hint = 'PixelYourSite plugin'
            else if (/monsterinsights/i.test(excerpt)) hint = 'MonsterInsights plugin'
            else if (/exactmetrics/i.test(excerpt)) hint = 'ExactMetrics plugin'
            else if (/googlesitekit|site[._-]?kit/i.test(excerpt)) hint = 'Site Kit by Google plugin'
            else if (/gtm4wp|duracelltomi/i.test(excerpt)) hint = 'GTM4WP plugin'
            else if (/wp-content\/themes\/([^/'"\s]+)/i.test(excerpt)) {
                const themeMatch = /wp-content\/themes\/([^/'"\s]+)/i.exec(excerpt)
                hint = `theme: ${themeMatch?.[1] || 'unknown'}`
            }
            else if (/<!--\s*([^>]+?)\s*-->/i.test(excerpt)) {
                const commentMatch = /<!--\s*([^>]+?)\s*-->/i.exec(excerpt)
                hint = `comment: ${(commentMatch?.[1] || '').slice(0, 80)}`
            }
            return { excerpt, hint }
        }

        // gtag/js?id=XXX direct loads
        const gtagRe = /<script[^>]+src=["']https?:\/\/(?:www\.)?googletagmanager\.com\/gtag\/js\?id=([A-Z0-9-]+)["']/gi
        let m: RegExpExecArray | null
        while ((m = gtagRe.exec(html)) !== null) {
            const id = m[1]
            const { excerpt, hint } = captureContext(m.index, m[0].length)
            const platform: DirectTrackingLoad['platform'] = id.startsWith('AW-')
                ? 'google_ads'
                : id.startsWith('G-')
                    ? 'ga4'
                    : id.startsWith('GTM-')
                        ? 'gtm'
                        : 'ga4'
            directLoads.push({ platform, id, sourceUrl: m[0], excerpt, hint })
        }

        // fbq('init', '<id>')
        const fbqRe = /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/gi
        while ((m = fbqRe.exec(html)) !== null) {
            const id = m[1]
            const { excerpt, hint } = captureContext(m.index, m[0].length)
            directLoads.push({ platform: 'meta_pixel', id, excerpt, hint })
        }

        return { url, status: res.status, directLoads }
    } catch {
        return { url, status: 0, directLoads: [] }
    }
}