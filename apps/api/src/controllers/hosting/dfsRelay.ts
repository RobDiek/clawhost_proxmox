/**
 * DFS no-store metering relay (sovereignty Phase 1).
 *
 * The tenant VPS POSTs a DataForSEO task here; the central API forwards it to
 * DFS using Flowmatic's MASTER credentials, debits the tenant's prepaid USD
 * balance at the exact DFS-reported cost, and returns the result. The response
 * body is NEVER persisted centrally — dfsPost does not cache; the ledger records
 * only metadata (endpoint, cost). The VPS caches locally.
 *
 * This lets the VPS use DFS without ever holding a DFS key, while Flowmatic keeps
 * the single master account + billing. "We don't store your results" here is a
 * policy/audit guarantee (the bytes transit our TLS-terminated proxy), not a
 * cryptographic one — DataForSEO offers no scoped sub-tokens. See
 * flowmatic/roadmap/16 (I4) + memory project_tenant_sovereignty.
 *
 * NOT YET WIRED: nothing calls this until execution moves onto the VPS (Phase 2);
 * it is additive and does not change the current central research path.
 *
 * Auth: Bearer = the instance's openclaw_token (constant-time compared). The
 * relay spends real money + uses our master DFS account, so it authenticates
 * strictly (unlike outputs/ingest).
 */
import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { dfsPost, DfsError } from '@/services/research/dataforseo/client'
import { ok, fail } from '@/lib/response'

// The relay uses Flowmatic's master DFS account, so the VPS must not be able to
// hit arbitrary endpoints. `path` is appended to https://api.dataforseo.com/v3/
// inside dfsPost; restrict to known DFS API sections + a strict shape.
const ALLOWED_DFS_PREFIXES = [
    'serp/',
    'keywords_data/',
    'dataforseo_labs/',
    'backlinks/',
    'business_data/',
    'on_page/',
    'domain_analytics/',
    'content_analysis/',
    'merchant/',
    'app_data/'
]
const PATH_RE = /^[a-z0-9_]+(\/[a-z0-9_]+)+$/ // lowercase segments only; no scheme, no .., no //

const tokenMatches = (provided: string, expected: string): boolean => {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

// Map DfsError kinds to sensible HTTP statuses for the VPS caller.
const statusForDfsError = (err: DfsError): 400 | 402 | 502 | 503 => {
    switch (err.kind) {
        case 'insufficient_balance':
        case 'monthly_cap_exceeded':
            return 402
        case 'master_creds_missing':
            return 503
        case 'bad_request':
        case 'parse_error':
            return 400
        default:
            return 502 // invalid_credentials / no_credits / http_error / task_failed
    }
}

export const dfsRelay = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')

        const authHeader = c.req.header('Authorization') || ''
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : ''
        if (!token) return fail(c, 'Unauthorized', 401)

        const [inst] = await db
            .select({
                id: instances.id,
                openclawToken: instances.openclawToken
            })
            .from(instances)
            .where(eq(instances.id, instanceId))
        if (!inst?.openclawToken || !tokenMatches(token, inst.openclawToken)) {
            return fail(c, 'Unauthorized', 401)
        }

        const reqBody = await c.req.json<{
            path?: string
            body?: unknown[]
            timeoutMs?: number
        }>()
        const path = (reqBody.path || '').trim()
        if (
            !PATH_RE.test(path) ||
            !ALLOWED_DFS_PREFIXES.some((p) => path.startsWith(p))
        ) {
            return fail(c, 'Invalid or disallowed DFS path', 400)
        }
        if (!Array.isArray(reqBody.body)) {
            return fail(c, 'body must be an array of DFS task descriptors', 400)
        }

        // dfsPost: proxy (master-creds) call + per-tenant balance pre-flight +
        // exact-cost debit. No caching / no response-body persistence — the
        // result is returned to the VPS and never stored centrally.
        const { result, cost } = await dfsPost(
            instanceId,
            path,
            reqBody.body,
            reqBody.timeoutMs
        )
        return ok(c, { result, cost }, 'ok')
    } catch (err) {
        if (err instanceof DfsError) {
            return fail(c, err.userMessage, statusForDfsError(err))
        }
        console.error('dfsRelay error:', err)
        return fail(c, 'DFS relay failed', 500)
    }
}