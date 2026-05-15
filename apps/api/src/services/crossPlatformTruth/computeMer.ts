/**
 * Cross-platform MER (Marketing Efficiency Ratio) computation.
 *
 * Phase 4.4 — the north-star metric. Two flavors:
 *   - MER          = total revenue ÷ total ad spend (all paid platforms summed)
 *   - aMER (proxy) = same, but only "high-intent acquisition" events count as revenue
 *
 * Two perspectives on revenue, both surfaced side-by-side:
 *   - revenueClaimedIls   = sum of conversion_value_ils from PAID platforms
 *                           (meta/google_ads/microsoft_ads/tiktok/linkedin).
 *                           Will DOUBLE-COUNT when two platforms claim the
 *                           same conversion under different attribution
 *                           windows. This is the "best case" platforms tell
 *                           themselves.
 *   - revenueObservedIls  = GA4 (or other observed-channel) reported revenue,
 *                           net of attribution overlap. The honest number.
 *                           NULL when GA4 isn't connected.
 *
 * The doubleCountGapPct exposes how much platforms are over-claiming. If
 * platforms claim 2× what GA4 actually saw, the gap is +100% — that's the
 * single most-actionable cross-platform truth signal a paid-track owner can
 * see, and it's also the trigger for the geo-experiment hypothesis.
 *
 * aMER notes: real aMER (acquisition MER — new-customer revenue only) needs
 * first_purchase event tagging that most accounts don't have. We approximate
 * it by filtering to high-intent acquisition events (purchase, lead, signup,
 * subscribe, complete_registration). This excludes pure top-of-funnel
 * (messaging_conversation_started, page_view, add_to_cart) that inflates
 * claimed efficiency. Not perfect, but directionally honest.
 */

import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'

const MIN_QUALITY = '0.200'

const PAID_PLATFORMS = ['meta', 'google_ads', 'microsoft_ads', 'tiktok', 'linkedin'] as const
const OBSERVED_CHANNELS = ['ga4'] as const  // extend with 'shopify', 'server_side' later

// High-intent acquisition events — counted toward aMER.
// Mid/low-intent (messaging_conversation_started, view_content, add_to_cart,
// page_view) get excluded from aMER but stay in MER.
const HIGH_INTENT_EVENTS = new Set([
    'purchase',
    'subscribe',
    'lead',
    'complete_registration',
    'sign_up',
    'signup',
    'start_trial',
    'submit_application',
    'schedule',
    'contact',
])

export interface MerPlatformRow {
    platform: string
    spendIls: number
    revenueClaimedIls: number
    revenueAcquisitionIls: number       // high-intent events only
    conversions: number                 // platform-claimed conversion COUNT
    roasClaimed: number                 // revenueClaimedIls / spendIls
    share: number                       // share of total spend
    eventNames: string[]
}

export interface MerResult {
    windowDays: number
    asOf: string                        // ISO timestamp

    // ── Totals ────────────────────────────────────────────────────────────
    spendTotalIls: number
    revenueClaimedIls: number           // sum across paid platforms
    revenueObservedIls: number | null   // from observed channel (GA4)
    revenueAcquisitionClaimedIls: number
    revenueAcquisitionObservedIls: number | null

    // ── Ratios ────────────────────────────────────────────────────────────
    mer: number | null                  // revenueClaimedIls / spendTotalIls
    merObserved: number | null
    aMer: number | null
    aMerObserved: number | null

    // ── Truth gap ─────────────────────────────────────────────────────────
    doubleCountGapPct: number | null    // (claimed - observed) / observed × 100
    aMerGapPct: number | null

    // ── Per-platform breakdown ────────────────────────────────────────────
    platformBreakdown: MerPlatformRow[]

    // ── Quality flags ─────────────────────────────────────────────────────
    quality: {
        hasObservedChannel: boolean
        observedChannel: string | null
        paidPlatformsActive: number
        rowsCount: number
        spendTotalIsZero: boolean
    }
}

interface RawRow {
    platform: string
    spendIls: string | number | null
    conversions: string | number | null
    conversionValueIls: string | number | null
    conversionEventName: string | null
}

function num(v: string | number | null | undefined): number {
    if (v === null || v === undefined) return 0
    const n = typeof v === 'string' ? parseFloat(v) : v
    return Number.isFinite(n) ? n : 0
}

function isHighIntent(eventName: string | null): boolean {
    if (!eventName) return false
    return HIGH_INTENT_EVENTS.has(eventName.toLowerCase())
}

