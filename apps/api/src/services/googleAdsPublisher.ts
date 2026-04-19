/**
 * Google Ads Publisher — mirrors metaPublisher for Google Ads.
 *
 * MVP scope:
 *   - Image creatives → Responsive Display Ad in existing ad group
 *   - Video → skipped (requires YouTube upload flow — separate sprint)
 *   - Expose list helpers for UI (campaigns, ad groups) for given customer
 *
 * Flow:
 *   1. Load render → validate done + image format + finalUrl
 *   2. SSH-fetch bytes (≤5MB images)
 *   3. Upload as Asset.image (AssetService mutate)
 *      Returns resource_name: customers/{cid}/assets/{assetId}
 *   4. Create Ad (AdGroupAd.ad.responsive_display_ad) with marketing_images,
 *      square_marketing_images, headlines, descriptions, business_name, final_urls
 *   5. Return ad id → insert platform_creative_mappings (platform='google_ads')
 *
 * Google Ads API quirks:
 *   - Uses google-ads-api SDK (same pattern as googleAdsExecutor.ts)
 *   - Image assets must be 1.91:1 (marketing) OR 1:1 (square) — one of each required
 *   - All enum values via SDK's `enums` import
 *   - Mutations return resource_names; ad_group_ad.ad.id comes from splitting resource_name
 */

import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'
import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { instances, creativeRenders, platformCreativeMappings } from '@/db/schema'

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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

export interface GoogleAdsPublishParams {
    instanceId: string
    renderId: string
    customerId: string            // 10-digit ID (no dashes)
    adGroupId: string             // existing ad group — parent
    campaignId?: string            // for mapping metadata

    adName: string
    finalUrls: string[]            // landing page URLs (min 1)
    headlines: string[]            // responsive display: 5-15 short headlines (≤30 chars)
    longHeadline?: string         // max 90 chars
    descriptions: string[]         // 5 descriptions (≤90 chars)
    businessName: string           // advertiser name
    squareMarketingImageAssetId?: string   // reuse if already uploaded
    launchPaused?: boolean
}

export interface GoogleAdsPublishResult {
    ok: boolean
    platformCreativeId?: string       // ad.id
    assetId?: string
    resourceName?: string
    mappingId?: string
    error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

export async function publishRenderToGoogleAds(params: GoogleAdsPublishParams): Promise<GoogleAdsPublishResult> {
    try {
        const { GoogleAdsApi, enums } = await import('google-ads-api')

        const [inst] = await db.select().from(instances).where(eq(instances.id, params.instanceId))
        if (!inst) return { ok: false, error: 'Instance not found' }

        const gt = (inst.googleTokens as any) || {}
        const refreshToken = gt.refreshToken || gt.refresh_token
        const cfg = (inst.googleAdsConfig as any) || {}
        if (!refreshToken) return { ok: false, error: 'Google OAuth refresh_token missing — reconnect Google Ads' }
        if (!cfg.developerToken) return { ok: false, error: 'Developer Token missing — set in Integrations → Google Ads' }

        const [render] = await db.select().from(creativeRenders)
            .where(and(eq(creativeRenders.id, params.renderId), eq(creativeRenders.instanceId, params.instanceId)))
        if (!render) return { ok: false, error: 'Render not found' }
        if (render.renderStatus !== 'done') return { ok: false, error: `renderStatus=${render.renderStatus}, must be 'done'` }
        if (render.formatType !== 'image') return { ok: false, error: 'Google Ads publisher MVP supports only image format (video → YouTube flow, separate sprint)' }
        if (!render.finalUrl) return { ok: false, error: 'Render has no finalUrl' }

        const sshMatch = render.finalUrl.match(/^ssh:\/\/[^@]+@([^:]+):(.+)$/)
        if (!sshMatch) return { ok: false, error: `finalUrl format unexpected: ${render.finalUrl}` }
        const [, tenantIp, tenantPath] = sshMatch
        if (!inst.ip || inst.ip !== tenantIp) return { ok: false, error: `Instance IP mismatch` }

        if (!params.headlines || params.headlines.length < 3) return { ok: false, error: 'Min 3 headlines required (Google responsive display: 5+ recommended)' }
        if (!params.descriptions || params.descriptions.length < 2) return { ok: false, error: 'Min 2 descriptions required' }
        if (!params.finalUrls || params.finalUrls.length === 0) return { ok: false, error: 'finalUrls required' }
        if (!params.businessName) return { ok: false, error: 'businessName required' }

        const customerId = params.customerId.replace(/\D/g, '')

        const client = new GoogleAdsApi({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            developer_token: cfg.developerToken,
        })
        const customer = client.Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
            login_customer_id: cfg.loginCustomerId || customerId,
        })

