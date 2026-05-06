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
    // AllPay recurring-charge API for stored tokens isn't yet wired into
    // services/allpay.ts. Phase 3.6c ships the cron skeleton + ledger path;
    // Phase 3.6c-followup adds the actual `chargeStoredToken` method once
    // AllPay's recurring API spec is integrated. Until then this logs the
    // intent so admin can manually grant credit if needed.
    //
    // TODO (3.6c-followup): wire allpay.chargeStoredToken(token, amount, orderId)
    // and call credit() with kind='auto_topup' + the AllPay-returned orderId.
    console.warn(`[autoTopup] WIRING_PENDING — would charge ${c.id}: balance=${c.balance}¢ threshold=${c.threshold}¢ amount=${c.amount}¢. allpay.chargeStoredToken not yet implemented.`)
    // No-op for now; ledger.credit call below stays commented until charge is real.
    void credit
}

export function startAutoTopupCron(): void {
    console.log('[autoTopup] starting (hourly; first run in 90s)')
    setTimeout(runAutoTopupSweep, 90_000)
    setInterval(runAutoTopupSweep, POLL_INTERVAL_MS)
}

export const sweepAutoTopupOnce = runAutoTopupSweep