/**
 * Archetype Strategy Framework — Phase 2: offer → archetype classification.
 *
 * Deterministic (no LLM): extracts structured signals from research_data +
 * onboarding answers + the connected stack, then scores all 5 archetypes and
 * picks the best fit with a confidence + the matched signals as evidence.
 *
 * Deterministic by design (free, fast, reproducible, hang-proof) — mirrors the
 * codebase's monthlyPlanReview / structured-filler philosophy. Structured signals
 * (geography, persona business-type, product-page counts, GBP) are weighted above
 * fuzzy keyword matches. Evidence travels with every classification.
 */

import type { ArchetypeId, ArchetypeModifiers, B2xModifier, LocalityModifier } from './archetypeRegistry'
import { ARCHETYPES, ARCHETYPE_IDS } from './archetypeRegistry'
import type { ConnectedStack } from '../connectedStack'

export type Confidence = 'high' | 'medium' | 'low'

export interface ExtractedSignals {
    hasPhysicalLocation: boolean
    sellsProducts: boolean
    onlineCheckout: boolean
    productPageCount: number
    inPersonService: boolean
    personalBrandOrCourse: boolean
    b2x: B2xModifier
    locality: LocalityModifier
    /** evidence pointers — which inputs produced the signals above. */
    evidence: string[]
}

export interface OfferClassification {
    offer: string
    archetype: ArchetypeId
    confidence: Confidence
    score: number
    matchedSignals: string[]
    rationale: string
}

export interface ArchetypeClassificationResult {
    primaryArchetype: ArchetypeId
    confidence: Confidence
    offers: OfferClassification[]
    modifiers: ArchetypeModifiers
    signals: ExtractedSignals
    /** all archetype scores, for transparency / debugging. */
    scores: Record<ArchetypeId, number>
    rationale: string
    classifiedAt: string
}

// ─── Keyword lexicons (Hebrew + English) ──────────────────────────────────
const RE_PHYSICAL = /כתובת|סניף|חנות פיזית|מרפאה|קליניק|סטודיו|מסעדה|בית קפה|מספרה|סלון|showroom|storefront|walk-?in|נקודת מכירה|בית עסק פיזי/i
const RE_PRODUCTS = /חנות|מוצרים|קטלוג|מק"?ט|מלאי|woocommerce|shopify|e-?commerce|מסחר אונליין|חנות אונליין|online store|webshop|add ?to ?cart|עגלת קניות|checkout|רכישה באתר/i
const RE_CHECKOUT = /checkout|עגלת קניות|add ?to ?cart|סל קניות|רכישה מקוונת|תשלום באתר|online store|webshop/i
const RE_SERVICE = /שירות|התקנה|טיפול|ייעוץ|תיקון|שיפוץ|אינסטלטור|חשמלאי|רופא שיניים|עורך דין|מאמן|קוסמטיקאית|הסעות|ניקיון|הובל|plumb|electric|dentist|lawyer|trainer|clinic|repair|installation|consultation|service provider/i
const RE_COURSE = /קורס|קואצ'ינג|קואוצ'ינג|הדרכה|מנטורינג|וובינר|מאסטרקלאס|מוצר דיגיטלי|מוצר מידע|מנוי תוכן|קהילה בתשלום|course|coaching|mentor|webinar|masterclass|membership|info-?product|digital product|creator|influencer|יוצר תוכן/i
const RE_B2B = /b2b|עסקים|ארגונים|חברות|מנהלים|enterprise|saas|לקוחות עסקיים|מכירה לעסקים|תעשייה|מוסדות|רכש|procurement/i
const RE_B2C = /b2c|צרכנים|לקוחות פרטיים|קהל רחב|consumer|פרטיים|משפחות|אנשים פרטיים/i
const RE_NATIONAL = /ארצי|בכל הארץ|כל הארץ|פריסה ארצית|national/i
const RE_GLOBAL = /גלובלי|בינלאומי|worldwide|global|international|across the world/i
const RE_LOCAL = /מקומי|אזור|בסביבת|קרוב אליי|near ?me|local|service ?area|אזור השירות|בעיר/i

function txt(...parts: Array<unknown>): string {
    return parts.map(p => (typeof p === 'string' ? p : p ? JSON.stringify(p) : '')).join(' ')
}

