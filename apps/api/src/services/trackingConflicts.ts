/**
 * Tracking conflict analyzer — Phase 2026.02 Block 6 K8
 *
 * Given a TrackingAuditResult from the companion plugin AND our GTM
 * target's known tracking IDs (AW-XXX, G-XXXX, fbq pixelIds), classify
 * conflicts by severity:
 *
 *   critical  — same conversion event sent by multiple sources to the
 *               SAME platform tag (e.g. PYS + GTM both sending AW-12345
 *               purchase). Guaranteed double-counting.
 *   high      — same platform integrated through multiple plugins with
 *               different IDs (e.g. GA4 G-AAA via Site Kit + G-BBB via
 *               GTM). Data fragmentation.
 *   medium    — additional GTM container (GTM4WP) loading alongside ours.
 *               Tags don't directly conflict but load order/scope unclear.
 *   info      — independent tracker (Pinterest only) — surfaced for
 *               transparency, not actionable.
 */

import type { TrackingAuditResult, SiteTrackingScan } from './wpCompanionInstaller'

export interface ConflictFinding {
    severity: 'critical' | 'high' | 'medium' | 'info'
    platform: 'meta_pixel' | 'google_ads' | 'ga4' | 'gtm' | 'pinterest' | 'tiktok'
    summary: string
    detail: string
    sources: Array<{ plugin: string; id: string; feature: string }>
    autoFixable: boolean
    autoFixAction?: { plugin: string; feature: string }
    // Optional fallback action: full plugin deactivation when surgical disable
    // isn't possible (option keys unknown / slug rebrand / etc).
    // Includes warning text about what user will lose.
    fallbackAction?: { plugin: string; feature: 'deactivate_plugin'; warning: string }
}

export interface ConflictAnalysis {
    conflicts: ConflictFinding[]
    counts: { critical: number; high: number; medium: number; info: number }
    summary: string                    // one-line headline e.g. "2 critical, 1 high — fix before relying on data"
    cleanState: boolean                // true when 0 critical/high — safe to rely on tracking
}

export interface OurTrackingState {
    gtmPublicId: string                // GTM-XXXXX (our container)
    googleAdsConversionId?: string     // e.g. "17607235092" (without AW- prefix)
    ga4MeasurementId?: string          // e.g. "G-0NDSJ43XPF"
    metaPixelId?: string               // if we wired one via GTM
}

const PLATFORM_NAMES: Record<ConflictFinding['platform'], string> = {
    meta_pixel: 'Meta Pixel',
    google_ads: 'Google Ads',
    ga4: 'GA4',
    gtm: 'GTM',
    pinterest: 'Pinterest',
    tiktok: 'TikTok',
}

function normalizeAwId(raw: string): string {
    return String(raw || '').replace(/^AW-/i, '').replace(/\D/g, '')
}

/**
 * Map a heuristic hint (from scanSiteHtmlForTrackingIds) to a known plugin
 * slug + warning text for the "deactivate entire plugin" fallback action.
 * Returns undefined when hint doesn't match a known plugin (e.g. theme
 * inline injection — can't deactivate a theme via this plugin).
 */
function hintToFallbackAction(hint: string): { plugin: string; feature: 'deactivate_plugin'; warning: string } | undefined {
    const h = (hint || '').toLowerCase()
    if (h.includes('google for woocommerce') || h.includes('google-listings-and-ads') || h.includes('google listings')) {
        return {
            plugin: 'google-listings-and-ads',
            feature: 'deactivate_plugin',
            warning: '⚠ Deactivating "Google for WooCommerce" also disables: product feed sync to Google Merchant Center (your products will stop appearing in Google Shopping), Performance Max integration, ad campaign management UI. Only deactivate if you do NOT use these features.',
        }
    }
    if (h.includes('pixelyoursite') || h.includes('pys ')) {
        return {
            plugin: 'pixelyoursite',
            feature: 'deactivate_plugin',
            warning: '⚠ Deactivating "PixelYourSite" also disables: Facebook Pixel, TikTok Pixel, Pinterest Tag, Bing UET (if configured). Prefer surgical "Disable google_ads" if available.',
        }
    }
    if (h.includes('monsterinsights') || h.includes('exactmetrics')) {
        return {
            plugin: 'monsterinsights-lite',
            feature: 'deactivate_plugin',
            warning: '⚠ Deactivating MonsterInsights also disables: GA4 reports inside WordPress dashboard, custom dimensions, eCommerce tracking.',
        }
    }
    if (h.includes('site kit') || h.includes('googlesitekit')) {
        return {
            plugin: 'google-site-kit',
            feature: 'deactivate_plugin',
            warning: '⚠ Deactivating Site Kit also disables: Search Console widget, AdSense reports, PageSpeed Insights inside WP dashboard.',
        }
    }
    if (h.includes('gtm4wp') || h.includes('duracelltomi')) {
        return {
            plugin: 'duracelltomi-google-tag-manager',
            feature: 'deactivate_plugin',
            warning: '⚠ Deactivating GTM4WP removes its dataLayer extras (logged-in user data, WC ecommerce, post categories pushed automatically). Verify your custom triggers don\'t rely on them.',
        }
    }
    return undefined
}

