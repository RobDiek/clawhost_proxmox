import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import crypto from 'crypto'
import { randomBytes } from 'crypto'
import { db } from '@/db'
import { instances, payments } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import {
    PLANS,
    essentialReadiness,
    listConnectedIntegrationIds,
    autoConnectedIntegrationIds,
    deriveIntents,
    isValidIntent,
    pipelineNamespacesWithData,
} from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import provisioner from '@/services/provisioner'
import telegram from '@/services/telegram'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

/** Run a command over SSH on a target VPS. Used for the gateway-only restart
 *  that the "הפעלה מחדש" Danger Zone button triggers. */
async function sshGatewayRestart(ip: string, password?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        const cleanup = () => { try { conn.end() } catch {} }
        const auth: { host: string; username: string; readyTimeout: number; privateKey?: Buffer; password?: string } = {
            host: ip,
            username: 'root',
            readyTimeout: 15_000,
        }
        if (password) auth.password = password
        else { try { auth.privateKey = readFileSync(SSH_KEY_PATH) } catch (e) { return reject(e as Error) } }

        conn.on('ready', () => {
            conn.exec('systemctl restart openclaw-gateway', (err, stream) => {
                if (err) { cleanup(); return reject(err) }
                stream.on('close', (code: number) => {
                    cleanup()
                    if (code === 0) resolve()
                    else reject(new Error(`gateway restart exit ${code}`))
                }).on('data', () => {}).stderr.on('data', () => {})
            })
        }).on('error', (err) => { cleanup(); reject(err) }).connect(auth)
    })
}

/** Extract userId from JWT or HonoEnv middleware */
function resolveUserId(c: Context<HonoEnv>): string | null {
    // Try HonoEnv middleware first
    try { const id = c.get('userId'); if (id) return id; } catch {}
    // Fallback: parse JWT from Authorization header
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    const parts = auth.slice(7).split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const secret = process.env.JWT_SECRET || ''
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

export const getInstances = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        // Exclude terminated — those VPSes are gone; surfacing them let the
        // dashboard bind to a dead instance and render a phantom cabinet.
        const result = await db.select()
            .from(instances)
            .where(and(eq(instances.userId, userId), ne(instances.status, 'terminated')))

        const sanitized = result.map(i => ({
            id: i.id,
            planKey: i.planKey,
            priceIls: i.priceIls,
            status: i.status,
            selectedComponents: i.selectedComponents,
            automationTool: i.automationTool,
            subdomainAgent: i.subdomainAgent,
            subdomainFlows: i.subdomainFlows,
            openclawToken: i.openclawToken,
            onboardingStep: i.onboardingStep,
            onboardingCompleted: i.onboardingCompleted,
            subscriptionStatus: i.subscriptionStatus,
            createdAt: i.createdAt
        }))

        return ok(c, sanitized, 'Instances retrieved.')
    } catch (err) {
        console.error('Get instances error:', err)
        return fail(c, 'Failed to get instances.', 500)
    }
}

