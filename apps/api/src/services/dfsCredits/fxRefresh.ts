/**
 * Daily USD/ILS FX rate refresh — pulls market rate, multiplies by 1.029 to
 * absorb AllPay's ~2.9% processing fee (per playbook decision: "fee baked
 * into FX rate, no markup, no separate fee line item"), persists to
 * `system_config.usd_to_ils_rate_with_fee`.
 *
 * Source: frankfurter.app — free, ECB-backed, no API key, cached daily.
 * On failure: keeps previous value (system_config has a seeded fallback
 * that won't go stale enough to materially harm UX).
 *
 * Cadence: every 24h. First run delayed 60s after boot so DB connections
 * are warm. Errors are logged + swallowed (don't crash the process if
 * frankfurter is briefly down).
 */

import { setSystemConfig } from './systemConfig'

const FX_API_URL = 'https://api.frankfurter.app/latest?from=USD&to=ILS'
const ALLPAY_FEE_BUFFER = 1.029  // 2.9% — keeps user-paid ILS slightly above what we owe AllPay

async function fetchAndPersistRate(): Promise<void> {
    try {
        const res = await fetch(FX_API_URL, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) {
            console.warn(`[fxRefresh] frankfurter HTTP ${res.status} — skipping update`)
            return
        }
        const data = await res.json() as { rates?: { ILS?: number } }
        const market = data?.rates?.ILS
        if (typeof market !== 'number' || market <= 0 || market > 20) {
            console.warn(`[fxRefresh] frankfurter returned suspicious rate:`, JSON.stringify(data).substring(0, 200))
            return
        }
        const withFee = (market * ALLPAY_FEE_BUFFER).toFixed(4)
        await setSystemConfig('usd_to_ils_rate_with_fee', withFee)
        console.log(`[fxRefresh] USD/ILS market=${market} with fee buffer (×${ALLPAY_FEE_BUFFER})=${withFee}`)
    } catch (err) {
        console.error('[fxRefresh] error:', (err as Error).message)
    }
}

export function startFxRefreshCron(): void {
    console.log('[fxRefresh] starting (daily; first run in 60s)')
    setTimeout(fetchAndPersistRate, 60_000)
    setInterval(fetchAndPersistRate, 24 * 60 * 60 * 1000)
}

// Direct callable for cron-list / on-demand admin refresh.
export const refreshFxRate = fetchAndPersistRate