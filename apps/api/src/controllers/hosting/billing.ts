import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import crypto, { randomBytes } from 'crypto'
import { calcTotal } from '@openclaw/shared'
import { db } from '@/db'
import { instances, payments } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ok, fail } from '@/lib/response'
import allpay from '@/services/allpay'
import provisioner from '@/services/provisioner'
import telegram from '@/services/telegram'

const generateId = () => randomBytes(5).toString('hex')

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString())
    } catch {
        return null
    }
}

function getUserIdFromRequest(c: Context): string | null {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.slice(7)
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
    const payload = verifyJwt(token, secret)
    if (!payload || !payload.sub) return null
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.sub as string
}

export const checkout = async (c: Context<HonoEnv>) => {
    try {
        const userId = getUserIdFromRequest(c) || c.get('userId')
        if (!userId) {
            return fail(c, 'Unauthorized.', 401)
        }
        const body = await c.req.json()
        const {
            components,
            automationTool,
            addons,
            customerEmail,
            customerName,
            customerPhone
        } = body as {
            components: string[]
            automationTool: 'n8n' | 'activepieces'
            addons: string[]
            customerEmail: string
            customerName: string
            customerPhone: string
        }

        if (!components?.length) {
            return fail(c, 'At least one component is required.', 400)
        }
        if (!customerEmail || !customerName) {
            return fail(c, 'Customer details are required.', 400)
        }

        const pricing = calcTotal(components, addons || [])
        const instanceId = generateId()
        const orderId = `oc-${instanceId}-${Date.now()}`

        await db.insert(instances).values({
            id: instanceId,
            userId,
            selectedComponents: components,
            automationTool: automationTool || 'activepieces',
            aiProvider: 'apikey',
            planKey: pricing.planKey,
            priceIls: String(pricing.totalPrice),
            status: 'awaiting_payment',
            allpayOrderId: orderId,
            onboardingStep: 0,
            onboardingCompleted: false
        })

        await db.insert(payments).values({
            id: generateId(),
            instanceId,
            allpayOrderId: orderId,
            amountIls: String(pricing.totalPrice),
            status: 'pending'
        })

        const frontendUrl = process.env.FRONTEND_URL || 'https://openclaw.flowmatic.co.il'
        const apiUrl = process.env.API_URL || 'https://api.openclaw.flowmatic.co.il'

        const paymentUrl = await allpay.createSubscription({
            orderId,
            items: [{
                name: `OpenClaw Hosting — ${pricing.plan.nameHe}`,
                price: pricing.totalPrice,
                quantity: 1
            }],
            planKey: pricing.planKey,
            customerEmail,
            customerName,
            customerPhone,
            successUrl: `${frontendUrl}/onboarding/${instanceId}`,
            failUrl: `${frontendUrl}/checkout/failed?instance=${instanceId}`,
            webhookUrl: `${apiUrl}/hosting/webhooks/allpay`,
            metadata: { instanceId, planKey: pricing.planKey }
        })

        return ok(c, { paymentUrl, instanceId, orderId }, 'Checkout created.')
    } catch (err) {
        console.error('Checkout error:', err)
        return fail(c, 'Failed to create checkout.', 500)
    }
}

export const handleAllpayWebhook = async (c: Context) => {
    try {
        const rawBody = await c.req.text()
        const signature = c.req.header('x-allpay-signature') || ''

        if (process.env.ALLPAY_WEBHOOK_SECRET && signature) {
            const valid = allpay.verifyWebhookSignature(rawBody, signature)
            if (!valid) {
                return fail(c, 'Invalid signature.', 401)
            }
        }

        const body = JSON.parse(rawBody)
        const { event, orderId, metadata } = allpay.parseWebhook(body)
        const instanceId = metadata.instanceId

        if (!instanceId) {
            return fail(c, 'Missing instanceId in metadata.', 400)
        }

        if (event === 'payment_success') {
            await db.update(payments)
                .set({ status: 'paid', paidAt: new Date() })
                .where(eq(payments.allpayOrderId, orderId))

            const [instance] = await db.select()
                .from(instances)
                .where(eq(instances.id, instanceId))

            if (!instance) {
                return fail(c, 'Instance not found.', 404)
            }

            await db.update(instances)
                .set({ status: 'provisioning', subscriptionStatus: 'active' })
                .where(eq(instances.id, instanceId))

            const components = (instance.selectedComponents as string[]) || []
            const hasOllama = components.includes('ol')
            const automationTool = (instance.automationTool as 'n8n' | 'activepieces') || 'activepieces'

            const result = await provisioner.provision({
                instanceId,
                planKey: instance.planKey,
                automationTool,
                hasOllama,
                telegramChatId: instance.telegramChatId || undefined
            })

            await db.update(instances).set({
                status: 'initializing',
                hetznerServerId: result.serverId,
                ip: result.ip,
                openclawToken: result.openclawToken,
                automationPassword: result.automationPassword,
                rootPassword: result.rootPassword,
                subdomainAgent: result.subdomainAgent,
                subdomainFlows: result.subdomainFlows
            }).where(eq(instances.id, instanceId))

            provisioner.pollUntilReady(instanceId, result.serverId).then(async (ready) => {
                if (ready) {
                    await db.update(instances)
                        .set({ status: 'running' })
                        .where(eq(instances.id, instanceId))

                    if (instance.telegramChatId) {
                        await telegram.notifyReady(instance.telegramChatId, {
                            agent: `https://${result.subdomainAgent}`,
                            flows: `https://${result.subdomainFlows}`
                        })
                    }
                } else {
                    await db.update(instances)
                        .set({ status: 'failed' })
                        .where(eq(instances.id, instanceId))
                }
            })

            return ok(c, null, 'Payment processed.')
        }

        if (event === 'payment_failed') {
            await db.update(payments)
                .set({ status: 'failed' })
                .where(eq(payments.allpayOrderId, orderId))

            return ok(c, null, 'Payment failure recorded.')
        }

        if (event === 'subscription_cancelled') {
            await db.update(instances)
                .set({ subscriptionStatus: 'cancelled' })
                .where(eq(instances.id, instanceId))

            const [instance] = await db.select()
                .from(instances)
                .where(eq(instances.id, instanceId))

            if (instance?.hetznerServerId) {
                await provisioner.suspend(instance.hetznerServerId)
                await db.update(instances)
                    .set({ status: 'suspended', suspendedAt: new Date() })
                    .where(eq(instances.id, instanceId))
            }

            return ok(c, null, 'Subscription cancelled.')
        }

        return ok(c, null, 'Webhook received.')
    } catch (err) {
        console.error('AllPay webhook error:', err)
        return fail(c, 'Webhook processing failed.', 500)
    }
}

export const getSubscriptions = async (c: Context<HonoEnv>) => {
    try {
        const userId = c.get('userId')
        const userInstances = await db.select()
            .from(instances)
            .where(eq(instances.userId, userId))

        return ok(c, userInstances, 'Subscriptions retrieved.')
    } catch (err) {
        console.error('Get subscriptions error:', err)
        return fail(c, 'Failed to get subscriptions.', 500)
    }
}
