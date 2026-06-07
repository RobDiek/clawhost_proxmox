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

// Genuine external-link tasks: outreach / lost-link recovery / citations /
// anchor remediation. Excludes INTERNAL-link tasks and content/ads tasks.
function isLinkTask(t: LinkTaskLike): boolean {
    const text = `${t.title || ''} ${t.summary || ''}`
    if (/internal|קישור(ים)? פנימי/i.test(text)) return false   // internal links ≠ backlinks
    const outreach = /שחזור קישור|פניית|פנייה ל|link[ _-]?gap|outreach|backlink|citation|הגשת|פיץ['׳] ?PR|דילול פרופיל עוגנים|directory|אזכור מותג|לינק חיצוני/i.test(text)
    return outreach && (t.channel === 'seo' || t.type === 'other')
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
    const updated = tasks.slice()
    const linkIdx: number[] = []
    const pseudo: Array<{ type: string; domain: string; priority?: string }> = []
    tasks.forEach((t, i) => {
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