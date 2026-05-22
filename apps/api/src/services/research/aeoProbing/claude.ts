/**
 * Claude probing — does Claude recommend us when asked a relevant query?
 *
 * Uses the existing master Anthropic key. Sends a structured prompt:
 *   "When someone in Israel searches for [keyword], which businesses /
 *    products / services are most relevant? List the top 3-5 with a
 *    brief explanation."
 *
 * Then parses the response for mentions of our domain / brand names.
 *
 * NOTE: Claude doesn't have a native "web search" tool in the public
 * API yet (as of 2026). Without web access, Claude answers from training
 * cutoff — which represents the model's BASELINE BRAND RECOGNITION (how
 * well-known is your brand in Claude's training data). This is a useful
 * signal for entity authority.
 *
 * Cost: ~$0.01-0.03 per probe (modest 1K-token interaction).
 */

import { isOurBrand, citationSharePct, type AeoProbeOpts, type AeoProbeBatchResult, type AeoProbeResult } from './index'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-haiku-4-5-20251001'  // cheap model — we just need recognition, not analysis

export async function probeClaude(opts: AeoProbeOpts): Promise<AeoProbeBatchResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        return failAllKeywords(opts.keywords, 'anthropic_key_missing')
    }

    const maxProbes = opts.maxProbesPerEngine ?? opts.keywords.length
    const kws = opts.keywords.slice(0, maxProbes)
    const results: AeoProbeResult[] = []
    let totalCost = 0

    for (const keyword of kws) {
        if (opts.budget && !opts.budget.canAfford(0.03)) {
            results.push(skipped(keyword, 'budget_exhausted'))
            continue
        }

        try {
            const prompt = buildPrompt(keyword)
            const start = Date.now()
            const res = await fetch(ANTHROPIC_API, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: MODEL,
                    max_tokens: 600,
                    messages: [{ role: 'user', content: prompt }],
                }),
                signal: AbortSignal.timeout(20_000),
            })
            void start

            if (!res.ok) {
                results.push(skipped(keyword, `http_${res.status}`))
                continue
            }
            const body = await res.json() as {
                content?: Array<{ text?: string }>
                usage?: { input_tokens?: number; output_tokens?: number }
            }
            const answer = (body.content?.[0]?.text || '').trim()
            // Cost estimate: input ~80 tokens, output up to 600. Haiku ~$0.001/Ktok input + $0.005/Ktok output.
            const inTokens = body.usage?.input_tokens || 80
            const outTokens = body.usage?.output_tokens || 600
            const cost = (inTokens / 1000) * 0.001 + (outTokens / 1000) * 0.005
            totalCost += cost
            opts.budget?.recordSpend(cost)

            const { cited, citations } = extractCitationsFromAnswer(answer, opts.ourIdentifiers)
            results.push({
                engine: 'claude',
                keyword,
                cited_us: cited,
                citations,
                answer_excerpt: answer.slice(0, 800),
                probed_successfully: true,
                cost_usd: cost,
                probed_at: new Date().toISOString(),
            })
        } catch (err) {
            results.push(skipped(keyword, `error_${(err as Error).name}`))
        }
    }

    return {
        engine: 'claude',
        keywords: kws,
        results,
        citation_share_pct: citationSharePct(results),
        total_cost_usd: totalCost,
        duration_ms: 0,
    }
}

function buildPrompt(keyword: string): string {
    return `כשמישהו בישראל מחפש או שואל על "${keyword}", אילו עסקים / מוצרים / שירותים הם הכי רלוונטיים?

תן רשימה של 3-5 השמות הכי בולטים ב-2026, עם משפט הסבר קצר על כל אחד.
ענה רק על מה שאתה יודע בוודאות — אסור להמציא.
פורמט: רשימה ממוספרת.`
}

interface AnswerCitation {
    source: string
    url?: string
    rank: number
}

function extractCitationsFromAnswer(answer: string, ourIdentifiers: string[]): {
    cited: boolean
    citations: AnswerCitation[]
} {
    // Find numbered-list items (1. X 2. Y ...)
    const lines = answer.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const citations: AnswerCitation[] = []
    let rank = 0
    for (const line of lines) {
        const m = line.match(/^(?:\d+\.|[*-])\s*(.+)$/)
        if (!m) continue
        rank++
        // First "noun phrase" before colon/dash/parens is likely the brand
        const head = m[1].split(/[:—–\-(]/)[0].trim()
        // Strip Markdown bold markers
        const cleaned = head.replace(/^\*+|\*+$/g, '').trim()
        if (cleaned.length === 0) continue
        citations.push({ source: cleaned, rank })
    }
    // Fallback: if no numbered list found, use the whole answer as one "blob"
    if (citations.length === 0 && answer.length > 0) {
        citations.push({ source: answer.slice(0, 200), rank: 1 })
    }
    const cited = citations.some(c => isOurBrand(c, ourIdentifiers))
    return { cited, citations }
}

function skipped(keyword: string, reason: string): AeoProbeResult {
    return {
        engine: 'claude',
        keyword,
        cited_us: false,
        citations: [],
        probed_successfully: false,
        error: reason,
        cost_usd: 0,
        probed_at: new Date().toISOString(),
    }
}

function failAllKeywords(keywords: string[], reason: string): AeoProbeBatchResult {
    return {
        engine: 'claude',
        keywords,
        results: keywords.map(k => skipped(k, reason)),
        citation_share_pct: 0,
        total_cost_usd: 0,
        duration_ms: 0,
    }
}