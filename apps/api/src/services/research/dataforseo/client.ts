/**
 * DataForSEO HTTP client — base layer for all research-stage DFS calls.
 *
 * Authentication: dual-mode (Phase 3.6 proxy refactor).
 *   PROXY mode (default): reads master DFS_MASTER_LOGIN/PASSWORD from env,
 *     same creds for every tenant. Pre-flight checks per-tenant USD
 *     balance via ledger; post-call debits at exact DFS-reported cost.
 *     Tenant pays Flowmatic; Flowmatic pays DFS. No markup.
 *   LEGACY mode (instances.dfs_use_proxy = false): reads per-tenant
 *     `instances.dataforseo_key`. Direct relationship with DFS, no debit.
 *     Escape hatch for power users with their own DFS subscription.
 *
 * Failure modes (all hard-fail per playbook §17 — "no SEO without data"):
 *   - no_key: legacy mode, key not configured
 *   - master_creds_missing: proxy mode, env vars not set
 *   - insufficient_balance: proxy mode, ledger balance ≤ 0
 *   - monthly_cap_exceeded: proxy mode, monthly cap configured + hit
 *   - invalid_credentials / no_credits / bad_request / task_failed: from DFS
 *
 * Caching: see cache.ts. Client-level methods don't auto-cache — wrappers
 * in endpoints.ts check cache before calling, store after. Cache hits skip
 * the ledger debit since no DFS spend happened.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { debit, LedgerError } from '@/services/dfsCredits/ledger'
import type { DfsEnvelope } from './types'

const DFS_BASE_URL = 'https://api.dataforseo.com/v3'
const DEFAULT_TIMEOUT_MS = 60_000  // bulk endpoints can take 30-50s

// ── Errors ──────────────────────────────────────────────────────────────────

export type DfsErrorKind =
    | 'no_key'                  // legacy mode, tenant hasn't connected DFS
    | 'master_creds_missing'    // proxy mode, env vars unset
    | 'insufficient_balance'    // proxy mode, ledger balance ≤ 0
    | 'monthly_cap_exceeded'    // proxy mode, hit monthly cap
    | 'invalid_credentials'     // 40100 — bad login/password
    | 'no_credits'              // 40501 — DFS quota exhausted
    | 'bad_request'             // 40000 — malformed query
    | 'task_failed'             // task-level error inside response
    | 'http_error'              // network / 5xx / timeout
    | 'parse_error'             // unexpected response shape

export class DfsError extends Error {
    kind: DfsErrorKind
    /** Hebrew message safe to surface to user verbatim */
    userMessage: string
    statusCode?: number
    constructor(kind: DfsErrorKind, userMessage: string, statusCode?: number, cause?: unknown) {
        super(userMessage)
        this.name = 'DfsError'
        this.kind = kind
        this.userMessage = userMessage
        this.statusCode = statusCode
        if (cause) (this as Error & { cause?: unknown }).cause = cause
    }
}

// ── Auth + balance check ───────────────────────────────────────────────────

interface InstanceDfsContext {
    useProxy: boolean
    legacyKey: string | null
    /**
     * Master instance — the platform's OWN agents (Flowmatic's master DFS
     * account). It is never metered against a per-tenant prepaid balance:
     * proxy auth (master creds) is used, but the ledger balance check + debit
     * are skipped. Without this, a master instance with a 0 balance can't run
     * any DFS-dependent stage even though it owns the underlying DFS account.
     */
    isMaster: boolean
}

async function loadInstanceDfsContext(instanceId: string): Promise<InstanceDfsContext> {
    const [inst] = await db.select({
        dataforseoKey: instances.dataforseoKey,
        dfsUseProxy: instances.dfsUseProxy,
        isMaster: instances.isMaster,
    }).from(instances).where(eq(instances.id, instanceId))
    return {
        useProxy: inst?.dfsUseProxy ?? true,
        legacyKey: inst?.dataforseoKey ?? null,
        isMaster: !!inst?.isMaster,
    }
}