        // Step 1: Fetch image bytes from tenant
        const { bytes } = await fetchImageFromTenant(inst.ip, inst.rootPassword || undefined, tenantPath)

        // Step 2: Upload as image asset
        const imageAssetResourceName = await uploadImageAsset(customer, bytes, `${params.adName}_marketing`)

        // Also need a square variant for responsive display ad — upload same image (Google resizes)
        // In production, tenant-side Sharp would crop to 1:1 first. MVP uses same image.
        const squareAssetResourceName = params.squareMarketingImageAssetId
            ? `customers/${customerId}/assets/${params.squareMarketingImageAssetId}`
            : await uploadImageAsset(customer, bytes, `${params.adName}_square`)

        // Step 3: Create ad in ad group
        const adGroupResourceName = `customers/${customerId}/adGroups/${params.adGroupId}`
        const adStatus = params.launchPaused !== false
            ? enums.AdGroupAdStatus.PAUSED
            : enums.AdGroupAdStatus.ENABLED

        const createAdResult = await customer.adGroupAds.create([{
            ad_group: adGroupResourceName,
            status: adStatus,
            ad: {
                final_urls: params.finalUrls,
                name: params.adName,
                responsive_display_ad: {
                    marketing_images: [{ asset: imageAssetResourceName }],
                    square_marketing_images: [{ asset: squareAssetResourceName }],
                    headlines: params.headlines.slice(0, 15).map(t => ({ text: t.substring(0, 30) })),
                    long_headline: { text: (params.longHeadline || params.headlines[0]).substring(0, 90) },
                    descriptions: params.descriptions.slice(0, 5).map(t => ({ text: t.substring(0, 90) })),
                    business_name: params.businessName.substring(0, 25),
                },
            },
        }])

        const resourceName = (createAdResult as any)?.results?.[0]?.resource_name
            || (Array.isArray(createAdResult) ? (createAdResult as any)[0]?.resource_name : null)
        if (!resourceName) {
            return { ok: false, error: `Ad created but no resource_name returned: ${JSON.stringify(createAdResult).substring(0, 300)}` }
        }

        // resource_name: customers/{cid}/adGroupAds/{adGroupId}~{adId}
        const adId = resourceName.split('/').pop()?.split('~').pop() || resourceName

        // Step 4: mapping row
        const mappingId = genId()
        try {
            await db.insert(platformCreativeMappings).values({
                id: mappingId,
                instanceId: params.instanceId,
                renderId: params.renderId,
                platform: 'google_ads',
                platformCreativeId: adId,
                platformCampaignId: params.campaignId || null,
                platformAccountId: customerId,
                publishedAt: new Date(),
                publishedBy: 'api',
                notes: `Auto-published via googleAdsPublisher. Status: ${params.launchPaused !== false ? 'PAUSED' : 'ENABLED'}. Resource: ${resourceName}. Asset: ${imageAssetResourceName}`,
                isActive: true,
            })
        } catch (err) {
            console.warn('[googleAdsPublisher] mapping insert (already exists?)', err)
        }

