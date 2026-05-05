/**
 * Instance data wipe helpers — single source of truth for the three
 * "Danger Zone" reset levels (matching dashboard UI):
 *
 *   - הפעלה מחדש (restart)  — SSH + systemctl restart gateway. No DB ops.
 *   - איפוס הגדרות (reset)  — wipe agent-generated downstream, KEEP profile
 *                              + research stages + integrations + knowledge
 *                              + WhatsApp data
 *   - הסירו סוכן (remove)   — wipe EVERYTHING tied to this instance, except
 *                              the instance row + user (so VPS subscription
 *                              keeps running and user can re-onboard)
 *
 * All wipes are by instanceId. Tables have instance_id FK with onDelete:
 * 'cascade', so cross-table cascades happen automatically when the parent
 * row goes — but we delete explicitly here to keep the wipe scoped without
 * removing the instance row itself.
 */

import { eq, notInArray, and } from 'drizzle-orm'
import { db } from '@/db'
import {
    instances,
    agentOutputs,
    brandBooks,
    contentPlanMedia,
    creativeRenders,
    creativeReferences,
    creativePerformance,
    platformCreativeMappings,
    creativeHypotheses,
    creativeFatigueAlerts,
    agentIntegrations,
    waContacts,
    waTemplates,
    waSends,
    knowledgeDocuments,
    knowledgeChunks,
    strategyLearnings,
} from '@/db/schema'

export interface WipeReport {
    agentOutputs: number
    brandBooks: number
    contentPlanMedia: number
    creativeRenders: number
    creativeReferences: number
    creativePerformance: number
    platformCreativeMappings: number
    creativeHypotheses: number
    creativeFatigueAlerts: number
    strategyLearnings: number
    agentIntegrations: number
    waContacts: number
    waTemplates: number
    waSends: number
    knowledgeDocuments: number
    knowledgeChunks: number
    researchDataReset: 'full' | 'strategy_only' | 'preserved'
}

// Tables that always get wiped on both reset + remove (agent-generated content)
async function wipeAgentGenerated(instanceId: string, report: Partial<WipeReport>): Promise<void> {
    // agent_outputs: keep `published` (already sent out) + `archived` (user-explicit)
    const o = await db.delete(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, instanceId),
            notInArray(agentOutputs.status, ['published', 'archived']),
        ))
        .returning({ id: agentOutputs.id })
    report.agentOutputs = o.length

    // brandBooks: full wipe — brand strategy is downstream of profile/research
    const bb = await db.delete(brandBooks).where(eq(brandBooks.instanceId, instanceId)).returning({ id: brandBooks.id })
    report.brandBooks = bb.length

    // Creative chain (renders → performance/mappings cascade automatically,
    // but we delete explicit for traceability)
    const cm = await db.delete(creativePerformance).where(eq(creativePerformance.instanceId, instanceId)).returning({ id: creativePerformance.id })
    report.creativePerformance = cm.length
    const pm = await db.delete(platformCreativeMappings).where(eq(platformCreativeMappings.instanceId, instanceId)).returning({ id: platformCreativeMappings.id })
    report.platformCreativeMappings = pm.length
    const cr = await db.delete(creativeRenders).where(eq(creativeRenders.instanceId, instanceId)).returning({ id: creativeRenders.id })
    report.creativeRenders = cr.length
    const cref = await db.delete(creativeReferences).where(eq(creativeReferences.instanceId, instanceId)).returning({ id: creativeReferences.id })
    report.creativeReferences = cref.length
    const ch = await db.delete(creativeHypotheses).where(eq(creativeHypotheses.instanceId, instanceId)).returning({ id: creativeHypotheses.id })
    report.creativeHypotheses = ch.length
    const cfa = await db.delete(creativeFatigueAlerts).where(eq(creativeFatigueAlerts.instanceId, instanceId)).returning({ id: creativeFatigueAlerts.id })
    report.creativeFatigueAlerts = cfa.length

    // Content plan media (queued/generating drafts that haven't been ingested into agent_outputs yet)
    const cpm = await db.delete(contentPlanMedia).where(eq(contentPlanMedia.instanceId, instanceId)).returning({ id: contentPlanMedia.id })
    report.contentPlanMedia = cpm.length

    // Strategy learnings (auto-extracted weekly, derived from creative performance)
    const sl = await db.delete(strategyLearnings).where(eq(strategyLearnings.instanceId, instanceId)).returning({ id: strategyLearnings.id })
    report.strategyLearnings = sl.length
}

