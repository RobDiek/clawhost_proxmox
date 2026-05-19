/**
 * LLM JSON extraction utility.
 *
 * Robust JSON parser for Opus/Sonnet output — handles the long list of
 * common malformations: control chars inside strings, trailing commas,
 * unquoted keys, single quotes, markdown fences, mid-output truncation.
 *
 * Used by: mazhirMediaPlan, monthlyPlanGenerator, anyone calling Opus
 * with a JSON contract.
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

function stripTrailingCommas(src: string): string {
    return src.replace(/,(\s*[}\]])/g, '$1')
}

function aggressiveJsonClean(src: string): string {
    let s = src
    s = s.replace(/^\s*\/\/.*$/gm, '')
    s = s.replace(/\/\*[\s\S]*?\*\//g, '')
    s = s.replace(/,(\s*[}\]])/g, '$1')
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    // Phase 4.3-G fix: REMOVED the single-quote → double-quote conversion.
    // It was context-blind and destroyed Hebrew narrative content where we
    // EXPLICITLY ask Opus to use 'word' for emphasis inside strings. The
    // regex matched 'word', anywhere — including inside hebrew value of
    // overview — and produced unescaped " inside a JSON string. Single
    // quotes inside JSON strings are valid content and should be preserved.
    return s
}

/**
 * Phase 4.3-G: heuristic fixer for unescaped " inside JSON string values —
 * the #1 failure mode on Hebrew Opus output. Pattern: Opus uses "word" for
 * emphasis inside a string instead of 'word' or \"word\".
 *
 * Strategy: walk the source as a state machine. We're inside a string when
 * the previous unescaped " opened one. A " is a STRING TERMINATOR only when
 * followed (after optional whitespace) by ',', '}', ']', or ':'. Any other "
 * inside a string body is treated as a content character and escaped.
 *
 * This is heuristic but catches the common case without regex backtracking.
 */
function escapeInternalQuotes(src: string): string {
    let out = ''
    let inStr = false
    let escNext = false
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (escNext) { out += ch; escNext = false; continue }
        if (ch === '\\') { out += ch; escNext = true; continue }
        if (!inStr) {
            out += ch
            if (ch === '"') inStr = true
            continue
        }
        // Inside string: decide if this " terminates or is content
        if (ch === '"') {
            // Look ahead past whitespace for the next non-space char
            let j = i + 1
            while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++
            const next = src[j]
            if (next === ',' || next === '}' || next === ']' || next === ':' || j >= src.length) {
                // Real string terminator
                out += ch
                inStr = false
            } else {
                // Content " — escape it
                out += '\\"'
            }
            continue
        }
        out += ch
    }
    return out
}

function findLastBalancedClose(src: string): number {
    let depth = 0, inStr = false, esc = false, lastValidEnd = -1
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) lastValidEnd = i }
    }
    return lastValidEnd
}

/**
 * Convert embedded-JSON-array content inside a string value into plain text.
 *
 * Detects the failure mode where an LLM emits:
 *   "excerpt": "[\"item1\",\"item2\",\"item3\"]"
 * but FORGOT to escape the inner quotes — producing instead:
 *   "excerpt": "["item1","item2","item3"]"
 *
 * Heuristic: find any colon-prefixed string value that opens with `[` or `{`
 * (literal bracket immediately after the opening "). Inside that scope,
 * convert all unescaped " to ' until we hit the matching ] or } followed by
 * a closing ". This converts the inner quotes from JSON-breaking double
 * quotes to JSON-safe single quotes.
 */
