/**
 * Brand Book v2 — comprehensive multi-tier brand identity schema.
 *
 * Replaces the original 6-key minimal schema with a 6-tier professional
 * brand book that covers EVERY downstream use case:
 *   Tier 1: Identity (name, tagline, mission, manifesto, values, positioning)
 *   Tier 2: Visual (logo variants, colors, typography, imagery, iconography)
 *   Tier 3: Voice & messaging (archetype, tone, vocabulary, banned phrases, CTAs)
 *   Tier 4: Audience personas
 *   Tier 5: Compliance & legal
 *   Tier 6: Channel-specific assets (Google Ads / Meta / TikTok / YouTube / Email / LinkedIn)
 *
 * Each key has:
 *   - value
 *   - confidence: 'high' | 'medium' | 'low'
 *   - source: 'uploaded' | 'extracted' | 'generated' | 'curated'
 *   - lastUpdatedAt
 *   - notes (optional)
 *
 * Stored in `brand_books` jsonb columns. Versioned via row-per-version
 * with status draft → pending_approval → approved → archived.
 */

export type BrandKeyConfidence = 'high' | 'medium' | 'low'
export type BrandKeySource = 'uploaded' | 'extracted' | 'generated' | 'curated' | 'system'

export interface BrandKeyMeta {
    confidence: BrandKeyConfidence
    source: BrandKeySource
    updatedAt?: string
    notes?: string
    /** which AI model produced it (when source=generated) */
    generatedBy?: string
    /** asset URL on tenant VPS when binary (logo / image) */
    assetUrl?: string
}

export interface BilingualText {
    he?: string
    en?: string
    ar?: string                            // optional, IL minority audience
}

// ─── Tier 1 — Identity ─────────────────────────────────────────────────────

export interface BrandIdentityTier {
    businessName?: BilingualText & BrandKeyMeta
    legalName?: { value: string } & BrandKeyMeta
    tagline?: BilingualText & BrandKeyMeta
    mission?: BilingualText & BrandKeyMeta
    manifesto?: BilingualText & BrandKeyMeta
    positioningStatement?: BilingualText & BrandKeyMeta
    /** "for [audience], we are [category] that [benefit] because [proof]" */
    coreValues?: { values: Array<{ name: BilingualText; description: BilingualText }> } & BrandKeyMeta
}

// ─── Tier 2 — Visual identity ──────────────────────────────────────────────

export interface BrandLogoVariant {
    /** asset URL on tenant VPS */
    url: string
    format: 'svg' | 'png' | 'webp' | 'jpg'
    width?: number
    height?: number
    hasTransparency?: boolean
    intendedUsage?: string                 // "primary use", "small icon", "monochrome white"
}

export interface BrandLogo {
    primary?: BrandLogoVariant             // main version
    horizontal?: BrandLogoVariant
    vertical?: BrandLogoVariant
    icon?: BrandLogoVariant                // mark-only (no wordmark)
    monochromeBlack?: BrandLogoVariant
    monochromeWhite?: BrandLogoVariant
    onPhotoLight?: BrandLogoVariant        // light bg overlay
    onPhotoDark?: BrandLogoVariant         // dark bg overlay
    favicon?: BrandLogoVariant             // 32×32 + 192×192 + ICO
    socialAvatar?: BrandLogoVariant        // 320×320 square
    minClearSpaceRatio?: number            // multiplier of cap height (e.g. 1.0 = 1× cap)
    minRenderSizePx?: number               // smallest legible width
}

export interface BrandColorEntry {
    name: string                           // "Sunset Orange"
    hex: string                            // "#FF5733"
    rgb?: [number, number, number]
    cmyk?: [number, number, number, number]
    pantone?: string                       // "Pantone 1655 C"
    usage?: string                         // "Primary CTA only"
}

export interface BrandColors {
    primary?: BrandColorEntry
    secondary?: BrandColorEntry[]          // up to 3
    accent?: BrandColorEntry[]             // up to 2 — CTA / highlights
    neutral?: BrandColorEntry[]            // gray scale
    backgrounds?: { light?: BrandColorEntry; dark?: BrandColorEntry }
    semantic?: {
        success?: BrandColorEntry
        warning?: BrandColorEntry
        error?: BrandColorEntry
        info?: BrandColorEntry
    }
    usageRules?: string[]                  // "primary on white = OK, never on red"
}

