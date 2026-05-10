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

    // ─── Check 3: DFS balance > $5 (basic threshold for warm pipeline) ──
    const balanceCents = inst.dfsBalanceUsdCents ?? 0
    const balanceUsd = balanceCents / 100
    if (balanceUsd < 1) {
        checks.push({
            name: 'dfs_balance',
            status: 'fail',
            label_he: 'יתרת DataForSEO',
            actionable_hint_he: `יתרה נוכחית: $${balanceUsd.toFixed(2)}. לרוץ pipeline cold-cache דרושים ~$5-8. טענו ב-/settings/dfs.`,
        })
    } else if (balanceUsd < 8) {
        checks.push({
            name: 'dfs_balance',
            status: 'warning',
            label_he: `יתרת DFS: $${balanceUsd.toFixed(2)}`,
            actionable_hint_he: 'יתרה נמוכה. cold-cache run עלול להיתקע באמצע אם cache miss בכל השלבים. מומלץ $8+ למחקר ראשון.',
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

    // ─── Check 7: Backlinks API (optional, for deep link_audit) ──
    // We check by attempting a lightweight DFS call only at run-time. For
    // pre-flight, we surface an informational note so user knows which
    // stages will run in degraded mode.
    checks.push({
        name: 'backlinks_subscription',
        status: 'warning',
        label_he: 'DataForSEO Backlinks subscription',
        actionable_hint_he: 'אם המנוי לא פעיל — link_audit ירוץ במצב מוגבל (soft-fail). הפעלה: app.dataforseo.com/backlinks-subscription. ' +
            'בלי זה תקבלו רק link_gap_targets generic ולא יוצרים outreach plan ספציפי.',
    })

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

    // Phase 2.3.H — integration gate (profile + stage driven)
    const gate = buildPreflight(
        { instance: inst, agent: activeAgent },
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