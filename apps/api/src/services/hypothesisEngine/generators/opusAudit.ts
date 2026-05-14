/**
 * Opus-driven audit generator.
 *
 * Per [[feedback_model_tiers]]: this is the highest-value, lowest-frequency
 * generator → uses Opus. Cost ~$0.15-0.30 per audit, run once per
 * recommendation cycle (weekly cadence, not daily).
 *
 * What it does: hands Opus a structured summary of the account
 * (per-platform aggregates, per-event breakdown, attribution quality,
 * tier classification) and asks for 3-5 holistic findings the rule
 * engines would miss. These are NOT replacements for the rule generators;
 * they're complementary — Opus catches:
 *   - Account-shape patterns (e.g. "your ROAS is decent but you're
 *     under-spending on your best segment by 4x")
 *   - Cross-platform diagnostic narratives (e.g. "Meta is doing
 *     prospecting work that Google then closes — your Google ROAS
 *     would crater if you cut Meta")
 *   - Calendar/seasonality reads ("your CPM jumped 40% mid-Mar; was
 *     this an election period?")
 *   - Naming-convention insights ("campaigns with 'BR' prefix have 3x
 *     better CPA than 'CON' — what does that pattern signal?")
 *
 * Output is parsed as JSON conforming to the HypothesisProposal shape
 * with hypothesis_code = 'opus_audit_finding' for ALL findings (the
 * specific topic goes in `title`).
 */

import type { GeneratorContext, HypothesisProposal } from '../types'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

interface OpusFinding {
    title: string
    title_he: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    confidence: number
    observation: string
    observation_he: string
    hypothesis: string
    hypothesis_he: string
    reasoning: string
    reasoning_he: string
    proposed_action: string
    proposed_action_he: string
    scope_platform?: string                  // 'meta' | 'google_ads' | 'cross_platform' | 'account'
    scope_data_type?: string                 // 'campaign' | 'event' | 'account'
    expected_impact_kind?: string
    expected_impact_ils?: number
    test_window_days?: number
    success_metric?: string
    success_direction?: 'decrease' | 'increase' | 'no_worse_than'
    success_threshold_pct?: number
}

function buildAuditPrompt(ctx: GeneratorContext): string {
    const inv = ctx.inventory
    const platforms = ctx.platformAggregates.map(p => ({
        platform: p.platform,
        spend_90d_ils: Number(p.spendIls.toFixed(0)),
        clicks: p.clicks,
        conversions: Number(p.conversions.toFixed(0)),
        conv_value_ils: Number(p.conversionValueIls.toFixed(0)),
        cpa: p.conversions > 0 ? Number((p.spendIls / p.conversions).toFixed(2)) : null,
        roas: p.spendIls > 0 ? Number((p.conversionValueIls / p.spendIls).toFixed(2)) : null,
        ctr: p.impressions > 0 ? Number(((p.clicks / p.impressions) * 100).toFixed(2)) : null,
        events_seen: p.eventNames,
        attribution_windows_seen: p.attributionWindows,
    }))
    const events = ctx.eventBreakdown.map(e => ({
        platform: e.platform,
        event: e.eventName,
        attribution_window: e.attributionWindow,
        spend_ils: Number(e.spendIls.toFixed(0)),
        conversions: Number(e.conversions.toFixed(0)),
        conv_value_ils: Number(e.conversionValueIls.toFixed(0)),
    }))

    return `You are a senior PPC strategist auditing an Israeli SMB's paid-advertising account. Your job: find 3-5 NON-OBVIOUS, ACTIONABLE findings the rule-based generators would miss.

The rule engines already cover:
  - Bidding tier transitions (Max Clicks → Max Conv → tCPA → tROAS)
  - Per-platform outlier campaigns (top/bottom decile CPA)
  - Conversion event mix vs declared goal
  - Tracking gaps (attribution metadata missing)
  - Meta frequency saturation (avg freq > 4)
DO NOT duplicate these — focus on findings that require pattern-matching across the data.

Account snapshot:
- Overall tier: ${inv.tier} — ${inv.tierRationale}
- Per-platform tiers: ${JSON.stringify(inv.perPlatform || [])}
- Dominant platform: ${inv.dominantPlatform || 'none'}
- Declared marketing goals: ${JSON.stringify(ctx.marketingGoals)}

Per-platform 90-day aggregates:
${JSON.stringify(platforms, null, 2)}

Per-event × per-attribution breakdown (90d):
${JSON.stringify(events, null, 2)}

Paid profile (user-declared):
${JSON.stringify(ctx.paidProfile, null, 2).slice(0, 3000)}

Now find 3-5 findings. Each finding must:
  1. Cite specific numbers from above (not generic advice)
  2. Be actionable (the user can do something concrete this week)
  3. Be testable (success criteria measurable in 14-28 days)
  4. Be in Hebrew (plural address — אתם/תוכלו/לכם) AND English
  5. Avoid rule-engine territory listed above

Return STRICT JSON, an array of findings. Schema for each:
{
  "title": "short English title",
  "title_he": "short Hebrew title (plural address)",
  "severity": "critical" | "high" | "medium" | "low",
  "confidence": 0.0-1.0,
  "observation": "what's in the data (cite numbers)",
  "observation_he": "...",
  "hypothesis": "what would change if we did X",
  "hypothesis_he": "...",
  "reasoning": "why this matters; what's the mechanism",
  "reasoning_he": "...",
  "proposed_action": "concrete action this week",
  "proposed_action_he": "...",
  "scope_platform": "meta" | "google_ads" | "cross_platform" | "account",
  "scope_data_type": "campaign" | "event" | "account",
  "expected_impact_kind": "spend_reduction" | "conv_uplift" | "cpa_reduction" | "roas_uplift" | "risk_mitigation",
  "expected_impact_ils": <signed number; null if unmeasurable>,
  "test_window_days": 14 | 28,
  "success_metric": "cpa_ils" | "roas" | "conversions" | "spend_ils",
  "success_direction": "decrease" | "increase" | "no_worse_than",
  "success_threshold_pct": <number>
}

Return [] if the data is too thin for non-trivial findings.`
}

