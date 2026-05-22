/**
 * Hebrew QA — language-quality gate for ALL Hebrew LLM output.
 *
 * Enforces (per feedback_hebrew_plural + feedback_senior_marketing_bar memory):
 *   1. No untranslated English words inside Hebrew sentences (allowlist for
 *      brand/tech terms)
 *   2. Plural address form (אתם / תוכלו / לכם), not singular (אתה / תוכל / לך)
 *   3. Reasonable mix of Hebrew vs other-script tokens
 *
 * NOT a hard fail by default — produces structured findings the caller
 * decides how to escalate. Mid-grade hard-fails are auto-corrected when
 * possible (e.g. obvious singular→plural conversions); irrecoverable
 * issues bubble up.
 *
 * Used by: every LLM-driven stage's narrative + per-record Hebrew fields
 * (priority_action, biggest_weakness, etc.).
 */

// Allowlist — English tokens that are LEGITIMATE inside Hebrew sentences.
// These are brand names + universally-accepted tech terms. Extend
// carefully; over-permissive allowlist defeats the purpose.
const ENGLISH_TOKEN_ALLOWLIST = new Set<string>([
    // Tech protocols / file types
    'api', 'apis', 'url', 'urls', 'json', 'xml', 'html', 'css', 'js', 'pdf',
    'http', 'https', 'ftp', 'ssh', 'sql', 'csv',
    // Business KPIs / metrics
    'roi', 'cpa', 'cpm', 'cpc', 'ctr', 'cvr', 'aov', 'ltv', 'cac', 'mrr', 'arr', 'roas',
    'kpi', 'kpis', 'mvp', 'b2b', 'b2c', 'b2g', 'p2p', 'saas', 'paas', 'iaas',
    'gmb', 'serp', 'seo', 'sem', 'aeo', 'geo', 'eat', 'cwv', 'lcp', 'inp', 'cls', 'fid', 'tti',
    // Frameworks / platforms
    'wordpress', 'shopify', 'woocommerce', 'magento', 'webflow', 'wix',
    'react', 'vue', 'angular', 'next.js', 'node.js',
    // Brand / product names (extend per client)
    'google', 'meta', 'facebook', 'instagram', 'youtube', 'tiktok', 'linkedin',
    'twitter', 'whatsapp', 'telegram', 'gmail', 'chrome', 'safari', 'firefox',
    'cloudflare', 'aws', 'gcp', 'azure',
    'allpay', 'paypal', 'stripe', 'bit', 'visa', 'mastercard',
    'wikipedia', 'wikidata', 'github', 'gitlab', 'bitbucket',
    'claude', 'chatgpt', 'gpt', 'perplexity', 'bing', 'copilot', 'gemini',
    // Hebrew-CV common loanwords (transliterated; accepted)
    'pmax', 'tcpa', 'troas', 'asc', 'capi', 'oci', 'gtm', 'ga4', 'pwa',
    'cms', 'crm', 'erp', 'cdn', 'tld', 'ssl', 'tls', 'dns',
    // Numbers + units that may appear with English suffix
    'k', 'm', 'b',  // 50k, 1m, 2b
    'mb', 'gb', 'tb', 'ms', 'sec', 'min',
])

// Singular-form Hebrew tokens that are red flags (caller may auto-convert).
// Order: longer patterns first so we don't false-match substrings.
const SINGULAR_TO_PLURAL: Array<{ singular: RegExp; plural: string; note?: string }> = [
    // Direct address singular → plural
    { singular: /\bתוכל\b/g,   plural: 'תוכלו' },
    { singular: /\bתרצה\b/g,   plural: 'תרצו' },
    { singular: /\bתבחר\b/g,   plural: 'תבחרו' },
    { singular: /\bתנסה\b/g,   plural: 'תנסו' },
    { singular: /\bתוסיף\b/g,  plural: 'תוסיפו' },
    { singular: /\bתעדכן\b/g,  plural: 'תעדכנו' },
    { singular: /\bתבדוק\b/g,  plural: 'תבדקו' },
    { singular: /\bתמדוד\b/g,  plural: 'תמדדו' },
    { singular: /\bתשתמש\b/g,  plural: 'תשתמשו' },
    { singular: /\bתחליט\b/g,  plural: 'תחליטו' },
    // Pronouns
    { singular: /\bלך\b/g,     plural: 'לכם' },
    { singular: /\bשלך\b/g,    plural: 'שלכם' },
    { singular: /\bאתה\b/g,    plural: 'אתם' },
]

