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
    s = s.replace(/'((?:[^'\\]|\\.)*)'(\s*[:,}\]])/g, '"$1"$2')
    return s
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

export function extractLlmJson<T>(raw: string, hint = 'output'): T {
    const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/)
    const candidate = fenced ? fenced[1] : raw
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end < 0) throw new Error(`No JSON in ${hint}: ${raw.slice(0, 300)}`)
    const json = candidate.slice(start, end + 1)

    const sc = sanitizeJsonControlChars(json)
    const tc = stripTrailingCommas(sc)
    const ag = aggressiveJsonClean(sc)
    const agtc = stripTrailingCommas(ag)
    const attempts: Array<{ name: string; src: string }> = [
        { name: 'raw', src: json },
        { name: 'sanitize-control', src: sc },
        { name: 'strip-trailing', src: tc },
        { name: 'aggressive', src: ag },
        { name: 'aggressive+trailing', src: agtc },
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