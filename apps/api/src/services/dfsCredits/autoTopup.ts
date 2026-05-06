/**
 * Auto-topup runner — hourly check. For each instance with auto-topup
 * configured AND balance below threshold AND a stored AllPay payment
 * token, charge the token for the configured amount and credit on success.
 *
 * Why hourly: balances drift gradually with normal SEO usage; a 1h
 * granularity is enough to refill before the user notices. Cheaper than
 * per-call triggers and survives transient AllPay/network failures.
 *
 * Failure modes:
 *   - Charge fails (card expired, insufficient funds at issuer): log
 *     warning, leave balance as-is. Next hour we'll retry. After N
 *     consecutive failures we'd want to email user — Phase 3.6d adds
 *     that UX; the cron just retries silently for v1.
 *   - Token revoked (user removed card from AllPay): same as above.
 *
 * Idempotency: we generate a synthetic orderId per attempt
 * (`auto-{instanceId}-{timestamp}`) and ledger.credit deduplicates on it.
 */

import { eq, isNotNull, lt, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { credit } from './ledger'
import { getSystemConfig } from './systemConfig'
import allpay from '@/services/allpay'

const POLL_INTERVAL_MS = 60 * 60 * 1000

async function runAutoTopupSweep(): Promise<void> {
    let candidates: Array<{
        id: string
        balance: number
        threshold: number
        amount: number
        paymentToken: string
    }> = []

    try {
        const rows = await db.select({
            id: instances.id,
            balance: instances.dfsBalanceUsdCents,
            threshold: instances.dfsAutoTopupThresholdUsdCents,
            amount: instances.dfsAutoTopupAmountUsdCents,
            paymentToken: instances.dfsAllpayPaymentToken,
        }).from(instances).where(and(
            eq(instances.dfsUseProxy, true),
            isNotNull(instances.dfsAutoTopupThresholdUsdCents),
            isNotNull(instances.dfsAutoTopupAmountUsdCents),
            isNotNull(instances.dfsAllpayPaymentToken),
            lt(instances.dfsBalanceUsdCents, instances.dfsAutoTopupThresholdUsdCents),
        ))
        candidates = rows
            .filter(r => r.threshold !== null && r.amount !== null && r.paymentToken !== null)
            .map(r => ({
                id: r.id,
                balance: r.balance,
                threshold: r.threshold as number,
                amount: r.amount as number,
                paymentToken: r.paymentToken as string,
            }))
    } catch (err) {
        console.error('[autoTopup] sweep query failed:', (err as Error).message)
        return
    }

    if (candidates.length === 0) return
    console.log(`[autoTopup] ${candidates.length} candidate(s) below threshold`)

    for (const c of candidates) {
        await chargeOne(c).catch(err => {
            console.error(`[autoTopup] ${c.id} charge failed:`, (err as Error).message)
        })
    }
}

async function chargeOne(c: {
    id: string; balance: number; threshold: number; amount: number; paymentToken: string
}): Promise<void> {
    const amountUsd = c.amount / 100
    const fxRateStr = await getSystemConfig('usd_to_ils_rate_with_fee', '3.81')
    const fxRate = parseFloat(fxRateStr) || 3.81
    const amountIls = Math.round(amountUsd * fxRate * 100) / 100
    const orderId = `auto-${c.id}-${Date.now()}`

    let chargeResult: { status: number; amount: number; orderId: string }
    try {
        chargeResult = await allpay.chargeStoredToken({
            allpayToken: c.paymentToken,
            orderId,
            amountIls,
            itemName: `קרדיטים DataForSEO ($${amountUsd}) — auto-topup`,
            metadata: {
                instanceId: c.id,
                topupKind: 'dfs_topup',
                amountUsdCents: c.amount,
            },
        })
    } catch (err) {
        // Token revoked / card expired / AllPay down — log and let next hour retry.
        console.error(`[autoTopup] ${c.id} AllPay chargeStoredToken failed:`, (err as Error).message)
        return
    }

    if (chargeResult.status !== 1) {
        console.warn(`[autoTopup] ${c.id} charge status=${chargeResult.status} (not success). orderId=${orderId}`)
        return
    }

    // Charge succeeded — credit balance idempotently. Webhook may also fire
    // for this transaction; ledger.credit dedups on allpayOrderId so no
    // double-credit risk.
    try {
        const result = await credit({
            instanceId: c.id,
            amountUsdCents: c.amount,
            kind: 'auto_topup',
            allpayOrderId: chargeResult.orderId,
            note: `Auto-topup at threshold $${(c.threshold / 100).toFixed(2)}`,
        })
        if (result.alreadyApplied) {
            console.log(`[autoTopup] ${c.id} already credited (webhook beat us) — no-op`)
        } else {
            console.log(`[autoTopup] ${c.id} +${c.amount}¢ → balance ${result.newBalanceUsdCents}¢ (orderId=${chargeResult.orderId})`)
        }
    } catch (err) {
        console.error(`[autoTopup] ${c.id} credit failed AFTER successful charge:`, (err as Error).message)
        // Manual recon: AllPay charge succeeded, our credit failed. Audit
        // log via grep '[autoTopup]' + chargeResult.orderId picks this up.
    }
}

export function startAutoTopupCron(): void {
    console.log('[autoTopup] starting (hourly; first run in 90s)')
    setTimeout(runAutoTopupSweep, 90_000)
    setInterval(runAutoTopupSweep, POLL_INTERVAL_MS)
}

export const sweepAutoTopupOnce = runAutoTopupSweep