async function proxyAuthHeader(): Promise<string> {
    const login = process.env.DFS_MASTER_LOGIN
    const password = process.env.DFS_MASTER_PASSWORD
    if (!login || !password) {
        throw new DfsError(
            'master_creds_missing',
            'שירות DataForSEO זמנית לא זמין (master credentials missing). פנו לתמיכה.',
        )
    }
    return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

async function legacyAuthHeader(legacyKey: string | null): Promise<string> {
    if (!legacyKey || !legacyKey.includes(':')) {
        throw new DfsError(
            'no_key',
            'מפתח DataForSEO לא מחובר לאינסטנס. חברו מפתח בהגדרות → אינטגרציות → DataForSEO לפני הרצת המחקר.',
        )
    }
    return 'Basic ' + Buffer.from(legacyKey).toString('base64')
}

/**
 * Resolves the auth header to use for `instanceId`. Public for endpoints
 * that need raw auth (rare); most callers use dfsPost which handles auth +
 * balance + debit transparently.
 */
export async function getDfsAuthHeader(instanceId: string): Promise<string> {
    const ctx = await loadInstanceDfsContext(instanceId)
    return ctx.useProxy ? proxyAuthHeader() : legacyAuthHeader(ctx.legacyKey)
}

/**
 * Pre-flight: balance > 0 + monthly cap not exceeded. Throws DfsError on
 * fail (mapped from LedgerError). Returns silently on pass.
 *
 * We don't estimate cost upfront; per-call costs are tiny ($0.001-$0.05),
 * so balance can go slightly negative for one in-flight call. Next call
 * will fail with insufficient_balance — predictable, simple, correct.
 */
async function preflightBalanceCheck(instanceId: string): Promise<void> {
    // We use ledger.debit's pre-flight by triggering a 0-cost trial debit?
    // No — debit() does the actual write. We need a separate read-only check.
    // Reuse the same logic from ledger.debit's pre-flight section by calling
    // a lightweight version: just check balance > 0 + monthly cap.
    const { getBalance, getMonthlySpendUsdCents } = await import('@/services/dfsCredits/ledger')
    const balance = await getBalance(instanceId)
    if (balance <= 0) {
        throw new DfsError(
            'insufficient_balance',
            'נגמרו הקרדיטים ל-DataForSEO. טענו את ה-balance בהגדרות → אינטגרציות → DataForSEO לפני המשך השלב.',
        )
    }
    // Monthly cap check — only if configured.
    const [inst] = await db.select({ monthlyCap: instances.dfsMonthlyCapUsdCents })
        .from(instances).where(eq(instances.id, instanceId))
    if (inst?.monthlyCap != null) {
        const monthly = await getMonthlySpendUsdCents(instanceId)
        // Reject preemptively if already at/over cap. Per-call cost typically
        // wouldn't push us over by much, but we err strict here for predictability.
        if (monthly >= inst.monthlyCap) {
            throw new DfsError(
                'monthly_cap_exceeded',
                `הגעתם ל-monthly cap של $${(inst.monthlyCap / 100).toFixed(2)}. הסירו או העלו את הגבלה בהגדרות → DataForSEO.`,
            )
        }
    }
}

// ── Core POST ──────────────────────────────────────────────────────────────

/**
 * Posts to a DataForSEO endpoint and validates the response envelope.
 * Returns the typed `tasks[0].result` on success. Throws DfsError on failure.
 *
 * Proxy mode (default): pre-flight checks tenant balance via ledger; on
 * success debits at exact DFS-reported cost. Cache hits bypass this path
 * entirely (handled at the cachedCall layer in endpoints.ts), so cached
 * responses don't double-charge.
 *
 * @param path  Endpoint path AFTER `/v3/`, e.g. "serp/google/organic/live/advanced"
 * @param body  DFS expects an array of task descriptors (even for one task)
 */
export async function dfsPost<TResult>(
    instanceId: string,
    path: string,
    body: unknown[],
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ result: TResult[]; cost: number }> {
    const ctx = await loadInstanceDfsContext(instanceId)
    const auth = ctx.useProxy
        ? await proxyAuthHeader()
        : await legacyAuthHeader(ctx.legacyKey)

    // Pre-flight balance gate — proxy mode only, and NEVER for the master
    // instance (unmetered — owns the master DFS account). Cheap call (single
    // SELECT). We don't pre-charge or pre-estimate; just refuse if balance ≤ 0
    // OR monthly cap already exceeded. Per-call cost is tiny (~$0.001-$0.05);
    // post-call debit handles actual billing.
    if (ctx.useProxy && !ctx.isMaster) {
        await preflightBalanceCheck(instanceId)
    }

    let res: Response
    try {
        res = await fetch(`${DFS_BASE_URL}/${path}`, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        })
    } catch (err) {
        const e = err as Error
        const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError'
        throw new DfsError(
            'http_error',
            isTimeout
                ? `DataForSEO לא הגיב תוך ${Math.round(timeoutMs / 1000)} שניות. נסו שוב או בדקו סטטוס שירות.`
                : `שגיאת רשת מול DataForSEO: ${e.message}. נסו שוב.`,
            undefined,
            err,
        )
    }

    if (!res.ok) {
        // 401 = invalid auth. 402 = no credits. Others = generic HTTP.
        if (res.status === 401) {
            throw new DfsError(
                'invalid_credentials',
                'מפתח DataForSEO לא תקין. עדכנו אותו בהגדרות → אינטגרציות → DataForSEO.',
                401,
            )
        }
        if (res.status === 402) {
            throw new DfsError(
                'no_credits',
                'נגמרו הקרדיטים ב-DataForSEO. הוסיפו קרדיט ב-dataforseo.com והריצו שוב.',
                402,
            )
        }
        throw new DfsError(
            'http_error',
            `DataForSEO החזיר HTTP ${res.status}. נסו שוב או בדקו סטטוס שירות.`,
            res.status,
        )
    }

    let envelope: DfsEnvelope<TResult>
    try {
        envelope = await res.json() as DfsEnvelope<TResult>
    } catch (err) {
        throw new DfsError('parse_error', 'תגובת DataForSEO לא תקינה (לא JSON).', res.status, err)
    }

    // Top-level status_code: 20000 = OK, others = error
    if (envelope.status_code !== 20000) {
        if (envelope.status_code === 40100) {
            throw new DfsError(
                'invalid_credentials',
                'מפתח DataForSEO לא תקין. עדכנו אותו בהגדרות → אינטגרציות → DataForSEO.',
                envelope.status_code,
            )
        }
        if (envelope.status_code === 40501) {
            throw new DfsError(
                'no_credits',
                'נגמרו הקרדיטים ב-DataForSEO. הוסיפו קרדיט ב-dataforseo.com והריצו שוב.',
                envelope.status_code,
            )
        }
        if (envelope.status_code === 40000) {
            throw new DfsError(
                'bad_request',
                `שאילתה לא תקינה ל-DataForSEO: ${envelope.status_message}`,
                envelope.status_code,
            )
        }
        throw new DfsError(
            'task_failed',
            `DataForSEO החזיר שגיאה ${envelope.status_code}: ${envelope.status_message}`,
            envelope.status_code,
        )
    }

    // Task-level: at least one task must return result. DFS bills per task,
    // so a single-task body should produce a single task with result.
    if (!envelope.tasks || envelope.tasks.length === 0) {
        throw new DfsError(
            'task_failed',
            'DataForSEO לא החזיר משימות. נסו שוב.',
            envelope.status_code,
        )
    }

    const task = envelope.tasks[0]
    if (task.status_code !== 20000) {
        // Bubble up the task-level message for diagnostic visibility.
        throw new DfsError(
            'task_failed',
            `DataForSEO task נכשל: ${task.status_message} (${task.status_code})`,
            task.status_code,
        )
    }

    // Proxy mode: debit per-tenant balance at exact DFS-reported cost.
    // Best-effort failure handling: a failed debit logs a warning but doesn't
    // re-throw — we already got the data, the user already gets it. The
    // balance/ledger remain accurate via the SQL UPDATE which is atomic;
    // only the audit row may be missed (recoverable via dfs_cache).
    if (ctx.useProxy && !ctx.isMaster && (envelope.cost || 0) > 0) {
        try {
            await debit({
                instanceId,
                costUsdRaw: envelope.cost,
                endpoint: path,
            })
        } catch (err) {
            if (err instanceof LedgerError) {
                // Hit cap mid-call (race with another in-flight call) — log,
                // don't re-throw. Caller already has data; balance went
                // slightly negative or over cap. Next call will fail clean.
                console.warn(`[dfs/debit] post-call ledger error for ${instanceId} ${path}:`, err.kind, err.userMessage)
            } else {
                console.error(`[dfs/debit] unexpected post-call debit failure for ${instanceId} ${path}:`, (err as Error).message)
            }
        }
    }

    return {
        result: task.result || [],
        cost: envelope.cost || 0,
    }
}

