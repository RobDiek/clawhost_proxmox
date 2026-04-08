/**
 * Meta (Facebook/Instagram) OAuth + Ads Integration
 *
 * Flow:
 * 1. User enters App ID + App Secret in dashboard
 * 2. POST /integrations/meta/save-credentials → saves to DB, returns OAuth URL
 * 3. User redirected to Facebook OAuth consent
 * 4. GET /integrations/meta/callback → exchanges code for tokens, fetches pages
 * 5. Tokens + page info saved to DB
 * 6. Publish handler creates campaigns via Marketing API
 */

import type { Context } from 'hono'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { setAgentIntegration, removeAgentIntegration } from '@/services/agentIntegrations'

const REDIRECT_URI = process.env.META_REDIRECT_URI ||
    'https://api.clawflow.flowmatic.co.il/hosting/integrations/meta/callback'

// Scopes for ads + page management + instagram
const META_SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_ads',
    'ads_management',
    'ads_read',
    'instagram_basic',
    'instagram_content_publish',
    'business_management',
].join(',')

// ── POST /integrations/meta/save-credentials ──
// Saves App ID + Secret, returns OAuth URL for redirect
export const metaSaveCredentials = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')
        const { appId, appSecret } = await c.req.json<{ appId: string; appSecret: string }>()

        if (!appId || !appSecret) {
            return fail(c, 'App ID ו-App Secret נדרשים', 400)
        }

        // Save credentials to DB (in metaTokens field)
        await db.update(instances)
            .set({
                metaTokens: {
                    appId,
                    appSecret,
                    status: 'pending_oauth',
                } as any,
            })
            .where(eq(instances.id, instanceId))

        // Build OAuth URL
        const state = Buffer.from(JSON.stringify({ instanceId })).toString('base64')
        const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
            `client_id=${appId}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&scope=${META_SCOPES}` +
            `&state=${state}` +
            `&response_type=code`

        return ok(c, { authUrl }, 'Redirect to Meta OAuth')
    } catch (err) {
        console.error('metaSaveCredentials error:', err)
        return fail(c, 'שגיאה בשמירת הנתונים', 500)
    }
}

// ── GET /integrations/meta/callback ──
// Handles OAuth callback from Facebook
export const metaCallback = async (c: Context) => {
    try {
        const code = c.req.query('code')
        const stateParam = c.req.query('state')
        const error = c.req.query('error')

        if (error) {
            console.error('Meta OAuth error:', c.req.query('error_description'))
            return c.redirect('/dashboard?meta_error=' + encodeURIComponent(c.req.query('error_description') || 'denied'))
        }

        if (!code || !stateParam) {
            return fail(c, 'Missing code or state', 400)
        }

        // Decode state
        const state = JSON.parse(Buffer.from(stateParam, 'base64').toString())
        const instanceId = state.instanceId

        // Get saved credentials
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Instance not found', 404)

        const metaConfig = instance.metaTokens as any
        if (!metaConfig?.appId || !metaConfig?.appSecret) {
            return fail(c, 'Meta credentials not found', 400)
        }

        // Exchange code for short-lived token
        const tokenRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?` +
            `client_id=${metaConfig.appId}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&client_secret=${metaConfig.appSecret}` +
            `&code=${code}`
        )
        const tokenData = await tokenRes.json() as { access_token?: string; error?: any }

        if (!tokenData.access_token) {
            console.error('Meta token exchange failed:', tokenData.error)
            return c.redirect('/dashboard?meta_error=token_failed')
        }

        // Exchange for long-lived token (60 days)
        const longTokenRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?` +
            `grant_type=fb_exchange_token` +
            `&client_id=${metaConfig.appId}` +
            `&client_secret=${metaConfig.appSecret}` +
            `&fb_exchange_token=${tokenData.access_token}`
        )
        const longTokenData = await longTokenRes.json() as { access_token?: string; expires_in?: number }
        const longLivedToken = longTokenData.access_token || tokenData.access_token

        // Get user's pages
        const pagesRes = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`
        )
        const pagesData = await pagesRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> }
        const pages = pagesData.data || []

        // Get Instagram account linked to first page
        let instagramAccountId: string | null = null
        if (pages.length > 0) {
            const igRes = await fetch(
                `https://graph.facebook.com/v21.0/${pages[0].id}?fields=instagram_business_account&access_token=${pages[0].access_token}`
            )
            const igData = await igRes.json() as { instagram_business_account?: { id: string } }
            instagramAccountId = igData.instagram_business_account?.id || null
        }

        // Get ad accounts
        const adAccountsRes = await fetch(
            `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${longLivedToken}`
        )
        const adAccountsData = await adAccountsRes.json() as { data?: Array<{ id: string; name: string; account_status: number }> }
        const adAccounts = (adAccountsData.data || []).filter(a => a.account_status === 1) // 1 = ACTIVE

        // Save everything
        await db.update(instances)
            .set({
                metaTokens: {
                    appId: metaConfig.appId,
                    appSecret: metaConfig.appSecret,
                    userAccessToken: longLivedToken,
                    tokenExpiresAt: Date.now() + (longTokenData.expires_in || 5184000) * 1000,
                    pages: pages.map(p => ({ id: p.id, name: p.name, accessToken: p.access_token })),
                    pageName: pages[0]?.name || null,
                    pageId: pages[0]?.id || null,
                    pageAccessToken: pages[0]?.access_token || null,
                    instagramAccountId,
                    adAccounts: adAccounts.map(a => ({ id: a.id, name: a.name })),
                    adAccountId: adAccounts[0]?.id || null,
                    connectedAt: new Date().toISOString(),
                    status: 'connected',
                } as any,
            })
            .where(eq(instances.id, instanceId))

        // Write to per-agent integrations (Meta is always for MATEH)
        await setAgentIntegration(instanceId, 'mt', 'meta', {
            pageName: pages[0]?.name, instagramAccountId, adAccountId: adAccounts[0]?.id,
            connectedAt: new Date().toISOString(), status: 'connected',
        }).catch(err => console.error('Failed to set agent meta integration:', err))

        console.log(`Meta connected for ${instanceId}: ${pages.length} pages, ${adAccounts.length} ad accounts, IG: ${instagramAccountId || 'none'}`)

        // Sync channel status to VPS
        try {
            const { syncChannelsToVPS } = await import('@/services/channelSync')
            syncChannelsToVPS(instanceId).catch(() => {})
        } catch {}

        return c.redirect('/dashboard?meta_connected=1')
    } catch (err) {
        console.error('metaCallback error:', err)
        return c.redirect('/dashboard?meta_error=callback_failed')
    }
}

// ── POST /integrations/meta/disconnect ──
export const metaDisconnect = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')

        await db.update(instances)
            .set({ metaTokens: null as any })
            .where(eq(instances.id, instanceId))

        // Remove from per-agent integrations
        await removeAgentIntegration(instanceId, 'mt', 'meta').catch(() => {})

        return ok(c, null, 'Meta disconnected')
    } catch (err) {
        console.error('metaDisconnect error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── GET /integrations/meta/status ──
export const metaStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.metaTokens) {
            return ok(c, { connected: false })
        }

        const meta = instance.metaTokens as any
        return ok(c, {
            connected: meta.status === 'connected',
            pageName: meta.pageName,
            hasInstagram: !!meta.instagramAccountId,
            hasAdAccount: !!meta.adAccountId,
            adAccountId: meta.adAccountId,
        })
    } catch (err) {
        return fail(c, 'Failed to check status', 500)
    }
}
