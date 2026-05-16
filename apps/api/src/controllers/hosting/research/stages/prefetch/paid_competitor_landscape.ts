/**
 * Prefetch for paid_competitor_landscape stage.
 *
 * Inputs (read from existing research_data):
 *   - competitor_landscape.records → list of organic-discovered competitor domains
 *   - answers.competitorDomains → user-supplied competitors (override + supplement)
 *   - answers.businessName / answers.websiteUrl
 *
 * Pipeline (parallel for speed — these are all independent API calls):
 *   1. Resolve competitor domain list (up to 8)
 *   2. For each domain, in parallel:
 *      a) Meta Ad Library API → active ads, run-duration, platforms, languages, snapshots
 *      b) Google Ads Transparency Center → headlines, descriptions, RSA copy patterns
 *      c) Firecrawl on competitor LP → CRO audit (form fields, hero, social proof, IL signals)
 *
 * Output: PaidCompetitorLandscapePrefetch — fed to the Opus prompt builder.
 *
 * Failure mode: per-domain failures are isolated (one bad page doesn't fail
 * the whole stage). Min threshold: 2 competitors with ANY data — below that,
 * the stage is degraded (quality gate flags as working_hypothesis).
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { ResearchDataV2 } from '@/services/research/types'
import { auditMetaAdLibrary, type MetaAdLibraryResult } from '@/services/paidResearch/metaAdLibrary'
import { enrichWithGoogleAdsTransparency } from '@/services/googleAdsTransparency'
// GoogleAdsTransparencyResult type is not exported; we inline-shape locally.
type GoogleAdsTransparencyResult = Awaited<ReturnType<typeof enrichWithGoogleAdsTransparency>>
import { auditLandingPage, type LandingPageAudit } from '@/services/paidResearch/landingPageAudit'

export interface PaidCompetitorLandscapePrefetch {
    /** Competitor domains we actually scanned. */
    competitorDomains: string[]
    /** Source of each domain: 'user' (answers), 'organic' (competitor_landscape), 'fallback' (heuristic). */
    domainSources: Record<string, 'user' | 'organic' | 'fallback'>
    /** Meta Ad Library results — one entry per competitor that had Meta data. */
    metaAds: MetaAdLibraryResult
    /** Google Ads Transparency Center results — RSA copy + active campaigns. */
    googleAds: GoogleAdsTransparencyResult | null
    /** Per-competitor landing-page CRO audit. */
    landingPages: LandingPageAudit[]
    /** Provenance + cost roll-up. */
    diagnostics: {
        domainsResolved: number
        domainsAttempted: number
        metaCallsMade: number
        googleCallsMade: number
        firecrawlCallsMade: number
        firecrawlCallsFailed: number
        totalLatencyMs: number
    }
    /** Hard warnings: when below thresholds we'd want the stage to flag degraded. */
    warnings: string[]
}

// ─── Domain resolution ────────────────────────────────────────────────────

interface CompetitorRecord {
    name?: string
    domain?: string
    url?: string         // <-- competitor_landscape stage emits records with `url`, not `domain`
    bucket?: string
}

function isStringArray(x: unknown): x is string[] {
    return Array.isArray(x) && x.every(v => typeof v === 'string')
}

/**
 * Strip protocol/path/www and lowercase; return cleaned string OR empty when
 * the input isn't a syntactically-valid domain. Defense against upstream
 * stages emitting `name` with Hebrew/spaces/parentheses (e.g.
 * "אביה אחסנה (avia2000)") — we used to pass that straight to
 * `https://{name}` and Firecrawl would fail on 100% of LP audits.
 *
 * Rules:
 *   - Must contain a dot followed by 2-24 ASCII letters (the TLD)
 *   - Only ASCII letters, digits, hyphens, dots (no Unicode / spaces / parens)
 *   - 4-253 chars (RFC 1035 cap; minimum is a.io)
 *
 * When invalid we return '' so resolveDomains() can skip the entry rather
 * than poison the URL list.
 */