function tryParseJsonArray(s: string): any[] {
    const cleaned = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    try {
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) return parsed
        if (parsed && Array.isArray(parsed.findings)) return parsed.findings
    } catch { /* try regex */ }
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (m) try { return JSON.parse(m[0]) } catch { /* fall through */ }
    return []
}

export async function generateOpusAudit(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    // Bail early: need at least minimal data
    if (ctx.platformAggregates.length === 0) return []
    const totalSpend = ctx.platformAggregates.reduce((s, p) => s + p.spendIls, 0)
    if (totalSpend < 500) return []   // not enough budget for findings to matter

    const apiKey = await getApiKeyForInstance(ctx.instanceId)
    if (!apiKey) {
        console.warn('[opusAudit] no Anthropic API key — skipping LLM audit')
        return []
    }

    const model = await resolveDirectModel(ctx.instanceId, 'mazhir').catch(() => 'claude-opus-4-7')
    const prompt = buildAuditPrompt(ctx)

    let text = ''
    try {
        const res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model,
                max_tokens: 6000,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(180_000),
        })
        if (!res.ok) {
            const t = await res.text().catch(() => '')
            console.warn(`[opusAudit] ${model} ${res.status}: ${t.slice(0, 200)}`)
            return []
        }
        const j = await res.json() as any
        text = j?.content?.[0]?.text || ''
    } catch (err) {
        console.error('[opusAudit] error:', (err as Error).message)
        return []
    }

    const findings: OpusFinding[] = tryParseJsonArray(text)
    if (findings.length === 0) {
        console.log('[opusAudit] no findings (parser returned empty array)')
        return []
    }

    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    return findings.slice(0, 5).map((f, idx): HypothesisProposal => ({
        hypothesisCode: 'opus_audit_finding',
        title: String(f.title || `Opus audit finding ${idx + 1}`),
        titleHe: String(f.title_he || f.title || `ממצא ${idx + 1}`),
        scopePlatform: f.scope_platform,
        scopeDataType: f.scope_data_type,
        scopeWindow: { start: windowStart, end: windowEnd },

        observation: String(f.observation || ''),
        observationHe: String(f.observation_he || f.observation || ''),
        hypothesis: String(f.hypothesis || ''),
        hypothesisHe: String(f.hypothesis_he || f.hypothesis || ''),
        reasoning: String(f.reasoning || ''),
        reasoningHe: String(f.reasoning_he || f.reasoning || ''),

        severity: (['critical', 'high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium') as any,
        confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
        expectedImpactIls: typeof f.expected_impact_ils === 'number' ? f.expected_impact_ils : undefined,
        expectedImpactKind: f.expected_impact_kind as any,

        evidenceSnapshot: {
            asOf: ctx.now.toISOString(),
            metrics: {
                opusAuditFindingIdx: idx,
                platformAggregates: ctx.platformAggregates.length,
                eventBreakdown: ctx.eventBreakdown.length,
                totalSpend90d: Math.round(totalSpend),
            },
            window: { start: windowStart, end: windowEnd },
        },

        proposedAction: String(f.proposed_action || ''),
        proposedActionHe: String(f.proposed_action_he || f.proposed_action || ''),

        testMethod: 'before_after_window',
        testWindowDays: typeof f.test_window_days === 'number' ? f.test_window_days : 28,
        testSuccessCriteria: f.success_metric ? {
            metric: f.success_metric as any,
            direction: (f.success_direction || 'decrease') as any,
            thresholdPct: typeof f.success_threshold_pct === 'number' ? f.success_threshold_pct : 10,
        } : undefined,

        source: 'opus_audit',
        generatedByModel: model,
    }))
}