/**
 * Pre-flight check — Phase E_QA. Validates prerequisites before the user
 * starts running pipeline stages, so DFS / Anthropic budget isn't burned
 * on a misconfigured instance and the user gets a clear actionable
 * checklist instead of confusing per-stage errors.
 *
 *   GET /hosting/instances/:id/research/preflight
 *
 * Returns: { ready, checks: [{ name, status: 'ok'|'warning'|'fail', label_he,
 * actionable_hint_he }], estimated_cost_ils, estimated_duration_minutes }
 *
 * Status semantics:
 *   - ok: prerequisite satisfied; safe to proceed
 *   - warning: stage will work but in degraded mode (e.g. no GSC → less
 *     accurate striking distance)
 *   - fail: stage will hard-fail; user MUST fix before running
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../authHelper'
import { getApiKeyForInstance } from '../agentSetup'
import type { ResearchDataV2, StageId } from '@/services/research/types'
import { resolveActiveAgent } from '@/services/agentContext'
import { buildPreflight } from '@/services/research/integrationGate'
import { getAgentIntegrations, getPrimaryAgent } from '@/services/agentIntegrations'

interface PreflightCheck {
    name: string
    status: 'ok' | 'warning' | 'fail'
    label_he: string
    actionable_hint_he?: string
}

interface PreflightResult {
    ready: boolean              // false ⇒ at least one fail
    has_warnings: boolean        // true ⇒ at least one warning
    checks: PreflightCheck[]
    estimated_cost_ils: { dfs: number; anthropic: number; total: number }
    estimated_duration_minutes: { min: number; max: number }
    next_action_he: string
    // Phase 2.3.H — integration gate (profile + stage driven)
    integrationGate: {
        canProceed: boolean
        requirements: Array<{
            id: string
            severity: 'mandatory' | 'recommended' | 'optional'
            status: 'connected' | 'missing'
            label_he: string
            valueProp_he: string
            deepLink: string
        }>
        missingMandatoryIds: string[]
        missingRecommendedIds: string[]
    }
}

const WEBSITE_REACHABLE_TIMEOUT_MS = 8000

/**
 * Probe the Anthropic API with a minimal request to verify the key is not
 * only configured but also has live credits. We send a 1-token request
 * (haiku, "ping") and inspect the response:
 *   - 200 OK            → credits are fine
 *   - 400 + "credit_balance_too_low" message → out of credits (fail)
 *   - 401              → invalid key (fail)
 *   - 5xx / network    → unknown (warning, don't block)
 *
 * Cost ~ $0.0001 per probe — negligible. Keeps the user from burning
 * DFS budget on a misconfigured / out-of-credits key.
 */
/**
 * Probe Meta Ad Library API end-to-end. Calls ads_archive with limit=1.
 * Possible outcomes:
 *   - ok                 → app is Live + has read access (data returned, possibly empty array)
 *   - permission_denied  → app in Development mode OR no role assigned
 *                          (Facebook error code 10, subcode 2332004)
 *   - unknown            → network/timeout/etc; don't block on it
 *
 * Cost: free (Ad Library is public; rate-limited to ~200 calls/hour/app).
 */
async function probeMetaAdLibrary(
    appId: string,
    appSecret: string,
): Promise<{ status: 'ok' | 'permission_denied' | 'unknown'; hint?: string }> {
    try {
        // Meta deprecated App Access Token for ads_archive in 2024-2025;
        // prefer META_USER_ACCESS_TOKEN when set.
        const userToken = process.env.META_USER_ACCESS_TOKEN || ''
        const accessToken = userToken || `${appId}|${appSecret}`
        const url = 'https://graph.facebook.com/v18.0/ads_archive'
            + `?access_token=${encodeURIComponent(accessToken)}`
            + `&ad_reached_countries=${encodeURIComponent('["IL"]')}`
            + '&search_terms=test'
            + '&fields=id'
            + '&limit=1'
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 6000)
        const res = await fetch(url, { signal: ctrl.signal })
        clearTimeout(t)
        const body = await res.json().catch(() => null) as { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string } } | null
        if (res.ok && body && !body.error) return { status: 'ok' }
        const err = body?.error
        if (err && (err.code === 10 || err.error_subcode === 2332004 || /not have permission|App role required/i.test(err.message || ''))) {
            return {
                status: 'permission_denied',
                hint: 'ה-Facebook App במצב Development. נדרש: (1) Settings → Basic → Privacy Policy URL → לעבור ל-Live Mode (toggle בראש העמוד), או (2) App Roles → Add People → להוסיף את עצמכם כ-Developer. בלי זה Meta Ad Library יחזיר שגיאת הרשאה.',
            }
        }
        return { status: 'unknown', hint: err?.error_user_msg || err?.message || `HTTP ${res.status}` }
    } catch (e) {
        return { status: 'unknown', hint: (e as Error).message || 'network error' }
    }
}