const VALID_DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/
function cleanDomain(raw: string): string {
    const cleaned = raw
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '')
        .toLowerCase()
    // Pull out something that looks like a domain even if user typed
    // "אביה אחסנה (avia2000.co.il)" — extract the parenthesized domain.
    const extracted = cleaned.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/)?.[0] || cleaned
    if (extracted.length < 4 || extracted.length > 253) return ''
    if (!VALID_DOMAIN_RE.test(extracted)) return ''
    return extracted
}

function resolveDomains(rd: ResearchDataV2): {
    domains: string[]
    sources: Record<string, 'user' | 'organic' | 'fallback'>
} {
    const sources: Record<string, 'user' | 'organic' | 'fallback'> = {}
    const seen = new Set<string>()
    const ordered: string[] = []

    // 1. User-supplied domains (highest signal)
    const userRaw = (rd.answers as Record<string, unknown>)?.competitorDomains
    if (typeof userRaw === 'string') {
        for (const part of userRaw.split(/[,\n;]/)) {
            const d = cleanDomain(part)
            if (d && !seen.has(d)) {
                seen.add(d)
                ordered.push(d)
                sources[d] = 'user'
            }
        }
    } else if (isStringArray(userRaw)) {
        for (const part of userRaw) {
            const d = cleanDomain(part)
            if (d && !seen.has(d)) {
                seen.add(d)
                ordered.push(d)
                sources[d] = 'user'
            }
        }
    }

    // 2. From organic competitor_landscape (already discovered, validated).
    // Field priority: `url` (cleanest, includes TLD) > `domain` > `name`.
    // The `name` fallback is dangerous — Opus sometimes emits Hebrew-in-parens
    // values like "אביה אחסנה (avia2000)" which used to slip through as URLs.
    // cleanDomain() now regex-extracts a valid domain or returns '' to skip.
    const organicResult = rd.results?.competitor_landscape
    const organicRecords = ((organicResult?.records as unknown[]) || []) as CompetitorRecord[]
    for (const rec of organicRecords) {
        const candidates = [rec.url, rec.domain, rec.name].filter((x): x is string => typeof x === 'string')
        let resolved = ''
        for (const raw of candidates) {
            const d = cleanDomain(raw)
            if (d) { resolved = d; break }
        }
        if (!resolved || seen.has(resolved)) continue
        seen.add(resolved)
        ordered.push(resolved)
        sources[resolved] = 'organic'
    }

    // 3. Soft cap: 8 competitors max (API rate limits + Opus token budget)
    return { domains: ordered.slice(0, 8), sources }
}

// ─── Public entry point ──────────────────────────────────────────────────