function flattenEmbeddedJsonInStrings(src: string): string {
    let out = ''
    let i = 0
    while (i < src.length) {
        // Look for the pattern : "[  or  : "{
        const m = src.slice(i).match(/(:\s*")(\s*[[{])/)
        if (!m || m.index === undefined) {
            out += src.slice(i)
            break
        }
        const matchPos = i + m.index
        const opener = m[1]
        const bracket = m[2].trim()
        const closer = bracket === '[' ? ']' : '}'
        // Copy everything up to the start of the string value
        out += src.slice(i, matchPos) + opener
        let j = matchPos + opener.length
        // Now scan looking for the matching closer followed by ", converting all inner " to '
        let depth = 0
        let escapedNext = false
        while (j < src.length) {
            const ch = src[j]
            if (escapedNext) { out += ch; escapedNext = false; j++; continue }
            if (ch === '\\') { out += ch; escapedNext = true; j++; continue }
            if (ch === bracket) { depth++; out += ch; j++; continue }
            if (ch === closer) {
                depth--
                out += ch
                j++
                if (depth === 0) {
                    // The next char should be " — string terminator
                    // (after possible whitespace)
                    let k = j
                    while (k < src.length && /\s/.test(src[k])) k++
                    if (k < src.length && src[k] === '"') {
                        out += src.slice(j, k + 1)
                        j = k + 1
                    }
                    break
                }
                continue
            }
            if (ch === '"') {
                // Convert to single quote
                out += "'"
                j++
                continue
            }
            out += ch
            j++
        }
        i = j
    }
    return out
}

/**
 * Walk the source as a bracket/quote state machine. Returns a JSON string with
 * any unclosed structures (open string, open arrays/objects) closed at the end.
 * Used as a fallback for truncated LLM output (max_tokens cap mid-stream).
 *
 * "Safe boundary" rules:
 *   - End of complete value (closing " of string, } or ] of obj/array)
 *   - After a `,` separator
 *   - NOT after `:` because that would leave key:VALUE-MISSING
 *   - When wrapped object/array is open and we cut mid-string, fall back
 *     to last safe boundary OUTSIDE the current string
 */
function autoCloseTruncated(src: string): string {
    let inStr = false
    let esc = false
    let lastSafeEnd = 0          // position after last comma or balanced }/] — safe truncation point
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') { inStr = false; lastSafeEnd = i + 1; continue }
            continue
        }
        if (ch === '"') { inStr = true; continue }
        if (ch === '{' || ch === '[') { continue }  // opening — NOT safe boundary alone
        if (ch === '}' || ch === ']') { lastSafeEnd = i + 1; continue }
        if (ch === ',') { lastSafeEnd = i + 1; continue }
        // Phase 4.3-G: do NOT treat `:` as safe — that leaves dangling key:
    }
    let result = src.slice(0, lastSafeEnd).replace(/,\s*$/, '')

    // Phase 4.3-G: trim back any orphan partial object/array that has no
    // complete key:value pair. After initial cut, the tail may look like:
    //   "actionPlan": [\n{"step"   ← orphan key with no value
    // or "actionPlan": [\n{   ← empty object inside an array
    // Strip back until we find a clean cut point — preferring the boundary
    // just AFTER the comma before the orphan, so the result ends like:
    //   "actionPlan": [\n  ← will be auto-closed as [] below
    // Walk backwards skipping whitespace, and if we hit content of an open
    // object/array that's incomplete, scan back to the opening bracket.
    {
        // Repeatedly remove trailing partial-key fragments / empty opens.
        // Pattern: `{...\n  "key"$` or `[\n  {"key"$` — strip back to before `{`.
        for (let iter = 0; iter < 8; iter++) {
            // If result ends with a `"text"` that's directly preceded by `{` (or `{` with whitespace) AND not followed by `:`, it's orphan key inside object
            const m1 = result.match(/(\{\s*"[^"]*")\s*$/)
            if (m1) {
                // Remove the `{...partial` entirely — back to before `{`
                const cutAt = result.lastIndexOf('{', result.length - 1)
                if (cutAt > 0) {
                    // Also strip the preceding `,` if any (we had element-separator in array)
                    result = result.slice(0, cutAt).replace(/,\s*$/, '')
                    continue
                }
            }
            // If result ends with `{` (empty open object), drop it + preceding `,`
            const m2 = result.match(/,\s*\{\s*$|\{\s*$/)
            if (m2 && m2.index !== undefined) {
                result = result.slice(0, m2.index)
                continue
            }
            // If result ends with `,` after a stripped trailing chunk
            const m3 = result.match(/,\s*$/)
            if (m3) {
                result = result.replace(/,\s*$/, '')
                continue
            }
            break
        }
    }

    // Re-walk to determine open brackets at end
    inStr = false
    esc = false
    const openStack: string[] = []
    for (let i = 0; i < result.length; i++) {
        const ch = result[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') inStr = true
        else if (ch === '{') openStack.push('}')
        else if (ch === '[') openStack.push(']')
        else if (ch === '}' || ch === ']') openStack.pop()
    }
    if (inStr) result += '"'
    while (openStack.length > 0) result += openStack.pop()
    return result
}

export function extractLlmJson<T>(raw: string, hint = 'output'): T {
    const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/)
    const candidate = fenced ? fenced[1] : raw
    const start = candidate.indexOf('{')
    if (start < 0) throw new Error(`No JSON in ${hint}: ${raw.slice(0, 300)}`)
    // Phase 4.3-G: don't slice to lastIndexOf('}') — that discards truncated tail.
    // Instead take everything from first { to end, then let auto-close handle truncation.
    const json = candidate.slice(start)

    const sc = sanitizeJsonControlChars(json)
    const tc = stripTrailingCommas(sc)
    const ag = aggressiveJsonClean(sc)
    const agtc = stripTrailingCommas(ag)
    // Phase 4.3-G: also try with unescaped-internal-quote fix layered on top
    const eq = escapeInternalQuotes(sc)
    const eqtc = stripTrailingCommas(eq)
    const eqag = escapeInternalQuotes(ag)
    const eqagtc = stripTrailingCommas(eqag)
    const attempts: Array<{ name: string; src: string }> = [
        { name: 'raw', src: json },
        { name: 'sanitize-control', src: sc },
        { name: 'strip-trailing', src: tc },
        { name: 'aggressive', src: ag },
        { name: 'aggressive+trailing', src: agtc },
        { name: 'escape-internal-quotes', src: eq },
        { name: 'escape-quotes+trailing', src: eqtc },
        { name: 'escape-quotes+aggressive', src: eqag },
        { name: 'escape-quotes+all', src: eqagtc },
    ]
    let lastErr: Error | null = null
    let posOfFailure = -1
    for (const a of attempts) {
        try {
            return JSON.parse(a.src) as T
        } catch (err) {
            lastErr = err as Error
            const m = (err as Error).message.match(/position\s+(\d+)/)
            if (m) posOfFailure = parseInt(m[1], 10)
        }
    }

    for (const a of [agtc, tc, sc]) {
        const lastClose = findLastBalancedClose(a)
        if (lastClose > 0) {
            const truncated = a.slice(0, lastClose + 1)
            try { return JSON.parse(truncated) as T } catch { /* keep trying */ }
        }
    }

    // Phase 4.3-G: ALWAYS try auto-close as a last resort — even if failure
    // position isn't near end of string. Truncated Opus output can have the
    // PARSER fail very early due to lastIndexOf('}') having cut off mid-doc,
    // but the actual truncation is at the end. Auto-close walks the whole
    // input and closes open structures.
    //
    // Layer the flattening pass on aggressively-cleaned versions so that
    // embedded JSON arrays inside string values (Opus failure mode:
    // "excerpt": "[\"x\",\"y\"]" → unescaped "x" breaks parsing) get
    // their inner " converted to '.
    const flat_sc = flattenEmbeddedJsonInStrings(sc)
    const flat_ag = flattenEmbeddedJsonInStrings(ag)
    const flat_agtc = stripTrailingCommas(flat_ag)
    for (const candidateSrc of [sc, tc, ag, agtc, flat_sc, flat_ag, flat_agtc]) {
        try {
            const closed = autoCloseTruncated(candidateSrc)
            console.warn(`[llmJson] auto-close attempt: orig ${candidateSrc.length} → closed ${closed.length}`)
            return JSON.parse(closed) as T
        } catch { /* keep trying */ }
    }

    // Auto-close truncated output by appending missing brackets/quotes
    if (posOfFailure > 0 && posOfFailure >= json.length - 5) {
        const cleaned = stripTrailingCommas(sanitizeJsonControlChars(json))
        let inStr = false, esc = false
        let lastSafe = 0
        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i]
            if (inStr) {
                if (esc) { esc = false; continue }
                if (ch === '\\') { esc = true; continue }
                if (ch === '"') { inStr = false; lastSafe = i + 1 }
                continue
            }
            if (ch === '"') { inStr = true }
            else if (ch === '{' || ch === '[' || ch === '}' || ch === ']' || ch === ',' || ch === ':') lastSafe = i + 1
        }
        let partial = cleaned.slice(0, lastSafe).replace(/,\s*$/, '')
        const openStack: string[] = []
        let inStr2 = false, esc2 = false
        for (let i = 0; i < partial.length; i++) {
            const ch = partial[i]
            if (inStr2) {
                if (esc2) { esc2 = false; continue }
                if (ch === '\\') { esc2 = true; continue }
                if (ch === '"') inStr2 = false
                continue
            }
            if (ch === '"') inStr2 = true
            else if (ch === '{') openStack.push('}')
            else if (ch === '[') openStack.push(']')
            else if (ch === '}' || ch === ']') openStack.pop()
        }
        if (inStr2) partial += '"'
        while (openStack.length > 0) partial += openStack.pop()
        try {
            console.warn(`[llmJson] auto-close recovered truncated JSON (orig len=${json.length}, recovered len=${partial.length})`)
            return JSON.parse(partial) as T
        } catch { /* fall through */ }
    }

    const window = posOfFailure > 0
        ? json.slice(Math.max(0, posOfFailure - 200), Math.min(json.length, posOfFailure + 200))
        : json.slice(0, 400)
    console.error(`[llmJson] parse failed in ${hint}. pos=${posOfFailure}, len=${json.length}, window: ${window}`)
    throw new Error(`Invalid JSON in ${hint}: ${(lastErr || new Error('unknown')).message} — pos ${posOfFailure}, window: ${window.slice(0, 200)}`)
}