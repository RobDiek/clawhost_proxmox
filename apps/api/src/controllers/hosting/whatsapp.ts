import type { Context } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { waConfig, waContacts, waTemplates, waSends } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import greenapi, { type GreenAPIConfig } from '@/services/greenapi'

// Helper: get Green API config for an instance
async function getWaConfig(instanceId: string): Promise<GreenAPIConfig | null> {
    const [config] = await db.select().from(waConfig).where(eq(waConfig.instanceId, instanceId))
    if (!config?.greenApiInstance || !config?.greenApiToken) return null
    return { instanceId: config.greenApiInstance, apiToken: config.greenApiToken }
}

// ── Config ──

export const saveWaConfig = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            greenApiInstance: string
            greenApiToken: string
            businessPhone?: string
            optinMethod?: string
            autoReplyText?: string
        }>()

        if (!body.greenApiInstance || !body.greenApiToken) {
            return fail(c, 'Green API Instance ID and Token are required', 400)
        }

        // Validate credentials
        const valid = await greenapi.checkCredentials({
            instanceId: body.greenApiInstance,
            apiToken: body.greenApiToken,
        })
        if (!valid) return fail(c, 'Invalid Green API credentials', 400)

        // Upsert config
        await db.insert(waConfig).values({
            instanceId,
            greenApiInstance: body.greenApiInstance,
            greenApiToken: body.greenApiToken,
            businessPhone: body.businessPhone || null,
            optinMethod: body.optinMethod || 'incoming',
            autoReplyText: body.autoReplyText || 'ברוכים הבאים! תקבלו עדכונים מאיתנו 🎉',
        }).onConflictDoUpdate({
            target: waConfig.instanceId,
            set: {
                greenApiInstance: body.greenApiInstance,
                greenApiToken: body.greenApiToken,
                businessPhone: body.businessPhone || null,
                optinMethod: body.optinMethod || 'incoming',
                autoReplyText: body.autoReplyText,
            },
        })

        return ok(c, null, 'WhatsApp configured')
    } catch (err) {
        console.error('saveWaConfig error:', err)
        return fail(c, 'Failed to save config', 500)
    }
}

export const getWaConfigEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [config] = await db.select().from(waConfig).where(eq(waConfig.instanceId, instanceId))
        return ok(c, config || null, config ? 'Config found' : 'Not configured')
    } catch (err) {
        console.error('getWaConfig error:', err)
        return fail(c, 'Failed to get config', 500)
    }
}

// ── Contacts ──

export const getWaContacts = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const contacts = await db.select().from(waContacts).where(eq(waContacts.instanceId, instanceId))
        const optedIn = contacts.filter(c => c.optedIn && !c.optedOut).length
        const optedOut = contacts.filter(c => c.optedOut).length

        return ok(c, { contacts, optedIn, optedOut, total: contacts.length }, 'Contacts')
    } catch (err) {
        console.error('getWaContacts error:', err)
        return fail(c, 'Failed to get contacts', 500)
    }
}

export const addWaContact = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ phone: string; name?: string; method?: string }>()
        if (!body.phone) return fail(c, 'Phone required', 400)

        // Sanitize phone: only digits, 10-15 chars
        const phone = body.phone.replace(/\D/g, '')
        if (phone.length < 10 || phone.length > 15) return fail(c, 'Invalid phone number', 400)

        await db.insert(waContacts).values({
            instanceId,
            phone,
            name: body.name || null,
            optedIn: true,
            optedInAt: new Date(),
            optedInMethod: body.method || 'manual',
        }).onConflictDoUpdate({
            target: [waContacts.instanceId, waContacts.phone],
            set: {
                name: body.name || null,
                optedIn: true,
                optedInAt: new Date(),
                optedInMethod: body.method || 'manual',
            },
        })

        return ok(c, null, 'Contact added')
    } catch (err) {
        console.error('addWaContact error:', err)
        return fail(c, 'Failed to add contact', 500)
    }
}

export const importWaContacts = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ contacts: Array<{ phone: string; name?: string }> }>()
        if (!body.contacts?.length) return fail(c, 'No contacts provided', 400)
        if (body.contacts.length > 10000) return fail(c, 'Maximum 10,000 contacts per import', 400)

        let imported = 0
        for (const contact of body.contacts) {
            const phone = contact.phone.replace(/\D/g, '')
            if (phone.length < 10 || phone.length > 15) continue

            try {
                await db.insert(waContacts).values({
                    instanceId,
                    phone,
                    name: contact.name || null,
                    optedIn: true,
                    optedInAt: new Date(),
                    optedInMethod: 'manual',
                }).onConflictDoNothing()
                imported++
            } catch { /* skip duplicates */ }
        }

        return ok(c, { imported, total: body.contacts.length }, `${imported} contacts imported`)
    } catch (err) {
        console.error('importWaContacts error:', err)
        return fail(c, 'Failed to import contacts', 500)
    }
}

// ── Templates ──

export const getWaTemplates = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const templates = await db.select().from(waTemplates).where(eq(waTemplates.instanceId, instanceId))
        return ok(c, templates, `${templates.length} templates`)
    } catch (err) {
        console.error('getWaTemplates error:', err)
        return fail(c, 'Failed to get templates', 500)
    }
}