export function analyzeTrackingConflicts(
    audit: TrackingAuditResult,
    ours: OurTrackingState,
    siteScan?: SiteTrackingScan,
): ConflictAnalysis {
    const conflicts: ConflictFinding[] = []
    const detected = audit.detected || []

    // ─── Google Ads conflict ────────────────────────────────────
    // Find ALL sources emitting AW conversions matching our id.
    const ourAwNorm = ours.googleAdsConversionId ? normalizeAwId(ours.googleAdsConversionId) : ''
    if (ourAwNorm) {
        const adsHits: Array<{ plugin: string; id: string; feature: string }> = []
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'google_ads' && normalizeAwId(s.id) === ourAwNorm) {
                    adsHits.push({ plugin: p.name, id: s.id, feature: s.feature })
                }
            }
        }
        // Our GTM also emits the same — so any plugin hit = duplicate
        if (adsHits.length > 0) {
            // Surgical-disable hint for first known plugin
            const target = detected.find(p =>
                p.sends.some(s => s.platform === 'google_ads' && normalizeAwId(s.id) === ourAwNorm)
            )
            const fixablePlugins = ['pixelyoursite', 'google-listings-and-ads']
            const fixable = target && fixablePlugins.includes(target.plugin)
            conflicts.push({
                severity: 'critical',
                platform: 'google_ads',
                summary: `Google Ads conversion AW-${ourAwNorm} sent by ${adsHits.length + 1} sources → double-counted`,
                detail: `Sources: GTM (our awct tag) + ${adsHits.map(h => `${h.plugin} (${h.feature})`).join(', ')}. Every purchase fires the conversion ${adsHits.length + 1}x — Smart Bidding optimizes on inflated signal. This is exactly the conv_value_pollution pattern (CR/CPA looks too good to be true). Disable Google Ads tracking in ONE source (recommend keeping GTM since it has Enhanced Conversions + Consent Mode bridging).`,
                sources: adsHits,
                autoFixable: !!fixable,
                autoFixAction: fixable && target ? { plugin: target.plugin, feature: 'google_ads' } : undefined,
            })
        }
    }

    // ─── GA4 conflict ───────────────────────────────────────────
    if (ours.ga4MeasurementId) {
        const gaHits: Array<{ plugin: string; id: string; feature: string }> = []
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'ga4') {
                    gaHits.push({ plugin: p.name, id: s.id, feature: s.feature })
                }
            }
        }
        const sameIdHits = gaHits.filter(h => h.id === ours.ga4MeasurementId)
        const otherIdHits = gaHits.filter(h => h.id !== ours.ga4MeasurementId)

        if (sameIdHits.length > 0) {
            const target = detected.find(p =>
                p.sends.some(s => s.platform === 'ga4' && s.id === ours.ga4MeasurementId)
            )
            const fixablePlugins = ['pixelyoursite', 'google-listings-and-ads',
                'monsterinsights-lite/googleanalytics.php',
                'google-analytics-for-wordpress/googleanalytics.php',
                'google-site-kit/google-site-kit.php']
            const fixable = target && fixablePlugins.some(fp => target.plugin.startsWith(fp.split('/')[0]))
            conflicts.push({
                severity: 'critical',
                platform: 'ga4',
                summary: `GA4 ${ours.ga4MeasurementId} sent by ${sameIdHits.length + 1} sources → duplicate page_views + events`,
                detail: `Sources: GTM (our googtag + gaawe) + ${sameIdHits.map(h => `${h.plugin} (${h.feature})`).join(', ')}. Same measurement_id → events deduped server-side BUT page_view fires twice from the user perspective, inflating engagement metrics. Disable GA4 in the non-GTM source.`,
                sources: sameIdHits,
                autoFixable: !!fixable,
                autoFixAction: fixable && target ? { plugin: target.plugin, feature: 'ga4' } : undefined,
            })
        }
        if (otherIdHits.length > 0) {
            conflicts.push({
                severity: 'high',
                platform: 'ga4',
                summary: `Multiple GA4 properties in play: ours=${ours.ga4MeasurementId}, others=${otherIdHits.map(h => h.id).join(', ')}`,
                detail: `Data fragmentation — analytics + reports will split across properties. Pick ONE GA4 property as source of truth; disable the others.`,
                sources: otherIdHits,
                autoFixable: false,
            })
        }
    }

    // ─── Meta Pixel conflict (if we wired one via GTM) ──────────
    if (ours.metaPixelId) {
        const pxHits: Array<{ plugin: string; id: string; feature: string }> = []
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'meta_pixel') {
                    pxHits.push({ plugin: p.name, id: s.id, feature: s.feature })
                }
            }
        }
        const sameIdHits = pxHits.filter(h => h.id === ours.metaPixelId)
        const otherIdHits = pxHits.filter(h => h.id !== ours.metaPixelId)

        if (sameIdHits.length > 0) {
            const target = detected.find(p =>
                p.sends.some(s => s.platform === 'meta_pixel' && s.id === ours.metaPixelId)
            )
            const fixable = !!target && target.plugin === 'pixelyoursite'
            conflicts.push({
                severity: 'critical',
                platform: 'meta_pixel',
                summary: `Meta Pixel ${ours.metaPixelId} initialized by ${sameIdHits.length + 1} sources → double events`,
                detail: `Sources: GTM (our fbq init + per-event tags) + ${sameIdHits.map(h => `${h.plugin} (${h.feature})`).join(', ')}. Each Purchase / AddToCart fires twice in Events Manager. Disable the plugin's Pixel.`,
                sources: sameIdHits,
                autoFixable: fixable,
                autoFixAction: fixable && target ? { plugin: target.plugin, feature: 'meta_pixel' } : undefined,
            })
        }
        if (otherIdHits.length > 0) {
            conflicts.push({
                severity: 'high',
                platform: 'meta_pixel',
                summary: `Different Meta Pixels active: ours=${ours.metaPixelId}, others=${otherIdHits.map(h => h.id).join(', ')}`,
                detail: `Multiple pixels → custom audiences split, ad relevance signal fragmented. Decide which pixel is authoritative.`,
                sources: otherIdHits,
                autoFixable: false,
            })
        }
    } else {
        // We haven't wired Meta yet but plugin already fires Meta Pixel.
        // Surface as info — not a conflict, just so user knows.
        const pxHits: Array<{ plugin: string; id: string; feature: string }> = []
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'meta_pixel') {
                    pxHits.push({ plugin: p.name, id: s.id, feature: s.feature })
                }
            }
        }
        if (pxHits.length > 0) {
            conflicts.push({
                severity: 'info',
                platform: 'meta_pixel',
                summary: `Meta Pixel(s) already active via plugin: ${pxHits.map(h => h.id).join(', ')}`,
                detail: `${pxHits.map(h => `${h.plugin}: ${h.id} (${h.feature})`).join('; ')}. If you later connect Meta in ClawFlow Integrations, the wizard will detect this and skip adding a second Pixel to avoid double-fire.`,
                sources: pxHits,
                autoFixable: false,
            })
        }
    }

    // ─── Additional GTM container ───────────────────────────────
    for (const p of detected) {
        for (const s of p.sends) {
            if (s.platform === 'gtm' && s.id !== ours.gtmPublicId) {
                conflicts.push({
                    severity: 'medium',
                    platform: 'gtm',
                    summary: `Second GTM container ${s.id} loads via ${p.name}`,
                    detail: `Two GTM containers loading on the same page → load order unpredictable, tags may fire twice if both have similar tags. Either deactivate ${p.name} OR replace its container ID with ours (${ours.gtmPublicId}).`,
                    sources: [{ plugin: p.name, id: s.id, feature: s.feature }],
                    autoFixable: p.plugin === 'duracelltomi-google-tag-manager',
                    autoFixAction: p.plugin === 'duracelltomi-google-tag-manager'
                        ? { plugin: p.plugin, feature: 'deactivate_plugin' }
                        : undefined,
                })
            }
        }
    }

    // ─── HTML-level direct gtag/fbq scan (catches plugins our PHP audit missed) ───
    // The /tracking-audit endpoint reads per-plugin wp_options keys, which
    // requires knowing the exact slug AND option storage shape. When that
    // misses (slug rebrand, custom option, theme-side injection), the
    // server-side HTML scan catches the actual <script src> + fbq init.
    // Filter out IDs already attributed to a detected plugin to avoid
    // double-counting; what's LEFT is "unknown source" — surface as
    // critical conflict with hint about which plugin/source.
    if (siteScan && ours.googleAdsConversionId) {
        const ourAwNorm2 = normalizeAwId(ours.googleAdsConversionId)
        const knownAwSources = new Set<string>()
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'google_ads') knownAwSources.add(normalizeAwId(s.id))
            }
        }
        const htmlAwHits = siteScan.directLoads.filter(d =>
            d.platform === 'google_ads' && normalizeAwId(d.id) === ourAwNorm2
        )
        const unattributedAw = htmlAwHits.filter(h => !knownAwSources.has(normalizeAwId(h.id)))
        if (unattributedAw.length > 0) {
            const headHint = unattributedAw[0].hint
            // Map hint → plugin slug to enable fallback "deactivate entire
            // plugin" action even when surgical disable isn't supported.
            const fallback = hintToFallbackAction(headHint)
            conflicts.push({
                severity: 'critical',
                platform: 'google_ads',
                summary: `Direct gtag/js?id=AW-${ourAwNorm2} loaded on site — source: ${headHint}`,
                detail: `HTML inspection found <script src="googletagmanager.com/gtag/js?id=AW-${ourAwNorm2}"> from ${headHint}. This script sends purchase conversions independently of our GTM awct → double-counted. Either disable tracking inside the plugin's settings UI, OR deactivate the entire plugin (see fallback action). Excerpt: …${unattributedAw[0].excerpt.slice(0, 200)}…`,
                sources: unattributedAw.map(h => ({ plugin: h.hint, id: h.id, feature: 'direct gtag/js conversion script' })),
                autoFixable: false,
                fallbackAction: fallback,
            })
        }
    }
    // Same idea for GA4
    if (siteScan && ours.ga4MeasurementId) {
        const knownGaSources = new Set<string>()
        for (const p of detected) {
            for (const s of p.sends) {
                if (s.platform === 'ga4') knownGaSources.add(s.id)
            }
        }
        const htmlGaHits = siteScan.directLoads.filter(d =>
            d.platform === 'ga4' && d.id === ours.ga4MeasurementId
        )
        const unattributedGa = htmlGaHits.filter(h => !knownGaSources.has(h.id))
        if (unattributedGa.length > 0) {
            conflicts.push({
                severity: 'critical',
                platform: 'ga4',
                summary: `Direct gtag/js?id=${ours.ga4MeasurementId} loaded — source not identified by plugin scan`,
                detail: `HTML found GA4 base gtag script unattributed to a detected plugin. Source hint: ${unattributedGa[0].hint}. Disable manually.`,
                sources: unattributedGa.map(h => ({ plugin: h.hint, id: h.id, feature: 'direct gtag/js GA4 script' })),
                autoFixable: false,
            })
        }
    }

    // ─── Pinterest (info-only) ──────────────────────────────────
    for (const p of detected) {
        for (const s of p.sends) {
            if (s.platform === 'pinterest') {
                conflicts.push({
                    severity: 'info',
                    platform: 'pinterest',
                    summary: `Pinterest Tag ${s.id} active via ${p.name}`,
                    detail: 'Independent tracker — no conflict with GTM unless you ALSO add a Pinterest tag via GTM Custom HTML.',
                    sources: [{ plugin: p.name, id: s.id, feature: s.feature }],
                    autoFixable: false,
                })
            }
        }
    }

    const counts = {
        critical: conflicts.filter(c => c.severity === 'critical').length,
        high: conflicts.filter(c => c.severity === 'high').length,
        medium: conflicts.filter(c => c.severity === 'medium').length,
        info: conflicts.filter(c => c.severity === 'info').length,
    }
    const cleanState = counts.critical === 0 && counts.high === 0

    let summary: string
    if (cleanState && counts.medium === 0) {
        summary = `✓ No tracking conflicts detected${counts.info > 0 ? ` (${counts.info} info notes)` : ''}`
    } else if (counts.critical > 0) {
        summary = `${counts.critical} critical${counts.high > 0 ? ` + ${counts.high} high` : ''} — fix before relying on conversion data`
    } else if (counts.high > 0) {
        summary = `${counts.high} high-severity — data fragmentation likely`
    } else {
        summary = `${counts.medium} medium — review`
    }

    // Sort by severity (critical first)
    const order = { critical: 0, high: 1, medium: 2, info: 3 }
    conflicts.sort((a, b) => order[a.severity] - order[b.severity])

    void PLATFORM_NAMES  // reserved for future per-platform summary
    return { conflicts, counts, summary, cleanState }
}