export async function computeMer(instanceId: string, windowDays: number = 30): Promise<MerResult> {
    const since = new Date(Date.now() - windowDays * 86400 * 1000)

    // Pull per-row aggregates for the window, by platform + event.
    // Quality floor (>= 0.2) keeps obviously-garbage rows out.
    const rows: RawRow[] = await db
        .select({
            platform: ingestedDataPoints.platform,
            spendIls: sql<string>`SUM(${ingestedDataPoints.spendIls})`,
            conversions: sql<string>`SUM(${ingestedDataPoints.conversions})`,
            conversionValueIls: sql<string>`SUM(${ingestedDataPoints.conversionValueIls})`,
            conversionEventName: ingestedDataPoints.conversionEventName,
        })
        .from(ingestedDataPoints)
        .where(and(
            eq(ingestedDataPoints.instanceId, instanceId),
            gte(ingestedDataPoints.periodEnd, since),
            sql`${ingestedDataPoints.qualityScore} >= ${MIN_QUALITY}`,
            sql`${ingestedDataPoints.supersededAt} IS NULL`,
        ))
        .groupBy(ingestedDataPoints.platform, ingestedDataPoints.conversionEventName)

    // Bucket by platform; track per-event high-intent split.
    const paidByPlatform = new Map<string, MerPlatformRow>()
    let revenueObservedIls = 0
    let revenueAcquisitionObservedIls = 0
    let hasObservedChannel = false
    let observedChannel: string | null = null

    for (const r of rows) {
        const p = r.platform
        const spend = num(r.spendIls)
        const revenue = num(r.conversionValueIls)
        const convs = num(r.conversions)
        const high = isHighIntent(r.conversionEventName)

        if ((OBSERVED_CHANNELS as readonly string[]).includes(p)) {
            // GA4 / observed channel — these are canonical revenue numbers.
            // They typically have spend=0 (analytics tools don't run ads).
            revenueObservedIls += revenue
            if (high) revenueAcquisitionObservedIls += revenue
            hasObservedChannel = true
            observedChannel = p
            continue
        }

        if (!(PAID_PLATFORMS as readonly string[]).includes(p)) continue

        let row = paidByPlatform.get(p)
        if (!row) {
            row = {
                platform: p,
                spendIls: 0,
                revenueClaimedIls: 0,
                revenueAcquisitionIls: 0,
                conversions: 0,
                roasClaimed: 0,
                share: 0,
                eventNames: [],
            }
            paidByPlatform.set(p, row)
        }
        row.spendIls += spend
        row.revenueClaimedIls += revenue
        if (high) row.revenueAcquisitionIls += revenue
        row.conversions += convs
        if (r.conversionEventName && !row.eventNames.includes(r.conversionEventName)) {
            row.eventNames.push(r.conversionEventName)
        }
    }

    const platformBreakdown = Array.from(paidByPlatform.values())
    const spendTotalIls = platformBreakdown.reduce((s, r) => s + r.spendIls, 0)
    const revenueClaimedIls = platformBreakdown.reduce((s, r) => s + r.revenueClaimedIls, 0)
    const revenueAcquisitionClaimedIls = platformBreakdown.reduce((s, r) => s + r.revenueAcquisitionIls, 0)

    // Per-platform derived
    for (const row of platformBreakdown) {
        row.roasClaimed = row.spendIls > 0 ? row.revenueClaimedIls / row.spendIls : 0
        row.share = spendTotalIls > 0 ? row.spendIls / spendTotalIls : 0
    }
    platformBreakdown.sort((a, b) => b.spendIls - a.spendIls)

    const spendIsZero = spendTotalIls <= 0
    const mer = spendIsZero ? null : revenueClaimedIls / spendTotalIls
    const merObserved = (spendIsZero || !hasObservedChannel) ? null : revenueObservedIls / spendTotalIls
    const aMer = spendIsZero ? null : revenueAcquisitionClaimedIls / spendTotalIls
    const aMerObserved = (spendIsZero || !hasObservedChannel) ? null : revenueAcquisitionObservedIls / spendTotalIls

    const doubleCountGapPct = (hasObservedChannel && revenueObservedIls > 0)
        ? ((revenueClaimedIls - revenueObservedIls) / revenueObservedIls) * 100
        : null
    const aMerGapPct = (hasObservedChannel && revenueAcquisitionObservedIls > 0)
        ? ((revenueAcquisitionClaimedIls - revenueAcquisitionObservedIls) / revenueAcquisitionObservedIls) * 100
        : null

    return {
        windowDays,
        asOf: new Date().toISOString(),
        spendTotalIls,
        revenueClaimedIls,
        revenueObservedIls: hasObservedChannel ? revenueObservedIls : null,
        revenueAcquisitionClaimedIls,
        revenueAcquisitionObservedIls: hasObservedChannel ? revenueAcquisitionObservedIls : null,
        mer,
        merObserved,
        aMer,
        aMerObserved,
        doubleCountGapPct,
        aMerGapPct,
        platformBreakdown,
        quality: {
            hasObservedChannel,
            observedChannel,
            paidPlatformsActive: platformBreakdown.filter(p => p.spendIls > 0).length,
            rowsCount: rows.length,
            spendTotalIsZero: spendIsZero,
        },
    }
}