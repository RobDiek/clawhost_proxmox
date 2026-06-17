/**
 * Monthly-plan text sanitizer — DETERMINISTIC, guaranteed floor.
 *
 * The LLM Hebrew cleanup (monthlyPlanHebrewCleanup) is best-effort and runs
 * fire-and-forget — it can be skipped, time out, or leave machine tokens that
 * read as enums. This pass is the deterministic guarantee that NO user-facing
 * string ships with mechanical garbage:
 *   - ASCII key=value tokens          decision=refresh, page_type=product
 *   - ASCII comparisons               word_count<300, score>=70
 *   - bracket arrays / dotted refs    records[], internal_seo_audit.records[]
 *   - bare snake_case identifiers     static_value_pollution, fix_tracking_first
 *
 * It does NOT translate English prose (audit, carousel…) — only an LLM can do
 * that well; that stays the job of the Hebrew cleanup + hardcoded-string fixes.
 * What this guarantees is that the unambiguously-machine tokens are gone even
 * when the LLM pass never runs.
 *
 * Applied in TWO places:
 *   1. monthlyPlanGenerator — synchronously on every task before persist, so
 *      the saved plan is clean immediately (independent of the async cleanup).
 *   2. monthlyPlanCleanupSaved — as the always-run final pass after the LLM
 *      cleanup (or after it's skipped), so backfills get the same floor.
 *
 * Only mutates user-facing strings: title, summary, actionPlan[].step,
 * expectedImpact.rationale(He), sources[].excerpt, detail. NEVER touches
 * machine fields (type, ref, channel, kind, status, id, enums) — those are
 * humanized at the display layer.
 */

// Abbreviations / brands that may legitimately appear in Hebrew prose. Used
// only by the residual-English detector (logging/visibility), not by the
// stripper. Mirrors the allowlist in monthlyPlanHebrewCleanup STRICT_RULES.
const ALLOWED_TOKENS = new Set([
    'gtm', 'ga4', 'aw', 'awct', 'gclid', 'cpc', 'tcpa', 'troas', 'ctr', 'roas', 'cpa', 'cpm', 'cpv', 'cvr',
    'kpi', 'mrr', 'seo', 'aeo', 'geo', 'serp', 'faq', 'json', 'html', 'css', 'js', 'url', 'api', 'sdk',
    'id', 'ui', 'ux', 'pmax', 'rsa', 'dsa', 'oct', 'ec', 'cmp', 'gdpr', 'itp', 'bq', 'ltv', 'aov', 'roi',
    'cr', 'br', 'b2b', 'b2c', 'saas', 'dr', 'pa', 'da', 'eeat', 'romi', 'cms', 'wp', 'nap', 'usp',
    // brands / proper nouns
    'google', 'meta', 'wordpress', 'woocommerce', 'yad2', 'facebook', 'instagram', 'youtube', 'linkedin',
    'tiktok', 'whatsapp', 'telegram', 'schema', 'wikidata', 'wikipedia', 'chatgpt', 'gemini', 'claude',
    'anthropic', 'openai', 'bing', 'yandex', 'flowmatic',
    // schema.org types commonly cited verbatim
    'faqpage', 'product', 'organization', 'localbusiness', 'article', 'breadcrumblist', 'aggregaterating',
    'review', 'videoobject', 'howto', 'service', 'webpage', 'website', 'person', 'offer', 'sameas',
])

// ── deterministic strippers ────────────────────────────────────────────────
// Order matters: handle composite tokens (key=value, comparisons, arrays)
// BEFORE the bare-identifier pass so we don't half-strip them.
function stripMachineTokens(input: string): string {
    if (!input || typeof input !== 'string') return input
    let s = input

    // Only INCIDENTAL machine provenance is stripped deterministically (the
    // stuff the model appends as metadata: decision=refresh, n=233, records[]).
    // Bare snake_case that IS the sentence's content (static_value_pollution)
    // is left for the LLM cleanup to TRANSLATE — stripping it mid-sentence
    // would leave broken Hebrew. The residual detector flags any that survive.

    // 1. ASCII key=value (decision=refresh, page_type=product, n=233).
    //    1-char keys allowed so "n=233" provenance counters are caught too.
    s = s.replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s,;:"'`()|֐-׿]+/g, ' ')

    // 1b. Hebrew key=value (עדיפות=גבוה) — keep the words, swap '=' for a colon
    //     so it reads as prose instead of a machine assignment.
    s = s.replace(/([֐-׿])\s*=\s*([֐-׿])/g, '$1: $2')

    // 2. ASCII comparison against a number (word_count<300, score>=70).
    s = s.replace(/\b[A-Za-z_][A-Za-z0-9_]{1,}\s*[<>]=?\s*\d+%?/g, ' ')

    // 3. dotted machine refs + bracket arrays (records[], internal_seo_audit.records[],
    //    audit.recommendedActions.immediate). Skip URL/host (has a TLD segment).
    s = s.replace(/\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+(?:\[\])?/g, (m) => {
        if (/\.(com|org|net|io|il|co|ai|dev|app|gov|edu|me|tv|info|biz)\b/i.test(m)) return m   // URL/host → keep
        return ' '
    })
    s = s.replace(/\b[A-Za-z_][A-Za-z0-9_]*\[\]/g, ' ')

    // 4. internal 3+-segment snake_case refs (evergreen_refresh_baseline,
    //    internal_seo_audit, static_value_pollution) — unambiguous internal IDs,
    //    never Hebrew prose. 2-segment SCREAMING enums (TARGET_CPA) are left for
    //    the LLM cleanup, which translates them with an explanatory gloss.
    s = s.replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+){2,}\b/g, ' ')

    return cleanupArtifacts(s)
}

