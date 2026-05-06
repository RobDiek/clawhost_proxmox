/**
 * AllPay top-up flow for DFS credits. Same AllPay account as VPS
 * subscriptions; distinguished by `add_field_2 = 'dfs_topup'` so the
 * shared webhook controller branches correctly.
 *
 * Architecture (per project_dfs_proxy.md):
 *   1. User picks USD amount → `createTopupCheckout` computes ILS using
 *      `usd_to_ils_rate_with_fee` (fee baked in) and calls AllPay
 *      `createOneTimePayment`. Returns AllPay checkout URL.
 *   2. User pays at AllPay → AllPay POSTs webhook → shared
 *      `handleAllpayWebhook` routes to `handleTopupWebhook` here.
 *   3. We verify, idempotency-check (allpay_order_id), credit balance via
 *      ledger.credit, ledger row gets kind='topup'.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, users } from '@/db/schema'
import allpay from '@/services/allpay'
import { credit, LedgerError } from './ledger'
import { getSystemConfig } from './systemConfig'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'

interface CreateCheckoutInput {
    instanceId: string
    /** Whole-USD amount, validated upstream (min $10). */
    amountUsd: number
}

interface CreateCheckoutResult {
    paymentUrl: string
    orderId: string
    amountUsdCents: number
    amountIls: number
    fxRate: number
}

/**
 * Build an AllPay checkout for a one-time DFS credits top-up.
 *
 * USD → ILS conversion uses the daily-pinned rate from system_config which
 * already includes the AllPay fee buffer. User sees the ILS amount before
 * confirming payment; we credit the exact USD amount on webhook success.
 */
export async function createTopupCheckout(args: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const { instanceId, amountUsd } = args
    if (amountUsd < 10 || amountUsd > 10000) {
        throw new Error('Top-up amount must be between $10 and $10,000')
    }

    const [inst] = await db.select({
        userId: instances.userId,
    }).from(instances).where(eq(instances.id, instanceId))
    if (!inst?.userId) throw new Error(`Instance ${instanceId} not found or has no owner`)

    const [user] = await db.select({
        email: users.email,
        name: users.name,
    }).from(users).where(eq(users.id, inst.userId))
    if (!user?.email) throw new Error(`User for instance ${instanceId} not found`)

    const fxRateStr = await getSystemConfig('usd_to_ils_rate_with_fee', '3.81')
    const fxRate = parseFloat(fxRateStr)
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
        throw new Error(`Invalid FX rate in system_config: ${fxRateStr}`)
    }
    const amountIls = Math.round(amountUsd * fxRate * 100) / 100  // 2 decimal places

    const amountUsdCents = Math.round(amountUsd * 100)
    const orderId = `dfs-${instanceId}-${Date.now()}`

    const paymentUrl = await allpay.createOneTimePayment({
        orderId,
        items: [{
            // Hebrew item name on the AllPay receipt + хашבונית מס
            name: `קרדיטים DataForSEO ($${amountUsd})`,
            price: amountIls,
            qty: 1,
        }],
        customerEmail: user.email,
        customerName: user.name || user.email.split('@')[0],
        // AllPay requires a phone field; users table doesn't carry one.
        // Placeholder is harmless — receipt issued by AllPay with email anchor.
        customerPhone: '0500000000',
        successUrl: `${FRONTEND_URL}/dashboard?topup=success`,
        failUrl: `${FRONTEND_URL}/dashboard?topup=failed`,
        webhookUrl: `${process.env.API_URL || 'https://api.clawflow.flowmatic.co.il'}/hosting/webhooks/allpay`,
        metadata: {
            instanceId,
            topupKind: 'dfs_topup',
            amountUsdCents,
        },
    })

    console.log(`[allpayTopup] checkout created: instance=${instanceId} usd=$${amountUsd} ils=₪${amountIls} fxRate=${fxRate} orderId=${orderId}`)

    return { paymentUrl, orderId, amountUsdCents, amountIls, fxRate }
}

/**
 * Webhook router for top-up payments. Called by `handleAllpayWebhook` when
 * `metadata.planKey === 'dfs_topup'`. Returns whether the topup was applied.
 *
 * Idempotent on `orderId` (ledger.credit checks for duplicate
 * allpay_order_id). Failed payments (status !== 1) are silently logged
 * and produce no balance change.
 */
export async function handleTopupWebhook(args: {
    event: 'payment_success' | 'payment_failed'
    orderId: string
    instanceId: string
    amountUsdCents: number | undefined
}): Promise<{ applied: boolean; reason?: string }> {
    const { event, orderId, instanceId, amountUsdCents } = args

    if (event !== 'payment_success') {
        console.log(`[topupWebhook] ${event} for ${orderId} instance=${instanceId} — no balance change`)
        return { applied: false, reason: event }
    }

    if (!amountUsdCents || amountUsdCents <= 0) {
        console.error(`[topupWebhook] missing or invalid amountUsdCents for ${orderId}`)
        return { applied: false, reason: 'missing_amount' }
    }

    try {
        const result = await credit({
            instanceId,
            amountUsdCents,
            kind: 'topup',
            allpayOrderId: orderId,
            note: `AllPay top-up`,
        })
        if (result.alreadyApplied) {
            console.log(`[topupWebhook] orderId=${orderId} already applied — idempotent skip`)
            return { applied: false, reason: 'already_applied' }
        }
        console.log(`[topupWebhook] credited ${amountUsdCents}¢ to ${instanceId}, new balance: ${result.newBalanceUsdCents}¢`)
        return { applied: true }
    } catch (err) {
        if (err instanceof LedgerError) {
            console.error(`[topupWebhook] LedgerError ${err.kind}: ${err.userMessage}`)
            return { applied: false, reason: err.kind }
        }
        console.error(`[topupWebhook] unexpected error:`, (err as Error).message)
        return { applied: false, reason: 'unexpected_error' }
    }
}