export const getInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        // Phase 2.3.A — if ?agentId=mta_xxx is provided, overlay per-agent
        // fields from that agent's mateh_agents row. Lets the dashboard
        // load secondary-agent data (research, sub-agent models, schedules,
        // tokens) using the same /instances/:id endpoint with just an
        // agentId hint. VPS-level fields (ip, status, hetznerServerId,
        // subdomain root) stay from the instance row.
        const { resolveActiveAgent } = await import('@/services/agentContext')
        const activeAgent = await resolveActiveAgent(c, instanceId)

        // Default response = instance fields. If an agent row exists,
        // overlay the per-agent fields so the dashboard sees the right
        // data for whichever agent is active.
        const response: Record<string, unknown> = { ...instance, rootPassword: undefined }
        if (activeAgent) {
            // Phase 2.3.A overlay — per-agent state lives on mateh_agents.
            // For a SECONDARY agent, all per-agent fields come from the agent
            // row. For the PRIMARY agent, we keep using mateh_agents data too
            // (it was backfilled identical to instance.*) so reads are
            // consistent regardless of which agent is active.
            response.activeAgentId = activeAgent.id
            response.activeAgentIsPrimary = activeAgent.isPrimary
            response.activeAgentName = activeAgent.name
            response.activeAgentBrandSlug = activeAgent.brandSlug
            response.activeAgentTenantId = activeAgent.tenantId
            response.activeAgentSubdomainAgent = activeAgent.subdomainAgent
            response.activeAgentGatewayPort = activeAgent.gatewayPort
            // Per-agent state overrides
            response.researchData = activeAgent.researchData
            response.subAgentModels = activeAgent.subAgentModels
            response.schedules = activeAgent.schedules
            response.aiProviderKey = activeAgent.aiProviderKey
            response.aiProviderType = activeAgent.aiProviderType
            response.openaiApiKey = activeAgent.openaiApiKey
            response.falApiKey = activeAgent.falApiKey
            response.elevenlabsApiKey = activeAgent.elevenlabsApiKey
            response.dataforseoKey = activeAgent.dataforseoKey
            response.firecrawlKey = activeAgent.firecrawlKey
            response.googleTokens = activeAgent.googleTokens
            response.metaTokens = activeAgent.metaTokens
            response.microsoftTokens = activeAgent.microsoftTokens
            response.gscTokens = activeAgent.gscTokens
            response.githubConfig = activeAgent.githubConfig
            response.telegramChatId = activeAgent.telegramChatId
            response.telegramBotToken = activeAgent.telegramBotToken
            response.onboardingStep = activeAgent.onboardingStep
            response.onboardingCompleted = activeAgent.onboardingCompleted
            // Subdomains too — secondary agents have their own
            response.subdomainAgent = activeAgent.subdomainAgent || instance.subdomainAgent
            response.openclawToken = activeAgent.openclawToken || instance.openclawToken
            response.automationPassword = activeAgent.automationPassword || instance.automationPassword

            // Phase 2.3.E — boolean integration flags MUST be computed per-agent.
            // The dashboard uses these to render "מחובר/לא מחובר" badges; without
            // per-agent overlay the secondary agent shows primary's connection
            // states (the bug the user hit on a fresh secondary onboarding).
            response.hasAnthropicKey = !!activeAgent.aiProviderKey
            response.hasOpenaiKey = !!activeAgent.openaiApiKey
            response.hasGsc = !!activeAgent.gscTokens
            response.hasDataforseo = !!activeAgent.dataforseoKey
            response.hasFirecrawl = !!activeAgent.firecrawlKey
            response.hasFalKey = !!activeAgent.falApiKey
            response.hasElevenlabsKey = !!activeAgent.elevenlabsApiKey
            response.hasGoogleAds = (() => {
                const gt = activeAgent.googleTokens as { scopes?: string[] | string; scope?: string } | null
                if (!gt) return false
                const scopes = (gt.scopes || gt.scope || '').toString().toLowerCase()
                if (scopes.includes('adwords')) return true
                const tokens = scopes.split(/[\s,]+/)
                return tokens.includes('ads')
            })()
            // (googleAdsCustomerId/HasDevToken set unconditionally below; no need to repeat per-branch)
            response.hasMetaAds = (() => {
                const mt = activeAgent.metaTokens as {
                    adAccountId?: string;
                    adAccounts?: unknown[];
                    grantedScopes?: string;
                } | null
                if (!mt) return false
                return !!(mt.adAccountId || (mt.adAccounts && mt.adAccounts.length)) ||
                    (mt.grantedScopes || '').toString().toLowerCase().includes('ads_management')
            })()
            // Phase 2.3.K — row-based integrations (agent_integrations table)
            // need their own per-agent overlay flags, because the frontend
            // explicitly drops the legacy `agentIntegrations` bundle when on
            // a secondary agent (to avoid leaking primary's bundle).
            // Without these flags secondary cards stay disconnected even
            // after the user saves a key.
            const { getAgentIntegrations, getPrimaryAgent } = await import('@/services/agentIntegrations')
            const __atForBundle = getPrimaryAgent((instance.selectedComponents as string[]) || [])
            const __activeAgentInts = await getAgentIntegrations(instanceId, __atForBundle, activeAgent.id)
                .catch(() => [] as Array<{ integrationType: string; status: string; config: Record<string, unknown> }>)
            const __hasInt = (type: string) => __activeAgentInts.some(r => r.integrationType === type && r.status === 'connected')
            response.hasBrave = __hasInt('brave')
            response.hasWordpress = __hasInt('wordpress')
            response.hasReddit = __hasInt('reddit')
            response.hasSmtp = __hasInt('smtp')
            response.hasWhatsapp = __hasInt('whatsapp')
            // Phase 2.3.K(fix5) — surface every row-based integration as a
            // boolean so frontend cards never have to fall back to
            // localStorage (the source of the "disappears after reload" bug).
            response.hasResend = __hasInt('resend')
            response.hasReplicate = __hasInt('replicate')
            response.hasBrightdata = __hasInt('brightdata')
            response.hasGemini = __hasInt('gemini')
            response.hasCanva = __hasInt('canva')
            // Also expose the per-agent bundle as a clean map so the frontend
            // can stop having to special-case `agentInts = {}` for secondaries.
            response.activeAgentIntegrations = __activeAgentInts.reduce((acc, r) => {
                acc[r.integrationType] = { connected: r.status === 'connected', config: r.config }
                return acc
            }, {} as Record<string, { connected: boolean; config: Record<string, unknown> }>)

            // Profile / research / strategy / brand book — derived from per-agent
            // research_data and from a per-agent brand_books query.
            //
            // research_data schema evolution:
            //   v1 (legacy):  rd.report / rd.stage1..stage5 / rd.strategy
            //   v2 (current): rd.results.<stage_id> where stage_id ∈
            //     { competitor_landscape, audience_personas, seo_keyword_research,
            //       positioning, strategy_options, content_plan, validation, ... }
            //
            // hasResearch = any meaningful research-pipeline stage completed.
            // hasStrategy = strategy_options stage completed (the v2 equivalent
            // of v1 rd.strategy).
            const rd = (activeAgent.researchData as Record<string, unknown> | null) || {}
            const results = (rd.results as Record<string, unknown> | undefined) || undefined
            const v2ResearchStageIds = [
                'competitor_landscape', 'audience_personas', 'seo_keyword_research',
                'positioning', 'content_plan', 'aeo_visibility', 'validation',
            ]
            const hasV2Research = !!results && v2ResearchStageIds.some(s => !!results[s])
            response.hasProfile = !!rd.answers
            response.hasResearch = !!(rd.report || rd.stage1 || hasV2Research)
            response.hasStrategy = !!(rd.strategy || (results && results.strategy_options))
            // Pipeline-complete = Stage 10 (validation / confidence_score) finished.
            // Once this is true the home-card for research+strategy can flip green
            // regardless of whether the user has explicitly committed a scenario
            // via /research/scenario/choose. The chosenScenario commit is still
            // required for downstream content_plan generation (a separate gate),
            // but the user shouldn't see a yellow "incomplete" card after every
            // pipeline stage passed.
            response.hasPipelineComplete = !!(results && (results.validation || results.confidence_score))
            const { brandBooks } = await import('@/db/schema')
            const [approvedBb] = await db.select({ id: brandBooks.id }).from(brandBooks)
                .where(and(
                    eq(brandBooks.instanceId, instanceId),
                    eq(brandBooks.agentId, activeAgent.id),
                    eq(brandBooks.status, 'approved'),
                ))
                .limit(1)
            response.hasBrandBook = !!approvedBb

            // Marketing readiness — gate "מחקר ואסטרטגיה" on the chosen channels'
            // essential integrations being connected (group-aware: WordPress|GitHub
            // etc.), so research runs on REAL data, not LLM fallback. Computed
            // server-side from the registry (single source) + actual connections.
            try {
                const rdMR = (activeAgent.researchData as Record<string, any>) || {}
                let mrIntents = Array.isArray(rdMR.marketingIntents)
                    ? rdMR.marketingIntents.filter(isValidIntent)
                    : []
                if (mrIntents.length === 0) {
                    const pp = rdMR.paidProfile as { goal?: string; primaryGoal?: string; launchPath?: string } | undefined
                    mrIntents = deriveIntents({
                        agents: [],
                        paidProfile: pp ? { goal: pp.goal || pp.primaryGoal, launchPath: pp.launchPath } : null,
                        existingNamespaces: pipelineNamespacesWithData(rdMR),
                        answers: (rdMR.answers as { platforms?: string; marketingGoals?: string }) || null,
                    })
                }
                const connectedSet = new Set<string>([
                    ...listConnectedIntegrationIds(rdMR),
                    ...autoConnectedIntegrationIds(instance as never),
                ])
                // GitHub publishing is stored in githubConfig, not integrationsState.
                const ghConnected = !!(activeAgent.githubConfig || (instance as { githubConfig?: unknown }).githubConfig)
                if (ghConnected) connectedSet.add('github')
                response.hasGithub = ghConnected
                response.marketingIntents = mrIntents
                response.marketingReadiness = essentialReadiness(mrIntents, Array.from(connectedSet))
            } catch (e) {
                console.warn('[instances] marketingReadiness compute failed:', (e as Error).message)
            }
        }

        // Phase 4.2.1-K — surfacing of API readiness signals.
        // Phase 4.3-P: googleAdsConfig is now per-agent (mateh_agents column).
        // Read the ACTIVE agent's config directly; fall back to instance row
        // only when the agent has no row of its own (legacy VPSes pre-2.1).
        // Combined with the hasGoogleAds (ads OAuth scope) check, this fully
        // closes the cross-agent leak Sergei reported.
        const _agentGadsCfg = (activeAgent?.googleAdsConfig as Record<string, unknown> | null) ?? null
        const _gadsCfg = _agentGadsCfg
            ?? (activeAgent?.isPrimary ? (instance.googleAdsConfig as Record<string, unknown> | null) : null)
            ?? {}
        if (response.hasGoogleAds) {
            response.googleAdsCustomerId = _gadsCfg.customerId || null
            response.googleAdsHasDevToken = !!_gadsCfg.developerToken
        } else {
            response.googleAdsCustomerId = null
            response.googleAdsHasDevToken = false
        }
        response.googleAdsConfig = _gadsCfg.customerId ? _gadsCfg : null
        // Mode is per-agent too. Don't let secondary inherit primary's mode.
        response.googleAdsMode = (activeAgent?.googleAdsMode as string | null)
            ?? (activeAgent?.isPrimary ? (instance.googleAdsMode || null) : null)
        // Phase 4.2.1-L — per-API OAuth scope booleans. Use activeAgent's
        // googleTokens when available (per-agent OAuth), else instance row.
        const _activeGt = (response.googleTokens as { scopes?: string[] | string; scope?: string } | null)
            || (instance.googleTokens as { scopes?: string[] | string; scope?: string } | null)
        const _scopeText = (() => {
            if (!_activeGt) return ''
            const raw = _activeGt.scopes || _activeGt.scope || ''
            return Array.isArray(raw) ? raw.join(' ').toLowerCase() : String(raw).toLowerCase()
        })()
        const _scopeTokens = _scopeText.split(/[\s,]+/)
        response.hasGtmScope = _scopeText.includes('tagmanager') || _scopeTokens.includes('gtm')
        response.hasGa4Scope = _scopeText.includes('analytics') || _scopeTokens.includes('ga4') || _scopeTokens.includes('analytics')
        // Phase 4.2.x — expose the per-agent Google SCOPE list (non-secret) so the
        // dashboard cards can derive connected state per service. The raw
        // googleTokens bundle is scrubbed below (it carries the refresh token),
        // which previously left the frontend reading `undefined` scopes →
        // every Google sub-card showed "לא מחובר" even when actually connected.
        response.googleScopes = _activeGt
            ? (Array.isArray(_activeGt.scopes)
                ? _activeGt.scopes
                : String(_activeGt.scopes || _activeGt.scope || '').split(/[\s,]+/)).filter(Boolean)
            : []

        // Telegram connection flag — the bot token is scrubbed below for
        // security, so the dashboard needs a boolean like every other
        // integration. This was missed when Phase 0 added the has* flags,
        // leaving "בוט Telegram מחובר" permanently red even when telegram is
        // connected. Source: the per-agent token overlaid above (or instance
        // token for legacy), OR the agent_integrations telegram row.
        const _activeInts = response.activeAgentIntegrations as
            | Record<string, { connected?: boolean }>
            | undefined
        response.hasTelegram = !!response.telegramBotToken || !!_activeInts?.telegram?.connected

        // Phase 0 — never echo high-value secrets to the browser. The dashboard
        // renders connection state from the has* flags computed above; raw
        // provider API keys and OAuth token bundles must not leave the server
        // (previously they were returned here and cached in localStorage).
        // Kept: openclawToken / automationPassword (the user's own VPS service
        // logins, shown in the credentials card) and googleAdsConfig (its
        // non-secret customerId drives the Ads UI). rootPassword already masked.
        for (const k of [
            'aiProviderKey',
            'openaiApiKey',
            'falApiKey',
            'elevenlabsApiKey',
            'dataforseoKey',
            'firecrawlKey',
            'googleTokens',
            'metaTokens',
            'microsoftTokens',
            'gscTokens',
            'githubConfig',
            'telegramBotToken',
            'telegramWebhookSecret'
        ]) {
            delete (response as Record<string, unknown>)[k]
        }

        return ok(c, response, 'Instance retrieved.')
    } catch (err) {
        console.error('Get instance error:', err)
        return fail(c, 'Failed to get instance.', 500)
    }
}

