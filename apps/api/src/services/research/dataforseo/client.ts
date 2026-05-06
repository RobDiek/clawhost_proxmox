/**
 * DataForSEO HTTP client — base layer for all research-stage DFS calls.
 *
 * Authentication: per-tenant. Reads `instances.dataforseo_key` (format
 * "login:password") and uses HTTP Basic auth. No master account fallback —
 * tenant pays for their own queries against their DFS budget.
 *
 * Failure mode: hard-fail on any DFS error (per playbook §17 — "no SEO
 * without data"). Throws a typed error with actionable Hebrew message
 * pointing user to fix their key/quota.
 *
 * Caching: see cache.ts. Client-level methods don't auto-cache — wrappers
 * in endpoints.ts check cache before calling, store after. Keeps the
 * HTTP layer pure.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { DfsEnvelope } from './types'

const DFS_BASE_URL = 'https://api.dataforseo.com/v3'
const DEFAULT_TIMEOUT_MS = 60_000  // bulk endpoints can take 30-50s

// ── Errors ──────────────────────────────────────────────────────────────────

export type DfsErrorKind =
    | 'no_key'              // tenant hasn't connected DFS at all
    | 'invalid_credentials' // 40100 — bad login/password
    | 'no_credits'          // 40501 — quota exhausted
    | 'bad_request'         // 40000 — malformed query
    | 'task_failed'         // task-level error inside response
    | 'http_error'          // network / 5xx / timeout
    | 'parse_error'         // unexpected response shape

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

// ── Auth lookup ────────────────────────────────────────────────────────────

/**
 * Resolves the tenant's DFS credentials and returns a Basic auth header.
 * Throws DfsError('no_key') if not connected — caller hard-fails.
 */
export async function getDfsAuthHeader(instanceId: string): Promise<string> {
    const [inst] = await db.select({ dataforseoKey: instances.dataforseoKey })
        .from(instances)
        .where(eq(instances.id, instanceId))
    const raw = inst?.dataforseoKey
    if (!raw || !raw.includes(':')) {
        throw new DfsError(
            'no_key',
            'מפתח DataForSEO לא מחובר לאינסטנס. חברו מפתח בהגדרות → אינטגרציות → DataForSEO לפני הרצת המחקר.',
        )
    }
    return 'Basic ' + Buffer.from(raw).toString('base64')
}

// ── Core POST ──────────────────────────────────────────────────────────────

/**
 * Posts to a DataForSEO endpoint and validates the response envelope.
 * Returns the typed `tasks[0].result` on success. Throws DfsError on failure.
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
    const auth = await getDfsAuthHeader(instanceId)

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

    return {
        result: task.result || [],
        cost: envelope.cost || 0,
    }
}