export interface BrandFontEntry {
    family: string                         // "Heebo"
    fallbackChain?: string                 // "Heebo, Arial Hebrew, Arial, sans-serif"
    weights?: number[]                     // [400, 500, 700]
    source?: 'google_fonts' | 'self_hosted' | 'system'
    licenseUrl?: string
    webfontUrl?: string                    // CDN URL
}

export interface BrandTypography {
    primaryFontHe?: BrandFontEntry
    primaryFontEn?: BrandFontEntry
    secondaryFont?: BrandFontEntry         // headings or accents
    monospace?: BrandFontEntry             // code/data
    headingScale?: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number }
    body?: { sizePx: number; lineHeightRatio: number }
    weights?: { regular: number; emphasis: number; heavy: number }
}

export interface BrandImagery {
    style?: string                         // "warm lifestyle photography, no stock"
    colorPalette?: string[]                // hex codes preferred in imagery
    composition?: string                   // "rule of thirds, human focal point"
    referenceUrls?: string[]               // 5-10 examples
    bannedPatterns?: string[]              // "no AI cliches, no stock photos"
    /** Generation prompt addendum — appended when fal.ai generates new imagery */
    generationPromptAddendum?: string
}

export interface BrandIconography {
    style?: 'line' | 'filled' | 'duotone' | 'flat' | 'isometric'
    strokeWidthPx?: number
    cornerRadiusPx?: number
    referenceUrls?: string[]
    libraryUrl?: string                    // figma / icon set link
}

export interface BrandPattern {
    name: string
    url: string                            // PNG/SVG seamless pattern
    intendedUsage?: string
}

export interface BrandMotion {
    easing?: string                        // "ease-in-out"
    durationMsDefault?: number             // 200
    principles?: string[]
}

export interface BrandVisualTier {
    logo?: BrandLogo & BrandKeyMeta
    colors?: BrandColors & BrandKeyMeta
    typography?: BrandTypography & BrandKeyMeta
    imagery?: BrandImagery & BrandKeyMeta
    iconography?: BrandIconography & BrandKeyMeta
    patterns?: { items: BrandPattern[] } & BrandKeyMeta
    motion?: BrandMotion & BrandKeyMeta
}

// ─── Tier 3 — Voice & messaging ────────────────────────────────────────────

/** Carl Jung's 12 brand archetypes */
export type BrandArchetype =
    | 'innocent' | 'sage' | 'explorer' | 'outlaw' | 'magician' | 'hero'
    | 'lover' | 'jester' | 'everyman' | 'caregiver' | 'ruler' | 'creator'

export interface VoiceToneAxis {
    /** -1 to +1 multi-axis tone profile */
    warmFormal?: number                    // -1 = warm, +1 = formal
    playfulSerious?: number                // -1 = playful, +1 = serious
    simpleTechnical?: number               // -1 = simple, +1 = technical
    enthusiasticMatter?: number            // -1 = enthusiastic, +1 = matter-of-fact
}

export interface BrandVoice {
    archetype?: BrandArchetype
    archetypeRationale?: string
    tone?: VoiceToneAxis
    toneSummary?: BilingualText            // "warm, professional, no jargon"
    principles?: string[]                  // "we always lead with benefit, never feature"
    do?: string[]                          // "we say 'אחסון' not 'מחסן' for B2C"
    dont?: string[]                        // "never say 'cheap'"
    vocabulary?: {
        approved?: string[]                // approved Hebrew terms
        preferred?: { term: string; instead_of: string }[]
        banned?: string[]
    }
    examples?: Array<{ context: string; good: string; bad: string }>
}

export interface BrandMessaging {
    elevatorPitch?: BilingualText
    boilerplate?: BilingualText            // one-paragraph "About us"
    proofPoints?: string[]                 // facts, certifications, awards
    objectionHandlers?: Array<{ objection: BilingualText; response: BilingualText }>
    callsToAction?: {
        warm?: BilingualText[]             // soft CTAs
        urgent?: BilingualText[]           // hard CTAs
        soft?: BilingualText[]             // exploratory
    }
}

