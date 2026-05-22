/**
 * Quotability scorer — how extraction-friendly is a sentence/paragraph
 * for LLM-driven answer engines (AIO, ChatGPT, Perplexity, Claude w/ web).
 *
 * Scoring criteria (per AEO research synthesis):
 *   - 15-30 word length (longer = chunked badly; shorter = no context)
 *   - Standalone sense (no leading pronouns / dangling references)
 *   - Contains a number, percentage, or specific entity (boosts pickup)
 *   - No modality hedging ("may", "might", "אולי", "בדרך כלל")
 *   - Entity-first phrasing (starts with brand/entity name, not pronoun "we")
 *
 * Used by:
 *   - LLM-emitted priority_action / biggest_weakness / mission etc.
 *   - Aggregate site_health_summary narratives
 *   - Pre-publish content QA gate
 */

// Hedging tokens that lower quotability (sentences using them get downranked
// by LLMs because they're harder to use as definitive citations)
const MODALITY_TOKENS_EN = [
    'may', 'might', 'maybe', 'perhaps', 'possibly',
    'typically', 'often', 'usually', 'generally',
    'sometimes', 'occasionally', 'occasionally',
    'could be', 'tends to', 'tend to',
]
const MODALITY_TOKENS_HE = [
    'אולי', 'יתכן', 'אפשר ש', 'נדמה', 'נראה ש',
    'בדרך כלל', 'בדרך-כלל', 'לרוב', 'לעיתים', 'לפעמים',
    'יכול להיות', 'נוטה ל', 'נוטים ל',
]

// First-person pronouns indicating not-entity-first phrasing
const FIRST_PERSON_EN = ['we', 'our', 'us', 'i', 'my']
const FIRST_PERSON_HE = ['אנחנו', 'אנו', 'שלנו', 'אצלנו']

export interface QuotabilityFinding {
    rule: string
    severity: 'warn' | 'info'
    description: string
}

export interface QuotabilityResult {
    text: string
    score: number      // 0-100
    word_count: number
    findings: QuotabilityFinding[]
    /** Does the sentence pass the LLM-friendly threshold (60+) */
    passes: boolean
    signals: {
        has_number: boolean
        has_specific_entity: boolean
        has_modality: boolean
        entity_first: boolean
        standalone_sense: boolean
        length_optimal: boolean   // 15-30 words
    }
}

/**
 * Score a single sentence or short paragraph for quotability.
 * Hebrew + English supported (auto-detected by script).
 */