export const getInstanceStatus = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(userId ? and(eq(instances.id, instanceId), eq(instances.userId, userId)) : eq(instances.id, instanceId))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        let serverStatus = instance.status
        if (instance.hetznerServerId) {
            try {
                const provider = getProvider('hetzner')
                const status = await provider.getServer(instance.hetznerServerId)
                serverStatus = status.status
            } catch {
                serverStatus = 'unreachable'
            }
        }

        return ok(c, {
            status: instance.status,
            serverStatus,
            ip: instance.ip,
            subdomainAgent: instance.subdomainAgent,
            subdomainFlows: instance.subdomainFlows,
            automationTool: instance.automationTool,
            selectedComponents: instance.selectedComponents,
            onboardingStep: instance.onboardingStep,
            onboardingCompleted: instance.onboardingCompleted
        }, 'Status retrieved.')
    } catch (err) {
        console.error('Get instance status error:', err)
        return fail(c, 'Failed to get status.', 500)
    }
}

// POST /hosting/instances/:id/install-complete — called by install.sh on the
// VPS itself when it finishes bootstrapping. No JWT (the VPS doesn't have a
// user token), instead authenticated by openclawToken match — only the VPS
// for this instance knows its own token because it was written to
// /etc/openclaw/instance.env by cloud-init.
export const installComplete = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ openclawToken?: string; durationSec?: number }>()
            .catch(() => ({} as { openclawToken?: string; durationSec?: number }))
        if (!body.openclawToken) return fail(c, 'openclawToken required', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return fail(c, 'Instance not found', 404)
        if (instance.openclawToken !== body.openclawToken) return fail(c, 'Token mismatch', 401)

        // Idempotent — calling twice doesn't hurt
        if (instance.status !== 'running') {
            await db.update(instances).set({ status: 'running' }).where(eq(instances.id, instanceId))
        }
        console.log(`[install-complete] ${instanceId} → running (install took ${body.durationSec || '?'}s)`)

        // Send Hebrew welcome email with credentials (idempotent — guarded by welcomeEmailSentAt)
        try {
            const { sendWelcomeEmailIfNeeded } = await import('@/services/welcomeEmail')
            sendWelcomeEmailIfNeeded({ instanceId }).catch(err =>
                console.error('[install-complete] welcome email failed:', err)
            )
        } catch (err) {
            console.error('[install-complete] welcome email import failed:', err)
        }

        return ok(c, { status: 'running' }, 'Install reported complete')
    } catch (err) {
        console.error('installComplete error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const restartInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (!instance.ip) return fail(c, 'Instance not provisioned.', 404)

        // UI promise: "מפעיל מחדש את ה-gateway. אין איבוד נתונים." — gateway-only restart
        // (~5s) instead of full Hetzner reboot (~30-60s downtime). Matches what the
        // user expects from the "הפעלה מחדש" button.
        await sshGatewayRestart(instance.ip, instance.rootPassword || undefined)

        return ok(c, null, 'Gateway restarted.')
    } catch (err) {
        console.error('Restart error:', err)
        return fail(c, 'Failed to restart gateway.', 500)
    }
}

