/**
 * FX service for data ingestion — convert ad spend in any source currency
 * to ILS at ingestion time. Used by mappers; the resulting fx_rate is stored
 * on every ingested_data_points row for audit.
 *
 * Distinct from services/dfsCredits/fxRefresh.ts (which is USD→ILS *with
 * AllPay fee buffer*, used for billing). Here we want pure market rate so
 * "spend in ILS" matches what the user actually paid for ads.
 *
 * Source: frankfurter.app (free, ECB-backed, no key). Cached daily per
 * currency in `system_config` under keys `fx_rate_<lower>_to_ils`.
 *
 * If frankfurter is unreachable AND no cache exists: use a seed fallback
 * (sufficient to avoid breaking ingestion of historical data; downstream
 * analyses flag rows as `flags=['currency_fx_stale']` so they're surfaced).
 */

import { getSystemConfig, setSystemConfig } from '../dfsCredits/systemConfig'

const FRANKFURTER_BASE = 'https://api.frankfurter.app/latest'

// Seed fallbacks — refreshed roughly at platform launch. The cron updates
// these in system_config daily so production reads stay fresh. If a user
// ever ingests a currency we haven't seen, mappers fall through to USD.
const SEED_RATES: Record<string, number> = {
    USD: 3.65,
    EUR: 3.95,
    GBP: 4.62,
    ILS: 1.0,
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'AED', 'CAD', 'AUD'] as const
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number] | string

function configKey(from: string): string {
    return `fx_rate_${from.toLowerCase()}_to_ils`
}

/**
 * Get the cached daily ILS-conversion rate for a given source currency.
 * Returns 1.0 for ILS. Falls back to SEED_RATES if no cache + no network.
 */
export async function getRateToIls(fromCurrency: string): Promise<{ rate: number; stale: boolean }> {
    const code = fromCurrency.trim().toUpperCase()
    if (code === 'ILS') return { rate: 1.0, stale: false }

    const seed = SEED_RATES[code] ?? SEED_RATES.USD
    const raw = await getSystemConfig(configKey(code), String(seed))
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 100) {
        return { rate: parsed, stale: false }
    }
    return { rate: seed, stale: true }
}

/**
 * Fetch market rate for one currency → ILS from frankfurter and persist.
 * Called by the cron + by the ingestion path when it sees a currency it
 * hasn't cached yet.
 */
export async function refreshRateToIls(fromCurrency: string): Promise<number | null> {
    const code = fromCurrency.trim().toUpperCase()
    if (code === 'ILS') return 1.0
    try {
        const res = await fetch(`${FRANKFURTER_BASE}?from=${code}&to=ILS`, {
            signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
            console.warn(`[dataIngestion/fx] frankfurter HTTP ${res.status} for ${code}`)
            return null
        }
        const data = await res.json() as { rates?: { ILS?: number } }
        const rate = data?.rates?.ILS
        if (typeof rate !== 'number' || rate <= 0 || rate > 100) {
            console.warn(`[dataIngestion/fx] suspicious rate for ${code}:`, rate)
            return null
        }
        await setSystemConfig(configKey(code), String(rate.toFixed(6)))
        return rate
    } catch (err) {
        console.warn(`[dataIngestion/fx] refresh ${code} failed:`, (err as Error).message)
        return null
    }
}

/**
 * Convert amount in source currency to ILS. Returns the converted amount,
 * applied rate, and a flag if the rate is stale (seed fallback).
 */
export async function toIls(amount: number, fromCurrency: string): Promise<{
    amountIls: number
    fxRate: number
    stale: boolean
}> {
    if (!Number.isFinite(amount)) return { amountIls: 0, fxRate: 0, stale: true }
    const { rate, stale } = await getRateToIls(fromCurrency)
    return {
        amountIls: amount * rate,
        fxRate: rate,
        stale,
    }
}

/**
 * Refresh all common ad-platform currencies → ILS. Wired to the existing
 * daily FX cron in services/dfsCredits/fxRefresh.ts on start.
 */
export async function refreshAllIngestionRates(): Promise<void> {
    for (const code of SUPPORTED_CURRENCIES) {
        if (code === 'ILS') continue
        await refreshRateToIls(code).catch(() => null)
    }
}