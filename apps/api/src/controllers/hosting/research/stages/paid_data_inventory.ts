/**
 * Stage: paid_data_inventory (Phase 4.1, NEW)
 *
 * Maps connected integrations + tracking state to a paid-readiness tier
 * (T0-T4) and produces an executable action roadmap. Prerequisite for
 * paid_audit (which behaves differently per tier: cold setup roadmap vs
 * warm takeover audit) and paid_media_plan (bidding ladder gated by tier).
 *
 * Pure inventory + classification — no Anthropic calls. Cheap, fast,
 * deterministic. Re-run frequently (after each integration connects) to
 * see tier movement.
 */

import type { Context } from 'hono'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../../authHelper'
import {
    acquireResearchLock,
    releaseResearchLock,
} from '@/services/research/stageExecutor'
import { markWrapperStageCompleted } from './_wrapperHelpers'
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const __agentForLock = await resolveActiveAgent(c, instanceId)
    const lock = acquireResearchLock(instanceId, 'paid_data_inventory', __agentForLock?.id)
    if (!lock.acquired) {
        return fail(c, `שלב מחקר כבר רץ כרגע. נסו שוב בעוד ${lock.secondsLeft} שניות.`, 429)
    }

    try {
        // Phase 2026.02 — resolve active agent FIRST so the inventory service
        // reads from the right agent's research_data + integrations. Without
        // this, on multi-agent VPS the service reads primary's data and writes
        // to the active agent — causing fork_path=null + wrong-tier outputs
        // (the bug Sergei caught on Packing Station vs Storage Station primary).
        const __agent = await resolveActiveAgent(c, instanceId)
        const { runPaidDataInventory } = await import('@/services/paidDataInventory')
        const inventory = await runPaidDataInventory(instanceId, __agent?.id || null)

        // Persist to rd.paidDataInventory for downstream consumers (paid_audit,
        // paid_media_plan, UI panels). Multi-tenant safe via agentContext.
        const rd = await readResearchData(__agent, instanceId) as Record<string, unknown>
        await writeResearchData(__agent, instanceId, { ...rd, paidDataInventory: inventory })

        // Hebrew summary for UI pipeline panel
        const tierLabels: Record<string, string> = {
            T0: 'T0 — cold start (אין חשבון פרסום או אפס היסטוריה)',
            T1: 'T1 — data-thin (פחות מ-10 המרות ב-30 ימים)',
            T2: 'T2 — warming (10-29 המרות, Max Conversions זמין)',
            T3: 'T3 — zombie (היסטוריה ישנה, נדרשת תחילה מחדש)',
            T4: 'T4 — בוגר (≥30 המרות + תשתית תקינה, tCPA יציב)',
        }
        const summaryMd = `# מלאי נתונים — פרסום ממומן

**Tier נוכחי:** ${tierLabels[inventory.tier] || inventory.tier}

${inventory.tierRationaleHe}

**פעולות נדרשות:** ${inventory.summary.criticalGaps} קריטיות · ${inventory.summary.recommendedGaps} מומלצות · ${inventory.summary.advancedGaps} מתקדמות

**עלות setup חודשית משוערת:** ₪${inventory.summary.estimatedSetupCostMonthlyIls} / חודש
**ימים משוערים ל-tier הבא:** ${inventory.summary.estimatedDaysToNextTier ?? 'ב-tier הגבוה ביותר'}`

        const extras = {
            tier: inventory.tier,
            tier_rationale_he: inventory.tierRationaleHe,
            tier_warnings: inventory.tierWarnings || [],
            fork_path: inventory.forkPath || null,
            fork_has_integration: inventory.forkHasIntegration ?? null,
            adapters_summary: {
                connected: inventory.adapters.filter(a => a.connected).length,
                total: inventory.adapters.length,
                critical_connected: inventory.adapters.filter(a => a.severity === 'critical' && a.connected).length,
                critical_total: inventory.adapters.filter(a => a.severity === 'critical').length,
            },
            capabilities_available_count: inventory.capabilities.available.length,
            capabilities_blocked_count: inventory.capabilities.blocked.length,
            estimated_setup_cost_monthly_ils: inventory.summary.estimatedSetupCostMonthlyIls,
        }
        const confidence: 'high' | 'medium' | 'working_hypothesis' =
            inventory.summary.criticalGaps === 0 ? 'high' :
            inventory.summary.criticalGaps <= 2 ? 'medium' : 'working_hypothesis'

        // Surface as records[] so the unified pipeline UI renders action items
        await markWrapperStageCompleted({
            instanceId,
            stageId: 'paid_data_inventory',
            summaryMd,
            integrationsUsed: [],
            agentId: __agent?.id,
            records: inventory.actions as unknown[],
            extras,
            confidence,
        })

        releaseResearchLock(instanceId)
        // Return the SAME shape the generic stage runner returns so the frontend
        // result panel renders immediately (was { inventory } → content undefined
        // → "אין תוכן" until a page reload re-read the saved summary).
        return ok(c, {
            stageId: 'paid_data_inventory',
            content: summaryMd,
            records: inventory.actions,
            extras,
            confidence,
            status: { state: 'completed', runAt: new Date().toISOString() },
            inventory,
        }, 'Paid data inventory ready')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/paid_data_inventory] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}