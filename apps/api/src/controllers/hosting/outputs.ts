import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { eq, and, or, ne, desc, inArray, isNull, sql } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { randomBytes } from 'crypto'
import { createCampaign, type CampaignPlan, type GoogleTokens } from '@/services/googleAds'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'
import { ensureDisplayHeOnRow } from '@/services/userDisplayHe'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

// Operator/dev-only output types — internal telemetry that must NOT clutter the
// client kabinet (the user has no action to take on them). Filtered out of the
// user-facing outputs list. `audit_findings` = the self-QA that checks whether
// OUR deterministic claims about the tenant's pages were false positives.
const OPERATOR_ONLY_OUTPUT_TYPES = ['audit_findings']

function sshExecForPublish(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve) => {
        const conn = new Client()
        let output = ''
        const timeout = setTimeout(() => { conn.end(); resolve('') }, 330000)  // 5.5 min for agent commands
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timeout); conn.end(); return resolve('') }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timeout); conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', () => { clearTimeout(timeout); resolve('') })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch { }
        conn.connect(opts)
    })
}

// ── Helper: ensure chat_id is set for Telegram publishing ──
async function ensureTelegramChatId(instance: any): Promise<string | null> {
    if (instance.telegramChatId) return instance.telegramChatId

    // Try to detect chat_id from bot's recent messages
    if (!instance.telegramBotToken) return null

    try {
        // Temporarily remove webhook to use getUpdates
        await fetch(`https://api.telegram.org/bot${instance.telegramBotToken}/deleteWebhook`)
        await new Promise(r => setTimeout(r, 500))

        const res = await fetch(`https://api.telegram.org/bot${instance.telegramBotToken}/getUpdates?limit=5`)
        const data = await res.json() as { ok?: boolean; result?: Array<{ message?: { chat?: { id?: number } } }> }

        if (data.ok && data.result) {
            for (const update of data.result.reverse()) {
                if (update.message?.chat?.id) {
                    const chatId = String(update.message.chat.id)

                    // Save to DB for future use
                    await db.update(instances)
                        .set({ telegramChatId: chatId })
                        .where(eq(instances.id, instance.id))

                    console.log(`Auto-saved Telegram chat_id ${chatId} for instance ${instance.id}`)
                    return chatId
                }
            }
        }
    } catch (e) {
        console.error('ensureTelegramChatId error:', e)
    }

    return null
}

const generateId = () => randomBytes(6).toString('hex')

// ── GET /hosting/instances/:id/outputs ──
// Returns all agent outputs for an instance, with optional status filter
export const getOutputs = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const status = c.req.query('status') // optional: 'pending_review', 'approved', 'published', 'rejected'
        const limit = parseInt(c.req.query('limit') || '50')

        const excludeArchived = c.req.query('exclude_archived') === '1'

        const agentFilter = c.req.query('agent') // 'oc', 'mt', 'bare'
        // Phase 4.3-P fix: include 'mazhir' — the role that generates
        // monthly_task, monthly_marketing_plan, conversion_mapping_proposal,
        // and other MATEH-orchestrator outputs. Was missing → those rows
        // got hidden from משימות פעילות whenever the agentFilter was 'mt'.
        const MATEH_ROLES = ['mateh', 'mazhir', 'sayer', 'meater', 'maazin', 'menateach', 'et', 'yotzer', 'shaliach', 'migdalor']

        const conditions = [eq(agentOutputs.instanceId, instanceId)]
        if (status) {
            conditions.push(eq(agentOutputs.status, status))
        } else if (excludeArchived) {
            conditions.push(ne(agentOutputs.status, 'archived'))
        }
        // Hide operator-only telemetry (e.g. audit_findings) from the client kabinet.
        for (const t of OPERATOR_ONLY_OUTPUT_TYPES) {
            conditions.push(ne(agentOutputs.outputType, t))
        }
        // Filter by agent type
        if (agentFilter === 'mt') {
            conditions.push(inArray(agentOutputs.agentRole, MATEH_ROLES))
        } else if (agentFilter === 'oc' || agentFilter === 'bare') {
            // Personal/Bare: exclude MATEH roles
            for (const role of MATEH_ROLES) {
                conditions.push(ne(agentOutputs.agentRole, role))
            }
        }

        // Phase 2.3.C — per-agent isolation. Filter outputs by the active
        // mateh_agent so secondaries on the same VPS don't see the primary's
        // queue (and vice versa). Phase 4.3-P fix: legacy rows pre-dating the
        // backfill have agent_id=NULL — they historically belong to the VPS
        // primary, so include them when the active agent IS the primary. A
        // secondary agent never sees NULL-agent rows.
        const __agent = await resolveActiveAgent(c, instanceId)
        if (__agent) {
            if (__agent.isPrimary) {
                conditions.push(
                    or(
                        eq(agentOutputs.agentId, __agent.id),
                        isNull(agentOutputs.agentId),
                    ) as never,
                )
            } else {
                conditions.push(eq(agentOutputs.agentId, __agent.id))
            }
        }

        const results = await db.select()
            .from(agentOutputs)
            .where(and(...conditions))
            .orderBy(desc(agentOutputs.createdAt))
            .limit(limit)

        // Attach the execution WAVE to monthly_task rows — systemic, read-time,
        // derived from the capability classifier + the plan's dependency graph
        // (so every tenant gets waves with no per-tenant work). The cabinet groups
        // by wave instead of P0/P1/P2; priority becomes the in-wave sub-sort.
        let enriched: unknown[] = results
        try {
            if (__agent && results.some(r => r.outputType === 'monthly_task')) {
                const { readResearchData } = await import('@/services/agentContext')
                const rd = (await readResearchData(__agent as never, instanceId)) as any || {}
                const planTasks: any[] = rd?.monthlyPlan?.tasks || []
                if (planTasks.length) {
                    const { assignWaves, WAVE_LABELS_HE } = await import('@/services/executorCapabilities')
                    const waveMap = assignWaves(planTasks)
                    enriched = results.map(r => {
                        if (r.outputType !== 'monthly_task') return r
                        const tid = (r.metadata as any)?.taskId
                        const w = tid != null ? waveMap.get(tid) : undefined
                        return w == null ? r : { ...r, wave: w, waveLabel: WAVE_LABELS_HE[w] }
                    })
                }
            }
        } catch (err) {
            console.warn('[getOutputs] wave enrichment skipped:', (err as Error).message)
        }

        // Systemic Hebrew display: backfill a clean Hebrew displayHe for any output
        // whose content is a structured object without one — so the kabinet never
        // renders raw English keys/enums/jargon. No-op for plain-text content and
        // content that already carries displayHe.
        enriched = enriched.map(r => ensureDisplayHeOnRow(r as { content?: unknown }))

        return ok(c, enriched)
    } catch (err) {
        console.error('getOutputs error:', err)
        return fail(c, 'Failed to fetch outputs', 500)
    }
}

// ── GET /hosting/instances/:id/outputs/:outputId ──
// Returns a single output with full content
export const getOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const [output] = await db.select()
            .from(agentOutputs)
            .where(eq(agentOutputs.id, outputId))

        if (!output) return fail(c, 'Output not found', 404)
        return ok(c, ensureDisplayHeOnRow(output as { content?: unknown }))
    } catch (err) {
        console.error('getOutput error:', err)
        return fail(c, 'Failed to fetch output', 500)
    }
}

// ── POST /hosting/instances/:id/outputs/ingest ──
// Receives agent output from VPS sync or webhook
export const ingestOutput = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{
            agentRole: string
            outputType: string
            title: string
            content?: string
            mediaUrl?: string
            mediaType?: string
            mediaMeta?: Record<string, unknown>
            platform?: string
            scheduledFor?: string
            metadata?: Record<string, unknown>
        }>()

        if (!body.agentRole || !body.outputType || !body.title) {
            return fail(c, 'Missing required fields: agentRole, outputType, title', 400)
        }

        const id = generateId()
        // Phase 2.3.C — tag output with active mateh_agent so it lands
        // only in that agent's queue.
        const __ingestAgent = await resolveActiveAgent(c, instanceId)
        await db.insert(agentOutputs).values({
            id,
            instanceId,
            agentId: __ingestAgent?.id || null,
            agentRole: body.agentRole,
            outputType: body.outputType,
            title: body.title,
            content: body.content || null,
            mediaUrl: body.mediaUrl || null,
            mediaType: body.mediaType || null,
            mediaMeta: body.mediaMeta || null,
            platform: body.platform || null,
            scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
            metadata: body.metadata || null,
            status: 'pending_review',
        })

        console.log(`Agent output ingested: ${id} (${body.agentRole}/${body.outputType}) for ${instanceId}`)

        // Fire-and-forget Telegram notification with inline approve/reject
        // buttons. User can act from either surface — webhook keeps both in sync.
        import('@/services/approvalQueueTelegram').then(m =>
            m.sendApprovalQueueMessage(id)
        ).catch(err => console.warn('[ingestOutput] TG notify failed (non-fatal):', (err as Error).message))

        return ok(c, { id, status: 'pending_review' }, 'Output ingested')
    } catch (err) {
        console.error('ingestOutput error:', err)
        return fail(c, 'Failed to ingest output', 500)
    }
}

// ── GET /hosting/instances/:id/wp/companion-plugin.zip ──
// Phase 2026.02 Block 6 Pattern J: streams the Flowmatic companion plugin
// .zip so the user can install via WP Admin → Plugins → Add New →
// Upload Plugin. WordPress REST POST /wp/v2/plugins requires a
// WordPress.org `slug` — there's no standard REST endpoint for custom
// plugin uploads, so this hybrid path is unavoidable. ~30 sec one-time
// manual step per tenant.

