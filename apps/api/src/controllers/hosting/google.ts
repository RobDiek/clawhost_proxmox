import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import crypto from 'crypto'
import { resolveUserId } from './authHelper'
import { setAgentIntegration, removeAgentIntegration, getAgentIntegration, getAllIntegrations, getPrimaryAgent, type AgentType } from '@/services/agentIntegrations'
import { writeAgentTokens, writeAgentTokensFor, resolveActiveAgent } from '@/services/agentContext'

/** Parse JWT from ?token= query param (for OAuth redirects) */
function resolveUserIdFromQuery(c: Context): string | null {
    const queryToken = c.req.query('token')
    if (!queryToken) return null
    const parts = queryToken.split('.')
    if (parts.length !== 3) return null
    const secret = process.env.JWT_SECRET || ''
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
    if (parts[2] !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://api.clawflow.flowmatic.co.il/hosting/integrations/google/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'

// Available Google scopes (limited to what google-lite-mcp.js supports)
const SCOPE_MAP: Record<string, string> = {
    calendar:  'https://www.googleapis.com/auth/calendar',
    gmail:     'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    contacts:  'https://www.googleapis.com/auth/contacts',
    ads:       'https://www.googleapis.com/auth/adwords',
    drive:     'https://www.googleapis.com/auth/drive.file',
    // Phase 2026.02 Block 6: bumped from analytics.readonly to analytics.edit.
    // analytics.edit covers full Admin API (properties / data streams /
    // key events delete + patch / bigquery links / conversion exports) PLUS
    // analytics.readonly's data API access. Existing tenants with the old
    // readonly token must re-auth once to grant the upgrade — UI surfaces
    // this via the integrations page when the GA4 capability check fails.
    analytics: 'https://www.googleapis.com/auth/analytics.edit https://www.googleapis.com/auth/analytics.readonly',
    youtube:   'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    // ── Mazhir scopes ──
    // tagmanager.edit.containers — create/update tags & triggers in workspaces
    // tagmanager.publish — publish workspace versions live
    // tagmanager.edit.containerversions — required for :create_version (which deletes-and-versions a workspace)
    // We bundle all three under one alias since auto-config requires the full chain.
    gtm:       'https://www.googleapis.com/auth/tagmanager.edit.containers https://www.googleapis.com/auth/tagmanager.publish https://www.googleapis.com/auth/tagmanager.edit.containerversions https://www.googleapis.com/auth/tagmanager.readonly',
    // Search Console — needed for organic queries + landing-page rank signal
    // (gscEnrich + gscPagesEnrich). Read-only by design.
    gsc:       'https://www.googleapis.com/auth/webmasters.readonly',
}

// ── GET /integrations/google/auth ──
// Starts OAuth flow — redirects user to Google consent screen
export const googleAuth = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        const scopeParam = c.req.query('scopes') || 'calendar'

        if (!instanceId) return fail(c, 'instanceId required', 400)
        if (!GOOGLE_CLIENT_ID) return fail(c, 'Google OAuth not configured', 500)

        // Verify ownership (token from query param — OAuth redirect has no Authorization header)
        const userId = resolveUserId(c) || resolveUserIdFromQuery(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [inst] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!inst) return fail(c, 'Instance not found', 404)

        // Build scopes from comma-separated list
        const requestedScopes = scopeParam.split(',').map(s => SCOPE_MAP[s.trim()]).filter(Boolean)
        if (requestedScopes.length === 0) return fail(c, 'No valid scopes', 400)

        // Always include openid + email for identification
        const scopes = [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            ...requestedScopes,
        ]

        // Determine agent type from query param (default: primary agent for this instance)
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((inst.selectedComponents as string[]) || [])

        // Phase 2.3.J — capture the active mateh_agent id so the OAuth callback
        // writes to the SAME agent the user was on. Google's redirect strips
        // `?agentId=`, so we must round-trip it through `state`.
        const __activeAgentForStart = await resolveActiveAgent(c, instanceId)
        const agentIdFromContext = __activeAgentForStart?.id || ''

        // State = instanceId + scopes + agent + agentId + HMAC signature (prevents tampering)
        // Phase 4.3-O M4: TTL — stale state stolen from logs/history can't be reused after 10 min.
        const statePayload = JSON.stringify({ instanceId, scopes: scopeParam, uid: userId, agent: agentType, agentId: agentIdFromContext, exp: Date.now() + 10 * 60 * 1000 })
        const stateHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(statePayload).digest('base64url')
        const state = Buffer.from(JSON.stringify({ p: statePayload, s: stateHmac })).toString('base64url')

        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: scopes.join(' '),
            access_type: 'offline',         // get refresh_token
            prompt: 'consent',              // always show consent (ensures refresh_token)
            // Incremental authorization — CRITICAL when one Google identity connects
            // several integrations (GA + GTM + Ads). Without this, each connect
            // requests ONLY its own scope and the resulting token REPLACES the
            // prior scopes — e.g. connecting GA dropped tagmanager+adwords off the
            // token, breaking GTM/Ads for that agent. With include_granted_scopes,
            // Google returns a token carrying the UNION of all previously-granted
            // scopes for this user+client, so integrations accumulate instead of
            // cannibalizing each other.
            include_granted_scopes: 'true',
            state,
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        return c.redirect(authUrl)
    } catch (err) {
        console.error('googleAuth error:', err)
        return fail(c, 'Failed to start Google auth', 500)
    }
}

