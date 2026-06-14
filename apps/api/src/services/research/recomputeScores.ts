/**
 * Deterministic priority_score recompute — Phase QA round-11.
 *
 * Several stages (internal_seo_audit's top_priority_actions, etc.) declare
 *   priority_score = (reach × impact × confidence) / max(effort, 1) / 100
 * and emit it inside JSON code-blocks. The model computes it correctly for
 * effort = 1 but frequently forgets to divide by effort on non-1-effort rows
 * → a math_sanity hard-failure the LLM self-critique revision can't reliably
 * fix (LLMs are unreliable at arithmetic — observed twice on the same stage).
 *
 * Recompute it server-side from the components BEFORE the critic sees the
 * content, so the math always checks out. Mirrors competitor_landscape's
 * recomputeCompetitorScorecards — deterministic > LLM for arithmetic.
 *
 * Touches ONLY objects that carry ALL FOUR formula inputs
 * (reach_score_0_100, impact_score_0_100, confidence_0_to_1, effort_dev_days)
 * plus a priority_score field — every other stage / field is untouched, so it
 * is safe to run unconditionally on any stage's content.
 */

const round1 = (n: number): number => Math.round(n * 10) / 10

function recomputeNode(node: unknown, stats: { fixed: number }): void {
    if (Array.isArray(node)) {
        for (const x of node) recomputeNode(x, stats)
        return
    }
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const r = o.reach_score_0_100
    const im = o.impact_score_0_100
    const cf = o.confidence_0_to_1
    const ef = o.effort_dev_days
    if (
        typeof r === 'number' && typeof im === 'number' &&
        typeof cf === 'number' && typeof ef === 'number' &&
        'priority_score' in o
    ) {
        const correct = round1((r * im * cf) / Math.max(ef, 1) / 100)
        if (typeof o.priority_score !== 'number' || Math.abs(o.priority_score - correct) > 0.05) {
            stats.fixed++
        }
        o.priority_score = correct
    }
    for (const v of Object.values(o)) recomputeNode(v, stats)
}

/**
 * Rewrite every JSON code-block in `content`, recomputing priority_score from
 * its components. Non-JSON / malformed blocks are left untouched. Returns the
 * corrected content + how many values were fixed.
 */
export function recomputePriorityScores(content: string): { content: string; fixed: number } {
    const stats = { fixed: 0 }
    const next = content.replace(/```json\s*\n([\s\S]*?)\n```/g, (full, body: string) => {
        let obj: unknown
        try {
            obj = JSON.parse(body)
        } catch {
            return full // malformed / not really JSON → leave as the model wrote it
        }
        recomputeNode(obj, stats)
        return '```json\n' + JSON.stringify(obj, null, 2) + '\n```'
    })
    return { content: next, fixed: stats.fixed }
}