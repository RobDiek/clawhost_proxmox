/**
 * Minimal CSV parser. Mappers receive `Record<string, string>` rows so they
 * can look up columns by their (potentially Hebrew, potentially weird) names
 * without caring about index positions.
 *
 * Not using a heavyweight CSV lib because Meta/Google export CSVs are tame:
 *   - UTF-8, BOM optional (Excel sometimes adds it)
 *   - Comma-delimited (occasionally semicolon when exported from Israeli Excel)
 *   - Fields with commas are double-quoted
 *   - Double quotes inside fields are escaped as ""
 */

export interface ParsedCsv {
    headers: string[]
    /** Original delimiter detected — useful for re-emitting if we ever do. */
    delimiter: ',' | ';' | '\t'
    rows: Record<string, string>[]
}

function stripBom(s: string): string {
    if (s.charCodeAt(0) === 0xFEFF) return s.slice(1)
    return s
}

function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
    // Count occurrences outside quoted regions
    const counts = { ',': 0, ';': 0, '\t': 0 }
    let inQuote = false
    for (let i = 0; i < firstLine.length; i++) {
        const ch = firstLine[i]
        if (ch === '"') inQuote = !inQuote
        else if (!inQuote && (ch === ',' || ch === ';' || ch === '\t')) {
            counts[ch as keyof typeof counts]++
        }
    }
    if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
    if (counts[';'] > counts[',']) return ';'
    return ','
}

function splitCsvLine(line: string, delim: string): string[] {
    const out: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuote) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++ }
                else inQuote = false
            } else {
                cur += ch
            }
        } else {
            if (ch === '"') inQuote = true
            else if (ch === delim) { out.push(cur); cur = '' }
            else cur += ch
        }
    }
    out.push(cur)
    return out
}

export function parseCsv(buffer: Buffer): ParsedCsv {
    const text = stripBom(buffer.toString('utf-8'))
    const lines = text.split(/\r?\n/).filter(l => l.length > 0)
    if (lines.length === 0) return { headers: [], delimiter: ',', rows: [] }

    const delimiter = detectDelimiter(lines[0])
    const headers = splitCsvLine(lines[0], delimiter).map(h => h.trim())

    const rows: Record<string, string>[] = []
    for (let li = 1; li < lines.length; li++) {
        const cells = splitCsvLine(lines[li], delimiter)
        // Skip rows that are clearly empty or summary rows starting with "Total:" / "סה"כ"
        if (cells.every(c => c.trim() === '')) continue
        const row: Record<string, string> = {}
        for (let ci = 0; ci < headers.length; ci++) {
            row[headers[ci]] = (cells[ci] ?? '').trim()
        }
        rows.push(row)
    }

    return { headers, delimiter, rows }
}

// ─── Column resolver helpers ──────────────────────────────────────────────
// Header names in Hebrew exports include directional marks (RTL/LTR) and
// occasional whitespace variants. Strip them for robust matching.
function normalizeHeader(h: string): string {
    return h
        .replace(/[‎‏‪-‮]/g, '')   // bidi marks
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

/**
 * Look up a column value by trying multiple candidate header names. Returns
 * the FIRST match. Comparison is case-insensitive + ignores bidi marks +
 * collapses whitespace. Used by Hebrew/English mixed CSV exports.
 */
export function pickColumn(row: Record<string, string>, candidates: string[]): string | undefined {
    const normalized: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) normalized[normalizeHeader(k)] = v
    for (const c of candidates) {
        const key = normalizeHeader(c)
        if (key in normalized && normalized[key] !== '') return normalized[key]
    }
    return undefined
}

/**
 * Parse a possibly localized number. Handles:
 *   - "1,234.56"   English
 *   - "1.234,56"   European
 *   - "₪1,234"     With currency symbol
 *   - "1 234"      Space-separated
 *   - "—" / "-"    No-data → undefined
 *   - "12.3%"      Percent → 0.123 (factor) — caller decides if it wants %
 */
export function parseLocaleNumber(raw: string | undefined): number | undefined {
    if (raw == null) return undefined
    const s = raw.trim()
    if (s === '' || s === '-' || s === '—' || s === '–' || s === 'N/A' || /^—/.test(s)) return undefined
    // Strip currency symbols and bidi marks
    let cleaned = s.replace(/[‎‏‪-‮₪$€£¥]/g, '').trim()
    const hadPercent = /%$/.test(cleaned)
    if (hadPercent) cleaned = cleaned.slice(0, -1).trim()
    // European format: "1.234,56" → "1234.56"
    const isEuropean = /^\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)
    if (isEuropean) cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    else cleaned = cleaned.replace(/[\s,]/g, '')   // English: remove thousand separators
    const n = parseFloat(cleaned)
    if (!Number.isFinite(n)) return undefined
    return hadPercent ? n / 100 : n
}