// ── GET /integrations/google/callback ──
// Google redirects here after user approves
export const googleCallback = async (c: Context) => {
    try {
        const code = c.req.query('code')
        const stateParam = c.req.query('state')
        const error = c.req.query('error')

        if (error) {
            console.error('Google OAuth error:', error)
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=${error}`)
        }

        if (!code || !stateParam) {
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=missing_params`)
        }

        // Decode and verify state (HMAC-signed to prevent tampering)
        const stateOuter = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
        const expectedHmac = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(stateOuter.p).digest('base64url')
        if (stateOuter.s !== expectedHmac) {
            console.error('Google OAuth state HMAC mismatch — possible tampering')
            return c.redirect(`${FRONTEND_URL}/dashboard.html?google_error=invalid_state`)
        }
        // Phase 4.3-O M4: state TTL verification (10 min from issue time).
        try {
            const _stateData = JSON.parse(stateOuter.p)
            if (_stateData.exp && Date.now() > _stateData.exp) {
                console.error('Google OAuth state expired')
                return c.redirect(`${FRONTEND_URL}/dashboard.html?google_error=state_expired`)
            }
        } catch { /* exp check best-effort — main HMAC check above is authoritative */ }

        // Route to GSC callback if state indicates GSC auth
        try {
            const statePayload = JSON.parse(stateOuter.p)
            if (statePayload.type === 'gsc') {
                const { gscCallbackHandler } = await import('./gsc')
                return gscCallbackHandler(c, code!, stateOuter)
            }
        } catch { /* not GSC — continue with normal Google flow */ }
        const stateData = JSON.parse(stateOuter.p)
        const { instanceId, scopes } = stateData
        // Extract agent type from state (defaults to primary agent for backward compat)
        const agentType: AgentType = stateData.agent || 'oc'
        // Phase 2.3.J — agentId from state pins the write to the SPECIFIC
        // mateh_agent the user was on when starting OAuth.
        const agentIdFromState: string = stateData.agentId || ''

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        })

        const tokenData = await tokenRes.json() as {
            access_token?: string
            refresh_token?: string
            expires_in?: number
            scope?: string
            error?: string
            error_description?: string
        }

        if (tokenData.error || !tokenData.access_token) {
            console.error('Google token exchange failed:', tokenData.error_description || tokenData.error)
            return c.redirect(`${FRONTEND_URL}/dashboard?google_error=token_failed`)
        }

        // Get user email
        let email = ''
        try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            })
            const userData = await userRes.json() as { email?: string }
            email = userData.email || ''
        } catch { /* non-critical */ }

        // Save tokens to DB. Store the ACTUAL granted scopes (tokenData.scope is
        // the union Google returns thanks to include_granted_scopes), not just the
        // aliases requested THIS time — otherwise a "+analytics" reconnect stores
        // ["analytics"] and drops the ads/gtm the same grant still carries, so
        // downstream scope checks (GA4/GTM pickers) falsely report "missing scope".
        const grantedScopeUrls = String(tokenData.scope || '').split(/\s+/).filter(Boolean)
        const scopesUnion = [...new Set([...scopes.split(','), ...grantedScopeUrls])]
        const googleTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
            scopes: scopesUnion,
            email,
            connectedAt: new Date().toISOString(),
        }

        // Phase 2.3.J — write to the SPECIFIC agent pinned via OAuth state.
        // The callback request from Google has no `?agentId=` so falling back
        // to `resolveActiveAgent(c, ...)` would default to primary and leak
        // tokens between agents on multi-MATEH-per-VPS setups.
        let connectedAgentId: string | null = agentIdFromState || null
        if (agentIdFromState) {
            await setAgentIntegration(instanceId, agentType, 'google', googleTokens as any, 'connected', agentIdFromState)
            await writeAgentTokensFor(agentIdFromState, instanceId, { googleTokens: googleTokens as never })
        } else {
            // Legacy / no agent in state — fall back to old behaviour.
            const __activeAgent = await resolveActiveAgent(c, instanceId)
            connectedAgentId = __activeAgent?.id || null
            await setAgentIntegration(instanceId, agentType, 'google', googleTokens as any, 'connected', __activeAgent?.id)
            await writeAgentTokens(c, instanceId, { googleTokens: googleTokens as never })
        }

        // True per-agent isolation for a SHARED Google identity: Google revokes
        // the prior refresh token whenever the same email re-consents, so a
        // sibling agent using this email would be left with a dead token. With
        // include_granted_scopes the new token carries the union of all granted
        // scopes — mirror it onto every sibling agent on the same email so the
        // whole instance stays on ONE live grant. Resource selections (which
        // GTM container / GA4 property / Ads account) remain per-agent.
        try {
            const { propagateGoogleGrant } = await import('@/services/googleGrantSync')
            await propagateGoogleGrant({ instanceId, sourceAgentId: connectedAgentId, email, googleTokens })
        } catch (e) {
            console.warn('[google] grant propagation failed:', (e as Error).message)
        }

        console.log(`Google connected for instance ${instanceId}, agent ${agentType}: ${email} (scopes: ${scopes})`)

        // Deploy credentials to VPS so agent can use Google APIs
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (instance?.ip) {
            try {
                await deployGoogleToVPS(instance.ip, instance.rootPassword || undefined, {
                    clientId: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    accessToken: tokenData.access_token!,
                    refreshToken: tokenData.refresh_token || '',
                }, scopes, agentType)
                // Update SOUL.md to include calendar tool instructions
                await updateSoulWithTools(instance.ip, instance.rootPassword || undefined)
            } catch (deployErr) {
                console.error('Failed to deploy Google creds to VPS:', deployErr)
            }
        }

        // Redirect back to dashboard with success
        return c.redirect(`${FRONTEND_URL}/dashboard?google_connected=true&scopes=${scopes}`)
    } catch (err) {
        console.error('googleCallback error:', err)
        return c.redirect(`${FRONTEND_URL}/dashboard?google_error=server_error`)
    }
}

