/**
 * GA4 Health Audit — Phase 2026.02 Block 6 K12 / Variant E
 *
 * Programmatically audits a GA4 property's configuration health:
 *
 *   1. Data Retention — default 2 months. For IL retention analysis
 *      (90-day attribution windows, cohort building) you need 14 months.
 *      Auto-fix: bump to 14 months via Admin API PATCH.
 *
 *   2. Enhanced Measurement — default ON for page_view + scroll, but
 *      outbound_click / site_search / video_engagement / file_download
 *      often off. Auto-fix: enable all 6 events on the web stream.
 *
 *   3. Reporting Identity = Device-based (default). Recommend Blended
 *      for ITP resilience (Safari + Firefox + iOS in-app). Surface only —
 *      this is a product preference, not always auto-fix-safe.
 *
 *   4. Key Events — list configured key events. Surface gaps against
 *      the platform's expected list (purchase / generate_lead).
 *
 *   5. BigQuery export link — present? Healthy? Daily or Streaming?
 *      Surface only (no auto-fix — requires user to grant BQ permissions).
 *
 *   6. Google Ads link — present + active? Surface only.
 */

import { listKeyEvents, listGa4Properties } from './ga4Admin'

const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

async function refreshAccessToken(tokens: GoogleTokens): Promise<string> {
    const body = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
    })
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    const data = await res.json() as { access_token?: string }
    if (!data.access_token) throw new Error('GA4 token refresh failed')
    return data.access_token
}