export interface HebrewQAFinding {
    category: 'english_leak' | 'singular_address' | 'mixed_script_excess' | 'empty_text'
    severity: 'fail' | 'warn' | 'info'
    description: string
    /** What we found — raw token / phrase */
    evidence: string
    /** Auto-fix suggestion if applicable */
    suggestion?: string
    /** Index in the text where the issue was found */
    position?: number
}

export interface HebrewQAResult {
    text: string
    findings: HebrewQAFinding[]
    /** Heuristic score 0-100; 100 = clean Hebrew, 0 = fully broken */
    score: number
    /** True if the text is suitable for user-facing display without rework */
    passes: boolean
}

/**
 * Run all checks on a Hebrew text string. Returns structured findings.
 * Empty / undefined text returns a single 'empty_text' info finding.
 */
export function checkHebrewQA(text: string | null | undefined, ctx?: { allowedEnglishExtras?: string[] }): HebrewQAResult {
    const t = (text || '').toString()
    if (t.trim().length === 0) {
        return {
            text: '',
            findings: [{ category: 'empty_text', severity: 'info', description: 'Empty Hebrew text', evidence: '' }],
            score: 0,
            passes: false,
        }
    }

    const findings: HebrewQAFinding[] = []
    const extraAllow = new Set((ctx?.allowedEnglishExtras || []).map(s => s.toLowerCase()))

    // 1. English-leak detection: find 3+ ASCII letter runs adjacent to Hebrew
    findings.push(...detectEnglishLeak(t, extraAllow))

    // 2. Singular-address detection
    findings.push(...detectSingularAddress(t))

    // 3. Mixed-script excess (Hebrew + English mix beyond reasonable threshold)
    findings.push(...detectMixedScriptExcess(t))

    // Score: start at 100, deduct per finding (fail=15, warn=8, info=2)
    let score = 100
    for (const f of findings) {
        if (f.severity === 'fail') score -= 15
        else if (f.severity === 'warn') score -= 8
        else if (f.severity === 'info') score -= 2
    }
    score = Math.max(0, Math.min(100, score))

    return {
        text: t,
        findings,
        score,
        passes: !findings.some(f => f.severity === 'fail'),
    }
}

// ────────────────────────────────────────────────────────────────────────────
// English-in-Hebrew leak detection
// ────────────────────────────────────────────────────────────────────────────

function detectEnglishLeak(text: string, extraAllow: Set<string>): HebrewQAFinding[] {
    const findings: HebrewQAFinding[] = []
    const hasHebrew = /[֐-׿]/.test(text)
    if (!hasHebrew) return findings   // text isn't Hebrew → skip leak check

    // English tokens: 3+ ASCII letters. We tolerate single-letter ('X') and 2-letter (B2B, AI).
    const englishTokenRe = /(?<![A-Za-z])([A-Za-z]{3,})(?![A-Za-z])/g
    let match: RegExpExecArray | null
    while ((match = englishTokenRe.exec(text)) !== null) {
        const tok = match[1].toLowerCase()
        if (ENGLISH_TOKEN_ALLOWLIST.has(tok) || extraAllow.has(tok)) continue

        // Check if token is INSIDE a Hebrew sentence (Hebrew chars within ±15 chars)
        const start = Math.max(0, match.index - 15)
        const end = Math.min(text.length, match.index + tok.length + 15)
        const context = text.slice(start, end)
        if (/[֐-׿]/.test(context)) {
            findings.push({
                category: 'english_leak',
                severity: 'fail',
                description: `English token "${tok}" inside Hebrew sentence`,
                evidence: context.trim(),
                position: match.index,
            })
        }
    }
    return findings
}