// ── POST /integrations/google/disconnect ──
export const googleDisconnect = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId') || c.req.param('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        // Verify ownership
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Determine which agent to disconnect
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((instance.selectedComponents as string[]) || [])

        // Get tokens from agent_integrations (primary source) — must be
        // agentId-scoped so we don't revoke another agent's token on a
        // multi-MATEH VPS.
        const __activeAgentForDisc = await resolveActiveAgent(c, instanceId)
        const agentInt = await getAgentIntegration(instanceId, agentType, 'google', __activeAgentForDisc?.id)
        const tokens = agentInt?.config as any
        if (tokens?.accessToken) {
            // Revoking at Google kills the SHARED grant for every sibling agent
            // on the same email — only do it when THIS is the last agent using
            // that email. Otherwise just drop this agent's link below.
            let safeToRevoke = true
            try {
                const { googleEmailStillInUse } = await import('@/services/googleGrantSync')
                if (tokens.email && await googleEmailStillInUse({ instanceId, excludeAgentId: __activeAgentForDisc?.id, email: tokens.email })) {
                    safeToRevoke = false
                    console.log(`[google] skip Google revoke on disconnect — sibling agent still uses ${tokens.email}`)
                }
            } catch { /* on doubt, fall through to revoke */ }
            if (safeToRevoke) {
                try {
                    await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
                        method: 'POST',
                    })
                } catch { /* best effort */ }
            }
        }

        // Remove from per-agent integrations — Phase 2.3.E: pass agentId
        await removeAgentIntegration(instanceId, agentType, 'google', __activeAgentForDisc?.id)

        // Phase 2.3.B — clear tokens on the active mateh_agent. For primary,
        // also nulls instance.googleTokens (legacy).
        await writeAgentTokens(c, instanceId, { googleTokens: null })
        // Legacy compat: also clean up the global instance row when nothing left.
        const remaining = await getAllIntegrations(instanceId)
        const anyGoogleLeft = remaining.some(r => r.integrationType === 'google' && r.status === 'connected')
        if (!anyGoogleLeft) {
            await db.update(instances)
                .set({ googleTokens: null })
                .where(eq(instances.id, instanceId))
        }

        // Remove MCP server: stop → edit → start (per-agent name)
        const mcpServerName = `google-workspace-${agentType}`
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('${mcpServerName}', None)
# Also remove legacy non-suffixed name
d.get('mcp', {}).get('servers', {}).pop('google-workspace', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'Google disconnected.')
    } catch (err) {
        console.error('googleDisconnect error:', err)
        return fail(c, 'Failed to disconnect', 500)
    }
}

