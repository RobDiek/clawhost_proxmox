/**
 * Phase 4.3-T2 — Data dedup detector.
 *
 * Catches the bug class where two records in a stage refer to the same
 * logical entity but were stored as separate rows. The canonical case:
 * internal_seo_audit ingesting both `https://domain` and `https://domain/`
 * as two homepage records, generating false `duplicate_title` issues and
 * wasting an audit slot.
 *
 * Per-stage checks:
 *   internal_seo_audit.records[] — collapse by canonical URL (lowercased,
 *                                  no fragment, no trailing slash). If 2+
 *                                  records collapse to the same key →
 *                                  data_dedup warn with both URLs surfaced.
 *
 * Future extensions:
 *   competitor_landscape.records[] — collapse by canonical domain
 *   paid_competitor_landscape — same
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { AuditFinding, AuditContext } from './types'

export const dataDedupCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []
    if (!ctx.agentId) return findings

    const [agent] = await db.select({ researchData: matehAgents.researchData })
        .from(matehAgents)
        .where(and(eq(matehAgents.id, ctx.agentId), eq(matehAgents.vpsInstanceId, ctx.instanceId)))
    const rd = agent?.researchData as any
    if (!rd) return findings

    // ── internal_seo_audit.records dedup
    const isaRecords = rd?.results?.internal_seo_audit?.records as Array<{ url: string }> | undefined
    if (Array.isArray(isaRecords) && isaRecords.length > 0) {
        const dupesByKey = new Map<string, string[]>()
        for (const rec of isaRecords) {
            const url = (rec as any)?.url
            if (typeof url !== 'string') continue
            const key = canonicalUrlKey(url)
            const list = dupesByKey.get(key) || []
            list.push(url)
            dupesByKey.set(key, list)
        }
        const dupGroups = Array.from(dupesByKey.entries()).filter(([, urls]) => urls.length > 1)
        if (dupGroups.length > 0) {
            findings.push({
                category: 'data_dedup',
                id: 'isa_url_dedup',
                title: `${dupGroups.length} כפילויות URL ב-internal_seo_audit.records`,
                severity: 'warn',
                detail:
                    `Found ${dupGroups.length} URL group(s) that collapse to the same canonical key. ` +
                    `Same logical page audited twice — wastes an audit slot AND produces false ` +
                    `\`duplicate_title\` / \`duplicate_about\` issues. ` +
                    `Example: ${dupGroups[0][1].join(' ⇄ ')}`,
                fixHint:
                    `Ingestion now canonicalizes URLs at the inventory-assembly step ` +
                    `(internal_seo_audit.ts uses normalizeUrl()). Re-run the audit to clear ` +
                    `the duplicates. Existing record-level duplicate_title flags for these URLs ` +
                    `should be treated as false positives.`,
                evidence: { duplicateGroups: dupGroups.slice(0, 5).map(([key, urls]) => ({ key, urls })) },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit' },
            })
        }
    }

    if (findings.length === 0) {
        findings.push({
            category: 'data_dedup',
            id: 'data_dedup_clean',
            title: 'אין כפילויות לוגיות בין רשומות',
            severity: 'pass',
            detail: 'Checked internal_seo_audit.records for URL collapse — no duplicates.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    return findings
}

function canonicalUrlKey(u: string): string {
    try {
        const url = new URL(u)
        url.hash = ''
        let s = url.toString()
        if (s.endsWith('/')) s = s.slice(0, -1)
        return s.toLowerCase()
    } catch {
        return u.toLowerCase()
    }
}