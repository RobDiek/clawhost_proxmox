/**
 * K30 — Wikidata Entity Draft Helper.
 *
 * Generates a Wikidata-ready entity draft for a tenant's business so the
 * founder can submit via wikidata.org with one click. Reduces the AEO/LLM
 * #1 setup task (K24 ENTITY_AUTHORITY) from "research everything yourself"
 * to "review and click submit".
 *
 * Output:
 *   {
 *     label: { he: "...", en: "..." },
 *     description: { he: "...", en: "..." },
 *     aliases: { he: [...], en: [...] },
 *     statements: [
 *       { property: "P31",   value: "Q4830453" },   // instance of: business
 *       { property: "P17",   value: "Q801"     },   // country: Israel
 *       { property: "P856",  value: "<websiteUrl>" }, // official website
 *       { property: "P571",  value: "<foundingDate>" }, // inception
 *       ...
 *     ],
 *     sitelinks: { hewiki: "..." },     // if Wikipedia article exists
 *     submitUrl: "https://www.wikidata.org/wiki/Special:NewItem?lang=he&label=<...>&description=<...>",
 *   }
 *
 * NOTE: Wikidata enforces notability. Most small businesses are NOT
 * Wikidata-notable. The helper returns draft + a notability check that
 * tells the founder whether submission is likely to succeed (Wikipedia
 * article exists OR significant press coverage). For non-notable tenants
 * the draft is still useful — it can be added as Schema.org Organization
 * sameAs payload on the website even without Wikidata acceptance.
 */

export interface WikidataDraft {
    label: { he: string; en?: string }
    description: { he: string; en?: string }
    aliases: { he: string[]; en?: string[] }
    statements: Array<{ property: string; value: string; comment?: string }>
    notabilityCheck: {
        score_0_100: number
        likelyAccepted: boolean
        evidence: string[]
        recommendation: string
    }
    submitUrl: string
    schemaOrgSameAsPayload: string[]
}

export async function generateWikidataDraft(rd: any): Promise<WikidataDraft> {
    const businessName: string = rd?.answers?.businessName || rd?.brandBook?.businessName || ''
    const websiteUrl: string = rd?.answers?.websiteUrl || rd?.brandBook?.websiteUrl || ''
    const description: string = rd?.answers?.businessDescription || rd?.brandBook?.businessDescription || ''
    const foundingYear: string = rd?.answers?.foundingYear || rd?.brandBook?.foundingYear || ''

    // Notability: check for press mentions / link audit evidence / high RD count
    const linkAudit = rd?.results?.link_audit
    const referringDomains = Number(linkAudit?.extras?.our_profile_summary?.referring_domains_total || 0)
    const brandMentions = Number(linkAudit?.extras?.brand_mentions_count || 0)
    let notabilityScore = 0
    const evidence: string[] = []
    if (referringDomains >= 100) { notabilityScore += 40; evidence.push(`${referringDomains} referring domains (≥100)`) }
    else if (referringDomains >= 50) { notabilityScore += 25; evidence.push(`${referringDomains} referring domains (≥50)`) }
    else if (referringDomains >= 20) { notabilityScore += 10; evidence.push(`${referringDomains} referring domains`) }
    if (brandMentions >= 50) { notabilityScore += 30; evidence.push(`${brandMentions} brand mentions`) }
    else if (brandMentions >= 20) { notabilityScore += 15; evidence.push(`${brandMentions} brand mentions`) }
    // Existing GBP / SS presence
    const hasGbp = !!(rd?.integrationsState?.gbp?.connected || rd?.results?.competitor_landscape?.extras?.our_gbp)
    if (hasGbp) { notabilityScore += 15; evidence.push('GBP listing present') }
    // Wikipedia article check (separate API call, async) — heuristic only here.
    // If a press release / dataset publishing task happened recently, bump.
    notabilityScore = Math.min(100, notabilityScore)
    const likelyAccepted = notabilityScore >= 50

    // Statements
    const statements: WikidataDraft['statements'] = [
        { property: 'P31',  value: 'Q4830453', comment: 'instance of: business' },
        { property: 'P17',  value: 'Q801',     comment: 'country: Israel' },
    ]
    if (websiteUrl) statements.push({ property: 'P856', value: websiteUrl, comment: 'official website' })
    if (/^\d{4}$/.test(foundingYear)) statements.push({ property: 'P571', value: `+${foundingYear}-01-01T00:00:00Z/9`, comment: 'inception (year-level)' })

    // sameAs payload (GBP, Facebook, Instagram, LinkedIn) — pull from integrations
    const sameAs: string[] = []
    try {
        const integ = rd?.integrationsState || {}
        if (integ?.facebook?.pageUrl) sameAs.push(String(integ.facebook.pageUrl))
        if (integ?.instagram?.profileUrl) sameAs.push(String(integ.instagram.profileUrl))
        if (integ?.linkedin?.companyUrl) sameAs.push(String(integ.linkedin.companyUrl))
        if (integ?.gbp?.placeUrl) sameAs.push(String(integ.gbp.placeUrl))
    } catch { /* defensive */ }

    const labelHe = businessName
    const labelEn = '' // Translate manually if needed
    const descriptionHe = description.slice(0, 250)

    // submit URL — prefilled new-item page
    const submitParams = new URLSearchParams({
        lang: 'he',
        label: labelHe,
        description: descriptionHe,
    })
    const submitUrl = `https://www.wikidata.org/wiki/Special:NewItem?${submitParams.toString()}`

    let recommendation = ''
    if (likelyAccepted) {
        recommendation = `סבירות גבוהה לקבלה (${notabilityScore}/100). פתחו את submitUrl, סקרו את ה-statements, לחצו "Create item".`
    } else if (notabilityScore >= 30) {
        recommendation = `סבירות בינונית לקבלה (${notabilityScore}/100). מומלץ להוסיף 2-3 פיצ'ים PR (Walla/Calcalist/Mynet) לפני submission. בינתיים השתמשו ב-schemaOrgSameAsPayload על האתר.`
    } else {
        recommendation = `סבירות נמוכה לקבלה (${notabilityScore}/100). השתמשו ב-schemaOrgSameAsPayload בלבד כעת; חזרו לבחון Wikidata אחרי שתגיעו ל-50+ referring domains או 20+ brand mentions.`
    }

    return {
        label: { he: labelHe, en: labelEn || undefined },
        description: { he: descriptionHe },
        aliases: { he: [] },
        statements,
        notabilityCheck: {
            score_0_100: notabilityScore,
            likelyAccepted,
            evidence,
            recommendation,
        },
        submitUrl,
        schemaOrgSameAsPayload: sameAs,
    }
}