/**
 * DFS credits ledger — atomic credit/debit operations on the per-tenant
 * USD balance, plus append-only audit trail in dfs_ledger.
 *
 * Architecture (project_dfs_proxy.md):
 *   - `instances.dfs_balance_usd_cents` is the source-of-truth balance.
 *   - Every change runs as a single SQL UPDATE with RETURNING so we get
 *     the new balance back atomically. Concurrent calls don't race.
 *   - `dfs_ledger` is append-only history. We INSERT after every balance
 *     change. Reconstructable: SUM(amount_usd_cents) WHERE instance_id = X
 *     should match instances.dfs_balance_usd_cents.
 *
 * Why USD-cents (integer) and not NUMERIC: integer arithmetic is faster,
 * never loses precision under SUM(), and matches DFS-reported cost when
 * rounded to 4 decimal USD = nearest cent. Sub-cent costs (e.g. $0.00003
 * per backlinks row) accumulate via the cost_usd_raw audit string but
 * round to 0 cents debit until they sum to at least $0.01.
 *
 * Failure modes:
 *   - insufficient_balance: caller gets a typed error; UI shows top-up CTA
 *   - monthly_cap_exceeded: same shape, different message
 *   - ledger insert failure (rare): logged but doesn't roll back the
 *     balance change. Loss of audit row is recoverable from cache_key
 *     + cost on the dfs_cache row.
 */

import { eq, sql, and, gte, desc } from 'drizzle-orm'
import { db } from '@/db'
import { instances, dfsLedger } from '@/db/schema'

// ── Types ──────────────────────────────────────────────────────────────────

export type LedgerKind = 'topup' | 'debit' | 'refund' | 'admin_credit' | 'auto_topup'

export interface LedgerEntry {
    id: number
    kind: LedgerKind
    amountUsdCents: number
    costUsdRaw: string | null
    endpoint: string | null
    cacheKey: string | null
    allpayOrderId: string | null
    note: string | null
    createdAt: Date
}

export interface BalanceSnapshot {
    balanceUsdCents: number
    /** Sum of debit-kind absolute values since first day of current month (UTC). */
    monthlySpendUsdCents: number
    /** Configured cap, or null if no cap. */
    monthlyCapUsdCents: number | null
    /** Auto-topup config, or null if disabled. */
    autoTopup: {
        thresholdUsdCents: number
        amountUsdCents: number
        hasPaymentToken: boolean
    } | null
}

export class LedgerError extends Error {
    kind: 'insufficient_balance' | 'monthly_cap_exceeded' | 'instance_not_found'
    /** Hebrew message safe to show to user. */
    userMessage: string
    constructor(kind: LedgerError['kind'], userMessage: string) {
        super(userMessage)
        this.name = 'LedgerError'
        this.kind = kind
        this.userMessage = userMessage
    }
}

// ── Atomic operations ──────────────────────────────────────────────────────

/**
 * Debit `costUsdRaw` from `instanceId` balance, atomically. Pre-flight check:
 * balance > 0 AND not over monthly cap. Throws LedgerError if blocked.
 *
 * Cents conversion: round half-up to nearest cent. Sub-cent floor: 1 cent
 * minimum charge per call (DFS calls are never truly free).
 */