export function scoreQuotability(
    text: string | null | undefined,
    ctx?: { entityNames?: string[] },
): QuotabilityResult {
    const t = (text || '').toString().trim()
    if (t.length === 0) {
        return emptyResult(t)
    }

    const isHebrew = /[֐-׿]/.test(t)
    const wordCount = countWords(t)
    const findings: QuotabilityFinding[] = []

    // 1. Length: 15-30 words optimal
    const length_optimal = wordCount >= 15 && wordCount <= 30
    if (wordCount < 8) {
        findings.push({ rule: 'too_short', severity: 'warn', description: `Only ${wordCount} words — needs minimum ~10 for standalone context` })
    } else if (wordCount > 45) {
        findings.push({ rule: 'too_long', severity: 'warn', description: `${wordCount} words — LLM may truncate to first 30 when chunking` })
    } else if (!length_optimal) {
        findings.push({ rule: 'length_suboptimal', severity: 'info', description: `${wordCount} words — ideal range is 15-30` })
    }

    // 2. Has a number / statistic
    const has_number = /\b\d+(?:[.,]\d+)?%?\b/.test(t) || /\b[0-9]+[KMB]?\b/.test(t)

    // 3. Has specific entity (URL, brand name from ctx, capitalized proper noun, %, ₪)
    const entityRe = ctx?.entityNames && ctx.entityNames.length > 0
        ? new RegExp(ctx.entityNames.map(escapeRegex).join('|'), 'i')
        : null
    const has_specific_entity = (entityRe?.test(t) ?? false)
        || /\b[A-Z][a-z]+(?:[ -][A-Z][a-z]+)+\b/.test(t)   // Proper noun ("Packing Station")
        || /\bhttps?:\/\//.test(t)
        || /₪|\$|%/.test(t)
        || /\b\d{4}\b/.test(t)   // year as proxy for specific data point

    // 4. Modality / hedging
    const lowerT = t.toLowerCase()
    let has_modality = false
    if (isHebrew) {
        for (const m of MODALITY_TOKENS_HE) {
            if (t.includes(m)) { has_modality = true; break }
        }
    } else {
        for (const m of MODALITY_TOKENS_EN) {
            if (lowerT.includes(m)) { has_modality = true; break }
        }
    }
    if (has_modality) {
        findings.push({ rule: 'modality_hedge', severity: 'warn', description: 'Contains hedging language (אולי / may / typically) — lowers LLM pickup' })
    }

    // 5. Entity-first phrasing — starts with brand/entity, not pronoun
    const firstWord = (t.match(/^\s*([֐-׿\w]+)/)?.[1] || '').toLowerCase()
    const firstPersonList = isHebrew ? FIRST_PERSON_HE : FIRST_PERSON_EN
    const startsWithPronoun = firstPersonList.includes(firstWord)
    const entity_first = !startsWithPronoun
    if (startsWithPronoun) {
        findings.push({
            rule: 'pronoun_first',
            severity: 'warn',
            description: `Starts with pronoun "${firstWord}" — entity-first phrasing is more LLM-extractable`,
        })
    }

    // 6. Standalone sense — proxy: no leading "this/that/it/אותו" without context
    const dangling = /^(?:\s*)(?:this|that|these|those|it|then|so|אותו|אותם|זה|זאת|זו)\b/i.test(t)
    const standalone_sense = !dangling
    if (dangling) {
        findings.push({
            rule: 'dangling_reference',
            severity: 'warn',
            description: 'Starts with dangling reference (this/that/it/זה/אותו) — likely needs preceding context',
        })
    }

    // Score: weighted sum
    let score = 50  // baseline
    if (length_optimal) score += 15
    else if (wordCount >= 10 && wordCount <= 40) score += 8
    if (has_number) score += 15
    if (has_specific_entity) score += 15
    if (!has_modality) score += 10
    if (entity_first) score += 10
    if (standalone_sense) score += 5
    score = Math.max(0, Math.min(100, score))

    return {
        text: t,
        score,
        word_count: wordCount,
        findings,
        passes: score >= 60,
        signals: { has_number, has_specific_entity, has_modality, entity_first, standalone_sense, length_optimal },
    }
}

function emptyResult(t: string): QuotabilityResult {
    return {
        text: t,
        score: 0,
        word_count: 0,
        findings: [{ rule: 'empty', severity: 'info', description: 'Empty text' }],
        passes: false,
        signals: { has_number: false, has_specific_entity: false, has_modality: false, entity_first: false, standalone_sense: false, length_optimal: false },
    }
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Batch — score an array of texts and return aggregate.
 */
export interface BatchQuotabilityResult {
    items_scored: number
    items_passed: number
    avg_score: number
    min_score: number
    items: Array<{ key: string; result: QuotabilityResult }>
}

export function batchScoreQuotability(
    items: Array<{ key: string; text: string | null | undefined }>,
    ctx?: { entityNames?: string[] },
): BatchQuotabilityResult {
    const scored = items.map(it => ({ key: it.key, result: scoreQuotability(it.text, ctx) }))
    const total = scored.reduce((s, it) => s + it.result.score, 0)
    const passed = scored.filter(it => it.result.passes).length
    const min = Math.min(100, ...scored.map(it => it.result.score))
    return {
        items_scored: scored.length,
        items_passed: passed,
        avg_score: scored.length ? Math.round(total / scored.length) : 0,
        min_score: scored.length ? min : 0,
        items: scored,
    }
}