export interface BrandVoiceTier {
    voice?: BrandVoice & BrandKeyMeta
    messaging?: BrandMessaging & BrandKeyMeta
}

// ─── Tier 4 — Audience personas ────────────────────────────────────────────

export interface BrandPersona {
    id: string
    name: string                           // "דורון — Family relocator"
    demographics?: {
        ageRange?: [number, number]
        gender?: 'm' | 'f' | 'mixed'
        income?: 'low' | 'mid' | 'high' | 'mixed'
        location?: string
        familyStatus?: string
    }
    psychographics?: {
        values?: string[]
        interests?: string[]
        lifestyle?: string
    }
    painPoints?: string[]
    decisionTriggers?: string[]
    channelPreferences?: Array<'search' | 'display' | 'youtube' | 'meta' | 'tiktok' | 'whatsapp' | 'phone' | 'walk_in' | 'email'>
    objections?: string[]
    messageHooks?: string[]
    avatarUrl?: string
}

export interface BrandAudienceTier {
    personas?: { items: BrandPersona[] } & BrandKeyMeta
    targetMarket?: { description: BilingualText } & BrandKeyMeta
}

// ─── Tier 5 — Compliance & legal ───────────────────────────────────────────

export interface BrandCompliance {
    disclaimers?: BilingualText[]          // "₪29.9/m³ subject to availability"
    regulatory?: {                         // required disclosures by industry
        industry?: string
        statements?: BilingualText[]
    }
    trademarks?: Array<{ mark: string; type: 'TM' | 'R' | 'C' }>
    dataPrivacy?: {
        gdprCompliant?: boolean
        israelPrivacyLaw?: boolean
        privacyPolicyUrl?: string
        cookiePolicyUrl?: string
    }
    accessibility?: {
        wcagLevel?: 'A' | 'AA' | 'AAA'
        targetCompliance?: BilingualText[]
    }
}

export interface BrandComplianceTier {
    compliance?: BrandCompliance & BrandKeyMeta
}

// ─── Tier 6 — Channel-specific assets ──────────────────────────────────────

export interface ChannelAssetEntry {
    url: string
    width: number
    height: number
    format: string
    intendedUsage?: string
    auto_generated?: boolean
}

export interface BrandChannelAssets {
    googleAds?: {
        responsiveSearchAd?: { square?: ChannelAssetEntry; landscape?: ChannelAssetEntry }
        displayBanner?: {                  // Google standard sizes
            '300x250'?: ChannelAssetEntry
            '728x90'?: ChannelAssetEntry
            '320x50'?: ChannelAssetEntry
            '320x100'?: ChannelAssetEntry
            '160x600'?: ChannelAssetEntry
            '300x600'?: ChannelAssetEntry
            '970x90'?: ChannelAssetEntry
            '970x250'?: ChannelAssetEntry
        }
        performanceMax?: {
            logos?: ChannelAssetEntry[]    // min 5
            images?: ChannelAssetEntry[]   // min 5 portrait + 5 landscape
            videos?: ChannelAssetEntry[]   // min 5 vertical
            headlines?: BilingualText[]
            descriptions?: BilingualText[]
        }
        demandGen?: {
            squareImages?: ChannelAssetEntry[]
            portraitVideos?: ChannelAssetEntry[]
            carouselImages?: ChannelAssetEntry[]
        }
    }
    youtube?: {
        thumbnail1280x720?: ChannelAssetEntry
        channelBanner2560x1440?: ChannelAssetEntry
    }
    meta?: {
        facebook?: {
            profile360?: ChannelAssetEntry
            cover851x315?: ChannelAssetEntry
            post1200x630?: ChannelAssetEntry
        }
        instagram?: {
            profile320?: ChannelAssetEntry
            post1080?: ChannelAssetEntry
            story1080x1920?: ChannelAssetEntry
            reel1080x1920?: ChannelAssetEntry
        }
    }
    tiktok?: { vertical1080x1920?: ChannelAssetEntry }
    linkedin?: { banner1584x396?: ChannelAssetEntry; post1200x627?: ChannelAssetEntry }
    email?: { header600x200?: ChannelAssetEntry; footerSignature?: ChannelAssetEntry }
}

