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
}

interface WebhookResult {
    event: 'payment_success' | 'payment_failed' | 'subscription_cancelled'
    orderId: string
    metadata: { instanceId: string; planKey: string }
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
                start_type: 1,
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
        const instanceId = (body.add_field_1 as string) || ''
        const planKey = (body.add_field_2 as string) || ''

        let event: WebhookResult['event']
        if (status === 1) {
            event = 'payment_success'
        } else {
            event = 'payment_failed'
        }

        return {
            event,
            orderId,
            metadata: { instanceId, planKey },
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
