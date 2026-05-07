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
import type { ResearchDataV2 } from '@/services/research/types'

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
}

const WEBSITE_REACHABLE_TIMEOUT_MS = 8000

export const researchPreflight = async (c: Context) => {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) {
        return fail(c, 'Instance not found', 404)
    }

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return fail(c, 'Instance not found', 404)

    const rd = (inst.researchData as ResearchDataV2 | null) || {}
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

    // ─── Check 2: Anthropic API key configured ──
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) {
        checks.push({
            name: 'anthropic_key',
            status: 'fail',
            label_he: 'מפתח Anthropic API',
            actionable_hint_he: 'כל שלב במחקר מבצע 1-2 קריאות Anthropic. הזינו מפתח API ב-/settings/api-keys (הקישור ב-sidebar).',
        })
    } else {
        checks.push({
            name: 'anthropic_key',
            status: 'ok',
            label_he: 'מפתח Anthropic מוגדר',
        })
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
    if (!inst.firecrawlKey) {
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
    const gscTokens = inst.gscTokens as { refreshToken?: string; siteUrl?: string } | null
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

    const result: PreflightResult = {
        ready,
        has_warnings: hasWarnings,
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
    }

    return ok(c, result, 'Preflight check complete')
}