/**
 * Routed long-output LLM call (tenant sovereignty P1 — execution-inversion).
 *
 * When instances.exec_mode='vps', a generator's Anthropic call runs ON the tenant
 * VPS via the exec-service /exec/anthropic (the tenant key never leaves the VPS —
 * litellm-local). Otherwise it uses the central streaming path (callOpusStream).
 * Any VPS transport error or empty result auto-falls-back to central, so the
 * pipeline never breaks while exec_mode='vps' is rolled out per-tenant.
 *
 * This extends the same pattern S1 introduced for the research stages
 * (services/research/stageExecutor.ts `routedAnthropic`) to the standalone
 * generators (monthly plan, SEO batches, reports, …) — the chokepoint they all
 * share is the Anthropic call, so routing it is what moves their execution onto
 * the VPS. The central key (getApiKeyForInstance) is still passed for the fallback.
 */
import { callOpusStream, type LlmStreamArgs } from './llmStream'
import { anthropic as execAnthropic } from './sovereign/execClient'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

export interface RoutedLlmCtx {
    instanceId: string
    /** instances.exec_mode; looked up if omitted. */
    execMode?: string | null
    label?: string
}

/**
 * Streaming-style long generation, routed by exec_mode. The VPS path is
 * non-streaming (exec-service proxies to local litellm and returns the full
 * text), so system+user are concatenated into one prompt — identical to how the
 * research stages already drive /exec/anthropic.
 */
export async function routedOpusStream(ctx: RoutedLlmCtx, args: LlmStreamArgs): Promise<string> {
    const execMode = ctx.execMode ?? (await loadExecMode(ctx.instanceId))
    const label = args.label || ctx.label || 'routedOpusStream'
    if (execMode === 'vps') {
        try {
            const prompt = args.system ? `${args.system}\n\n${args.user}` : args.user
            const r = await execAnthropic(ctx.instanceId, {
                model: args.model,
                prompt,
                maxTokens: args.maxTokens || 32000,
            })
            if (r.ok && r.text) return r.text
            console.warn(`[${label}] vps anthropic ${r.ok ? 'returned empty' : `failed ${r.status}`} → central fallback`)
        } catch (e) {
            console.warn(`[${label}] vps exec error → central fallback: ${(e as Error).message}`)
        }
    }
    return callOpusStream(args)
}

async function loadExecMode(instanceId: string): Promise<string> {
    const [i] = await db.select({ m: instances.execMode }).from(instances).where(eq(instances.id, instanceId))
    return i?.m || 'central'
}