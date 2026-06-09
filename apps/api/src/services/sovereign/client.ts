/**
 * Sovereign-store client (central side) — tenant sovereignty Phase 2.
 *
 * Talks to the on-VPS sovereign-store (scripts/sovereign-store/server.js) over
 * HTTPS at the agent subdomain (`https://<subdomainAgent>/sovereign/*`), authed
 * with the instance's openclaw_token. This is the central half of the data move:
 *   - P2.1 dual-write: wrappers around writeResearchData / output inserts /
 *     brand_books call writeResearchData()/writeOutput()/writeBrandBook() here
 *     as a BEST-EFFORT shadow when instances.data_home != 'central'. Reads still
 *     come from central.
 *   - P2.2 read flip: the central API proxies reads through read*() here.
 *
 * Nothing calls this yet — it is additive and changes no behavior until P2.1.
 *
 * Auth note: openclaw_token is an encryptedText column, so reading it via Drizzle
 * returns the decrypted plaintext transparently (db/encryptedColumn.ts). The same
 * value is the gateway token on the VPS, which the sovereign-store validates.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

export type SovereignKind = 'research_data' | 'brand_book'

export class SovereignError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly instanceId: string
    ) {
        super(message)
        this.name = 'SovereignError'
    }
}

interface Target {
    baseUrl: string // https://<subdomainAgent>/sovereign
    token: string
}

const DEFAULT_TIMEOUT_MS = 15000

/**
 * Resolve the VPS sovereign endpoint + auth for an instance. Returns null when
 * the instance has no agent subdomain or token yet (not provisioned) — callers
 * treat null as "no sovereign target" and skip (P2.1 best-effort semantics).
 */
async function resolveTarget(instanceId: string): Promise<Target | null> {
    const [inst] = await db
        .select({
            subdomainAgent: instances.subdomainAgent,
            openclawToken: instances.openclawToken
        })
        .from(instances)
        .where(eq(instances.id, instanceId))
    if (!inst?.subdomainAgent || !inst.openclawToken) return null
    return {
        baseUrl: `https://${inst.subdomainAgent}/sovereign`,
        token: inst.openclawToken
    }
}

async function call(
    instanceId: string,
    method: 'GET' | 'PUT',
    path: string,
    body?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ status: number; json: any }> {
    const target = await resolveTarget(instanceId)
    if (!target) {
        throw new SovereignError('no sovereign target (not provisioned)', 0, instanceId)
    }
    let res: Response
    try {
        res = await fetch(`${target.baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${target.token}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs)
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error'
        throw new SovereignError(`sovereign request failed: ${msg}`, 0, instanceId)
    }
    let json: any = null
    try {
        json = await res.json()
    } catch {
        /* non-JSON / empty body */
    }
    return { status: res.status, json }
}

// ── Singletons (research_data / brand_book) ────────────────────────────────

/** Read a singleton document for an agent scope. Returns null if absent (404). */
async function readSingleton(
    instanceId: string,
    scope: string,
    kind: SovereignKind
): Promise<unknown | null> {
    const { status, json } = await call(
        instanceId,
        'GET',
        `/singleton?scope=${encodeURIComponent(scope)}&kind=${kind}`
    )
    if (status === 404) return null
    if (status !== 200) {
        throw new SovereignError(
            `read ${kind} failed (${status})`,
            status,
            instanceId
        )
    }
    return json?.body ?? null
}

/** Upsert (full replace) a singleton document for an agent scope. */
async function writeSingleton(
    instanceId: string,
    scope: string,
    kind: SovereignKind,
    body: unknown
): Promise<void> {
    const { status } = await call(
        instanceId,
        'PUT',
        `/singleton?scope=${encodeURIComponent(scope)}&kind=${kind}`,
        { body }
    )
    if (status !== 200) {
        throw new SovereignError(
            `write ${kind} failed (${status})`,
            status,
            instanceId
        )
    }
}

export const readResearchData = (instanceId: string, scope: string) =>
    readSingleton(instanceId, scope, 'research_data')
export const writeResearchData = (
    instanceId: string,
    scope: string,
    body: unknown
) => writeSingleton(instanceId, scope, 'research_data', body)

export const readBrandBook = (instanceId: string, scope: string) =>
    readSingleton(instanceId, scope, 'brand_book')
export const writeBrandBook = (
    instanceId: string,
    scope: string,
    body: unknown
) => writeSingleton(instanceId, scope, 'brand_book', body)

// ── Outputs (agent_outputs rows) ───────────────────────────────────────────

export interface SovereignOutput {
    id: string
    scope: string
    type?: string | null
    status?: string | null
    createdAt?: number | null
    body: unknown
}

/** Upsert one output row by id. */
export async function writeOutput(
    instanceId: string,
    out: SovereignOutput
): Promise<void> {
    const { status } = await call(instanceId, 'PUT', '/output', out)
    if (status !== 200) {
        throw new SovereignError(
            `write output ${out.id} failed (${status})`,
            status,
            instanceId
        )
    }
}

/** Read one output body by id. Returns null if absent (404). */
export async function readOutput(
    instanceId: string,
    id: string
): Promise<unknown | null> {
    const { status, json } = await call(
        instanceId,
        'GET',
        `/output?id=${encodeURIComponent(id)}`
    )
    if (status === 404) return null
    if (status !== 200) {
        throw new SovereignError(
            `read output ${id} failed (${status})`,
            status,
            instanceId
        )
    }
    return json?.body ?? null
}

/** List output bodies for a scope, optionally filtered by status/type. */
export async function listOutputs(
    instanceId: string,
    scope: string,
    opts: { status?: string; type?: string } = {}
): Promise<unknown[]> {
    const params = new URLSearchParams({ scope })
    if (opts.status) params.set('status', opts.status)
    if (opts.type) params.set('type', opts.type)
    const { status, json } = await call(
        instanceId,
        'GET',
        `/outputs?${params.toString()}`
    )
    if (status !== 200) {
        throw new SovereignError(
            `list outputs failed (${status})`,
            status,
            instanceId
        )
    }
    return Array.isArray(json?.outputs) ? json.outputs : []
}

/** Row counts (parity helper) — no tenant content returned. */
export async function sovereignStats(
    instanceId: string
): Promise<{ singletons: number; outputs: number }> {
    const { status, json } = await call(instanceId, 'GET', '/stats')
    if (status !== 200) {
        throw new SovereignError(`stats failed (${status})`, status, instanceId)
    }
    return { singletons: json?.singletons ?? 0, outputs: json?.outputs ?? 0 }
}