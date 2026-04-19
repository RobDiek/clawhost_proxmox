/**
 * LLM Guard Controller — Input/output scanning endpoints.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { scanText, checkLlmGuardInstalled } from '@/services/llmGuard'
import telegram from '@/services/telegram'

// POST /hosting/instances/:id/guard/scan
// Body: { text: string, direction?: 'input' | 'output' }
export const guardScan = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const body = await c.req.json()
        const { text, direction } = body

        if (!text) return fail(c, 'text is required', 400)
        if (text.length > 10_000) return fail(c, 'Text too long (max 10,000 characters)', 400)

        const result = await scanText(
            instance.ip,
            text,
            direction || 'input',
            instance.rootPassword || undefined
        )

        // If dangerous input detected, alert admin via Telegram
        if (!result.safe && instance.telegramChatId) {
            const flagList = result.flagged.join(', ')
            try {
                await telegram.sendMessage(
                    instance.telegramChatId,
                    `🛡️ *LLM Guard Alert*\n\nInstance: \`${instanceId}\`\nDirection: ${direction || 'input'}\nFlags: ${flagList}\nRisk Score: ${result.score}\nLength: ${text.length} chars\n\n_Content hidden for privacy_`
                )
            } catch { /* non-critical */ }
        }

        return ok(c, result, result.safe ? 'Content is safe' : 'Potential threat detected')
    } catch (err) {
        console.error('guardScan error:', err)
        return fail(c, 'Scan failed', 500)
    }
}

// GET /hosting/instances/:id/guard/status
export const guardStatus = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const installed = await checkLlmGuardInstalled(
            instance.ip,
            instance.rootPassword || undefined
        )

        return ok(c, { installed, enabled: installed }, 'Guard status retrieved')
    } catch (err) {
        console.error('guardStatus error:', err)
        return fail(c, 'Failed to check guard status', 500)
    }
}