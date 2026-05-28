/**
 * WordPress companion plugin installer + GTM migration helper.
 * Phase 2026.02 Block 6 Pattern J.
 *
 * Handles:
 *   - Build ClawFlow companion plugin .zip from scripts/clawflow-companion-plugin.php
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
 * Install + activate the ClawFlow companion plugin via WP REST API.
 * Strategy:
 *   1. List installed plugins. If 'clawflow-companion/clawflow-companion'
 *      is already active → method='already_active', return.
 *   2. If installed but inactive → activate via PATCH (status=active).
 *   3. If not installed → build zip in memory, upload via multipart POST.
 *
 * Requires WP 5.5+ + Application Password owner with manage_options.
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

    // 2. Build zip + upload multipart
    let zipBuffer: Buffer
    try {
        zipBuffer = await buildPluginZipBuffer()
        notes.push(`built plugin zip: ${zipBuffer.length} bytes`)
    } catch (err) {
        return { installed: false, activated: false, pluginSlug, method: 'rest_upload', notes, error: 'zip build: ' + (err as Error).message }
    }

    try {
        // Multipart form: WP REST plugins endpoint accepts pkg= (the .zip file)
        const boundary = '----ClawFlowPluginBoundary' + Date.now()
        const head = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="pkg"; filename="clawflow-companion.zip"\r\n` +
            `Content-Type: application/zip\r\n\r\n`,
        )
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
        const body = Buffer.concat([head, zipBuffer, tail])

        const uploadRes = await fetch(`${normalizeWpUrl(cfg.url)}/wp-json/wp/v2/plugins`, {
            method: 'POST',
            headers: {
                Authorization: authHeader(cfg),
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
        })
        const txt = await uploadRes.text().catch(() => '')
        if (!uploadRes.ok) {
            // WP plugin upload often requires file system perms — surface root cause
            return {
                installed: false, activated: false, pluginSlug, method: 'rest_upload', notes,
                error: `upload ${uploadRes.status}: ${txt.slice(0, 400)}`,
            }
        }

        // Activate after install
        try {
            await wpPostJson(cfg, `/wp-json/wp/v2/plugins/${encodeURIComponent(pluginSlug)}`, { status: 'active' })
            notes.push('uploaded + activated via REST')
            return { installed: true, activated: true, pluginSlug, method: 'rest_upload', notes }
        } catch (err) {
            notes.push(`uploaded but activate failed: ${(err as Error).message.slice(0, 200)}`)
            return { installed: true, activated: false, pluginSlug, method: 'rest_upload', notes, error: (err as Error).message }
        }
    } catch (err) {
        return { installed: false, activated: false, pluginSlug, method: 'rest_upload', notes, error: (err as Error).message }
    }
}

// ─── ClawFlow REST helpers ────────────────────────────────────────────────

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
 * Scan the live homepage HTML for GTM- snippets — does NOT require the
 * companion plugin (works on any WP/non-WP site). Used as a sanity check
 * before AND after migration.
 */
export async function scanSiteHtmlForGtm(siteUrl: string): Promise<{ url: string; gtmIds: string[]; status: number }> {
    const url = normalizeWpUrl(siteUrl)
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ClawFlow GTM Scanner/1.0' } })
        const html = await res.text().catch(() => '')
        const matches = html.match(/GTM-[A-Z0-9]{4,}/g) || []
        return { url, gtmIds: Array.from(new Set(matches)), status: res.status }
    } catch (err) {
        return { url, gtmIds: [], status: 0 }
    }
}