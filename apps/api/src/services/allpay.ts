import { createHmac } from 'crypto'
import { INSTALLMENTS } from '@openclaw/shared'

interface CreateSubscriptionParams {
    orderId: string
    items: Array<{ name: string; price: number; quantity: number }>
    planKey: string
    customerEmail: string
    customerName: string
    customerPhone: string
    successUrl: string
    failUrl: string
    webhookUrl: string
    metadata: Record<string, string>
}

interface WebhookResult {
    event: 'payment_success' | 'payment_failed' | 'subscription_cancelled'
    orderId: string
    metadata: Record<string, string>
}

const getCredentials = () => {
    const login = process.env.ALLPAY_LOGIN
    const apiKey = process.env.ALLPAY_API_KEY
    if (!login || !apiKey) {
        throw new Error('ALLPAY_LOGIN or ALLPAY_API_KEY is not set!')
    }
    return { login, apiKey }
}

const isTestMode = () => process.env.ALLPAY_TEST_MODE === 'true'

const allpay = {
    async createSubscription(params: CreateSubscriptionParams): Promise<string> {
        const { login, apiKey } = getCredentials()
        const installments = INSTALLMENTS[params.planKey] || 3

        const payload = {
            api_user_name: login,
            api_user_pass: apiKey,
            test_mode: isTestMode() ? 1 : 0,
            order_id: params.orderId,
            amount: params.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
            currency: 'ILS',
            vat: 1,
            installments,
            recurring: {
                interval: 'monthly',
                description: params.items.map(i => i.name).join(', '),
            },
            customer_email: params.customerEmail,
            customer_fname: params.customerName.split(' ')[0] || params.customerName,
            customer_lname: params.customerName.split(' ').slice(1).join(' ') || '',
            customer_phone: params.customerPhone,
            customer_id: '000000000',
            success_url: params.successUrl,
            fail_url: params.failUrl,
            notify_url: params.webhookUrl,
            metadata: JSON.stringify(params.metadata),
        }

        const response = await fetch('https://api.allpay.co.il/v1/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        const data = await response.json()

        if (!data.payment_url) {
            throw new Error(`AllPay createSubscription failed: ${JSON.stringify(data)}`)
        }

        return data.payment_url
    },

    verifyWebhookSignature(body: string, signature: string): boolean {
        const secret = process.env.ALLPAY_WEBHOOK_SECRET
        if (!secret) {
            throw new Error('ALLPAY_WEBHOOK_SECRET is not set!')
        }
        const expected = createHmac('sha256', secret).update(body).digest('hex')
        return expected === signature
    },

    parseWebhook(body: Record<string, unknown>): WebhookResult {
        const status = body.status as string
        const orderId = body.order_id as string
        const metadataStr = (body.metadata as string) || '{}'

        let event: WebhookResult['event']
        if (status === 'success' || status === 'approved') {
            event = 'payment_success'
        } else if (status === 'cancelled' || status === 'subscription_cancelled') {
            event = 'subscription_cancelled'
        } else {
            event = 'payment_failed'
        }

        return {
            event,
            orderId,
            metadata: JSON.parse(metadataStr),
        }
    },

    async cancelSubscription(subscriptionId: string): Promise<void> {
        const { login, apiKey } = getCredentials()

        await fetch('https://api.allpay.co.il/v1/cancel-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_user_name: login,
                api_user_pass: apiKey,
                subscription_id: subscriptionId,
            }),
        })
    },

    async refund(orderId: string, amount: number): Promise<void> {
        const { login, apiKey } = getCredentials()

        await fetch('https://api.allpay.co.il/v1/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_user_name: login,
                api_user_pass: apiKey,
                order_id: orderId,
                amount,
            }),
        })
    },
}

export default allpay
