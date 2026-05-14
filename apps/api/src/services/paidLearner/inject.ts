/**
 * Paid Performance Loop — injector.
 *
 * Phase 4.3 — Read top-confidence learnings + render as a Hebrew block
 * that opusAudit embeds in its prompt. The block tells Opus "here's what
 * we've LEARNED from past hypotheses on this account — use this signal
 * to decide whether to re-propose similar things or pivot".
 *
 * Disciplined output:
 *   - At most 8 insights (avoid token bloat)
 *   - Only confidence ≥ medium (no noise injection)
 *   - Inject ONLY recent learnings (window_end within last 60 days)
 *   - Cross-code insight (engine-wide accuracy) ALWAYS surfaced
 *     if exists — sets the calibration baseline for Opus
 */

import { eq, and, sql, gte, desc } from 'drizzle-orm'
import { db } from '@/db'
import { paidLearnings } from '@/db/schema'

export interface LearnerBlock {
    /** Has any learnings worth injecting. */
    hasLearnings: boolean
    /** Number of insights bundled. */
    insightCount: number
    /** Rendered prompt block (Hebrew). Empty when hasLearnings=false. */
    promptBlock: string
    /** Most-recent window covered by the learnings. */
    windowEnd?: string
}

const MAX_LEARNINGS_TO_INJECT = 8
const MAX_AGE_DAYS = 60

export async function fetchLearningsForInjection(instanceId: string): Promise<LearnerBlock> {
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
    const cutoffIso = cutoff.toISOString().slice(0, 10)

    const rows = await db.select()
        .from(paidLearnings)
        .where(and(
            eq(paidLearnings.instanceId, instanceId),
            eq(paidLearnings.injectIntoPrompts, true),
            gte(paidLearnings.windowEnd, cutoffIso),
        ))
        .orderBy(
            // Prefer cross_code first, then by sample size descending
            sql`CASE WHEN grouping = 'cross_code' THEN 0 ELSE 1 END`,
            desc(paidLearnings.sampleSize),
            desc(paidLearnings.windowEnd),
        )
        .limit(MAX_LEARNINGS_TO_INJECT)

    if (rows.length === 0) {
        return { hasLearnings: false, insightCount: 0, promptBlock: '' }
    }

    const crossCode = rows.find(r => r.grouping === 'cross_code')
    const perCode = rows.filter(r => r.grouping !== 'cross_code')

    const lines: string[] = []
    lines.push('═══ PAID PERFORMANCE LOOP — Learnings from past hypothesis outcomes ═══')
    lines.push('')
    lines.push(`Window: covering up to ${MAX_AGE_DAYS} days back. ${rows.length} confident learnings available.`)
    lines.push('')

    if (crossCode) {
        lines.push(`**Engine-wide calibration:** ${crossCode.insightHe}`)
        lines.push('')
    }

    if (perCode.length > 0) {
        lines.push('**Per-hypothesis learnings (use to weight future proposals):**')
        for (const r of perCode) {
            const conf = r.confidence
            lines.push(`  • [${conf}] ${r.insightHe}`)
        }
        lines.push('')
    }

    lines.push('USE THIS TO REASON:')
    lines.push('- If a hypothesis CODE has high validation_rate → propose VARIATIONS confidently')
    lines.push('- If LOW validation_rate (≤20%) → AVOID re-proposing same code unless data has changed significantly')
    lines.push('- If high inconclusive_rate → suggest hypotheses with LARGER test_window_days or HIGHER min_conv threshold')
    lines.push('- If high decline_rate → user not resonating with the angle — try a different framing OR escalate severity tier')
    lines.push('- Cross-code engine-wide rate sets your baseline: if it\'s 30%, that\'s the noise floor — don\'t over-promise.')

    return {
        hasLearnings: true,
        insightCount: rows.length,
        promptBlock: lines.join('\n'),
        windowEnd: rows[0].windowEnd as unknown as string,
    }
}