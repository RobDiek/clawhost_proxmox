/**
 * Global Model Registry — Single Source of Truth
 *
 * All model IDs used across the platform are defined here.
 * Backend, frontend, agent setup, and monitoring all read from this.
 *
 * When a model is deprecated/renamed:
 * 1. Update the ID here (or apply a tier override from Admin → Models, no deploy)
 * 2. modelMonitor re-checks availability + detects newer models via /v1/models
 * 3. No other code changes needed — agentSetup/dashboard read from here
 *
 * Tier strategy (keep IDs current; the *mapping* below is the stable part):
 * - opus   → heavy analytical work (strategy, AEO audit) — best reasoning, 1M ctx
 * - sonnet → fast high-quality research, content, creative, orchestrator chat
 * - haiku  → coordination, social listening, quick distribution (high volume)
 */

export interface ModelDef {
    id: string           // API model ID (e.g. 'claude-opus-4-8')
    label: string        // Display name (e.g. 'Claude Opus 4.8')
    labelHe: string      // Hebrew label
    provider: 'anthropic' | 'openai' | 'google' | 'ollama'
    tier: 'premium' | 'standard' | 'economy'
    maxTokens: number    // Max output tokens
    contextWindow: number
    costPer1kInput: number  // USD
    costPer1kOutput: number
    supportsVision: boolean
    supportsTools: boolean
    fallbackTo?: string  // Model ID to fall back to
}

// ── Anthropic Models ──
// Pricing/context verified 2026-06-12 against the Anthropic model catalog.
export const ANTHROPIC_OPUS: ModelDef = {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    labelHe: 'Claude Opus 4.8 (מתקדם)',
    provider: 'anthropic',
    tier: 'premium',
    maxTokens: 128000,
    contextWindow: 1000000,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
    supportsVision: true,
    supportsTools: true,
    fallbackTo: 'claude-sonnet-4-6',
}

export const ANTHROPIC_SONNET: ModelDef = {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    labelHe: 'Claude Sonnet 4.6 (מומלץ)',
    provider: 'anthropic',
    tier: 'standard',
    maxTokens: 64000,
    contextWindow: 1000000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsVision: true,
    supportsTools: true,
    fallbackTo: 'claude-haiku-4-5-20251001',
}

export const ANTHROPIC_HAIKU: ModelDef = {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    labelHe: 'Claude Haiku 4.5 (חסכוני)',
    provider: 'anthropic',
    tier: 'economy',
    maxTokens: 64000,
    contextWindow: 200000,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
    supportsVision: true,
    supportsTools: true,
    fallbackTo: undefined,
}

// ── OpenAI Models ──
export const OPENAI_GPT4O: ModelDef = {
    id: 'gpt-4o',
    label: 'GPT-4o',
    labelHe: 'GPT-4o (חלופי)',
    provider: 'openai',
    tier: 'standard',
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    supportsVision: true,
    supportsTools: true,
    fallbackTo: 'gpt-4o-mini',
}

export const OPENAI_GPT4O_MINI: ModelDef = {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    labelHe: 'GPT-4o Mini (חסכוני)',
    provider: 'openai',
    tier: 'economy',
    maxTokens: 16384,
    contextWindow: 128000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    supportsVision: true,
    supportsTools: true,
    fallbackTo: undefined,
}

// ── All models registry ──
export const MODEL_REGISTRY: Record<string, ModelDef> = {
    [ANTHROPIC_OPUS.id]: ANTHROPIC_OPUS,
    [ANTHROPIC_SONNET.id]: ANTHROPIC_SONNET,
    [ANTHROPIC_HAIKU.id]: ANTHROPIC_HAIKU,
    [OPENAI_GPT4O.id]: OPENAI_GPT4O,
    [OPENAI_GPT4O_MINI.id]: OPENAI_GPT4O_MINI,
}

// ── Lookup helpers ──
export function getModel(id: string): ModelDef | undefined {
    return MODEL_REGISTRY[id]
}

export function getFallbackModel(id: string): ModelDef | undefined {
    const model = MODEL_REGISTRY[id]
    if (!model?.fallbackTo) return undefined
    return MODEL_REGISTRY[model.fallbackTo]
}

export function getFallbackChain(id: string): ModelDef[] {
    const chain: ModelDef[] = []
    let current: ModelDef | undefined = MODEL_REGISTRY[id]
    while (current) {
        chain.push(current)
        current = current.fallbackTo ? MODEL_REGISTRY[current.fallbackTo] : undefined
    }
    return chain
}

// ── Provider model lists ──
export function getModelsByProvider(provider: string): ModelDef[] {
    return Object.values(MODEL_REGISTRY).filter(m => m.provider === provider)
}

// ── Tier aliases (the stable indirection) ──
// Sub-agents and the dashboard reference a TIER, never a concrete ID. Bumping
// a model version = changing the ID above (or an Admin override) and the whole
// platform follows. This is what keeps the 45+ call-sites from drifting.
export const TIER_MODELS = {
    opus: ANTHROPIC_OPUS.id,
    sonnet: ANTHROPIC_SONNET.id,
    haiku: ANTHROPIC_HAIKU.id,
} as const

export type Tier = keyof typeof TIER_MODELS

// ── Per-sub-agent tier assignment (single source of truth for linkage) ──
// agentSetup builds the provider-prefixed model string from this + the registry.
// "Quality" lives here (which agent gets which tier); "currency" lives in the
// ModelDefs above (which concrete model each tier points at).
export const ROLE_TIERS: Record<string, Tier> = {
    mateh: 'sonnet',     // orchestrator chat — quality + instruction-following
    sayer: 'sonnet',     // internet research — speed + quality
    meater: 'sonnet',    // SERP research — speed + quality
    maazin: 'haiku',     // social listening — high volume
    menateach: 'opus',   // strategic analysis — deep thinking
    et: 'sonnet',        // content writing — quality
    yotzer: 'sonnet',    // creative — quality
    shaliach: 'haiku',   // distribution — fast
    migdalor: 'opus',    // AEO audit — precision reasoning
    mekhayev: 'sonnet',  // brand design — reasoning + visual judgment
    mazhir: 'sonnet',    // Paid Ads Manager — judgment + math
}

/**
 * Resolve a sub-agent role → OpenClaw-format model string ('anthropic/<id>'),
 * honouring optional admin tier overrides (tier → modelId, applied without deploy
 * from Admin → Models). Unknown roles default to the sonnet tier.
 */
export function roleModel(role: string, tierOverrides?: Partial<Record<Tier, string>>): string {
    const tier = ROLE_TIERS[role] || 'sonnet'
    const id = (tierOverrides && tierOverrides[tier]) || TIER_MODELS[tier]
    return `anthropic/${id}`
}

// ── Agent default models (bare ids, derived from the tier mapping) ──
export const AGENT_DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
    Object.keys(ROLE_TIERS).map(role => [role, TIER_MODELS[ROLE_TIERS[role]]]),
)

// ── Strategy model (direct API call) ──
export const STRATEGY_MODELS = {
    primary: ANTHROPIC_SONNET.id,
    recommended: ANTHROPIC_OPUS.id,
    fallback: OPENAI_GPT4O.id,
    allowed: [ANTHROPIC_SONNET.id, ANTHROPIC_OPUS.id],
}

// ── For OpenClaw agent format (provider/model) ──
export function toOpenClawFormat(modelId: string): string {
    const model = MODEL_REGISTRY[modelId]
    if (!model) return `openai/${modelId}` // default
    return `${model.provider}/${model.id}`
}
