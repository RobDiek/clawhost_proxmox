/**
 * Brand Consistency Checker — inverse-index validation.
 *
 * Every creative artifact (Mazhir media plan headlines, content plan posts,
 * Display banner generation) goes through this checker BEFORE it's persisted
 * or pushed to the platform. Catches:
 *   - Banned phrases used
 *   - Required vocabulary missing
 *   - Tone deviation from brand voice
 *   - Color out of palette (for visual creative)
 *   - Tagline missing where it should be (RSA, About-page LP)
 *   - Logo used in invalid context (we approve which variants per channel)
 *
 * Usage:
 *   const result = checkAdCopyAgainstBrand(headlines, descriptions, brand)
 *   if (!result.passed) -> reject + return reasons in qualityWarnings
 *
 * Strictness levels:
 *   - 'strict' — block ANY violation
 *   - 'soft'   — log violations as warnings, don't block (default during MVP)
 */

import type { BrandBookV2 } from '../../../../packages/shared/src/brand/brandBookV2'

export interface ConsistencyResult {
    passed: boolean
    violations: Array<{
        rule: string
        severity: 'error' | 'warning' | 'info'
        text: string                                // the offending content
        context?: string                            // where it was found
        suggestion?: string                         // what to do instead
    }>
    score: number                                   // 0-100
}

export interface CheckCopyArgs {
    headlines?: string[]
    descriptions?: string[]
    sitelinkTexts?: string[]
    callouts?: string[]
    landingPageH1?: string
    other?: { context: string; text: string }[]
    book: BrandBookV2 | null
    strictness?: 'strict' | 'soft'
}

/**
 * Check ad copy + content against brand voice/messaging rules.
 */
export function checkAdCopyAgainstBrand(args: CheckCopyArgs): ConsistencyResult {
    const violations: ConsistencyResult['violations'] = []
    if (!args.book) {
        return { passed: true, violations: [], score: 100 }   // no book = nothing to check yet
    }

    const voice = args.book.voice?.voice
    const messaging = args.book.voice?.messaging
    const tagline = args.book.identity?.tagline

    const bannedPhrases: string[] = (voice?.vocabulary?.banned || []).filter(Boolean)
    const approvedVocab: string[] = (voice?.vocabulary?.approved || []).filter(Boolean)
    const dontList: string[] = (voice?.dont || []).filter(Boolean)

    // Aggregate all copy strings
    const allCopy: { text: string; context: string }[] = []
    for (const h of args.headlines || []) if (h) allCopy.push({ text: h, context: 'headline' })
    for (const d of args.descriptions || []) if (d) allCopy.push({ text: d, context: 'description' })
    for (const s of args.sitelinkTexts || []) if (s) allCopy.push({ text: s, context: 'sitelink' })
    for (const c of args.callouts || []) if (c) allCopy.push({ text: c, context: 'callout' })
    if (args.landingPageH1) allCopy.push({ text: args.landingPageH1, context: 'landing-page-h1' })
    for (const o of args.other || []) allCopy.push(o)

    // ── Rule 1: No banned phrases ──
    for (const item of allCopy) {
        for (const banned of bannedPhrases) {
            if (banned && item.text.toLowerCase().includes(banned.toLowerCase())) {
                violations.push({
                    rule: 'banned_phrase',
                    severity: 'error',
                    text: item.text,
                    context: item.context,
                    suggestion: `Replace "${banned}". Banned by brand book voice.banned.`,
                })
            }
        }
    }

    // ── Rule 2: dont guidance ──
    for (const item of allCopy) {
        for (const dont of dontList) {
            // Soft check — substring match
            if (dont && item.text.toLowerCase().includes(dont.toLowerCase())) {
                violations.push({
                    rule: 'voice_dont',
                    severity: 'warning',
                    text: item.text,
                    context: item.context,
                    suggestion: `Brand voice rule: "${dont}". Consider rewrite.`,
                })
            }
        }
    }

    // ── Rule 3: Required tagline presence ──
    // At least 1 headline (in Search ads) should reference tagline if defined
    const taglineHe = tagline?.he
    const taglineEn = tagline?.en
    if ((taglineHe || taglineEn) && (args.headlines?.length || 0) >= 5) {
        const hasTagline = (args.headlines || []).some(h => {
            if (taglineHe && h.includes(taglineHe.slice(0, 12))) return true
            if (taglineEn && h.toLowerCase().includes(taglineEn.toLowerCase().slice(0, 12))) return true
            return false
        })
        if (!hasTagline) {
            violations.push({
                rule: 'tagline_missing',
                severity: 'warning',
                text: '(no headlines reference tagline)',
                context: 'headlines',
                suggestion: `Add at least 1 headline referencing tagline: "${taglineHe || taglineEn}"`,
            })
        }
    }

    // ── Rule 4: Vocabulary alignment (soft) ──
    // If approved vocab defined, expect ≥30% of copy items to use ≥1 term
    if (approvedVocab.length >= 5 && allCopy.length >= 6) {
        const usingApproved = allCopy.filter(item =>
            approvedVocab.some(t => t && item.text.toLowerCase().includes(t.toLowerCase()))
        )
        const ratio = usingApproved.length / allCopy.length
        if (ratio < 0.3) {
            violations.push({
                rule: 'vocabulary_underused',
                severity: 'warning',
                text: `Only ${usingApproved.length}/${allCopy.length} items use approved vocabulary`,
                context: 'overall',
                suggestion: `Try to incorporate brand-approved terms: ${approvedVocab.slice(0, 5).join(', ')}`,
            })
        }
    }

    // ── Rule 5: Length sanity (RSA limits) ──
    for (const h of args.headlines || []) {
        if (h && h.length > 30) {
            violations.push({
                rule: 'rsa_headline_too_long',
                severity: 'error',
                text: h,
                context: 'headline',
                suggestion: `Google RSA headlines max 30 chars (this is ${h.length})`,
            })
        }
    }
    for (const d of args.descriptions || []) {
        if (d && d.length > 90) {
            violations.push({
                rule: 'rsa_description_too_long',
                severity: 'error',
                text: d,
                context: 'description',
                suggestion: `Google RSA descriptions max 90 chars (this is ${d.length})`,
            })
        }
    }

    // Score = 100 - errors*15 - warnings*5
    const errors = violations.filter(v => v.severity === 'error').length
    const warnings = violations.filter(v => v.severity === 'warning').length
    const score = Math.max(0, 100 - errors * 15 - warnings * 5)

    const strictness = args.strictness || 'soft'
    const passed = strictness === 'strict' ? violations.length === 0 : errors === 0

    return { passed, violations, score }
}

