/**
 * DFS credits controllers — Phase 3.6.
 *
 * Per-tenant balance is the source of truth. AllPay tops it up; DFS calls
 * (services/research/dataforseo/client.ts) debit it. This module exposes:
 *
 *   GET  /credits/balance           → current balance + monthly spend + caps
 *   GET  /credits/ledger            → recent transactions for the audit panel
 *   POST /credits/topup/checkout    → AllPay checkout URL for { amount_usd }
 *   PATCH /credits/settings         → auto-topup + monthly cap config
 *   POST /admin/credits/grant       → admin-only manual credit (bootstrap, refunds)
 *
 * AllPay webhook lives separately at /credits/topup/webhook (3.6c) — it's
 * unauthenticated except for HMAC, lives outside the JWT-auth router prefix.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import {
    getBalanceSnapshot,
    getRecentLedger,
    credit,
    LedgerError,
} from '@/services/dfsCredits/ledger'
import { getSystemConfig } from '@/services/dfsCredits/systemConfig'

// ── GET /credits/balance ────────────────────────────────────────────────────

export const getCreditsBalance = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const snap = await getBalanceSnapshot(instanceId)
        const fxRate = await getSystemConfig('usd_to_ils_rate_with_fee', '3.81')
        return ok(c, {
            balanceUsdCents: snap.balanceUsdCents,
            monthlySpendUsdCents: snap.monthlySpendUsdCents,
            monthlyCapUsdCents: snap.monthlyCapUsdCents,
            autoTopup: snap.autoTopup,
            usdToIlsRate: parseFloat(fxRate),  // already includes AllPay fee buffer
        }, 'Balance loaded')
    } catch (err) {
        console.error('getCreditsBalance error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── GET /credits/ledger ────────────────────────────────────────────────────

export const getCreditsLedger = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const limit = Math.min(200, parseInt(c.req.query('limit') || '50', 10))
        const entries = await getRecentLedger(instanceId, limit)
        return ok(c, { entries }, 'Ledger loaded')
    } catch (err) {
        console.error('getCreditsLedger error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── PATCH /credits/settings ────────────────────────────────────────────────

interface CreditsSettingsBody {
    /** USD whole dollars (we convert to cents). Pass null to disable auto-topup. */
    autoTopupThresholdUsd?: number | null
    autoTopupAmountUsd?: number | null
    /** USD whole dollars per month. Pass null to remove cap. */
    monthlyCapUsd?: number | null
}

export const updateCreditsSettings = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<CreditsSettingsBody>().catch(() => ({} as CreditsSettingsBody))
        // Validate: thresholds + cap must be positive when set, both auto-topup
        // fields must be set together (or both null).
        const tCents = body.autoTopupThresholdUsd === null
            ? null : (typeof body.autoTopupThresholdUsd === 'number' ? Math.round(body.autoTopupThresholdUsd * 100) : undefined)
        const aCents = body.autoTopupAmountUsd === null
            ? null : (typeof body.autoTopupAmountUsd === 'number' ? Math.round(body.autoTopupAmountUsd * 100) : undefined)
        const cCents = body.monthlyCapUsd === null
            ? null : (typeof body.monthlyCapUsd === 'number' ? Math.round(body.monthlyCapUsd * 100) : undefined)

        if ((tCents !== undefined && aCents === undefined) || (aCents !== undefined && tCents === undefined)) {
            return fail(c, 'auto-topup threshold ו-amount חייבים להיות מוגדרים יחד או null יחד', 400)
        }
        if (tCents !== undefined && tCents !== null && tCents < 100) {
            return fail(c, 'auto-topup threshold לא יכול להיות קטן מ-$1', 400)
        }
        if (aCents !== undefined && aCents !== null && aCents < 1000) {
            return fail(c, 'auto-topup amount לא יכול להיות קטן מ-$10', 400)
        }
        if (cCents !== undefined && cCents !== null && cCents < 100) {
            return fail(c, 'monthly cap לא יכול להיות קטן מ-$1', 400)
        }

        const updateSet: Record<string, unknown> = {}
        if (tCents !== undefined) updateSet.dfsAutoTopupThresholdUsdCents = tCents
        if (aCents !== undefined) updateSet.dfsAutoTopupAmountUsdCents = aCents
        if (cCents !== undefined) updateSet.dfsMonthlyCapUsdCents = cCents

        if (Object.keys(updateSet).length === 0) return fail(c, 'אין שדות לעדכן', 400)

        await db.update(instances).set(updateSet).where(eq(instances.id, instanceId))
        const snap = await getBalanceSnapshot(instanceId)
        return ok(c, {
            monthlyCapUsdCents: snap.monthlyCapUsdCents,
            autoTopup: snap.autoTopup,
        }, 'Settings updated')
    } catch (err) {
        console.error('updateCreditsSettings error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

// ── POST /admin/credits/grant ──────────────────────────────────────────────
// Admin-only manual credit. Used for: bootstrap testing, customer service
// refunds, welcome credits, edge-case adjustments. AllPay isn't involved.

interface AdminGrantBody {
    instanceId: string
    amountUsd: number
    note: string
}

export const adminGrantCredits = async (c: Context) => {
    try {
        const body = await c.req.json<AdminGrantBody>().catch(() => null)
        if (!body || !body.instanceId || typeof body.amountUsd !== 'number' || !body.note) {
            return fail(c, 'instanceId + amountUsd + note required', 400)
        }
        if (body.amountUsd <= 0 || body.amountUsd > 10000) {
            return fail(c, 'amountUsd must be 0 < x <= 10000', 400)
        }
        const amountUsdCents = Math.round(body.amountUsd * 100)
        const result = await credit({
            instanceId: body.instanceId,
            amountUsdCents,
            kind: 'admin_credit',
            note: body.note,
        })
        return ok(c, {
            instanceId: body.instanceId,
            credited: amountUsdCents,
            newBalance: result.newBalanceUsdCents,
        }, 'Admin credit applied')
    } catch (err) {
        if (err instanceof LedgerError) {
            return fail(c, err.userMessage, 404)
        }
        console.error('adminGrantCredits error:', err)
        return fail(c, (err as Error).message, 500)
    }
}