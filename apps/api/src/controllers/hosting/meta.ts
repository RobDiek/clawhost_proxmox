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
import { readFileSync } from 'fs'
import * as crypto from 'crypto'
import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { setAgentIntegration, removeAgentIntegration } from '@/services/agentIntegrations'
import { writeAgentTokens, writeAgentTokensFor, resolveActiveAgent } from '@/services/agentContext'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, 30000)
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
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch {}
        conn.connect(opts)
    })
}

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

        // Phase 2.3.B — save credentials to active mateh_agent
        await writeAgentTokens(c, instanceId, {
            metaTokens: {
                appId,
                appSecret,
                status: 'pending_oauth',
            } as never,
        })

        // Phase 2.3.J — pin to specific mateh_agent via OAuth state so the
        // callback writes tokens to the SAME agent the user was on.
        const __metaStartAgent = await resolveActiveAgent(c, instanceId)
        const agentIdForState = __metaStartAgent?.id || ''

        // Phase 4.3-O H4 + M4: HMAC-sign the state with TTL. Previously this
        // was raw base64 JSON — attacker could forge state with any instanceId/
        // agentId and hijack the callback to write tokens into a foreign agent.
        // exp: 10 minutes — OAuth flow shouldn't take longer.
        const statePayload = JSON.stringify({
            instanceId,
            agentId: agentIdForState,
            exp: Date.now() + 10 * 60 * 1000,
        })
        const stateHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(statePayload).digest('base64url')
        const state = Buffer.from(JSON.stringify({ p: statePayload, s: stateHmac })).toString('base64url')
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

        // Phase 4.3-O H4 + M4: decode + verify HMAC-signed state with TTL.
        let stateData: { instanceId: string; agentId?: string; exp?: number }
        try {
            const stateOuter = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
            // Backwards compat: if it's still the raw base64 JSON (no .p/.s),
            // accept ONLY if state has instanceId/agentId at top level AND
            // we're in soft-launch mode. Otherwise reject hard.
            if (!stateOuter.p || !stateOuter.s) {
                // Legacy unsigned state (pre-H4). For safety: reject.
                console.error('Meta OAuth state missing HMAC signature — rejecting (legacy unsigned)')
                return c.redirect(`${process.env.FRONTEND_URL || ''}/dashboard.html?meta_error=invalid_state`)
            }
            const expectedHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(stateOuter.p).digest('base64url')
            if (stateOuter.s !== expectedHmac) {
                console.error('Meta OAuth state HMAC mismatch — possible tampering')
                return c.redirect(`${process.env.FRONTEND_URL || ''}/dashboard.html?meta_error=invalid_state`)
            }
            stateData = JSON.parse(stateOuter.p)
            if (stateData.exp && Date.now() > stateData.exp) {
                console.error('Meta OAuth state expired')
                return c.redirect(`${process.env.FRONTEND_URL || ''}/dashboard.html?meta_error=state_expired`)
            }
        } catch (parseErr) {
            console.error('Meta OAuth state parse failed:', (parseErr as Error).message)
            return c.redirect(`${process.env.FRONTEND_URL || ''}/dashboard.html?meta_error=state_parse`)
        }

        const instanceId = stateData.instanceId
        // Phase 2.3.J — agentId pinned at OAuth start; required to write
        // tokens to the correct mateh_agent (Meta strips ?agentId= on redirect).
        const agentIdFromState: string = stateData.agentId || ''

        // Get saved credentials — read from the SPECIFIC agent that started
        // OAuth, not from instance row (which holds primary's appId/secret).
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Instance not found', 404)

        let metaConfig: any = null
        if (agentIdFromState) {
            const [agentRow] = await db.select().from(matehAgents)
                .where(and(eq(matehAgents.id, agentIdFromState), eq(matehAgents.vpsInstanceId, instanceId)))
            metaConfig = agentRow?.metaTokens as any
        }
        if (!metaConfig) {
            metaConfig = instance.metaTokens as any
        }
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

        // Phase 2.3.J — write to the SPECIFIC agent pinned via OAuth state.
        // Meta's redirect strips ?agentId= so resolveActiveAgent would
        // default to primary and leak tokens across agents.
        const metaTokensPayload = {
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
        }

        if (agentIdFromState) {
            await writeAgentTokensFor(agentIdFromState, instanceId, { metaTokens: metaTokensPayload as never })
            await setAgentIntegration(instanceId, 'mt', 'meta', {
                pageName: pages[0]?.name, instagramAccountId, adAccountId: adAccounts[0]?.id,
                connectedAt: new Date().toISOString(), status: 'connected',
            }, 'connected', agentIdFromState).catch(err => console.error('Failed to set agent meta integration:', err))
        } else {
            await writeAgentTokens(c, instanceId, { metaTokens: metaTokensPayload as never })
            const __metaAgent = await resolveActiveAgent(c, instanceId)
            await setAgentIntegration(instanceId, 'mt', 'meta', {
                pageName: pages[0]?.name, instagramAccountId, adAccountId: adAccounts[0]?.id,
                connectedAt: new Date().toISOString(), status: 'connected',
            }, 'connected', __metaAgent?.id).catch(err => console.error('Failed to set agent meta integration:', err))
        }

        console.log(`Meta connected for ${instanceId}: ${pages.length} pages, ${adAccounts.length} ad accounts, IG: ${instagramAccountId || 'none'}`)

        // Deploy Instagram MCP server to VPS
        if (instance.ip && instagramAccountId) {
            try {
                await deployInstagramMCP(
                    instance.ip,
                    instance.rootPassword || undefined,
                    pages[0]?.access_token || longLivedToken,
                    instagramAccountId
                )
            } catch (mcpErr) {
                console.error('Instagram MCP deploy failed:', mcpErr)
            }
        }

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

        // Get instance for VPS cleanup
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        await writeAgentTokens(c, instanceId, { metaTokens: null })

        // Remove from per-agent integrations — Phase 2.3.E: pass agentId
        const { resolveActiveAgent: __resMetaDiscAgent } = await import('@/services/agentContext')
        const __metaDiscAgent = await __resMetaDiscAgent(c, instanceId)
        await removeAgentIntegration(instanceId, 'mt', 'meta', __metaDiscAgent?.id).catch(() => {})

        // Remove Instagram MCP server from VPS
        if (instance?.ip) {
            try {
                await removeInstagramMCP(instance.ip, instance.rootPassword || undefined)
            } catch (mcpErr) {
                console.error('Instagram MCP removal failed:', mcpErr)
            }
        }

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

        // Phase 2.3.J — strict per-agent read. When an active agent exists,
        // do NOT fall back to instance.* (which holds primary's tokens).
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const metaTokens = (__activeAgent ? __activeAgent.metaTokens : instance?.metaTokens) as any

        if (!metaTokens) {
            return ok(c, { connected: false })
        }

        return ok(c, {
            connected: metaTokens.status === 'connected',
            pageName: metaTokens.pageName,
            hasInstagram: !!metaTokens.instagramAccountId,
            hasAdAccount: !!metaTokens.adAccountId,
            adAccountId: metaTokens.adAccountId,
        })
    } catch (err) {
        return fail(c, 'Failed to check status', 500)
    }
}

// ── Deploy Instagram MCP server to VPS ──
async function deployInstagramMCP(
    ip: string,
    password: string | undefined,
    accessToken: string,
    instagramAccountId: string
): Promise<void> {
    console.log(`Deploying Instagram MCP server to ${ip}...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', '@mcpware/instagram-mcp'],
        env: {
            INSTAGRAM_ACCESS_TOKEN: accessToken,
            INSTAGRAM_ACCOUNT_ID: instagramAccountId,
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    // CRITICAL: stop → edit → start
    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['instagram'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('instagram configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`Instagram MCP server deployed to ${ip}`)
}

// ── Remove Instagram MCP server from VPS ──
async function removeInstagramMCP(ip: string, password?: string): Promise<void> {
    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('instagram', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('instagram removed')
" &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)
}