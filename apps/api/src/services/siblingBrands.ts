/**
 * Sibling-brand awareness — for a client that runs several brands as separate
 * agents on the SAME VPS / Google Ads account (e.g. Moving Station + Packing
 * Station + Storage Station), one agent's OTHER brands are NOT competitors —
 * they're the client's own portfolio. Treating them as competitors produces
 * self-competition advice (outrank your own brand) and double-counts shared-
 * account conversions.
 *
 * This resolves the sibling brands of an agent (every OTHER mateh_agent on the
 * same instance, with its website domain). Consumers:
 *   - competitor_landscape / paid_competitor_landscape — exclude sibling domains
 *     from the competitor set + drop generic-platform noise (facebook.com…).
 *   - strategy / positioning / monthly-plan prompts — inject a "your sibling
 *     brands" note so keyword overlap is framed as an ALLOCATION decision
 *     (which brand owns which intent + shared negatives in paid), not a threat.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'

/** Strip protocol / www / path / port / query → bare host (lowercased). */
export function normalizeDomain(url?: string | null): string {
    if (!url) return ''
    return String(url).trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[/:?#].*$/, '')
        .trim()
}

export interface SiblingBrand {
    agentId: string
    name: string
    domain: string
}

/** Every OTHER agent on the same instance that has a resolvable website domain. */
export async function getSiblingBrands(instanceId: string, agentId?: string | null): Promise<SiblingBrand[]> {
    if (!instanceId) return []
    const rows = await db.select({
        id: matehAgents.id,
        name: matehAgents.name,
        rd: matehAgents.researchData,
    }).from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId))

    const out: SiblingBrand[] = []
    const seen = new Set<string>()
    for (const r of rows) {
        if (agentId && r.id === agentId) continue   // skip self
        const rd = (r.rd as { answers?: { websiteUrl?: string }; paidProfile?: { websiteUrl?: string } } | null) || {}
        const domain = normalizeDomain(rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl)
        if (domain && !seen.has(domain)) {
            seen.add(domain)
            out.push({ agentId: r.id, name: r.name || domain, domain })
        }
    }
    return out
}

/** Convenience: just the sibling domains. */
export async function getSiblingBrandDomains(instanceId: string, agentId?: string | null): Promise<string[]> {
    return (await getSiblingBrands(instanceId, agentId)).map(s => s.domain)
}

// Generic platforms that surface in organic scans but are never real PAID
// competitors — drop them from the competitor set as noise.
const PLATFORM_NOISE = /^(facebook\.com|m\.facebook\.com|business\.facebook\.com|instagram\.com|google\.com|google\.co\.il|youtube\.com|linkedin\.com|tiktok\.com|pinterest\.com|twitter\.com|x\.com|wikipedia\.org|he\.wikipedia\.org)$/

/**
 * True when a candidate competitor domain is the client's OWN sibling brand OR
 * generic platform noise — i.e. it should NOT be treated as a competitor.
 */
export function isSiblingOrNoise(candidateDomain: string, siblingDomains: string[]): boolean {
    const d = normalizeDomain(candidateDomain)
    if (!d) return false
    for (const s of siblingDomains) {
        if (!s) continue
        if (d === s || d.endsWith('.' + s) || s.endsWith('.' + d)) return true
    }
    return PLATFORM_NOISE.test(d)
}

/**
 * A short Hebrew prompt block listing the client's sibling brands, to inject
 * into competitor + strategy prompts. Empty string when there are none.
 */
export function buildSiblingBrandsPromptBlock(siblings: SiblingBrand[]): string {
    if (!siblings.length) return ''
    const list = siblings.map(s => `${s.name} (${s.domain})`).join(', ')
    return `\n\n⚠ מותגים-אחים של אותו לקוח (אל תתייחס אליהם כמתחרים — הם תיק המותגים של הלקוח עצמו): ${list}.
- אל תכלול אותם ברשימת המתחרים.
- אם מילות מפתח/קהלים חופפים איתם — זו **החלטת הקצאה (אנטי-קניבליזציה)**, לא איום: יש להחליט איזה מותג מחזיק כל אשכול-כוונה, והאחרים מוסיפים אותו כ-negative ב-paid / לא בונים עליו עמוד מתחרה ב-SEO.`
}