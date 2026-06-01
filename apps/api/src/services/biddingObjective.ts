/**
 * Bidding Objective — the tenant's chosen paid-ads GOAL, plus our recommended
 * default for non-expert users.
 *
 * Goal-based, not strategy-based: the user picks a BUSINESS objective and the
 * system manages the bidding lifecycle (cold-start on Maximize Conversions →
 * auto-transition to Target ROAS / Target CPA once there's enough conversion
 * data). This avoids the trap of setting tROAS/tCPA before the algorithm has
 * data to learn from.
 *
 * Stored at research_data.biddingObjective (per-agent, via mutateResearchData
 * — never a raw db.update, per feedback_research_data_dual_write).
 *
 * Consumed by bidTransitionRunner: when a launched campaign hits its conversion
 * gate, the proposed transition's target strategy + value come from here. For
 * IMPORTED/existing campaigns (no bidContract) the objective is recorded and
 * applied via a separate explicit action — see the follow-up apply path.
 */

export type BiddingGoal = 'max_sales' | 'target_roas' | 'target_cpa'

export interface BiddingObjective {
    goal: BiddingGoal
    targetRoasPct?: number   // e.g. 400 = 4.0× (only when goal=target_roas)
    targetCpaIls?: number    // only when goal=target_cpa
    source: 'user' | 'recommended'
    recommended?: boolean    // was this our recommended default
    rationaleHe?: string
    chosenAt: string
    chosenBy?: string
}

export interface ObjectiveTransition {
    toStrategy: 'MAXIMIZE_CONVERSIONS' | 'MAXIMIZE_CONVERSION_VALUE' | 'TARGET_ROAS' | 'TARGET_CPA'
    targetRoas?: number       // decimal (4.0), for the Google Ads API
    targetCpaIls?: number
    triggerConvCount: number  // conversions needed before transitioning
}

// tROAS needs a denser value signal than tCPA before it bids well.
const TROAS_MIN_CONV = 50
const TCPA_MIN_CONV = 30

/**
 * Map a chosen objective → the transition the auto-runner should apply once the
 * conversion gate is met. max_sales never leaves value/conversion maximization.
 */
export function getTransitionForObjective(obj: BiddingObjective): ObjectiveTransition {
    switch (obj.goal) {
        case 'target_roas':
            return {
                toStrategy: 'TARGET_ROAS',
                targetRoas: obj.targetRoasPct ? obj.targetRoasPct / 100 : 4.0,
                triggerConvCount: TROAS_MIN_CONV,
            }
        case 'target_cpa':
            return {
                toStrategy: 'TARGET_CPA',
                targetCpaIls: obj.targetCpaIls,
                triggerConvCount: TCPA_MIN_CONV,
            }
        case 'max_sales':
        default:
            // Value-based maximization, no target ceiling — pure volume at best ROAS.
            return { toStrategy: 'MAXIMIZE_CONVERSION_VALUE', triggerConvCount: TCPA_MIN_CONV }
    }
}

export interface RecommendInputs {
    last30dConversions: number     // account purchases/leads in last 30d
    avgOrderValueIls?: number
    aovVaries?: boolean            // order value varies meaningfully → value-based fits
    primaryGoal?: string           // paidProfile.primaryGoal / scenario goal
}

/**
 * Our recommended default for users who don't want to decide. Conservative and
 * data-aware: don't recommend a target the account can't yet sustain.
 */
export function recommendBiddingObjective(inp: RecommendInputs, nowIso: string): BiddingObjective {
    const ecommerce = (inp.primaryGoal || '').toLowerCase().includes('ecommerce')
    const enoughForValue = inp.last30dConversions >= TROAS_MIN_CONV

    // Ecommerce with varied order values + enough data → Target ROAS is the
    // right end-state. Below the data threshold, start on max_sales and let the
    // auto-transition flip to tROAS once data accrues.
    if (ecommerce && inp.aovVaries !== false) {
        if (enoughForValue) {
            return {
                goal: 'target_roas',
                targetRoasPct: 400,
                source: 'recommended',
                recommended: true,
                rationaleHe: `מומלץ: Target ROAS 400% — לחנות עם ערכי הזמנה משתנים ו-${inp.last30dConversions} המרות/30 יום יש מספיק נתונים להצעות-מחיר מבוססות-ערך.`,
                chosenAt: nowIso,
            }
        }
        return {
            goal: 'max_sales',
            source: 'recommended',
            recommended: true,
            rationaleHe: `מומלץ: מקסימום מכירות עכשיו (רק ${inp.last30dConversions} המרות/30 יום) — נעבור אוטומטית ל-Target ROAS לאחר ~${TROAS_MIN_CONV} רכישות, כשיהיו מספיק נתונים.`,
            chosenAt: nowIso,
        }
    }

    // Lead-gen / non-ecommerce → CPA target once there's data; else max volume.
    if (inp.last30dConversions >= TCPA_MIN_CONV && inp.avgOrderValueIls) {
        return {
            goal: 'target_cpa',
            targetCpaIls: Math.round(inp.avgOrderValueIls * 0.3),
            source: 'recommended',
            recommended: true,
            rationaleHe: `מומלץ: Target CPA — יש מספיק המרות (${inp.last30dConversions}/30 יום) לייצוב עלות לרכישה.`,
            chosenAt: nowIso,
        }
    }
    return {
        goal: 'max_sales',
        source: 'recommended',
        recommended: true,
        rationaleHe: `מומלץ: מקסימום המרות עכשיו — נצברו נתונים ונעבור לאסטרטגיית יעד כשיהיו מספיק.`,
        chosenAt: nowIso,
    }
}

/** Persist the chosen objective (safe write). */
export async function setBiddingObjective(instanceId: string, agentId: string | null, obj: BiddingObjective): Promise<void> {
    const { resolveAgentById, resolvePrimaryAgent, mutateResearchData } = await import('./agentContext')
    const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
    await mutateResearchData(agent, instanceId, (rd: any) => {
        const c = rd || {}
        c.biddingObjective = obj
        return c
    })
}