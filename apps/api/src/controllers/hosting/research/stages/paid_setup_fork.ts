/**
 * Stage: paid_setup_fork (Phase 2026.02, NEW)
 *
 * Explicit user choice that locks the paid pipeline path:
 *   - 'no_history'   → Path A (paid_questionnaire → setup_roadmap)
 *   - 'has_history'  → Path B (paid_data_inventory + client_account_baseline,
 *                              or paid_csv_ingest if OAuth not connected)
 *
 * Per playbook §1 — auto-detection is wrong ~25% of the time. A single
 * explicit click beats clever inference (a tenant with OAuth + 200 old
 * historical campaigns is NOT warm; a tenant with no OAuth at ₪40K/month
 * spend IS warm).
 *
 * Body shape:
 *   POST /hosting/instances/:id/research/stage/paid_setup_fork
 *   { path: 'no_history' | 'has_history' }
 *
 * Writes:
 *   rd.results.paid_setup_fork = {
 *     records: [],
 *     extras: {
 *       path: 'no_history' | 'has_history',
 *       has_integration: boolean,        // auto-detected (Google Ads OAuth || Meta token)
 *       chosen_by_user: true,
 *       committed_at: ISO,
 *     }
 *   }
 *
 * Idempotent: re-running with same path is a no-op. Switching path requires
 * an explicit reset (`?reset=1`) which clears downstream paid stage results.
 */

import type { Context } from 'hono'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../../authHelper'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'
import { markWrapperStageCompleted } from './_wrapperHelpers'
import type { ResearchDataV2, StageId, StageStatus } from '@/services/research/types'

type ForkPath = 'no_history' | 'has_history'

interface ForkBody {
    path?: ForkPath
}

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const body = await c.req.json<ForkBody>().catch(() => ({} as ForkBody))
    const path = body.path
    if (path !== 'no_history' && path !== 'has_history') {
        return fail(c, 'יש לבחור מסלול: no_history (מתחילים מאפס) או has_history (יש קמפיינים פעילים או היסטוריה).', 400)
    }

    const agent = await resolveActiveAgent(c, instanceId)
    const rd = (await readResearchData(agent, instanceId)) as unknown as ResearchDataV2

    // Reset support — if user explicitly resets, wipe downstream paid stage
    // results so the pipeline re-runs from clean state.
    const reset = c.req.query('reset') === '1'
    const existing = (rd.results as Record<string, { extras?: { path?: string } }> | undefined)?.paid_setup_fork
    if (existing && existing.extras?.path && existing.extras.path !== path && !reset) {
        return fail(
            c,
            'מסלול הפרסום כבר נקבע. כדי לשנות הוסיפו ?reset=1 — פעולה זו תאפס את שלבי הפרסום שכבר רצו.',
            409,
        )
    }

    // Auto-detect integration state. Used by downstream to decide whether
    // to route Path B → live API (paid_data_inventory + client_account_baseline)
    // or → CSV ingest (paid_csv_ingest + client_account_baseline_csv).
    const hasIntegration = detectHasIntegration(agent)

    // Build updated research_data with fork record + status update.
    const results = ((rd.results as Record<string, unknown>) || {}) as Record<string, unknown>
    const plan = (rd.plan as { stages?: StageId[]; status?: Record<StageId, StageStatus> } | undefined) || {}
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>

    // If reset, clear results for all downstream paid stages so the user has
    // to re-run them with the new path. Keeps stale data from leaking.
    if (reset && existing) {
        const downstreamStages: StageId[] = [
            'paid_data_inventory',
            'client_account_baseline',
            'paid_questionnaire',
            'paid_csv_ingest',
            'client_account_baseline_csv',
            'paid_competitor_landscape',
            'paid_keyword_research',
            'paid_budget_scenarios',
            'paid_audit',
        ]
        for (const s of downstreamStages) {
            delete results[s]
            delete status[s]
        }
    }

    const runAt = new Date().toISOString()
    results.paid_setup_fork = {
        content: summaryMd(path, hasIntegration),
        source: 'user_choice',
        runAt,
        integrationsUsed: [],
        records: [],
        extras: {
            path,
            has_integration: hasIntegration,
            chosen_by_user: true,
            committed_at: runAt,
        },
        confidence: 'high',
    }
    status.paid_setup_fork = { state: 'completed', runAt }

    await writeResearchData(agent, instanceId, {
        ...rd,
        results,
        plan: { ...plan, status },
    } as unknown as Record<string, unknown>)

    console.log(`[research/paid_setup_fork] ${instanceId} agent=${agent?.id} path=${path} has_integration=${hasIntegration} reset=${reset}`)

    return ok(c, {
        path,
        has_integration: hasIntegration,
        next_stage: nextStageHint(path, hasIntegration),
    }, 'מסלול הפרסום נשמר.')
}

/**
 * Detects whether the active agent has either Google Ads OAuth or Meta
 * token wired. Live API path is preferred when available — CSV ingest is
 * the fallback for has_history tenants without integration.
 */
function detectHasIntegration(agent: { googleTokens?: unknown; metaTokens?: unknown } | null): boolean {
    if (!agent) return false
    const gt = agent.googleTokens as { scopes?: string; scope?: string } | null
    const mt = agent.metaTokens as { adAccountId?: string; adAccounts?: unknown[]; grantedScopes?: string } | null
    const googleConnected = !!gt && ((gt.scopes || gt.scope || '').toString().toLowerCase().includes('adwords') ||
        (gt.scopes || gt.scope || '').toString().toLowerCase().split(/[\s,]+/).includes('ads'))
    const metaConnected = !!mt && (!!mt.adAccountId || (Array.isArray(mt.adAccounts) && mt.adAccounts.length > 0) ||
        (mt.grantedScopes || '').toString().toLowerCase().includes('ads_management'))
    return googleConnected || metaConnected
}

/**
 * Tells the frontend which stage the user should be guided to next, based
 * on the fork choice + auto-detected integration state.
 */
function nextStageHint(path: ForkPath, hasIntegration: boolean): StageId {
    if (path === 'no_history') return 'paid_questionnaire'
    if (hasIntegration) return 'paid_data_inventory'
    return 'paid_csv_ingest'
}

function summaryMd(path: ForkPath, hasIntegration: boolean): string {
    if (path === 'no_history') {
        return `# הגדרת פרסום — מתחילים מאפס

**מסלול שנבחר:** ${path} (אין היסטוריה משמעותית של פרסום ממומן)

השלב הבא: שאלון paid_questionnaire — ${`12 שדות סטנדרטיים`}.
לאחר השאלון: setup_roadmap של 14 ימים על בסיס §1.2 של playbook.`
    }
    return `# הגדרת פרסום — יש היסטוריה / קמפיינים פעילים

**מסלול שנבחר:** ${path}
**מצב חיבור (auto-detected):** ${hasIntegration ? 'מחובר (Google Ads / Meta OAuth)' : 'לא מחובר — נדרשת העלאת CSV'}

השלב הבא: ${hasIntegration ? 'paid_data_inventory (קריאה ישירה מה-API)' : 'paid_csv_ingest (העלאת 4-6 קבצי CSV)'}.
בהמשך: client_account_baseline${hasIntegration ? '' : '_csv'} → paid_competitor_landscape → paid_keyword_research → paid_audit.`
}