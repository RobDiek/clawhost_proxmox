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

    const match = content.match(JSON_BLOCK_RE)
    if (!match) return result

    const jsonText = match[1].trim()
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        // Try a sanitization pass — agents sometimes emit raw newlines inside
        // JSON string values. Replace control chars within string literals.
        try {
            parsed = JSON.parse(sanitizeJsonControlChars(jsonText))
        } catch (err) {
            console.warn('[hybridParser] JSON code-block malformed:', (err as Error).message)
            result.jsonBlockMalformed = true
            return result
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
 * Compute a section-level confidence rollup from an array of records.
 * Worst-case: any working_hypothesis → working_hypothesis; any medium without
 * working_hypothesis → medium; all high → high.
 */
export function rollupConfidence(records: Array<{ confidence?: string }>): 'high' | 'medium' | 'working_hypothesis' | undefined {
    if (records.length === 0) return undefined
    let worst: 'high' | 'medium' | 'working_hypothesis' = 'high'
    for (const r of records) {
        const c = r.confidence
        if (c === 'working_hypothesis') return 'working_hypothesis'
        if (c === 'medium' && worst === 'high') worst = 'medium'
    }
    return worst
}