// Remove the punctuation debris left behind after token removal so the prose
// reads naturally: orphaned slashes/quotes, doubled commas, empty parens.
function cleanupArtifacts(s: string): string {
    return s
        .replace(/["'`]\s*[/\\]+|[/\\]+\s*["'`]/g, ' ')   // stray  "/  or  /"  quote+slash debris
        .replace(/\s*[/\\]\s*(?=[,.;:)]|$)/g, ' ')   // dangling slash before punctuation/end
        // parentheticals that became punctuation-only after stripping
        // (e.g. "(., )", "( )") — drop entirely. Keep any with Hebrew, ASCII
        // letters OR digits (so "(GA4)", "(15-30%)" survive).
        .replace(/\(\s*[^A-Za-z0-9֐-׿()]*\s*\)/g, ' ')
        .replace(/\(\s*\)/g, ' ')                     // empty parens
        .replace(/\[\s*\]/g, ' ')                     // empty brackets
        .replace(/\s*,\s*,\s*/g, ', ')                // doubled commas
        .replace(/\s*,\s*(?=[.;:)])/g, '')            // comma immediately before other punctuation
        .replace(/\(\s*[,.;:]\s*/g, '(').replace(/[,.;:]?\s*\)/g, ')')
        .replace(/^[\s,;:/\\\-–—]+/, '')              // leading separators
        .replace(/\s{2,}/g, ' ')                       // collapse whitespace
        .replace(/\s+([,.;:])/g, '$1')                 // space before punctuation
        .replace(/([,;:])\1+/g, '$1')                  // repeated separators
        .replace(/[\s,;:\-–—/\\]+$/, '')              // trailing separators
        .replace(/\s{2,}/g, ' ')
        .trim()
}

// ── residual-English detector (visibility only, non-blocking) ───────────────
// Returns lowercase English words ≥4 chars that are NOT in the allowlist — used
// to log when LLM cleanup left prose English so we can see coverage gaps.
export function residualEnglishWords(s: string): string[] {
    if (!s || typeof s !== 'string') return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const m of s.matchAll(/[A-Za-z][A-Za-z'-]{3,}/g)) {
        const w = m[0]
        const lw = w.toLowerCase().replace(/[^a-z]/g, '')
        if (lw.length < 4) continue
        if (ALLOWED_TOKENS.has(lw)) continue
        if (/^[A-Z]{2,}$/.test(w)) continue            // all-caps abbreviation
        if (seen.has(lw)) continue
        seen.add(lw)
        out.push(w)
    }
    return out
}

const USER_FACING_STRING_KEYS = ['title', 'summary', 'detail', 'step'] as const

// Sanitize one task object IN PLACE. Mutates only user-facing string fields.
export function sanitizeTaskInPlace(task: Record<string, any>): boolean {
    if (!task || typeof task !== 'object') return false
    let changed = false
    const apply = (obj: Record<string, any>, key: string) => {
        const v = obj[key]
        if (typeof v !== 'string' || !v) return
        const cleaned = stripMachineTokens(v)
        if (cleaned !== v) { obj[key] = cleaned; changed = true }
    }

    for (const k of USER_FACING_STRING_KEYS) apply(task, k)

    if (Array.isArray(task.actionPlan)) {
        for (const step of task.actionPlan) {
            if (step && typeof step === 'object') apply(step, 'step')
        }
    }
    if (task.expectedImpact && typeof task.expectedImpact === 'object') {
        apply(task.expectedImpact, 'rationale')
        apply(task.expectedImpact, 'rationaleHe')
    }
    if (Array.isArray(task.sources)) {
        for (const src of task.sources) {
            if (src && typeof src === 'object') apply(src, 'excerpt')
        }
    }
    return changed
}

// Convenience for callers that hold an array of tasks. Returns count changed.
export function sanitizeTasksInPlace(tasks: Array<Record<string, any>>): number {
    if (!Array.isArray(tasks)) return 0
    let n = 0
    for (const t of tasks) { if (sanitizeTaskInPlace(t)) n++ }
    return n
}

// Exposed for unit checks.
export const __testing = { stripMachineTokens, cleanupArtifacts }