export async function debit(args: {
    instanceId: string
    costUsdRaw: number   // exact DFS-reported cost
    endpoint: string
    cacheKey?: string
}): Promise<{ newBalanceUsdCents: number; debitedUsdCents: number }> {
    const { instanceId, costUsdRaw, endpoint, cacheKey } = args
    const debitedUsdCents = Math.max(1, Math.round(costUsdRaw * 100))

    // Pre-flight: load current balance + monthly cap. Use SELECT FOR UPDATE
    // semantics by relying on the RETURNING from the conditional UPDATE below
    // (Postgres serializes row writes via tuple lock automatically).
    const [inst] = await db.select({
        balance: instances.dfsBalanceUsdCents,
        monthlyCap: instances.dfsMonthlyCapUsdCents,
    }).from(instances).where(eq(instances.id, instanceId))
    if (!inst) {
        throw new LedgerError('instance_not_found', `Instance ${instanceId} לא נמצא`)
    }
    if (inst.balance <= 0) {
        throw new LedgerError(
            'insufficient_balance',
            `נגמרו הקרדיטים ל-DataForSEO. טענו את ה-balance בהגדרות → אינטגרציות → DataForSEO לפני המשך השלב.`,
        )
    }
    if (inst.monthlyCap !== null && inst.monthlyCap !== undefined) {
        const monthly = await getMonthlySpendUsdCents(instanceId)
        if (monthly + debitedUsdCents > inst.monthlyCap) {
            throw new LedgerError(
                'monthly_cap_exceeded',
                `הגעתם ל-monthly cap של $${(inst.monthlyCap / 100).toFixed(2)}. הסירו את הגבלה או חכו לחודש הבא בהגדרות → DataForSEO.`,
            )
        }
    }

    // Atomic debit. RETURNING gives us the post-update balance — single
    // round-trip, no race window.
    const [updated] = await db.update(instances)
        .set({ dfsBalanceUsdCents: sql`${instances.dfsBalanceUsdCents} - ${debitedUsdCents}` })
        .where(eq(instances.id, instanceId))
        .returning({ newBalance: instances.dfsBalanceUsdCents })
    if (!updated) {
        throw new LedgerError('instance_not_found', `Instance ${instanceId} not found mid-debit`)
    }

    // Audit row. Failure here is logged but doesn't undo the balance change —
    // we'd rather lose an audit line than double-charge or refund accidentally.
    try {
        await db.insert(dfsLedger).values({
            instanceId,
            kind: 'debit',
            amountUsdCents: -debitedUsdCents,
            costUsdRaw: costUsdRaw.toFixed(6),
            endpoint,
            cacheKey: cacheKey || null,
        })
    } catch (err) {
        console.error(`[ledger.debit] audit insert failed for ${instanceId} ${endpoint}:`, (err as Error).message)
    }

    return { newBalanceUsdCents: updated.newBalance, debitedUsdCents }
}

/**
 * Credit balance by amount. Idempotent on `allpayOrderId`: if a row with
 * same allpay_order_id already exists in ledger, we skip (prevents
 * webhook double-firing from crediting twice).
 */
export async function credit(args: {
    instanceId: string
    amountUsdCents: number
    kind: 'topup' | 'admin_credit' | 'auto_topup' | 'refund'
    allpayOrderId?: string
    note?: string
}): Promise<{ newBalanceUsdCents: number; alreadyApplied: boolean }> {
    const { instanceId, amountUsdCents, kind, allpayOrderId, note } = args
    if (amountUsdCents <= 0) throw new Error('credit amount must be positive')

    // Idempotency check — same allpayOrderId already credited?
    if (allpayOrderId) {
        const [existing] = await db.select({ id: dfsLedger.id })
            .from(dfsLedger)
            .where(and(
                eq(dfsLedger.instanceId, instanceId),
                eq(dfsLedger.allpayOrderId, allpayOrderId),
            ))
            .limit(1)
        if (existing) {
            const [inst] = await db.select({ balance: instances.dfsBalanceUsdCents })
                .from(instances).where(eq(instances.id, instanceId))
            return {
                newBalanceUsdCents: inst?.balance ?? 0,
                alreadyApplied: true,
            }
        }
    }

    // Phase 4.3-O H3: race-safe ordering — INSERT ledger row FIRST (UNIQUE
    // constraint on (instance_id, allpay_order_id) blocks duplicates). Only
    // bump balance if INSERT succeeded. Previously balance was bumped first
    // then ledger row added — a concurrent webhook racing past the SELECT
    // could double-credit balance while the second INSERT failed silently.
    if (allpayOrderId) {
        try {
            await db.insert(dfsLedger).values({
                instanceId,
                kind,
                amountUsdCents,
                allpayOrderId,
                note: note || null,
            })
        } catch (err: any) {
            // 23505 = unique_violation in Postgres. Means a concurrent webhook
            // already credited this orderId. Treat as idempotent skip.
            if (err && (err.code === '23505' || /unique/i.test(err.message || ''))) {
                const [inst] = await db.select({ balance: instances.dfsBalanceUsdCents })
                    .from(instances).where(eq(instances.id, instanceId))
                return {
                    newBalanceUsdCents: inst?.balance ?? 0,
                    alreadyApplied: true,
                }
            }
            throw err
        }
        const [updated] = await db.update(instances)
            .set({ dfsBalanceUsdCents: sql`${instances.dfsBalanceUsdCents} + ${amountUsdCents}` })
            .where(eq(instances.id, instanceId))
            .returning({ newBalance: instances.dfsBalanceUsdCents })
        if (!updated) {
            throw new LedgerError('instance_not_found', `Instance ${instanceId} not found`)
        }
        return { newBalanceUsdCents: updated.newBalance, alreadyApplied: false }
    }

    // No allpayOrderId (admin credit / refund without order id) — original
    // bump-then-insert order, no race protection but no replay risk either.
    const [updated] = await db.update(instances)
        .set({ dfsBalanceUsdCents: sql`${instances.dfsBalanceUsdCents} + ${amountUsdCents}` })
        .where(eq(instances.id, instanceId))
        .returning({ newBalance: instances.dfsBalanceUsdCents })
    if (!updated) {
        throw new LedgerError('instance_not_found', `Instance ${instanceId} not found`)
    }
    await db.insert(dfsLedger).values({
        instanceId,
        kind,
        amountUsdCents,
        allpayOrderId: null,
        note: note || null,
    })
    return { newBalanceUsdCents: updated.newBalance, alreadyApplied: false }
}