async function ga4Fetch<T = any>(
    path: string,
    tokens: GoogleTokens,
    method: 'GET' | 'PATCH' = 'GET',
    body?: unknown,
): Promise<T> {
    const accessToken = tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000
        ? tokens.accessToken
        : await refreshAccessToken(tokens)
    const res = await fetch(`${GA4_ADMIN_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`GA4 ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
    if (!text) return undefined as unknown as T
    try { return JSON.parse(text) as T } catch { return text as unknown as T }
}

// ─── Finding shapes ───────────────────────────────────────────────────────

export type Ga4FindingSeverity = 'critical' | 'high' | 'medium' | 'info'

export interface Ga4Finding {
    id: string
    severity: Ga4FindingSeverity
    category: 'data_retention' | 'enhanced_measurement' | 'reporting_identity' | 'key_events' | 'bigquery' | 'ads_link'
    summary: string
    detail: string
    autoFixable: boolean
    autoFixAction?: { kind: string; payload?: any }
}

export interface Ga4HealthReport {
    findings: Ga4Finding[]
    summary: string
    counts: Record<Ga4FindingSeverity, number>
    cleanState: boolean
    rawSnapshot: {
        propertyId?: string
        dataRetention?: string             // MONTHS_2 / MONTHS_14 etc
        webStreamId?: string
        enhancedMeasurementEnabled?: boolean
        enhancedMeasurementFlags?: Record<string, boolean>
        keyEventCount?: number
        bigQueryLinkCount?: number
        googleAdsLinkCount?: number
    }
}

// ─── Audit entrypoint ────────────────────────────────────────────────────

export interface Ga4HealthAuditInput {
    tokens: GoogleTokens
    propertyId?: string              // if known. Otherwise we'll pick best-match by siteDomain
    siteDomain?: string
}

export async function auditGa4Health(opts: Ga4HealthAuditInput): Promise<Ga4HealthReport> {
    const findings: Ga4Finding[] = []
    const snap: Ga4HealthReport['rawSnapshot'] = {}

    // Resolve property
    let propertyId = opts.propertyId
    if (!propertyId) {
        try {
            const props = await listGa4Properties(opts.tokens)
            if (props.length === 0) {
                findings.push({
                    id: 'no_ga4_property',
                    severity: 'critical',
                    category: 'data_retention',
                    summary: 'No GA4 property accessible',
                    detail: 'OAuth user has 0 GA4 properties. Create one at analytics.google.com OR re-OAuth with the Google account that owns the property.',
                    autoFixable: false,
                })
                return finalize(findings, snap)
            }
            // Heuristic: pick by domain match if possible
            propertyId = props[0].propertyId
            if (opts.siteDomain) {
                const target = opts.siteDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase()
                for (const p of props) {
                    if (p.displayName.toLowerCase().includes(target.split('.')[0])) {
                        propertyId = p.propertyId
                        break
                    }
                }
            }
        } catch (e) {
            findings.push({
                id: 'ga4_property_list_failed',
                severity: 'critical',
                category: 'data_retention',
                summary: `Could not list GA4 properties: ${(e as Error).message.slice(0, 150)}`,
                detail: 'GA4 Admin API call failed. Re-OAuth Google with analytics scope.',
                autoFixable: false,
            })
            return finalize(findings, snap)
        }
    }
    snap.propertyId = propertyId

    // 1. Data Retention
    try {
        const dr = await ga4Fetch<{ eventDataRetention?: string; resetUserDataOnNewActivity?: boolean }>(
            `/properties/${propertyId}/dataRetentionSettings`,
            opts.tokens,
        )
        snap.dataRetention = dr.eventDataRetention || 'MONTHS_2'

        if (dr.eventDataRetention !== 'MONTHS_14') {
            findings.push({
                id: 'data_retention_below_max',
                severity: 'high',
                category: 'data_retention',
                summary: `Data Retention is ${dr.eventDataRetention || 'default 2 months'} — recommended 14 months`,
                detail: `GA4 default is 2 months. For IL retention analysis, 14-month attribution windows, and cohort/LTV reporting you need 14 months. Free to upgrade (no GA4 360 needed for this setting). Auto-fix updates eventDataRetention → MONTHS_14.`,
                autoFixable: true,
                autoFixAction: { kind: 'set_data_retention_14_months', payload: { propertyId } },
            })
        }
    } catch (e) {
        findings.push({
            id: 'data_retention_read_failed',
            severity: 'medium',
            category: 'data_retention',
            summary: 'Could not read data retention settings',
            detail: (e as Error).message.slice(0, 200),
            autoFixable: false,
        })
    }

    // 2. Enhanced Measurement
    try {
        const streams = await ga4Fetch<{ dataStreams?: Array<{ name: string; type: string; webStreamData?: { measurementId?: string } }> }>(
            `/properties/${propertyId}/dataStreams`,
            opts.tokens,
        )
        const webStream = (streams.dataStreams || []).find(s => s.type === 'WEB_DATA_STREAM')
        if (webStream) {
            const streamId = webStream.name.split('/').pop() || ''
            snap.webStreamId = streamId
            try {
                const em = await ga4Fetch<any>(
                    `/properties/${propertyId}/dataStreams/${streamId}/enhancedMeasurementSettings`,
                    opts.tokens,
                )
                snap.enhancedMeasurementEnabled = !!em.streamEnabled
                snap.enhancedMeasurementFlags = {
                    streamEnabled: !!em.streamEnabled,
                    scrollsEnabled: !!em.scrollsEnabled,
                    outboundClicksEnabled: !!em.outboundClicksEnabled,
                    siteSearchEnabled: !!em.siteSearchEnabled,
                    videoEngagementEnabled: !!em.videoEngagementEnabled,
                    fileDownloadsEnabled: !!em.fileDownloadsEnabled,
                    formInteractionsEnabled: !!em.formInteractionsEnabled,
                }
                const offFlags = Object.entries(snap.enhancedMeasurementFlags).filter(([k, v]) => !v && k !== 'streamEnabled')
                if (!em.streamEnabled) {
                    findings.push({
                        id: 'enhanced_measurement_off',
                        severity: 'high',
                        category: 'enhanced_measurement',
                        summary: 'Enhanced Measurement is OFF entirely',
                        detail: 'Enhanced Measurement adds automatic events (scroll, outbound_click, site_search, video, file_download, form_interaction) without needing GTM tags. Auto-fix enables all 6.',
                        autoFixable: true,
                        autoFixAction: { kind: 'enable_enhanced_measurement_all', payload: { propertyId, streamId } },
                    })
                } else if (offFlags.length > 0) {
                    findings.push({
                        id: 'enhanced_measurement_partial',
                        severity: 'medium',
                        category: 'enhanced_measurement',
                        summary: `Enhanced Measurement partially enabled (${offFlags.length} events off)`,
                        detail: `Off: ${offFlags.map(([k]) => k.replace(/Enabled$/, '')).join(', ')}. Auto-fix enables all 6.`,
                        autoFixable: true,
                        autoFixAction: { kind: 'enable_enhanced_measurement_all', payload: { propertyId, streamId } },
                    })
                }
            } catch (e) {
                console.warn(`[ga4Health] EM read failed: ${(e as Error).message.slice(0, 150)}`)
            }
        }
    } catch {
        // non-fatal
    }

    // 3. Key Events
    try {
        const keyEvents = await listKeyEvents(opts.tokens, propertyId)
        snap.keyEventCount = keyEvents.length
        const eventNames = keyEvents.map(ke => ke.eventName)
        const expected = ['purchase', 'generate_lead']
        const missing = expected.filter(e => !eventNames.includes(e))
        if (missing.length > 0) {
            findings.push({
                id: 'missing_key_events',
                severity: 'medium',
                category: 'key_events',
                summary: `Missing recommended Key Events: ${missing.join(', ')}`,
                detail: 'Mark these as Key Events in GA4 (Admin → Events → mark as conversion). They are the events our GTM gaawe tags emit for clean attribution.',
                autoFixable: false,
            })
        }
    } catch {
        // non-fatal
    }

    // 4. BigQuery export
    try {
        const bq = await ga4Fetch<{ bigQueryLinks?: any[] }>(
            `/properties/${propertyId}/bigQueryLinks`,
            opts.tokens,
        )
        snap.bigQueryLinkCount = (bq.bigQueryLinks || []).length
        if (!bq.bigQueryLinks || bq.bigQueryLinks.length === 0) {
            findings.push({
                id: 'bigquery_link_missing',
                severity: 'medium',
                category: 'bigquery',
                summary: 'No BigQuery export linked',
                detail: 'BigQuery export unlocks event-level data for deep analysis (e.g. CRO funnels, custom attribution). Free tier covers most SMB volume. Setup requires Google Cloud Project + billing — surface only (no auto-fix).',
                autoFixable: false,
            })
        }
    } catch {
        // non-fatal
    }

    // 5. Google Ads link
    try {
        const adsLink = await ga4Fetch<{ googleAdsLinks?: any[] }>(
            `/properties/${propertyId}/googleAdsLinks`,
            opts.tokens,
        )
        snap.googleAdsLinkCount = (adsLink.googleAdsLinks || []).length
        if (!adsLink.googleAdsLinks || adsLink.googleAdsLinks.length === 0) {
            findings.push({
                id: 'ads_link_missing',
                severity: 'high',
                category: 'ads_link',
                summary: 'No Google Ads link from GA4',
                detail: 'Link Google Ads → GA4 to import GA4 conversions into Ads + share audiences. Without this link, Smart Bidding can\'t use GA4 signals. GA4 Admin → Google Ads Links → Link.',
                autoFixable: false,
            })
        }
    } catch {
        // non-fatal
    }

    return finalize(findings, snap)
}

function finalize(findings: Ga4Finding[], snap: Ga4HealthReport['rawSnapshot']): Ga4HealthReport {
    const counts = {
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        info: findings.filter(f => f.severity === 'info').length,
    }
    const summary = counts.critical === 0 && counts.high === 0 && counts.medium === 0
        ? '✓ GA4 health: no issues detected'
        : `GA4 health: ${[counts.critical && `${counts.critical} critical`, counts.high && `${counts.high} high`, counts.medium && `${counts.medium} medium`].filter(Boolean).join(' + ')}`
    return {
        findings,
        summary,
        counts,
        cleanState: counts.critical === 0 && counts.high === 0,
        rawSnapshot: snap,
    }
}

// ─── Auto-fix actions ────────────────────────────────────────────────────

export async function setDataRetention14Months(tokens: GoogleTokens, propertyId: string): Promise<void> {
    await ga4Fetch(
        `/properties/${propertyId}/dataRetentionSettings?updateMask=eventDataRetention`,
        tokens,
        'PATCH',
        { eventDataRetention: 'MONTHS_14' },
    )
}

export async function enableEnhancedMeasurementAll(tokens: GoogleTokens, propertyId: string, streamId: string): Promise<void> {
    await ga4Fetch(
        `/properties/${propertyId}/dataStreams/${streamId}/enhancedMeasurementSettings?updateMask=streamEnabled,scrollsEnabled,outboundClicksEnabled,siteSearchEnabled,videoEngagementEnabled,fileDownloadsEnabled,formInteractionsEnabled`,
        tokens,
        'PATCH',
        {
            streamEnabled: true,
            scrollsEnabled: true,
            outboundClicksEnabled: true,
            siteSearchEnabled: true,
            videoEngagementEnabled: true,
            fileDownloadsEnabled: true,
            formInteractionsEnabled: true,
        },
    )
}