export const createWaTemplate = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            templateName: string
            category: 'MARKETING' | 'UTILITY'
            bodyText: string
            header?: string
            footer?: string
            language?: string
        }>()

        if (!body.templateName || !body.bodyText) return fail(c, 'Template name and body required', 400)

        // Validate template name: lowercase alphanumeric + underscores only
        if (!/^[a-z][a-z0-9_]{2,50}$/.test(body.templateName)) {
            return fail(c, 'Template name must be lowercase letters, numbers, underscores only (3-50 chars)', 400)
        }

        // Save draft locally
        const [template] = await db.insert(waTemplates).values({
            instanceId,
            templateName: body.templateName,
            category: body.category || 'MARKETING',
            language: body.language || 'he',
            bodyText: body.bodyText,
            header: body.header || null,
            footer: body.footer || null,
            status: 'draft',
        }).returning()

        return ok(c, template, 'Template created as draft')
    } catch (err) {
        console.error('createWaTemplate error:', err)
        return fail(c, 'Failed to create template', 500)
    }
}

export const submitWaTemplate = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const templateId = c.req.param('templateId')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const gaConfig = await getWaConfig(instanceId)
        if (!gaConfig) return fail(c, 'WhatsApp not configured', 400)

        const [template] = await db.select().from(waTemplates)
            .where(and(eq(waTemplates.id, templateId), eq(waTemplates.instanceId, instanceId)))
        if (!template) return fail(c, 'Template not found', 404)
        if (template.status !== 'draft' && template.status !== 'rejected') {
            return fail(c, 'Template already submitted', 400)
        }

        // Submit to Green API → Meta
        const result = await greenapi.createTemplate(gaConfig, {
            name: template.templateName,
            category: template.category as 'MARKETING' | 'UTILITY',
            language: template.language || 'he',
            bodyText: template.bodyText || '',
            header: template.header || undefined,
            footer: template.footer || undefined,
        })

        await db.update(waTemplates).set({
            status: 'submitted',
            greenApiTemplateId: result.templateId,
        }).where(eq(waTemplates.id, templateId))

        return ok(c, { templateId: result.templateId, status: result.status }, 'Template submitted to Meta')
    } catch (err) {
        console.error('submitWaTemplate error:', err)
        return fail(c, 'Failed to submit template: ' + (err as Error).message, 500)
    }
}

export const refreshWaTemplateStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const gaConfig = await getWaConfig(instanceId)
        if (!gaConfig) return fail(c, 'WhatsApp not configured', 400)

        // Fetch all templates from Green API
        const remoteTemplates = await greenapi.getTemplates(gaConfig)

        // Update local statuses
        for (const remote of remoteTemplates) {
            await db.update(waTemplates).set({
                status: remote.status?.toLowerCase() || 'submitted',
                greenApiTemplateId: remote.templateId,
            }).where(and(
                eq(waTemplates.instanceId, instanceId),
                eq(waTemplates.templateName, remote.elementName)
            ))
        }

        return ok(c, { synced: remoteTemplates.length }, 'Template statuses refreshed')
    } catch (err) {
        console.error('refreshWaTemplateStatus error:', err)
        return fail(c, 'Failed to refresh statuses', 500)
    }
}

// ── Sends ──

export const sendWaBroadcast = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            templateId: string
            variables?: string[]
        }>()
        if (!body.templateId) return fail(c, 'Template ID required', 400)

        const gaConfig = await getWaConfig(instanceId)
        if (!gaConfig) return fail(c, 'WhatsApp not configured', 400)

        // Verify template is approved
        const [template] = await db.select().from(waTemplates)
            .where(and(eq(waTemplates.id, body.templateId), eq(waTemplates.instanceId, instanceId)))
        if (!template) return fail(c, 'Template not found', 404)
        if (template.status !== 'approved') return fail(c, 'Template not approved by Meta', 400)

        // Get opted-in contacts
        const contacts = await db.select().from(waContacts)
            .where(and(
                eq(waContacts.instanceId, instanceId),
                eq(waContacts.optedIn, true),
                eq(waContacts.optedOut, false)
            ))
        if (!contacts.length) return fail(c, 'No opted-in contacts', 400)

        // Create send record
        const [send] = await db.insert(waSends).values({
            instanceId,
            templateId: body.templateId,
            totalRecipients: contacts.length,
            status: 'sending',
            startedAt: new Date(),
        }).returning()

        // Send in background (don't block response)
        const phones = contacts.map(c => c.phone)
        greenapi.sendBulkTemplate(gaConfig, {
            phones,
            templateId: template.greenApiTemplateId || '',
            variables: body.variables,
            delayMs: 1000,
        }).then(async (result) => {
            await db.update(waSends).set({
                sentCount: result.sent,
                status: result.failed > 0 ? 'completed' : 'completed',
                completedAt: new Date(),
            }).where(eq(waSends.id, send.id))
        }).catch(async (err) => {
            console.error('Bulk send error:', err)
            await db.update(waSends).set({
                status: 'failed',
                completedAt: new Date(),
            }).where(eq(waSends.id, send.id))
        })

        return ok(c, {
            sendId: send.id,
            recipients: contacts.length,
            status: 'sending',
        }, `Sending to ${contacts.length} contacts`)
    } catch (err) {
        console.error('sendWaBroadcast error:', err)
        return fail(c, 'Failed to send broadcast', 500)
    }
}

export const getWaSends = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const sends = await db.select().from(waSends).where(eq(waSends.instanceId, instanceId))
        return ok(c, sends, `${sends.length} sends`)
    } catch (err) {
        console.error('getWaSends error:', err)
        return fail(c, 'Failed to get sends', 500)
    }
}