// POST /hosting/instances/:id/upgrade-plan
export const upgradePlan = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')
        const { targetPlan } = await c.req.json<{ targetPlan: string }>()

        if (!targetPlan) return fail(c, 'targetPlan is required.', 400)

        const targetPlanInfo = PLANS.find(p => p.key === targetPlan)
        if (!targetPlanInfo) return fail(c, 'Invalid plan.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (instance.status !== 'running') return fail(c, 'Instance must be running to upgrade.', 400)

        const currentPlan = PLANS.find(p => p.key === instance.planKey)
        if (!currentPlan) return fail(c, 'Current plan not found.', 500)

        // Only allow upgrades, not downgrades
        if (targetPlanInfo.ram <= currentPlan.ram) {
            return fail(c, 'Can only upgrade to a higher plan.', 400)
        }

        if (!instance.hetznerServerId) {
            return fail(c, 'No server to upgrade.', 400)
        }

        // Record upgrade — price difference will be reflected in next billing cycle
        // TODO: integrate AllPay subscription update for pro-rated charge
        // For now: record as pending, Hetzner upgrade proceeds, billing adjusted next month
        const priceDiff = targetPlanInfo.priceIls - currentPlan.priceIls
        await db.insert(payments).values({
            id: randomBytes(5).toString('hex'),
            instanceId,
            allpayOrderId: `upgrade-${instanceId}-${Date.now()}`,
            amountIls: String(priceDiff),
            status: 'pending_billing_update',
            paidAt: null,
        })

        // Alert admin to manually update AllPay subscription amount
        await telegram.alertAdmin(
            `⬆️ Plan upgrade: ${instanceId}\n` +
            `${currentPlan.key} (₪${currentPlan.priceIls}) → ${targetPlan} (₪${targetPlanInfo.priceIls})\n` +
            `Diff: ₪${priceDiff}/month\n` +
            `⚠️ Update AllPay subscription manually!`
        ).catch(() => {})

        // Update status to upgrading
        await db.update(instances)
            .set({ status: 'upgrading' })
            .where(eq(instances.id, instanceId))

        // Notify user
        if (instance.telegramChatId) {
            await telegram.sendMessage(instance.telegramChatId,
                `⬆️ *משדרג לתוכנית ${targetPlanInfo.nameHe}*\n` +
                `השרת ייכבה לרגע ויחזור עם ${targetPlanInfo.ram}GB RAM.\n` +
                `זה ייקח ~2-3 דקות 🕐`
            )
        }

        // Perform Hetzner server type change (background)
        const provider = getProvider('hetzner')
        if (!provider.changeServerType) {
            return fail(c, 'Provider does not support server type change.', 400)
        }
        provider.changeServerType(instance.hetznerServerId, targetPlanInfo.hetznerType)
            .then(async () => {
                await db.update(instances).set({
                    status: 'running',
                    planKey: targetPlan,
                    priceIls: String(targetPlanInfo.priceIls),
                }).where(eq(instances.id, instanceId))

                if (instance.telegramChatId) {
                    await telegram.sendMessage(instance.telegramChatId,
                        `✅ *שדרוג הושלם!*\n` +
                        `תוכנית: ${targetPlanInfo.nameHe} (${targetPlanInfo.ram}GB RAM)\n` +
                        `השרת חזר לפעילות.`
                    )
                }
                await telegram.alertAdmin(`⬆️ Instance ${instanceId} upgraded: ${currentPlan.key} → ${targetPlan}`)
            })
            .catch(async (err) => {
                console.error('Upgrade failed:', err)
                await db.update(instances).set({ status: 'running' }).where(eq(instances.id, instanceId))
                await telegram.alertAdmin(`❌ Upgrade FAILED for ${instanceId}: ${(err as Error).message}`)
            })

        return ok(c, {
            from: currentPlan.key,
            to: targetPlan,
            newPrice: targetPlanInfo.priceIls,
            newRam: targetPlanInfo.ram,
        }, 'Upgrade started. Server will restart in ~2-3 minutes.')
    } catch (err) {
        console.error('Upgrade plan error:', err)
        return fail(c, 'Failed to upgrade plan.', 500)
    }
}

