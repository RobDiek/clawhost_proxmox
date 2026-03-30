import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { eq, and, ne, desc, inArray } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import { randomBytes } from 'crypto'

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

        const conditions = [eq(agentOutputs.instanceId, instanceId)]
        if (status) {
            conditions.push(eq(agentOutputs.status, status))
        } else if (excludeArchived) {
            conditions.push(ne(agentOutputs.status, 'archived'))
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
        return ok(c, updated, 'Output approved')
    } catch (err) {
        console.error('approveOutput error:', err)
        return fail(c, 'Failed to approve', 500)
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
        const publishResults: Record<string, string> = {}

        // ── Telegram publish ──
        const telegramChatId = await ensureTelegramChatId(instance)
        if (platform === 'telegram' && instance.telegramBotToken && telegramChatId) {
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${instance.telegramBotToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: telegramChatId,
                        text: content.substring(0, 4096), // Telegram limit
                        parse_mode: 'Markdown',
                    }),
                })
                const tgData = await tgRes.json() as { ok?: boolean; description?: string }
                if (tgData.ok) {
                    publishResults.telegram = 'sent'
                    console.log(`Published to Telegram: output ${outputId}`)
                } else {
                    publishResults.telegram = `error: ${tgData.description || 'unknown'}`
                    console.error(`Telegram publish failed:`, tgData.description)
                }
            } catch (tgErr) {
                publishResults.telegram = 'error: network'
                console.error(`Telegram publish error:`, tgErr)
            }
        }

        // TODO: Instagram, LinkedIn, Twitter, WordPress publish handlers

        // Update status
        const [updated] = await db.update(agentOutputs)
            .set({
                status: 'published',
                publishedAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                    ...(output.metadata as Record<string, unknown> || {}),
                    publishResults,
                },
            })
            .where(eq(agentOutputs.id, outputId))
            .returning()

        console.log(`Output ${outputId} published to ${platform}:`, publishResults)
        return ok(c, { ...updated, publishResults }, 'Output published')
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
