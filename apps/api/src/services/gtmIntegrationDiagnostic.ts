/**
 * Phase 4.2.2-A — GTM Integration Diagnostic Service
 *
 * Single source of truth for "what's the state of GTM integration for this
 * instance, and what's the next user action (if any)?". Used by:
 *   - GET /hosting/instances/:id/integrations/gtm/diagnostic   (UI card)
 *   - POST /hosting/instances/:id/integrations/gtm/auto-fix    (orchestrator)
 *
 * Returns 8 gates, each with status + remediation action (auto-fix vs.
 * manual). Frontend renders a row per gate; the auto-fix orchestrator
 * chains the auto-fix actions in order, stopping at the first manual gate.
 *
 * Design goals:
 *   - DETECT actual API capability, not just "scope string is in saved tokens".
 *     Saved scopes can lie if Google's consent screen narrows what it grants.
 *     We probe via real API calls so the diagnostic matches reality.
 *   - PRECISE remediation: when a gate fails, the message tells the user
 *     EXACTLY which Google UI screen + which field needs change. Generic
 *     "permission denied" errors are translated into actionable steps.
 *   - IDEMPOTENT: running diagnostic is read-only (no side effects on user
 *     resources). Auto-fix actions are exposed as separate POST endpoints.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

const GTM_API = 'https://www.googleapis.com/tagmanager/v2'
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo'
const FETCH_TIMEOUT_MS = 8_000

export type GateStatus = 'pass' | 'warn' | 'fail' | 'pending' | 'skipped'

export interface DiagnosticActionAutoFix {
    type: 'auto_fix'
    endpoint: string                   // POST endpoint to call
    label: string                      // Hebrew button label
}

export interface DiagnosticActionManual {
    type: 'manual'
    label: string                      // Hebrew button label
    externalUrl?: string               // optional deep-link to Google UI
    steps: string[]                    // Hebrew step-by-step instructions
}

export interface DiagnosticActionOAuth {
    type: 'oauth'
    label: string
    endpoint: string                   // OAuth initiation URL
}

export type DiagnosticAction = DiagnosticActionAutoFix | DiagnosticActionManual | DiagnosticActionOAuth

export interface DiagnosticGate {
    id: string
    label: string                      // Hebrew user-facing
    status: GateStatus
    message: string                    // Hebrew current-state summary
    detail?: string                    // longer Hebrew explanation
    action?: DiagnosticAction
    blocking: boolean                  // true = blocks auto-setup, false = warn-only
}

export interface GtmDiagnostic {
    status: 'ready' | 'needs_action' | 'not_connected'
    oauth: {
        connected: boolean
        email: string | null
        connectedAt: string | null
        scopes: string[]
    }
    target: {
        picked: boolean
        accountId?: string
        containerId?: string
        publicId?: string
        name?: string
    }
    conversions: {
        total: number
        eligibleForGtm: number
    }
    lastSetup: {
        ran: boolean
        published: boolean
        tagsCreated: number
        lastSetupAt: string | null
        errors: Array<{ step: string; error: string }>
    }
    gates: DiagnosticGate[]
    readyToAutoSetup: boolean
    nextStep?: string                  // ID of the next gate that needs action
}

// ─── OAuth token refresh (local copy — service must be self-contained) ────
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID || '',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const j = await res.json() as any
        return j.access_token || null
    } catch {
        return null
    }
}

async function tokenInfo(accessToken: string): Promise<{ email?: string; scope?: string } | null> {
    try {
        const res = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(accessToken)}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return null
        return await res.json() as any
    } catch {
        return null
    }
}

async function gtmCall(path: string, accessToken: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    try {
        const res = await fetch(`${GTM_API}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const text = await res.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
        return { ok: res.ok, status: res.status, data }
    } catch (err) {
        return { ok: false, status: 0, data: { error: (err as Error).message } }
    }
}

// ─── Site install detection: fetch user's website, look for GTM-XXXX ─────
async function detectGtmOnSite(siteUrl: string, publicId: string): Promise<{ detected: boolean; reason: string }> {
    try {
        let u = siteUrl.trim()
        if (!/^https?:\/\//.test(u)) u = 'https://' + u
        const res = await fetch(u, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlowmaticBot/1.0; +https://flowmatic.co.il)' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return { detected: false, reason: `site returned ${res.status}` }
        const html = await res.text()
        // Match GTM snippet patterns: googletagmanager.com/gtm.js?id=GTM-XXXX
        // or noscript src=...GTM-XXXX
        const escaped = publicId.replace(/[-]/g, '\\-')
        const regex = new RegExp(`(googletagmanager\\.com[\\s\\S]{0,400}${escaped})|(${escaped}[\\s\\S]{0,200}googletagmanager\\.com)`, 'i')
        const hit = regex.test(html)
        return hit
            ? { detected: true, reason: `${publicId} found in HTML` }
            : { detected: false, reason: `${publicId} not found in fetched HTML (${html.length} bytes)` }
    } catch (err) {
        return { detected: false, reason: `fetch error: ${(err as Error).message}` }
    }
}

// ─── Publish permission probe ─────────────────────────────────────────────
// We probe by trying to list user_permissions on the account. Only Admin-level
// users can call this. If they can, they have all roles including Publish.
// If 403, we know they DON'T have admin — but they might still have Publish
// granted as a direct container-level role. In that case we report 'unknown'
// (status='pending') and let the actual auto-setup probe it.
async function probePublishPermission(accessToken: string, accountId: string): Promise<{ confirmed: boolean; status: 'pass' | 'pending' | 'fail'; reason: string }> {
    const r = await gtmCall(`/accounts/${accountId}/user_permissions`, accessToken)
    if (r.ok) {
        // User has admin-level read on this account → can publish too
        return { confirmed: true, status: 'pass', reason: 'Account-admin user — has all roles including Publish' }
    }
    if (r.status === 403) {
        // Not an admin. Can't confirm Publish from here. Will be tested at auto-setup time.
        return { confirmed: false, status: 'pending', reason: 'Container-level role not exposed — will be tested at auto-setup time' }
    }
    return { confirmed: false, status: 'fail', reason: `unexpected API response: ${r.status}` }
}

// ─── Diagnostic helper: what permissions does the connected user have? ─
// Probes both account-level and container-level access by calling
// /accounts/{aid} (read = at least User role on account) and
// /accounts/{aid}/containers/{cid}/workspaces (write = at least Edit on container).
// Returns Hebrew-friendly summary for embedding in error detail messages.
async function probeUserVisibility(accessToken: string, accountId: string, containerId: string): Promise<{ accountReadable: boolean; canCreateWorkspace: boolean; summary: string }> {
    const [accRes, wsListRes, wsCreateProbeRes] = await Promise.all([
        gtmCall(`/accounts/${accountId}`, accessToken),
        gtmCall(`/accounts/${accountId}/containers/${containerId}/workspaces`, accessToken),
        // Probe write access without actually creating: try POST with validateOnly-ish empty body.
        // GTM API doesn't have validate mode for workspaces, so we settle for reading workspaces
        // as the proxy: if we can list them, we have at least Read on container.
        Promise.resolve({ ok: true, status: 200, data: {} }),
    ])
    void wsCreateProbeRes
    const accountReadable = accRes.ok
    const canCreateWorkspace = wsListRes.ok   // proxy: list ok = read on container
    const accStr = accountReadable ? 'Account: ✓ נראה' : 'Account: ✗ לא נראה (אין אפילו User role)'
    const ctnStr = canCreateWorkspace ? 'Container: ✓ נראה' : 'Container: ✗ לא נראה'
    return { accountReadable, canCreateWorkspace, summary: `${accStr} · ${ctnStr}` }
}

// ─── Main: run all gates and return the diagnostic ────────────────────────
// Multi-MATEH: agentId scopes the diagnostic to a specific agent. Without it
// the function reads inst.googleTokens / inst.researchData, which are
// PRIMARY-agent mirrors — and a secondary agent's GTM card then shows the
// primary's saved container as "connected" (the user-visible leak).
export async function runGtmDiagnostic(instanceId: string, agentId?: string): Promise<GtmDiagnostic> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    // Resolve per-agent state from mateh_agents when agentId is provided.
    // Falls back to the primary mateh_agent row (same as instance mirror in
    // single-tenant) so legacy callers still work.
    const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    const tokens: any = (agent?.googleTokens as any) ?? inst.googleTokens ?? null
    const rd: any = (agent?.researchData as any) ?? inst.researchData ?? {}
    const target = rd.mazhirGtm?.target
    const lastSetup = rd.mazhirGtm?.lastSetupResult
    const lastSetupAt: string | null = rd.mazhirGtm?.lastSetupAt || null
    // Phase 4.2.3-B: read `active` (unified mapped+created) with legacy fallback.
    const conversions: any[] = rd.mazhirConversions?.active || rd.mazhirConversions?.created || []
    const siteUrl: string | undefined = rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl

    const gates: DiagnosticGate[] = []

    // ── Gate 1: OAuth connected ──
    const hasRefresh = !!tokens?.refreshToken
    const savedEmail: string | null = tokens?.email || null
    gates.push({
        id: 'oauth_connected',
        label: 'חיבור Google',
        status: hasRefresh ? 'pass' : 'fail',
        message: hasRefresh
            ? `מחובר כ-${savedEmail || 'אנונימי'}`
            : 'Google לא מחובר',
        blocking: true,
        action: hasRefresh ? undefined : {
            type: 'oauth',
            label: 'חברו Google',
            endpoint: `/hosting/instances/${instanceId}/google/auth`,
        },
    })

    if (!hasRefresh) {
        // No point checking anything else without OAuth
        return finalize({
            oauth: { connected: false, email: null, connectedAt: tokens?.connectedAt || null, scopes: [] },
            target: { picked: false },
            conversions: { total: 0, eligibleForGtm: 0 },
            lastSetup: emptyLastSetup(),
            gates,
        })
    }

    // ── Refresh access token + verify with Google to learn TRUE scopes ──
    const accessToken = await refreshAccessToken(tokens.refreshToken)
    if (!accessToken) {
        gates.push({
            id: 'oauth_token_valid',
            label: 'תוקף Token',
            status: 'fail',
            message: 'refresh token לא מתקבל',
            detail: 'הטוקן נדחה ע״י Google — בוצע revoke או יש שגיאת קונפיגורציה ב-OAuth client',
            blocking: true,
            action: {
                type: 'oauth',
                label: 'חברו מחדש',
                endpoint: `/hosting/instances/${instanceId}/google/auth`,
            },
        })
        return finalize({
            oauth: { connected: true, email: savedEmail, connectedAt: tokens?.connectedAt || null, scopes: [] },
            target: pickedTarget(target),
            conversions: countConversions(conversions),
            lastSetup: lastSetupSummary(lastSetup, lastSetupAt),
            gates,
        })
    }

    const info = await tokenInfo(accessToken)
    const actualEmail = info?.email || savedEmail
    const actualScopes: string[] = (info?.scope || '').split(' ').filter(Boolean)

    // ── Gate 2: GTM scope granted (truth from Google, not from saved scopes string) ──
    const hasEditScope = actualScopes.some(s => s.includes('tagmanager.edit.containers'))
    const hasPublishScope = actualScopes.some(s => s.includes('tagmanager.publish'))
    const allGtmScopes = hasEditScope && hasPublishScope
    gates.push({
        id: 'gtm_scope',
        label: 'הרשאות API ל-GTM',
        status: allGtmScopes ? 'pass' : 'fail',
        message: allGtmScopes
            ? 'edit + publish scopes פעילים'
            : `חסרים scopes: ${[!hasEditScope && 'edit.containers', !hasPublishScope && 'publish'].filter(Boolean).join(', ')}`,
        detail: allGtmScopes ? undefined
            : 'Google דורש re-OAuth עם הסכמה ל-Tag Manager. הסכמה זו ניתנת ע״י המשתמש שמחובר עכשיו, ולא ע״י מנהל אחר.',
        blocking: true,
        action: allGtmScopes ? undefined : {
            type: 'oauth',
            label: 'הוסיפו הרשאות GTM',
            endpoint: `/hosting/instances/${instanceId}/google/auth?addScopes=gtm`,
        },
    })

    if (!allGtmScopes) {
        return finalize({
            oauth: { connected: true, email: actualEmail, connectedAt: tokens?.connectedAt || null, scopes: actualScopes },
            target: pickedTarget(target),
            conversions: countConversions(conversions),
            lastSetup: lastSetupSummary(lastSetup, lastSetupAt),
            gates,
        })
    }

    // ── Gate 3: GTM accounts accessible ──
    const accountsRes = await gtmCall('/accounts', accessToken)
    const accounts: any[] = accountsRes.data?.account || []
    const accessibleAccounts = accountsRes.ok && accounts.length > 0
    gates.push({
        id: 'gtm_account',
        label: 'חשבון GTM קיים',
        status: accessibleAccounts ? 'pass' : 'fail',
        message: accessibleAccounts
            ? `${accounts.length} חשבון/חשבונות זמינים`
            : 'אין חשבון GTM זמין למשתמש',
        detail: accessibleAccounts ? undefined
            : 'נדרש ליצור חשבון GTM ולאשר את תנאי השימוש (פעולה חד-פעמית, ~30 שניות). Google לא מאפשרת לעשות זאת דרך API.',
        blocking: true,
        action: accessibleAccounts ? undefined : {
            type: 'manual',
            label: 'פתחו Tag Manager + אשרו ToS',
            externalUrl: 'https://tagmanager.google.com/',
            steps: [
                'פתחו את tagmanager.google.com',
                'לחצו "Create Account" → תנו שם (למשל שם העסק)',
                'אשרו את תנאי השימוש (ToS)',
                'אחרי האישור, חזרו לכאן ולחצו "רענן diagnostic"',
            ],
        },
    })

    if (!accessibleAccounts) {
        return finalize({
            oauth: { connected: true, email: actualEmail, connectedAt: tokens?.connectedAt || null, scopes: actualScopes },
            target: pickedTarget(target),
            conversions: countConversions(conversions),
            lastSetup: lastSetupSummary(lastSetup, lastSetupAt),
            gates,
        })
    }

    // ── Gate 4: At least one container in accounts OR target already picked ──
    // We list containers across all accessible accounts and aggregate.
    const allContainers: Array<{ accountId: string; containerId: string; publicId: string; name: string; domainName?: string[]; usageContext: string[] }> = []
    for (const acc of accounts) {
        const accId = String(acc.accountId)
        const contRes = await gtmCall(`/accounts/${accId}/containers`, accessToken)
        if (contRes.ok) {
            for (const ct of (contRes.data.container || [])) {
                allContainers.push({
                    accountId: accId,
                    containerId: String(ct.containerId),
                    publicId: ct.publicId || '',
                    name: ct.name || '',
                    domainName: Array.isArray(ct.domainName) ? ct.domainName : undefined,
                    usageContext: Array.isArray(ct.usageContext) ? ct.usageContext : ['web'],
                })
            }
        }
    }
    const hasContainers = allContainers.length > 0
    gates.push({
        id: 'gtm_container_available',
        label: 'Container GTM קיים',
        status: hasContainers ? 'pass' : 'warn',
        message: hasContainers
            ? `${allContainers.length} container/ים זמינ/ים`
            : 'אין containers — אבל אפשר ליצור חדש אוטומטית',
        blocking: false,    // create-new auto-fix covers this
        action: hasContainers ? undefined : {
            type: 'auto_fix',
            endpoint: `/hosting/instances/${instanceId}/mazhir/gtm/create-container`,
            label: '🆕 צרו container חדש',
        },
    })

    // ── Gate 5: Target picked (a specific container saved in researchData) ──
    const pickedOk = !!(target?.containerId && target?.publicId)
    gates.push({
        id: 'gtm_target_picked',
        label: 'נבחר container לעבודה',
        status: pickedOk ? 'pass' : 'fail',
        message: pickedOk
            ? `${target.publicId} (${target.name || 'ללא שם'})`
            : hasContainers
                ? 'בחרו container מהרשימה'
                : 'אחרי יצירת container — הוא ייבחר אוטומטית',
        blocking: true,
        action: pickedOk ? undefined : {
            type: 'auto_fix',
            endpoint: `/hosting/instances/${instanceId}/mazhir/gtm/targets`,
            label: hasContainers ? '▶ בחרו container' : '⏭ צרו container קודם',
        },
    })

    // ── Gate 6: Snippet installed on site ──
    let installStatus: GateStatus = 'pending'
    let installMessage = 'לא נבדק עדיין (חסר container שנבחר או URL של האתר)'
    let installDetail: string | undefined
    if (pickedOk && siteUrl) {
        const det = await detectGtmOnSite(siteUrl, target.publicId)
        installStatus = det.detected ? 'pass' : 'warn'
        installMessage = det.detected ? `snippet זוהה ב-${siteUrl}` : 'snippet לא זוהה'
        installDetail = det.reason
    } else if (pickedOk && !siteUrl) {
        installStatus = 'warn'
        installMessage = 'אתר לא הוגדר ב-profile — לא ניתן לבדוק התקנה'
    }
    gates.push({
        id: 'gtm_install_detected',
        label: 'Snippet מותקן על האתר',
        status: installStatus,
        message: installMessage,
        detail: installDetail,
        blocking: false,    // not blocking — tags can be created in container regardless;
                            // only firing requires install. We warn but proceed.
        action: installStatus === 'pass' || installStatus === 'pending' ? undefined : {
            type: 'manual',
            label: 'הציגו snippet להתקנה',
            steps: [
                'מערכת תציג שני קטעי קוד (Head + Body)',
                'הדביקו את ה-Head מיד אחרי <head> בכל עמוד באתר',
                'הדביקו את ה-Body מיד אחרי <body> בכל עמוד',
                'שמרו → publish → חזרו לכאן ולחצו "רענן diagnostic"',
            ],
        },
    })

    // ── Gate 7: Publish permission on the picked container ──
    // Phase 4.2.2-C2 fix: this gate is NEVER hard-`fail` from historical
    // errors alone. Google doesn't expose container-level role checks via
    // API for non-account-admins, so the only ground truth is "did the
    // last publish call succeed?". A past failure becomes `warn` (yellow,
    // non-blocking) with a remediation hint — auto-fix will retry; if the
    // user has since granted Publish role, the retry succeeds and the
    // gate flips green. If it fails again, the orchestrator surfaces the
    // fresh error in a modal.
    let publishGate: DiagnosticGate
    if (!pickedOk) {
        publishGate = {
            id: 'gtm_publish_permission',
            label: 'הרשאת Publish',
            status: 'skipped',
            message: 'יבדק אחרי בחירת container',
            blocking: true,
        }
    } else if (lastSetup?.published) {
        publishGate = {
            id: 'gtm_publish_permission',
            label: 'הרשאת Publish',
            status: 'pass',
            message: 'אומת ע״י publish מוצלח בעבר',
            blocking: true,
        }
    } else if (lastSetup?.errors?.some((e: any) => e.step === 'publish' && /404|permission/i.test(e.error || ''))) {
        const visibility = await probeUserVisibility(accessToken, target!.accountId, target!.containerId)
        publishGate = {
            id: 'gtm_publish_permission',
            label: 'הרשאת Publish',
            status: 'warn',
            message: 'ניסיון publish קודם נכשל — נדרשות הרשאות ב-2 רמות',
            detail:
                'מצב נוכחי של ' + (actualEmail || 'unknown') + ': ' + visibility.summary + '. ' +
                'GTM דורש הרשאות בשתי רמות במקביל: (1) Account-level — לפחות "User", שמאפשרת לראות את ה-account; (2) Container-level — "Publish", שמאפשרת לפרסם workspace. גם אם רואים את ה-account וה-container, ייתכן שחסרה הרשאת Publish ספציפית.',
            blocking: false,    // do NOT block auto-fix — let it retry to verify
            action: {
                type: 'manual',
                label: 'פתחו User Management',
                externalUrl: `https://tagmanager.google.com/#/admin/accounts/${target!.accountId}/user-permissions`,
                steps: [
                    `שלב 1 — Account level (פותח בקישור): ב-Tag Manager → Admin → User Management של ה-account → "+" → הוסיפו ${actualEmail || '<email המחובר>'} ב-role "User" לפחות`,
                    `שלב 2 — Container level: באותו חלון, בחרו את ה-container "${target!.name || target!.publicId}" → במשתמש שזה עתה הוספתם, החליפו רמת container ל-"Publish"`,
                    'שמרו את שני השינויים',
                    'אם זה כבר נעשה — ייתכן שצריך לחכות 1-2 דקות עד שגוגל ירעננו את ההרשאות',
                    'חזרו לכאן ולחצו "🔄 רענן" או "🚀 auto-fix" — auto-fix ינסה publish ויאמת',
                ],
            },
        }
    } else {
        // No past attempt — probe via user_permissions API for account-admin
        // confirmation. If 403, mark pending (will be tested at auto-fix time).
        const probe = await probePublishPermission(accessToken, target!.accountId)
        publishGate = {
            id: 'gtm_publish_permission',
            label: 'הרשאת Publish',
            status: probe.status,
            message: probe.status === 'pass'
                ? 'מאומת — Admin על החשבון'
                : 'יבדק בעת publish הבא',
            detail: probe.reason,
            blocking: false,    // not blocking — orchestrator will discover at runtime
        }
    }
    gates.push(publishGate)

    // ── Gate 8: Conversion actions ready (for wiring up Ads conversion tags) ──
    // Phase 4.3-P(B): the gate previously only looked at OUR record of created
    // actions. If the user already has ConversionActions in Google Ads (the
    // common case — agency clients, established advertisers), they were
    // invisible and the gate told them to "create new" — duplicating data.
    //
    // New flow:
    //   1) Look at our internal active[] first (mapped or created actions
    //      already approved by the user).
    //   2) Look at draftMapping — if present, the user has a pending review
    //      task; surface "waiting for approval" with a manual action.
    //   3) Otherwise, gate is failing — but the action now hints at
    //      DETECTION first (`mazhir/conversions/detect-existing` → draft
    //      mapping → review task) before creating new.
    const eligibleConv = conversions.filter(c => c.googleAdsConversionId && c.googleAdsConversionLabel
        && c.actionKey !== 'qualified_lead' && c.actionKey !== 'phone_call_offline')
    const draftMapping = (rd.mazhirConversions?.draftMapping as { mappings?: unknown[]; appliedAt?: string } | undefined)
    const hasDraft = !!(draftMapping?.mappings && (draftMapping.mappings.length > 0) && !draftMapping.appliedAt)
    const conversionsReady = eligibleConv.length > 0
    if (conversionsReady) {
        gates.push({
            id: 'conversion_actions_ready',
            label: 'פעולות המרה מוכנות (Ads)',
            status: 'pass',
            message: `${eligibleConv.length} ConversionActions מוכנות לחיבור ל-tags`,
            blocking: true,
        })
    } else if (hasDraft) {
        // Phase 4.3-P(B v2): the rich picker lives inside this same GTM card.
        // Action label hints "scroll down". Frontend (_gtmGateActionClick)
        // special-cases this gateId and scrolls to #gtm-conv-picker instead
        // of opening the legacy modal.
        const cands = (rd.mazhirConversions?.draftMapping as { candidates?: unknown[] })?.candidates
        const candCount = Array.isArray(cands) ? cands.length : 0
        gates.push({
            id: 'conversion_actions_ready',
            label: 'פעולות המרה מוכנות (Ads)',
            status: 'warn',
            message: `${candCount} פעולות מחכות לבחירה למטה`,
            detail: 'בחרו את הפעולות הרלוונטיות בכרטיס בחירת פעולות המרה למטה. פעולות שייכות לעסקים אחרים ב-MCC מסומנות באדום ולא מסומנות כברירת מחדל.',
            blocking: true,
            action: {
                type: 'manual',
                label: '↓ פתחו את הבחירה למטה',
                steps: [
                    'גללו למטה — סעיף "פעולות המרה שזוהו ב-Google Ads"',
                    'סמנו את הפעולות הרלוונטיות (אדומות = עסק אחר ב-MCC, לא לסמן)',
                    'לחצו "✓ החל את הבחירה"',
                ],
            },
        })
    } else {
        gates.push({
            id: 'conversion_actions_ready',
            label: 'פעולות המרה מוכנות (Ads)',
            status: 'fail',
            message: 'לא זוהו ConversionActions לסוכן זה',
            detail: 'הסיסטם ינסה קודם לזהות פעולות המרה קיימות ב-Google Ads. אם אין — נציע ליצור חדשות.',
            blocking: true,
            action: {
                type: 'auto_fix',
                endpoint: `/hosting/instances/${instanceId}/mazhir/conversions/detect-existing`,
                label: '🔍 חפשו ConversionActions קיימות',
            },
        })
    }

    return finalize({
        oauth: { connected: true, email: actualEmail, connectedAt: tokens?.connectedAt || null, scopes: actualScopes },
        target: pickedTarget(target),
        conversions: countConversions(conversions),
        lastSetup: lastSetupSummary(lastSetup, lastSetupAt),
        gates,
    })
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function emptyLastSetup(): GtmDiagnostic['lastSetup'] {
    return { ran: false, published: false, tagsCreated: 0, lastSetupAt: null, errors: [] }
}

function lastSetupSummary(setup: any, lastSetupAt: string | null): GtmDiagnostic['lastSetup'] {
    if (!setup) return emptyLastSetup()
    return {
        ran: true,
        published: !!setup.published,
        tagsCreated: Array.isArray(setup.created) ? setup.created.length : 0,
        lastSetupAt,
        errors: Array.isArray(setup.errors) ? setup.errors : [],
    }
}

function pickedTarget(t: any): GtmDiagnostic['target'] {
    if (!t?.containerId) return { picked: false }
    return {
        picked: true,
        accountId: t.accountId,
        containerId: t.containerId,
        publicId: t.publicId,
        name: t.name,
    }
}

function countConversions(c: any[]): GtmDiagnostic['conversions'] {
    const eligible = c.filter(x => x.googleAdsConversionId && x.googleAdsConversionLabel
        && x.actionKey !== 'qualified_lead' && x.actionKey !== 'phone_call_offline')
    return { total: c.length, eligibleForGtm: eligible.length }
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 4.2.2-B — Auto-fix orchestrator
// ═════════════════════════════════════════════════════════════════════════
// Non-interactive chain: runs every gate that's "auto-fixable" without
// needing UI input, stopping at the first manual gate (OAuth redirect,
// permission grant in Google UI, accept GTM ToS, etc).
//
// Auto-fixable today:
//   - conversion_actions_ready → calls setupConversionActionsForInstance
//   - All blocking gates pass → calls autoSetupGtmContainer (publish tags)
//
// NOT auto-fixable (return userActionRequired):
//   - oauth, scope, gtm_account, gtm_container_available (create-new
//     needs a name from user), gtm_target_picked, gtm_install_detected,
//     gtm_publish_permission

export interface AutoFixStepResult {
    gateId: string
    action: 'conversions_setup' | 'gtm_auto_setup'
    result: 'success' | 'fail' | 'skipped'
    message: string
    durationMs: number
}

export interface AutoFixChainResult {
    completed: boolean              // true = chain ran to publish-success
    steps: AutoFixStepResult[]
    finalDiagnostic: GtmDiagnostic
    userActionRequired?: {
        gateId: string
        label: string
        steps?: string[]
        externalUrl?: string
        actionType?: string
    }
}

export async function runGtmAutoFixChain(instanceId: string, agentId?: string): Promise<AutoFixChainResult> {
    const steps: AutoFixStepResult[] = []

    // ── Pass 1: diagnose current state ──
    let diag = await runGtmDiagnostic(instanceId, agentId)

    // ── If any BLOCKING gate with status='fail' has a non-auto-fixable
    //    action → bail out with user action. Note: `warn` doesn't bail (e.g.
    //    publish_permission past-error becomes warn — we want orchestrator
    //    to actually try publish and find out fresh truth). ──
    const userActionGate = diag.gates.find(g =>
        g.blocking
        && g.status === 'fail'
        && g.action
        && g.action.type !== 'auto_fix'
    )
    if (userActionGate) {
        return {
            completed: false,
            steps,
            finalDiagnostic: diag,
            userActionRequired: {
                gateId: userActionGate.id,
                label: userActionGate.action!.label,
                actionType: userActionGate.action!.type,
                steps: (userActionGate.action as any).steps,
                externalUrl: (userActionGate.action as any).externalUrl
                    || (userActionGate.action as any).endpoint,
            },
        }
    }

    // ── Auto-fix step A: ConversionActions if missing ──
    const convGate = diag.gates.find(g => g.id === 'conversion_actions_ready')
    if (convGate && convGate.status === 'fail') {
        const t0 = Date.now()
        try {
            const { setupConversionActionsForInstance } = await import('@/services/mazhirConversions')
            const r = await setupConversionActionsForInstance(instanceId)
            steps.push({
                gateId: 'conversion_actions_ready',
                action: 'conversions_setup',
                result: r.created.length > 0 ? 'success' : 'fail',
                message: r.created.length > 0
                    ? `נוצרו ${r.created.length} ConversionActions`
                    : 'לא נוצרו ConversionActions: ' + (r.warnings.slice(0, 1).join('; ') || 'unknown'),
                durationMs: Date.now() - t0,
            })
        } catch (err) {
            steps.push({
                gateId: 'conversion_actions_ready',
                action: 'conversions_setup',
                result: 'fail',
                message: 'Conversions setup נכשל: ' + (err as Error).message,
                durationMs: Date.now() - t0,
            })
        }
        // Re-diagnose to refresh state
        diag = await runGtmDiagnostic(instanceId, agentId)
    }

    // ── If conversions still missing → cannot proceed to GTM auto-setup ──
    const convAfter = diag.gates.find(g => g.id === 'conversion_actions_ready')
    if (convAfter && convAfter.status !== 'pass') {
        return {
            completed: false,
            steps,
            finalDiagnostic: diag,
            userActionRequired: {
                gateId: 'conversion_actions_ready',
                label: 'ConversionActions לא נוצרו — בדקו logs',
                actionType: 'manual',
            },
        }
    }

    // ── Re-check: any other blocking gate still failing (fail only, not warn)? ──
    const stillFailing = diag.gates.find(g => g.blocking && g.status === 'fail' && g.action)
    if (stillFailing) {
        return {
            completed: false,
            steps,
            finalDiagnostic: diag,
            userActionRequired: {
                gateId: stillFailing.id,
                label: stillFailing.action!.label,
                actionType: stillFailing.action!.type,
                steps: (stillFailing.action as any).steps,
                externalUrl: (stillFailing.action as any).externalUrl,
            },
        }
    }

    // ── Auto-fix step B: GTM auto-setup (publish workspace) ──
    if (!diag.readyToAutoSetup) {
        return { completed: false, steps, finalDiagnostic: diag }
    }
    const t1 = Date.now()
    try {
        // Multi-MATEH: read per-agent state from mateh_agents when agentId is set,
        // not from instances mirror (which is primary-only).
        const { resolveAgentById, resolvePrimaryAgent } = await import('./agentContext')
        const agent = agentId
            ? await resolveAgentById(instanceId, agentId)
            : await resolvePrimaryAgent(instanceId)
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const googleTokens = (agent?.googleTokens as any) ?? inst?.googleTokens
        if (!googleTokens) throw new Error('Google tokens missing')
        const rd: any = (agent?.researchData as any) ?? inst?.researchData ?? {}
        const target = rd.mazhirGtm?.target
        // Phase 4.2.3-B: read `active` (unified mapped+created) with legacy fallback.
        const conversions = rd.mazhirConversions?.active || rd.mazhirConversions?.created || []
        const profile = rd.paidProfile
        const gtmConfigs = conversions
            .filter((cv: any) => cv.googleAdsConversionId && cv.googleAdsConversionLabel)
            .filter((cv: any) => cv.actionKey !== 'qualified_lead' && cv.actionKey !== 'phone_call_offline')
            .map((cv: any) => ({
                actionKey: cv.actionKey === 'form_submit' ? 'generate_lead' : cv.actionKey,
                googleAdsConversionId: cv.googleAdsConversionId,
                googleAdsConversionLabel: cv.googleAdsConversionLabel,
                sendValue: true,
                defaultValueIls: profile?.avgDealValueIls || 100,
                defaultCurrency: 'ILS',
            }))
        const { autoSetupGtmContainer, saveGtmSetupResult } = await import('@/services/mazhirGtmSetup')
        const result = await autoSetupGtmContainer(googleTokens, {
            target,
            measurementId: target.measurementId,
            conversions: gtmConfigs,
            enhancedConversions: true,
        })
        await saveGtmSetupResult(instanceId, result, agentId)
        steps.push({
            gateId: 'gtm_publish_permission',
            action: 'gtm_auto_setup',
            result: result.published ? 'success' : 'fail',
            message: result.published
                ? `פורסם ✓ — ${(result.created || []).length} tags`
                : 'Publish נכשל — ' + ((result.errors || []).slice(0, 1).map((e: any) => e.error).join('; ') || 'unknown'),
            durationMs: Date.now() - t1,
        })
    } catch (err) {
        steps.push({
            gateId: 'gtm_publish_permission',
            action: 'gtm_auto_setup',
            result: 'fail',
            message: 'GTM auto-setup נכשל: ' + (err as Error).message,
            durationMs: Date.now() - t1,
        })
    }

    // ── Final state ──
    const finalDiag = await runGtmDiagnostic(instanceId, agentId)
    const completed = finalDiag.lastSetup.published === true
    return {
        completed,
        steps,
        finalDiagnostic: finalDiag,
        userActionRequired: completed ? undefined : (() => {
            // If our just-run publish failed, ALWAYS surface the publish gate's
            // manual remediation — even when its status is `warn`. The user
            // attempted auto-fix and it didn't complete, so we owe them the
            // remediation steps.
            const lastPublishStep = steps.find(s => s.action === 'gtm_auto_setup' && s.result === 'fail')
            if (lastPublishStep) {
                const pubGate = finalDiag.gates.find(g => g.id === 'gtm_publish_permission')
                if (pubGate && pubGate.action) {
                    return {
                        gateId: pubGate.id,
                        label: pubGate.action.label,
                        actionType: pubGate.action.type,
                        steps: (pubGate.action as any).steps,
                        externalUrl: (pubGate.action as any).externalUrl,
                    }
                }
            }
            const next = finalDiag.gates.find(g => g.blocking && g.status === 'fail' && g.action)
            if (!next) return undefined
            return {
                gateId: next.id,
                label: next.action!.label,
                actionType: next.action!.type,
                steps: (next.action as any).steps,
                externalUrl: (next.action as any).externalUrl,
            }
        })(),
    }
}

function finalize(partial: Omit<GtmDiagnostic, 'status' | 'readyToAutoSetup' | 'nextStep'>): GtmDiagnostic {
    const blockingGates = partial.gates.filter(g => g.blocking)
    const allBlockingPassing = blockingGates.every(g => g.status === 'pass')
    const anyFail = partial.gates.some(g => g.status === 'fail')
    const firstActionable = partial.gates.find(g => g.action && g.status !== 'pass' && g.status !== 'skipped')

    const status: GtmDiagnostic['status'] = !partial.oauth.connected ? 'not_connected'
        : allBlockingPassing ? 'ready'
        : 'needs_action'

    return {
        ...partial,
        status,
        readyToAutoSetup: allBlockingPassing && !anyFail,
        nextStep: firstActionable?.id,
    }
}