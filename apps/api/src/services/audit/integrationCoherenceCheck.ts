/**
 * Phase 4.3-R — Integration coherence checker
 *
 * Verifies that each agent_integrations row's `config` is readable by the
 * gates/consumers that depend on it. Catches the WP user/username class
 * of bug where writer + reader disagree on field names.
 *
 * The approach: define the "canonical writer shape" + "canonical reader
 * shape" per integration_type and assert each row has the keys at least
 * ONE consumer expects.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { agentIntegrations } from '@/db/schema'
import type { AuditFinding, AuditContext } from './types'

interface ShapeSpec {
    /** Required: at least one field from each group must be present. */
    requiredGroups: string[][]
    /** Optional: extra fields we look for and report status of. */
    expectedFields?: string[]
}

// Per-integration shape spec. Each group is OR'd internally and AND'd
// across groups. Captures the "writer might write either name; reader
// must accept either" pattern.
const INTEGRATION_SHAPES: Record<string, ShapeSpec> = {
    wordpress: {
        requiredGroups: [
            ['url'],
            ['user', 'username'],
            ['appPassword', 'password'],
        ],
        expectedFields: ['connectedAt'],
    },
    smtp: {
        requiredGroups: [
            ['host'],
            ['user', 'username'],
            ['pass', 'password'],
        ],
        expectedFields: ['port', 'connectedAt'],
    },
    google: {
        requiredGroups: [
            ['refreshToken', 'refresh_token', 'accessToken', 'access_token'],
        ],
        expectedFields: ['scopes', 'email', 'connectedAt', 'expiresAt'],
    },
    gsc: {
        requiredGroups: [
            ['refreshToken', 'refresh_token', 'accessToken', 'access_token'],
        ],
        expectedFields: ['siteUrl'],
    },
    reddit: {
        requiredGroups: [],   // optional integration; just verify status
        expectedFields: ['username', 'clientId'],
    },
    brave: {
        requiredGroups: [],   // flag-based — config just marks connected
        expectedFields: ['connectedAt'],
    },
    firecrawl: {
        requiredGroups: [],
        expectedFields: ['connectedAt'],
    },
    telegram: {
        requiredGroups: [],
        expectedFields: ['chatId', 'connectedAt'],
    },
}

export const integrationCoherenceCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []
    if (!ctx.agentId) return findings

    const rows = await db.select().from(agentIntegrations)
        .where(and(
            eq(agentIntegrations.instanceId, ctx.instanceId),
            eq(agentIntegrations.agentId, ctx.agentId),
        ))

    if (rows.length === 0) {
        findings.push({
            category: 'integration',
            id: 'no_integrations',
            title: 'אין אינטגרציות מחוברות לסוכן הפעיל',
            severity: 'info',
            detail: 'No agent_integrations rows for this agent.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
        return findings
    }

    for (const row of rows) {
        const spec = INTEGRATION_SHAPES[row.integrationType]
        const cfg = (row.config as Record<string, unknown> | null) || {}
        const presentKeys = Object.keys(cfg)

        if (!spec) {
            // Unknown integration type — info only
            findings.push({
                category: 'integration',
                id: `unknown_spec:${row.integrationType}`,
                title: `אין spec לאינטגרציה ${row.integrationType} ב-audit`,
                severity: 'info',
                detail: `Found agent_integrations row of type "${row.integrationType}" but no shape spec defined in audit. Add one if writer/reader divergence is possible.`,
                evidence: { integrationType: row.integrationType, configKeys: presentKeys },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
            })
            continue
        }

        if (row.status !== 'connected') continue   // skip disconnected rows

        // Check each required group: at least one field present
        const missingGroups: string[][] = []
        for (const group of spec.requiredGroups) {
            const hasAny = group.some(f => f in cfg && cfg[f] != null && cfg[f] !== '')
            if (!hasAny) missingGroups.push(group)
        }

        if (missingGroups.length > 0) {
            findings.push({
                category: 'integration',
                id: `incoherent:${row.integrationType}`,
                title: `אינטגרציה ${row.integrationType} מסומנת מחוברת אך חסרים שדות חובה`,
                severity: 'fail',
                detail:
                    `Integration ${row.integrationType} has status='connected' but config is missing required field group(s): ` +
                    missingGroups.map(g => `(${g.join(' OR ')})`).join(' AND ') +
                    `. Consumers depending on these fields will fail at runtime.`,
                fixHint:
                    `Disconnect this integration via the dashboard and reconnect via the normal flow. ` +
                    `If still missing fields after reconnect, the writer is broken — check the controller that handles save.`,
                evidence: { integrationType: row.integrationType, presentKeys, missingGroups },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
            })
        }

        // Report expected fields that are absent (info-level)
        if (spec.expectedFields) {
            const missingExpected = spec.expectedFields.filter(f => !(f in cfg) || cfg[f] == null)
            if (missingExpected.length > 0) {
                findings.push({
                    category: 'integration',
                    id: `missing_expected:${row.integrationType}`,
                    title: `אינטגרציה ${row.integrationType}: חסרים שדות אופציונליים`,
                    severity: 'info',
                    detail: `Optional fields not present: ${missingExpected.join(', ')}. Doesn't block functionality but limits diagnostics.`,
                    scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
                })
            }
        }
    }

    if (findings.filter(f => f.severity === 'fail').length === 0) {
        findings.push({
            category: 'integration',
            id: 'integration_coherent',
            title: 'כל האינטגרציות תקינות',
            severity: 'pass',
            detail: `Checked ${rows.length} agent_integrations row(s) — all required fields present where status='connected'.`,
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    return findings
}