        return {
            ok: true,
            platformCreativeId: adId,
            assetId: imageAssetResourceName.split('/').pop(),
            resourceName,
            mappingId,
        }
    } catch (err) {
        console.error(`[googleAdsPublisher] publish failed:`, err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Image asset upload via google-ads-api SDK
// ═══════════════════════════════════════════════════════════════════════════

async function uploadImageAsset(customer: any, bytes: Buffer, name: string): Promise<string> {
    // The SDK exposes assetService via customer.assets.create / customer.mutateResources
    // For image assets we use customer.assets.create with image_asset field.
    const result = await customer.assets.create([{
        name: name,
        type: 'IMAGE',
        image_asset: {
            data: bytes,         // SDK auto-converts to base64 for grpc
        },
    }])
    const resourceName = (result as any)?.results?.[0]?.resource_name
        || (Array.isArray(result) ? (result as any)[0]?.resource_name : null)
    if (!resourceName) throw new Error(`Asset upload failed: ${JSON.stringify(result).substring(0, 300)}`)
    return resourceName
}

// ═══════════════════════════════════════════════════════════════════════════
// Fetch image bytes from tenant VPS (base64 over SSH)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchImageFromTenant(ip: string, password: string | undefined, path: string): Promise<{ bytes: Buffer }> {
    const sizeOut = await sshExec(ip, `stat -c%s "${path}" 2>/dev/null`, password, 10000)
    const size = parseInt(sizeOut.trim(), 10) || 0
    if (size === 0) throw new Error(`File not found or empty: ${path}`)
    if (size > 5 * 1024 * 1024) throw new Error(`Image too large for MVP publisher: ${size} bytes (max 5MB)`)
    const b64 = await sshExec(ip, `base64 -w0 "${path}" 2>/dev/null`, password, 60000)
    return { bytes: Buffer.from(b64.trim(), 'base64') }
}

// ═══════════════════════════════════════════════════════════════════════════
// List helpers for UI
// ═══════════════════════════════════════════════════════════════════════════

export async function listGoogleAdsAccounts(instanceId: string): Promise<Array<{ customerId: string; descriptiveName: string; currency: string }>> {
    const { GoogleAdsApi } = await import('google-ads-api')
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const gt = (inst.googleTokens as any) || {}
    const refreshToken = gt.refreshToken || gt.refresh_token
    const cfg = (inst.googleAdsConfig as any) || {}
    if (!refreshToken || !cfg.developerToken) throw new Error('Google Ads config incomplete')

    const client = new GoogleAdsApi({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        developer_token: cfg.developerToken,
    })

    // Query customer_client from the user's MCC or direct account
    const customer = client.Customer({
        customer_id: cfg.customerId || cfg.loginCustomerId,
        refresh_token: refreshToken,
        login_customer_id: cfg.loginCustomerId || cfg.customerId,
    })

    const rows = await customer.query(`
        SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager
        FROM customer
    `) as Array<any>

    return rows.map(r => ({
        customerId: String(r?.customer?.id || ''),
        descriptiveName: r?.customer?.descriptive_name || '',
        currency: r?.customer?.currency_code || '',
    }))
}

export async function listGoogleAdsCampaigns(instanceId: string, customerId: string): Promise<Array<{ id: string; name: string; status: string; advertisingChannelType: string }>> {
    const { GoogleAdsApi } = await import('google-ads-api')
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const gt = (inst.googleTokens as any) || {}
    const cfg = (inst.googleAdsConfig as any) || {}
    const client = new GoogleAdsApi({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        developer_token: cfg.developerToken,
    })
    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: gt.refreshToken || gt.refresh_token,
        login_customer_id: cfg.loginCustomerId || customerId,
    })
    const rows = await customer.query(`
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
        FROM campaign
        WHERE campaign.status IN ('ENABLED', 'PAUSED')
        ORDER BY campaign.id DESC
        LIMIT 100
    `) as Array<any>
    return rows.map(r => ({
        id: String(r?.campaign?.id || ''),
        name: r?.campaign?.name || '',
        status: String(r?.campaign?.status || ''),
        advertisingChannelType: String(r?.campaign?.advertising_channel_type || ''),
    }))
}

export async function listGoogleAdsAdGroups(instanceId: string, customerId: string, campaignId?: string): Promise<Array<{ id: string; name: string; status: string; campaignId: string; campaignName: string }>> {
    const { GoogleAdsApi } = await import('google-ads-api')
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    const gt = (inst.googleTokens as any) || {}
    const cfg = (inst.googleAdsConfig as any) || {}
    const client = new GoogleAdsApi({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        developer_token: cfg.developerToken,
    })
    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: gt.refreshToken || gt.refresh_token,
        login_customer_id: cfg.loginCustomerId || customerId,
    })
    const filter = campaignId ? `AND ad_group.campaign = 'customers/${customerId}/campaigns/${campaignId}'` : ''
    const rows = await customer.query(`
        SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.campaign, campaign.name
        FROM ad_group
        WHERE ad_group.status IN ('ENABLED', 'PAUSED') ${filter}
        ORDER BY ad_group.id DESC
        LIMIT 200
    `) as Array<any>
    return rows.map(r => ({
        id: String(r?.ad_group?.id || ''),
        name: r?.ad_group?.name || '',
        status: String(r?.ad_group?.status || ''),
        campaignId: String(r?.ad_group?.campaign || '').split('/').pop() || '',
        campaignName: r?.campaign?.name || '',
    }))
}
