import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { getLitellmStatus, setLitellmApiKey, getLitellmUsage } from '@/services/litellm'

// GET /hosting/instances/:id/litellm/status
export const getLitellmStatusEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const status = await getLitellmStatus(instance.ip, instance.rootPassword || undefined)

        return ok(c, status, 'LiteLLM status retrieved')
    } catch (err) {
        console.error('getLitellmStatus error:', err)
        return fail(c, 'Failed to get LiteLLM status', 500)
    }
}

// POST /hosting/instances/:id/litellm/api-key
// Body: { provider: 'anthropic' | 'openai', apiKey: string }
export const setLitellmApiKeyEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const body = await c.req.json()
        const { provider, apiKey } = body

        if (!provider || !['anthropic', 'openai'].includes(provider)) {
            return fail(c, 'Invalid provider. Must be "anthropic" or "openai".', 400)
        }
        if (!apiKey || !/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
            return fail(c, 'Invalid API key format', 400)
        }

        await setLitellmApiKey(instance.ip, provider, apiKey, instance.rootPassword || undefined)

        // Also update in DB for persistence
        const updateData: Record<string, string> = {}
        if (provider === 'anthropic') {
            updateData.aiProviderKey = apiKey
            updateData.aiProviderType = 'anthropic'
        } else {
            updateData.openaiApiKey = apiKey
        }

        await db.update(instances).set(updateData).where(eq(instances.id, instance.id))

        return ok(c, null, `${provider} API key updated in LiteLLM gateway`)
    } catch (err) {
        console.error('setLitellmApiKey error:', err)
        return fail(c, 'Failed to update API key', 500)
    }
}

// GET /hosting/instances/:id/litellm/usage
export const getLitellmUsageEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const usage = await getLitellmUsage(
            instance.ip,
            instance.openclawToken || '',
            instance.rootPassword || undefined
        )

        return ok(c, usage, 'LiteLLM usage retrieved')
    } catch (err) {
        console.error('getLitellmUsage error:', err)
        return fail(c, 'Failed to get usage data', 500)
    }
}
