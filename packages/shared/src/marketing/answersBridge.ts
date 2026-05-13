// Bridge between פרופיל עסקי (onboarding) answers and marketing intents.
//
// פרופיל עסקי Q9 (marketingGoals — text string, multi-select chips) and Q10
// (platforms — text string, multi-select chips) record the user's INTENT in
// human-readable form. The marketing hub system stores intents as typed
// MarketingIntent IDs (paid_search, content, etc.) for downstream pipeline
// gating.
//
// Without a bridge, the two surfaces drift: user picks "Google Ads" in Q10
// but ניהול שיווק stays with no paid_search → paid track never activates.
//
// Direction 1: answers → intents (when user saves פרופיל עסקי)
//   intentsFromAnswers({platforms, marketingGoals}) → MarketingIntent[]
//
// Direction 2: intents → answers (when user toggles ניהול שיווק)
//   platformsTextFromIntents([...]) → "בלוג, Google Ads"
//   goalsTextFromIntents([...]) → "לידים, SEO"
//
// Single source of truth: `rd.marketingIntents`. answers.platforms/marketingGoals
// kept as derived display fields for the wizard UI to render.

import type { MarketingIntent } from './intents'

export interface AnswersForBridge {
    platforms?: string
    marketingGoals?: string
}

// Parse onboarding Q10 platforms chip-text + Q9 marketingGoals chip-text into
// the canonical MarketingIntent[] enum. Heuristic match — bilingual (Hebrew +
// English tokens). Matches whole-word boundaries where possible to avoid e.g.
// "Facebook Ads" double-matching "paid_social" AND "social_organic".
export function intentsFromAnswers(answers: AnswersForBridge | null | undefined): MarketingIntent[] {
    const result = new Set<MarketingIntent>()
    if (!answers) return []
    const platforms = String(answers.platforms || '').toLowerCase()
    const goals = String(answers.marketingGoals || '').toLowerCase()

    // ── Q10 platforms → channels ──────────────────────────────────────────
    // Paid first (more specific patterns) so that "Facebook Ads" → paid_social
    // doesn't also trigger social_organic for "facebook".
    if (/google ads|גוגל אדס|google\b(?![\s]*analytics)/.test(platforms)) result.add('paid_search')
    if (/meta ads|מטא אדס|facebook ads|paid social|פייסבוק.*אדס|אינסטגרם.*אדס/.test(platforms)) result.add('paid_social')
    if (/בלוג|blog|wordpress|וורדפרס|article/.test(platforms)) result.add('content')
    // social_organic: only if a social platform token is present WITHOUT "ads" suffix
    // Use a negative-lookahead to skip "Facebook Ads"/"Instagram Ads".
    if (/(?:^|[,\s])(facebook|פייסבוק|instagram|אינסטגרם|tiktok|טיקטוק|linkedin|לינקדאין|youtube|יוטיוב|twitter|טוויטר|\bx\b|threads)(?![\s]*ads)/.test(platforms)) {
        result.add('social_organic')
    }
    if (/ניוזלטר|newsletter|email|מייל|דוא"?ל/.test(platforms)) result.add('email_marketing')

    // ── Q9 marketingGoals → strategic intents ─────────────────────────────
    if (/(^|[,\s])seo([,\s]|$)|אורגני/.test(goals)) result.add('seo')
    if (/לידים|leads?|lead.?gen/.test(goals)) result.add('lead_generation')
    if (/מותג|brand|awareness|מודעות|חשיפ/.test(goals)) result.add('brand_awareness')
    if (/מכירות|sales|ecommerce|מסחר|store/.test(goals)) result.add('ecommerce')
    // "תוכן" in goals also implies content
    if (/תוכן|content/.test(goals)) result.add('content')
    // "תנועה אורגנית" implies SEO
    if (/תנועה אורגנית|אורגנית|organic traffic/.test(goals)) result.add('seo')

    return Array.from(result)
}

// Reverse: intents → human-readable platforms text for Q10 chip display.
// Keeps Hebrew labels matching the catalog used in the wizard UI.
export function platformsTextFromIntents(intents: MarketingIntent[]): string {
    const set = new Set(intents)
    const labels: string[] = []
    if (set.has('content')) labels.push('בלוג')
    if (set.has('paid_search')) labels.push('Google Ads')
    if (set.has('paid_social')) labels.push('Meta Ads')
    if (set.has('social_organic')) labels.push('רשתות חברתיות')
    if (set.has('email_marketing')) labels.push('ניוזלטר')
    return labels.join(', ')
}

// Reverse: intents → human-readable goals text for Q9 chip display.
export function goalsTextFromIntents(intents: MarketingIntent[]): string {
    const set = new Set(intents)
    const labels: string[] = []
    if (set.has('lead_generation')) labels.push('לידים')
    if (set.has('brand_awareness')) labels.push('מותג')
    if (set.has('seo')) labels.push('SEO')
    if (set.has('ecommerce')) labels.push('מכירות')
    if (set.has('content')) labels.push('תוכן')
    return labels.join(', ')
}

// Determine the active "marketing tracks" the user has signed up for.
// Used by render gates to decide which cards (organic / paid) to show.
export function tracksFromIntents(intents: MarketingIntent[]): { organic: boolean; paid: boolean } {
    const set = new Set(intents)
    const organic = set.has('seo') || set.has('content') || set.has('social_organic')
        || set.has('email_marketing') || set.has('brand_awareness') || set.has('lead_generation')
    const paid = set.has('paid_search') || set.has('paid_social')
    return { organic, paid }
}
