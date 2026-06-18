/**
 * Tracking Conflict Resolver — makes analytics setup CONFLICT-AWARE.
 *
 * The MS (Moving Station) cleanup exposed the gap: the GTM install flow only
 * checks whether OUR container is on the site — it never detects a FOREIGN
 * container (e.g. one injected by PixelYourSite) or a competing tracking plugin.
 * A blind "install our snippet" then yields a DOUBLE GTM / double-GA4.
 *
 * This service:
 *   1. detectTrackingConflicts() — read-only: scans the LIVE site (cache-busted)
 *      for every GTM container + asks the companion which tracking plugins are
 *      active (PixelYourSite / GTM4WP / Site Kit / Google-for-Woo …). Flags a
 *      conflict when a non-ours container or a competing sender is present.
 *   2. resolveTrackingConflict(mode) — the user's fork:
 *        • 'integrate' — keep the existing plugin (and its Meta/Woo), but point
 *          its GTM container at OURS (companion set-plugin-gtm-container). Least
 *          destructive. Needs companion ≥ the version that ships that endpoint.
 *        • 'replace'   — deactivate the competing tracking, install only ours
 *          (what we did for MS). Full control; loses the competitor's features.
 *
 * Reuses the existing companion endpoints — no new infra. Cache-busted reads
 * (nginx caches the WP root → plain scans are stale).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { loadWpConfig } from '@/services/seoMetaBatch'
import {
    probeTrackingAudit, disablePluginTrackingFeature, installGtmSnippet,
    setPluginGtmContainer, scanSiteHtmlForGtm,
} from '@/services/wpCompanionInstaller'
import { buildGtmHeadSnippet, buildGtmBodySnippet } from '@/services/mazhirGtmSetup'

export interface CompetingPlugin {
    plugin: string
    name: string
    ownsGtm: boolean       // injects its own GTM container
    ownsMeta: boolean      // runs a Meta/Facebook pixel (don't lose on replace)
    sends: string[]        // 'gtm' | 'ga4' | 'google_ads' | 'meta_pixel' …
    resolutionHint: string
}
export interface TrackingConflictReport {
    ok: boolean
    reason?: string
    siteUrl: string
    ourPublicId: string | null
    siteContainers: string[]      // every GTM- on the live page (cache-busted)
    foreignContainers: string[]   // site containers that are NOT ours
    competingPlugins: CompetingPlugin[]
    hasConflict: boolean
    recommendedMode: 'integrate' | 'replace' | 'none'
    canIntegrate: boolean         // companion exposes set-plugin-gtm-container
}

async function ctx(instanceId: string, agentId: string | null | undefined) {
    const agent = agentId
        ? (await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)))[0]
        : (await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId)))[0]
    const rd: any = agent?.researchData || {}
    const siteUrl: string = rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl || ''
    const ourPublicId: string | null = rd.mazhirGtm?.target?.publicId || null
    const cfg = await loadWpConfig(instanceId, agent?.id || null)
    return { agent, rd, siteUrl, ourPublicId, cfg }
}

// Cache-busted GTM scan (nginx caches the WP root).
async function liveContainers(siteUrl: string): Promise<string[]> {
    const u = siteUrl.includes('?') ? `${siteUrl}&cb=${Date.now()}` : `${siteUrl}?cb=${Date.now()}`
    const scan = await scanSiteHtmlForGtm(u).catch(() => null)
    return (scan as any)?.gtmIds || []
}

// ─── 1. detection (read-only) ────────────────────────────────────────────────

export async function detectTrackingConflicts(instanceId: string, agentId?: string | null): Promise<TrackingConflictReport> {
    const { siteUrl, ourPublicId, cfg } = await ctx(instanceId, agentId)
    const base: TrackingConflictReport = {
        ok: false, siteUrl, ourPublicId, siteContainers: [], foreignContainers: [],
        competingPlugins: [], hasConflict: false, recommendedMode: 'none', canIntegrate: false,
    }
    if (!siteUrl) return { ...base, reason: 'no_site_url' }

    const siteContainers = await liveContainers(siteUrl)
    const foreignContainers = ourPublicId ? siteContainers.filter(c => c !== ourPublicId) : siteContainers

    // Competing plugins — the companion's tracking-audit knows PYS/GTM4WP/SiteKit/Woo.
    const competingPlugins: CompetingPlugin[] = []
    let canIntegrate = false
    if (cfg) {
        const audit: any = await probeTrackingAudit(cfg).catch(() => null)
        for (const d of (audit?.detected || [])) {
            const sends = (d.sends || []).map((s: any) => s.platform || '').filter(Boolean)
            // ownsGtm strictly = the plugin injects a GTM container (audit says so).
            const ownsGtm = sends.includes('gtm')
            const ownsMeta = sends.includes('meta_pixel') || /pixelyoursite/i.test(d.plugin)
            competingPlugins.push({ plugin: d.plugin, name: d.name, ownsGtm, ownsMeta, sends, resolutionHint: d.resolutionHint || '' })
        }
        // does this companion expose the integrate endpoint?
        canIntegrate = await setPluginGtmContainer(cfg, '__probe__', 'GTM-PROBE', { probe: true }).then(r => !!r.supported).catch(() => false)
    }

    // The reliable double-GTM signal is a FOREIGN container actually on the page.
    // Plugin "sends" from the audit list capability (incl. disabled features) →
    // too noisy to block on; we keep them as informational context only.
    const hasConflict = foreignContainers.length > 0
    // recommend integrate when a competing plugin also runs Meta (replacing would
    // drop the Meta pixel) AND we can point it at our container; else replace.
    const hasMeta = competingPlugins.some(p => p.ownsMeta)
    const recommendedMode: TrackingConflictReport['recommendedMode'] = !hasConflict ? 'none'
        : (hasMeta && canIntegrate) ? 'integrate' : 'replace'

    return { ...base, ok: true, siteContainers, foreignContainers, competingPlugins, hasConflict, recommendedMode, canIntegrate }
}

// ─── 2. resolution (the fork) ────────────────────────────────────────────────

export interface ConflictResolveResult {
    ok: boolean
    mode: 'integrate' | 'replace'
    error?: string
    actions: string[]
    siteContainersAfter: string[]
    clean: boolean   // exactly one container on site == ours
}

export async function resolveTrackingConflict(
    instanceId: string, agentId: string | null | undefined, mode: 'integrate' | 'replace',
): Promise<ConflictResolveResult> {
    const { siteUrl, ourPublicId, cfg } = await ctx(instanceId, agentId)
    const out: ConflictResolveResult = { ok: false, mode, actions: [], siteContainersAfter: [], clean: false }
    if (!cfg) { out.error = 'wordpress_not_connected'; return out }
    if (!ourPublicId) { out.error = 'no_target_container — pick/create our GTM container first'; return out }

    const det = await detectTrackingConflicts(instanceId, agentId)
    const head = buildGtmHeadSnippet(ourPublicId), body = buildGtmBodySnippet(ourPublicId)

    // For the RESOLUTION action (the user explicitly chose a mode), attribute
    // the foreign container to a known GTM-injecting plugin by name too — the
    // audit's `sends:['gtm']` is unreliable (PixelYourSite stores GTM inside
    // pys_core_settings and may not surface it). This name list is only used to
    // ACT on the user's choice, never to raise a false-positive conflict.
    const isGtmOwner = (p: CompetingPlugin) => p.ownsGtm
        || /pixelyoursite|gtm4wp|duracelltomi|site.?kit|tag.?manager|google.?tag.?manager/i.test(p.plugin + ' ' + p.name)

    if (mode === 'integrate') {
        // Point each GTM-owning competing plugin at OUR container; keep the plugin.
        const owners = det.competingPlugins.filter(isGtmOwner)
        if (!owners.length) {
            // no plugin owns GTM — just install ours via companion
            const r = await installGtmSnippet(cfg, ourPublicId, head, body)
            out.actions.push(`install our container (${ourPublicId}): ${r.ok ? 'ok' : r.error}`)
        }
        for (const p of owners) {
            const r = await setPluginGtmContainer(cfg, p.plugin, ourPublicId, {}).catch(e => ({ ok: false, error: (e as Error).message, supported: false }))
            if (!(r as any).supported) { out.error = 'companion_too_old_for_integrate — update the companion plugin or use Replace'; out.actions.push(`${p.name}: integrate endpoint not available`); return finalize(out, siteUrl, ourPublicId) }
            out.actions.push(`${p.name}: GTM container → ${ourPublicId} (${(r as any).ok ? 'ok' : (r as any).error})`)
        }
    } else {
        // REPLACE: neutralize competing tracking, then install only ours.
        for (const p of det.competingPlugins) {
            if (isGtmOwner(p)) {
                // a GTM-owning plugin (e.g. PixelYourSite) injects its container from
                // its own settings → deactivate it entirely (keeps the site working;
                // its Meta goes too — that's the Replace trade-off).
                const r = await disablePluginTrackingFeature(cfg, p.plugin, 'deactivate_plugin').catch(e => ({ ok: false, changes: [(e as Error).message] }))
                out.actions.push(`deactivate ${p.name}: ${(r as any).ok ? 'ok' : 'failed'}`)
            } else {
                // gtag-only plugin (e.g. Google for WooCommerce) — disable its
                // GA4 + Ads sends to avoid double-count; leave the plugin active.
                for (const feat of ['ga4', 'google_ads'] as const) {
                    if (p.sends.includes(feat)) {
                        await disablePluginTrackingFeature(cfg, p.plugin, feat).catch(() => null)
                        out.actions.push(`${p.name}: disabled ${feat}`)
                    }
                }
            }
        }
        const r = await installGtmSnippet(cfg, ourPublicId, head, body)
        out.actions.push(`install our container (${ourPublicId}): ${r.ok ? 'ok' : r.error}`)
    }

    return finalize(out, siteUrl, ourPublicId)
}

async function finalize(out: ConflictResolveResult, siteUrl: string, ourPublicId: string): Promise<ConflictResolveResult> {
    await new Promise(r => setTimeout(r, 3500))
    out.siteContainersAfter = await liveContainers(siteUrl)
    out.clean = out.siteContainersAfter.length === 1 && out.siteContainersAfter[0] === ourPublicId
    out.ok = !out.error && (out.clean || out.siteContainersAfter.includes(ourPublicId))
    return out
}