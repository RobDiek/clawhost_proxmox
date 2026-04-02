/**
 * Green API WABA — WhatsApp Business API integration
 * Docs: https://green-api.com/en/waba/api/
 *
 * Each ClawFlow client has their own Green API instance.
 * We never store or proxy their credentials on management server —
 * credentials are saved on the client's VPS.
 */

const BASE_URL = 'https://api.green-api.com'

/** Normalize Israeli phone number to international format for WhatsApp */
export function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    // Israeli mobile: 05X → 972X
    if (digits.startsWith('0') && digits.length === 10) return '972' + digits.slice(1)
    // Already international: 972...
    if (digits.startsWith('972') && digits.length >= 12) return digits
    // Other international format
    return digits
}

interface GreenAPIConfig {
    instanceId: string   // Green API instance ID (e.g., "1101234567")
    apiToken: string     // Green API API token
}

function makeUrl(config: GreenAPIConfig, method: string): string {
    return `${BASE_URL}/waInstance${config.instanceId}/${method}/${config.apiToken}`
}

async function apiCall<T = unknown>(config: GreenAPIConfig, method: string, body?: unknown, httpMethod = 'POST'): Promise<T> {
    const url = makeUrl(config, method)
    const options: RequestInit = {
        method: httpMethod,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000), // 15s timeout
    }
    if (body && httpMethod !== 'GET') {
        options.body = JSON.stringify(body)
    }

    const res = await fetch(url, options)
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Green API ${method} failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
    }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
        const text = await res.text().catch(() => '')
        throw new Error(`Green API ${method}: unexpected content-type ${contentType} — ${text.slice(0, 100)}`)
    }
    return res.json() as Promise<T>
}

const greenapi = {
    // ── Templates ──

    async createTemplate(config: GreenAPIConfig, params: {
        name: string
        category: 'MARKETING' | 'UTILITY'
        language: string
        bodyText: string
        header?: string
        footer?: string
        vertical?: string  // description for Meta approval
    }): Promise<{ templateId: string; status: string }> {
        const body = {
            elementName: params.name,
            languageCode: params.language === 'he' ? 'he' : params.language,
            category: params.category,
            templateType: 'TEXT',
            content: params.bodyText,
            vertical: params.vertical || params.bodyText.slice(0, 180),
            ...(params.header ? { header: params.header } : {}),
            ...(params.footer ? { footer: params.footer } : {}),
        }

        const result = await apiCall<{ template: { templateId: string; status: string } }>(
            config, 'createTemplate', body
        )
        return { templateId: result.template.templateId, status: result.template.status }
    },

    async getTemplates(config: GreenAPIConfig): Promise<Array<{
        templateId: string
        elementName: string
        status: string
        category: string
        languageCode: string
    }>> {
        const result = await apiCall<{ templates?: unknown[] }>(
            config, 'getTemplates', undefined, 'GET'
        )
        return (result.templates || []) as any[]
    },

    // ── Sending ──

    async sendTemplate(config: GreenAPIConfig, params: {
        phone: string
        templateId: string
        variables?: string[]
    }): Promise<{ messageId: string }> {
        // Format phone: ensure @c.us suffix
        const chatId = params.phone.replace(/^\+/, '').replace(/@c\.us$/, '') + '@c.us'

        const body: Record<string, unknown> = {
            chatId,
            templateId: params.templateId,
        }
        if (params.variables?.length) {
            body.params = params.variables
        }

        const result = await apiCall<{ idMessage: string }>(config, 'sendTemplate', body)
        return { messageId: result.idMessage }
    },

    async sendBulkTemplate(config: GreenAPIConfig, params: {
        phones: string[]
        templateId: string
        variables?: string[]
        delayMs?: number  // delay between sends to avoid rate limiting
    }): Promise<{ sent: number; failed: number; errors: string[] }> {
        let sent = 0
        let failed = 0
        const errors: string[] = []
        const delay = params.delayMs || 1000  // 1 second between sends

        for (const phone of params.phones) {
            try {
                await greenapi.sendTemplate(config, {
                    phone,
                    templateId: params.templateId,
                    variables: params.variables,
                })
                sent++
            } catch (err) {
                failed++
                errors.push(`${phone}: ${(err as Error).message}`)
            }
            // Rate limiting delay
            if (delay > 0) await new Promise(r => setTimeout(r, delay))
        }

        return { sent, failed, errors }
    },

    // ── Sending text (for auto-reply on opt-in) ──

    async sendMessage(config: GreenAPIConfig, phone: string, text: string): Promise<{ messageId: string }> {
        const chatId = phone.replace(/^\+/, '').replace(/@c\.us$/, '') + '@c.us'
        const result = await apiCall<{ idMessage: string }>(config, 'sendMessage', { chatId, message: text })
        return { messageId: result.idMessage }
    },

    // ── Receiving (polling) ──

    async receiveNotification(config: GreenAPIConfig): Promise<{
        receiptId: number | null
        body: Record<string, unknown> | null
    }> {
        const result = await apiCall<{ receiptId?: number; body?: Record<string, unknown> }>(
            config, 'receiveNotification', undefined, 'GET'
        )
        return {
            receiptId: result.receiptId || null,
            body: result.body || null,
        }
    },

    async deleteNotification(config: GreenAPIConfig, receiptId: number): Promise<void> {
        await apiCall(config, 'deleteNotification/' + receiptId, undefined, 'DELETE')
    },

    // ── Validation ──

    async checkCredentials(config: GreenAPIConfig): Promise<boolean> {
        try {
            await apiCall(config, 'getStateInstance', undefined, 'GET')
            return true
        } catch {
            return false
        }
    },
}

export default greenapi
export type { GreenAPIConfig }
