/**
 * Deterministic priority-action recompute — Phase QA round-11/12.
 *
 * `internal_seo_audit` emits a `top_10_priority_actions` array where each row
 * carries the RICE-style inputs (reach_score_0_100, impact_score_0_100,
 * confidence_0_to_1, effort_dev_days) and a derived `priority_score`. Two things
 * the LLM gets wrong and can't reliably self-fix:
 *   1. ARITHMETIC — recomputes inconsistently across rows.
 *   2. RANKING ORDER — assigns rank 1..N by eyeball, so the list is NOT sorted
 *      by priority_score (e.g. rank 4 = 140.4 sits above rank 1 = 122.4). That
 *      internal inconsistency is exactly what the math_sanity critic flags.
 *
 * Canonical formula (Sergei's call 2026-06-14 — classic RICE, quick-wins win):
 *   priority_score = (reach × impact × confidence) / effort / 100
 * (effort ≤ 0 guarded to 1 to avoid divide-by-zero.) NO max(effort,1) clamp —
 * sub-day tasks legitimately outrank big ones.
 *
 * We OWN these numbers server-side: recompute → sort descending → re-rank. Runs
 * deterministically so the result is identical every time and the critic always
 * sees a consistent table. Touches ONLY arrays whose every element carries the
 * four inputs + a priority_score — nothing else in any stage is affected.
 */

const round1 = (n: number): number => Math.round(n * 10) / 10

const isActionRow = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === 'object' &&
    typeof (x as Record<string, unknown>).reach_score_0_100 === 'number' &&
    typeof (x as Record<string, unknown>).impact_score_0_100 === 'number' &&
    typeof (x as Record<string, unknown>).confidence_0_to_1 === 'number' &&
    typeof (x as Record<string, unknown>).effort_dev_days === 'number' &&
    'priority_score' in (x as Record<string, unknown>)

/** A priority-action array = non-empty and EVERY element is an action row. */
const isActionArray = (n: unknown): n is Array<Record<string, unknown>> =>
    Array.isArray(n) && n.length > 0 && n.every(isActionRow)

/**
 * Recompute priority_score for every row, sort descending, re-rank (1..N when
 * the rows carry a `rank` field). Mutates `arr` in place. Returns how many
 * values (score or rank) changed — for logging.
 */
function fixActionArray(arr: Array<Record<string, unknown>>): number {
    let fixed = 0
    for (const x of arr) {
        const r = x.reach_score_0_100 as number
        const im = x.impact_score_0_100 as number
        const cf = x.confidence_0_to_1 as number
        const ef = x.effort_dev_days as number
        const correct = round1((r * im * cf) / (ef > 0 ? ef : 1) / 100)
        if (typeof x.priority_score !== 'number' || Math.abs(x.priority_score - correct) > 0.05) fixed++
        x.priority_score = correct
    }
    arr.sort((a, b) => (b.priority_score as number) - (a.priority_score as number))
    arr.forEach((x, i) => {
        if ('rank' in x && x.rank !== i + 1) { x.rank = i + 1; fixed++ }
    })
    return fixed
}

/**
 * Walk any parsed JSON value; recompute/sort/re-rank every action array found.
 * Use on structured siblings (output.extras, output.records) so the dashboard's
 * structured renderers agree with the prose. Returns total values changed.
 */
export function recomputePriorityScoresDeep(node: unknown): number {
    let fixed = 0
    if (Array.isArray(node)) {
        if (isActionArray(node)) fixed += fixActionArray(node)
        for (const x of node) fixed += recomputePriorityScoresDeep(x)
    } else if (node && typeof node === 'object') {
        for (const v of Object.values(node as Record<string, unknown>)) {
            fixed += recomputePriorityScoresDeep(v)
        }
    }
    return fixed
}

/**
 * Brace-match the JSON array enclosing position `pos` in `content`. Returns
 * [start, end] indices of the `[ … ]` span, or null if unbalanced.
 */
function enclosingArraySpan(content: string, pos: number): [number, number] | null {
    let start = -1
    let depth = 0
    for (let k = pos; k >= 0; k--) {
        const ch = content[k]
        if (ch === ']') depth++
        else if (ch === '[') { if (depth === 0) { start = k; break } depth-- }
    }
    if (start < 0) return null
    depth = 0
    for (let k = start; k < content.length; k++) {
        const ch = content[k]
        if (ch === '[') depth++
        else if (ch === ']') { depth--; if (depth === 0) return [start, k] }
    }
    return null
}

/**
 * Fence-agnostic text rewriter. Finds every JSON array of priority actions
 * embedded in `content` (whether or not it sits inside a ```json fence),
 * recomputes + sorts + re-ranks it, and splices the corrected JSON back into
 * the same span. The surrounding narrative is untouched.
 *
 * Must run LAST (after the self-critique revision + Hebrew cleanup re-emit the
 * content) so it owns the final shipped numbers — earlier passes get discarded
 * by those LLM re-emissions.
 */
export function recomputePriorityScoresInText(content: string): { content: string; fixed: number } {
    let fixed = 0
    const seen = new Set<number>() // array start offsets already handled
    const positions = [...content.matchAll(/"reach_score_0_100"\s*:/g)].map(m => m.index ?? -1)
    // Process right-to-left so earlier splices don't shift later offsets.
    const spans: Array<[number, number]> = []
    for (const p of positions) {
        if (p < 0) continue
        const span = enclosingArraySpan(content, p)
        if (!span || seen.has(span[0])) continue
        seen.add(span[0])
        spans.push(span)
    }
    spans.sort((a, b) => b[0] - a[0])
    for (const [start, end] of spans) {
        const raw = content.slice(start, end + 1)
        let arr: unknown
        try {
            arr = JSON.parse(raw)
        } catch {
            continue // not a clean array (surrounding tokens) — leave as-is
        }
        if (!isActionArray(arr)) continue
        fixed += fixActionArray(arr)
        content = content.slice(0, start) + JSON.stringify(arr, null, 2) + content.slice(end + 1)
    }
    return { content, fixed }
}