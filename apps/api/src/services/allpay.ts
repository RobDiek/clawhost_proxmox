import { createHash } from 'crypto'
import { INSTALLMENTS } from '@openclaw/shared'

const ALLPAY_BASE = 'https://allpay.to/app/'

interface CreatePaymentParams {
    orderId: string
    items: Array<{ name: string; price: number; qty: number }>
    planKey: string
    customerEmail: string
    customerName: string
    customerPhone: string
    successUrl: string
    failUrl: string
    webhookUrl: string
    metadata: { instanceId: string; planKey: string }
    trialDays?: number   // delay first charge by N days (trial period)
    isAnnual?: boolean   // annual billing = charge full year at once
}

interface WebhookResult {
    event: 'payment_success' | 'payment_failed' | 'subscription_cancelled'
    orderId: string
    metadata: {
        instanceId: string
        /** For subscriptions: planKey. For top-ups: 'dfs_topup'. Empty string if neither. */
        planKey: string
        /** Top-up only: amount in USD cents to credit. Parsed from add_field_3 if numeric. */
        topupAmountUsdCents?: number
    }
}

// ── AllPay SHA256 Signature ──
function collectValues(obj: Record<string, unknown>, chunks: string[]): void {
    const sortedKeys = Object.keys(obj).sort()
    sortedKeys.forEach((key) => {
        if (key === 'sign') return
        const value = obj[key]

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === 'object' && item !== null) {
                    collectValues(item as Record<string, unknown>, chunks)
                } else if (typeof item === 'string' && item.trim() !== '') {
                    chunks.push(item)
                } else if (typeof item === 'number') {
                    chunks.push(String(item))
                }
            })
        } else if (typeof value === 'object' && value !== null) {
            collectValues(value as Record<string, unknown>, chunks)
        } else if (typeof value === 'string' && value.trim() !== '') {
            chunks.push(value)
        } else if (typeof value === 'number') {
            chunks.push(String(value))
        }
    })
}

function computeSign(params: Record<string, unknown>, apiKey: string): string {
    const chunks: string[] = []
    collectValues(params, chunks)
    const signatureString = chunks.join(':') + ':' + apiKey
    return createHash('sha256').update(signatureString).digest('hex')
}

function getCredentials() {
    const login = process.env.ALLPAY_LOGIN
    const apiKey = process.env.ALLPAY_API_KEY
    if (!login || !apiKey) {
        throw new Error('ALLPAY_LOGIN or ALLPAY_API_KEY is not set!')
    }
    return { login, apiKey }
}

