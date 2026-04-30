// Auto-derive marketing intents from existing user signals.
// Inputs:
//   - selected agents (from instance.selectedComponents)
//   - paidProfile (if filled — gives goal, geography, budget)
//   - chosenScenario (from strategy stage — can hint at channels)
//   - existing pipelineState namespaces (legacy compat)
//
// Output: a deduped MarketingIntent[] that we pre-fill in the goal-picker.
// User can override (add or remove) — we never overwrite a user-set intents
// list; we only seed it the FIRST time.

import type { MarketingIntent } from './intents'

export interface AutoDeriveInput {
    agents?: string[]                             // ['mt', 'oc', ...] — instance.selectedComponents
    paidProfile?: {
        goal?: string                             // 'leadgen' | 'ecommerce' | 'awareness' | 'store_visits' | 'app_installs'
        budgetMonthlyIls?: number
        launchPath?: string
    } | null
    chosenScenario?: string | null                // 'conservative' | 'balanced' | 'aggressive' | etc
    existingNamespaces?: string[]                 // pipelineState keys already filled — preserves prior runs
}

export function deriveIntents(input: AutoDeriveInput): MarketingIntent[] {
    const intents = new Set<MarketingIntent>()

    // ── 1. Agents → broad intent groups ──
    const agents = input.agents || []
    if (agents.includes('mt')) {
        // MATEH is the universal marketing agent — it can serve all organic channels.
        // Default to organic-first since paid is gated behind paidProfile.
        intents.add('seo')
        intents.add('content')
        intents.add('social_organic')
    }
    if (agents.includes('sv')) intents.add('lead_generation')
    if (agents.includes('ec')) intents.add('ecommerce')

    // ── 2. paidProfile → activate paid intents based on goal ──
    if (input.paidProfile) {
        const goal = input.paidProfile.goal
        // Anyone with a paidProfile is doing paid_search at minimum (Mazhir = Google Ads)
        intents.add('paid_search')
        if (goal === 'leadgen') {
            intents.add('lead_generation')
        } else if (goal === 'ecommerce') {
            intents.add('ecommerce')
            intents.add('paid_social')   // ecom typically wants Meta retargeting
        } else if (goal === 'awareness') {
            intents.add('brand_awareness')
            intents.add('paid_social')
        } else if (goal === 'store_visits') {
            intents.add('paid_search')   // local SEM
        } else if (goal === 'app_installs') {
            intents.add('paid_social')
        }
    }

    // ── 3. existingNamespaces (legacy) — preserve user history ──
    // If we see prior runs in a pipeline namespace, keep its intents enabled
    // to avoid hiding past output.
    const ns = new Set(input.existingNamespaces || [])
    if (ns.has('research_paid') || ns.has('mazhir_audit') || ns.has('mazhir_media_plan')) intents.add('paid_search')
    if (ns.has('research_seo') || ns.has('seo_audit') || ns.has('seo_keyword_plan')) intents.add('seo')
    if (ns.has('research_content') || ns.has('content_calendar')) intents.add('content')
    if (ns.has('research_social') || ns.has('social_calendar') || ns.has('social_publisher')) intents.add('social_organic')
    if (ns.has('email_campaigns') || ns.has('email_automations')) intents.add('email_marketing')
    if (ns.has('product_feed_sync') || ns.has('dynamic_remarketing')) intents.add('ecommerce')
    if (ns.has('lead_router') || ns.has('offline_conversions_upload')) intents.add('lead_generation')
    if (ns.has('meta_audit') || ns.has('meta_media_plan')) intents.add('paid_social')

    return Array.from(intents)
}

// Detect what intents a user has SHIFTED (vs prior auto-derive). Used to
// surface "you turned on SEO — here's what's now relevant" UX.
export function intentsDiff(
    prior: MarketingIntent[],
    next: MarketingIntent[]
): { added: MarketingIntent[]; removed: MarketingIntent[] } {
    const priorSet = new Set(prior)
    const nextSet = new Set(next)
    return {
        added: next.filter(i => !priorSet.has(i)),
        removed: prior.filter(i => !nextSet.has(i)),
    }
}
