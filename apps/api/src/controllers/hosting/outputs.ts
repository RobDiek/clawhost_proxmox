import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { eq, and, or, ne, desc, inArray, isNull } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { randomBytes } from 'crypto'
import { createCampaign, type CampaignPlan, type GoogleTokens } from '@/services/googleAds'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

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

        return ok(c, results)
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
        return ok(c, output)
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
                    agentId: (output as { agentId?: string | null }).agentId || null,
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
                agentId: (existing as { agentId?: string | null }).agentId || null,
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
            const metaTokens = instance.metaTokens as any
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
                                'User-Agent': cfgData.userAgent || 'ClawFlow/1.0',
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
                            // Yoast SEO fields (plugin: yoast/wordpress-seo)
                            yoast_meta: seo.metaDescription ? {
                                yoast_wpseo_metadesc: seo.metaDescription,
                                yoast_wpseo_focuskw: seo.primaryKeyword || undefined,
                                yoast_wpseo_title: output.title,
                            } : undefined,
                            // Rank Math fields (plugin: rankmath/seo-by-rank-math)
                            meta: seo.metaDescription ? {
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
                        const fromName = (meta.fromName as string) || 'ClawFlow'

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