// ─── Signal extraction ─────────────────────────────────────────────────────
export function extractSignals(rd: any, stack?: ConnectedStack): ExtractedSignals {
    const answers = rd?.answers || {}
    const positioning = rd?.results?.positioning
    const brand = rd?.brandBook || rd?.results?.brand_book
    const evidence: string[] = []

    const description = txt(
        answers.businessDescription, answers.whatYouSell, answers.businessName,
        positioning?.summary, positioning?.category, positioning?.positioningStatement,
        brand?.usps, brand?.tagline, rd?.businessDesc,
    )

    // Product / checkout signals — structured first (product page count), then keywords.
    const seoRecords: any[] = rd?.results?.internal_seo_audit?.records || []
    const productPageCount = seoRecords.filter(r => r?.page_type === 'product' || /\/product\//i.test(r?.url || '')).length
    const sellsProducts = productPageCount >= 5 || RE_PRODUCTS.test(description)
    if (productPageCount >= 5) evidence.push(`internal_seo_audit: ${productPageCount} product pages`)
    else if (RE_PRODUCTS.test(description)) evidence.push('description mentions products/store/catalog')
    const onlineCheckout = productPageCount >= 5 || RE_CHECKOUT.test(description)

    // Physical location — GBP connection (structured) or address keywords.
    const hasPhysicalLocation = !!(stack?.gbp || rd?.gbpConfig?.locationId || RE_PHYSICAL.test(description))
    if (stack?.gbp || rd?.gbpConfig?.locationId) evidence.push('Google Business Profile connected (physical location)')
    else if (RE_PHYSICAL.test(description)) evidence.push('description mentions a physical address/storefront')

    const inPersonService = RE_SERVICE.test(description)
    if (inPersonService) evidence.push('description mentions in-person service delivery')

    const personalBrandOrCourse = RE_COURSE.test(description)
    if (personalBrandOrCourse) evidence.push('description mentions course/coaching/membership/creator')

    // B2B vs B2C — personas first, then keywords.
    const personas: any[] = rd?.results?.audience_personas?.records || []
    const personaText = txt(...personas)
    let b2x: B2xModifier = 'b2c'
    const b2bHit = RE_B2B.test(description) || RE_B2B.test(personaText)
    const b2cHit = RE_B2C.test(description) || RE_B2C.test(personaText)
    if (b2bHit && b2cHit) b2x = 'mixed'
    else if (b2bHit) b2x = 'b2b'
    else b2x = 'b2c'
    if (b2bHit || b2cHit) evidence.push(`audience signal → ${b2x}`)

    // Locality — geography (structured) first, then keywords.
    const cities = rd?.paidProfile?.geography?.cities
    let locality: LocalityModifier = 'national'
    if (RE_GLOBAL.test(description)) locality = 'global'
    else if (Array.isArray(cities) && cities.length > 0) { locality = cities.length <= 3 ? 'local' : 'regional' }
    else if (RE_LOCAL.test(description)) locality = 'local'
    else if (RE_NATIONAL.test(description)) locality = 'national'
    if (Array.isArray(cities) && cities.length > 0) evidence.push(`paidProfile.geography: ${cities.length} cities → ${locality}`)
    else if (RE_GLOBAL.test(description)) evidence.push('description mentions global/international → global')
    else if (RE_LOCAL.test(description)) evidence.push('description mentions local/service-area → local')

    return { hasPhysicalLocation, sellsProducts, onlineCheckout, productPageCount, inPersonService, personalBrandOrCourse, b2x, locality, evidence }
}

// ─── Per-archetype scoring ─────────────────────────────────────────────────
/** Returns the score + which signals contributed (evidence for the rationale). */
export function scoreArchetype(id: ArchetypeId, s: ExtractedSignals): { score: number; matched: string[] } {
    const matched: string[] = []
    let score = 0
    const add = (cond: boolean, pts: number, label: string) => { if (cond) { score += pts; matched.push(label) } }
    const isLocalish = s.locality === 'local' || s.locality === 'regional'
    const isNationalish = s.locality === 'national' || s.locality === 'global'

    switch (id) {
        case 'ecommerce':
            add(s.sellsProducts, 3, 'sells products / catalog')
            add(s.onlineCheckout, 2, 'online checkout')
            add(s.productPageCount >= 10, 2, `${s.productPageCount} product pages`)
            add(s.b2x !== 'b2b', 1, 'B2C/mixed audience')
            add(s.inPersonService, -2, 'in-person service (counter-signal)')
            add(s.personalBrandOrCourse, -1, 'creator/course (counter-signal)')
            break
        case 'creator_infoproduct':
            add(s.personalBrandOrCourse, 4, 'course / coaching / membership / creator')
            add(s.b2x !== 'b2b', 1, 'B2C/mixed audience')
            add(s.sellsProducts && s.productPageCount >= 10, -2, 'large product catalog (counter-signal)')
            break
        case 'b2b_service':
            add(s.b2x === 'b2b' || s.b2x === 'mixed', 3, 'B2B audience')
            add(isNationalish, 2, 'national/global delivery')
            add(!s.sellsProducts, 1, 'service, not a product catalog')
            add(!s.hasPhysicalLocation, 1, 'no walk-in physical location')
            add(s.personalBrandOrCourse, -1, 'creator/course (counter-signal)')
            break
        case 'physical_service':
            add(s.inPersonService, 3, 'in-person service delivery')
            add(isLocalish, 2, 'local/regional service area')
            add(!s.sellsProducts, 1, 'service, not a product catalog')
            add(s.b2x !== 'b2b' || isLocalish, 1, 'local/consumer-facing')
            add(s.personalBrandOrCourse, -1, 'creator/course (counter-signal)')
            break
        case 'local_business':
            add(s.hasPhysicalLocation, 3, 'physical storefront / location')
            add(isLocalish, 2, 'local catchment')
            add(s.b2x === 'b2c', 1, 'B2C audience')
            add(isNationalish, -2, 'national/global (counter-signal)')
            break
    }
    return { score, matched }
}

function confidenceFromMargin(top: number, second: number): Confidence {
    if (top <= 0) return 'low'
    const margin = top - second
    if (top >= 4 && margin >= 2) return 'high'
    if (top >= 2 && margin >= 1) return 'medium'
    return 'low'
}

// ─── Public entry ──────────────────────────────────────────────────────────
export function classifyArchetypes(rd: any, stack?: ConnectedStack, nowIso?: string): ArchetypeClassificationResult {
    const signals = extractSignals(rd, stack)

    const scores = {} as Record<ArchetypeId, number>
    const matchedById = {} as Record<ArchetypeId, string[]>
    for (const id of ARCHETYPE_IDS) {
        const r = scoreArchetype(id, signals)
        scores[id] = r.score
        matchedById[id] = r.matched
    }

    const ranked = [...ARCHETYPE_IDS].sort((a, b) => scores[b] - scores[a])
    const primaryArchetype = ranked[0]
    const confidence = confidenceFromMargin(scores[ranked[0]], scores[ranked[1]] ?? 0)

    const intent: ArchetypeModifiers['intent'] =
        (primaryArchetype === 'ecommerce' || primaryArchetype === 'local_business') ? 'impulse' : 'considered'
    const hybrid = (primaryArchetype === 'local_business' && signals.sellsProducts) ? 'hybrid_local_ecom' : null
    const modifiers: ArchetypeModifiers = { b2x: signals.b2x, locality: signals.locality, intent, hybrid }

    // Single-offer by default (whole tenant). Multi-offer support: if the
    // onboarding answers carry an explicit offers[] list, classify each against
    // the same signal set (offers within one archetype is the common case; the
    // engine blends by ROMI downstream).
    const offerLabels: string[] = Array.isArray(rd?.answers?.offers) && rd.answers.offers.length > 0
        ? rd.answers.offers.map((o: any) => (typeof o === 'string' ? o : o?.name || o?.label || 'offer')).filter(Boolean)
        : [rd?.answers?.businessName || rd?.businessName || 'primary offer']

    const offers: OfferClassification[] = offerLabels.map(offer => ({
        offer,
        archetype: primaryArchetype,
        confidence,
        score: scores[primaryArchetype],
        matchedSignals: matchedById[primaryArchetype],
        rationale: `archetype=${ARCHETYPES[primaryArchetype].nameEn} · ${matchedById[primaryArchetype].join('; ') || 'no strong signal — defaulted'}`,
    }))

    const rationale = `Primary archetype: ${ARCHETYPES[primaryArchetype].nameEn} (${ARCHETYPES[primaryArchetype].nameHe}), confidence=${confidence}. `
        + `Matched: ${matchedById[primaryArchetype].join('; ') || 'none — defaulted to highest score'}. `
        + `Modifiers: ${modifiers.b2x}/${modifiers.locality}/${modifiers.intent}${hybrid ? `/${hybrid}` : ''}. `
        + `Scores: ${ranked.map(id => `${id}=${scores[id]}`).join(', ')}.`

    return {
        primaryArchetype, confidence, offers, modifiers, signals, scores, rationale,
        classifiedAt: nowIso || '',
    }
}