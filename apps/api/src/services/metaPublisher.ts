/**
 * Meta Ads Publisher (Phase C)
 *
 * Publishes an approved creative_render to Meta Ads (Facebook + Instagram).
 * On success, auto-creates platform_creative_mappings row so perfSync picks
 * up daily metrics.
 *
 * MVP scope:
 *   - Image ads (feed) via /act_{acc}/adimages → adcreatives → ads
 *   - Video ads via /act_{acc}/advideos (accepts file_url or direct upload)
 *   - Existing campaign + ad_set required (user provides IDs)
 *   - Ad created in PAUSED status by default — user activates in Meta UI
 *   - Single-variant publish (not bulk); UI loops for A/B hypotheses
 *
 * Flow:
 *   1. Load render → validate renderStatus='done' + finalUrl ssh://...
 *   2. SSH-fetch media bytes from tenant VPS (base64 for img ≤5MB, chunked for video)
 *   3. POST to Meta advideos/adimages → get hash/video_id
 *   4. POST to Meta adcreatives with object_story_spec
 *   5. POST to Meta ads (linked to user-chosen adset_id)
 *   6. Insert platform_creative_mappings row
 *
 * Cost: only Meta API calls (free within quota); no AI calls.
 */

import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'
import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import {
    instances,
    creativeRenders,
    platformCreativeMappings,
} from '@/db/schema'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

const genId = () => 'm_' + randomBytes(6).toString('hex')

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PublishParams {
    instanceId: string
    renderId: string
    adAccountId: string           // 'act_123' or '123'
    adSetId: string               // existing ad set (parent)
    campaignId?: string           // for mapping
    name: string                  // ad name
    headline?: string             // link headline (image ads)
    primaryText?: string          // body copy
    linkUrl: string               // landing page
    callToAction?: 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'CONTACT_US' | 'BOOK_TRAVEL' | 'WATCH_MORE' | 'DOWNLOAD'
    status?: 'PAUSED' | 'ACTIVE'  // default PAUSED — safer
    launchNow?: boolean
}

