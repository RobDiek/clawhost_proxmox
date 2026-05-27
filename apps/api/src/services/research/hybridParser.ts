/**
 * Hybrid response parser — extracts the JSON code-block + records from a
 * stage response that mixes markdown narrative with structured JSON.
 *
 * Per playbook §17 (Phase 3.5 implementation decisions): structured
 * records are JSON-first, narrative is embedded markdown. The agent
 * emits both in one document; this module pulls them apart.
 *
 * Failure modes:
 *   - No JSON block → return null records, full content as markdown
 *   - JSON block present but malformed → log warning, return null records
 *   - JSON parses but doesn't have `records` array → treat the parsed
 *     value as the records-or-not based on shape
 *
 * We don't validate schema here — that's the per-stage controller's job
 * since it knows the expected record shape. We just parse and return.
 */

const JSON_BLOCK_RE = /```json\s*\n([\s\S]*?)\n```/i

export interface HybridParseResult {
    /** The full markdown including the JSON code-block (preserved verbatim). */
    markdown: string
    /** Parsed records array if the JSON block contained `{ records: [...] }`. */
    records: unknown[] | null
    /** Raw parsed JSON if the block was valid (for stages with non-array shapes). */
    rawJson: unknown | null
    /** Section-level confidence rollup from the JSON if present. */
    confidence?: 'high' | 'medium' | 'working_hypothesis'
    /** Diagnostic — true if we found a JSON block but couldn't parse it. */
    jsonBlockMalformed: boolean
}

/**
 * Parse a hybrid agent response. Always returns — never throws.
 */
export function parseHybridResponse(content: string): HybridParseResult {
    const result: HybridParseResult = {
        markdown: content,
        records: null,
        rawJson: null,
        jsonBlockMalformed: false,
    }

    // Phase 3.18 — extract JSON text. Try canonical fenced match first; if
    // the closing ``` is missing (truncation symptom — model hit max_tokens
    // mid-output) fall back to "open fence + everything to end of content".
    // Phase 2026.02 — added 3rd fallback: raw JSON without any fence (some
    // prompts produce JSON-only output, e.g. client_account_baseline v2 prompt
    // explicitly asks "JSON only"). Detected by content starting with `{` or `[`.
    let jsonText: string
    const match = content.match(JSON_BLOCK_RE)
    if (match) {
        jsonText = match[1].trim()
    } else {
        const openFenceIdx = content.search(/```json\s*\n/i)
        if (openFenceIdx !== -1) {
            // No closing fence — slice from after the opening fence to end-of-content
            // and let the truncated-JSON repair tier handle it.
            const afterFence = content.substring(openFenceIdx).replace(/^```json\s*\n/i, '')
            jsonText = afterFence.trim()
        } else {
            // No fence at all. Check if content is a raw JSON object/array.
            const trimmed = content.trim()
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                jsonText = trimmed
            } else {
                return result
            }
        }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        // Tier 2: control-char sanitization (raw newlines inside string values).
        try {
            parsed = JSON.parse(sanitizeJsonControlChars(jsonText))
        } catch {
            // Tier 3: common LLM-hallucination repairs (double quotes, trailing commas).
            try {
                parsed = JSON.parse(repairCommonJsonErrors(sanitizeJsonControlChars(jsonText)))
                console.warn('[hybridParser] JSON repaired via Tier 3 (LLM hallucination patterns)')
            } catch {
                // Tier 4 (Phase 3.18) — the JSON was truncated mid-output. Try
                // to balance braces/brackets and rescue whatever records[] we
                // had completed before the cutoff. Better partial than nothing.
                const repaired = repairTruncatedJson(sanitizeJsonControlChars(jsonText))
                try {
                    parsed = JSON.parse(repaired)
                    console.warn('[hybridParser] JSON repaired via Tier 4 (truncated — reconstructed close)')
                } catch (err) {
                    console.warn('[hybridParser] JSON code-block malformed (4 tiers tried):', (err as Error).message)
                    result.jsonBlockMalformed = true
                    return result
                }
            }
        }
    }

    result.rawJson = parsed

    // Common shape: { records: [...], confidence?: ... }
    if (parsed && typeof parsed === 'object') {
        const obj = parsed as { records?: unknown; confidence?: string }
        if (Array.isArray(obj.records)) {
            result.records = obj.records
        }
        if (typeof obj.confidence === 'string') {
            const c = obj.confidence
            if (c === 'high' || c === 'medium' || c === 'working_hypothesis') {
                result.confidence = c
            }
        }
    }

    // Fallback: if parsed itself is an array, treat as records
    if (Array.isArray(parsed) && !result.records) {
        result.records = parsed
    }

    return result
}

/**
 * Walks a JSON string and escapes raw control chars (newline / CR / tab) that
 * appear *inside* string literals — a common failure mode where the model
 * emits multi-line text inside a JSON value without escaping.
 */
function sanitizeJsonControlChars(src: string): string {
    let out = ''
    let inStr = false
    let esc = false
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { out += ch; esc = false; continue }
            if (ch === '\\') { out += ch; esc = true; continue }
            if (ch === '"') { out += ch; inStr = false; continue }
            const code = ch.charCodeAt(0)
            if (code === 0x0A) { out += '\\n'; continue }
            if (code === 0x0D) { out += '\\r'; continue }
            if (code === 0x09) { out += '\\t'; continue }
            if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue }
            out += ch
        } else {
            out += ch
            if (ch === '"') { inStr = true; esc = false }
        }
    }
    return out
}

