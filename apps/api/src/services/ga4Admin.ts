/**
 * GA4 Admin API client — Phase 2026.02 Block 6
 *
 * Wraps the analyticsadmin.googleapis.com/v1beta endpoints we need for the
 * monthly_task executor's tracking-foundation mission. Specifically:
 *
 *   - keyEvents.list   : enumerate currently-marked Key Events on a property
 *   - keyEvents.delete : un-mark an event as conversion (delete the
 *                        KeyEvent resource — the resource's existence IS
 *                        the conversion mark)
 *   - properties.list  : enumerate properties accessible to the OAuth user
 *
 * Why we need this: GA4-imported conversion actions in Google Ads cannot be
 * mutated from the Ads side (MUTATE_NOT_ALLOWED). To stop them counting as
 * Conversions in Google Ads optimization, we delete the underlying GA4 Key
 * Event — the import then becomes inert.
 *
 * Required OAuth scope: https://www.googleapis.com/auth/analytics.edit
 * (analytics.readonly suffices for list, but NOT for delete/patch).
 *
 * Refs: https://developers.google.com/analytics/devguides/config/admin/v1
 */

const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleTokens {
    accessToken?: string
    refreshToken: string
    expiresAt?: number
}

async function refreshAccessToken(tokens: GoogleTokens): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing')
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
    })
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Refresh failed ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = await res.json() as { access_token?: string }
    if (!data.access_token) throw new Error('refresh response missing access_token')
    return data.access_token
}

async function ga4Fetch<T = any>(
    path: string,
    tokens: GoogleTokens,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown,
): Promise<T> {
    const accessToken = tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() / 1000 + 60
        ? tokens.accessToken
        : await refreshAccessToken(tokens)
    const url = `${GA4_ADMIN_BASE}${path}`
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
        // DELETE returns 200 / 204 with empty body — treat as ok
        if (method === 'DELETE' && (res.status === 200 || res.status === 204)) {
            return undefined as unknown as T
        }
        throw new Error(`GA4 Admin ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`)
    }
    if (!text) return undefined as unknown as T
    try {
        return JSON.parse(text) as T
    } catch {
        return text as unknown as T
    }
}

// ─── Property discovery ────────────────────────────────────────────────

export interface Ga4Property {
    name: string             // properties/{property_id}
    propertyId: string       // numeric id
    displayName: string
    timeZone?: string
    currencyCode?: string
}

export async function listGa4Properties(tokens: GoogleTokens): Promise<Ga4Property[]> {
    const out: Ga4Property[] = []
    let pageToken: string | undefined
    do {
        const path: string = `/accountSummaries${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`
        const data = await ga4Fetch<{ accountSummaries?: any[]; nextPageToken?: string }>(path, tokens)
        for (const acct of (data.accountSummaries || [])) {
            for (const p of (acct.propertySummaries || [])) {
                const propertyName: string = p.property || ''
                const id = propertyName.split('/').pop() || ''
                out.push({
                    name: propertyName,
                    propertyId: id,
                    displayName: p.displayName || '',
                })
            }
        }
        pageToken = data.nextPageToken
    } while (pageToken)
    return out
}

// ─── Key Events (modern conversion events API) ──────────────────────────

export interface Ga4KeyEvent {
    name: string             // properties/{property_id}/keyEvents/{key_event_id}
    eventName: string        // the underlying GA4 event name (e.g. 'form_submit')
    createTime?: string
    deletable?: boolean
    custom?: boolean
    countingMethod?: string  // ONCE_PER_EVENT | ONCE_PER_SESSION
    defaultValue?: { numericValue?: number; currencyCode?: string }
}

export async function listKeyEvents(tokens: GoogleTokens, propertyId: string): Promise<Ga4KeyEvent[]> {
    const out: Ga4KeyEvent[] = []
    let pageToken: string | undefined
    do {
        const path: string = `/properties/${propertyId}/keyEvents${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`
        const data = await ga4Fetch<{ keyEvents?: Ga4KeyEvent[]; nextPageToken?: string }>(path, tokens)
        for (const ke of (data.keyEvents || [])) out.push(ke)
        pageToken = data.nextPageToken
    } while (pageToken)
    return out
}

/**
 * Delete a Key Event by resource name. This UN-marks the event as a
 * conversion — the GA4 event itself continues being collected, but no
 * longer signals "conversion" to Google Ads (or any downstream integration).
 *
 * `keyEventName` shape: `properties/{property_id}/keyEvents/{key_event_id}`
 */
export async function deleteKeyEvent(tokens: GoogleTokens, keyEventName: string): Promise<void> {
    await ga4Fetch(`/${keyEventName}`, tokens, 'DELETE')
}

/**
 * Best-effort match: given a target GA4 event_name (from a Google Ads
 * conversion action's google_analytics_4_settings field), find the
 * matching KeyEvent resource on the property. Returns null if not found.
 *
 * Match is case-insensitive on eventName.
 */
export async function findKeyEventByEventName(
    tokens: GoogleTokens,
    propertyId: string,
    eventName: string,
): Promise<Ga4KeyEvent | null> {
    const all = await listKeyEvents(tokens, propertyId)
    const target = eventName.trim().toLowerCase()
    return all.find(ke => (ke.eventName || '').toLowerCase() === target) || null
}