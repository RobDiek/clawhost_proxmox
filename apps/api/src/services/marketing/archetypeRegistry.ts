/**
 * Archetype Strategy Framework — Phase 1: the Layer-2 prior registry.
 *
 * Digitizes the 5 business archetypes from flowmatic/roadmap/22 (v0.4) into a
 * structured registry the strategy engine consumes. This is a PRIOR (hypothesis,
 * not truth): live niche data (Layer 3, nicheGrounding.ts) overrides the channel
 * weights where evidence exists — facts > priors.
 *
 * ONE axis: the client's business archetype. "Autopilot vs self-service" is an
 * operator mode (who runs the tools), NOT a strategy axis — it never changes the
 * channels/formats/methodology here.
 *
 * Source of truth for the playbook text is roadmap/22; keep them in sync.
 */

export type ArchetypeId =
    | 'local_business'
    | 'physical_service'
    | 'b2b_service'
    | 'ecommerce'
    | 'creator_infoproduct'

export const ARCHETYPE_IDS: ArchetypeId[] = [
    'local_business', 'physical_service', 'b2b_service', 'ecommerce', 'creator_infoproduct',
]

/** A ranked channel recommendation within an archetype. */
export interface ChannelRec {
    /** Descriptive channel name (maps loosely to plan task channels). */
    channel: string
    rationale: string
    /** For later/avoid entries: the condition under which it flips to "yes". */
    whenYes?: string
}

/** A niche fact that bends the prior (Layer-3 override hook). */
export interface EvidenceOverride {
    /** The observable niche signal (e.g. "thin local search + heavy competitor Meta-local"). */
    factSignal: string
    /** How the channel weighting should shift when this signal is present. */
    adjustment: string
}