// ── GET /integrations/google/status ──
export const googleStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        // Verify ownership
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Authentication required', 401)
        const [instance] = await db.select().from(instances).where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Read from agent_integrations (per-agent)
        const agentParam = c.req.query('agent') as AgentType | undefined
        const agentType: AgentType = agentParam && ['oc', 'mt', 'bare'].includes(agentParam)
            ? agentParam
            : getPrimaryAgent((instance.selectedComponents as string[]) || [])

        // Phase 2.3.E — honor ?agentId= so secondary agents see their own
        // integration status (not the primary's).
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const __activeAgent = await resolveActiveAgent(c, instanceId)

        const agentInt = await getAgentIntegration(instanceId, agentType, 'google', __activeAgent?.id)
        if (!agentInt || !agentInt.config?.accessToken) {
            return ok(c, { connected: false, agent: agentType }, 'Not connected.')
        }

        const tokens = agentInt.config as any
        return ok(c, {
            connected: true,
            agent: agentType,
            email: tokens.email || '',
            scopes: tokens.scopes || [],
            connectedAt: tokens.connectedAt || '',
            // Phase 4.1 — surface picker selections so UI can display
            // which property/container is currently selected for this tenant.
            config: {
                ga4PropertyId: tokens.ga4PropertyId || null,
                ga4PropertyName: tokens.ga4PropertyName || null,
                gtmAccountId: tokens.gtmAccountId || null,
                gtmAccountName: tokens.gtmAccountName || null,
                gtmContainerId: tokens.gtmContainerId || null,
                gtmContainerName: tokens.gtmContainerName || null,
                gtmContainerPublicId: tokens.gtmContainerPublicId || null,
            },
        }, 'Connected.')
    } catch (err) {
        console.error('googleStatus error:', err)
        return fail(c, 'Failed to get status', 500)
    }
}

// ── Deploy lightweight Google MCP server to VPS ──
// Uses google-lite-mcp.js (10 tools) instead of @presto-ai/google-workspace-mcp (25-30 tools)
// Per-agent: MCP server name includes agent suffix (google-workspace-oc, google-workspace-mt)
async function deployGoogleToVPS(ip: string, password: string | undefined, creds: {
    clientId: string
    clientSecret: string
    accessToken: string
    refreshToken: string
}, scopes?: string, agentType: AgentType = 'oc'): Promise<void> {
    const mcpServerName = `google-workspace-${agentType}`
    console.log(`Deploying google-lite MCP server '${mcpServerName}' to ${ip} (scopes: ${scopes || 'calendar,gmail,contacts'})...`)

    // Deploy our lite MCP script to the VPS
    const { resolve } = await import('path')
    const mcpScript = readFileSync(resolve(process.cwd(), '../../scripts/google-lite-mcp.js'), 'utf-8')
    const scriptB64 = Buffer.from(mcpScript).toString('base64')

    const mcpConfig = {
        command: 'node',
        args: ['/opt/openclaw/google-lite-mcp.js'],
        env: {
            GOOGLE_CLIENT_ID: creds.clientId,
            GOOGLE_CLIENT_SECRET: creds.clientSecret,
            GOOGLE_REFRESH_TOKEN: creds.refreshToken,
            GOOGLE_SCOPES: scopes || 'calendar,gmail,contacts',
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    // CRITICAL: stop gateway FIRST, then edit config, then start.
    await sshExec(ip, `
        echo '${scriptB64}' | base64 -d > /opt/openclaw/google-lite-mcp.js &&
        chmod 644 /opt/openclaw/google-lite-mcp.js &&
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
# Remove legacy non-suffixed server (from before agent isolation)
d['mcp']['servers'].pop('google-workspace', None)
d['mcp']['servers']['${mcpServerName}'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('${mcpServerName} configured: ' + cfg['command'])
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`google-lite MCP server '${mcpServerName}' deployed to ${ip}`)
}

// ── Update SOUL.md with available tools after integration ──
async function updateSoulWithTools(ip: string, password?: string): Promise<void> {
    try {
        // Check if SOUL.md already has MCP tools section
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md', password)
        if (soul.includes('Google Workspace MCP')) {
            console.log('SOUL.md already has Google MCP tools section')
            return
        }

        const toolsSection = `

## Google Workspace MCP
שרת Google Workspace MCP מותקן ומחובר. כלים זמינים:
- **Calendar** — יצירה, עדכון, מחיקת אירועים ביומן
- **Gmail** — קריאה ושליחת מיילים
- **Drive** — גישה לקבצים ב-Google Drive
- **Sheets** — קריאה ועריכת גיליונות
הכלים זמינים דרך MCP — השתמש בהם ישירות, הם מוגדרים אוטומטית.
`
        const b64 = Buffer.from(toolsSection).toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password
        )

        await sshExec(ip, 'systemctl restart openclaw-gateway', password)
        console.log('SOUL.md updated with Google MCP tools section')
    } catch (err) {
        console.error('updateSoulWithTools error:', err)
    }
}