export interface BrandChannelAssetsTier {
    channelAssets?: BrandChannelAssets & BrandKeyMeta
}

// ─── Top-level Brand Book v2 ───────────────────────────────────────────────

export interface BrandBookV2 {
    version: number
    status: 'draft' | 'pending_approval' | 'approved' | 'archived'
    schemaVersion: 2
    instanceId: string
    createdAt: string
    updatedAt: string
    approvedAt?: string
    approvedByUserId?: string

    /** Source flow — how this version was started */
    sourceFlow: 'uploaded' | 'website_scan' | 'mixed' | 'imported_from_v1'
    /** Override flag — true if client started from scratch (deletes prior data) */
    startedFromScratch?: boolean

    identity: BrandIdentityTier
    visual: BrandVisualTier
    voice: BrandVoiceTier
    audience: BrandAudienceTier
    compliance: BrandComplianceTier
    channelAssets: BrandChannelAssetsTier

    /** Quality gates — checklist that must all pass to approve */
    qualityGates?: {
        passed: boolean
        items: Array<{ key: string; passed: boolean; reason?: string }>
    }

    /** Confidence overall — derived from per-key confidence scores */
    overallConfidence?: BrandKeyConfidence

    /** PDF auto-export */
    pdfUrl?: string
    pdfGeneratedAt?: string
}

// ─── Quality gates definition ──────────────────────────────────────────────

export interface QualityGateCheck {
    key: string
    label: string
    /** Hebrew label for client UI */
    labelHe: string
    severity: 'critical' | 'recommended'
    /** Function returns true if passed */
    check: (b: BrandBookV2) => boolean
}

export const QUALITY_GATES: QualityGateCheck[] = [
    {
        key: 'tier1.businessName',
        label: 'Business name',
        labelHe: 'שם העסק',
        severity: 'critical',
        check: b => !!b.identity.businessName?.he || !!b.identity.businessName?.en,
    },
    // tagline + positioning relaxed to recommended — many real businesses don't
    // have a written tagline/positioning. Reflect-not-invent: accept what exists.
    {
        key: 'tier1.tagline',
        label: 'Tagline',
        labelHe: 'סלוגן',
        severity: 'recommended',
        check: b => !!b.identity.tagline?.he || !!b.identity.tagline?.en,
    },
    {
        key: 'tier1.positioning',
        label: 'Positioning statement',
        labelHe: 'הצהרת מיצוב',
        severity: 'recommended',
        check: b => !!(b.identity.positioningStatement?.he || b.identity.positioningStatement?.en),
    },
    {
        key: 'tier2.logo.primary',
        label: 'Primary logo uploaded',
        labelHe: 'לוגו ראשי הועלה',
        severity: 'critical',
        check: b => !!b.visual.logo?.primary?.url,
    },
    {
        key: 'tier2.colors.primary',
        label: 'Primary color',
        labelHe: 'צבע ראשי',
        severity: 'critical',
        check: b => !!b.visual.colors?.primary?.hex,
    },
    // Color min-set relaxed: a site may only expose 1-2 brand colors. Don't
    // block — surface as recommended so user knows.
    {
        key: 'tier2.colors.minSet',
        label: 'At least 2 colors total',
        labelHe: 'לפחות 2 צבעים סה"כ (מומלץ 3+)',
        severity: 'recommended',
        check: b => {
            const c = b.visual.colors
            const total = (c?.primary ? 1 : 0) + (c?.secondary?.length || 0) + (c?.accent?.length || 0) + (c?.neutral?.length || 0)
            return total >= 2
        },
    },
    // Hebrew font relaxed: scanner uses heuristic — may miss fonts on
    // some sites. Default Heebo will be applied downstream.
    {
        key: 'tier2.typography.he',
        label: 'Hebrew primary font',
        labelHe: 'גופן עברי ראשי',
        severity: 'recommended',
        check: b => !!b.visual.typography?.primaryFontHe?.family,
    },
    {
        key: 'tier3.voice.tone',
        label: 'Voice tone defined',
        labelHe: 'טון קול מוגדר',
        severity: 'critical',
        check: b => {
            const ts: any = b.voice.voice?.toneSummary
            return !!(b.voice.voice?.tone || ts?.he || ts?.en || (typeof ts === 'string' && ts.length > 0))
        },
    },
    // Principles + vocabulary relaxed: small sites yield fewer extractable
    // patterns. Surface as recommended, not blockers.
    {
        key: 'tier3.voice.principles',
        label: 'Voice principles ≥1',
        labelHe: 'עקרונות טון (לפחות 1)',
        severity: 'recommended',
        check: b => (b.voice.voice?.principles?.length || 0) >= 1,
    },
    {
        key: 'tier3.voice.vocabulary',
        label: 'Vocabulary terms ≥3',
        labelHe: 'אוצר מילים מאושר (לפחות 3 מונחים)',
        severity: 'recommended',
        check: b => (b.voice.voice?.vocabulary?.approved?.length || 0) >= 3,
    },
    // Personas relaxed: derived (not always extractable from a small site).
    // Recommended to keep marketing pipeline functional but not block approval.
    {
        key: 'tier4.persona',
        label: 'At least 1 audience persona',
        labelHe: 'לפחות פרסונה אחת',
        severity: 'recommended',
        check: b => (b.audience.personas?.items?.length || 0) >= 1,
    },
    // Recommended (don't block but flag)
    {
        key: 'tier2.logo.icon',
        label: 'Icon-only logo (favicon-ready)',
        labelHe: 'גרסת אייקון של לוגו',
        severity: 'recommended',
        check: b => !!b.visual.logo?.icon?.url,
    },
    {
        key: 'tier2.logo.monochrome',
        label: 'Monochrome logo variants',
        labelHe: 'גרסאות מונוכרום של לוגו',
        severity: 'recommended',
        check: b => !!(b.visual.logo?.monochromeBlack?.url || b.visual.logo?.monochromeWhite?.url),
    },
    {
        key: 'tier3.messaging.boilerplate',
        label: 'Boilerplate paragraph',
        labelHe: 'פסקת About אחת',
        severity: 'recommended',
        check: b => !!(b.voice.messaging?.boilerplate?.he || b.voice.messaging?.boilerplate?.en),
    },
    {
        key: 'tier5.compliance.disclaimers',
        label: 'Compliance disclaimers (if industry requires)',
        labelHe: 'הסתייגויות חוקיות',
        severity: 'recommended',
        check: b => (b.compliance.compliance?.disclaimers?.length || 0) >= 1,
    },
]

