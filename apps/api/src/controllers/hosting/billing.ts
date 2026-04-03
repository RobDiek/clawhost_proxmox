import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import crypto, { randomBytes } from 'crypto'
import { calcTotal } from '@openclaw/shared'
import { db } from '@/db'
import { instances, payments, users } from '@/db/schema'
import { eq, and, lt, ne } from 'drizzle-orm'
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
    const secret = process.env.JWT_SECRET || ''
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
            customerPhone,
            subdomainName,
            billingPeriod
        } = body as {
            components: string[]
            automationTool: 'n8n' | 'activepieces'
            addons: string[]
            customerEmail: string
            customerName: string
            customerPhone: string
            subdomainName?: string
            billingPeriod?: string
        }

        const isAnnual = billingPeriod === 'annual'
        const discount = isAnnual ? 0.82 : 1  // 18% discount for annual

        if (!components?.length) {
            return fail(c, 'At least one component is required.', 400)
        }
        if (!customerEmail || !customerName) {
            return fail(c, 'Customer details are required.', 400)
        }

        // Check subdomain availability
        if (subdomainName) {
            // Auto-cleanup: delete ANY awaiting_payment instance with this subdomain
            // (user abandoned checkout — safe to reclaim)
            const stalePayments = await db.select({ id: instances.id })
                .from(instances)
                .where(and(
                    eq(instances.subdomainName, subdomainName),
                    eq(instances.status, 'awaiting_payment')
                ))
            for (const stale of stalePayments) {
                await db.delete(payments).where(eq(payments.instanceId, stale.id)).catch(() => {})
                await db.delete(instances).where(eq(instances.id, stale.id)).catch(() => {})
            }

            // Now check if subdomain is taken by an ACTIVE instance
            const [existing] = await db.select({ id: instances.id, status: instances.status })
                .from(instances)
                .where(eq(instances.subdomainName, subdomainName))
            if (existing) {
                return fail(c, 'הכתובת תפוסה, בחרו שם אחר.', 409)
            }
        }

        const pricing = calcTotal(components, addons || [])
        const instanceId = generateId()
        const orderId = `oc-${instanceId}-${Date.now()}`

        // Check if user already used their trial (1 trial per user)
        const existingInstances = await db.select({ id: instances.id, trialEndsAt: instances.trialEndsAt })
            .from(instances)
            .where(and(eq(instances.userId, userId), ne(instances.status, 'awaiting_payment')))
        const hadTrial = existingInstances.some(i => i.trialEndsAt !== null)

        const TRIAL_DAYS = hadTrial ? 0 : 7
        const trialEndsAt = TRIAL_DAYS > 0 ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000) : null

        // Extract storage GB from addons
        let storageGb = 0
        if (addons?.includes('storage_20')) storageGb = 20
        else if (addons?.includes('storage_100')) storageGb = 100
        else if (addons?.includes('storage_500')) storageGb = 500

        await db.insert(instances).values({
            id: instanceId,
            userId,
            selectedComponents: components,
            automationTool: automationTool || 'activepieces',
            aiProvider: 'apikey',
            planKey: pricing.planKey,
            priceIls: String(isAnnual ? Math.round(pricing.totalPrice * discount) : pricing.totalPrice),
            storageGb,
            status: 'awaiting_payment',
            allpayOrderId: orderId,
            subdomainName: subdomainName || null,
            trialEndsAt,
            onboardingStep: 0,
            onboardingCompleted: false
        })

        // Save customer name to user profile
        if (customerName && userId) {
            await db.update(users).set({ name: customerName }).where(eq(users.id, userId)).catch(() => {})
        }

        await db.insert(payments).values({
            id: generateId(),
            instanceId,
            allpayOrderId: orderId,
            amountIls: String(chargePrice),
            status: 'pending'
        })

        const frontendUrl = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'
        const apiUrl = process.env.API_URL || 'https://api.clawflow.flowmatic.co.il'

        let paymentUrl = ''
        const isTestMode = process.env.ALLPAY_TEST_MODE === 'true'

        const monthlyPrice = Math.round(pricing.totalPrice * discount)
        const chargePrice = isAnnual ? monthlyPrice * 12 : monthlyPrice
        const planLabel = isAnnual
            ? `ClawFlow — ${pricing.plan.nameHe} (שנתי)`
            : `ClawFlow — ${pricing.plan.nameHe}`

        try {
            paymentUrl = await allpay.createSubscription({
                orderId,
                items: [{
                    name: planLabel,
                    price: chargePrice,
                    qty: 1
                }],
                planKey: pricing.planKey,
                customerEmail,
                customerName,
                customerPhone,
                successUrl: `${frontendUrl}/onboarding.html?instance=${instanceId}`,
                failUrl: `${frontendUrl}/checkout.html?failed=1`,
                webhookUrl: `${apiUrl}/hosting/webhooks/allpay`,
                metadata: { instanceId, planKey: pricing.planKey },
                trialDays: TRIAL_DAYS || undefined,
                isAnnual,
            })
        } catch (allpayErr) {
            console.error('AllPay error (continuing in test mode):', allpayErr)

            if (isTestMode) {
                paymentUrl = `${frontendUrl}/onboarding.html?instance=${instanceId}`

                await db.update(instances)
                    .set({ status: 'provisioning', subscriptionStatus: 'active' })
                    .where(eq(instances.id, instanceId))

                await db.update(payments)
                    .set({ status: 'paid', paidAt: new Date() })
                    .where(eq(payments.allpayOrderId, orderId))

                // Start real provisioning in background
                const hasOllama = components.includes('ol')
                const hasBackup = (addons || []).includes('backup')
                const autoTool = (automationTool || 'activepieces') as 'n8n' | 'activepieces'

                provisioner.provision({
                    instanceId,
                    planKey: pricing.planKey,
                    automationTool: autoTool,
                    hasOllama,
                    hasBackup,
                    subdomainName: subdomainName || undefined,
                }).then(async (result) => {
                    await db.update(instances).set({
                        status: 'initializing',
                        hetznerServerId: result.serverId,
                        ip: result.ip,
                        openclawToken: result.openclawToken,
                        automationPassword: result.automationPassword,
                        rootPassword: result.rootPassword,
                        subdomainAgent: result.subdomainAgent,
                        subdomainFlows: result.subdomainFlows,
                    }).where(eq(instances.id, instanceId))

                    return provisioner.pollUntilReady(instanceId, result.serverId, result.subdomainAgent, result.ip).then(async (isReady) => {
                        // Auto-create automation owner account
                        if (isReady) {
                            try {
                                const port = autoTool === 'n8n' ? 5678 : 8080
                                await fetch(`http://${result.ip}:${port}/rest/owner/setup`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        email: customerEmail || 'admin@clawflow.local',
                                        firstName: 'ClawFlow', lastName: 'Admin',
                                        password: result.automationPassword + '1'
                                    }),
                                    signal: AbortSignal.timeout(10000)
                                })
                            } catch { /* non-critical */ }
                        }
                        return isReady
                    })
                }).then(async (ready) => {
                    // Check if this is a trial instance
                    const [freshInst] = await db.select({ trialEndsAt: instances.trialEndsAt }).from(instances).where(eq(instances.id, instanceId))
                    const finalStatus = ready ? (freshInst?.trialEndsAt ? 'trial' : 'running') : 'failed'

                    await db.update(instances)
                        .set({ status: finalStatus })
                        .where(eq(instances.id, instanceId))

                    if (ready) {
                        // Deploy health daemon now that VPS is fully ready
                        try {
                            await provisioner.deployHealthDaemon(result.ip, instanceId, result.openclawToken, result.rootPassword)
                        } catch (e) { console.error('Health daemon deploy failed (non-critical):', e) }
                        const trialLabel = freshInst?.trialEndsAt ? ' (TRIAL)' : ''
                        await telegram.alertAdmin(`✅ Instance ${instanceId} is ${finalStatus}!${trialLabel}`)
                    }
                }).catch(async (err) => {
                    console.error('Provisioning error:', err)
                    await db.update(instances)
                        .set({ status: 'failed' })
                        .where(eq(instances.id, instanceId))
                    await telegram.alertAdmin(`❌ Instance ${instanceId} provisioning failed: ${err.message}`)
                })
            } else {
                return fail(c, 'Payment service unavailable.', 503)
            }
        }

        return ok(c, { paymentUrl, instanceId, orderId }, 'Checkout created.')
    } catch (err) {
        console.error('Checkout error:', err)
        return fail(c, 'Failed to create checkout.', 500)
    }
}

