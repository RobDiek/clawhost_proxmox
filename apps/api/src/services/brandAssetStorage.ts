/**
 * Brand Asset Storage — per-tenant VPS file storage.
 *
 * Each instance has its own VPS. Brand assets (logos, color swatches, fonts,
 * imagery references, channel-specific creatives) are uploaded to:
 *   /opt/openclaw/data/brand-assets/<instance-id>/<category>/<filename>
 *
 * Served publicly via nginx on the tenant's own subdomain:
 *   https://agent.<instance-id>.openclaw.flowmatic.co.il/brand-assets/<category>/<filename>
 *
 * The mgmt API uploads via SSH (using instance.ip + instance.rootPassword
 * or master SSH key).
 *
 * Categories:
 *   logo/         — primary, secondary, monochrome, icon, social, favicon
 *   colors/       — color swatches as PNG (for downloads)
 *   typography/   — webfont WOFF/WOFF2 self-hosted
 *   imagery/      — reference images
 *   patterns/     — repeating bg patterns
 *   personas/     — persona avatars
 *   channel/      — channel-specific assets (google-ads/, meta/, etc)
 *   pdf/          — exported brand book PDFs
 *
 * Upload flow:
 *   1. Client uploads multipart/form-data to mgmt API
 *   2. mgmt validates type + size
 *   3. mgmt SSH-pushes file to tenant VPS via base64 inlining or scp
 *   4. mgmt returns public URL on tenant subdomain
 *   5. mgmt stamps URL on BrandBookV2 entry
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import executeSSH from '@/services/ssh'
import { randomBytes } from 'crypto'

const BASE_PATH = '/opt/openclaw/data/brand-assets'
const NGINX_SUBDIR = 'brand-assets'

export type AssetCategory =
    | 'logo' | 'colors' | 'typography' | 'imagery' | 'patterns'
    | 'personas' | 'channel' | 'pdf'

export interface UploadAssetParams {
    instanceId: string
    category: AssetCategory
    subPath?: string                       // e.g. "google-ads/display-300x250.png"
    filename: string
    contentBase64: string                  // base64-encoded binary
    contentType: string                    // image/png, font/woff2, etc
}

export interface AssetUploadResult {
    publicUrl: string                      // https://agent.{}.openclaw.flowmatic.co.il/brand-assets/...
    relativePath: string                   // /brand-assets/...
    sizeBytes: number
}

function safeFilename(name: string): string {
    const cleaned = name
        .replace(/[^\w\d.\-_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
    return cleaned || ('file_' + randomBytes(4).toString('hex'))
}

/**
 * Upload an asset to the tenant VPS. Creates directory if missing.
 * Uses SSH inline base64 transfer (no scp dependency).
 */
export async function uploadAssetToVps(p: UploadAssetParams): Promise<AssetUploadResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, p.instanceId))
    if (!inst) throw new Error('Instance not found')
    if (!inst.ip) throw new Error('Instance has no IP — VPS not provisioned yet')

    const category = p.category
    const sub = p.subPath ? p.subPath.replace(/^\/+|\/+$/g, '') : ''
    const filename = safeFilename(p.filename)
    const dirOnVps = `${BASE_PATH}/${p.instanceId}/${category}${sub ? '/' + sub : ''}`
    const fullPath = `${dirOnVps}/${filename}`

    // Decode size for return
    const sizeBytes = Math.floor((p.contentBase64.length * 3) / 4)

    // SSH commands:
    //   1. mkdir -p
    //   2. echo base64 | base64 -d > target
    //   3. chmod 644
    //   4. ensure nginx serves /brand-assets (one-time check; idempotent)
    const cmd = `
        set -e
        mkdir -p '${dirOnVps}'
        echo '${p.contentBase64}' | base64 -d > '${fullPath}'
        chmod 644 '${fullPath}'

        # Ensure nginx site config serves /brand-assets/ — idempotent
        if ! grep -q "location /${NGINX_SUBDIR}/" /etc/nginx/sites-available/openclaw 2>/dev/null; then
            sed -i '/server_name agent\\..*$/a\\    location /${NGINX_SUBDIR}/ {\\n        alias ${BASE_PATH}/${p.instanceId}/;\\n        expires 30d;\\n        add_header Cache-Control "public, max-age=2592000";\\n    }' /etc/nginx/sites-available/openclaw 2>/dev/null || true
            nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
        fi
    `.trim()

    const password = (inst as any).rootPassword || undefined
    if (!password) throw new Error('Instance has no rootPassword — cannot SSH')
    await executeSSH(inst.ip as string, password, cmd, 60_000)

    const subdomain = inst.subdomainAgent || `agent.${p.instanceId}.openclaw.flowmatic.co.il`
    const publicUrl = `https://${subdomain}/${NGINX_SUBDIR}/${category}${sub ? '/' + sub : ''}/${filename}`
    const relativePath = `/${NGINX_SUBDIR}/${category}${sub ? '/' + sub : ''}/${filename}`

    return { publicUrl, relativePath, sizeBytes }
}

/** Delete an asset from VPS by absolute relative path */
export async function deleteAssetFromVps(instanceId: string, relativePath: string): Promise<void> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst?.ip) return
    const safeRel = relativePath.replace(/\.\.+/g, '').replace(/^\/+/, '')
    const fullPath = `${BASE_PATH}/${instanceId}/${safeRel.replace(new RegExp(`^${NGINX_SUBDIR}/?`), '')}`
    const cmd = `rm -f '${fullPath}'`
    const password = (inst as any).rootPassword || undefined
    try { if (password) await executeSSH(inst.ip as string, password, cmd, 30_000) } catch { /* best-effort */ }
}

/** List assets for an instance/category */
export async function listAssets(instanceId: string, category: AssetCategory): Promise<Array<{ filename: string; sizeBytes: number; modifiedAt: string }>> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst?.ip) return []
    const dir = `${BASE_PATH}/${instanceId}/${category}`
    const cmd = `ls -la '${dir}' 2>/dev/null | awk '{ if (NR>3) print $5"|"$6"-"$7"-"$8"|"$9 }' | grep -v '^|'`
    const password = (inst as any).rootPassword || undefined
    try {
        if (!password) return []
        const out = await executeSSH(inst.ip as string, password, cmd, 15_000)
        return (out || '').split('\n').filter(Boolean).map((line: string) => {
            const [size, mod, name] = line.split('|')
            return { filename: name, sizeBytes: parseInt(size || '0', 10) || 0, modifiedAt: mod || '' }
        })
    } catch {
        return []
    }
}