/**
 * Plan resolver — derives a stage list from a ResearchIntent, and detects
 * the intent from פרופיל עסקי answers.
 *
 * Spec: docs/research-pipeline-design.md §3-4
 */

import type { ResearchIntent, StageId } from './types'
import { UNIVERSAL_STAGES } from './types'

/**
 * Read marketingGoals + platforms from פרופיל עסקי answers and infer intent.
 * Hebrew + English aware. Falls back to 'multichannel' when nothing matches.
 */
export function detectIntent(answers: Record<string, unknown> | undefined): ResearchIntent {
    const text = (
        String((answers as any)?.marketingGoals || '') + ' ' +
        String((answers as any)?.platforms || '')
    ).toLowerCase()

    const hasSEO    = /seo|אורגנ|בלוג|תוכן/.test(text)
    const hasPaid   = /google ads|מודעות ממומנות|פרסום ממומן|מטא ads|פייסבוק ads/.test(text)
    const hasSocial = /אינסטגרם|פייסבוק(?!\s*ads)|לינקדאין|טיקטוק|רשתות חברתיות/.test(text)
    const hasEmail  = /\bמייל\b|אימייל|ניוזלטר|\bcrm\b/.test(text)
    const hasEcom   = /shopify|woocommerce|חנות אונליין|מוצרים/.test(text)

    const count = [hasSEO, hasPaid, hasSocial, hasEmail, hasEcom].filter(Boolean).length
    if (count >= 3) return 'multichannel'
    if (hasSEO && !hasPaid) return 'seo_organic'
    if (hasPaid && !hasSEO) return 'paid_search'
    if (hasSocial) return 'social_organic'
    if (hasEmail) return 'email_crm'
    if (hasEcom) return 'ecommerce'
    return 'multichannel'
}

/**
 * Resolve the ordered stage list for an intent. Universal stages
 * (personas, positioning, strategy, validation) always appear in the
 * same relative position so cross-intent flows feel consistent.
 */
export function planForIntent(intent: ResearchIntent): StageId[] {
    switch (intent) {
        case 'seo_organic':
            return ['seo_keyword_research', 'aeo_visibility', 'competitor_landscape',
                ...UNIVERSAL_STAGES, 'content_plan']
        case 'paid_search':
            return ['paid_audit', 'competitor_landscape',
                ...UNIVERSAL_STAGES, 'media_plan']
        case 'social_organic':
            return ['social_landscape', 'competitor_landscape',
                ...UNIVERSAL_STAGES, 'content_plan']
        case 'email_crm':
            return ['email_competitor_audit',
                ...UNIVERSAL_STAGES, 'content_plan']
        case 'ecommerce':
            return ['paid_audit', 'seo_keyword_research',
                ...UNIVERSAL_STAGES, 'media_plan', 'content_plan']
        case 'multichannel':
            return ['competitor_landscape', 'seo_keyword_research', 'aeo_visibility',
                'paid_audit', 'social_landscape',
                ...UNIVERSAL_STAGES, 'content_plan', 'media_plan']
    }
}

/**
 * Compute the union of stage lists for a set of intents. Used by the
 * "expand intent" flow — adding paid_search to an SEO plan keeps the
 * SEO stages and adds only what's new.
 */
export function planForIntents(intents: ResearchIntent[]): StageId[] {
    const seen = new Set<StageId>()
    const ordered: StageId[] = []
    for (const intent of intents) {
        for (const stage of planForIntent(intent)) {
            if (!seen.has(stage)) { seen.add(stage); ordered.push(stage) }
        }
    }
    return ordered
}