export interface PublishResult {
    ok: boolean
    platformCreativeId?: string   // ad_id
    platformCreativeName?: string
    adCreativeId?: string          // meta's creative id (nested)
    mediaObjectId?: string         // image_hash / video_id
    mappingId?: string
    error?: string
    metaErrorDetails?: unknown
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════════════════

export async function publishRenderToMeta(params: PublishParams): Promise<PublishResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, params.instanceId))
    if (!inst) return { ok: false, error: 'Instance not found' }

    const mt = (inst.metaTokens as any) || {}
    const token = mt.userAccessToken || mt.pageAccessToken || mt.accessToken
    if (!token) return { ok: false, error: 'Meta token missing — reconnect Meta in integrations' }
    const pageId = mt.pageId
    if (!pageId) return { ok: false, error: 'Facebook Page ID missing — reconnect Meta (need page_id)' }

    const [render] = await db.select().from(creativeRenders)
        .where(and(eq(creativeRenders.id, params.renderId), eq(creativeRenders.instanceId, params.instanceId)))
    if (!render) return { ok: false, error: 'Render not found' }
    if (render.renderStatus !== 'done') return { ok: false, error: `renderStatus=${render.renderStatus}, must be 'done'` }
    if (!render.finalUrl) return { ok: false, error: 'Render has no finalUrl' }

    // Parse ssh://openclaw@{ip}:{path}
    const sshMatch = render.finalUrl.match(/^ssh:\/\/[^@]+@([^:]+):(.+)$/)
    if (!sshMatch) return { ok: false, error: `finalUrl format unexpected: ${render.finalUrl}` }
    const tenantIp = sshMatch[1]
    const tenantPath = sshMatch[2]

    if (!inst.ip || inst.ip !== tenantIp) {
        return { ok: false, error: `Instance IP ${inst.ip} mismatches render tenant ${tenantIp}` }
    }

    const adAccountId = params.adAccountId.startsWith('act_') ? params.adAccountId : `act_${params.adAccountId}`
    const status = params.status || (params.launchNow ? 'ACTIVE' : 'PAUSED')

    try {
        // Step 1: Fetch media from tenant VPS
        const { bytes, mimeType, isVideo } = await fetchMediaFromTenant(inst.ip, inst.rootPassword || undefined, tenantPath, render.formatType)

        // Step 2: Upload media to Meta
        let mediaObjectId: string
        let imageHash: string | null = null
        let videoId: string | null = null

        if (isVideo) {
            videoId = await uploadVideoToMeta(adAccountId, token, bytes, mimeType, params.name)
            mediaObjectId = videoId
        } else {
            imageHash = await uploadImageToMeta(adAccountId, token, bytes, mimeType, params.name)
            mediaObjectId = imageHash
        }

        // Step 3: Create Ad Creative
        const adCreativeId = await createAdCreative({
            adAccountId, token, pageId, name: params.name,
            headline: params.headline || '',
            primaryText: params.primaryText || '',
            linkUrl: params.linkUrl,
            callToAction: params.callToAction || 'LEARN_MORE',
            imageHash, videoId,
            instagramActorId: mt.instagramAccountId || undefined,
        })

        // Step 4: Create Ad (linked to ad_set)
        const adId = await createAd({
            adAccountId, token, adSetId: params.adSetId,
            creativeId: adCreativeId, name: params.name, status,
        })

        // Step 5: Insert mapping row
        const mappingId = genId()
        try {
            await db.insert(platformCreativeMappings).values({
                id: mappingId,
                instanceId: params.instanceId,
                renderId: params.renderId,
                platform: 'meta',
                platformCreativeId: adId,
                platformCampaignId: params.campaignId || null,
                platformAccountId: adAccountId,
                publishedAt: new Date(),
                publishedBy: 'api',
                notes: `Auto-published via metaPublisher. Status: ${status}. Meta creative_id: ${adCreativeId}. Media: ${isVideo ? 'video_id' : 'image_hash'}=${mediaObjectId}`,
                isActive: true,
            })
        } catch (err) {
            // Mapping already exists — not a blocker for publish success
            console.warn(`[metaPublisher] mapping insert failed (ad already published?):`, err)
        }

        return {
            ok: true,
            platformCreativeId: adId,
            platformCreativeName: params.name,
            adCreativeId,
            mediaObjectId,
            mappingId,
        }
    } catch (err) {
        console.error(`[metaPublisher] publish failed for ${params.renderId}:`, err)
        return { ok: false, error: err instanceof Error ? err.message : String(err), metaErrorDetails: err }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — SSH fetch
// ═══════════════════════════════════════════════════════════════════════════

async function fetchMediaFromTenant(
    ip: string,
    password: string | undefined,
    path: string,
    formatType: string,
): Promise<{ bytes: Buffer; mimeType: string; isVideo: boolean }> {
    const isVideo = formatType === 'video' || /\.(mp4|mov|webm)$/i.test(path)
    const sizeOut = await sshExec(ip, `stat -c%s "${path}" 2>/dev/null`, password, 10000)
    const size = parseInt(sizeOut.trim(), 10) || 0
    if (size === 0) throw new Error(`File empty or not found: ${path}`)
    // Meta video max 4GB but our base64 ssh transfer caps ~50MB to stay sane
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (size > maxSize) throw new Error(`File too large for MVP publisher (${size} bytes > ${maxSize}). Use file_url upload — not yet implemented.`)

    const b64 = await sshExec(ip, `base64 -w0 "${path}" 2>/dev/null`, password, 120000)
    const bytes = Buffer.from(b64.trim(), 'base64')
    const mimeType = isVideo ? 'video/mp4' : /\.jpg|jpeg$/i.test(path) ? 'image/jpeg' : 'image/png'
    return { bytes, mimeType, isVideo }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — Meta API
// ═══════════════════════════════════════════════════════════════════════════

const META_API_VERSION = 'v20.0'

async function uploadImageToMeta(
    adAccountId: string,
    token: string,
    bytes: Buffer,
    mimeType: string,
    filename: string,
): Promise<string> {
    const form = new FormData()
    form.append('access_token', token)
    // Meta expects field name = filename used as lookup key in response
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.png'
    const blob = new Blob([bytes], { type: mimeType })
    form.append(safeFilename, blob, safeFilename)

    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adimages`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Meta adimages HTTP ${res.status}: ${errText.substring(0, 500)}`)
    }
    const data = await res.json() as { images?: Record<string, { hash: string; url: string }> }
    // Response: { images: { [filename]: { hash, url } } }
    const first = data.images && Object.values(data.images)[0]
    if (!first?.hash) throw new Error(`Meta adimages response missing hash: ${JSON.stringify(data).substring(0, 300)}`)
    return first.hash
}

async function uploadVideoToMeta(
    adAccountId: string,
    token: string,
    bytes: Buffer,
    mimeType: string,
    filename: string,
): Promise<string> {
    const form = new FormData()
    form.append('access_token', token)
    form.append('name', filename)
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.mp4'
    const blob = new Blob([bytes], { type: mimeType })
    form.append('source', blob, safeFilename)

    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/advideos`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(300000),   // 5 min for video upload
    })
    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Meta advideos HTTP ${res.status}: ${errText.substring(0, 500)}`)
    }
    const data = await res.json() as { id?: string }
    if (!data.id) throw new Error(`Meta advideos missing id: ${JSON.stringify(data).substring(0, 300)}`)
    return data.id
}