// ── Task-based POST + poll ──────────────────────────────────────────────────

/**
 * Task-based DataForSEO flow for endpoints that have NO `/live` variant
 * (e.g. business_data/google/reviews — review crawling is too heavy for a
 * synchronous call, so DFS only exposes task_post → task_get/advanced).
 *
 * Historical bug (fixed here): googleReviews() used to POST to
 * `business_data/google/reviews/live`, which DOES NOT EXIST → DFS returned
 * HTTP 404 for every call (both business-name and CID inputs), so reviews=0
 * on every competitor_landscape run. The endpoint is task-based only.
 *
 * Flow:
 *   1. POST `${family}/task_post` with the task body → DFS queues it and
 *      returns a task id. We debit the reported cost here (DFS bills at post).
 *   2. Poll GET `${family}/task_get/advanced/${id}` until the task's
 *      status_code flips to 20000 (ready) or a terminal "no results" code,
 *      or we hit the timeout. task_get is free.
 *
 * Best-effort: on timeout / queue-stuck we return an empty result rather
 * than throwing, so the caller (prefetch) degrades gracefully — reviews are
 * an enrichment, not a hard requirement.
 */
export async function dfsTaskPostAndPoll<TResult>(
    instanceId: string,
    family: string,
    body: object,
    opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<{ result: TResult[]; cost: number }> {
    const pollIntervalMs = opts.pollIntervalMs ?? 4000
    const timeoutMs = opts.timeoutMs ?? 60_000

    const ctx = await loadInstanceDfsContext(instanceId)
    const auth = ctx.useProxy ? await proxyAuthHeader() : await legacyAuthHeader(ctx.legacyKey)
    if (ctx.useProxy && !ctx.isMaster) await preflightBalanceCheck(instanceId)

    // ── 1. task_post ──
    let postEnv: DfsEnvelope<TResult>
    try {
        const res = await fetch(`${DFS_BASE_URL}/${family}/task_post`, {
            method: 'POST',
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            body: JSON.stringify([body]),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        })
        if (!res.ok) {
            throw new DfsError('http_error', `DataForSEO החזיר HTTP ${res.status} (task_post). נסו שוב.`, res.status)
        }
        postEnv = await res.json() as DfsEnvelope<TResult>
    } catch (err) {
        if (err instanceof DfsError) throw err
        const e = err as Error
        throw new DfsError('http_error', `שגיאת רשת מול DataForSEO (task_post): ${e.message}.`, undefined, err)
    }
    if (postEnv.status_code !== 20000 || !postEnv.tasks || postEnv.tasks.length === 0) {
        throw new DfsError('task_failed', `DataForSEO task_post נכשל: ${postEnv.status_message} (${postEnv.status_code})`, postEnv.status_code)
    }
    const taskId = postEnv.tasks[0].id
    let cost = postEnv.cost || 0

    // Debit the post cost (DFS bills at task_post). Best-effort — same policy
    // as dfsPost: a failed debit logs but doesn't lose the data.
    if (ctx.useProxy && !ctx.isMaster && cost > 0) {
        try {
            await debit({ instanceId, costUsdRaw: cost, endpoint: `${family}/task_post` })
        } catch (err) {
            if (err instanceof LedgerError) console.warn(`[dfs/debit] post-call ledger error for ${instanceId} ${family}/task_post:`, err.kind)
            else console.error(`[dfs/debit] unexpected debit failure for ${instanceId} ${family}/task_post:`, (err as Error).message)
        }
    }

    // ── 2. poll task_get/advanced/{id} ──
    const deadline = Date.now() + timeoutMs
    // DFS task status codes: 20000 = ready; 20100 = created; 40601/40602 =
    // handed/in-queue (still processing). Anything else terminal.
    const PENDING_CODES = new Set([20100, 40601, 40602])
    for (;;) {
        await new Promise(r => setTimeout(r, pollIntervalMs))
        let getEnv: DfsEnvelope<TResult>
        try {
            const res = await fetch(`${DFS_BASE_URL}/${family}/task_get/advanced/${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': auth },
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
            })
            if (!res.ok) {
                // Transient — keep polling until deadline.
                if (Date.now() >= deadline) return { result: [], cost }
                continue
            }
            getEnv = await res.json() as DfsEnvelope<TResult>
        } catch {
            if (Date.now() >= deadline) return { result: [], cost }
            continue
        }
        const t = getEnv.tasks && getEnv.tasks[0]
        if (t) {
            cost += getEnv.cost || 0
            if (t.status_code === 20000) {
                return { result: t.result || [], cost }
            }
            if (!PENDING_CODES.has(t.status_code)) {
                // Terminal non-success (e.g. 40102 No Search Results) — no
                // reviews for this business. Return empty, not an error.
                return { result: [], cost }
            }
        }
        if (Date.now() >= deadline) return { result: [], cost }
    }
}