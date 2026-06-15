/**
 * Archetype Strategy Framework — Phase 6: offer extraction.
 *
 * A tenant often sells MORE THAN ONE offer with different go-to-market motions
 * (e.g. Flowmatic: a self-serve ₪279 subscription AND a done-for-you ₪2,850
 * autopilot). Each deserves its own plan path — same product, different motion,
 * different channels + retention needs. This extracts the offers so the engine
 * can classify + synthesize PER OFFER (roadmap/22 rule 5: per-offer, not blend).
 *
 * Source priority: structured onboarding `answers.products[]` (the canonical
 * rail) → explicit `offers[]` → price-tier heuristic → single-offer fallback.
 * Deterministic, no LLM/DB.
 */

import type { OfferMotion } from './archetypeRegistry'

export interface Offer {
    id: string
    name: string
    priceIls?: number
    isPrimary: boolean
    recurring: boolean
    motion: OfferMotion
    description: string
    /** name + description, for classification. */
    text: string
}

const RE_SELF_SERVE = /שירות עצמי|שירות-עצמי|self.?serve|self.?service|do.?it.?yourself|\bdiy\b|לבד|עצמאי|בעצמך|בעצמכם|לנהל לבד|self-?managed/i
const RE_DONE_FOR_YOU = /אוטופיילוט|אוטופיילות|autopilot|end.?to.?end|אאוטסורס|אווטסורס|outsource|done.?for.?you|white.?label|מנוהל|שירות מלא|managed service|for you|נעשה עבורכם|done with you/i
const RE_TRANSACTIONAL = /חנות|קנייה|רכישה|catalog|checkout|מוצר פיזי|ecommerce|online store/i
const RE_RECURRING = /subscription|recurring|monthly|annual|מנוי|חודשי|שנתי|retainer|ריטיינר/i

function detectMotion(text: string, priceIls?: number): OfferMotion {
    if (RE_DONE_FOR_YOU.test(text)) return 'done_for_you'
    if (RE_SELF_SERVE.test(text)) return 'self_serve'
    if (RE_TRANSACTIONAL.test(text)) return 'transactional'
    // High-ticket with no explicit signal usually implies a sales-assisted motion.
    if (typeof priceIls === 'number' && priceIls >= 1500) return 'sales_assisted'
    return 'unknown'
}

function isRecurring(priceModel: unknown, text: string): boolean {
    const pm = String(priceModel || '')
    return RE_RECURRING.test(pm) || RE_RECURRING.test(text)
}

function offerId(name: string, i: number): string {
    const slug = String(name || `offer${i}`).toLowerCase().replace(/[^a-z0-9א-ת]+/g, '_').slice(0, 24).replace(/^_+|_+$/g, '')
    return `offer_${i}_${slug || 'x'}`
}

/** Extract the tenant's offers. Always returns ≥1 (single-offer fallback). Cap 4. */
export function extractOffers(rd: any): Offer[] {
    // 1. Canonical rail — onboarding answers.products[].
    const products: any[] = Array.isArray(rd?.answers?.products) ? rd.answers.products
        : Array.isArray(rd?.offers) ? rd.offers
        : Array.isArray(rd?.answers?.offers) ? rd.answers.offers
        : Array.isArray(rd?.results?.positioning?.offers) ? rd.results.positioning.offers
        : []

    const offers: Offer[] = []
    if (products.length > 0) {
        products.slice(0, 4).forEach((p: any, i: number) => {
            const name = String(p?.name || p?.title || p?.label || `מוצר ${i + 1}`).trim()
            const description = String(p?.description || p?.desc || '').trim()
            const text = `${name} ${description}`.trim()
            const priceIls = typeof p?.priceIls === 'number' ? p.priceIls
                : typeof p?.price === 'number' ? p.price : undefined
            offers.push({
                id: offerId(name, i),
                name: name.slice(0, 120),
                priceIls,
                isPrimary: p?.isPrimary === true || (i === 0 && products.every((q: any) => q?.isPrimary !== true)),
                recurring: isRecurring(p?.priceModel || p?.pricemodel, text),
                motion: detectMotion(text, priceIls),
                description: description.slice(0, 600),
                text,
            })
        })
    }

    // 2. Single-offer fallback — whole business as one offer.
    if (offers.length === 0) {
        const name = String(rd?.answers?.businessName || rd?.businessName || 'המוצר').trim()
        const description = String(rd?.answers?.businessDescription || rd?.businessDesc || rd?.results?.positioning?.summary || '').trim()
        const text = `${name} ${description}`.trim()
        offers.push({
            id: offerId(name, 0),
            name: name.slice(0, 120),
            priceIls: undefined,
            isPrimary: true,
            recurring: isRecurring(rd?.answers?.businessModel, text),
            motion: detectMotion(text),
            description: description.slice(0, 600),
            text,
        })
    }

    // Ensure exactly one primary.
    if (!offers.some(o => o.isPrimary)) offers[0].isPrimary = true
    return offers
}