// ── GET /hosting/instances/:id/gtm/fresh-stack/preflight ──
// Edit 2: pre-flight readiness probe. Called when wizard opens so the
// step-1 UI shows the user EXACTLY what's ready and what's missing
// BEFORE they invest effort entering Account ID. Returns:
//   googleConnected     — Google OAuth refresh token present
//   ga4Accessible       — can list GA4 properties (catches scope-mismatch
//                          even when Google connected)
//   adsConnected        — Google Ads operatingCustomerId + developer token saved
//   wpConnected         — WordPress integration row + appPassword saved
//   wpPluginInstalled   — companion plugin v1.x active on the site
//   wpPluginVersion     — actual version if installed (so we can show "upgrade
//                          needed" when v1.0 is installed but v1.2 is current)
//   wooCommerceActive   — Pattern K3 ecommerce hooks fire only with WC
//   tenantState         — 'greenfield' | 'migration' | 'has_target' —
//                          drives wizard copy variant
//   gtmTargetExists     — true if mazhirGtm.target was set in a prior run
//                          (re-run idempotently rather than creating duplicate)
//   detectedSiteDomain  — best guess from research_data.answers.websiteUrl
//                          or instances.domain
//   detectedBrandName   — for default container-name placeholder
export const gtmFreshStackPreflight = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const agentIdParam = c.req.query('agentId')

        const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig } =
            await import('@/services/agentContext')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found for this instance', 404)

        const tokens = (agent as any).googleTokens || {}
        const googleConnected = !!tokens.refreshToken
        // Hoisted: used by both Meta Pixel domain matching + WP integration
        // matching. Declared once here, used multiple times below.
        const rd: any = (agent as any).researchData || {}

        // GA4 accessibility: only probe if Google connected. Single accountSummaries
        // GET — cheap (<500ms) and surfaces 401/403 immediately so user knows
        // re-OAuth needed before touching the wizard.
        let ga4Accessible = false
        let ga4PropertiesCount = 0
        let ga4Error: string | undefined
        if (googleConnected) {
            try {
                const { listGa4Properties } = await import('@/services/ga4Admin')
                const props = await listGa4Properties({
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt,
                })
                ga4Accessible = true
                ga4PropertiesCount = props.length
            } catch (e) {
                ga4Error = (e as Error).message.slice(0, 200)
            }
        }

        // Google Ads
        let adsConnected = false
        try {
            const adsCfgRes = await readGoogleAdsConfig(agent, instanceId).catch(() => ({ config: null }))
            const adsCfg: any = (adsCfgRes as any).config
            adsConnected = !!(adsCfg?.customerId && adsCfg?.developerToken)
        } catch { /* leave false */ }

        // Meta + Pixel discovery (K6)
        let metaConnected = false
        let metaPixelId: string | undefined
        let metaPixelName: string | undefined
        let metaError: string | undefined
        try {
            const metaTokens = (agent as any).metaTokens
            if (metaTokens?.accessToken && metaTokens?.adAccountId) {
                metaConnected = true
                const { findMetaPixelForAccount } = await import('@/services/mazhirGtmSetup')
                const detectedDomain = String((agent as any).researchData?.answers?.websiteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
                const found = await findMetaPixelForAccount(metaTokens, detectedDomain)
                metaPixelId = found.pixelId
                metaPixelName = found.pixelName
                if (!found.pixelId) metaError = found.diagnostic.error || `0 pixels on ad account ${found.diagnostic.adAccountId}`
            }
        } catch (e) { metaError = (e as Error).message.slice(0, 200) }

        // WordPress integration — match by agent_id first (proper per-agent
        // isolation), then fall back to siteDomain match. Without this, a
        // packing-station agent on a VPS that also hosts a storage-station
        // agent would pick the FIRST wp row (storage-station) by created_at
        // order, probe its plugin, and falsely report "plugin not installed".
        let wpConnected = false
        let wpUrl: string | undefined
        let wpPluginInstalled = false
        let wpPluginVersion: string | undefined
        let wooCommerceActive = false
        let wooCommerceVersion: string | null = null
        try {
            const { agentIntegrations } = await import('@/db/schema')
            const wpRows = await db.select().from(agentIntegrations).where(
                and(
                    eq(agentIntegrations.instanceId, instanceId),
                    eq(agentIntegrations.integrationType, 'wordpress'),
                ),
            )
            // 1. Match by agent.id (preferred)
            let wp = wpRows.find(r => r.agentId === agent.id)
            // 2. Fall back to siteDomain url-contains match
            if (!wp) {
                const target = (rd?.answers?.websiteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
                if (target) {
                    wp = wpRows.find(r => {
                        const url = String((r.config as any)?.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
                        return url && (url.includes(target) || target.includes(url))
                    })
                }
            }
            // 3. Last resort — first row (legacy single-agent VPS)
            if (!wp) wp = wpRows[0]

            if (wp && (wp.config as any)?.url && (wp.config as any)?.appPassword) {
                wpConnected = true
                wpUrl = String((wp.config as any).url)
                try {
                    const { probeWpCapabilities } = await import('@/services/wpCompanionInstaller')
                    const caps = await probeWpCapabilities(wp.config as { url: string; user: string; appPassword: string })
                    if (caps) {
                        wpPluginInstalled = true
                        wpPluginVersion = caps.pluginVersion
                        wooCommerceActive = !!caps.wooCommerceActive
                        wooCommerceVersion = caps.wooCommerceVersion
                    }
                } catch { /* plugin not installed yet */ }
            }
        } catch { /* leave false */ }

        // Tenant state: greenfield = no prior GTM target, migration = has target
        // pointing at a non-self-owned container (heuristic: account name doesn't
        // match brand). For now: has_target if mazhirGtm.target.publicId is set.
        // (rd already hoisted at top of try block.)
        const gtmTargetExists = !!(rd.mazhirGtm?.target?.publicId)
        const tenantState: 'greenfield' | 'migration' | 'has_target' = gtmTargetExists
            ? 'has_target'
            : 'greenfield'

        // Detected domain + brand for wizard default values
        const detectedSiteDomain = String(
            rd?.answers?.websiteUrl ||
            rd?.results?.brand_book?.summary?.domain ||
            ''
        ).replace(/^https?:\/\//, '').replace(/\/$/, '')
        const detectedBrandName = String(
            rd?.answers?.businessName ||
            (agent as any).name ||
            ''
        )

        return ok(c, {
            googleConnected,
            ga4Accessible,
            ga4PropertiesCount,
            ga4Error,
            adsConnected,
            metaConnected,
            metaPixelId,
            metaPixelName,
            metaError,
            wpConnected,
            wpUrl,
            wpPluginInstalled,
            wpPluginVersion,
            wooCommerceActive,
            wooCommerceVersion,
            tenantState,
            gtmTargetExists,
            existingTarget: gtmTargetExists ? rd.mazhirGtm.target : null,
            detectedSiteDomain,
            detectedBrandName,
            // Overall readiness summary: true only if BLOCKERS resolved (Google + GA4).
            // WP-not-connected is recoverable (manual snippet paste); WC-not-active
            // is fine for non-shop sites. So they're informational, not blockers.
            ready: googleConnected && ga4Accessible,
            blockers: [
                ...(googleConnected ? [] : [{ id: 'google', message: 'Google לא מחובר. חברו Google Account (scope: ads + analytics + gtm)' }]),
                ...(ga4Accessible ? [] : [{ id: 'ga4', message: ga4Error ? `GA4 access denied: ${ga4Error}` : 'GA4 לא נגיש — re-OAuth Google עם scope analytics' }]),
            ],
        }, 'Pre-flight readiness')
    } catch (err) {
        return fail(c, 'Pre-flight failed: ' + (err as Error).message, 500)
    }
}
export const wpCompanionPluginZip = async (c: Context<HonoEnv>) => {
    try {
        const { buildCompanionPluginZip } = await import('@/services/wpCompanionInstaller')
        const buf = await buildCompanionPluginZip()
        c.header('Content-Type', 'application/zip')
        c.header('Content-Disposition', 'attachment; filename="clawflow-companion.zip"')
        c.header('Content-Length', String(buf.length))
        return c.body(new Uint8Array(buf))
    } catch (err) {
        console.error('wpCompanionPluginZip error:', err)
        return fail(c, 'Failed to build plugin zip: ' + (err as Error).message, 500)
    }
}

// ── POST /hosting/instances/:id/gtm/fresh-stack ──
// Phase 2026.02 Block 6 Pattern I: create a brand-new GTM Account +
// Container under the user's OWN Google account. Used for:
//   (a) Migration from a shared agency GTM Account (clean separation)
//   (b) Bootstrap for new tenants with no GTM infrastructure
//
// On success:
//   1. Saves target to mateh_agents.research_data.mazhirGtm.target
//      (replacing any prior agency-owned target)
//   2. Returns { accountId, containerId, publicId (GTM-XXX), snippets }
//      for the caller to surface to the user
//   3. Caller should re-run autoSetupGtmContainer afterward to populate
//      the new (empty) container with the standard fixtures.
export const gtmFreshStack = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const userId = c.get('userId')
        const body = await c.req.json<{ accountName?: string; existingAccountId?: string; containerName?: string; siteDomain?: string; taskId?: string }>().catch(() => ({} as any))
        const accountName = (body as any).accountName || undefined
        const existingAccountId = (body as any).existingAccountId || undefined
        const containerName = (body as any).containerName || 'Web Container'
        const siteDomain = (body as any).siteDomain || undefined
        const taskOutputId = ((body as any).taskId || '').trim() || undefined
        if (!accountName && !existingAccountId) {
            return fail(c, 'Either accountName (attempt API create) or existingAccountId (use existing) required', 400)
        }

        const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } =
            await import('@/services/agentContext')
        const agentIdParam = c.req.query('agentId')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found for this instance', 404)

        const tokens = (agent as any).googleTokens
        if (!tokens?.refreshToken) {
            return fail(c, 'No Google OAuth tokens for this agent — reconnect Google in Integrations first', 400)
        }

        const { createFreshGtmStack, saveGtmTarget, autoSetupGtmContainer, saveGtmSetupResult, buildGtmHeadSnippet, buildGtmBodySnippet, detectSiteCmp } =
            await import('@/services/mazhirGtmSetup')
        // CMP-aware consent: if the site runs a CMP (Cookiebot/OneTrust/…) it OWNS
        // Google Consent Mode — skip our consent tags to avoid double-management.
        const cmpDetected = await detectSiteCmp(siteDomain).catch(() => false)

        const chainSteps: Array<{ step: string; ok: boolean; detail?: string }> = []

        // ── 1. Create container in existing/new account ──
        const stack = await createFreshGtmStack({
            googleTokens: tokens,
            accountName,
            existingAccountId,
            containerName,
            siteDomain,
        })
        chainSteps.push({
            step: 'GTM Container created',
            ok: true,
            detail: `Account: ${stack.account.name} (${stack.account.accountId}); Container: ${stack.container.name} (${stack.container.publicId})`,
        })

        // Save target → research_data.mazhirGtm.target (replaces prior target).
        await saveGtmTarget(instanceId, stack.target, agent.id || null)

        // Record creation event for audit history.
        await mutateResearchData(agent, instanceId, (rd: any) => {
            rd.mazhirGtm = {
                ...(rd.mazhirGtm || {}),
                freshStackHistory: [...((rd.mazhirGtm?.freshStackHistory) || []), {
                    createdAt: new Date().toISOString(),
                    createdBy: userId,
                    accountId: stack.account.accountId,
                    accountName: stack.account.name,
                    containerId: stack.container.containerId,
                    publicId: stack.container.publicId,
                    siteDomain,
                }],
            }
            return rd
        })

        // ── 2a. Auto-detect GA4 measurementId (Pattern K1) ──
        // Hands-off: if the tenant has a GA4 property on the same domain,
        // we discover its measurementId and feed it to autoSetupGtmContainer
        // so the GA4 base tag + per-conversion gaawe event tags get created
        // automatically (instead of asking the user to type G-XXXXXXXXXX).
        let autoMeasurementId: string | undefined = stack.target.measurementId
        try {
            if (!autoMeasurementId) {
                const { findGa4MeasurementId } = await import('@/services/ga4Admin')
                const found = await findGa4MeasurementId(tokens, siteDomain)
                if (found.measurementId) {
                    autoMeasurementId = found.measurementId
                    stack.target.measurementId = found.measurementId
                    await saveGtmTarget(instanceId, stack.target, agent.id || null)
                    chainSteps.push({
                        step: 'GA4 measurementId auto-detected',
                        ok: true,
                        detail: `${found.measurementId} from property ${found.propertyId} (${found.matched} match: ${found.streamUri || 'no URI'})`,
                    })
                } else {
                    const d = found.diagnostic
                    let reason = ''
                    if (d.accessibilityErrors.length > 0 && d.propertiesFound === 0) {
                        const e0 = d.accessibilityErrors[0]
                        reason = `OAuth user has no GA4 access (accountSummaries: ${e0.error.slice(0, 150)}). Re-OAuth Google with analytics scope using an account that admins the GA4 property.`
                    } else if (d.propertiesFound === 0) {
                        reason = `OAuth user (hello@flowmatic.co.il) has 0 GA4 properties. Either no GA4 created yet (analytics.google.com → admin → create property), OR a different Google account owns the property (re-OAuth with that account).`
                    } else if (d.webStreamsFound === 0) {
                        reason = `${d.propertiesFound} GA4 propert${d.propertiesFound === 1 ? 'y' : 'ies'} visible (${d.propertiesAttempted.join(', ')}) but NONE have a web data stream. Create one: GA4 Admin → Data Streams → Add stream → Web → enter site URL.`
                    } else if (d.webStreamsWithMeasurementId === 0) {
                        reason = `${d.webStreamsFound} web streams found but none have a measurementId (very unusual). Check GA4 Admin → Data Streams → Web → Measurement ID field.`
                    } else {
                        reason = `${d.webStreamsWithMeasurementId} web streams exist but none match site domain "${siteDomain || '(not provided)'}". Saved fallback would have been ${d.webStreamsWithMeasurementId > 0 ? 'available' : 'none'}.`
                    }
                    chainSteps.push({
                        step: 'GA4 measurementId auto-detect',
                        ok: false,
                        detail: reason,
                    })
                }
            } else {
                chainSteps.push({ step: 'GA4 measurementId (cached)', ok: true, detail: autoMeasurementId })
            }
        } catch (e) {
            chainSteps.push({ step: 'GA4 measurementId auto-detect failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }

        // ── 2b. Auto-derive Google Ads awct configs (Pattern K2) ──
        // Read currently-active conversion actions from the tenant's Ads
        // account and map them to GtmConversionConfig[]. Skips actions without
        // tag_snippets (UPLOAD-only) since awct requires a conversionLabel.
        let gtmConversions: any[] = []
        try {
            const rd = (agent as any).researchData || {}
            // Prefer manually-curated configs if a previous run produced them
            // (these include sendValue/defaultValueIls finely tuned). Otherwise
            // pull live from Ads.
            const curatedConfigs = rd.mazhirConversions?.gtmConfigs as any[] | undefined
            if (Array.isArray(curatedConfigs) && curatedConfigs.length > 0) {
                gtmConversions = curatedConfigs
                chainSteps.push({
                    step: `Google Ads conversions (curated)`,
                    ok: true,
                    detail: `${curatedConfigs.length} actions from prior mapping: ${curatedConfigs.map((c: any) => c.actionKey).join(', ')}`,
                })
            } else {
                const { readGoogleAdsConfig } = await import('@/services/agentContext')
                const adsCfgRes = await readGoogleAdsConfig(agent, instanceId).catch(() => ({ config: null }))
                const adsCfg: any = (adsCfgRes as any).config
                if (adsCfg?.customerId && adsCfg?.developerToken) {
                    const operatingCustomerId = String(adsCfg.scope?.operatingCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                    const loginCustomerId = String(adsCfg.loginCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                    const { deriveGtmConversionsFromAds } = await import('@/services/mazhirConversionsDetect')
                    const auto = await deriveGtmConversionsFromAds({
                        operatingCustomerId,
                        loginCustomerId,
                        tokens: { refreshToken: tokens.refreshToken },
                        developerToken: String(adsCfg.developerToken),
                        agentId: (agent as any).id,
                        vpsInstanceId: instanceId,
                    })
                    gtmConversions = auto.configs
                    chainSteps.push({
                        step: 'Google Ads conversions auto-derived',
                        ok: auto.configs.length > 0,
                        detail: auto.configs.length > 0
                            ? `${auto.configs.length} awct configs: ${auto.configs.map(c => `${c.actionKey} (AW-${c.googleAdsConversionId}/${c.googleAdsConversionLabel.slice(0, 6)}…)`).join(', ')}${auto.skipped.length ? ` · skipped ${auto.skipped.length}` : ''}`
                            : `No eligible conversion actions found (skipped ${auto.skipped.length}: ${auto.skipped.slice(0, 3).map(s => `${s.name}=${s.reason}`).join('; ')})`,
                    })
                } else {
                    chainSteps.push({
                        step: 'Google Ads not connected — skipping awct wiring',
                        ok: false,
                        detail: 'Connect Google Ads in Integrations to auto-wire conversion tags. Container will still get Conversion Linker + GCLID + GA4 base + Consent Mode.',
                    })
                }
            }
        } catch (e) {
            chainSteps.push({ step: 'Google Ads conversion auto-derive failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }

        // ── 2b-meta. Auto-detect Meta Pixel (K6) ──
        // Same pattern as GA4 measurementId + Ads awct: if Meta is connected
        // with adAccountId, list pixels via Graph API, pick the best match
        // by site domain, and build a MetaPixelConfig (Purchase + Lead by
        // default + AddToCart + InitiateCheckout when WooCommerce active).
        let metaPixelConfig: any = null
        let metaPixelDiagnostic = ''
        try {
            const metaTokens = (agent as any).metaTokens
            if (metaTokens?.accessToken && metaTokens?.adAccountId) {
                const { findMetaPixelForAccount, buildMetaPixelConfig } = await import('@/services/mazhirGtmSetup')
                const found = await findMetaPixelForAccount(metaTokens, siteDomain)
                if (found.pixelId) {
                    // Detect WooCommerce via WP capabilities probe (already done above)
                    let wooActive = false
                    try {
                        const { db } = await import('@/db')
                        const { agentIntegrations } = await import('@/db/schema')
                        const { and, eq } = await import('drizzle-orm')
                        const wpRows = await db.select().from(agentIntegrations).where(
                            and(
                                eq(agentIntegrations.instanceId, instanceId),
                                eq(agentIntegrations.integrationType, 'wordpress'),
                            ),
                        )
                        // Per-agent isolation: prefer the WP row owned by this agent.
                        const wpRow = wpRows.find(r => r.agentId === agent.id)
                            || wpRows.find(r => {
                                const url = String((r.config as any)?.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
                                const target = String(siteDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
                                return target && url && url.includes(target)
                            })
                            || wpRows[0]
                        if (wpRow) {
                            const { probeWpCapabilities } = await import('@/services/wpCompanionInstaller')
                            const caps = await probeWpCapabilities(wpRow.config as any)
                            wooActive = !!caps?.wooCommerceActive
                        }
                    } catch { /* leave wooActive false */ }
                    metaPixelConfig = buildMetaPixelConfig({
                        pixelId: found.pixelId,
                        activeActionKeys: gtmConversions.map((c: any) => c.actionKey),
                        wooCommerceActive: wooActive,
                    })
                    chainSteps.push({
                        step: 'Meta Pixel auto-detected',
                        ok: true,
                        detail: `Pixel ${found.pixelId} (${found.pixelName || 'unnamed'}) — ${found.matched} match. Events to wire: ${metaPixelConfig.events.join(', ')}`,
                    })
                } else {
                    metaPixelDiagnostic = found.diagnostic.error
                        ? `Meta Pixel discovery failed: ${found.diagnostic.error}`
                        : `Meta connected but 0 pixels on ad account ${found.diagnostic.adAccountId}. Create one: business.facebook.com → Events Manager → Connect Data Sources → Web.`
                    chainSteps.push({ step: 'Meta Pixel auto-detect', ok: false, detail: metaPixelDiagnostic })
                }
            } else {
                chainSteps.push({
                    step: 'Meta Pixel — Meta not connected',
                    ok: true,
                    detail: 'SKIPPED — connect Meta in Integrations to auto-wire Pixel base + per-event tags',
                })
            }
        } catch (e) {
            chainSteps.push({ step: 'Meta Pixel auto-detect failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }

        // ── 2c. Populate fixtures via autoSetupGtmContainer ──
        // Existing fixtures: Conversion Linker, GCLID Capture, Consent Mode v2,
        // GA4 base + per-conversion gaawe (if measurementId), awct per
        // Google Ads conversion (if any), Enhanced Conversions vars,
        // Meta Pixel base + per-event Custom HTML (if Meta connected).
        let gtmResultGlobal: any = null
        try {
            const gtmResult = await autoSetupGtmContainer(tokens, {
                target: stack.target,
                measurementId: autoMeasurementId,
                conversions: gtmConversions,
                enhancedConversions: true,
                metaPixel: metaPixelConfig || undefined,
                cmpDetected,
            })
            gtmResultGlobal = gtmResult
            await saveGtmSetupResult(instanceId, gtmResult, agent.id || null)
            // Decompose published fixtures into per-layer chainSteps so the UI
            // can show "GA4 base ✓ / awct[purchase] ✓ / Consent Mode ✓" per
            // Pattern K5 — explicit per-component status, not a single blob.
            const byType = (prefix: string) => gtmResult.created.filter((c: any) => c.type === prefix).map((c: any) => c.name)
            const ga4Base = byType('tag:googtag')
            const ga4Events = byType('tag:gaawe')
            const awctTags = byType('tag:awct')
            const linkerTags = byType('tag:gclidw')
            const consentTags = [...byType('tag:consent_default'), ...byType('tag:consent_update')]
            chainSteps.push({ step: 'Conversion Linker (gclidw)', ok: linkerTags.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:gclidw'), detail: linkerTags.length > 0 ? linkerTags.join('; ') : 'already present (reused)' })
            // GA4 layers only meaningful when measurementId is available. If we
            // never got one, mark these as ok=true (not applicable) so they don't
            // pollute the failure count — the real signal is in the upstream
            // "GA4 measurementId auto-detect" step which already failed loudly.
            if (autoMeasurementId) {
                chainSteps.push({ step: `GA4 base tag (googtag) for ${autoMeasurementId}`, ok: ga4Base.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:googtag'), detail: ga4Base.length > 0 ? ga4Base.join('; ') : 'already present (reused)' })
                chainSteps.push({ step: `GA4 event tags (gaawe)`, ok: ga4Events.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:gaawe') || gtmConversions.length === 0, detail: ga4Events.length > 0 ? `${ga4Events.length} created: ${ga4Events.join('; ')}` : (gtmConversions.length > 0 ? 'already present (reused)' : 'no conversions to map') })
            } else {
                chainSteps.push({ step: 'GA4 tags (googtag + gaawe)', ok: true, detail: 'SKIPPED — no measurementId detected. Fix the upstream GA4 step and re-run.' })
            }
            chainSteps.push({ step: `Google Ads awct tags`, ok: awctTags.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:awct') || gtmConversions.length === 0, detail: awctTags.length > 0 ? `${awctTags.length} created: ${awctTags.join('; ')}` : (gtmConversions.length > 0 ? 'already present (reused)' : 'no conversions to map') })
            // Meta Pixel layers — only meaningful when metaPixelConfig is present
            if (metaPixelConfig) {
                const metaBase = byType('tag:meta_pixel_base')
                const metaEvents = byType('tag:meta_pixel_event')
                chainSteps.push({ step: `Meta Pixel base (fbq init ${metaPixelConfig.pixelId})`, ok: metaBase.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:meta_pixel_base'), detail: metaBase.length > 0 ? metaBase.join('; ') : 'already present (reused)' })
                chainSteps.push({ step: `Meta Pixel events (${metaPixelConfig.events.join(', ')})`, ok: metaEvents.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:meta_pixel_event') || metaPixelConfig.events.length === 0, detail: metaEvents.length > 0 ? `${metaEvents.length} created: ${metaEvents.join('; ')}` : 'already present (reused)' })
            }
            chainSteps.push({ step: 'Consent Mode v2 (default+update)', ok: consentTags.length > 0 || gtmResult.skipped.some((s: any) => s.type === 'tag:consent_default' || s.type === 'tag:consent_update'), detail: consentTags.length > 0 ? consentTags.join('; ') : 'already present (reused)' })
            chainSteps.push({
                step: 'Container version published',
                ok: gtmResult.published,
                detail: gtmResult.published
                    ? `Created ${gtmResult.created.length}, skipped ${gtmResult.skipped.length}, version=${gtmResult.versionId || '(no-op: ' + (gtmResult.noopReason || 'already-in-state') + ')'}`
                    : `errors: ${gtmResult.errors.map((e: any) => e.error).join('; ')}`,
            })
        } catch (e) {
            chainSteps.push({
                step: 'Fixtures publish failed',
                ok: false,
                detail: (e as Error).message.slice(0, 400),
            })
        }

        // ── 2d. Live validation against published version (Pattern K4) ──
        // Read /versions:live and confirm the fixtures we wanted are actually
        // present on production. Different from #2c which reports what THIS
        // run did — validation here is independent: "is the live state correct
        // right now?" (catches scenarios where prior workspace had stale refs
        // → publish silently failed → autoSetupGtmContainer reported ok).
        try {
            const { validateGtmFixtures } = await import('@/services/mazhirGtmSetup')
            const validation = await validateGtmFixtures(tokens, stack.target, {
                expectConversionLinker: true,
                expectGclidCapture: true,
                expectGaawe: !!autoMeasurementId,
                expectEnhancedConversions: true,
                expectConsentMode: true,
                expectAwct: gtmConversions.map((c: any) => `Mazhir GAds Conv — ${c.actionKey}`),
                expectMetaPixel: metaPixelConfig ? { pixelId: metaPixelConfig.pixelId, events: metaPixelConfig.events } : undefined,
            })
            for (const fx of validation.fixtures) {
                chainSteps.push({
                    step: `Live validation: ${fx.label}`,
                    ok: fx.present,
                    detail: fx.present ? `found: "${fx.foundName || '(unnamed)'}"${fx.notes ? ` · ${fx.notes}` : ''}` : `MISSING in live container (version=${validation.workspaceId || 'n/a'}, tags=${validation.tagCount}, vars=${validation.variableCount})`,
                })
            }
        } catch (e) {
            chainSteps.push({ step: 'Live validation failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }
        void gtmResultGlobal

        // ── 2e. Post-setup systemic provisioning (parity with autoSetupMazhirGtm) ──
        // After the fresh GTM is published, fire the same hands-off systemic steps
        // a normal GTM-setup would: cross-brand goal isolation (critical on shared
        // MCC accounts), server-side purchase capture (GA4 MP secret + companion),
        // and the offline store→Ads conversion bridge (gclid). Fire-and-forget so
        // they never block/break the fresh-stack response.
        if (gtmResultGlobal && gtmResultGlobal.published) {
            const agentForProv = agent
            import('@/services/campaignGoalIsolation')
                .then(({ ensureCampaignGoalIsolation }) => ensureCampaignGoalIsolation(agentForProv, { source: 'gtm_fresh_stack' }))
                .then(d => console.log(`[goalIsolation] fresh_stack ${agentForProv.id}: ${d.status} (${d.reason})`))
                .catch(err => console.error('[goalIsolation] fresh_stack error:', (err as Error).message))
            import('@/services/serverSideTracking')
                .then(({ ensureServerSideTracking }) => ensureServerSideTracking(agentForProv, { source: 'gtm_fresh_stack' }))
                .then(d => console.log(`[serverSideTracking] fresh_stack ${agentForProv.id}: ${d.status} (${d.reason})`))
                .catch(err => console.error('[serverSideTracking] fresh_stack error:', (err as Error).message))
            import('@/services/offlineConversionUpload')
                .then(({ ensureOfflineAction }) => ensureOfflineAction(agentForProv))
                .then(d => console.log(`[offlineConversionUpload] fresh_stack ${agentForProv.id}: ${d.status} (${d.reason})`))
                .catch(err => console.error('[offlineConversionUpload] fresh_stack error:', (err as Error).message))
        }

        // ── 3. WP companion plugin install + snippet inject + stale GTM scan ──
        // Phase 2026.02 Block 6 Pattern J. Three sub-steps with full
        // hands-off goal (handle the WP integration end-to-end):
        //   3a. Install Flowmatic companion plugin via WP REST /wp/v2/plugins
        //       (multipart .zip upload; only needs Application Password)
        //   3b. POST our GTM snippet to /wp-json/clawflow/v1/gtm-snippet
        //   3c. Scan site for stale GTM- snippets (foreign IDs) — surface
        //       to user so they can remove the OLD agency container snippet
        //       BEFORE going live with the new one
        let wpInstalled = false
        let staleScan: any = null
        let conflictAnalysis: any = null     // populated by Phase 1 tracking-audit probe
        let adsSafety: any = null            // populated by D — Google Ads safety audit
        let ga4Health: any = null            // populated by E — GA4 health audit
        try {
            const { db } = await import('@/db')
            const { agentIntegrations } = await import('@/db/schema')
            const { and, eq } = await import('drizzle-orm')
            const wpRows = await db.select().from(agentIntegrations).where(
                and(
                    eq(agentIntegrations.instanceId, instanceId),
                    eq(agentIntegrations.integrationType, 'wordpress'),
                ),
            )
            // Match priority: agent.id → siteDomain url-contains → first row.
            // Per-agent isolation matters when VPS hosts multiple tenants.
            const wp = wpRows.find(r => r.agentId === agent.id)
                || wpRows.find(r => {
                    const cfg = (r.config as any) || {}
                    const url = String(cfg.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
                    const target = String(siteDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
                    return target && url && url.includes(target)
                })
                || wpRows[0]

            if (!wp || !(wp.config as any)?.url || !(wp.config as any)?.appPassword) {
                chainSteps.push({ step: 'WordPress not connected', ok: false, detail: 'No matching WP integration — paste snippet manually' })
            } else {
                const cfg = wp.config as { url: string; user: string; appPassword: string }
                const { installCompanionPlugin, installGtmSnippet, scanStaleGtmSnippets } = await import('@/services/wpCompanionInstaller')

                // 3a. Install + activate companion plugin
                const pluginRes = await installCompanionPlugin(cfg)
                chainSteps.push({
                    step: 'WP Flowmatic companion plugin',
                    ok: pluginRes.installed && pluginRes.activated,
                    detail: pluginRes.installed && pluginRes.activated
                        ? `${pluginRes.method} · ${pluginRes.notes.join('; ').slice(0, 300)}`
                        : `failed: ${pluginRes.error || pluginRes.notes.join('; ')}`,
                })

                if (pluginRes.installed && pluginRes.activated) {
                    // Phase 2026.02 Block 6 Pattern K3: probe site capabilities
                    // (WooCommerce active? plugin version?) so the UI can show
                    // "WooCommerce v8.5 detected — ecommerce dataLayer hooks
                    // active" or warn if site is non-WC (no purchase events).
                    try {
                        const { probeWpCapabilities } = await import('@/services/wpCompanionInstaller')
                        const caps = await probeWpCapabilities(cfg)
                        if (caps) {
                            chainSteps.push({
                                step: 'WP capabilities probe',
                                ok: true,
                                detail: `Plugin v${caps.pluginVersion} on WP ${caps.wordpressVersion}; ${caps.wooCommerceActive ? `WooCommerce v${caps.wooCommerceVersion || '?'} ACTIVE → purchase/add_to_cart/begin_checkout dataLayer events auto-pushed` : 'WooCommerce NOT detected — ecommerce events will not fire (lead/form_submit events still work)'}`,
                            })
                        } else {
                            chainSteps.push({ step: 'WP capabilities probe', ok: false, detail: 'plugin /capabilities endpoint not reachable (legacy plugin version?)' })
                        }
                    } catch (e) {
                        chainSteps.push({ step: 'WP capabilities probe failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
                    }

                    // Phase 2026.02 Block 6 Pattern L: auto-cleanup OLD GTM
                    // snippets BEFORE installing the new one. Critical per
                    // Sergei: 'сначала удалить старый код, потом добавить новый'.
                    //
                    // 3-pre. Scan first to know what's stale.
                    let preScan: any = null
                    try {
                        const { scanStaleGtmSnippets, removeStaleGtmOptions } = await import('@/services/wpCompanionInstaller')
                        preScan = await scanStaleGtmSnippets(cfg)
                        if (preScan && preScan.foreignCount > 0) {
                            // Split findings: wp_options (safe auto-remove) vs theme_file (manual)
                            const safeKeys: string[] = []
                            const themeFindings: any[] = []
                            for (const f of (preScan.findings || [])) {
                                if (f.source === 'wp_options' && f.key) safeKeys.push(f.key)
                                else themeFindings.push(f)
                            }
                            let removedCount = 0
                            if (safeKeys.length > 0) {
                                try {
                                    const removeRes = await removeStaleGtmOptions(cfg, safeKeys)
                                    removedCount = (removeRes.removed || []).length
                                    chainSteps.push({
                                        step: 'Stale GTM auto-cleanup (wp_options)',
                                        ok: removedCount === safeKeys.length,
                                        detail: `Removed ${removedCount}/${safeKeys.length} foreign wp_options entries with old GTM-XXX: ${safeKeys.join(', ').slice(0, 300)}`,
                                    })
                                } catch (e) {
                                    chainSteps.push({
                                        step: 'Stale GTM auto-cleanup failed (non-fatal)',
                                        ok: false,
                                        detail: (e as Error).message.slice(0, 300),
                                    })
                                }
                            }
                            if (themeFindings.length > 0) {
                                chainSteps.push({
                                    step: 'Stale GTM — theme files require MANUAL cleanup (risky to auto-edit)',
                                    ok: false,
                                    detail: themeFindings.map((f: any) =>
                                        `${f.key}: ${(f.gtmIds || []).join(', ')} (${f.excerpt})`
                                    ).join('\n').slice(0, 600),
                                })
                            }
                        } else {
                            chainSteps.push({
                                step: 'Pre-install stale scan — no foreign GTM snippets',
                                ok: true,
                                detail: 'wp_options + theme files clean — new snippet has no conflicts',
                            })
                        }
                    } catch (e) {
                        chainSteps.push({ step: 'Pre-install stale scan failed', ok: false, detail: (e as Error).message.slice(0, 200) })
                    }

                    // 3b. POST snippet to companion plugin endpoint (AFTER cleanup)
                    const snipRes = await installGtmSnippet(
                        cfg,
                        stack.container.publicId,
                        buildGtmHeadSnippet(stack.container.publicId),
                        buildGtmBodySnippet(stack.container.publicId),
                    )
                    if (snipRes.ok) {
                        wpInstalled = true
                        chainSteps.push({
                            step: 'WP GTM snippet installed via companion plugin',
                            ok: true,
                            detail: `publicId=${snipRes.publicId} · auto-injected to <head> + <body> on every page`,
                        })
                    } else {
                        chainSteps.push({
                            step: 'WP snippet POST failed (plugin installed but endpoint errored)',
                            ok: false,
                            detail: snipRes.error || 'unknown',
                        })
                    }

                    // 3c. Post-install verification — fetch site HTML and confirm
                    // NEW GTM ID present + OLD ones gone (Pattern L verification).
                    if (wpInstalled && siteDomain) {
                        try {
                            const { scanSiteHtmlForGtm } = await import('@/services/wpCompanionInstaller')
                            const liveScan = await scanSiteHtmlForGtm(`https://${siteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`)
                            const hasNew = liveScan.gtmIds.includes(stack.container.publicId)
                            const oldFound = liveScan.gtmIds.filter(id => id !== stack.container.publicId)
                            // Pinpoint OLD GTM loader locations from context excerpts —
                            // helps user find where it's loaded from (theme inline,
                            // third-party plugin, CDN worker, etc.) since our auto-
                            // cleanup only handles wp_options + theme header.php.
                            const oldContexts = liveScan.contexts.filter(c => oldFound.includes(c.gtmId))
                            const oldHints = oldContexts.map(c => `${c.gtmId} [${c.hint}]: …${c.excerpt}…`).join(' | ').slice(0, 500)
                            chainSteps.push({
                                step: 'Live HTML verification (post-install)',
                                ok: hasNew && oldFound.length === 0,
                                detail: hasNew
                                    ? (oldFound.length === 0
                                        ? `✓ NEW ${stack.container.publicId} found on live site; no foreign GTM-XXX remaining.`
                                        : `⚠ NEW ${stack.container.publicId} present but OLD also present: ${oldFound.join(', ')}. Context: ${oldHints}`)
                                    : `✗ NEW ${stack.container.publicId} NOT yet visible on live HTML. Found OLD: ${liveScan.gtmIds.join(', ') || 'none'}. Context: ${oldHints || '(no excerpts)'}`,
                            })
                            staleScan = { ourPublicId: stack.container.publicId, foreignCount: oldFound.length, findings: oldFound }
                        } catch (e) {
                            chainSteps.push({ step: 'Live HTML scan failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
                        }
                    }

                    // ── 3d. Tracking Conflict Audit (K8) ──
                    // Probe companion plugin /tracking-audit endpoint to detect
                    // OTHER active WP tracking plugins (PixelYourSite, Google
                    // for WooCommerce, MonsterInsights, Site Kit, GTM4WP, etc.)
                    // and classify conflicts vs our GTM (AW-/G-/fbq) tags.
                    // Surfaces the conv_value_pollution pattern (double-counting)
                    // that the paid_audit identified as fix_tracking_first
                    // verdict for Packing Station — and prevents it for all
                    // future tenants.
                    try {
                        const { probeTrackingAudit, scanSiteHtmlForTrackingIds } = await import('@/services/wpCompanionInstaller')
                        const audit = await probeTrackingAudit(cfg)
                        // HTML-level scan catches direct gtag/fbq loads from
                        // plugins our PHP audit slug-detection missed.
                        const siteScan = siteDomain
                            ? await scanSiteHtmlForTrackingIds(`https://${siteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`)
                            : undefined
                        if (audit) {
                            const { analyzeTrackingConflicts } = await import('@/services/trackingConflicts')
                            const analysis = analyzeTrackingConflicts(audit, {
                                gtmPublicId: stack.container.publicId,
                                googleAdsConversionId: gtmConversions[0]?.googleAdsConversionId,
                                ga4MeasurementId: autoMeasurementId,
                                metaPixelId: metaPixelConfig?.pixelId,
                            }, siteScan)

                            // K9: if any conflict has fallbackAction for
                            // 'google-listings-and-ads', probe the Ads account
                            // for Shopping/PMax/Merchant Center usage so the
                            // wizard can answer "is it safe to deactivate?"
                            // DETERMINISTICALLY instead of asking the user.
                            const hasGlaFallback = analysis.conflicts.some((c: any) =>
                                c.fallbackAction?.plugin === 'google-listings-and-ads'
                            )
                            if (hasGlaFallback) {
                                try {
                                    const { readGoogleAdsConfig } = await import('@/services/agentContext')
                                    const adsCfgRes = await readGoogleAdsConfig(agent, instanceId).catch(() => ({ config: null }))
                                    const adsCfg: any = (adsCfgRes as any).config
                                    if (adsCfg?.customerId && adsCfg?.developerToken) {
                                        const { probeShoppingUsage } = await import('@/services/googleAdsShoppingProbe')
                                        const operatingCustomerId = String(adsCfg.scope?.operatingCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                                        const loginCustomerId = String(adsCfg.loginCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                                        const shopping = await probeShoppingUsage({
                                            operatingCustomerId,
                                            loginCustomerId,
                                            tokens: { refreshToken: tokens.refreshToken },
                                            developerToken: String(adsCfg.developerToken),
                                        })
                                        // Decorate the conflict with the probe result
                                        for (const c of analysis.conflicts as any[]) {
                                            if (c.fallbackAction?.plugin === 'google-listings-and-ads') {
                                                if (shopping.safeToDeactivateGoogleForWoo) {
                                                    c.fallbackAction.warning = '✓ ' + shopping.summary + ' (auto-verified via Google Ads API) — deactivation is safe.'
                                                } else if (shopping.diagnostic) {
                                                    c.fallbackAction.warning = '? ' + shopping.summary
                                                } else {
                                                    c.fallbackAction.warning = '🛑 ' + shopping.summary
                                                    // If active Shopping/PMax found, REMOVE the deactivate action
                                                    // and keep only surgical-with-instructions message.
                                                    if (shopping.hasShoppingCampaigns || shopping.hasPmaxCampaigns) {
                                                        delete c.fallbackAction
                                                    }
                                                }
                                            }
                                        }
                                        ;(analysis as any).shoppingProbe = shopping
                                    } else {
                                        ;(analysis as any).shoppingProbe = { summary: 'Google Ads not connected — cannot auto-verify shopping usage', safeToDeactivateGoogleForWoo: false }
                                    }
                                } catch (e) {
                                    console.warn(`[gtmFreshStack] shopping probe failed (non-fatal): ${(e as Error).message.slice(0, 200)}`)
                                }
                            }
                            conflictAnalysis = analysis
                            // Headline chainStep — overall conflict state
                            chainSteps.push({
                                step: `Tracking conflicts: ${analysis.summary}`,
                                ok: analysis.cleanState,
                                detail: analysis.conflicts.length === 0
                                    ? `0 conflicts. Scanned ${audit.detected.length} active tracking plugins.`
                                    : analysis.conflicts.map(c => `[${c.severity.toUpperCase()}] ${c.summary}`).join(' | '),
                            })
                            // Per-conflict chainSteps so UI grouping picks them
                            // up into a dedicated "⚠ Conflicts" category.
                            for (const c of analysis.conflicts) {
                                const sigil = c.severity === 'critical' ? '🔴' : c.severity === 'high' ? '🟠' : c.severity === 'medium' ? '🟡' : 'ℹ'
                                chainSteps.push({
                                    step: `Conflict [${c.severity}] ${sigil} ${c.platform}: ${c.summary}`,
                                    // info-only conflicts don't fail the chain
                                    ok: c.severity === 'info' || c.severity === 'medium',
                                    detail: `${c.detail}${c.autoFixable ? ` · AUTO-FIXABLE via /disable-plugin-feature plugin=${c.autoFixAction?.plugin} feature=${c.autoFixAction?.feature}` : ''}`,
                                })
                            }
                        } else {
                            chainSteps.push({
                                step: 'Tracking conflict audit',
                                ok: true,
                                detail: 'SKIPPED — companion plugin v1.3+ required for tracking-audit endpoint',
                            })
                        }
                    } catch (e) {
                        chainSteps.push({ step: 'Tracking conflict audit failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
                    }
                }
            }
        } catch (e) {
            chainSteps.push({ step: 'WordPress install error', ok: false, detail: (e as Error).message.slice(0, 300) })
        }

        // ── 4. Google Ads Safety Audit (K12 / Variant D) ──
        // Detects Smart Bidding on polluted signal, high change velocity, missing
        // account-level negatives. Surfaces with auto-fix actions when possible.
        try {
            const { readGoogleAdsConfig } = await import('@/services/agentContext')
            const adsCfgRes = await readGoogleAdsConfig(agent, instanceId).catch(() => ({ config: null }))
            const adsCfg: any = (adsCfgRes as any).config
            if (adsCfg?.customerId && adsCfg?.developerToken) {
                const operatingCustomerId = String(adsCfg.scope?.operatingCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                const loginCustomerId = String(adsCfg.loginCustomerId || adsCfg.customerId || '').replace(/\D/g, '')
                // Pull conv_value_quality_subscore from paid_audit if present
                let convValueQualitySubscore: number | undefined
                try {
                    const paidAuditContent = (agent as any).researchData?.results?.paid_audit?.content
                    if (typeof paidAuditContent === 'string') {
                        const m = /conv_value_quality_subscore[^\d]*(\d+)/i.exec(paidAuditContent)
                        if (m) convValueQualitySubscore = parseInt(m[1], 10)
                    }
                } catch { /* skip */ }
                const { auditGoogleAdsSafety } = await import('@/services/googleAdsSafetyAudit')
                // K12-fix: pass scope.campaignIds so MCC sub-account with
                // multiple brands doesn't leak Storage/Moving Station campaigns
                // into Packing Station's audit + auto-fix actions.
                const scopedCampaignIds: string[] = Array.isArray(adsCfg.scope?.campaignIds)
                    ? adsCfg.scope.campaignIds.map(String)
                    : []
                adsSafety = await auditGoogleAdsSafety({
                    operatingCustomerId,
                    loginCustomerId,
                    developerToken: String(adsCfg.developerToken),
                    tokens: { refreshToken: tokens.refreshToken },
                    convValueQualitySubscore,
                    scopedCampaignIds,
                })
                chainSteps.push({
                    step: `Google Ads safety: ${adsSafety.summary}`,
                    ok: adsSafety.cleanState,
                    detail: `Scanned ${adsSafety.rawSnapshot.campaignCount} enabled campaigns. Smart Bidding: ${adsSafety.rawSnapshot.smartBiddingCount} · Manual: ${adsSafety.rawSnapshot.manualBiddingCount} · Changes/7d: ${adsSafety.rawSnapshot.changeEventsLast7d} · Negative lists: ${adsSafety.rawSnapshot.negativeListsAttached}`,
                })
                for (const f of adsSafety.findings) {
                    const sigil = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : 'ℹ'
                    chainSteps.push({
                        step: `Ads safety [${f.severity}] ${sigil}: ${f.summary}`,
                        ok: f.severity === 'info' || f.severity === 'medium',
                        detail: `${f.detail}${f.autoFixable ? ` · AUTO-FIXABLE` : ''}`,
                    })
                }
            } else {
                chainSteps.push({ step: 'Google Ads safety audit — SKIPPED', ok: true, detail: 'Google Ads not connected — connect in Integrations to enable safety audit' })
            }
        } catch (e) {
            chainSteps.push({ step: 'Google Ads safety audit failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }

        // ── 5. GA4 Health Audit (K12 / Variant E) ──
        // Data Retention, Enhanced Measurement, Key Events, BigQuery link,
        // Google Ads link. Auto-fix for Retention + Enhanced Measurement.
        try {
            if (autoMeasurementId && tokens.refreshToken) {
                const { auditGa4Health } = await import('@/services/ga4HealthAudit')
                // K12-fix: pass measurementId so audit locks to the property
                // our GTM is actually wired to (no fuzzy displayName matches
                // landing on a sibling-brand property).
                ga4Health = await auditGa4Health({
                    tokens: { refreshToken: tokens.refreshToken },
                    siteDomain,
                    measurementId: autoMeasurementId,
                })
                chainSteps.push({
                    step: `GA4 health: ${ga4Health.summary}`,
                    ok: ga4Health.cleanState,
                    detail: `Property: ${ga4Health.rawSnapshot.propertyId || 'n/a'} · Retention: ${ga4Health.rawSnapshot.dataRetention || 'unknown'} · Enhanced Measurement: ${ga4Health.rawSnapshot.enhancedMeasurementEnabled ? 'ON' : 'OFF'} · Key Events: ${ga4Health.rawSnapshot.keyEventCount || 0} · BigQuery: ${ga4Health.rawSnapshot.bigQueryLinkCount || 0} · Ads Links: ${ga4Health.rawSnapshot.googleAdsLinkCount || 0}`,
                })
                for (const f of ga4Health.findings) {
                    const sigil = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : 'ℹ'
                    chainSteps.push({
                        step: `GA4 health [${f.severity}] ${sigil}: ${f.summary}`,
                        ok: f.severity === 'info' || f.severity === 'medium',
                        detail: `${f.detail}${f.autoFixable ? ` · AUTO-FIXABLE` : ''}`,
                    })
                }
            } else {
                chainSteps.push({ step: 'GA4 health audit — SKIPPED', ok: true, detail: 'GA4 measurementId not detected — fix upstream GA4 step first' })
            }
        } catch (e) {
            chainSteps.push({ step: 'GA4 health audit failed (non-fatal)', ok: false, detail: (e as Error).message.slice(0, 200) })
        }

        // Server-side log of ALL chainSteps (✓ + ✗) so journalctl shows the
        // full pipeline state without depending on UI screenshots or the
        // user remembering exact wording.
        const failCount = chainSteps.filter(s => !s.ok).length
        console.log(`[gtmFreshStack] instance=${instanceId} agent=${agent.id} steps=${chainSteps.length} ok=${chainSteps.length - failCount} fail=${failCount}`)
        for (const s of chainSteps) {
            const sigil = s.ok ? '✓' : '✗'
            console.log(`[gtmFreshStack]   ${sigil} ${s.step}: ${(s.detail || '').slice(0, 400)}`)
        }

        // Edit 1: auto-complete monthly_task on full success. If 0 failures AND
        // wpInstalled AND a taskId was provided, promote the matching agent_output
        // (status pending_review|awaiting_manual) to completed and mirror to
        // research_data.monthlyPlan.tasks[idx]. Drops the manual "✓ סיימתי" click —
        // task auto-disappears from the queue once GTM is verifiably live.
        let autoCompleted = false
        if (taskOutputId && failCount === 0 && wpInstalled) {
            try {
                // First check if the task already exists + its current status.
                // If it's already completed, we still report autoCompleted=true
                // (idempotent — re-runs on already-closed tasks are valid; UI
                // should hide the "✓ סיימתי" button to avoid a 404 click).
                const [existingTask] = await db.select().from(agentOutputs)
                    .where(and(
                        eq(agentOutputs.id, taskOutputId),
                        eq(agentOutputs.instanceId, instanceId),
                    ))
                if (existingTask && (existingTask.status === 'completed' || existingTask.status === 'published')) {
                    autoCompleted = true
                    console.log(`[gtmFreshStack] task ${taskOutputId} already ${existingTask.status} — reporting autoCompleted (no state change needed)`)
                    return ok(c, {
                        account: stack.account,
                        container: stack.container,
                        target: stack.target,
                        snippets: {
                            head: buildGtmHeadSnippet(stack.container.publicId),
                            body: buildGtmBodySnippet(stack.container.publicId),
                        },
                        chainSteps,
                        wpInstalled,
                        autoCompleted: true,
                        instructions: `✓ Done! Stack refreshed — task already marked completed previously.`,
                    }, 'Fresh GTM stack created + fixtures populated')
                }
                const [updated] = await db.update(agentOutputs)
                    .set({ status: 'completed', publishedAt: new Date(), updatedAt: new Date() })
                    .where(and(
                        eq(agentOutputs.id, taskOutputId),
                        eq(agentOutputs.instanceId, instanceId),
                        sql`status IN ('pending_review','awaiting_manual')`,
                    ))
                    .returning()
                if (updated) {
                    autoCompleted = true
                    const meta = updated.metadata as Record<string, unknown> | null
                    const planTaskId = meta?.taskId as string | undefined
                    if (planTaskId) {
                        await mutateResearchData(agent, instanceId, (rd: any) => {
                            const plan = rd?.monthlyPlan
                            if (!plan || !Array.isArray(plan.tasks)) return rd
                            const idx = plan.tasks.findIndex((t: any) => t.id === planTaskId)
                            if (idx === -1) return rd
                            plan.tasks[idx].status = 'completed'
                            plan.tasks[idx].completedAt = new Date().toISOString()
                            ;(plan.tasks[idx] as any).completedMethod = 'gtm_wizard_auto'
                            ;(plan.tasks[idx] as any).completedBy = userId
                            return rd
                        })
                    }
                    console.log(`[gtmFreshStack] auto-completed task ${taskOutputId} (planTaskId=${planTaskId || 'n/a'})`)
                }
            } catch (err) {
                console.warn(`[gtmFreshStack] auto-complete failed (non-fatal): ${(err as Error).message}`)
            }
        }

        return ok(c, {
            account: stack.account,
            container: stack.container,
            target: stack.target,
            snippets: {
                head: buildGtmHeadSnippet(stack.container.publicId),
                body: buildGtmBodySnippet(stack.container.publicId),
            },
            chainSteps,
            wpInstalled,
            autoCompleted,
            conflictAnalysis,
            adsSafety,
            ga4Health,
            instructions: wpInstalled
                ? `✓ Done! New GTM snippet auto-installed on ${siteDomain}. Verify by visiting the site and opening GTM Preview mode.`
                : `Site snippet update required: copy the head + body snippets below into your site's <head> and <body> tags. Container ID: ${stack.container.publicId}.`,
        }, 'Fresh GTM stack created + fixtures populated')
    } catch (err) {
        console.error('gtmFreshStack error:', err)
        return fail(c, 'Fresh GTM stack creation failed: ' + (err as Error).message, 500)
    }
}

// ── POST /hosting/instances/:id/gtm/resolve-conflict ──
// Phase 2026.02 Block 6 K8 — resolve a detected tracking conflict by
// disabling the conflicting plugin's feature surgically (keeps the
// plugin active for unrelated features the user may still want).
//
// Body: { plugin: string, feature: 'google_ads' | 'ga4' | 'meta_pixel' | 'all' | 'deactivate_plugin' }
//
// Looks up the WP integration (per-agent isolation), proxies the call
// to companion plugin /disable-plugin-feature endpoint, returns the
// list of wp_options changes.
export const gtmResolveConflict = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ plugin?: string; feature?: string; orphanedKeys?: string[] }>().catch(() => ({}))
        const plugin = String((body as any).plugin || '').trim()
        const feature = String((body as any).feature || '').trim() as 'google_ads' | 'ga4' | 'meta_pixel' | 'all' | 'deactivate_plugin' | 'delete_orphaned_options'
        const orphanedKeys = Array.isArray((body as any).orphanedKeys) ? (body as any).orphanedKeys.map(String) : []
        if (!plugin || !feature) return fail(c, 'plugin + feature required', 400)
        if (!['google_ads','ga4','meta_pixel','all','deactivate_plugin','delete_orphaned_options'].includes(feature)) {
            return fail(c, 'invalid feature value', 400)
        }

        const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
        const agentIdParam = c.req.query('agentId')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found for this instance', 404)

        const { agentIntegrations } = await import('@/db/schema')
        const wpRows = await db.select().from(agentIntegrations).where(
            and(
                eq(agentIntegrations.instanceId, instanceId),
                eq(agentIntegrations.integrationType, 'wordpress'),
            ),
        )
        const wp = wpRows.find(r => r.agentId === agent.id) || wpRows[0]
        if (!wp || !(wp.config as any)?.appPassword) {
            return fail(c, 'WordPress not connected for this agent', 400)
        }

        const { disablePluginTrackingFeature, probeTrackingAudit } = await import('@/services/wpCompanionInstaller')
        const cfg = wp.config as { url: string; user: string; appPassword: string }

        // K11: delete-orphaned-options branch (orphan wp_options leftover
        // from uninstalled tracking plugins). Goes through different endpoint.
        let result: { ok: boolean; changes: string[] }
        if (feature === 'delete_orphaned_options') {
            if (orphanedKeys.length === 0) return fail(c, 'orphanedKeys required for delete_orphaned_options', 400)
            const { deleteOrphanedWpOptions } = await import('@/services/wpCompanionInstaller')
            const del = await deleteOrphanedWpOptions(cfg, orphanedKeys)
            result = { ok: del.ok, changes: del.deleted.map(k => `deleted wp_option: ${k}`).concat(del.rejected.map(k => `rejected: ${k}`)) }
        } else {
            result = await disablePluginTrackingFeature(cfg, plugin, feature as 'google_ads' | 'ga4' | 'meta_pixel' | 'all' | 'deactivate_plugin')
        }

        // Log every change so journalctl shows what really happened (no need
        // for blind trust on "0 changes" mysteries).
        console.log(`[resolveConflict] instance=${instanceId} plugin=${plugin} feature=${feature} changesCount=${result.changes.length}`)
        for (const ch of result.changes) console.log(`[resolveConflict]   · ${ch}`)

        // Re-run tracking audit to confirm the conflict is gone
        const reAudit = await probeTrackingAudit(cfg).catch(() => null)

        // K10 fix: tell UI explicitly when the action had no effect, so it
        // can show a clearer error than "0 changes" without context.
        const actuallyDidSomething = result.changes.some(c =>
            !/not found|no plugins matched|active plugins:/i.test(c)
        )

        return ok(c, {
            disabledPlugin: plugin,
            disabledFeature: feature,
            changes: result.changes,
            actuallyDidSomething,
            postFixAudit: reAudit,
        }, 'Conflict resolution applied')
    } catch (err) {
        return fail(c, 'Conflict resolution failed: ' + (err as Error).message, 500)
    }
}

// ── POST /hosting/instances/:id/safety/apply-fix ──
// Phase 2026.02 Block 6 K12 — apply a D (Google Ads) or E (GA4) auto-fix
// surfaced by the safety audit. Body: { kind, payload }.
//
// Supported kinds:
//   switch_to_manual_cpc          payload: { campaignIds: string[] }
//   create_negatives_list         payload: { keywords: string[] }
//   set_data_retention_14_months  payload: { propertyId: string }
//   enable_enhanced_measurement_all  payload: { propertyId, streamId }
export const applySafetyFix = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ kind?: string; payload?: any }>().catch(() => ({}))
        const kind = String((body as any).kind || '').trim()
        const payload = (body as any).payload || {}
        if (!kind) return fail(c, 'kind required', 400)

        const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig } = await import('@/services/agentContext')
        const agentIdParam = c.req.query('agentId')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found', 404)
        const tokens = (agent as any).googleTokens
        if (!tokens?.refreshToken) return fail(c, 'No Google OAuth tokens', 400)

        let result: any = null
        if (kind === 'switch_to_manual_cpc') {
            const ads = (await readGoogleAdsConfig(agent, instanceId)).config as any
            if (!ads?.customerId || !ads?.developerToken) return fail(c, 'Google Ads not connected', 400)
            const operatingCustomerId = String(ads.scope?.operatingCustomerId || ads.customerId || '').replace(/\D/g, '')
            const loginCustomerId = String(ads.loginCustomerId || ads.customerId || '').replace(/\D/g, '')
            const { switchCampaignsToManualCpc } = await import('@/services/googleAdsSafetyAudit')
            result = await switchCampaignsToManualCpc({
                customerId: operatingCustomerId,
                loginCustomerId,
                tokens: { refreshToken: tokens.refreshToken },
                developerToken: String(ads.developerToken),
                campaignIds: payload.campaignIds || [],
            })
        } else if (kind === 'pause_campaigns') {
            const ads = (await readGoogleAdsConfig(agent, instanceId)).config as any
            if (!ads?.customerId || !ads?.developerToken) return fail(c, 'Google Ads not connected', 400)
            const operatingCustomerId = String(ads.scope?.operatingCustomerId || ads.customerId || '').replace(/\D/g, '')
            const loginCustomerId = String(ads.loginCustomerId || ads.customerId || '').replace(/\D/g, '')
            const { pauseCampaigns } = await import('@/services/googleAdsSafetyAudit')
            result = await pauseCampaigns({
                customerId: operatingCustomerId,
                loginCustomerId,
                tokens: { refreshToken: tokens.refreshToken },
                developerToken: String(ads.developerToken),
                campaignIds: payload.campaignIds || [],
            })
        } else if (kind === 'create_negatives_list') {
            const ads = (await readGoogleAdsConfig(agent, instanceId)).config as any
            if (!ads?.customerId || !ads?.developerToken) return fail(c, 'Google Ads not connected', 400)
            const operatingCustomerId = String(ads.scope?.operatingCustomerId || ads.customerId || '').replace(/\D/g, '')
            const loginCustomerId = String(ads.loginCustomerId || ads.customerId || '').replace(/\D/g, '')
            const { createAndAttachNegativesList } = await import('@/services/googleAdsSafetyAudit')
            // K12-fix: only attach to tenant-scoped campaigns
            const scopedCampaignIds: string[] = Array.isArray(ads.scope?.campaignIds)
                ? ads.scope.campaignIds.map(String)
                : []
            result = await createAndAttachNegativesList({
                customerId: operatingCustomerId,
                loginCustomerId,
                tokens: { refreshToken: tokens.refreshToken },
                developerToken: String(ads.developerToken),
                keywords: payload.keywords || [],
                scopedCampaignIds,
            })
        } else if (kind === 'set_data_retention_14_months') {
            const { setDataRetention14Months } = await import('@/services/ga4HealthAudit')
            await setDataRetention14Months({ refreshToken: tokens.refreshToken }, String(payload.propertyId || ''))
            result = { ok: true, propertyId: payload.propertyId, set: 'MONTHS_14' }
        } else if (kind === 'enable_enhanced_measurement_all') {
            const { enableEnhancedMeasurementAll } = await import('@/services/ga4HealthAudit')
            await enableEnhancedMeasurementAll({ refreshToken: tokens.refreshToken }, String(payload.propertyId || ''), String(payload.streamId || ''))
            result = { ok: true, propertyId: payload.propertyId, streamId: payload.streamId }
        } else if (kind === 'gsc_refresh_page') {
            // GSC finding: page(s) not indexed (thin / crawled-not-indexed). Fix =
            // refresh the page content (builder-aware, non-destructive). Accepts a
            // single url or a urls[] list (aggregated finding).
            const list: string[] = Array.isArray(payload.urls) ? payload.urls.map(String)
                : payload.url ? [String(payload.url)] : []
            if (!list.length) return fail(c, 'url or urls[] required for gsc_refresh_page', 400)
            const slugs = list.slice(0, 20).map(u => decodeURIComponent(u.split(/[?#]/)[0].replace(/\/$/, '').split('/').pop() || u))
            const { runPageRefresh } = await import('@/services/seoPageRefresh')
            result = await runPageRefresh(instanceId, { agentId: agent.id, namedPages: slugs })
        } else if (kind === 'gsc_regen_schema') {
            // GSC finding: invalid rich-results / schema. Fix = regenerate the
            // page's structured data (additive, idempotent — companion renders it).
            const { runSeoSchemaBatch } = await import('@/services/seoSchemaBatch')
            result = await runSeoSchemaBatch(instanceId, { agentId: agent.id })
        } else {
            return fail(c, `Unknown fix kind: ${kind}`, 400)
        }

        console.log(`[applySafetyFix] instance=${instanceId} kind=${kind} result=${JSON.stringify(result).slice(0, 500)}`)

        // K12-fix2: detect partial / total failure inside result so UI doesn't
        // falsely flip to "Applied". For Google Ads switch: if errors.length>0
        // AND switched.length===0 → total failure. For negatives: errors.length>0
        // OR campaignsAttached===0 → degraded.
        let partialFailure = false
        let totalFailure = false
        if (kind === 'switch_to_manual_cpc') {
            const switched = (result?.switched || []).length
            const errs = (result?.errors || []).length
            if (switched === 0 && errs > 0) totalFailure = true
            else if (switched > 0 && errs > 0) partialFailure = true
        } else if (kind === 'create_negatives_list') {
            const attached = result?.campaignsAttached || 0
            const errs = (result?.errors || []).length
            if (errs > 0 && attached === 0) totalFailure = true
            else if (errs > 0 || attached === 0) partialFailure = true
        } else if (kind === 'pause_campaigns') {
            const paused = (result?.paused || []).length
            const errs = (result?.errors || []).length
            if (paused === 0 && errs > 0) totalFailure = true
            else if (paused > 0 && errs > 0) partialFailure = true
        }

        if (totalFailure) {
            const errSummary = JSON.stringify(result?.errors || result).slice(0, 250)
            return fail(c, `Safety fix totally failed: ${errSummary}`, 422)
        }
        return ok(c, { kind, result, partialFailure }, partialFailure ? 'Safety fix partially applied' : 'Safety fix applied')
    } catch (err) {
        // K12-fix2: log full stacktrace so journalctl shows what failed
        console.error(`[applySafetyFix] ERROR kind=? instance=${c.req.param('id')}:`, err)
        return fail(c, `Safety fix failed: ${(err as Error).message}`, 500)
    }
}

// ── POST /hosting/instances/:id/safety/apply-bidding-strategy ──
// K13: graduated 3-option bidding strategy chooser. Replaces the
// single-button aggressive default with risk-aware decision UI.
//
// Body: { strategy: 'conservative' | 'moderate' | 'aggressive', moderateTargetCpaIls?: number }
//
// Side effect: applying CONSERVATIVE or MODERATE on campaigns previously
// hit by AGGRESSIVE naturally REVERTS (resume paused + restore Smart
// Bidding). Doubles as "undo prior aggressive action" + "apply new strategy".
export const applyBiddingStrategy = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ strategy?: string; moderateTargetCpaIls?: number }>().catch(() => ({}))
        const strategy = String((body as any).strategy || '').trim() as 'conservative' | 'moderate' | 'aggressive'
        if (!['conservative','moderate','aggressive'].includes(strategy)) return fail(c, 'invalid strategy', 400)

        const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig } = await import('@/services/agentContext')
        const agentIdParam = c.req.query('agentId')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found', 404)
        const tokens = (agent as any).googleTokens
        if (!tokens?.refreshToken) return fail(c, 'No Google OAuth tokens', 400)

        const ads = (await readGoogleAdsConfig(agent, instanceId)).config as any
        if (!ads?.customerId || !ads?.developerToken) return fail(c, 'Google Ads not connected', 400)
        const operatingCustomerId = String(ads.scope?.operatingCustomerId || ads.customerId || '').replace(/\D/g, '')
        const loginCustomerId = String(ads.loginCustomerId || ads.customerId || '').replace(/\D/g, '')
        const scopedCampaignIds: string[] = Array.isArray(ads.scope?.campaignIds) ? ads.scope.campaignIds.map(String) : []
        if (scopedCampaignIds.length === 0) return fail(c, 'No scoped campaignIds (set Google Ads scope first)', 400)

        // K15: idempotency check — block re-apply of same strategy in active window
        try {
            const { readDeferredActions } = await import('@/services/deferredActions/store')
            const { getHandler } = await import('@/services/deferredActions/registry')
            await import('@/services/deferredActions/handlers/index')
            const existing = await readDeferredActions(instanceId, agent.id, { kind: 'bidding_strategy' })
            const handler = getHandler('bidding_strategy')
            if (handler?.detectDuplicate) {
                const dupMsg = handler.detectDuplicate(
                    { instanceId, agentId: agent.id, tokens: { refreshToken: tokens.refreshToken } },
                    { strategy, customerId: operatingCustomerId, loginCustomerId },
                    existing as never,
                )
                if (dupMsg) return fail(c, dupMsg, 409)
            }
        } catch (e) {
            console.warn('[applyBiddingStrategy] duplicate check failed (non-fatal):', (e as Error).message)
        }

        const { applyBiddingStrategy: apply } = await import('@/services/googleAdsBiddingStrategy')
        const result = await apply({
            customerId: operatingCustomerId,
            loginCustomerId,
            tokens: { refreshToken: tokens.refreshToken },
            developerToken: String(ads.developerToken),
            scopedCampaignIds,
            strategy,
            moderateTargetCpaIls: (body as any).moderateTargetCpaIls,
        })

        console.log(`[applyBiddingStrategy] instance=${instanceId} strategy=${strategy} actions=${result.actionsApplied.length} errors=${result.errors.length}`)
        for (const a of result.actionsApplied) console.log(`[applyBiddingStrategy]   ✓ ${a.campaignName}: ${a.change}`)
        for (const e of result.errors) console.log(`[applyBiddingStrategy]   ✗ ${e.campaignId}: ${e.error}`)

        // K14: persist history for deferred follow-up. Recovery scheduler
        // reads research_data.adsBiddingHistory[] daily and generates
        // monthly_task at appliedAt + recoveryDays. Restoring the exact
        // previousState (budgets, bidding, status) is just inverse mutation.
        if (result.actionsApplied.length > 0) {
            try {
                const { STRATEGY_RECOVERY_DAYS } = await import('@/services/googleAdsBiddingStrategy')
                const { mutateResearchData } = await import('@/services/agentContext')
                const historyId = `bid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                const entry = {
                    id: historyId,
                    appliedAt: new Date().toISOString(),
                    appliedBy: (c.get('userId') as string | undefined) || 'unknown',
                    strategy,
                    recoveryDays: STRATEGY_RECOVERY_DAYS[strategy],
                    customerId: operatingCustomerId,
                    loginCustomerId,
                    previousState: result.previousState,
                    newState: result.newState,
                    actionsApplied: result.actionsApplied,
                    followupGenerated: false,
                    followupGeneratedAt: null,
                    restored: false,
                    restoredAt: null,
                }
                await mutateResearchData(agent, instanceId, (rd: any) => {
                    rd.adsBiddingHistory = [...((rd.adsBiddingHistory) || []), entry]
                    return rd
                })
                // K15: also record in generic deferredActions[] (legacy + new co-exist during transition)
                const { recordDeferredAction } = await import('@/services/deferredActions/store')
                await recordDeferredAction(instanceId, agent.id, {
                    id: historyId,
                    kind: 'bidding_strategy',
                    appliedAt: entry.appliedAt,
                    appliedBy: entry.appliedBy,
                    recoveryDays: entry.recoveryDays,
                    payload: {
                        strategy,
                        customerId: operatingCustomerId,
                        loginCustomerId,
                        previousState: result.previousState,
                        newState: result.newState,
                        actionsApplied: result.actionsApplied,
                    },
                    state: 'active',
                    followupGeneratedAt: null,
                    restoredAt: null,
                    dismissedAt: null,
                })
                console.log(`[applyBiddingStrategy] history entry ${historyId} saved (recovery in ${STRATEGY_RECOVERY_DAYS[strategy]} days, dual-write legacy+generic)`)
            } catch (histErr) {
                console.warn(`[applyBiddingStrategy] history save failed (non-fatal): ${(histErr as Error).message}`)
            }
        }

        return ok(c, { strategy, result }, `Strategy "${strategy}" applied: ${result.summary}`)
    } catch (err) {
        console.error('[applyBiddingStrategy] ERROR:', err)
        return fail(c, `Apply bidding strategy failed: ${(err as Error).message}`, 500)
    }
}

// ── K15: Generic deferred actions endpoints ──

// GET /hosting/instances/:id/safety/active-actions
// Lists ACTIVE deferred actions for dashboard widget. Returns array
// with descriptor (titleHe, daysRemaining, severity) per handler.
export const listActiveDeferredActions = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const agentIdParam = c.req.query('agentId')
        const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        const { readDeferredActions } = await import('@/services/deferredActions/store')
        const { getHandler } = await import('@/services/deferredActions/registry')
        await import('@/services/deferredActions/handlers/index')

        const allActions = await readDeferredActions(instanceId, agent?.id || null)
        const active = allActions.filter(a => a.state === 'active')
        const items = active.map(action => {
            const handler = getHandler(action.kind)
            const descriptor = handler?.describeForDashboard ? handler.describeForDashboard(action) : {
                titleHe: `פעולה זמנית: ${action.kind}`,
                subtitleHe: '',
                daysRemaining: action.recoveryDays - Math.floor((Date.now() - new Date(action.appliedAt).getTime()) / 86400000),
                severity: 'info' as const,
                icon: '⏳',
            }
            return { id: action.id, kind: action.kind, appliedAt: action.appliedAt, descriptor }
        })
        return ok(c, { items, count: items.length }, 'Active deferred actions')
    } catch (err) {
        return fail(c, `List active actions failed: ${(err as Error).message}`, 500)
    }
}

// POST /hosting/instances/:id/safety/record-deferred-action
// Backfill an external action into deferredActions[]. Body:
//   { kind, appliedAt, recoveryDays, payload }
// Used for migration from out-of-band changes that need follow-up reminders.
export const recordDeferredActionEndpoint = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ kind?: string; appliedAt?: string; recoveryDays?: number; payload?: Record<string, unknown> }>().catch(() => ({}))
        const kind = String((body as Record<string, unknown>).kind || '').trim()
        const appliedAt = String((body as Record<string, unknown>).appliedAt || new Date().toISOString())
        const recoveryDays = Number((body as Record<string, unknown>).recoveryDays || 14)
        const payload = (body as Record<string, unknown>).payload || {}
        if (!kind) return fail(c, 'kind required', 400)

        const agentIdParam = c.req.query('agentId')
        const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent', 404)

        const { recordDeferredAction } = await import('@/services/deferredActions/store')
        const actionId = `${kind.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await recordDeferredAction(instanceId, agent.id, {
            id: actionId,
            kind: kind as never,
            appliedAt,
            appliedBy: (c.get('userId') as string | undefined) || 'backfill',
            recoveryDays,
            payload,
            state: 'active',
            followupGeneratedAt: null,
            restoredAt: null,
            dismissedAt: null,
        })
        return ok(c, { actionId }, 'Action recorded')
    } catch (err) {
        return fail(c, `Record action failed: ${(err as Error).message}`, 500)
    }
}

// POST /hosting/instances/:id/safety/restore-deferred-action
// Generic restore — finds handler by action.kind, calls handler.restore()
// with delta-based reconciliation. Replaces the old restore-bidding endpoint
// (which remains for backwards compat).
export const restoreDeferredAction = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ actionId?: string }>().catch(() => ({}))
        const actionId = String((body as Record<string, unknown>).actionId || '').trim()
        if (!actionId) return fail(c, 'actionId required', 400)

        const agentIdParam = c.req.query('agentId')
        const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent', 404)
        const tokens = (agent as Record<string, unknown>).googleTokens as { refreshToken?: string } | undefined
        if (!tokens?.refreshToken) return fail(c, 'No Google OAuth tokens', 400)

        const { readDeferredActions, updateDeferredAction } = await import('@/services/deferredActions/store')
        const { getHandler } = await import('@/services/deferredActions/registry')
        await import('@/services/deferredActions/handlers/index')

        const actions = await readDeferredActions(instanceId, agent.id)
        const action = actions.find(a => a.id === actionId)
        if (!action) return fail(c, `Action ${actionId} not found`, 404)
        if (action.state === 'restored') return fail(c, 'Already restored', 400)

        const handler = getHandler(action.kind)
        if (!handler) return fail(c, `No handler for kind=${action.kind}`, 500)

        const result = await handler.restore(
            { instanceId, agentId: agent.id, tokens: { refreshToken: tokens.refreshToken } },
            action,
        )

        console.log(`[restoreDeferredAction] instance=${instanceId} actionId=${actionId} kind=${action.kind} applied=${result.actionsApplied.length} errors=${result.errors.length}`)
        for (const a of result.actionsApplied) console.log(`[restoreDeferredAction]   ✓ ${a.resourceId}: ${a.change}`)
        for (const e of result.errors) console.log(`[restoreDeferredAction]   ✗ ${e.resourceId}: ${e.error}`)

        await updateDeferredAction(instanceId, agent.id, actionId, {
            state: 'restored',
            restoredAt: new Date().toISOString(),
        })

        return ok(c, { actionId, kind: action.kind, result }, `Restored: ${result.summary}`)
    } catch (err) {
        console.error('[restoreDeferredAction] ERROR:', err)
        return fail(c, `Restore failed: ${(err as Error).message}`, 500)
    }
}

// POST /hosting/instances/:id/safety/migrate-bidding-history
// One-time migration: move legacy adsBiddingHistory[] → deferredActions[].
// Safe to call multiple times (idempotent).
export const migrateBiddingHistoryEndpoint = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const agentIdParam = c.req.query('agentId')
        const { resolveAgentById, resolvePrimaryAgent } = await import('@/services/agentContext')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent', 404)
        const { migrateBiddingHistoryToDeferredActions } = await import('@/services/deferredActions/store')
        const stats = await migrateBiddingHistoryToDeferredActions(instanceId, agent.id)
        return ok(c, stats, `Migrated ${stats.migrated}, skipped ${stats.skipped}`)
    } catch (err) {
        return fail(c, `Migration failed: ${(err as Error).message}`, 500)
    }
}

// ── POST /hosting/instances/:id/safety/restore-bidding ──
// K14: restore campaigns to a previously snapshotted state. Used by:
//   - "Restore to original" button on tsk_restore_bidding monthly tasks
//   - Manual undo from UI
// Body: { historyId: string }
export const restoreBiddingFromHistory = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ historyId?: string }>().catch(() => ({}))
        const historyId = String((body as any).historyId || '').trim()
        if (!historyId) return fail(c, 'historyId required', 400)

        const { resolveAgentById, resolvePrimaryAgent, readGoogleAdsConfig, mutateResearchData } = await import('@/services/agentContext')
        const agentIdParam = c.req.query('agentId')
        const agent = agentIdParam
            ? (await resolveAgentById(instanceId, agentIdParam)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        if (!agent) return fail(c, 'No agent found', 404)
        const tokens = (agent as any).googleTokens
        if (!tokens?.refreshToken) return fail(c, 'No Google OAuth tokens', 400)

        const rd: any = (agent as any).researchData || {}
        const history = (rd.adsBiddingHistory || []) as any[]
        const entry = history.find(h => h.id === historyId)
        if (!entry) return fail(c, `History entry ${historyId} not found`, 404)
        if (entry.restored) return fail(c, 'Already restored', 400)

        const ads = (await readGoogleAdsConfig(agent, instanceId)).config as any
        if (!ads?.customerId || !ads?.developerToken) return fail(c, 'Google Ads not connected', 400)

        const { restoreBiddingFromHistory: restoreFn } = await import('@/services/googleAdsBiddingStrategy')
        const result = await restoreFn({
            customerId: String(entry.customerId),
            loginCustomerId: String(entry.loginCustomerId),
            tokens: { refreshToken: tokens.refreshToken },
            developerToken: String(ads.developerToken),
            previousState: entry.previousState,
        })

        console.log(`[restoreBidding] instance=${instanceId} historyId=${historyId} restored=${result.restored.length} errors=${result.errors.length}`)
        for (const r of result.restored) console.log(`[restoreBidding]   ✓ ${r.campaignId}: ${r.change}`)
        for (const e of result.errors) console.log(`[restoreBidding]   ✗ ${e.campaignId}: ${e.error}`)

        // Mark restored in history
        await mutateResearchData(agent, instanceId, (rdInner: any) => {
            const hist = (rdInner.adsBiddingHistory || []) as any[]
            const idx = hist.findIndex((h) => h.id === historyId)
            if (idx >= 0) {
                hist[idx].restored = true
                hist[idx].restoredAt = new Date().toISOString()
            }
            rdInner.adsBiddingHistory = hist
            return rdInner
        })

        return ok(c, { historyId, result }, `Restored ${result.restored.length} actions, ${result.errors.length} errors`)
    } catch (err) {
        console.error('[restoreBidding] ERROR:', err)
        return fail(c, `Restore failed: ${(err as Error).message}`, 500)
    }
}

// ── GET /hosting/instances/:id/safety/bidding-strategies ──
// Returns the 3 strategy definitions (titles, descriptions, what you get/give up)
// for the UI to render the chooser card.
export const listBiddingStrategies = async (c: Context<HonoEnv>) => {
    const { BIDDING_STRATEGIES } = await import('@/services/googleAdsBiddingStrategy')
    return ok(c, {
        defaultStrategy: 'conservative',
        strategies: BIDDING_STRATEGIES,
    }, 'Bidding strategies')
}

// ── POST /hosting/instances/:id/outputs/:outputId/sgtm/configure ──
// Phase 2026.02 Block 6 Pattern G: user pasted CONTAINER_CONFIG from GTM UI.
// SSH-write to /opt/openclaw/sgtm/.env, restart container, verify /healthy.
// On success → promote task to 'completed' + mirror status in research_data.
export const sgtmConfigure = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const outputId = c.req.param('outputId')
        const userId = c.get('userId')
        const body = await c.req.json<{ containerConfig?: string }>().catch(() => ({} as { containerConfig?: string }))
        const containerConfig = ((body as { containerConfig?: string }).containerConfig || '').trim()
        if (!containerConfig) return fail(c, 'containerConfig required in body', 400)

        const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
        if (!output) return fail(c, 'Output not found', 404)
        if (output.outputType !== 'monthly_task') return fail(c, 'Not a monthly_task', 400)

        const { applyContainerConfig } = await import('@/services/sgtmProvisioner')
        const result = await applyContainerConfig(instanceId, containerConfig)

        if (!result.healthy) {
            // Don't mark task completed — surface the failure so user can retry.
            await db.update(agentOutputs).set({
                metadata: {
                    ...((output.metadata as any) || {}),
                    sgtmConfigure: { healthy: false, error: result.error, attemptedAt: new Date().toISOString() },
                } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, outputId))
            return fail(c, result.error || 'sGTM container did not become healthy', 422)
        }

        // Healthy → promote task to completed + mirror to research_data
        const meta = output.metadata as Record<string, unknown> | null
        const taskId = meta?.taskId as string | undefined
        await db.update(agentOutputs).set({
            status: 'completed',
            publishedAt: new Date(),
            metadata: {
                ...(meta || {}),
                sgtmConfigure: { healthy: true, sgtmUrl: result.sgtmUrl, completedAt: new Date().toISOString() },
            } as any,
            updatedAt: new Date(),
        }).where(eq(agentOutputs.id, outputId))

        if (taskId) {
            try {
                const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } =
                    await import('@/services/agentContext')
                const agent = output.agentId
                    ? (await resolveAgentById(output.instanceId, output.agentId)) || (await resolvePrimaryAgent(output.instanceId))
                    : await resolvePrimaryAgent(output.instanceId)
                await mutateResearchData(agent, output.instanceId, (rd: any) => {
                    const plan = rd?.monthlyPlan
                    if (!plan || !Array.isArray(plan.tasks)) return rd
                    const idx = plan.tasks.findIndex((t: any) => t.id === taskId)
                    if (idx === -1) return rd
                    plan.tasks[idx].status = 'completed'
                    plan.tasks[idx].completedAt = new Date().toISOString()
                    ;(plan.tasks[idx] as any).completedMethod = 'hybrid_auto_plus_user_config'
                    ;(plan.tasks[idx] as any).completedBy = userId
                    return rd
                })
            } catch (err) {
                console.warn(`[sgtmConfigure] research_data mirror failed:`, (err as Error).message)
            }
        }

        return ok(c, { sgtmUrl: result.sgtmUrl, healthy: true }, 'sGTM configured + healthy')
    } catch (err) {
        console.error('sgtmConfigure error:', err)
        return fail(c, 'sGTM configure failed: ' + (err as Error).message, 500)
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/mark-manual-done ──
// Phase 2026.02 Block 6 Pattern F: completion path for tasks that ran
// auto-execute but require a final manual step (e.g. sGTM Cloud Run deploy,
// codeless conversion action demote, ga4 BigQuery linkage). Executor left
// the task in 'awaiting_manual' status; user clicks "✓ ביצעתי ידנית" in
// the popup and we promote it to 'completed' AND mirror the same status
// on plan.tasks[idx] in research_data.
export const markManualDone = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const userId = c.get('userId')

        // K18 — optional outcome capture. Founder may provide:
        //   { actualValue: number, actualNote?: string }
        // alongside the mark-done action. If present, write actualImpact with
        // source='manual' so the next monthly re-audit sees a real signal
        // rather than 'no_data'.
        const userOutcome: { actualValue?: number; actualNote?: string } = {}
        try {
            const body = await c.req.json().catch(() => ({}))
            if (body && typeof body === 'object') {
                if (typeof body.actualValue === 'number' && Number.isFinite(body.actualValue)) userOutcome.actualValue = body.actualValue
                if (typeof body.actualNote === 'string') userOutcome.actualNote = body.actualNote.slice(0, 500)
            }
        } catch { /* body optional */ }

        const [updated] = await db.update(agentOutputs)
            .set({
                status: 'completed',
                publishedAt: new Date(),     // reuse publishedAt as 'final state at'
                updatedAt: new Date(),
            })
            .where(and(
                eq(agentOutputs.id, outputId),
                eq(agentOutputs.status, 'awaiting_manual'),
            ))
            .returning()

        if (!updated) {
            // Idempotency check: if the output exists but is already completed,
            // return success (no-op). Avoids the 404 "ghost error" UX when user
            // clicks "✓ סיימתי" on a task that was auto-completed by the wizard
            // or completed in a prior flow.
            const [existing] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
            if (existing && (existing.status === 'completed' || existing.status === 'published')) {
                return ok(c, { id: outputId, alreadyCompleted: true }, 'Already completed')
            }
            return fail(c, 'Output not found or not in awaiting_manual status', 404)
        }

        // Mirror to research_data.monthlyPlan.tasks[idx].status = 'completed'.
        const meta = updated.metadata as Record<string, unknown> | null
        const taskId = meta?.taskId as string | undefined
        if (taskId && updated.outputType === 'monthly_task') {
            try {
                const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } =
                    await import('@/services/agentContext')
                const agent = updated.agentId
                    ? (await resolveAgentById(updated.instanceId, updated.agentId)) || (await resolvePrimaryAgent(updated.instanceId))
                    : await resolvePrimaryAgent(updated.instanceId)
                await mutateResearchData(agent, updated.instanceId, (rd: any) => {
                    const plan = rd?.monthlyPlan
                    if (!plan || !Array.isArray(plan.tasks)) return rd
                    const idx = plan.tasks.findIndex((t: any) => t.id === taskId)
                    if (idx === -1) return rd
                    const task = plan.tasks[idx]
                    task.status = 'completed'
                    task.completedAt = new Date().toISOString()
                    task.completedMethod = 'manual_user_confirm'
                    task.completedBy = userId
                    // K18: capture user-reported outcome immediately if provided.
                    if (userOutcome.actualValue != null) {
                        const expectedValue = Number(task.expectedImpact?.value) || 0
                        const realizedPct = expectedValue !== 0
                            ? (userOutcome.actualValue / expectedValue) * 100
                            : undefined
                        const deltaVsExpected = expectedValue !== 0
                            ? ((userOutcome.actualValue - expectedValue) / Math.abs(expectedValue)) * 100
                            : 0
                        const category = realizedPct == null ? 'unknown'
                            : realizedPct >= 80 ? 'hit'
                            : realizedPct >= 50 ? 'mixed'
                            : 'missed'
                        task.actualImpact = {
                            metric: task.expectedImpact?.metric || 'other',
                            value: userOutcome.actualValue,
                            horizon: task.expectedImpact?.horizon || '30d',
                            measuredAt: new Date().toISOString(),
                            rationale: userOutcome.actualNote || `המשתמש דיווח ערך בפועל ${userOutcome.actualValue}`,
                            deltaVsExpected,
                            realizedPct,
                            category,
                            source: 'manual',
                            evidence: ['user_confirmed'],
                        }
                    }
                    return rd
                })
            } catch (err) {
                console.warn(`[markManualDone] mirror to research_data failed for ${outputId}:`, (err as Error).message)
            }
        }

        console.log(`Output ${outputId} (taskId=${taskId}) marked manual-done by ${userId}${userOutcome.actualValue != null ? ` outcome=${userOutcome.actualValue}` : ''}`)
        return ok(c, updated, 'Manual step confirmed — task marked completed')
    } catch (err) {
        console.error('markManualDone error:', err)
        return fail(c, 'Failed to mark manual done', 500)
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/approve ──
export const approveOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const userId = c.get('userId')

        const [updated] = await db.update(agentOutputs)
            .set({
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: userId,
                updatedAt: new Date(),
            })
            .where(and(
                eq(agentOutputs.id, outputId),
                eq(agentOutputs.status, 'pending_review')
            ))
            .returning()

        if (!updated) return fail(c, 'Output not found or already processed', 404)

        console.log(`Output ${outputId} approved by ${userId}`)

        // Post-approve triggers — run async, don't block response
        triggerPostApprove(updated).catch(err => console.error('Post-approve trigger error:', err))

        // Mirror status to the Telegram approval message so chat stays in sync
        import('@/services/approvalQueueTelegram').then(m =>
            m.updateApprovalQueueMessage(outputId)
        ).catch(() => { /* non-fatal */ })

        return ok(c, updated, 'Output approved')
    } catch (err) {
        console.error('approveOutput error:', err)
        return fail(c, 'Failed to approve', 500)
    }
}

/**
 * Post-approve triggers — automatically advance the pipeline:
 * - SEO strategy approved → עט writes first article
 * - SEO article approved → ready for publish (manual or WordPress)
 * - Ranking fix approved → שליח publishes update
 */
async function triggerPostApprove(output: typeof agentOutputs.$inferSelect) {
    const meta = output.metadata as Record<string, unknown> | null

    // Phase 4.3-P(B) — Conversion mapping proposal approved → promote
    // draftMapping in research_data into active[] so the GTM diagnostic
    // gate goes green. Idempotent: if user re-approves, applyApprovedConversionMapping
    // just re-writes the same set.
    if (output.outputType === 'conversion_mapping_proposal') {
        console.log(`Conversion mapping approved: ${output.id} → applying to active[]`)
        try {
            const { applyApprovedConversionMapping } = await import('@/services/mazhirConversionsDetect')
            const { activated } = await applyApprovedConversionMapping(output.instanceId, output.agentId || null)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), activated, appliedAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        } catch (err) {
            console.error('applyApprovedConversionMapping error:', err)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), applyError: (err as Error).message } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        }
        return
    }

    // Conversion isolation proposal approved → isolate this tenant's campaigns
    // from sibling-brand conversion actions on a shared MCC operating account.
    if (output.outputType === 'conversion_isolation_proposal') {
        console.log(`Conversion isolation approved: ${output.id} → applying`)
        try {
            const { applyIsolationFromTask } = await import('@/services/campaignGoalIsolation')
            const r = await applyIsolationFromTask(output)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: r.ok ? 'applied' : 'failed', applyResult: r.reason, appliedAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        } catch (err) {
            console.error('applyIsolationFromTask error:', err)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: 'failed', applyError: (err as Error).message } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        }
        return
    }

    // Campaign Foundation review approved → apply the foundation deltas
    // (sibling/account negatives, broad→phrase, PAUSED ad-group creates +
    // keywords) on the PER-AGENT operating account. Creates land PAUSED.
    if (output.outputType === 'ads_foundation_review') {
        console.log(`Foundation review approved: ${output.id} → applying deltas`)
        try {
            const { applyFoundationFromTask } = await import('@/services/foundationApplier')
            const r = await applyFoundationFromTask(output)
            await db.update(agentOutputs).set({
                metadata: {
                    ...(meta || {}),
                    liveApiStatus: r.ok ? 'applied' : (r.applied.length ? 'partial' : 'failed'),
                    applyResult: { applied: r.applied, failed: r.failed, error: r.error },
                    appliedAt: new Date().toISOString(),
                } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        } catch (err) {
            console.error('applyFoundationFromTask error:', err)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: 'failed', applyError: (err as Error).message } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        }
        return
    }

    // Imported-campaign objective transition approved → apply tROAS/tCPA to an
    // existing (non-Flowmatic-launched) campaign, handling Pmax vs standard fields
    // and the MCC operating/login customer ids.
    if (output.outputType === 'imported_objective_transition') {
        console.log(`Imported objective transition approved: ${output.id} → applying`)
        try {
            const { applyImportedObjectiveTransition } = await import('@/services/objectiveTransitionRunner')
            const r = await applyImportedObjectiveTransition(output)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: r.ok ? 'applied' : 'failed', applyResult: r.reason, appliedAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        } catch (err) {
            console.error('applyImportedObjectiveTransition error:', err)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: 'failed', applyError: (err as Error).message } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        }
        return
    }

    // Bid Transition Proposal approved → flip the campaign's bidding strategy
    if (output.outputType === 'bid_transition_proposal') {
        console.log(`Bid transition approved: ${output.id} → applying`)
        const { applyBidTransition } = await import('@/services/bidTransitionRunner')
        const r = await applyBidTransition(output.id)
        if (r.ok) {
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: 'applied', appliedAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        } else {
            console.error(`Bid transition apply failed: ${r.reason}`)
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), liveApiStatus: 'failed', failureReason: r.reason } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
        }
        return
    }

    // Meta Ads draft approved → execute via live API
    if (output.outputType && output.outputType.startsWith('mads_') && output.outputType.endsWith('_draft')) {
        console.log(`Meta Ads draft approved: ${output.outputType} (id ${output.id})`)
        const [inst] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
        const mt = (inst?.metaTokens as any) || {}
        const hasToken = !!(mt.accessToken || mt.userAccessToken || mt.pageAccessToken)
        const hasAdAccount = !!mt.adAccountId
        const hasFullConfig = hasToken && hasAdAccount

        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...(meta || {}),
                    liveApiStatus: hasFullConfig ? 'queued' : 'pending_config',
                    approvedForExecutionAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        if (hasFullConfig) {
            const { executeMadsDraft } = await import('@/services/metaAdsExecutor')
            const [fresh] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, output.id))
            if (fresh) executeMadsDraft(fresh).catch(err => console.error(`Mads executor error for ${output.id}:`, err))
        }
        return
    }

    // Google Ads draft approved → execute via live API
    if (output.outputType && output.outputType.startsWith('gads_') && output.outputType.endsWith('_draft')) {
        console.log(`Google Ads draft approved: ${output.outputType} (id ${output.id}) — invoking executor`)
        const [inst] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
        const cfg = (inst?.googleAdsConfig as any) || {}
        const gt = (inst?.googleTokens as any) || {}
        const hasRefreshToken = !!(gt.refreshToken || gt.refresh_token)
        const hasFullConfig = hasRefreshToken && !!cfg.customerId && !!cfg.developerToken

        // Mark queued before execution for UI feedback
        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...(meta || {}),
                    liveApiStatus: hasFullConfig ? 'queued' : 'pending_config',
                    approvedForExecutionAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        if (hasFullConfig) {
            // Fire-and-forget execution (metadata updated by executor)
            const { executeGadsDraft } = await import('@/services/googleAdsExecutor')
            // Re-fetch output with queued status for executor to work with current state
            const [fresh] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, output.id))
            if (fresh) {
                executeGadsDraft(fresh)
                    .catch(err => console.error(`Gads executor error for ${output.id}:`, err))
            }
        } else {
            console.log(`Gads execution skipped — config incomplete (refreshToken=${hasRefreshToken}, cfg=${JSON.stringify(cfg).substring(0, 100)})`)
        }
        return
    }

    // Yotzer creative_final_draft approved → trigger fal.ai render (Phase B2)
    if (output.outputType === 'creative_final_draft') {
        console.log(`Creative final draft approved: ${output.id} — invoking executor`)
        const [inst] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
        const hasFalKey = !!(inst as any)?.falApiKey

        await db.update(agentOutputs)
            .set({
                metadata: {
                    ...(meta || {}),
                    renderStatus: hasFalKey ? 'queued' : 'pending_config',
                    approvedForExecutionAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, output.id))

        if (hasFalKey && inst) {
            const { executeCreativeRender } = await import('@/services/creativeExecutor')
            executeCreativeRender({
                instanceId: output.instanceId,
                outputId: output.id,
                instance: {
                    id: inst.id,
                    ip: inst.ip,
                    rootPassword: inst.rootPassword,
                    falApiKey: (inst as any).falApiKey,
                    elevenlabsApiKey: (inst as any).elevenlabsApiKey,
                },
            }).catch(err => console.error(`Creative executor error for ${output.id}:`, err))
        } else {
            console.log(`Creative render skipped — fal.ai key missing for ${output.instanceId}`)
        }
        return
    }

    // Phase 2026.02 Block 6 — monthly_task approved → run the executor.
    // Previously approve just flipped status in agent_outputs without invoking
    // monthlyTaskExecutor.executeTask, so Mission #1 tasks (tsk_cr_validation,
    // tsk_consent_mode_v2, tsk_enhanced_conversions) silently did nothing
    // after the user clicked אשרו. This branch:
    //   1. Updates the MonthlyTask in research_data.monthlyPlan.tasks to status='approved'
    //      (executor refuses to run unless the task object itself is approved).
    //   2. Fire-and-forget invokes executeTask(instanceId, taskId).
    //   3. Executor writes back completion / failure / executionOutcome.
    if (output.outputType === 'monthly_task') {
        const taskId = meta?.taskId as string | undefined
        if (!taskId) {
            console.error(`monthly_task approved but metadata.taskId missing: ${output.id}`)
            return
        }
        console.log(`Monthly task approved: ${taskId} (output ${output.id}) — invoking executor`)
        try {
            const { resolveAgentById, resolvePrimaryAgent, readResearchData, mutateResearchData } =
                await import('@/services/agentContext')
            const agent = output.agentId
                ? (await resolveAgentById(output.instanceId, output.agentId)) || (await resolvePrimaryAgent(output.instanceId))
                : await resolvePrimaryAgent(output.instanceId)
            // 1. Mark the MonthlyTask object approved (executor pre-check requires it).
            //    K33: also bind executionOutputId to the output the user just approved.
            //    Previously, when a task already had executionOutputId from an earlier
            //    run, executor.persistResult() updated that OLD row — so the NEW
            //    pending_review row that the user is watching stayed empty (content=null).
            //    Binding here guarantees writes land on the row the dashboard renders.
            await mutateResearchData(agent, output.instanceId, (rd: any) => {
                const plan = rd?.monthlyPlan
                if (!plan || !Array.isArray(plan.tasks)) return rd
                const idx = plan.tasks.findIndex((t: any) => t.id === taskId)
                if (idx === -1) return rd
                plan.tasks[idx].status = 'approved'
                plan.tasks[idx].approvedAt = new Date().toISOString()
                plan.tasks[idx].executionOutputId = output.id
                return rd
            })
            // 2. Mark queued in agent_outputs for UI feedback.
            await db.update(agentOutputs).set({
                metadata: { ...(meta || {}), executionStatus: 'queued', approvedForExecutionAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
            }).where(eq(agentOutputs.id, output.id))
            // 3. Fire-and-forget. executeTask updates research_data + agent_outputs on completion.
            // Pass output.agentId so multi-agent VPS topology resolves the right
            // mateh_agent (Packing Station as secondary etc.).
            const { executeTask } = await import('@/services/monthlyTaskExecutor')
            executeTask(output.instanceId, taskId, output.agentId)
                .then(r => console.log(`[monthlyTaskExecutor] ${taskId} → ${r.ok ? 'ok' : 'failed'}: ${r.outputDescription || r.error || ''}`))
                .catch(err => console.error(`monthlyTaskExecutor crash for ${taskId}:`, err))
        } catch (err) {
            console.error(`monthly_task post-approve trigger failed for ${output.id}:`, err)
        }
        return
    }

    // Earlier creative gates (concept/character/scenes) — auto-invoke yotzer cascade
    // to generate the next gate's draft. This closes the HITL loop without manual CLI.
    if (output.outputType && output.outputType.startsWith('creative_') && output.outputType !== 'creative_final_draft') {
        console.log(`Creative gate approved: ${output.outputType} (id ${output.id}) — triggering yotzer cascade`)
        try {
            const { cascadeCreativeGate } = await import('@/services/yotzerCascade')
            // Fire-and-forget (non-blocking — agent takes 30-120s)
            cascadeCreativeGate(output).catch(err => console.error(`Cascade error for ${output.id}:`, err))
        } catch (err) {
            console.error(`Failed to import cascade for ${output.id}:`, err)
        }
        return
    }

    // SEO Strategy approved → trigger עט to write the #1 priority article
    if (meta?.type === 'seo_strategy' && output.agentRole === 'menateach') {
        console.log(`SEO strategy approved — triggering content writing for instance ${output.instanceId}`)

        const [instance] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
        if (!instance?.ip) return

        // Extract first recommended article from strategy content
        const content = output.content || ''
        const titleMatch = content.match(/(?:כותרת|#1|⭐⭐⭐⭐⭐)[^\n]*?[—:]\s*(.+?)(?:\n|\|)/i)
        const firstTitle = titleMatch?.[1]?.trim() || 'מאמר SEO ראשון'

        const writePrompt = `כתוב את המאמר הראשון מתוכנית ה-SEO שאושרה.

## מה לכתוב:
כותרת: "${firstTitle}"
בסס את המאמר על האסטרטגיה שאושרה.

## כללי כתיבה חובה:
1. AI Summary Nugget (200 תווים) בראש — לציטוט ב-AI
2. כל פסקה ≤500 טוקנים (Google AI retrieval window)
3. Schema.org JSON-LD בסוף (Article + FAQ)
4. Internal links (3-5)
5. CTA ברור
6. De-AI-ify — כתוב כבן אדם, לא כ-AI
7. עברית טבעית, משפטים קצרים

## פורמט:
כתוב את המאמר המלא כאן. Markdown format. מינימום 1500 מילים.
בסוף: JSON-LD schema block.`

        const b64 = Buffer.from(writePrompt).toString('base64')
        try {
            const sessionId = `seo-write-${Date.now()}`
            const rawOutput = await sshExecForPublish(instance.ip,
                `su - openclaw -c 'timeout 300 openclaw agent --session-id ${sessionId} --thinking medium -m "$(echo ${b64} | base64 -d)" --json 2>&1'`,
                instance.rootPassword || undefined
            )

            // Extract clean text
            let articleText = ''
            const jsonStart = rawOutput.indexOf('{')
            const jsonEnd = rawOutput.lastIndexOf('}')
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                try {
                    const parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1))
                    articleText = parsed?.result?.finalAssistantVisibleText || ''
                    if (!articleText) {
                        const payloads = parsed?.result?.payloads as Array<{ text?: string }> | undefined
                        if (payloads) {
                            for (const p of payloads) {
                                if (p.text && p.text.length > articleText.length) articleText = p.text
                            }
                        }
                    }
                } catch { articleText = rawOutput.slice(-5000) }
            }

            if (articleText.length > 100) {
                const articleId = randomBytes(6).toString('hex')
                // Phase 2.3.C — keep this article tied to the source output's agent.
                await db.insert(agentOutputs).values({
                    id: articleId,
                    instanceId: output.instanceId,
                    agentId: (output as { agentId: string | null | undefined | null }).agentId || null,
                    agentRole: 'et',
                    outputType: 'content_post',
                    title: firstTitle,
                    content: articleText,
                    status: 'pending_review',
                    metadata: { type: 'seo_article', strategyRef: output.id, autoTriggered: true },
                })
                console.log(`SEO article written: ${articleId} (${articleText.length} chars) — pending review`)
            }
        } catch (err) {
            console.error('Failed to trigger article writing:', err)
        }
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/reject ──
export const rejectOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }))

        const [updated] = await db.update(agentOutputs)
            .set({
                status: 'rejected',
                rejectionReason: reason || null,
                updatedAt: new Date(),
            })
            .where(and(
                eq(agentOutputs.id, outputId),
                eq(agentOutputs.status, 'pending_review')
            ))
            .returning()

        if (!updated) return fail(c, 'Output not found or already processed', 404)

        console.log(`Output ${outputId} rejected: ${reason || 'no reason'}`)

        import('@/services/approvalQueueTelegram').then(m =>
            m.updateApprovalQueueMessage(outputId)
        ).catch(() => { /* non-fatal */ })

        return ok(c, updated, 'Output rejected')
    } catch (err) {
        console.error('rejectOutput error:', err)
        return fail(c, 'Failed to reject', 500)
    }
}

// ── POST /hosting/instances/:id/outputs/:outputId/steps/:stepIdx/mark-step ──
// K21 — per-step completion tracking. Body:
//   { status: 'pending' | 'done' | 'skipped', note?: string }
// Server mutates research_data.monthlyPlan.tasks[i].actionPlan[stepIdx]
// in place via mutateResearchData. No-op if the step index is out of
// range (caller bug protection). Idempotent — re-marking 'done' just
// refreshes completedAt + completedNote.
export const markActionStep = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const outputId = c.req.param('outputId')
        const stepIdx = Number(c.req.param('stepIdx'))
        const userId = c.get('userId')
        if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx > 30) return fail(c, 'invalid stepIdx', 400)

        const body = await c.req.json<{ status?: string; note?: string }>().catch(() => ({} as { status?: string; note?: string }))
        const status = body.status === 'done' || body.status === 'pending' || body.status === 'skipped' ? body.status : null
        if (!status) return fail(c, "status must be 'pending' | 'done' | 'skipped'", 400)
        const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined

        const [output] = await db.select().from(agentOutputs)
            .where(and(eq(agentOutputs.id, outputId), eq(agentOutputs.instanceId, instanceId)))
        if (!output) return fail(c, 'Output not found', 404)
        const meta = output.metadata as Record<string, unknown> | null
        const taskId = meta?.taskId as string | undefined
        if (!taskId) return fail(c, 'Output has no linked taskId', 400)

        const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } =
            await import('@/services/agentContext')
        const agent = output.agentId
            ? (await resolveAgentById(instanceId, output.agentId)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)

        let outOfRange = false
        let allDone = false
        await mutateResearchData(agent, instanceId, (rd: any) => {
            const plan = rd?.monthlyPlan
            if (!plan || !Array.isArray(plan.tasks)) return rd
            const taskIdx = plan.tasks.findIndex((t: any) => t.id === taskId)
            if (taskIdx === -1) return rd
            const task = plan.tasks[taskIdx]
            if (!Array.isArray(task.actionPlan) || stepIdx >= task.actionPlan.length) {
                outOfRange = true
                return rd
            }
            const step = task.actionPlan[stepIdx]
            step.status = status
            if (status === 'done' || status === 'skipped') {
                step.completedAt = new Date().toISOString()
                if (note) step.completedNote = note
            } else {
                delete step.completedAt
                delete step.completedNote
            }
            // K21: detect whole-task completion when every step is done/skipped.
            allDone = task.actionPlan.every((s: any) => s.status === 'done' || s.status === 'skipped')
            return rd
        })
        if (outOfRange) return fail(c, 'stepIdx out of range', 400)

        console.log(`Step ${stepIdx} on ${outputId} marked ${status} by ${userId}`)
        return ok(c, { stepIdx, status, allDone }, 'Step status updated')
    } catch (err) {
        console.error('markActionStep error:', err)
        return fail(c, 'Failed to mark step', 500)
    }
}

// ── POST /hosting/instances/:id/outputs/:outputId/retry-now ──
// K20 — manual retry for a failed monthly_task. Bypasses the cron-driven
// backoff schedule (1h/4h/24h) and re-fires the executor immediately.
// Honors the 3-retry cap — beyond that an investigate child task already
// exists and the user should look at that instead.
export const retryFailedTaskNow = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const outputId = c.req.param('outputId')
        const userId = c.get('userId')

        const [output] = await db.select().from(agentOutputs)
            .where(and(eq(agentOutputs.id, outputId), eq(agentOutputs.instanceId, instanceId)))
        if (!output) return fail(c, 'Output not found', 404)
        if (output.outputType !== 'monthly_task') return fail(c, 'Not a monthly_task', 400)
        const meta = output.metadata as Record<string, unknown> | null
        const taskId = meta?.taskId as string | undefined
        if (!taskId) return fail(c, 'Output has no linked taskId', 400)

        // Reset nextRetryAt to now so the next executeTask call dispatches
        // immediately (executor's K20 catch path will set a fresh schedule
        // if the retry also fails).
        const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } =
            await import('@/services/agentContext')
        const agent = output.agentId
            ? (await resolveAgentById(instanceId, output.agentId)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)
        await mutateResearchData(agent, instanceId, (rd: any) => {
            const plan = rd?.monthlyPlan
            if (!plan || !Array.isArray(plan.tasks)) return rd
            const idx = plan.tasks.findIndex((t: any) => t.id === taskId)
            if (idx === -1) return rd
            const task = plan.tasks[idx]
            if (task.status !== 'failed') return rd   // only retry failed tasks
            if ((task.retryCount || 0) >= 3) return rd   // already escalated
            task.nextRetryAt = new Date().toISOString()
            return rd
        })

        const { executeTask } = await import('@/services/monthlyTaskExecutor')
        const result = await executeTask(instanceId, taskId, output.agentId || null)
        console.log(`Retry-now by ${userId} on ${outputId} (taskId=${taskId}): ok=${result.ok}`)
        return ok(c, { ok: result.ok, error: result.error }, result.ok ? 'משימה הופעלה מחדש בהצלחה' : 'הפעלה מחדש נכשלה — תוזמן ניסיון אוטומטי')
    } catch (err) {
        console.error('retryFailedTaskNow error:', err)
        return fail(c, 'Failed to retry', 500)
    }
}

// ── POST /hosting/instances/:id/outputs/bulk-approve ──
// K19 — bulk approve N pending_review outputs in one click. Body:
//   { outputIds: ["mt_xxx", "mt_yyy", ...] }   max 100 per call
// Per-output failures don't fail the request; returns { approved, failed[] }.
// Each approved output fires its own triggerPostApprove (executor handles
// dependency check, IL policy "every external-system mutation gates"
// preserved). Telegram sync runs async.
export const bulkApproveOutputs = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const userId = c.get('userId')
        const body = await c.req.json<{ outputIds?: unknown }>().catch(() => ({} as { outputIds?: unknown }))
        const ids = Array.isArray(body.outputIds) ? body.outputIds.filter((x): x is string => typeof x === 'string') : []
        if (ids.length === 0) return fail(c, 'outputIds array required', 400)
        if (ids.length > 100) return fail(c, 'max 100 outputs per bulk call', 400)

        const approved: string[] = []
        const failed: Array<{ id: string; reason: string }> = []
        for (const outputId of ids) {
            try {
                const [updated] = await db.update(agentOutputs)
                    .set({
                        status: 'approved',
                        approvedAt: new Date(),
                        approvedBy: userId,
                        updatedAt: new Date(),
                    })
                    .where(and(
                        eq(agentOutputs.id, outputId),
                        eq(agentOutputs.instanceId, instanceId),
                        eq(agentOutputs.status, 'pending_review'),
                    ))
                    .returning()
                if (!updated) {
                    failed.push({ id: outputId, reason: 'not found or already processed' })
                    continue
                }
                approved.push(outputId)
                triggerPostApprove(updated).catch(err => console.error(`Bulk post-approve trigger error for ${outputId}:`, err))
                import('@/services/approvalQueueTelegram').then(m =>
                    m.updateApprovalQueueMessage(outputId)
                ).catch(() => { /* non-fatal */ })
            } catch (err) {
                failed.push({ id: outputId, reason: (err as Error).message.slice(0, 100) })
            }
        }
        console.log(`Bulk approve by ${userId} on ${instanceId}: ${approved.length} approved, ${failed.length} failed`)
        return ok(c, { approved, failed, total: ids.length }, `Bulk approve: ${approved.length}/${ids.length} succeeded`)
    } catch (err) {
        console.error('bulkApproveOutputs error:', err)
        return fail(c, 'Failed bulk approve', 500)
    }
}

// ── POST /hosting/instances/:id/outputs/bulk-reject ──
// Same shape as bulk-approve. Body may include optional `reason`.
export const bulkRejectOutputs = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const userId = c.get('userId')
        const body = await c.req.json<{ outputIds?: unknown; reason?: string }>().catch(() => ({} as { outputIds?: unknown; reason?: string }))
        const ids = Array.isArray(body.outputIds) ? body.outputIds.filter((x): x is string => typeof x === 'string') : []
        if (ids.length === 0) return fail(c, 'outputIds array required', 400)
        if (ids.length > 100) return fail(c, 'max 100 outputs per bulk call', 400)
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null

        const rejected: string[] = []
        const failed: Array<{ id: string; reason: string }> = []
        for (const outputId of ids) {
            try {
                const [updated] = await db.update(agentOutputs)
                    .set({
                        status: 'rejected',
                        rejectionReason: reason,
                        updatedAt: new Date(),
                    })
                    .where(and(
                        eq(agentOutputs.id, outputId),
                        eq(agentOutputs.instanceId, instanceId),
                        eq(agentOutputs.status, 'pending_review'),
                    ))
                    .returning()
                if (!updated) {
                    failed.push({ id: outputId, reason: 'not found or already processed' })
                    continue
                }
                rejected.push(outputId)
                import('@/services/approvalQueueTelegram').then(m =>
                    m.updateApprovalQueueMessage(outputId)
                ).catch(() => { /* non-fatal */ })
            } catch (err) {
                failed.push({ id: outputId, reason: (err as Error).message.slice(0, 100) })
            }
        }
        console.log(`Bulk reject by ${userId} on ${instanceId}: ${rejected.length} rejected, ${failed.length} failed`)
        return ok(c, { rejected, failed, total: ids.length }, `Bulk reject: ${rejected.length}/${ids.length} succeeded`)
    } catch (err) {
        console.error('bulkRejectOutputs error:', err)
        return fail(c, 'Failed bulk reject', 500)
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/edit ──
// User edits content before approval (preserves original)
export const editOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const { content, comment } = await c.req.json<{ content?: string; comment?: string }>()

        if (!content && !comment) return fail(c, 'Content or comment is required', 400)

        const [existing] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
        if (!existing) return fail(c, 'Output not found', 404)

        const existingMeta = (existing.metadata as Record<string, unknown>) || {}
        const editHistory = (existingMeta.editHistory as Array<unknown>) || []
        editHistory.push({
            comment: comment || null,
            editedAt: new Date().toISOString(),
            previousContent: existing.editedContent || existing.content,
        })

        const [updated] = await db.update(agentOutputs)
            .set({
                editedContent: content || existing.editedContent || existing.content,
                metadata: { ...existingMeta, editHistory, lastComment: comment },
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, outputId))
            .returning()

        console.log(`Output ${outputId} edited${comment ? ': ' + comment.substring(0, 50) : ''}`)

        // If comment provided, trigger agent re-generation
        if (comment && existing.agentRole) {
            // Queue a revision request — will be picked up by revision service
            const revisionId = generateId()
            await db.insert(agentOutputs).values({
                id: revisionId,
                instanceId: existing.instanceId,
                // Phase 2.3.C — revision lives in the same agent's queue
                agentId: (existing as { agentId: string | null | undefined | null }).agentId || null,
                agentRole: existing.agentRole,
                outputType: existing.outputType,
                title: '(תיקון) ' + existing.title,
                content: null, // Will be filled by agent
                platform: existing.platform,
                scheduledFor: existing.scheduledFor,
                metadata: {
                    revisionOf: outputId,
                    revisionComment: comment,
                    originalContent: existing.editedContent || existing.content,
                    status: 'revision_pending',
                },
                status: 'pending_review',
            })
            console.log(`Revision ${revisionId} queued for output ${outputId}: ${comment.substring(0, 50)}`)
        }

        return ok(c, updated, comment ? 'התיקון נשלח לסוכן — גרסה חדשה תופיע בקרוב' : 'Output edited')
    } catch (err) {
        console.error('editOutput error:', err)
        return fail(c, 'Failed to edit', 500)
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/publish ──
// Publishes to the connected platform (Telegram, etc.)
export const publishOutput = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const outputId = c.req.param('outputId')

        const [output] = await db.select()
            .from(agentOutputs)
            .where(and(
                eq(agentOutputs.id, outputId),
                eq(agentOutputs.status, 'approved')
            ))

        if (!output) return fail(c, 'Output not found or not approved', 404)

        // Get instance for platform credentials
        const [instance] = await db.select()
            .from(instances)
            .where(eq(instances.id, instanceId))

        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance has no IP', 400)

        // Per-agent: publish with the credentials of the agent that OWNS this
        // output (a secondary brand publishes to its own Meta/GitHub account),
        // falling back to the instance/primary mirror.
        const __pubAgent = output.agentId
            ? await (await import('@/services/agentContext')).resolveAgentById(instanceId, output.agentId)
            : null

        const content = output.editedContent || output.content || ''
        const platform = output.platform || 'telegram'
        let publishSuccess = false
        let publishError = ''
        let publishErrorType: 'missing_integration' | 'api_error' | 'network_error' | '' = ''
        let channelPostId = '' // captured platform-native post id for downstream metrics collection
        let channelPostUrl = ''

        // ── Telegram publish ──
        if (platform === 'telegram') {
            if (!instance.telegramBotToken) {
                publishError = 'בוט Telegram לא מחובר. חברו בוט בהגדרות תוספים → ערוצי תקשורת → Telegram.'
                publishErrorType = 'missing_integration'
            } else {
                const telegramChatId = await ensureTelegramChatId(instance)
                if (!telegramChatId) {
                    publishError = 'Chat ID לא נמצא. שלחו /start לבוט @' + (instance.telegramBotToken ? 'הבוט שלכם' : '') + ' ונסו שוב.'
                    publishErrorType = 'missing_integration'
                } else {
                    try {
                        const tgRes = await fetch(`https://api.telegram.org/bot${instance.telegramBotToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: telegramChatId,
                                text: content.substring(0, 4096),
                                parse_mode: 'Markdown',
                            }),
                        })
                        const tgData = await tgRes.json() as { ok?: boolean; description?: string; result?: { message_id?: number; chat?: { id?: number } } }
                        if (tgData.ok) {
                            publishSuccess = true
                            if (tgData.result?.message_id && tgData.result?.chat?.id) {
                                channelPostId = `${tgData.result.chat.id}/${tgData.result.message_id}`
                            }
                        } else {
                            publishError = `Telegram API: ${tgData.description || 'unknown error'}`
                            publishErrorType = 'api_error'
                        }
                    } catch (tgErr) {
                        publishError = `שגיאת רשת: ${String(tgErr).substring(0, 100)}`
                        publishErrorType = 'network_error'
                    }
                }
            }
        }

        // ── Instagram / Facebook / Meta publish ──
        else if (platform === 'instagram' || platform === 'facebook' || platform === 'meta_ads') {
            const metaTokens = ((__pubAgent as { metaTokens?: unknown } | null)?.metaTokens || instance.metaTokens) as any
            if (!metaTokens || metaTokens.status !== 'connected') {
                publishError = 'Meta Ads לא מחובר. חברו בהגדרות תוספים → ערוצי פרסום → Meta Ads.'
                publishErrorType = 'missing_integration'
            } else if (platform === 'instagram' && !metaTokens.instagramAccountId) {
                publishError = 'חשבון Instagram לא מקושר. קשרו את האינסטגרם לדף הפייסבוק ב-Meta Business Suite.'
                publishErrorType = 'missing_integration'
            } else {
                try {
                    if (platform === 'instagram' && metaTokens.instagramAccountId) {
                        // Instagram publish: create container → publish
                        // For now: image + caption. TODO: carousel, reels
                        const igId = metaTokens.instagramAccountId
                        const pageToken = metaTokens.pageAccessToken

                        if (output.mediaUrl) {
                            // Image post
                            const containerRes = await fetch(
                                `https://graph.facebook.com/v21.0/${igId}/media`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        image_url: output.mediaUrl,
                                        caption: content.substring(0, 2200),
                                        access_token: pageToken,
                                    }),
                                }
                            )
                            const containerData = await containerRes.json() as { id?: string; error?: any }
                            if (containerData.id) {
                                const publishRes = await fetch(
                                    `https://graph.facebook.com/v21.0/${igId}/media_publish`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            creation_id: containerData.id,
                                            access_token: pageToken,
                                        }),
                                    }
                                )
                                const publishData = await publishRes.json() as { id?: string; error?: any }
                                if (publishData.id) {
                                    publishSuccess = true
                                    channelPostId = publishData.id
                                    channelPostUrl = `https://www.instagram.com/p/${publishData.id}/`
                                } else {
                                    publishError = `Instagram publish: ${publishData.error?.message || 'unknown'}`
                                    publishErrorType = 'api_error'
                                }
                            } else {
                                publishError = `Instagram container: ${containerData.error?.message || 'unknown'}`
                                publishErrorType = 'api_error'
                            }
                        } else {
                            publishError = 'פוסט Instagram דורש תמונה. הוסיפו מדיה לפני פרסום.'
                            publishErrorType = 'missing_integration'
                        }
                    } else {
                        // Facebook page post
                        const pageId = metaTokens.pageId
                        const pageToken = metaTokens.pageAccessToken

                        if (!pageId || !pageToken) {
                            publishError = 'דף פייסבוק לא נמצא. בדקו את החיבור ב-Meta Ads.'
                            publishErrorType = 'missing_integration'
                        } else {
                            const fbRes = await fetch(
                                `https://graph.facebook.com/v21.0/${pageId}/feed`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        message: content.substring(0, 63206),
                                        access_token: pageToken,
                                    }),
                                }
                            )
                            const fbData = await fbRes.json() as { id?: string; error?: any }
                            if (fbData.id) {
                                publishSuccess = true
                                channelPostId = fbData.id
                                // Facebook returns "pageId_postId" — URL uses raw post id part
                                const postIdPart = fbData.id.includes('_') ? fbData.id.split('_')[1] : fbData.id
                                channelPostUrl = `https://www.facebook.com/${pageId}/posts/${postIdPart}`
                            } else {
                                publishError = `Facebook: ${fbData.error?.message || 'unknown'}`
                                publishErrorType = 'api_error'
                            }
                        }
                    }
                } catch (metaErr) {
                    publishError = `Meta: ${String(metaErr).substring(0, 150)}`
                    publishErrorType = 'api_error'
                }
            }
        }

        // ── LinkedIn organic post ──
        else if (platform === 'linkedin') {
            try {
                const { agentIntegrations } = await import('@/db/schema')
                const [cfg] = await db.select().from(agentIntegrations)
                    .where(and(
                        eq(agentIntegrations.instanceId, instance.id),
                        eq(agentIntegrations.integrationType, 'linkedin'),
                    ))
                const cfgData = (cfg?.config as any) || {}
                if (!cfg || cfg.status !== 'connected' || !cfgData.accessToken) {
                    publishError = 'LinkedIn לא מחובר. חברו בהגדרות תוספים → LinkedIn.'
                    publishErrorType = 'missing_integration'
                } else {
                    // authorUrn e.g. "urn:li:person:abc123" or "urn:li:organization:987"
                    const authorUrn = cfgData.authorUrn || cfgData.personUrn || cfgData.organizationUrn
                    if (!authorUrn) {
                        publishError = 'LinkedIn author URN חסר. הרשאו חיבור מחדש.'
                        publishErrorType = 'missing_integration'
                    } else {
                        // LinkedIn v2 /rest/posts API — text-only post with optional media URL
                        // Posts API docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
                        const postBody: any = {
                            author: authorUrn,
                            commentary: content.substring(0, 3000),  // LinkedIn cap
                            visibility: 'PUBLIC',
                            distribution: {
                                feedDistribution: 'MAIN_FEED',
                                targetEntities: [],
                                thirdPartyDistributionChannels: [],
                            },
                            lifecycleState: 'PUBLISHED',
                            isReshareDisabledByAuthor: false,
                        }
                        const liRes = await fetch('https://api.linkedin.com/rest/posts', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${cfgData.accessToken}`,
                                'LinkedIn-Version': '202411',
                                'X-Restli-Protocol-Version': '2.0.0',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(postBody),
                        })
                        if (liRes.ok) {
                            const postUrn = liRes.headers.get('x-restli-id') || ''
                            publishSuccess = true
                            channelPostId = postUrn
                            // LinkedIn URN format: urn:li:share:1234567890 — public URL:
                            const shareId = postUrn.split(':').pop() || ''
                            channelPostUrl = shareId ? `https://www.linkedin.com/feed/update/urn:li:share:${shareId}/` : ''
                        } else {
                            const errBody = await liRes.text()
                            publishError = `LinkedIn (${liRes.status}): ${errBody.substring(0, 200)}`
                            publishErrorType = 'api_error'
                        }
                    }
                }
            } catch (liErr) {
                publishError = `LinkedIn: ${String(liErr).substring(0, 150)}`
                publishErrorType = 'api_error'
            }
        }

        // ── Twitter/X (coming soon — requires Twitter API v2 + OAuth) ──
        else if (platform === 'twitter') {
            publishError = 'Twitter/X בקרוב — צריך OAuth API v2. בינתיים השתמשו ב-Export לקבלת תוכן מוכן להדבקה.'
            publishErrorType = 'missing_integration'
        }

        // ── Reddit organic post ──
        else if (platform === 'reddit') {
            try {
                const { agentIntegrations } = await import('@/db/schema')
                const [cfg] = await db.select().from(agentIntegrations)
                    .where(and(
                        eq(agentIntegrations.instanceId, instance.id),
                        eq(agentIntegrations.integrationType, 'reddit'),
                    ))
                const cfgData = (cfg?.config as any) || {}
                if (!cfg || cfg.status !== 'connected' || !cfgData.accessToken) {
                    publishError = 'Reddit לא מחובר. חברו בהגדרות תוספים → Reddit.'
                    publishErrorType = 'missing_integration'
                } else {
                    // Subreddit comes from content plan metadata or a default in integration config
                    const outMd = (output.metadata as any) || {}
                    const subreddit = outMd.subreddit || cfgData.defaultSubreddit
                    if (!subreddit) {
                        publishError = 'Reddit: חסרה subreddit. ציינו ב-metadata.subreddit.'
                        publishErrorType = 'missing_integration'
                    } else {
                        const form = new URLSearchParams({
                            sr: String(subreddit),
                            kind: 'self',
                            title: (output.title || 'Post').substring(0, 300),
                            text: content.substring(0, 40000),
                            api_type: 'json',
                            resubmit: 'true',
                            sendreplies: 'true',
                        })
                        const rdRes = await fetch('https://oauth.reddit.com/api/submit', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${cfgData.accessToken}`,
                                'User-Agent': cfgData.userAgent || 'Flowmatic/1.0',
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: form.toString(),
                        })
                        const rdJson = await rdRes.json() as any
                        const url = rdJson?.json?.data?.url
                        const fullname = rdJson?.json?.data?.name
                        if (rdRes.ok && url) {
                            publishSuccess = true
                            channelPostId = fullname || ''
                            channelPostUrl = url
                        } else {
                            const errText = JSON.stringify(rdJson?.json?.errors || rdJson).substring(0, 200)
                            publishError = `Reddit (${rdRes.status}): ${errText}`
                            publishErrorType = 'api_error'
                        }
                    }
                }
            } catch (rdErr) {
                publishError = `Reddit: ${String(rdErr).substring(0, 150)}`
                publishErrorType = 'api_error'
            }
        }

        // ── YouTube (deferred — requires video file + resumable upload) ──
        else if (platform === 'youtube') {
            publishError = 'YouTube פרסום אוטונומי דורש קובץ וידאו + Resumable Upload. בינתיים השתמשו ב-Export לקבלת title/description/tags מוכנים להדבקה.'
            publishErrorType = 'missing_integration'
        }

        // ── Blog/WordPress publish ──
        else if (platform === 'blog' || platform === 'wordpress') {
            // Read WordPress config from VPS
            try {
                const wpConfigRaw = await sshExecForPublish(instance.ip,
                    `cat /home/openclaw/.openclaw/skills-config/wordpress.json 2>/dev/null`,
                    instance.rootPassword || undefined
                )

                if (!wpConfigRaw || wpConfigRaw.trim().length < 10) {
                    publishError = 'WordPress לא מחובר. חברו בהגדרות תוספים → ערוצי פרסום → WordPress.'
                    publishErrorType = 'missing_integration'
                } else {
                    // Phase 4.3-R: accept BOTH writer shapes ({user, appPassword}
                    // and {username, password}) so this publisher can never
                    // crash when integrationGate accepts an alternate shape.
                    // Same defensive read as integrationGate.ts.
                    const wpConfig = JSON.parse(wpConfigRaw) as {
                        url?: string;
                        user?: string;
                        username?: string;
                        appPassword?: string;
                        password?: string;
                    }
                    const wpUser = wpConfig.user || wpConfig.username
                    const wpPass = wpConfig.appPassword || wpConfig.password
                    if (!wpConfig.url || !wpUser || !wpPass) {
                        publishError = 'הגדרות WordPress חסרות. בדקו URL, שם משתמש ו-Application Password.'
                        publishErrorType = 'missing_integration'
                    } else {
                        // WordPress REST API — professional post with SEO + featured media
                        const wpUrl = wpConfig.url.replace(/\/$/, '')
                        const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64')

                        // Pull SEO extras + featured image from agent_output metadata
                        const outMeta = (output.metadata as any) || {}
                        const seo = (outMeta.seo as any) || {}
                        const itemId = outMeta.contentPlanItemId as string | undefined

                        // Convert markdown → HTML with heading + list + FAQ block support
                        const mdToHtml = (md: string): string => {
                            const html = md
                                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                                .replace(/\n\n/g, '</p><p>')
                                .replace(/\n/g, '<br>')
                            return '<p>' + html + '</p>'
                        }
                        let htmlContent = mdToHtml(content)

                        // Append FAQ block if present (great for AEO / Google's People Also Ask)
                        if (Array.isArray(seo.faq) && seo.faq.length) {
                            htmlContent += '<h2>שאלות נפוצות</h2>'
                            for (const q of seo.faq) {
                                htmlContent += `<h3>${String(q.question).replace(/</g, '&lt;')}</h3><p>${String(q.answer).replace(/</g, '&lt;')}</p>`
                            }
                        }

                        // Inject JSON-LD Article + FAQPage schema at the bottom
                        const schemas: unknown[] = []
                        if (seo.schemaJsonLd && typeof seo.schemaJsonLd === 'object') {
                            schemas.push(seo.schemaJsonLd)
                        }
                        if (Array.isArray(seo.faq) && seo.faq.length) {
                            schemas.push({
                                '@context': 'https://schema.org', '@type': 'FAQPage',
                                mainEntity: seo.faq.map((q: any) => ({
                                    '@type': 'Question', name: q.question,
                                    acceptedAnswer: { '@type': 'Answer', text: q.answer },
                                })),
                            })
                        }
                        if (schemas.length > 0) {
                            htmlContent += '<script type="application/ld+json">' +
                                JSON.stringify(schemas.length === 1 ? schemas[0] : schemas) + '</script>'
                        }

                        // Step 1: if we have a featured image, upload it first and get its ID
                        let featuredMediaId: number | undefined
                        if (itemId) {
                            try {
                                const { contentPlanMedia } = await import('@/db/schema')
                                const media = await db.select().from(contentPlanMedia)
                                    .where(eq(contentPlanMedia.contentPlanItemId, itemId))
                                const chosen = media.find(m => m.status === 'approved')
                                    || media.find(m => m.status === 'ready')
                                    || media[0]
                                if (chosen?.publicUrl) {
                                    const imgBytes = await fetch(chosen.publicUrl).then(r => r.ok ? r.arrayBuffer() : null)
                                    if (imgBytes) {
                                        const filename = `featured-${Date.now()}.jpg`
                                        const mediaRes = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'image/jpeg',
                                                'Content-Disposition': `attachment; filename="${filename}"`,
                                                'Authorization': `Basic ${auth}`,
                                            },
                                            body: imgBytes,
                                        })
                                        if (mediaRes.ok) {
                                            const mediaJson = await mediaRes.json() as { id?: number }
                                            featuredMediaId = mediaJson.id
                                        } else {
                                            console.warn(`[wp-publish] media upload failed: ${mediaRes.status}`)
                                        }
                                    }
                                }
                            } catch (mediaErr) {
                                console.warn('[wp-publish] featured media non-fatal error:', (mediaErr as Error).message)
                            }
                        }

                        // Step 2: resolve category + tag slugs → IDs (WP REST requires IDs, not names)
                        const resolveTaxonomyIds = async (taxonomy: 'categories' | 'tags', names: string[]): Promise<number[]> => {
                            if (!names.length) return []
                            const ids: number[] = []
                            for (const name of names) {
                                try {
                                    // Try to find existing
                                    const findRes = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=5`, {
                                        headers: { 'Authorization': `Basic ${auth}` },
                                    })
                                    if (findRes.ok) {
                                        const found = await findRes.json() as Array<{ id: number; name: string; slug: string }>
                                        const exact = found.find(f => f.name === name || f.slug === name.toLowerCase())
                                        if (exact) { ids.push(exact.id); continue }
                                    }
                                    // Create new
                                    const createRes = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomy}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                                        body: JSON.stringify({ name }),
                                    })
                                    if (createRes.ok) {
                                        const created = await createRes.json() as { id: number }
                                        if (created.id) ids.push(created.id)
                                    }
                                } catch {
                                    // Non-fatal per name — keep going
                                }
                            }
                            return ids
                        }

                        const categoryIds = Array.isArray(seo.categories) ? await resolveTaxonomyIds('categories', seo.categories) : []
                        const tagIds = Array.isArray(seo.tags) ? await resolveTaxonomyIds('tags', seo.tags) : []

                        // Step 3: determine status — 'future' if scheduledFor in future, else 'publish'
                        const scheduledFor = output.scheduledFor ? new Date(output.scheduledFor) : null
                        const isFuture = scheduledFor && scheduledFor.getTime() > Date.now() + 5 * 60 * 1000
                        const postStatus = isFuture ? 'future' : 'publish'

                        // Step 4: assemble post payload with Yoast + Rank Math meta fields
                        const postPayload: Record<string, unknown> = {
                            title: output.title,
                            content: htmlContent,
                            status: postStatus,
                            slug: seo.slug || undefined,
                            excerpt: seo.excerpt || seo.metaDescription || undefined,
                            categories: categoryIds.length ? categoryIds : undefined,
                            tags: tagIds.length ? tagIds : undefined,
                            featured_media: featuredMediaId || undefined,
                            date: isFuture && scheduledFor ? scheduledFor.toISOString() : undefined,
                            // SEO meta via core `meta`. The old `yoast_meta` wrapper
                            // NEVER worked — Yoast doesn't register it as writable, so
                            // WP returned 200 and silently dropped it. These underscore/
                            // custom keys are protected and only REST-writable because the
                            // Flowmatic companion plugin v1.7.0+ registers them with
                            // show_in_rest. The active SEO plugin reads its own keys.
                            // (Verified 2026-06-01 on packing-station — see seoMetaBatch.)
                            meta: seo.metaDescription ? {
                                _yoast_wpseo_metadesc: seo.metaDescription,
                                _yoast_wpseo_focuskw: seo.primaryKeyword || undefined,
                                _yoast_wpseo_title: output.title,
                                rank_math_description: seo.metaDescription,
                                rank_math_focus_keyword: seo.primaryKeyword || undefined,
                                rank_math_title: output.title,
                            } : undefined,
                        }
                        // Strip undefined
                        for (const k of Object.keys(postPayload)) {
                            if (postPayload[k] === undefined) delete postPayload[k]
                        }

                        const wpRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                            body: JSON.stringify(postPayload),
                        })

                        if (wpRes.ok) {
                            const wpData = await wpRes.json() as { id?: number; link?: string }
                            publishSuccess = true
                            if (wpData.id) channelPostId = String(wpData.id)
                            if (wpData.link) channelPostUrl = wpData.link
                            console.log(`Published to WordPress: post ${wpData.id} at ${wpData.link} (status=${postStatus}, featured=${featuredMediaId || 'none'}, cats=${categoryIds.length}, tags=${tagIds.length})`)
                        } else {
                            const wpErr = await wpRes.text()
                            publishError = `WordPress API (${wpRes.status}): ${wpErr.substring(0, 150)}`
                            publishErrorType = 'api_error'
                        }
                    }
                }
            } catch (wpErr) {
                publishError = `WordPress: ${String(wpErr).substring(0, 150)}`
                publishErrorType = 'api_error'
            }
        }

        // ── Google Ads campaign creation ──
        else if (platform === 'google_ads' || (output.outputType === 'google_ads_campaign')) {
            const googleTokens = instance.googleTokens as GoogleTokens | null
            const scopes = (googleTokens as any)?.scopes || []

            if (!googleTokens) {
                publishError = 'Google Workspace לא מחובר. חברו בהגדרות תוספים → כלי עבודה → Google Workspace.'
                publishErrorType = 'missing_integration'
            } else if (!scopes.includes('ads')) {
                publishError = 'Google Ads לא מורשה. הוסיפו הרשאת Google Ads ב-Google Workspace → ⚙ שנו שירותים → סמנו Google Ads.'
                publishErrorType = 'missing_integration'
            } else if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
                publishError = 'Developer Token לא מוגדר. נדרש הגדרת GOOGLE_ADS_DEVELOPER_TOKEN בשרת.'
                publishErrorType = 'api_error'
            } else {
                // Parse campaign plan from metadata
                const meta = (output.metadata as Record<string, unknown>) || {}
                const campaignPlan = meta as unknown as CampaignPlan

                if (!campaignPlan.campaignType || !campaignPlan.keywords) {
                    publishError = 'תוכנית הקמפיין חסרה נתונים. ודאו שהסוכן יצר תוכנית מלאה.'
                    publishErrorType = 'api_error'
                } else {
                    try {
                        // Need customer_id — stored in googleTokens or metadata
                        const adsCustomerId = (meta.adsCustomerId as string) || (googleTokens as any).adsCustomerId
                        if (!adsCustomerId) {
                            publishError = 'חסר Google Ads Customer ID. הזינו אותו בהגדרות Google Ads.'
                            publishErrorType = 'missing_integration'
                        } else {
                            const result = await createCampaign(
                                adsCustomerId,
                                googleTokens,
                                campaignPlan
                            )

                            if (result.status === 'SUCCESS' || result.status === 'PARTIAL') {
                                publishSuccess = true
                                if (result.errors.length > 0) {
                                    console.warn(`Google Ads partial success: ${result.errors.join('; ')}`)
                                }
                            } else {
                                publishError = `Google Ads: ${result.errors.join('; ')}`
                                publishErrorType = 'api_error'
                            }
                        }
                    } catch (adsErr) {
                        publishError = `Google Ads API: ${String(adsErr).substring(0, 200)}`
                        publishErrorType = 'api_error'
                    }
                }
            }
        }

        // ── Newsletter (Resend) ──
        else if (platform === 'newsletter' || platform === 'email') {
            try {
                const resendConfigRaw = await sshExecForPublish(instance.ip,
                    `cat /home/openclaw/.openclaw/skills-config/resend.json 2>/dev/null`,
                    instance.rootPassword || undefined
                )

                if (!resendConfigRaw || resendConfigRaw.trim().length < 5) {
                    publishError = 'Resend לא מחובר. הגדירו API key בהגדרות תוספים → ערוצי תקשורת → Resend.'
                    publishErrorType = 'missing_integration'
                } else {
                    const resendConfig = JSON.parse(resendConfigRaw) as { apiKey: string }
                    if (!resendConfig.apiKey) {
                        publishError = 'Resend API key חסר.'
                        publishErrorType = 'missing_integration'
                    } else {
                        // Build email HTML from content
                        let htmlBody = content
                            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n\n/g, '</p><p>')
                            .replace(/\n/g, '<br>')
                        htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;direction:rtl;text-align:right"><p>${htmlBody}</p></div>`

                        const meta = (output.metadata as Record<string, unknown>) || {}
                        let recipients = (meta.recipients as string[]) || []

                        // If no recipients in metadata, read from VPS config
                        if (recipients.length === 0) {
                            const recipientsRaw = await sshExecForPublish(instance.ip,
                                `cat /home/openclaw/.openclaw/skills-config/newsletter-recipients.json 2>/dev/null`,
                                instance.rootPassword || undefined
                            )
                            if (recipientsRaw) {
                                try {
                                    const recipientsConfig = JSON.parse(recipientsRaw) as { emails?: string[]; fromEmail?: string; fromName?: string }
                                    recipients = recipientsConfig.emails || []
                                } catch { /* invalid json */ }
                            }
                        }

                        const fromEmail = (meta.fromEmail as string) || 'newsletter@flowmatic.co.il'
                        const fromName = (meta.fromName as string) || 'Flowmatic'

                        if (recipients.length === 0) {
                            publishError = 'אין נמענים לניוזלטר. הוסיפו רשימת אימיילים בהגדרות תוספים → ערוצי פרסום → ניוזלטר.'
                            publishErrorType = 'missing_integration'
                        } else {
                            const resendRes = await fetch('https://api.resend.com/emails', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${resendConfig.apiKey}`,
                                },
                                body: JSON.stringify({
                                    from: `${fromName} <${fromEmail}>`,
                                    to: recipients,
                                    subject: output.title,
                                    html: htmlBody,
                                }),
                            })

                            if (resendRes.ok) {
                                publishSuccess = true
                                console.log(`Newsletter sent via Resend: ${recipients.length} recipients`)
                            } else {
                                const resendErr = await resendRes.text()
                                publishError = `Resend API (${resendRes.status}): ${resendErr.substring(0, 150)}`
                                publishErrorType = 'api_error'
                            }
                        }
                    }
                }
            } catch (nlErr) {
                publishError = `Newsletter: ${String(nlErr).substring(0, 150)}`
                publishErrorType = 'api_error'
            }
        }

        // ── Unknown platform ──
        else {
            publishError = `ערוץ "${platform}" לא נתמך כרגע.`
            publishErrorType = 'missing_integration'
        }

        // Update status based on result
        const existingMeta = (output.metadata as Record<string, unknown>) || {}

        if (publishSuccess) {
            const publishedAtDate = new Date()
            const publishedAtIso = publishedAtDate.toISOString()
            const [updated] = await db.update(agentOutputs)
                .set({
                    status: 'published',
                    publishedAt: publishedAtDate,
                    updatedAt: publishedAtDate,
                    metadata: {
                        ...existingMeta,
                        publishedTo: platform,
                        publishedAt: publishedAtIso,
                        channelPostId: channelPostId || undefined,
                        channelPostUrl: channelPostUrl || undefined,
                    },
                })
                .where(eq(agentOutputs.id, outputId))
                .returning()

            // Sync to content plan item when the output is linked to one.
            // Agents emit metadata.contentPlanItemId when they produce content
            // for a specific planned slot; we write back channelPostId + publishedAt
            // so the metrics collector can pull insights later.
            const cpItemId = (existingMeta as any)?.contentPlanItemId as string | undefined
            if (cpItemId && channelPostId) {
                try {
                    const __pubAgent = await resolveActiveAgent(c, instanceId)
                    const rd = await readResearchData(__pubAgent, instanceId) as any
                    const plan = Array.isArray(rd.contentPlan) ? rd.contentPlan : []
                    const idx = plan.findIndex((p: any) => p.id === cpItemId)
                    if (idx >= 0) {
                        plan[idx] = {
                            ...plan[idx],
                            status: 'published',
                            publishedAt: publishedAtIso,
                            channelPostId,
                            ...(channelPostUrl ? { channelPostUrl } : {}),
                        }
                        await writeResearchData(__pubAgent, instanceId, { ...rd, contentPlan: plan })
                        console.log(`Content plan item ${cpItemId} marked published with channelPostId=${channelPostId}`)
                    }
                } catch (syncErr) {
                    console.warn(`Plan item sync failed for ${cpItemId}:`, (syncErr as Error).message)
                }
            }

            console.log(`Output ${outputId} published to ${platform} (channelPostId=${channelPostId || 'n/a'})`)

            // Mirror "published" status into the Telegram approval message
            import('@/services/approvalQueueTelegram').then(m =>
                m.updateApprovalQueueMessage(outputId)
            ).catch(() => { /* non-fatal */ })

            return ok(c, updated, 'פורסם בהצלחה!')
        } else {
            // Save failure info but keep status as approved (recoverable)
            await db.update(agentOutputs)
                .set({
                    updatedAt: new Date(),
                    metadata: {
                        ...existingMeta,
                        lastPublishError: publishError,
                        lastPublishErrorType: publishErrorType,
                        lastPublishAttempt: new Date().toISOString(),
                    },
                })
                .where(eq(agentOutputs.id, outputId))

            console.error(`Publish failed for ${outputId}: ${publishError}`)

            // Mode B fallback: if the only issue is a missing integration, hand
            // the user a ready-to-paste export instead of a dead-end error.
            if (publishErrorType === 'missing_integration') {
                return c.json({
                    success: false,
                    message: publishError,
                    manualMode: true,
                    manualExportUrl: `/hosting/instances/${instanceId}/outputs/${outputId}/export?format=auto`,
                    platformGuideKey: platform,    // UI maps to PUBLISH_GUIDES[platformGuideKey]
                    helpText: 'החיבור לא פעיל — אפשר להוריד את התוכן מוכן להדבקה ידנית.',
                }, 422)
            }
            return fail(c, publishError, 422)
        }
    } catch (err) {
        console.error('publishOutput error:', err)
        return fail(c, 'Failed to publish', 500)
    }
}

// ── PATCH /hosting/instances/:id/outputs/:outputId/archive ──
export const archiveOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')

        const [updated] = await db.update(agentOutputs)
            .set({
                status: 'archived',
                updatedAt: new Date(),
            })
            .where(eq(agentOutputs.id, outputId))
            .returning()

        if (!updated) return fail(c, 'Output not found', 404)

        import('@/services/approvalQueueTelegram').then(m =>
            m.updateApprovalQueueMessage(outputId)
        ).catch(() => { /* non-fatal */ })

        return ok(c, updated, 'Output archived')
    } catch (err) {
        console.error('archiveOutput error:', err)
        return fail(c, 'Failed to archive', 500)
    }
}

// ── DELETE /hosting/instances/:id/outputs/:outputId ──
export const deleteOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')

        // Only allow deleting archived outputs
        const [existing] = await db.select()
            .from(agentOutputs)
            .where(eq(agentOutputs.id, outputId))

        if (!existing) return fail(c, 'Output not found', 404)
        if (existing.status !== 'archived') return fail(c, 'ניתן למחוק רק פריטים בארכיון', 400)

        await db.delete(agentOutputs).where(eq(agentOutputs.id, outputId))
        return ok(c, null, 'Output deleted')
    } catch (err) {
        console.error('deleteOutput error:', err)
        return fail(c, 'Failed to delete', 500)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /hosting/instances/:id/outputs/:outputId/export?format=mdx|wordpress
// Mode-B fallback: when the user hasn't connected GitHub / WordPress / email
// etc., we still need to give them something to paste. Returns:
//   - mdx       : full file with YAML frontmatter + body + JSON-LD (ready for
//                 any static site: Next/Astro/Hugo/Gatsby)
//   - wordpress : HTML body + separate metadata block (paste each field
//                 into the WP editor manually)
//   - plaintext : copy-paste-ready text for social posts
//   - instructions: step-by-step Hebrew guide specific to the channel
// ─────────────────────────────────────────────────────────────────────────────
export const exportOutput = async (c: Context<HonoEnv>) => {
    try {
        const outputId = c.req.param('outputId')
        const format = (c.req.query('format') || 'auto').toLowerCase()

        const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
        if (!output) return fail(c, 'Output not found', 404)

        const md = (output.metadata as any) || {}
        const seo = (md.seo as any) || {}
        const itemId = md.contentPlanItemId as string | undefined
        const channel = output.platform || 'unknown'

        // Featured image lookup (first approved/ready render for this plan item)
        let featuredImage: string | undefined
        if (itemId) {
            const { contentPlanMedia } = await import('@/db/schema')
            const media = await db.select().from(contentPlanMedia)
                .where(eq(contentPlanMedia.contentPlanItemId, itemId))
            const chosen = media.find(m => m.status === 'approved')
                || media.find(m => m.status === 'ready')
                || media[0]
            if (chosen?.publicUrl) featuredImage = chosen.publicUrl
        }

        // Auto-pick format if not specified
        const isArticle = output.outputType === 'blog_article' || channel === 'blog'
        const effectiveFormat = format === 'auto' ? (isArticle ? 'mdx' : 'plaintext') : format

        // ─── MDX: full file for static-site repos ───
        if (effectiveFormat === 'mdx') {
            const esc = (s: string) => String(s).replace(/'/g, "''")
            const fm: string[] = ['---']
            fm.push(`title: '${esc(output.title || '')}'`)
            if (seo.slug) fm.push(`slug: '${esc(seo.slug)}'`)
            fm.push(`date: '${(output.scheduledFor || output.createdAt || new Date()).toISOString().slice(0, 10)}'`)
            fm.push(`lang: 'he'`)
            if (seo.metaDescription) fm.push(`description: '${esc(seo.metaDescription)}'`)
            if (seo.excerpt) fm.push(`excerpt: '${esc(seo.excerpt)}'`)
            if (seo.primaryKeyword) fm.push(`primaryKeyword: '${esc(seo.primaryKeyword)}'`)
            if (Array.isArray(seo.secondaryKeywords) && seo.secondaryKeywords.length) {
                fm.push(`secondaryKeywords:`)
                for (const k of seo.secondaryKeywords) fm.push(`  - '${esc(k)}'`)
            }
            if (Array.isArray(seo.categories)) {
                fm.push(`categories:`)
                for (const cc of seo.categories) fm.push(`  - '${esc(cc)}'`)
            }
            if (Array.isArray(seo.tags)) {
                fm.push(`tags:`)
                for (const t of seo.tags) fm.push(`  - '${esc(t)}'`)
            }
            if (featuredImage) fm.push(`featuredImage: '${esc(featuredImage)}'`)
            fm.push('---', '', output.content || '')

            if (Array.isArray(seo.faq) && seo.faq.length) {
                fm.push('', '## שאלות נפוצות')
                for (const q of seo.faq) fm.push('', `### ${q.question}`, '', q.answer)
            }
            const schemas: unknown[] = []
            if (seo.schemaJsonLd) schemas.push({ ...seo.schemaJsonLd, ...(featuredImage ? { image: featuredImage } : {}) })
            if (Array.isArray(seo.faq) && seo.faq.length) {
                schemas.push({
                    '@context': 'https://schema.org', '@type': 'FAQPage',
                    mainEntity: seo.faq.map((q: any) => ({
                        '@type': 'Question', name: q.question,
                        acceptedAnswer: { '@type': 'Answer', text: q.answer },
                    })),
                })
            }
            if (schemas.length) {
                fm.push('', '<script type="application/ld+json">',
                    JSON.stringify(schemas.length === 1 ? schemas[0] : schemas, null, 2),
                    '</script>')
            }
            return ok(c, {
                format: 'mdx',
                filename: (seo.slug || `post-${outputId}`) + '.mdx',
                content: fm.join('\n') + '\n',
                featuredImageUrl: featuredImage,
                instructions: [
                    '1. שמרו את הקובץ בתיקיית content/blog/ של ה-repo (או היכן שהסטטיק-סייט מצפה).',
                    '2. הקפידו ש-slug בשם הקובץ תואם לפילד slug ב-frontmatter.',
                    '3. אם השתמשתם בתמונה ראשית — הורידו מ-URL לעיל ושימרו ליד הקובץ או ב-CDN.',
                    '4. Commit + push. הסטטיק-סייט יבנה אוטומטית.',
                ],
            }, 'MDX export ready')
        }

        // ─── WordPress manual copy: HTML + separate metadata block ───
        if (effectiveFormat === 'wordpress') {
            const mdToHtml = (s: string) => s
                .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
            let html = '<p>' + mdToHtml(output.content || '') + '</p>'
            if (Array.isArray(seo.faq) && seo.faq.length) {
                html += '<h2>שאלות נפוצות</h2>'
                for (const q of seo.faq) html += `<h3>${q.question}</h3><p>${q.answer}</p>`
            }
            return ok(c, {
                format: 'wordpress',
                title: output.title,
                slug: seo.slug,
                html,
                metaDescription: seo.metaDescription,
                focusKeyword: seo.primaryKeyword,
                excerpt: seo.excerpt,
                categories: seo.categories || [],
                tags: seo.tags || [],
                featuredImageUrl: featuredImage,
                instructions: [
                    '1. היכנסו ל-WordPress Admin → Posts → Add New.',
                    '2. הדביקו את ה-title למעלה.',
                    '3. עברו ל-"Code editor" (⋮ מימין-למעלה) והדביקו את ה-html.',
                    '4. תחת "Settings":',
                    '   · Slug: הדביקו את הערך.',
                    '   · Categories + Tags: הוסיפו מהרשימה (צרו אם חסר).',
                    '   · Featured image: הורידו את התמונה מ-URL לעיל ← Upload.',
                    '5. אם מותקן Yoast SEO / Rank Math — הדביקו:',
                    '   · Meta description = metaDescription',
                    '   · Focus keyword = focusKeyword',
                    '6. לחצו Publish (או Schedule לפי הצורך).',
                ],
            }, 'WordPress export ready')
        }

        // ─── Plaintext: social posts, emails ───
        return ok(c, {
            format: 'plaintext',
            title: output.title,
            content: output.content,
            platform: channel,
            featuredImageUrl: featuredImage,
            hashtags: Array.isArray(md.hashtags) ? md.hashtags : undefined,
            instructions: buildChannelInstructions(channel, output.title || '', featuredImage),
        }, 'Export ready')
    } catch (err) {
        console.error('exportOutput error:', err)
        return fail(c, 'Export failed', 500)
    }
}

// Channel-specific paste instructions for Mode-B users
function buildChannelInstructions(channel: string, title: string, featuredImage?: string): string[] {
    const hasImage = !!featuredImage
    switch (channel) {
        case 'facebook':
            return [
                '1. היכנסו לדף הפייסבוק העסקי שלכם ← "Create post".',
                ...(hasImage ? ['2. הורידו את התמונה מ-URL לעיל ← גררו לתוך ה-composer.'] : []),
                `${hasImage ? '3' : '2'}. הדביקו את הטקסט.`,
                `${hasImage ? '4' : '3'}. לחצו Publish (או Schedule להזמנה עתידית).`,
            ]
        case 'instagram':
            return [
                '1. פתחו את אפליקציית Instagram בנייד (פרסום לא נתמך בדסקטופ ללא Creator Studio).',
                '2. לחצו "+" ← Post / Reel / Story.',
                ...(hasImage ? ['3. בחרו את התמונה מהגלריה (אחרי שהורדתם מ-URL).'] : []),
                '4. הדביקו את הטקסט ב-Caption.',
                '5. הוסיפו hashtags בתחתית.',
                '6. Share.',
            ]
        case 'linkedin':
            return [
                '1. היכנסו ל-LinkedIn ← "Start a post".',
                ...(hasImage ? ['2. הוסיפו תמונה מ-URL לעיל.'] : []),
                `${hasImage ? '3' : '2'}. הדביקו את הטקסט.`,
                `${hasImage ? '4' : '3'}. לחצו Post.`,
            ]
        case 'email':
            return [
                '1. היכנסו למערכת ה-email שלכם (Mailchimp / Klaviyo / SendGrid / ActiveCampaign).',
                '2. צרו קמפיין חדש.',
                '3. הדביקו את title כנושא המייל.',
                '4. הדביקו את content בגוף — המערכת תרנדר Markdown או תצטרכו להמיר ל-HTML.',
                ...(hasImage ? ['5. הוסיפו את התמונה הראשית מ-URL לעיל.'] : []),
                '6. בחרו קהל יעד ← Send / Schedule.',
            ]
        case 'youtube':
            return [
                '1. היכנסו ל-YouTube Studio ← Upload.',
                '2. העלו את קובץ הווידאו.',
                '3. הדביקו title + description.',
                '4. הוסיפו tags רלוונטיים.',
                '5. Publish.',
            ]
        case 'tiktok':
            return [
                '1. פתחו את TikTok בנייד ← "+" ← Upload.',
                '2. העלו את הווידאו.',
                '3. הדביקו caption + hashtags.',
                '4. Post.',
            ]
        default:
            return [
                `1. היכנסו לפלטפורמת ${channel} שלכם.`,
                '2. הדביקו את title + content.',
                hasImage ? '3. הוסיפו את התמונה הראשית מ-URL לעיל.' : '3. פרסמו.',
            ]
    }
}