// POST /hosting/instances/:id/add-storage
export const addStorage = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')
        const { addonId } = await c.req.json<{ addonId: string }>()

        const STORAGE_OPTIONS: Record<string, { size: number; price: number }> = {
            storage_20: { size: 20, price: 9 },
            storage_100: { size: 100, price: 39 },
            storage_500: { size: 500, price: 199 },
        }

        const option = STORAGE_OPTIONS[addonId]
        if (!option) return fail(c, 'Invalid storage addon.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.hetznerServerId) return fail(c, 'Instance not found or not provisioned.', 404)
        if (instance.status !== 'running') return fail(c, 'Instance must be running.', 400)

        // Record payment
        await db.insert(payments).values({
            id: randomBytes(5).toString('hex'),
            instanceId,
            allpayOrderId: `storage-${instanceId}-${Date.now()}`,
            amountIls: String(option.price),
            status: 'paid',
            paidAt: new Date(),
        })

        const provider = getProvider('hetzner')

        // Create Hetzner volume (automount + ext4 formatted)
        const volume = await provider.createVolume(
            `vol-${instanceId}-${Date.now()}`,
            option.size,
            process.env.HETZNER_DATACENTER || 'hel1',
            Number(instance.hetznerServerId)
        )

        // Symlink volume mount to openclaw extra-storage dir
        if (instance.ip) {
            try {
                const { Client } = await import('ssh2')
                const { readFileSync } = await import('fs')
                const sshKey = readFileSync(process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master')
                await new Promise<void>((resolve, reject) => {
                    const conn = new Client()
                    conn.on('ready', () => {
                        conn.exec(
                            `MOUNT=$(lsblk -o MOUNTPOINT -n /dev/disk/by-id/scsi-0HC_Volume_${volume.id} 2>/dev/null | head -1) && ` +
                            `if [ -n "$MOUNT" ]; then ` +
                            `  mkdir -p /home/openclaw/.openclaw/extra-storage && ` +
                            `  ln -sf "$MOUNT" /home/openclaw/.openclaw/extra-storage/vol-${volume.id} && ` +
                            `  chown -R openclaw:openclaw /home/openclaw/.openclaw/extra-storage; ` +
                            `fi`,
                            (err) => { conn.end(); if (err) reject(err); else resolve() }
                        )
                    }).on('error', reject)
                    const opts: Record<string, unknown> = { host: instance.ip, port: 22, username: 'root', privateKey: sshKey }
                    if (instance.rootPassword) opts.password = instance.rootPassword
                    conn.connect(opts)
                })
            } catch (e) {
                console.error('Volume symlink failed (non-critical):', e)
            }
        }

        // Update storage in DB
        const currentStorage = instance.storageGb || 0
        await db.update(instances).set({
            storageGb: currentStorage + option.size,
        }).where(eq(instances.id, instanceId))

        await telegram.alertAdmin(`💾 Storage added: ${instanceId} +${option.size}GB (₪${option.price}/mo, volume: ${volume.id})`)

        return ok(c, {
            volumeId: volume.id,
            sizeGb: option.size,
            priceIls: option.price,
            totalStorageGb: currentStorage + option.size,
        }, `${option.size}GB אחסון נוסף נוסף בהצלחה!`)
    } catch (err) {
        console.error('addStorage error:', err)
        return fail(c, 'Failed to add storage.', 500)
    }
}