/**
 * Repair common LLM JSON hallucination patterns. Covers issues observed
 * in production:
 *   - Double-closing-quote on a string value: `"text"",` → `"text",`
 *     (the model accidentally emits two closing quotes before delimiter)
 *   - Trailing comma before closing brace/bracket: `,\s*}` or `,\s*]`
 *   - Unescaped trailing newline-after-colon followed by quoted string
 *
 * Runs AFTER sanitizeJsonControlChars. Conservative — only patches
 * patterns we've seen break parsing. Doesn't try to be a full JSON
 * recoverer; just nudges common LLM mistakes back to valid JSON.
 */
function repairCommonJsonErrors(src: string): string {
    let out = src
    // Double-closing quote pattern: "...""<comma|brace|bracket|newline>
    // The first " correctly closes the value; the model added an extra "
    // before the delimiter. Replace `""` followed by structural char with `"`.
    out = out.replace(/""(\s*[,}\]\n])/g, '"$1')
    // Trailing comma before closing bracket/brace.
    out = out.replace(/,(\s*[}\]])/g, '$1')
    return out
}

/**
 * Phase 3.18 Tier 4 — repair JSON truncated mid-output (model hit max_tokens
 * mid-stream). Walk the string tracking strings/escapes and brace/bracket
 * depth, and at the end:
 *   1. If we're inside an unterminated string → close it with a quote.
 *   2. If we're inside a partial property-name or value position → trim the
 *      tail back to the last complete record.
 *   3. Close all open `{` and `[` in reverse order.
 *
 * This is best-effort. The goal is to rescue whatever records[] entries
 * were emitted before the cutoff — a partial result beats zero records.
 */
function repairTruncatedJson(src: string): string {
    if (!src.trim().startsWith('{') && !src.trim().startsWith('[')) return src
    // Walk the string tracking depth + string state.
    let depth = 0
    const stack: string[] = []  // tracks { vs [
    let inStr = false
    let esc = false
    let lastCompleteCommaIdx = -1  // index of the last comma at depth=2 (inside records[] one element complete)
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') { inStr = true; continue }
        if (ch === '{' || ch === '[') {
            stack.push(ch)
            depth++
        } else if (ch === '}' || ch === ']') {
            stack.pop()
            depth--
        } else if (ch === ',' && depth === 2 && stack[0] === '{' && stack[1] === '[') {
            // Comma inside records[] (root object → records array → element).
            // Record this — if we hit truncation, we trim back to this comma
            // and treat the prior records as the recoverable subset.
            lastCompleteCommaIdx = i
        }
    }

    // If well-formed (no string state, no open structures) — return as-is.
    if (!inStr && depth === 0) return src

    let out = src
    if (inStr) {
        // Trim the broken string entirely — back to the last comma
        // inside records[] so we keep prior complete records.
        if (lastCompleteCommaIdx >= 0) {
            out = src.substring(0, lastCompleteCommaIdx)
            // Re-walk to recompute depth/stack.
            depth = 0
            stack.length = 0
            inStr = false
            esc = false
            for (let i = 0; i < out.length; i++) {
                const ch = out[i]
                if (inStr) {
                    if (esc) { esc = false; continue }
                    if (ch === '\\') { esc = true; continue }
                    if (ch === '"') inStr = false
                    continue
                }
                if (ch === '"') { inStr = true; continue }
                if (ch === '{' || ch === '[') { stack.push(ch); depth++ }
                else if (ch === '}' || ch === ']') { stack.pop(); depth-- }
            }
        } else {
            // No safe trim point → close the broken string with a quote.
            out += '"'
        }
    }

    // Trim any trailing whitespace + dangling open syntax (key without value, etc).
    out = out.replace(/[\s,]*"\s*[a-zA-Z_]+\s*:\s*$/, '')  // dangling key:
    out = out.replace(/[,\s]+$/, '')                       // trailing comma/whitespace

    // Close open structures in reverse stack order.
    while (stack.length) {
        const open = stack.pop()
        out += open === '{' ? '}' : ']'
    }
    return out
}

/**
 * Compute a section-level confidence rollup from an array of records.
 *
 * Phase 4.0(fix7) — was worst-case (any working_hypothesis → whole stage
 * is working_hypothesis). For competitor_landscape that fired whenever
 * any tail competitor had no enrichment, even when the top-3 flagship
 * records were fully sourced — misleading "low quality" red badge over
 * an actually-strong stage.
 *
 * New: majority rule with a quality floor.
 *   - ≥50% of records `high` → high
 *   - ≥50% of records `working_hypothesis` → working_hypothesis
 *   - otherwise → medium
 *
 * Tail records being unenriched is normal data shape; the stage's
 * overall confidence should reflect what the user can actually rely on.
 */
export function rollupConfidence(records: Array<{ confidence?: string }>): 'high' | 'medium' | 'working_hypothesis' | undefined {
    if (records.length === 0) return undefined
    let high = 0, medium = 0, wh = 0
    for (const r of records) {
        if (r.confidence === 'high') high++
        else if (r.confidence === 'medium') medium++
        else if (r.confidence === 'working_hypothesis') wh++
    }
    const total = records.length
    if (high / total >= 0.5) return 'high'
    if (wh / total >= 0.5) return 'working_hypothesis'
    return 'medium'
}