export async function prefetchPaidCompetitorLandscape(
    instanceId: string,
    rd: ResearchDataV2,
): Promise<PaidCompetitorLandscapePrefetch> {
    const startedAt = Date.now()

    // 1. Resolve competitor domains
    const { domains, sources } = resolveDomains(rd)

    if (domains.length === 0) {
        return {
            competitorDomains: [],
            domainSources: {},
            metaAds: {
                available: false,
                reason: 'No competitor domains available — run competitor_landscape first OR add answers.competitorDomains',
                competitorsRequested: [],
                competitorsScanned: 0,
                competitors: [],
                diagnostics: { appIdConfigured: false, appSecretConfigured: false, callsAttempted: 0, callsFailed: 0 },
            },
            googleAds: null,
            landingPages: [],
            diagnostics: {
                domainsResolved: 0, domainsAttempted: 0,
                metaCallsMade: 0, googleCallsMade: 0,
                firecrawlCallsMade: 0, firecrawlCallsFailed: 0,
                totalLatencyMs: Date.now() - startedAt,
            },
            warnings: ['No competitor domains found — paid_competitor_landscape needs organic competitor_landscape to run first OR user-supplied competitorDomains in answers.'],
        }
    }

    // 2. Get Firecrawl key from instance (per-tenant) — same pattern as profileEnricher
    const [instance] = await db.select({ firecrawlKey: instances.firecrawlKey })
        .from(instances)
        .where(eq(instances.id, instanceId))
    const firecrawlKey = instance?.firecrawlKey || process.env.FIRECRAWL_API_KEY || null

    // Determine target country for Meta Ad Library policy gate.
    // paidProfile.geography or answers.geography may carry country codes.
    // Default to 'IL' for ClawFlow's primary market; Meta API short-circuits
    // for any non-EU/UK country (commercial ads not covered by API).
    const targetCountry = (() => {
        const pp = rd.paidProfile as Record<string, unknown> | undefined
        const geo = (pp?.geography as Record<string, unknown> | undefined) || {}
        const cc = (geo.countryCode as string) || (geo.country as string) || 'IL'
        return cc.slice(0, 2).toUpperCase()
    })()

    // 3. Run all three audits in parallel
    const [metaResult, googleResult, lpAudits] = await Promise.all([
        // Meta Ad Library — per-competitor calls happen inside auditMetaAdLibrary.
        // Policy guard inside short-circuits for non-EU/UK countries so we don't
        // waste rate limit on a call Meta will reject.
        auditMetaAdLibrary(domains, { targetCountry }).catch((err): MetaAdLibraryResult => ({
            available: false,
            reason: `Meta audit threw: ${(err as Error).message}`,
            competitorsRequested: domains,
            competitorsScanned: 0,
            competitors: [],
            diagnostics: { appIdConfigured: false, appSecretConfigured: false, callsAttempted: 0, callsFailed: domains.length },
        })),

        // Google Ads Transparency Center
        enrichWithGoogleAdsTransparency(domains, { region: 'IL', perCompetitorLimit: 10 }).catch((err): GoogleAdsTransparencyResult => ({
            available: false,
            reason: `Google Transparency audit threw: ${(err as Error).message}`,
            competitorsRequested: domains,
            competitorsFound: [],
            ads: [],
        })),

        // Landing-page audits (parallel per domain; collect failures gracefully)
        Promise.all(domains.map(d => auditLandingPage({
            url: `https://${d}`,
            firecrawlKey,
        }).catch((err): LandingPageAudit => ({
            url: `https://${d}`,
            fetchOk: false,
            fetchError: `Audit threw: ${(err as Error).message}`,
            fetchSource: 'failed',
            ctaButtons: [],
            formFieldCount: 0,
            hasForm: false,
            heroMediaPresent: false,
            socialProof: { testimonialBlocks: 0, starRatingsShown: false, brandLogos: 0 },
            trustSignals: { sslBadge: false, moneyBackMentioned: false, addressMentioned: false, whatsappCTA: false },
            pricing: { priceShown: false, pricingHidden: false },
            schemaTypes: [],
            croWarnings: [],
        })))),
    ])

    // 4. Synthesize warnings for the stage
    const warnings: string[] = []
    if (!metaResult.available) {
        warnings.push(`Meta Ad Library: ${metaResult.reason || 'unavailable'}`)
    } else if (metaResult.competitors.filter(c => c.creatives.length > 0).length < 2) {
        warnings.push('Meta Ad Library returned active ads for less than 2 competitors — IL paid landscape may be sparse OR App needs broader permissions')
    }
    if (!googleResult?.available) {
        warnings.push(`Google Transparency: ${googleResult?.reason || 'unavailable'}`)
    } else if (googleResult.competitorsFound.length < 2) {
        warnings.push('Google Ads Transparency Center returned ads for less than 2 competitors — they may not be running Google Ads in IL')
    }
    const lpOk = lpAudits.filter(a => a.fetchOk).length
    if (lpOk < 2) {
        warnings.push(`Only ${lpOk} of ${domains.length} landing pages successfully audited — CRO analysis will be thin`)
    }

    return {
        competitorDomains: domains,
        domainSources: sources,
        metaAds: metaResult,
        googleAds: googleResult,
        landingPages: lpAudits,
        diagnostics: {
            domainsResolved: domains.length,
            domainsAttempted: domains.length,
            metaCallsMade: metaResult.diagnostics.callsAttempted,
            googleCallsMade: googleResult?.competitorsFound.length || 0,
            firecrawlCallsMade: lpAudits.filter(a => a.fetchSource === 'firecrawl').length,
            firecrawlCallsFailed: lpAudits.filter(a => !a.fetchOk).length,
            totalLatencyMs: Date.now() - startedAt,
        },
        warnings,
    }
}