const STRATEGY_KEYS = [
    'strategyStage1', 'strategyStage2', 'strategyStage3', 'strategyStage4',
    'strategyStage1GeneratedAt', 'strategyStage2GeneratedAt', 'strategyStage3GeneratedAt', 'strategyStage4GeneratedAt',
    'strategyStage3Warnings',
    'strategy', 'strategyGeneratedAt',
    'strategySummary', 'strategySummaryGeneratedAt',
    'scenarios', 'scenariosGeneratedAt',
    'chosenScenario', 'chosenScenarioAt',
    'mediaPlan', 'mediaPlanGeneratedAt',
    'mazhirAudit', 'mazhirAuditGeneratedAt', 'mazhirAuditDiff', 'lastMonthlyReauditAt',
    'paidProfile', 'contentPlan',
] as const

/**
 * "איפוס הגדרות" — Reset Settings
 *
 * Keeps: profile (researchData.answers) + research stages (researchStage1-4)
 *      + agentIntegrations (OAuth) + knowledge docs + WA data
 * Wipes: strategy + brand + content plan + creative + outputs + learnings
 */
export async function resetInstanceSettings(instanceId: string): Promise<WipeReport> {
    const report: Partial<WipeReport> = {
        agentIntegrations: 0,
        waContacts: 0,
        waTemplates: 0,
        waSends: 0,
        knowledgeDocuments: 0,
        knowledgeChunks: 0,
        researchDataReset: 'strategy_only',
    }

    await wipeAgentGenerated(instanceId, report)

    // Strip strategy + downstream keys from researchData JSON. Preserve
    // `answers` (profile) + research stages.
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (inst) {
        const rd = (inst.researchData as Record<string, unknown>) || {}
        const cleaned: Record<string, unknown> = {}
        // Keep profile + research stages — drop everything else strategy-onwards
        for (const [key, val] of Object.entries(rd)) {
            const isStrategy = (STRATEGY_KEYS as readonly string[]).includes(key)
            if (!isStrategy) cleaned[key] = val
        }
        await db.update(instances)
            .set({ researchData: cleaned as never })
            .where(eq(instances.id, instanceId))
    }

    return report as WipeReport
}

/**
 * "הסירו סוכן" — Remove Agent (full wipe)
 *
 * Wipes everything tied to instanceId. Does NOT delete the instance row
 * (caller decides whether instance survives or gets terminated separately).
 */
export async function fullyWipeInstance(instanceId: string): Promise<WipeReport> {
    const report: Partial<WipeReport> = { researchDataReset: 'full' }

    await wipeAgentGenerated(instanceId, report)

    // Knowledge: chunks first (FK to documents), then docs
    const kc = await db.delete(knowledgeChunks).where(eq(knowledgeChunks.instanceId, instanceId)).returning({ id: knowledgeChunks.id })
    report.knowledgeChunks = kc.length
    const kd = await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.instanceId, instanceId)).returning({ id: knowledgeDocuments.id })
    report.knowledgeDocuments = kd.length

    // WhatsApp
    const ws = await db.delete(waSends).where(eq(waSends.instanceId, instanceId)).returning({ id: waSends.id })
    report.waSends = ws.length
    const wt = await db.delete(waTemplates).where(eq(waTemplates.instanceId, instanceId)).returning({ id: waTemplates.id })
    report.waTemplates = wt.length
    const wc = await db.delete(waContacts).where(eq(waContacts.instanceId, instanceId)).returning({ id: waContacts.id })
    report.waContacts = wc.length

    // Integrations (OAuth) — full nuke on remove-agent
    const ai = await db.delete(agentIntegrations).where(eq(agentIntegrations.instanceId, instanceId)).returning({ id: agentIntegrations.id })
    report.agentIntegrations = ai.length

    // Reset researchData entirely + clear OpenClaw config
    await db.update(instances)
        .set({
            researchData: {} as never,
            onboardingStep: 0,
            onboardingCompleted: false,
        })
        .where(eq(instances.id, instanceId))

    return report as WipeReport
}