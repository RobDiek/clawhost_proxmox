/**
 * Stamp monthly-plan link/outreach tasks with the deterministic per-link plan
 * (target money page, planned anchor + type, ₪cost by DR tier, build sequence)
 * derived by the link_audit post-processor.
 *
 * Reuses augmentLinkAuditRecords verbatim — we build a pseudo-record from each
 * link task's own prospect domain (the real domain is in the task title/summary
 * even when the link_audit records were anonymized), enrich the set, and map
 * the computed fields back onto the tasks. No logic duplication, no LLM, no IO.
 *
 * Idempotent + additive: only adds fields to link/outreach tasks; other tasks
 * and other fields are untouched. Safe to run in-place on an existing plan and
 * as a post-step after monthly-plan generation.
 *
 * Plan-context: roadmap/external-links-upgrade.md
 */

import { augmentLinkAuditRecords } from '@/services/research/stagePostProcessors/link_audit'

interface LinkTaskLike {
    title?: string
    summary?: string
    channel?: string
    type?: string
    priority?: string
    [k: string]: unknown
}

// Fields this stamp owns — stripped before each run so re-stamping is fully
// idempotent and self-correcting (a task that no longer classifies as a link
// task loses its stale link fields).
const LINK_STAMP_FIELDS = [
    'estimatedCostIls', 'targetPage', 'anchorKeyword', 'anchorType',
    'prospectDr', 'linkTier', 'linkSequence', 'linkMonth',
] as const

// Genuine external-link tasks: outreach / lost-link recovery / citations /
// anchor remediation. Excludes INTERNAL links, schema, and competitive
// monitoring tasks (which mention "backlinks"/"links" but acquire nothing).
function isLinkTask(t: LinkTaskLike): boolean {
    const text = `${t.title || ''} ${t.summary || ''}`
    // Hard excludes — these mention links but are NOT link acquisition.
    if (/קישור(ים)? פנימי|internal link|סכמ[הת]|schema|videoobject|ניטור|monitor|תחרות[יו]|competitive|wayback|transparency/i.test(text)) return false
    // Genuine acquisition / recovery / anchor remediation phrases.
    const acq = /שחזור קישור|פניית outreach|פנייה לשחזור|link[ _-]?gap|הגשת citation|citation:|פיץ['׳] ?PR|דילול פרופיל עוגנים|הגשת.*(directory|b144|zap|dapei)|directory/i.test(text)
    // ...or a real external prospect domain in an outreach/recovery context.
    const hasExternalDomain = /\b[a-z0-9-]+\.(?:co\.il|org\.il|com|net)\b/i.test(text) &&
        /outreach|פניי|שחזור|citation|פיץ|link[ _-]?gap|אזכור/i.test(text)
    return (acq || hasExternalDomain) && (t.channel === 'seo' || t.type === 'other')
}

function linkTaskType(t: LinkTaskLike): string {
    const text = `${t.title || ''} ${t.summary || ''}`
    if (/דילול פרופיל עוגנים|anchor|עוגנ/i.test(text)) return 'anchor_remediation'
    if (/שחזור קישור|lost|אבד/i.test(text)) return 'lost_link_recovery'
    return 'link_gap_outreach'
}

// First real domain mentioned in the task (LTR domain token).
function extractDomain(t: LinkTaskLike): string {
    const text = `${t.title || ''} ${t.summary || ''}`
    const m = text.match(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:co\.il|org\.il|gov\.il|ac\.il|com|net|org|io))\b/i)
    return m ? m[1].toLowerCase() : ''
}

export interface StampResult {
    updated: LinkTaskLike[]
    stamped: number
    domainsMatched: number
}

export function stampLinkTasks(
    tasks: LinkTaskLike[],
    linkAuditResult: Record<string, unknown> | undefined,
    rd: Record<string, unknown> | undefined,
    businessName: string,
): StampResult {
    // Strip prior link-stamp fields first → idempotent + self-correcting.
    const updated = tasks.map(t => {
        const c: LinkTaskLike = { ...t }
        for (const f of LINK_STAMP_FIELDS) delete c[f]
        return c
    })
    const linkIdx: number[] = []
    const pseudo: Array<{ type: string; domain: string; priority?: string }> = []
    updated.forEach((t, i) => {
        if (!isLinkTask(t)) return
        linkIdx.push(i)
        pseudo.push({ type: linkTaskType(t), domain: extractDomain(t), priority: t.priority })
    })
    if (pseudo.length === 0) return { updated, stamped: 0, domainsMatched: 0 }

    const dfsData = (linkAuditResult?.dfsData) as Parameters<typeof augmentLinkAuditRecords>[1]
    const extras = (linkAuditResult?.extras as Record<string, unknown> | undefined) || {}
    const anchorProfile = extras.anchor_distribution_analysis as { exact_match_pct?: number; risk_flags?: string[] } | undefined

    const { augmented_records } = augmentLinkAuditRecords(pseudo, dfsData, rd, businessName, anchorProfile)

    let domainsMatched = 0
    augmented_records.forEach((er, k) => {
        const i = linkIdx[k]
        const hasDomain = !!pseudo[k].domain
        if (hasDomain) domainsMatched++
        updated[i] = {
            ...updated[i],
            // anchor-remediation tasks carry no placement domain → no cost
            estimatedCostIls: hasDomain ? er.estimated_cost_ils : 0,
            targetPage: er.target_page,
            anchorKeyword: er.anchor_keyword,
            anchorType: er.anchor_type,
            prospectDr: er.prospect_dr,
            linkTier: hasDomain ? er.tier : null,
            linkSequence: er.sequence_order,
            linkMonth: er.month,
        }
    })
    return { updated, stamped: pseudo.length, domainsMatched }
}