const allpay = {
    /**
     * One-time payment (no subscription block) — used for DFS credits top-ups.
     * Same AllPay account as subscriptions; distinguished by metadata
     * `add_field_2 = 'dfs_topup'` so the webhook router branches correctly.
     * `inst: 1` → single immediate charge (no installments). Auto-generates
     * хашבונית מס via AllPay's standard receipt flow.
     */
    async createOneTimePayment(params: {
        orderId: string
        items: Array<{ name: string; price: number; qty: number }>
        customerEmail: string
        customerName: string
        customerPhone: string
        successUrl: string
        failUrl: string
        webhookUrl: string
        metadata: { instanceId: string; topupKind: 'dfs_topup'; amountUsdCents: number }
    }): Promise<string> {
        const { login, apiKey } = getCredentials()

        const items = params.items.map(i => ({
            name: i.name,
            price: String(i.price),
            qty: String(i.qty),
            vat: '1',
        }))

        const payload: Record<string, unknown> = {
            login,
            order_id: params.orderId,
            items,
            currency: 'ILS',
            lang: 'HE',
            inst: 1,
            client_name: params.customerName,
            client_email: params.customerEmail,
            client_phone: params.customerPhone,
            client_tehudat: '000000000',
            webhook_url: params.webhookUrl,
            success_url: params.successUrl,
            backlink_url: params.failUrl,
            add_field_1: params.metadata.instanceId,
            add_field_2: params.metadata.topupKind,
            add_field_3: String(params.metadata.amountUsdCents),
        }
        payload.sign = computeSign(payload, apiKey)

        const response = await fetch(`${ALLPAY_BASE}?show=getpayment&mode=api10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const data = await response.json() as { payment_url?: string; error?: string }
        if (data.error) throw new Error(`AllPay error: ${data.error}`)
        if (!data.payment_url) throw new Error(`AllPay: no payment_url in response: ${JSON.stringify(data)}`)
        return data.payment_url
    },

    async createSubscription(params: CreatePaymentParams): Promise<string> {
        const { login, apiKey } = getCredentials()
        const installments = INSTALLMENTS[params.planKey] || 3

        const items = params.items.map(i => ({
            name: i.name,
            price: String(i.price),
            qty: String(i.qty),
            vat: '1',
        }))

        const payload: Record<string, unknown> = {
            login,
            order_id: params.orderId,
            items,
            currency: 'ILS',
            lang: 'HE',
            inst: installments,
            client_name: params.customerName,
            client_email: params.customerEmail,
            client_phone: params.customerPhone,
            client_tehudat: '000000000',
            webhook_url: params.webhookUrl,
            success_url: params.successUrl,
            backlink_url: params.failUrl,
            add_field_1: params.metadata.instanceId,
            add_field_2: params.metadata.planKey,
            subscription: {
                start_type: params.trialDays ? 3 : 1,  // 3 = delayed by N days
                ...(params.trialDays ? { start_n: params.trialDays } : {}),
                end_type: 1,
            },
        }

        payload.sign = computeSign(payload, apiKey)

        const response = await fetch(`${ALLPAY_BASE}?show=getpayment&mode=api10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        const data = await response.json() as { payment_url?: string; error?: string }

        if (data.error) {
            throw new Error(`AllPay error: ${data.error}`)
        }

        if (!data.payment_url) {
            throw new Error(`AllPay: no payment_url in response: ${JSON.stringify(data)}`)
        }

        return data.payment_url
    },

    verifyWebhookSignature(body: Record<string, unknown>): boolean {
        const { apiKey } = getCredentials()
        const receivedSign = body.sign as string
        if (!receivedSign) return false

        const bodyWithoutSign = { ...body }
        delete bodyWithoutSign.sign
        const expectedSign = computeSign(bodyWithoutSign, apiKey)

        return expectedSign === receivedSign
    },

    parseWebhook(body: Record<string, unknown>): WebhookResult {
        const status = body.status as number
        const orderId = body.order_id as string
        let instanceId = (body.add_field_1 as string) || ''
        const planKey = (body.add_field_2 as string) || ''
        const addField3 = (body.add_field_3 as string) || ''

        // Fallback: extract instanceId from orderId format "oc-{instanceId}-{timestamp}"
        // or "dfs-{instanceId}-{timestamp}" (top-up)
        if (!instanceId && orderId) {
            if (orderId.startsWith('oc-') || orderId.startsWith('dfs-')) {
                const parts = orderId.split('-')
                if (parts.length >= 2) instanceId = parts[1]
            }
        }

        let event: WebhookResult['event']
        if (status === 1) {
            event = 'payment_success'
        } else {
            event = 'payment_failed'
        }

        // Top-up: amount is in add_field_3 as USD cents. Parse defensively —
        // if AllPay strips/mangles it, the routing still works (falls through
        // to subscription branch which fails clean on missing planKey).
        const topupAmountUsdCents = planKey === 'dfs_topup' && /^\d+$/.test(addField3)
            ? parseInt(addField3, 10)
            : undefined

        return {
            event,
            orderId,
            metadata: { instanceId, planKey, topupAmountUsdCents },
        }
    },

    async cancelSubscription(orderId: string): Promise<void> {
        const { login, apiKey } = getCredentials()

        const payload: Record<string, unknown> = {
            login,
            order_id: orderId,
        }
        payload.sign = computeSign(payload, apiKey)

        const res = await fetch(`${ALLPAY_BASE}?show=cancelsubscription&mode=api10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            throw new Error(`AllPay cancelSubscription failed: HTTP ${res.status}`)
        }

        const data = await res.json() as { error?: string }
        if (data.error) {
            throw new Error(`AllPay cancelSubscription error: ${data.error}`)
        }
    },

    async checkPaymentStatus(orderId: string): Promise<{ status: number; amount: number }> {
        const { login, apiKey } = getCredentials()

        const payload: Record<string, unknown> = {
            login,
            order_id: orderId,
        }
        payload.sign = computeSign(payload, apiKey)

        const res = await fetch(`${ALLPAY_BASE}?show=paymentstatus&mode=api10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            throw new Error(`AllPay checkPaymentStatus failed: HTTP ${res.status}`)
        }

        return await res.json() as { status: number; amount: number }
    },

    async refund(orderId: string, amount: number): Promise<void> {
        const { login, apiKey } = getCredentials()

        const payload: Record<string, unknown> = {
            login,
            order_id: orderId,
            amount,
        }
        payload.sign = computeSign(payload, apiKey)

        const res = await fetch(`${ALLPAY_BASE}?show=refund&mode=api10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            throw new Error(`AllPay refund failed: HTTP ${res.status}`)
        }

        const data = await res.json() as { error?: string }
        if (data.error) {
            throw new Error(`AllPay refund error: ${data.error}`)
        }
    },

    async verifyCredentials(): Promise<boolean> {
        const { login, apiKey } = getCredentials()

        const payload: Record<string, unknown> = { login }
        payload.sign = computeSign(payload, apiKey)

        try {
            const res = await fetch(`${ALLPAY_BASE}?show=checkkeys&mode=api10`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json() as { error?: string }
            return !data.error
        } catch {
            return false
        }
    },
}

export default allpay