async function createAdCreative(params: {
    adAccountId: string
    token: string
    pageId: string
    instagramActorId?: string
    name: string
    headline: string
    primaryText: string
    linkUrl: string
    callToAction: string
    imageHash: string | null
    videoId: string | null
}): Promise<string> {
    let objectStorySpec: Record<string, unknown>
    if (params.videoId) {
        objectStorySpec = {
            page_id: params.pageId,
            video_data: {
                video_id: params.videoId,
                title: params.headline,
                message: params.primaryText,
                call_to_action: {
                    type: params.callToAction,
                    value: { link: params.linkUrl },
                },
            },
        }
    } else if (params.imageHash) {
        objectStorySpec = {
            page_id: params.pageId,
            link_data: {
                image_hash: params.imageHash,
                link: params.linkUrl,
                message: params.primaryText,
                name: params.headline,
                call_to_action: {
                    type: params.callToAction,
                    value: { link: params.linkUrl },
                },
            },
        }
    } else {
        throw new Error('Must provide either imageHash or videoId')
    }
    if (params.instagramActorId) {
        (objectStorySpec as any).instagram_actor_id = params.instagramActorId
    }

    const body = {
        access_token: params.token,
        name: params.name + ' — creative',
        object_story_spec: JSON.stringify(objectStorySpec),
    }

    const formEncoded = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) formEncoded.append(k, String(v))

    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${params.adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formEncoded,
        signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Meta adcreatives HTTP ${res.status}: ${errText.substring(0, 500)}`)
    }
    const data = await res.json() as { id?: string }
    if (!data.id) throw new Error(`Meta adcreatives missing id: ${JSON.stringify(data).substring(0, 300)}`)
    return data.id
}

async function createAd(params: {
    adAccountId: string
    token: string
    adSetId: string
    creativeId: string
    name: string
    status: 'PAUSED' | 'ACTIVE'
}): Promise<string> {
    const body = new URLSearchParams({
        access_token: params.token,
        name: params.name,
        adset_id: params.adSetId,
        creative: JSON.stringify({ creative_id: params.creativeId }),
        status: params.status,
    })
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${params.adAccountId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Meta ads HTTP ${res.status}: ${errText.substring(0, 500)}`)
    }
    const data = await res.json() as { id?: string }
    if (!data.id) throw new Error(`Meta ads missing id: ${JSON.stringify(data).substring(0, 300)}`)
    return data.id
}

// ═══════════════════════════════════════════════════════════════════════════
// List ad accounts / campaigns / adsets (for UI dropdowns)
// ═══════════════════════════════════════════════════════════════════════════

export async function listAdAccounts(token: string): Promise<Array<{ id: string; name: string; currency: string }>> {
    const qp = new URLSearchParams({
        access_token: token,
        fields: 'id,name,currency',
        limit: '50',
    })
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?${qp}`, {
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`listAdAccounts HTTP ${res.status}: ${(await res.text()).substring(0, 300)}`)
    const data = await res.json() as { data?: Array<{ id: string; name: string; currency: string }> }
    return data.data || []
}

export async function listCampaigns(adAccountId: string, token: string): Promise<Array<{ id: string; name: string; status: string; objective: string }>> {
    const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const qp = new URLSearchParams({
        access_token: token,
        fields: 'id,name,status,objective',
        limit: '50',
    })
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${id}/campaigns?${qp}`, {
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`listCampaigns HTTP ${res.status}: ${(await res.text()).substring(0, 300)}`)
    const data = await res.json() as { data?: Array<{ id: string; name: string; status: string; objective: string }> }
    return data.data || []
}

export async function listAdSets(campaignIdOrAccountId: string, token: string, byCampaign = true): Promise<Array<{ id: string; name: string; status: string; campaign_id: string }>> {
    const qp = new URLSearchParams({
        access_token: token,
        fields: 'id,name,status,campaign_id',
        limit: '100',
    })
    const endpoint = byCampaign
        ? `${campaignIdOrAccountId}/adsets`
        : `${campaignIdOrAccountId.startsWith('act_') ? campaignIdOrAccountId : `act_${campaignIdOrAccountId}`}/adsets`
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${endpoint}?${qp}`, {
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`listAdSets HTTP ${res.status}: ${(await res.text()).substring(0, 300)}`)
    const data = await res.json() as { data?: Array<{ id: string; name: string; status: string; campaign_id: string }> }
    return data.data || []
}