async function probeAnthropicCredits(
    apiKey: string,
): Promise<{ status: 'ok' | 'credits_low' | 'invalid_key' | 'unknown'; message?: string }> {
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'ping' }],
            }),
            signal: AbortSignal.timeout(8000),
        })
        if (res.ok) return { status: 'ok' }
        if (res.status === 401) return { status: 'invalid_key' }
        if (res.status === 400) {
            const text = await res.text()
            if (/credit_balance_too_low|credit balance is too low|insufficient credits/i.test(text)) {
                return { status: 'credits_low', message: 'Anthropic credits exhausted' }
            }
            return { status: 'unknown', message: `400: ${text.substring(0, 100)}` }
        }
        if (res.status === 429) {
            // Rate limited at probe time — not a credit issue, treat as ok
            // (real stage runs will retry).
            return { status: 'ok', message: 'rate_limited_at_probe (key valid)' }
        }
        return { status: 'unknown', message: `HTTP ${res.status}` }
    } catch (err) {
        return { status: 'unknown', message: (err as Error).message }
    }
}

export const researchPreflight = async (c: Context) => {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
        return fail(c, 'Instance not found', 404)
    }

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return fail(c, 'Instance not found', 404)

    // Phase 2.3.H — per-agent context. Active agent's research_data + token
    // fields take precedence; falls back to instance row for legacy un-backfilled.
    const activeAgent = await resolveActiveAgent(c, instanceId)
    const stageQ = c.req.query('stage') as StageId | undefined

    const rd = ((activeAgent?.researchData ?? inst.researchData) as ResearchDataV2 | null) || {}
    const answers = (rd.answers || {}) as Record<string, unknown>
    const checks: PreflightCheck[] = []

    // ─── Check 1: websiteUrl present + valid + reachable ──
    const websiteUrl = String(answers.websiteUrl || '').trim()
    if (!websiteUrl) {
        checks.push({
            name: 'website_url',
            status: 'fail',
            label_he: 'כתובת האתר',
            actionable_hint_he: 'הזינו websiteUrl ב-onboarding או בדף "הגדרות העסק". בלי דומיין אין איך להריץ DFS competitorsDomain / on-page audit.',
        })
    } else {
        let parsedHost: string | null = null
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            parsedHost = u.hostname
        } catch { /* invalid URL */ }

        if (!parsedHost) {
            checks.push({
                name: 'website_url',
                status: 'fail',
                label_he: 'כתובת האתר',
                actionable_hint_he: `כתובת לא תקינה: "${websiteUrl}". פורמט נדרש: example.com או https://example.com`,
            })
        } else {
            // Probe reachability — HEAD with timeout. Network failure = warning
            // (could be transient or geoblocked from our IP), not fail.
            try {
                const controller = new AbortController()
                const timer = setTimeout(() => controller.abort(), WEBSITE_REACHABLE_TIMEOUT_MS)
                const probeUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
                const res = await fetch(probeUrl, {
                    method: 'HEAD',
                    redirect: 'follow',
                    signal: controller.signal,
                }).catch(() => null)
                clearTimeout(timer)
                if (res && res.ok) {
                    checks.push({
                        name: 'website_url',
                        status: 'ok',
                        label_he: `כתובת האתר \`${parsedHost}\` נגישה`,
                    })
                } else if (res) {
                    checks.push({
                        name: 'website_url',
                        status: 'warning',
                        label_he: `אתר \`${parsedHost}\` החזיר HTTP ${res.status}`,
                        actionable_hint_he: 'ייתכן שהאתר חוסם בוטים — internal_seo_audit עשוי להיכשל בחלק מ-URLs. אם האתר באוויר רגיל — להמשיך.',
                    })
                } else {
                    checks.push({
                        name: 'website_url',
                        status: 'warning',
                        label_he: `לא ניתן להגיע ל-\`${parsedHost}\``,
                        actionable_hint_he: 'אם האתר באוויר ועובד — ייתכן שהוא חוסם requests מ-IP שלנו. internal_seo_audit עשוי להיכשל.',
                    })
                }
            } catch {
                checks.push({
                    name: 'website_url',
                    status: 'warning',
                    label_he: `כתובת \`${parsedHost}\` — בדיקת נגישות נכשלה`,
                })
            }
        }
    }

    // ─── Check 2: Anthropic API key configured + has credits ──
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) {
        checks.push({
            name: 'anthropic_key',
            status: 'fail',
            label_he: 'מפתח Anthropic API לא מוגדר',
            actionable_hint_he: 'כל שלב במחקר מבצע 1-2 קריאות Anthropic. הזינו מפתח API ב-/settings/api-keys (הקישור ב-sidebar).',
        })
    } else {
        // Phase QA — actually probe Anthropic with a tiny call to verify
        // the key isn't just configured but also has live credits. This catches
        // the most painful failure mode: pipeline starts, burns DFS budget,
        // then crashes 2 min in with "credit_balance_too_low".
        const probeResult = await probeAnthropicCredits(apiKey)
        if (probeResult.status === 'ok') {
            checks.push({
                name: 'anthropic_key',
                status: 'ok',
                label_he: 'Anthropic מוגדר ו-credits זמינים ✓',
            })
        } else if (probeResult.status === 'credits_low') {
            checks.push({
                name: 'anthropic_key',
                status: 'fail',
                label_he: '🛑 Anthropic credits מוצו',
                actionable_hint_he: 'יתרת ה-credits של ה-Anthropic API שלכם נמוכה מדי או שווה לאפס. הריצה תיכשל אחרי כמה דקות. הכנסו ל-console.anthropic.com → Plans & Billing → Add credits. מחקר מלא דורש ~$10-15.',
            })
        } else if (probeResult.status === 'invalid_key') {
            checks.push({
                name: 'anthropic_key',
                status: 'fail',
                label_he: '🛑 מפתח Anthropic לא תקין',
                actionable_hint_he: 'המפתח שהזנתם נדחה ע"י Anthropic. בדקו שהוא נכון, פעיל, ולא expired ב-console.anthropic.com → API Keys.',
            })
        } else {
            // Probe failed for unknown reason (network / timeout) — don't block
            checks.push({
                name: 'anthropic_key',
                status: 'warning',
                label_he: 'Anthropic מוגדר — לא ניתן היה לאמת credits',
                actionable_hint_he: probeResult.message || 'בדיקת credits נכשלה. אם יש credits — להמשיך; אם לא — pipeline יקרוס.',
            })
        }
    }

    // ─── Check 3: DFS balance ──
    // Empirically a full cold-cache run is $1.5-$5 (not $8 as the original
    // copy claimed — that figure was a safety margin from when warm-cache
    // wasn't reliable). Warn only when actually under the realistic floor.
    const balanceCents = inst.dfsBalanceUsdCents ?? 0
    const balanceUsd = balanceCents / 100
    if (balanceUsd < 1) {
        checks.push({
            name: 'dfs_balance',
            status: 'fail',
            label_he: 'יתרת DataForSEO',
            actionable_hint_he: `יתרה נוכחית: $${balanceUsd.toFixed(2)}. לרוץ pipeline cold-cache דרושים ~$1.5-5. טענו ב-/settings/dfs.`,
        })
    } else if (balanceUsd < 3) {
        checks.push({
            name: 'dfs_balance',
            status: 'warning',
            label_he: `יתרת DFS: $${balanceUsd.toFixed(2)}`,
            actionable_hint_he: 'יתרה נמוכה. cold-cache run יכול להגיע ל-$5. מומלץ לטעון לפני הרצה ראשונה.',
        })
    } else {
        checks.push({
            name: 'dfs_balance',
            status: 'ok',
            label_he: `יתרת DFS: $${balanceUsd.toFixed(2)} ✓`,
        })
    }

    // ─── Check 4: Firecrawl key (optional, for E2.1 deep money-pages) ──
    // Phase 2.3.H/fix — read from active agent row, NOT instance (which is
    // primary's data). Otherwise secondary agent inherits primary's
    // "connected" state and integration gate falsely passes.
    const fcKey = activeAgent ? activeAgent.firecrawlKey : inst.firecrawlKey
    if (!fcKey) {
        checks.push({
            name: 'firecrawl_key',
            status: 'warning',
            label_he: 'מפתח Firecrawl לא מוגדר',
            actionable_hint_he: 'בלי Firecrawl לא נסרוק deep money-pages של מתחרים (Phase E2.1). competitor_landscape ירוץ במצב מוגבל. הוסיפו ב-/settings/integrations.',
        })
    } else {
        checks.push({
            name: 'firecrawl_key',
            status: 'ok',
            label_he: 'Firecrawl מוגדר ✓',
        })
    }

    // ─── Check: Meta App credentials (for paid_competitor_landscape stage) ──
    // Different from Meta user OAuth — Meta Ad Library is PUBLIC and uses
    // platform-level app credentials (META_APP_ID + META_APP_SECRET env
    // vars). LIVE PROBE — credentials being set is not enough; Facebook
    // also requires the app to be in Live mode AND/OR for the caller to
    // be an assigned developer/tester/admin. A "configured but blocked"
    // app silently fails at run-time, so we ping ads_archive with limit=1
    // to verify end-to-end. Cost: 1 API call, ~0ms latency, no spend.
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
        checks.push({
            name: 'meta_app_credentials',
            status: 'warning',
            label_he: 'Meta Ad Library — credentials פלטפורמה לא מוגדרים',
            actionable_hint_he: 'META_APP_ID/SECRET חסרים בשרת. בלעדם paid_competitor_landscape לא יראה רקלמות פעילות של המתחרים ב-Meta (Facebook/Instagram). פנו לתמיכה כדי שנגדיר. הסטדיה תרוץ בכל זאת — אבל בעיקר על Google Transparency + Firecrawl, וה-confidence ירד.',
        })
    } else {
        const probe = await probeMetaAdLibrary(process.env.META_APP_ID, process.env.META_APP_SECRET)
        if (probe.status === 'ok') {
            checks.push({
                name: 'meta_app_credentials',
                status: 'ok',
                label_he: 'Meta Ad Library מוגדר ✓',
            })
        } else if (probe.status === 'permission_denied') {
            checks.push({
                name: 'meta_app_credentials',
                status: 'warning',
                label_he: '⚠️ Meta App מוגדר אבל ה-Ad Library חסום',
                actionable_hint_he: probe.hint || 'ה-Facebook App במצב Development ללא הרשאות לפעולה הזו. פנו לתמיכה כדי להעביר ל-Live Mode + להוסיף Privacy Policy URL ב-Settings.',
            })
        } else {
            checks.push({
                name: 'meta_app_credentials',
                status: 'warning',
                label_he: 'Meta App לא ניתן לאמת',
                actionable_hint_he: probe.hint || 'בדיקה כשלה (תקלת רשת/timeout). אם יש credentials — להמשיך; אם לא — paid_competitor_landscape יחזיר warning.',
            })
        }
    }

    // ─── Check 5: GSC connection (optional, for striking-distance accuracy) ──
    const gscTokens = (activeAgent ? activeAgent.gscTokens : inst.gscTokens) as { refreshToken?: string; siteUrl?: string } | null
    if (!gscTokens?.refreshToken || !gscTokens.siteUrl) {
        checks.push({
            name: 'gsc_connection',
            status: 'warning',
            label_he: 'Google Search Console לא מחובר',
            actionable_hint_he: 'בלי GSC, striking-distance מבוסס על DFS estimation במקום Google data. seo_keyword_research יעבוד אבל פחות מדויק. חברו ב-/settings/integrations/google.',
        })
    } else {
        checks.push({
            name: 'gsc_connection',
            status: 'ok',
            label_he: `GSC מחובר ל-${gscTokens.siteUrl} ✓`,
        })
    }

    // ─── Check 6: business answers populated ──
    const businessName = String(answers.businessName || '').trim()
    const businessDesc = String(answers.businessDescription || '').trim()
    if (!businessName) {
        checks.push({
            name: 'business_name',
            status: 'fail',
            label_he: 'שם העסק',
            actionable_hint_he: 'מלאו businessName ב-onboarding. הוא נכלל בכל prompt — בלעדיו האסטרטגיה גנרית.',
        })
    } else if (businessDesc.length < 50) {
        checks.push({
            name: 'business_description',
            status: 'warning',
            label_he: `תיאור העסק קצר (${businessDesc.length} תווים)`,
            actionable_hint_he: 'תיאור מפורט (200+ תווים) משפר משמעותית את classifyVertical + persona quality. עדכנו ב-onboarding או דף הגדרות.',
        })
    } else {
        checks.push({
            name: 'business_setup',
            status: 'ok',
            label_he: `הגדרות עסק שלמות (${businessName})`,
        })
    }

    // ─── Check 7: Backlinks API (only relevant for legacy direct-mode DFS) ──
    // For proxy-mode (default) the Backlinks subscription rides on Flowmatic's
    // master DFS account — always active. Only show the warning to users
    // who chose to bring their own DFS account (dfsUseProxy=false), since
    // they alone are responsible for maintaining the $100/mo subscription.
    if (inst.dfsUseProxy === false) {
        checks.push({
            name: 'backlinks_subscription',
            status: 'warning',
            label_he: 'DataForSEO Backlinks subscription',
            actionable_hint_he: 'במצב מתקדם (חשבון DFS אישי) — ודאו שמנוי Backlinks פעיל ב-app.dataforseo.com/backlinks-subscription, אחרת link_audit ירוץ במצב מוגבל.',
        })
    }

    // ─── Compute totals ──
    const fails = checks.filter(c => c.status === 'fail')
    const warnings = checks.filter(c => c.status === 'warning')
    const ready = fails.length === 0
    const hasWarnings = warnings.length > 0

    // Cost estimate based on which optional integrations are present
    const dfsCostMinUsd = 1.5  // warm-cache run
    const dfsCostMaxUsd = 5.0  // cold-cache run
    const anthropicCostUsd = 8.0  // ~10 stage runs × ~$0.80 avg
    const usdToIls = 3.65
    const dfsCostIlsAvg = ((dfsCostMinUsd + dfsCostMaxUsd) / 2) * usdToIls
    const anthropicCostIls = anthropicCostUsd * usdToIls

    const next_action_he = !ready
        ? `יש לתקן ${fails.length} ${fails.length === 1 ? 'שגיאה קריטית' : 'שגיאות קריטיות'} לפני הרצת pipeline. ראו checklist למעלה.`
        : hasWarnings
        ? `הכל מוכן להרצה, אך יש ${warnings.length} אזהרות שעשויות להגביל את איכות התוצאות. ניתן להמשיך — חלק מהשלבים ירוצו במצב מוגבל.`
        : 'הכל מוכן להרצה ב-pipeline מלא. הקליקו "Run all" או הריצו שלב אחרי שלב.'

    // Phase 2.3.K — load agent_integrations rows for brave/wordpress/etc.
    // (integrations stored as rows rather than typed columns).
    const __agentType = getPrimaryAgent((inst.selectedComponents as string[]) || [])
    const intRows = await getAgentIntegrations(instanceId, __agentType, activeAgent?.id)
    const integrationsMap: Record<string, { connected: boolean; config?: Record<string, unknown> }> = {}
    for (const r of intRows) {
        integrationsMap[r.integrationType] = {
            connected: r.status === 'connected',
            config: r.config,
        }
    }

    // Phase 2.3.H — integration gate (profile + stage driven)
    const gate = buildPreflight(
        { instance: inst, agent: activeAgent, integrations: integrationsMap },
        answers as Record<string, string | undefined>,
        stageQ,
    )

    const result: PreflightResult = {
        ready: ready && gate.canProceed,
        has_warnings: hasWarnings || gate.missingRecommended.length > 0,
        checks,
        estimated_cost_ils: {
            dfs: Math.round(dfsCostIlsAvg),
            anthropic: Math.round(anthropicCostIls),
            total: Math.round(dfsCostIlsAvg + anthropicCostIls),
        },
        estimated_duration_minutes: {
            min: 60,
            max: 95,
        },
        next_action_he,
        integrationGate: {
            canProceed: gate.canProceed,
            requirements: gate.requirements.map(r => ({
                id: r.id,
                severity: r.severity,
                status: r.status,
                label_he: r.label_he,
                valueProp_he: r.valueProp_he,
                deepLink: r.deepLink,
            })),
            missingMandatoryIds: gate.missingMandatory.map(r => r.id),
            missingRecommendedIds: gate.missingRecommended.map(r => r.id),
        },
    }

    return ok(c, result, 'Preflight check complete')
}