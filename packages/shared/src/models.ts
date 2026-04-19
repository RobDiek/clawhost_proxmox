/**
 * Global Model Registry — Single Source of Truth
 *
 * All model IDs used across the platform are defined here.
 * Backend, frontend, agent setup, and monitoring all read from this.
 *
 * When a model is deprecated/renamed:
 * 1. Update the ID here
 * 2. Run model sync to update all VPS instances
 * 3. No other code changes needed
 */

export interface ModelDef {
    id: string           // API model ID (e.g. 'claude-opus-4-6')
    label: string        // Display name (e.g. 'Claude Opus 4.6')
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
export const ANTHROPIC_OPUS: ModelDef = {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    labelHe: 'Claude Opus 4.6 (מתקדם)',
    provider: 'anthropic',
    tier: 'premium',
    maxTokens: 32768,
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
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
    maxTokens: 16384,
    contextWindow: 200000,
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
    maxTokens: 8192,
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

// ── Agent default models (for AGENTS.md generation) ──
export const AGENT_DEFAULT_MODELS: Record<string, string> = {
    mateh: ANTHROPIC_OPUS.id,
    sayer: ANTHROPIC_OPUS.id,
    menateach: ANTHROPIC_OPUS.id,
    meater: ANTHROPIC_SONNET.id,
    maazin: ANTHROPIC_SONNET.id,
    et: ANTHROPIC_SONNET.id,
    yotzer: ANTHROPIC_SONNET.id,
    shaliach: ANTHROPIC_HAIKU.id,
    migdalor: ANTHROPIC_SONNET.id,
}

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