export const deleteInstance = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) {
            return fail(c, 'Instance not found.', 404)
        }

        // Cancel AllPay recurring payment
        if (instance.allpayOrderId) {
            try {
                const allpay = (await import('@/services/allpay')).default
                await allpay.cancelSubscription(instance.allpayOrderId)
            } catch (e) {
                console.error(`Failed to cancel AllPay for ${instanceId}:`, e)
            }
        }

        // Delete Hetzner volumes
        if (instance.hetznerServerId) {
            try {
                const provider = getProvider('hetzner')
                const volumes = await provider.getVolumes?.(Number(instance.hetznerServerId))
                if (volumes && Array.isArray(volumes)) {
                    for (const vol of volumes) {
                        try { await provider.deleteVolume(vol.id) } catch {}
                    }
                }
            } catch {}
        }

        if (instance.hetznerServerId) {
            await provisioner.terminate(instanceId, instance.hetznerServerId, instance.subdomainAgent || undefined, instance.subdomainFlows || undefined)
        }

        await db.update(instances)
            .set({ status: 'terminated', subscriptionStatus: 'cancelled' })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Instance terminated.')
    } catch (err) {
        console.error('Delete instance error:', err)
        return fail(c, 'Failed to terminate instance.', 500)
    }
}

// DELETE /hosting/account — delete user account + all instances + volumes + subscriptions
export const deleteAccount = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)

        const { users, payments: paymentsTable, instanceAddons, agentOutputs } = await import('@/db/schema')
        const allpay = (await import('@/services/allpay')).default

        // Get all user instances
        const userInstances = await db.select()
            .from(instances)
            .where(eq(instances.userId, userId))

        const provider = getProvider('hetzner')

        for (const inst of userInstances) {
            // 1. Cancel AllPay recurring payment
            if (inst.allpayOrderId) {
                try {
                    await allpay.cancelSubscription(inst.allpayOrderId)
                    console.log(`[deleteAccount] AllPay cancelled: ${inst.id}`)
                } catch (e) {
                    console.error(`[deleteAccount] AllPay cancel failed for ${inst.id}:`, e)
                }
            }

            // 2. Delete Hetzner volumes attached to this server
            if (inst.hetznerServerId) {
                try {
                    const volumes = await provider.getVolumes?.(Number(inst.hetznerServerId))
                    if (volumes && Array.isArray(volumes)) {
                        for (const vol of volumes) {
                            try { await provider.deleteVolume(vol.id) } catch {}
                        }
                    }
                } catch (e) {
                    console.error(`[deleteAccount] Volume cleanup failed for ${inst.id}:`, e)
                }
            }

            // 3. Terminate Hetzner VPS + DNS
            if (inst.hetznerServerId && inst.status !== 'terminated') {
                try {
                    await provisioner.terminate(inst.id, inst.hetznerServerId, inst.subdomainAgent || undefined, inst.subdomainFlows || undefined)
                    console.log(`[deleteAccount] VPS terminated: ${inst.id}`)
                } catch (e) {
                    console.error(`[deleteAccount] VPS terminate failed for ${inst.id}:`, e)
                }
            }

            // 4. Delete DB child records (explicit, don't rely on cascade)
            try { await db.delete(agentOutputs).where(eq(agentOutputs.instanceId, inst.id)) } catch {}
            try { await db.delete(paymentsTable).where(eq(paymentsTable.instanceId, inst.id)) } catch {}
            try { await db.delete(instanceAddons).where(eq(instanceAddons.instanceId, inst.id)) } catch {}

            // 5. Delete instance record
            await db.delete(instances).where(eq(instances.id, inst.id))
            console.log(`[deleteAccount] Instance deleted from DB: ${inst.id}`)
        }

        // 6. Delete user record
        await db.delete(users).where(eq(users.id, userId))
        console.log(`[deleteAccount] User deleted: ${userId}`)

        await telegram.alertAdmin(`🗑️ Account fully deleted: ${userId} (${userInstances.length} instances, VPS+volumes+subscriptions cleaned)`)

        return ok(c, null, 'Account deleted.')
    } catch (err) {
        console.error('deleteAccount error:', err)
        return fail(c, 'Failed to delete account.', 500)
    }
}