export function evaluateQualityGates(book: BrandBookV2): {
    passed: boolean
    criticalFailed: string[]
    recommendedFailed: string[]
    items: Array<{ key: string; passed: boolean; severity: 'critical' | 'recommended'; labelHe: string }>
} {
    const items = QUALITY_GATES.map(g => ({
        key: g.key,
        labelHe: g.labelHe,
        severity: g.severity,
        passed: g.check(book),
    }))
    const criticalFailed = items.filter(i => i.severity === 'critical' && !i.passed).map(i => i.key)
    const recommendedFailed = items.filter(i => i.severity === 'recommended' && !i.passed).map(i => i.key)
    return {
        passed: criticalFailed.length === 0,
        criticalFailed,
        recommendedFailed,
        items,
    }
}

// ─── Confidence aggregation ────────────────────────────────────────────────

/** Walk the book object collecting all `confidence` fields, return overall */
export function deriveOverallConfidence(book: BrandBookV2): BrandKeyConfidence {
    const confidences: BrandKeyConfidence[] = []
    function walk(obj: any) {
        if (!obj || typeof obj !== 'object') return
        if (typeof obj.confidence === 'string' && ['high', 'medium', 'low'].includes(obj.confidence)) {
            confidences.push(obj.confidence as BrandKeyConfidence)
        }
        for (const v of Object.values(obj)) walk(v)
    }
    walk(book.identity)
    walk(book.visual)
    walk(book.voice)
    walk(book.audience)
    walk(book.compliance)
    walk(book.channelAssets)
    if (confidences.length === 0) return 'low'
    const lowCount = confidences.filter(c => c === 'low').length
    const highCount = confidences.filter(c => c === 'high').length
    if (lowCount > confidences.length / 3) return 'low'
    if (highCount > confidences.length / 2) return 'high'
    return 'medium'
}