export const handleAllpayWebhook = async (c: Context) => {
    try {
        const body = await c.req.json() as Record<string, unknown>

        // Verify AllPay signature
        if (!allpay.verifyWebhookSignature(body)) {
            console.error('AllPay webhook: invalid signature')
            return fail(c, 'Invalid signature.', 401)
        }

        const { event, orderId, metadata } = allpay.parseWebhook(body)
        const instanceId = metadata.instanceId

        if (!instanceId) {
            return fail(c, 'Missing instanceId in metadata.', 400)
        }

        if (event === 'payment_success') {
            // Idempotency: check if already processed
            const [existingPayment] = await db.select().from(payments)
                .where(eq(payments.allpayOrderId, orderId))
            if (existingPayment?.status === 'paid') {
                return ok(c, null, 'Already processed.')
            }

            await db.update(payments)
                .set({ status: 'paid', paidAt: new Date() })
                .where(eq(payments.allpayOrderId, orderId))

            const [instance] = await db.select()
                .from(instances)
                .where(eq(instances.id, instanceId))

            if (!instance) {
                return fail(c, 'Instance not found.', 404)
            }

            // Don't re-provision if already provisioning/running
            // But allow trial instances to convert to paid
            if (instance.status === 'trial' || instance.status === 'trial_expired') {
                // Trial → paid conversion
                await db.update(instances).set({
                    status: 'running',
                    subscriptionStatus: 'active',
                    trialEndsAt: null,
                }).where(eq(instances.id, instanceId))

                // Reward referrer
                try {
                    const { rewardReferrer } = await import('./referrals')
                    await rewardReferrer(instanceId)
                } catch { /* non-critical */ }

                return ok(c, null, 'Trial converted to paid.')
            }

            if (instance.status !== 'awaiting_payment') {
                return ok(c, null, 'Instance already provisioned.')
            }

            // Set status: trial if trialEndsAt is set, otherwise active
            const isTrial = !!instance.trialEndsAt
            await db.update(instances)
                .set({
                    status: 'provisioning',
                    subscriptionStatus: isTrial ? 'trial' : 'active',
                })
                .where(eq(instances.id, instanceId))

            // Fetch customer email from user record
            const [user] = await db.select({ email: users.email }).from(users)
                .where(eq(users.id, instance.userId))
            const ownerEmail = user?.email || 'admin@clawflow.local'

            const components = (instance.selectedComponents as string[]) || []
            const hasOllama = components.includes('ol')
            const hasBackup = components.includes('bk')
            const automationTool = (instance.automationTool as 'n8n' | 'activepieces') || 'activepieces'

            const result = await provisioner.provision({
                instanceId,
                planKey: instance.planKey,
                automationTool,
                hasOllama,
                hasBackup,
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

            provisioner.pollUntilReady(instanceId, result.serverId, result.subdomainAgent, result.ip).then(async (ready) => {
                if (ready) {
                    const [freshInst2] = await db.select({ trialEndsAt: instances.trialEndsAt }).from(instances).where(eq(instances.id, instanceId))
                    await db.update(instances)
                        .set({ status: freshInst2?.trialEndsAt ? 'trial' : 'running' })
                        .where(eq(instances.id, instanceId))

                    // Auto-create n8n/Activepieces owner account
                    try {
                        const flowsPort = automationTool === 'n8n' ? 5678 : 8080
                        await fetch(`http://${result.ip}:${flowsPort}/rest/owner/setup`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                email: ownerEmail,
                                firstName: 'ClawFlow',
                                lastName: 'Admin',
                                password: result.automationPassword + '1'
                            }),
                            signal: AbortSignal.timeout(10000)
                        })
                    } catch { /* non-critical — user can setup manually */ }

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

            // Suspend instance if it was running
            const [instance] = await db.select()
                .from(instances)
                .where(eq(instances.id, instanceId))

            if (instance) {
                if (instance.status === 'running' && instance.hetznerServerId) {
                    await provisioner.suspend(instance.hetznerServerId)
                    await db.update(instances)
                        .set({ status: 'suspended', subscriptionStatus: 'payment_failed', suspendedAt: new Date() })
                        .where(eq(instances.id, instanceId))
                }

                // Notify user via Telegram
                if (instance.telegramChatId) {
                    const frontendUrl = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'
                    await telegram.notifyPaymentFailed(instance.telegramChatId, `${frontendUrl}/dashboard.html`)
                }

                // Alert admin
                await telegram.alertAdmin(`⚠️ Payment failed for instance ${instanceId}. Instance ${instance.status === 'running' ? 'suspended' : 'not provisioned'}.`)
            }

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