// ────────────────────────────────────────────────────────────────────────────
// Singular address detection
// ────────────────────────────────────────────────────────────────────────────

function detectSingularAddress(text: string): HebrewQAFinding[] {
    const findings: HebrewQAFinding[] = []
    for (const entry of SINGULAR_TO_PLURAL) {
        entry.singular.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = entry.singular.exec(text)) !== null) {
            findings.push({
                category: 'singular_address',
                severity: 'warn',
                description: `Singular address form "${m[0]}" — use plural "${entry.plural}"`,
                evidence: m[0],
                suggestion: entry.plural,
                position: m.index,
            })
        }
    }
    return findings
}

// ────────────────────────────────────────────────────────────────────────────
// Mixed script excess
// ────────────────────────────────────────────────────────────────────────────

function detectMixedScriptExcess(text: string): HebrewQAFinding[] {
    // Count Hebrew tokens vs non-allowed English tokens (3+ letters)
    const hebrewTokens = (text.match(/[֐-׿]+/g) || []).length
    const englishTokens = (text.match(/(?<![A-Za-z])[A-Za-z]{3,}(?![A-Za-z])/g) || [])
        .filter(t => !ENGLISH_TOKEN_ALLOWLIST.has(t.toLowerCase()))
        .length

    if (hebrewTokens === 0) return []   // not a Hebrew text
    const ratio = englishTokens / hebrewTokens
    if (ratio > 0.25) {
        return [{
            category: 'mixed_script_excess',
            severity: 'warn',
            description: `${englishTokens} non-allowed English tokens vs ${hebrewTokens} Hebrew tokens (${(ratio * 100).toFixed(0)}%)`,
            evidence: `ratio=${ratio.toFixed(2)}`,
        }]
    }
    return []
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-fix: convert singular addresses to plural (best-effort)
// ────────────────────────────────────────────────────────────────────────────

export function autoFixSingularAddress(text: string): { fixed: string; replacements: number } {
    let fixed = text
    let count = 0
    for (const entry of SINGULAR_TO_PLURAL) {
        entry.singular.lastIndex = 0
        fixed = fixed.replace(entry.singular, () => {
            count++
            return entry.plural
        })
    }
    return { fixed, replacements: count }
}

/**
 * Batch QA — run checkHebrewQA over an array of text fields.
 * Returns aggregate stats + per-field findings.
 */
export interface BatchHebrewQAResult {
    fields_checked: number
    fields_passed: number
    fields_failed: number
    avg_score: number
    findings_by_field: Record<string, HebrewQAResult>
    aggregate_findings_count: { fail: number; warn: number; info: number }
}

export function batchCheckHebrewQA(
    fields: Record<string, string | null | undefined>,
    ctx?: { allowedEnglishExtras?: string[] },
): BatchHebrewQAResult {
    const findings_by_field: Record<string, HebrewQAResult> = {}
    let totalScore = 0
    let passed = 0
    let failed = 0
    const aggregate = { fail: 0, warn: 0, info: 0 }

    for (const [key, value] of Object.entries(fields)) {
        const result = checkHebrewQA(value, ctx)
        findings_by_field[key] = result
        totalScore += result.score
        if (result.passes) passed++
        else failed++
        for (const f of result.findings) {
            if (f.severity === 'fail') aggregate.fail++
            else if (f.severity === 'warn') aggregate.warn++
            else aggregate.info++
        }
    }

    const checked = Object.keys(fields).length || 1
    return {
        fields_checked: Object.keys(fields).length,
        fields_passed: passed,
        fields_failed: failed,
        avg_score: Math.round(totalScore / checked),
        findings_by_field,
        aggregate_findings_count: aggregate,
    }
}