export interface ArchetypePlaybook {
    id: ArchetypeId
    nameHe: string
    nameEn: string
    /** Human-readable detection signals (also surfaced in the directive). The
     *  scoring logic lives in archetypeClassifier.ts, not here (data vs logic). */
    classifySignals: string[]
    /** deal value, volume target, sales motion, decision cycle. */
    economics: string
    primaryChannels: ChannelRec[]
    secondaryChannels: ChannelRec[]
    /** explicit anti-channels, each with a "when_yes" flip condition. */
    laterOrAvoid: ChannelRec[]
    /** per-channel formats + winning angles. */
    creativeFormats: string[]
    /** awareness → consideration → conversion mechanics. */
    funnelMotion: string
    /** split + scale rule. */
    budgetLogic: string
    primaryKpi: string
    romiModel: string
    leadMechanism: string
    antiPatterns: string[]
    evidenceOverrides: EvidenceOverride[]
    /**
     * Filler tactics this archetype defers BY DEFAULT (prior). Names match the
     * structured-filler `tactic` tags (city_pages | persona_lps | comparison_pages).
     * The ROMI synthesizer may add/remove based on evidence + connected stack;
     * the final set lands in rd.deferredTactics and gates runStructuredFillers.
     */
    deferTacticsPrior: string[]
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypePlaybook> = {
    // ── 1. Local business ────────────────────────────────────────────────
    local_business: {
        id: 'local_business',
        nameHe: 'עסק מקומי עם נקודה פיזית',
        nameEn: 'Local business',
        classifySignals: [
            'physical address / storefront', 'local catchment / service-area',
            'walk-in or appointment', 'mostly B2C', 'low–mid ticket, repeat/LTV',
        ],
        economics: 'low–mid ticket, repeat/LTV matters, impulse→considered, short cycle',
        primaryChannels: [
            { channel: 'Google Business Profile + Local SEO (maps pack)', rationale: 'discovery happens in the maps pack for local intent' },
            { channel: 'Google Search / Local geo-radius', rationale: 'capture high-intent local queries' },
            { channel: 'Reviews engine', rationale: 'reviews drive trust + map-pack ranking' },
        ],
        secondaryChannels: [
            { channel: 'Meta radius (offers / awareness)', rationale: 'local offers + awareness in the catchment' },
            { channel: 'WhatsApp click-to-chat', rationale: 'low-friction local contact' },
        ],
        laterOrAvoid: [
            { channel: 'National keywords', rationale: 'wasted spend outside the catchment', whenYes: 'expanding to national delivery' },
            { channel: 'Broad display', rationale: 'low intent, poor ROI for local' },
            { channel: 'Google Shopping', rationale: 'only if it also sells products online', whenYes: 'adds an online catalog (hybrid_local_ecom)' },
        ],
        creativeFormats: [
            'GBP posts + photos', 'review responses', 'local landing pages',
            'short offer Reels', 'click-to-WhatsApp',
        ],
        funnelMotion: 'discovery (maps/search) → trust (reviews/photos/hours) → visit/booking',
        budgetLogic: 'organic-first (GBP + local SEO); paid = local search + Meta radius',
        primaryKpi: 'calls, directions, bookings, store visits → revenue per booking',
        romiModel: 'revenue per booking × booking volume vs local ad spend',
        leadMechanism: 'calls / directions / click-to-WhatsApp / booking form',
        antiPatterns: ['national targeting', 'generic display', 'ignoring reviews', 'no call tracking'],
        evidenceOverrides: [
            { factSignal: 'thin local search volume but heavy competitor Meta-local presence', adjustment: 'raise Meta radius weight above local search' },
        ],
        deferTacticsPrior: [],
    },

    // ── 2. Physical professional service ─────────────────────────────────
    physical_service: {
        id: 'physical_service',
        nameHe: 'שירות מקצועי פיזי',
        nameEn: 'Physical professional service',
        classifySignals: [
            'service (not product) delivered in person', 'considered purchase',
            'quote / appointment / booking', 'local or regional', 'mid–high ticket lead-gen',
        ],
        economics: 'mid–high ticket, lead-gen, trust-heavy, medium cycle',
        primaryChannels: [
            { channel: 'High-intent search ("service + city")', rationale: 'captures ready-to-buy local intent' },
            { channel: 'Local SEO / GBP', rationale: 'map-pack + service-area visibility' },
            { channel: 'Local Services Ads (where available)', rationale: 'pay-per-lead, Google-Guaranteed trust' },
            { channel: 'Trust content (credentials / reviews / before-after)', rationale: 'de-risks a considered, trust-heavy decision' },
        ],
        secondaryChannels: [
            { channel: 'Meta lead-gen (lookalike + retarget)', rationale: 'demand-gen + re-engagement' },
            { channel: 'WhatsApp', rationale: 'fast quote conversation' },
            { channel: 'Email follow-up', rationale: 'nurture the medium-length cycle' },
        ],
        laterOrAvoid: [
            { channel: 'Brand-awareness-first campaigns', rationale: 'intent capture beats awareness for lead-gen', whenYes: 'category is undeveloped and needs demand creation' },
            { channel: 'Broad reach', rationale: 'low qualified-lead rate' },
        ],
        creativeFormats: [
            'intent search ads', 'service landing pages heavy on trust',
            'before/after', 'testimonials', 'click-to-call / WhatsApp',
        ],
        funnelMotion: 'intent capture → trust → quote/consultation → close',
        budgetLogic: 'high-intent search + Local Services Ads first; Meta lead-gen secondary',
        primaryKpi: 'qualified leads, cost-per-qualified-lead, booked jobs → revenue per closed lead × close rate',
        romiModel: 'revenue per closed lead × close rate vs cost-per-qualified-lead',
        leadMechanism: 'quote request / consultation booking / click-to-call',
        antiPatterns: ['broad match without negatives', 'no call tracking', 'weak trust signals', 'treating like ecommerce'],
        evidenceOverrides: [
            { factSignal: 'SERP dominated by Local Services Ads / map-pack', adjustment: 'prioritize LSA + GBP over generic search' },
            { factSignal: 'high CPC + thin search volume', adjustment: 'lean organic + referral over paid search' },
        ],
        deferTacticsPrior: [],
    },

    // ── 3. Professional / B2B service (national, considered) ─────────────
    b2b_service: {
        id: 'b2b_service',
        nameHe: 'שירות B2B ארצי',
        nameEn: 'Professional / B2B service',
        classifySignals: [
            'B2B buyers', 'national / global delivery', 'considered, sales-assisted or lead-gen',
            'high deal value, low volume', 'long cycle, relationship-led',
        ],
        economics: 'high ACV, low volume, long cycle, relationship',
        primaryChannels: [
            { channel: 'Content authority + BOFU/comparison SEO', rationale: 'wins considered, research-heavy buyers' },
            { channel: 'High-intent search', rationale: 'capture in-market demand' },
            { channel: 'LinkedIn (ICP targeting + thought leadership)', rationale: 'precise B2B targeting + authority building' },
            { channel: 'Smart retargeting', rationale: 'long cycle needs persistent re-touch with proof' },
        ],
        secondaryChannels: [
            { channel: 'Meta — case/result-led short video (Reels)', rationale: 'high-touch/visual proof for considered B2B' },
            { channel: 'Email nurture', rationale: 'works the long sales cycle' },
            { channel: 'Targeted outreach', rationale: 'low-volume high-ACV warrants direct touch' },
        ],
        laterOrAvoid: [
            { channel: 'Vanity reach', rationale: 'impressions ≠ pipeline for B2B', whenYes: 'launching a category-defining brand play with budget to spare' },
            { channel: 'Mass display', rationale: 'low intent, wrong audience' },
            { channel: 'Local SEO / city pages', rationale: 'national/global delivery has no local-pack intent', whenYes: 'a specific service is delivered locally/regionally' },
        ],
        creativeFormats: [
            'comparison / BOFU content', 'case studies', 'result-led Reels',
            'demo / consult CTA', 'retargeting with proof',
        ],
        funnelMotion: 'demand-gen + intent → nurture → demo/consult → sales',
        budgetLogic: 'content authority + intent search first; LinkedIn + retargeting amplify; paid scales with pipeline ROMI',
        primaryKpi: 'SQLs, demo bookings, pipeline value, CAC vs LTV → ROMI on pipeline',
        romiModel: 'pipeline value × win-rate × ACV vs CAC, over the sales cycle',
        leadMechanism: 'demo / consultation booking, gated asset, contact-sales',
        antiPatterns: ['no nurture', 'treating like ecommerce/volume', 'ignoring sales cycle in attribution'],
        evidenceOverrides: [
            { factSignal: 'thin search demand for the category', adjustment: 'shift weight to Meta case-led + content demand-gen' },
            { factSignal: 'competitors winning on LinkedIn', adjustment: 'raise LinkedIn weight' },
        ],
        deferTacticsPrior: ['city_pages'],
    },

    // ── 4. Ecommerce (catalog, many SKUs) ────────────────────────────────
    ecommerce: {
        id: 'ecommerce',
        nameHe: 'מסחר אונליין',
        nameEn: 'Ecommerce',
        classifySignals: [
            'product catalog / many SKUs', 'online checkout', 'transactional',
            'mostly B2C', 'AOV / margin / ROAS-driven',
        ],
        economics: 'AOV, margin, repeat/LTV, ROAS-driven, fast cycle',
        primaryChannels: [
            { channel: 'Google Shopping / PMax (feed)', rationale: 'feed-driven capture of transactional intent' },
            { channel: 'Meta Advantage+ / DPA (catalog + dynamic remarketing)', rationale: 'prospecting + dynamic catalog retargeting' },
            { channel: 'Feed optimization', rationale: 'feed hygiene is the lever for Shopping/PMax performance' },
            { channel: 'ROAS bidding', rationale: 'optimize to margin-aware return' },
        ],
        secondaryChannels: [
            { channel: 'Category / brand search', rationale: 'defend brand + capture category demand' },
            { channel: 'Email lifecycle (cart / winback)', rationale: 'recover carts + drive repeat/LTV' },
            { channel: 'UGC / influencer', rationale: 'social proof + top-of-funnel reach' },
        ],
        laterOrAvoid: [
            { channel: 'Broad awareness without retargeting', rationale: 'prospecting without capture wastes budget', whenYes: 'a brand-building budget exists alongside performance' },
            { channel: 'Ignoring feed hygiene', rationale: 'broken feed caps every paid channel' },
        ],
        creativeFormats: [
            'product feed', 'catalog / collection ads', 'UGC + Reels',
            'dynamic remarketing', 'category / PLP pages',
        ],
        funnelMotion: 'prospecting (PMax/Advantage+) → retarget (DPA/cart) → repeat (email/CRM)',
        budgetLogic: 'feed channels (Shopping/PMax + Advantage+) lead; scale while margin-ROAS holds; email lifecycle compounds',
        primaryKpi: 'ROAS (net of margin), AOV, cart-abandon, repeat → blended margin-ROAS',
        romiModel: 'blended margin-ROAS × order volume, net of cart-abandon, including repeat/LTV',
        leadMechanism: 'add-to-cart / checkout / email capture',
        antiPatterns: ['no feed hygiene', 'no customer-list exclusions', 'ignoring LTV', 'last-click-only attribution'],
        evidenceOverrides: [
            { factSignal: 'high category CPC + heavy Shopping competition', adjustment: 'shift weight to Meta DPA / email lifecycle' },
            { factSignal: 'competitor Meta-DPA saturation', adjustment: 'differentiate creative + lean on email + UGC' },
        ],
        deferTacticsPrior: ['city_pages'],
    },

    // ── 5. Creator / infoproduct ─────────────────────────────────────────
    creator_infoproduct: {
        id: 'creator_infoproduct',
        nameHe: 'יוצר תוכן / מוצר מידע',
        nameEn: 'Creator / infoproduct',
        classifySignals: [
            'personal brand / expert', 'sells courses / coaching / membership / digital product',
            'audience-led', 'mostly B2C', 'launch + evergreen cadence, backend LTV',
        ],
        economics: 'mid ticket (course) to recurring (membership); list/audience-driven; launch + evergreen; LTV via backend',
        primaryChannels: [
            { channel: 'Organic short-video (Reels / TikTok / YouTube)', rationale: 'audience-building engine for a personal brand' },
            { channel: 'Email list + nurture', rationale: 'the owned asset that converts and compounds' },
            { channel: 'Webinar / masterclass funnel', rationale: 'high-converting sell mechanism for courses/coaching' },
            { channel: 'Lead magnets', rationale: 'convert audience → list' },
        ],
        secondaryChannels: [
            { channel: 'Meta paid (lookalike on list/engagers + retarget)', rationale: 'amplify winning content + retarget warm audience' },
            { channel: 'YouTube', rationale: 'long-form authority + evergreen discovery' },
            { channel: 'Affiliate / JV', rationale: 'borrowed audiences for launches' },
            { channel: 'High-intent search ("course X")', rationale: 'capture branded/category course demand' },
        ],
        laterOrAvoid: [
            { channel: 'Cold search-heavy acquisition', rationale: 'low for new creators with no authority yet', whenYes: 'an established brand with category search demand' },
            { channel: 'Broad display', rationale: 'audience is built on social/content, not display' },
        ],
        creativeFormats: [
            'short-form video (hook → value → CTA)', 'free value / lead magnets',
            'webinar / masterclass', 'results / testimonials', 'email sequences',
        ],
        funnelMotion: 'audience (organic + paid social) → list (lead magnet) → nurture (email/webinar) → launch/evergreen sell → backend/membership',
        budgetLogic: 'organic content engine first; paid = amplify winning content + retarget + lookalike on list',
        primaryKpi: 'list growth, cost-per-lead, webinar→sale, launch revenue, backend LTV → ROMI on list/launch',
        romiModel: 'launch revenue + backend LTV per list-subscriber vs cost-per-lead',
        leadMechanism: 'lead-magnet opt-in / webinar registration / waitlist',
        antiPatterns: ['selling cold (no nurture)', 'no list', 'no lead magnet', 'ignoring backend/LTV', 'treating like ecommerce'],
        evidenceOverrides: [
            { factSignal: 'which platform the audience actually engages on (IG vs TikTok vs YT) from niche data', adjustment: 'concentrate the organic engine on the winning platform' },
        ],
        deferTacticsPrior: ['city_pages'],
    },
}

export function getPlaybook(id: ArchetypeId): ArchetypePlaybook {
    return ARCHETYPES[id]
}

/** Cross-cutting modifiers (roadmap/22 §"Cross-cutting dimensions"). Layered on
 *  top of any archetype; affect channel/creative/cycle but not the base axis. */
export type B2xModifier = 'b2b' | 'b2c' | 'mixed'
export type LocalityModifier = 'local' | 'regional' | 'national' | 'global'
export type IntentModifier = 'impulse' | 'considered'
/** hybrid_local_ecom = local store that ALSO sells online (modifier, not archetype). */
export type HybridModifier = 'hybrid_local_ecom' | null

export interface ArchetypeModifiers {
    b2x: B2xModifier
    locality: LocalityModifier
    intent: IntentModifier
    hybrid: HybridModifier
}