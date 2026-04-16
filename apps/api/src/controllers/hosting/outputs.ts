import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { eq, and, ne, desc, inArray } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { randomBytes } from 'crypto'
import { createCampaign, type CampaignPlan, type GoogleTokens } from '@/services/googleAds'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

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
        const MATEH_ROLES = ['mateh', 'sayer', 'meater', 'maazin', 'menateach', 'et', 'yotzer', 'shaliach', 'migdalor']

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
        await db.insert(agentOutputs).values({
            id,
            instanceId,
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
                await db.insert(agentOutputs).values({
                    id: articleId,
                    instanceId: output.instanceId,
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

        const content = output.editedContent || output.content || ''
        const platform = output.platform || 'telegram'
        let publishSuccess = false
        let publishError = ''
        let publishErrorType: 'missing_integration' | 'api_error' | 'network_error' | '' = ''

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
                        const tgData = await tgRes.json() as { ok?: boolean; description?: string }
                        if (tgData.ok) {
                            publishSuccess = true
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

        // ── LinkedIn (coming soon) ──
        else if (platform === 'linkedin') {
            publishError = 'LinkedIn בקרוב — עקבו אחרי העדכונים.'
            publishErrorType = 'missing_integration'
        }

        // ── Twitter/X (coming soon) ──
        else if (platform === 'twitter') {
            publishError = 'Twitter/X בקרוב — עקבו אחרי העדכונים.'
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
                    const wpConfig = JSON.parse(wpConfigRaw) as { url: string; user: string; appPassword: string }
                    if (!wpConfig.url || !wpConfig.user || !wpConfig.appPassword) {
                        publishError = 'הגדרות WordPress חסרות. בדקו URL, שם משתמש ו-Application Password.'
                        publishErrorType = 'missing_integration'
                    } else {
                        // WordPress REST API — create post
                        const wpUrl = wpConfig.url.replace(/\/$/, '')
                        const auth = Buffer.from(`${wpConfig.user}:${wpConfig.appPassword}`).toString('base64')

                        // Convert markdown content to HTML (basic)
                        let htmlContent = content
                            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.+?)\*/g, '<em>$1</em>')
                            .replace(/\n\n/g, '</p><p>')
                            .replace(/\n/g, '<br>')
                        htmlContent = '<p>' + htmlContent + '</p>'

                        const wpRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Basic ${auth}`,
                            },
                            body: JSON.stringify({
                                title: output.title,
                                content: htmlContent,
                                status: 'publish',
                            }),
                        })

                        if (wpRes.ok) {
                            const wpData = await wpRes.json() as { id?: number; link?: string }
                            publishSuccess = true
                            console.log(`Published to WordPress: post ${wpData.id} at ${wpData.link}`)
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
            const [updated] = await db.update(agentOutputs)
                .set({
                    status: 'published',
                    publishedAt: new Date(),
                    updatedAt: new Date(),
                    metadata: { ...existingMeta, publishedTo: platform, publishedAt: new Date().toISOString() },
                })
                .where(eq(agentOutputs.id, outputId))
                .returning()

            console.log(`Output ${outputId} published to ${platform}`)
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