/**
 * Check visual creative (image / banner) against brand colors + logo usage.
 * Stub for Sprint 6+ — currently a placeholder; full implementation needs
 * image color extraction (sharp dominant + tolerance match against palette).
 */
export function checkVisualAgainstBrand(args: {
    imageUrl: string
    book: BrandBookV2 | null
}): ConsistencyResult {
    return { passed: true, violations: [], score: 100 }
}

/**
 * Render BrandBookV2 as compact prompt block for Mazhir media plan / content
 * plan / any other Opus consumer. Replaces the legacy v1 brandBookBlock.
 */
export function renderBrandBookForPrompt(book: BrandBookV2 | null): string {
    if (!book) {
        return `═══ BRAND FOUNDATION ═══\n\n(no brand book — copy will be generic. Recommend client run Brand Foundation before scaling)`
    }

    const ident = book.identity || {}
    const visual = book.visual || {}
    const voiceTier = book.voice || {}
    const audience = book.audience || {}

    const businessName = ident.businessName?.he || ident.businessName?.en || '(unknown)'
    const tagline = ident.tagline?.he || ident.tagline?.en || ''
    const positioning = ident.positioningStatement?.he || ident.positioningStatement?.en || ''
    const mission = ident.mission?.he || ident.mission?.en || ''
    const tone = voiceTier.voice?.toneSummary?.he || voiceTier.voice?.toneSummary?.en || '(unspecified)'
    const archetype = voiceTier.voice?.archetype || '(unspecified)'
    const principles = (voiceTier.voice?.principles || []).join(' · ')
    const dos = (voiceTier.voice?.do || []).join(' · ')
    const donts = (voiceTier.voice?.dont || []).join(' · ')
    const approvedVocab = (voiceTier.voice?.vocabulary?.approved || []).join(', ')
    const bannedVocab = (voiceTier.voice?.vocabulary?.banned || []).join(', ')

    const colors: any = visual.colors || {}
    const colorLine = [
        colors.primary ? `primary=${colors.primary.hex}` : '',
        ...(colors.secondary || []).map((c: any) => `secondary=${c.hex}`),
        ...(colors.accent || []).map((c: any) => `accent=${c.hex}`),
    ].filter(Boolean).join(', ')

    const fonts = visual.typography
    const fontLine = `he=${fonts?.primaryFontHe?.family || '?'} en=${fonts?.primaryFontEn?.family || '?'}`

    const logo = visual.logo
    const logoLine = logo?.primary?.url ? `logo=${logo.primary.url}${logo.icon?.url ? ` (icon: ${logo.icon.url})` : ''}` : 'logo=NOT UPLOADED'

    const personas = audience.personas?.items || []
    const personasBlock = personas.length > 0
        ? '\n\nPersonas:\n' + personas.slice(0, 3).map(p => `  - ${p.name}: pains=${(p.painPoints || []).slice(0, 2).join('; ')} | hooks=${(p.messageHooks || []).slice(0, 2).join('; ')}`).join('\n')
        : ''

    return `═══ BRAND FOUNDATION (must respect across ALL ad copy + creative) ═══

Business: ${businessName}
Tagline: ${tagline}
Mission: ${mission}
Positioning: ${positioning}

Voice tone: ${tone}  ·  Archetype: ${archetype}
Principles: ${principles || '(none)'}
DO: ${dos || '(none)'}
DON'T: ${donts || '(none)'}
Approved vocabulary: ${approvedVocab || '(none)'}
Banned phrases: ${bannedVocab || '(none)'}

Brand colors: ${colorLine || '(not set)'}
Fonts: ${fontLine}
${logoLine}${personasBlock}

USE THIS:
- Every headline + description MUST reflect voice tone
- Use APPROVED vocabulary, NEVER use banned phrases
- Tagline appears in 1+ headline per campaign
- For Display/PMax/Video — asset groups reference logo URL + brand colors
- Landing-page recommendations include brand-consistent H1 + voice
- Persona message hooks → headline ideation source
`
}