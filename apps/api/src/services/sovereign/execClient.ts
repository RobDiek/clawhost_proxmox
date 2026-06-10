/**
 * Exec-service client (central side) — tenant sovereignty S1 (sovereign VPS-local
 * execution). Mirror of services/sovereign/client.ts, but for COMMANDS not data.
 *
 * Talks to the on-VPS exec-service (scripts/exec-service/server.js) over HTTPS at
 * the agent subdomain (`https://<subdomainAgent>/exec/*`), authed with the
 * instance's openclaw_token. This is the central transport half of S1: when
 * instances.exec_mode='vps', stageExecutor routes each operation that previously
 * ran via root SSH through these granular primitives instead —
 *   resetWorkspace  ← the pre-flight wipe + cross-brand prune + BRAND.md restore
 *   runAgent        ← `openclaw agent --json`
 *   readFile/writeFile ← workspace / research-data file ops (allowlisted on VPS)
 *   sessionDraft    ← the jsonl assistant-text fallback
 *   tools           ← `openclaw mcp list`
 *   anthropic       ← the useDirectApi Anthropic call, run on the tenant key ON
 *                     the VPS (S1 decision: move the tenant key off-center)
 * The exec-service runs as the openclaw user (no root) — mirror of sovereign-store.
 *
 * Every method throws ExecError on transport/HTTP failure so stageExecutor can fall
 * back to the legacy sshExec path (auto-fallback keeps the pipeline live while
 * exec_mode='vps' is being proven). anthropic() is the exception: it returns a
 * structured {ok:false} on failure to mirror central callAnthropicStreaming, so the
 * existing error-branch handling in stageExecutor applies unchanged.
 *
 * Auth note: openclaw_token is an encryptedText column → Drizzle returns plaintext
 * transparently; the same value is the gateway token the exec-service validates.
 *
 * Nothing imports this yet — additive, no behavior change until stageExecutor wiring.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

export class ExecError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly instanceId: string
    ) {
        super(message)
        this.name = 'ExecError'
    }
}

interface Target {
    baseUrl: string // https://<subdomainAgent>/exec
    token: string
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Resolve the VPS exec endpoint + auth for an instance. Returns null when the
 * instance has no agent subdomain or token yet (not provisioned) — callers treat
 * null as "no exec target" and fall back to the legacy path.
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
        baseUrl: `https://${inst.subdomainAgent}/exec`,
        token: inst.openclawToken
    }
}

async function call(
    instanceId: string,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ status: number; json: any }> {
    const target = await resolveTarget(instanceId)
    if (!target) {
        throw new ExecError('no exec target (not provisioned)', 0, instanceId)
    }
    let res: Response
    try {
        res = await fetch(`${target.baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${target.token}`,
                ...(body !== undefined
                    ? { 'Content-Type': 'application/json' }
                    : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs)
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error'
        throw new ExecError(`exec request failed: ${msg}`, 0, instanceId)
    }
    let json: any = null
    try {
        json = await res.json()
    } catch {
        /* non-JSON / empty body */
    }
    return { status: res.status, json }
}

// ── Workspace reset (pre-flight wipe + cross-brand prune + BRAND.md restore) ──
// Mirrors the root-SSH block in stageExecutor (rm sessions/output + workspace
// content/memory/state, prune sibling brands != brandSlug, restore BRAND.md). The
// exec-service runs as openclaw, so no chown is needed.
export async function resetWorkspace(
    instanceId: string,
    opts: { agentId: string; brandSlug: string }
): Promise<void> {
    const { status } = await call(instanceId, 'POST', '/reset', opts, 20_000)
    if (status !== 200) {
        throw new ExecError(`reset failed (${status})`, status, instanceId)
    }
}

// ── Run the openclaw CLI agent, returning raw stdout (parsed centrally) ──
export async function runAgent(
    instanceId: string,
    opts: { agentId: string; sessionId: string; prompt: string; timeoutSec: number }
): Promise<string> {
    // Give the HTTP call headroom over the agent's own timeout.
    const { status, json } = await call(
        instanceId,
        'POST',
        '/agent',
        opts,
        (opts.timeoutSec + 60) * 1000
    )
    if (status !== 200) {
        throw new ExecError(`agent run failed (${status})`, status, instanceId)
    }
    return typeof json?.stdout === 'string' ? json.stdout : ''
}

// ── Workspace / research-data file read & write (allowlisted paths on the VPS) ──
export async function readFile(
    instanceId: string,
    path: string
): Promise<string | null> {
    const { status, json } = await call(
        instanceId,
        'GET',
        `/file?path=${encodeURIComponent(path)}`
    )
    if (status === 404) return null
    if (status !== 200) {
        throw new ExecError(`read file failed (${status})`, status, instanceId)
    }
    return typeof json?.content === 'string' ? json.content : null
}

export async function writeFile(
    instanceId: string,
    path: string,
    body: string
): Promise<void> {
    const { status } = await call(instanceId, 'PUT', '/file', { path, body })
    if (status !== 200) {
        throw new ExecError(`write file failed (${status})`, status, instanceId)
    }
}

// ── Assistant-text fallback extracted from the latest session jsonl (python on VPS) ──
export async function sessionDraft(
    instanceId: string,
    agentId: string
): Promise<string> {
    const { status, json } = await call(
        instanceId,
        'GET',
        `/session-draft?agentId=${encodeURIComponent(agentId)}`,
        undefined,
        25_000
    )
    if (status !== 200) {
        throw new ExecError(`session-draft failed (${status})`, status, instanceId)
    }
    return typeof json?.draft === 'string' ? json.draft : ''
}

// ── Available MCP tools (provenance) ──
export interface ExecTools {
    hasBrave: boolean
    hasDataforseo: boolean
    hasFirecrawl: boolean
    hasGsc: boolean
}
export async function tools(instanceId: string): Promise<ExecTools> {
    const { status, json } = await call(
        instanceId,
        'GET',
        '/tools',
        undefined,
        20_000
    )
    if (status !== 200) {
        throw new ExecError(`tools probe failed (${status})`, status, instanceId)
    }
    return {
        hasBrave: !!json?.hasBrave,
        hasDataforseo: !!json?.hasDataforseo,
        hasFirecrawl: !!json?.hasFirecrawl,
        hasGsc: !!json?.hasGsc
    }
}

// ── Anthropic streaming call on the tenant key, executed ON the VPS ──
// S1 decision (Sergei): move the tenant Anthropic key onto the VPS. The exec-service
// streams to api.anthropic.com locally and returns the SAME shape as central
// callAnthropicStreaming, so stageExecutor's useDirectApi branch swaps one line and
// all downstream error handling (rate-limit / credits / invalid-key / 503) is reused.
export type ExecAnthropicResult =
    | { ok: true; text: string }
    | { ok: false; status: number; errorText: string }

export async function anthropic(
    instanceId: string,
    opts: { model: string; prompt: string; maxTokens: number }
): Promise<ExecAnthropicResult> {
    const { status, json } = await call(
        instanceId,
        'POST',
        '/anthropic',
        opts,
        760_000
    )
    if (status !== 200) {
        // Transport/proxy failure → surface as a failed Anthropic call so the
        // caller shows the transient-network message instead of crashing.
        return {
            ok: false,
            status: status || 503,
            errorText: json?.error || `exec anthropic HTTP ${status}`
        }
    }
    if (json?.ok) {
        return { ok: true, text: typeof json.text === 'string' ? json.text : '' }
    }
    return {
        ok: false,
        status: typeof json?.status === 'number' ? json.status : 500,
        errorText: json?.errorText || 'unknown exec anthropic error'
    }
}