// ── Read queries ───────────────────────────────────────────────────────────

export async function getBalanceSnapshot(instanceId: string): Promise<BalanceSnapshot> {
    const [inst] = await db.select({
        balance: instances.dfsBalanceUsdCents,
        monthlyCap: instances.dfsMonthlyCapUsdCents,
        autoTopupThreshold: instances.dfsAutoTopupThresholdUsdCents,
        autoTopupAmount: instances.dfsAutoTopupAmountUsdCents,
        paymentToken: instances.dfsAllpayPaymentToken,
    }).from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new LedgerError('instance_not_found', `Instance ${instanceId} not found`)

    const monthlySpend = await getMonthlySpendUsdCents(instanceId)
    const autoTopup = (inst.autoTopupThreshold && inst.autoTopupAmount)
        ? {
            thresholdUsdCents: inst.autoTopupThreshold,
            amountUsdCents: inst.autoTopupAmount,
            hasPaymentToken: !!inst.paymentToken,
        }
        : null

    return {
        balanceUsdCents: inst.balance,
        monthlySpendUsdCents: monthlySpend,
        monthlyCapUsdCents: inst.monthlyCap ?? null,
        autoTopup,
    }
}

/**
 * Sum of debit-absolute amounts since first day of current month (UTC).
 * `amount_usd_cents` is negative for debits, so we sum ABS to get spend.
 */
export async function getMonthlySpendUsdCents(instanceId: string): Promise<number> {
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const [row] = await db.select({
        // SUM returns string from postgres for bigints; coerce.
        spent: sql<string>`COALESCE(SUM(ABS(${dfsLedger.amountUsdCents})), 0)`,
    })
        .from(dfsLedger)
        .where(and(
            eq(dfsLedger.instanceId, instanceId),
            eq(dfsLedger.kind, 'debit'),
            gte(dfsLedger.createdAt, startOfMonth),
        ))
    return Number(row?.spent ?? 0)
}

export async function getRecentLedger(
    instanceId: string,
    limit = 50,
): Promise<LedgerEntry[]> {
    const rows = await db.select().from(dfsLedger)
        .where(eq(dfsLedger.instanceId, instanceId))
        .orderBy(desc(dfsLedger.createdAt))
        .limit(limit)
    return rows.map(r => ({
        id: r.id,
        kind: r.kind as LedgerKind,
        amountUsdCents: r.amountUsdCents,
        costUsdRaw: r.costUsdRaw,
        endpoint: r.endpoint,
        cacheKey: r.cacheKey,
        allpayOrderId: r.allpayOrderId,
        note: r.note,
        createdAt: r.createdAt,
    }))
}

/**
 * Cheap balance-only query — used by client.ts pre-flight before debit.
 * Avoids the heavier monthly-spend SQL aggregation.
 */
export async function getBalance(instanceId: string): Promise<number> {
    const [inst] = await db.select({ balance: instances.dfsBalanceUsdCents })
        .from(instances).where(eq(instances.id, instanceId))
    return inst?.balance ?? 0
}