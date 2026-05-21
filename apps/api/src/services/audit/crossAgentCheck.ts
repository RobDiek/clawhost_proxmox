/**
 * Phase 4.3-R — Cross-agent isolation detector
 *
 * Verifies that no per-agent data is leaking between agents on the same
 * VPS. Catches bug classes:
 *   - sibling agent's brand_slug/operatingCustomerId/etc appearing in
 *     active agent's records (Moving Station leaked into Packing's
 *     ConversionActions)
 *   - shared instance-level fields surfacing per-agent state of another
 *     agent (the leaked googleAdsConfig before Phase 4.3-P)
 *   - agent_integrations rows assigned to wrong agent_id
 *   - research_data fields containing sibling brand identifiers
 */

import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, agentIntegrations, brandBooks } from '@/db/schema'
import type { AuditFinding, AuditContext } from './types'

export const crossAgentCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []
    if (!ctx.agentId) return findings   // no agent context = nothing to check

    // 1) Load active agent
    const [active] = await db.select().from(matehAgents)
        .where(and(eq(matehAgents.id, ctx.agentId), eq(matehAgents.vpsInstanceId, ctx.instanceId)))
    if (!active) {
        findings.push({
            category: 'cross_agent',
            id: 'agent_not_found',
            title: 'Active agent row לא נמצא',
            severity: 'fail',
            detail: `agentId ${ctx.agentId} not found on VPS ${ctx.instanceId}. Possible orphan reference.`,
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
        return findings
    }

    // 2) Load siblings (other agents on same VPS)
    const siblings = await db.select().from(matehAgents)
        .where(and(eq(matehAgents.vpsInstanceId, ctx.instanceId), ne(matehAgents.id, ctx.agentId)))

    const activeSlug = active.brandSlug?.toLowerCase() || ''
    const activeTokens = tokenize(activeSlug).concat(tokenize(active.name || ''))
    const siblingIdentifiers: Array<{ id: string; name: string; slug: string; uniqueTokens: string[] }> = []
    for (const s of siblings) {
        const sibTokens = Array.from(new Set(
            tokenize(s.brandSlug || '').concat(tokenize(s.name || '')),
        ))
        const unique = sibTokens.filter(t => !activeTokens.includes(t))
        siblingIdentifiers.push({
            id: s.id, name: s.name, slug: s.brandSlug,
            uniqueTokens: unique,   // already deduped above; was producing N×duplicate findings
        })
    }

    // 3) Check: research_data string fields for sibling-brand tokens
    const rd = active.researchData as Record<string, unknown> | null
    if (rd) {
        const haystack = JSON.stringify(rd).toLowerCase()
        for (const sib of siblingIdentifiers) {
            const hits: string[] = []
            for (const t of sib.uniqueTokens) {
                // Count occurrences. > 2 is suspicious (could be incidental).
                const re = new RegExp(`\\b${escapeReg(t)}\\b`, 'g')
                const matches = haystack.match(re)
                if (matches && matches.length > 2) hits.push(`${t}×${matches.length}`)
            }
            if (hits.length > 0) {
                findings.push({
                    category: 'cross_agent',
                    id: `rd_sibling_leak:${sib.slug}`,
                    title: `research_data של ${active.name} מזכיר ${sib.name} (אחיו ב-VPS)`,
                    severity: 'warn',
                    detail:
                        `Found sibling-unique tokens [${hits.join(', ')}] inside ${active.name}'s research_data. ` +
                        `Could be a legitimate competitor mention OR a cross-agent leak. ` +
                        `Spot-check the records that contain these tokens to verify they're treated as competitor evidence, not as own-brand data.`,
                    fixHint:
                        `Inspect research_data->'results'->'*' for records whose brand/owner fields reference ${sib.slug}. ` +
                        `If sibling brand appears as own-brand identifier, the prefetch likely received contaminated data.`,
                    evidence: { siblingSlug: sib.slug, hits },
                    scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
                })
            }
        }
    }

    // 4) Check: agent_integrations — every row claims to belong to active
    // but ALSO check sibling agents' integration shapes for "leak-by-id"
    // (e.g. wrong agent_id assignment).
    //
    // Important: some integrations LEGITIMATELY contain lists of OTHER
    // properties owned by the user (GSC returns all sites the OAuth user
    // can access; Meta returns all ad accounts; Google returns all
    // ga4Properties). Those listings are NOT cross-agent leaks — they're
    // the user's other businesses on the same Google/Meta account. We
    // strip known list-fields from the haystack before matching.
    const LIST_FIELDS_TO_STRIP: Record<string, string[]> = {
        gsc:    ['sites'],
        google: ['ga4Properties', 'gtmContainers', 'gtmAccounts', 'sites', 'adAccounts'],
        meta:   ['adAccounts', 'pages', 'instagramAccounts'],
        microsoft: ['adAccounts'],
    }
    const activeIntegrations = await db.select().from(agentIntegrations)
        .where(and(eq(agentIntegrations.instanceId, ctx.instanceId), eq(agentIntegrations.agentId, ctx.agentId)))
    for (const ig of activeIntegrations) {
        const cfg = ig.config as Record<string, unknown> | null
        if (!cfg) continue
        // Build the haystack from cfg MINUS known list-fields. The active
        // identifier fields (siteUrl, adAccountId, ga4PropertyId — the
        // user's CHOSEN target) are still included so a wrong choice IS
        // surfaced.
        const stripFields = LIST_FIELDS_TO_STRIP[ig.integrationType] || []
        const cfgForCheck: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(cfg)) {
            if (!stripFields.includes(k)) cfgForCheck[k] = v
        }
        const cfgText = JSON.stringify(cfgForCheck).toLowerCase()
        const reported = new Set<string>()
        for (const sib of siblingIdentifiers) {
            for (const t of sib.uniqueTokens) {
                if (reported.has(`${sib.slug}:${t}`)) continue   // dedupe within this row
                if (cfgText.includes(t)) {
                    reported.add(`${sib.slug}:${t}`)
                    findings.push({
                        category: 'cross_agent',
                        id: `ig_sibling_leak:${ig.integrationType}:${sib.slug}`,
                        title: `אינטגרציה ${ig.integrationType} של ${active.name} מכילה זיהוי של ${sib.name}`,
                        severity: 'fail',
                        detail:
                            `Integration ${ig.integrationType} for agent ${ctx.agentId} contains sibling-unique token "${t}" ` +
                            `(belongs to agent ${sib.id} = ${sib.name}). This is a cross-tenant leak — the integration ` +
                            `was likely saved against the wrong agent or copies sibling's credentials. ` +
                            `(List-only fields like ${stripFields.join('/') || 'none'} are excluded from this check.)`,
                        fixHint:
                            `Inspect agent_integrations.config for this row. If it really belongs to sibling, ` +
                            `disconnect on the active agent and reconnect properly. Mirror state on instances.* ` +
                            `should also be cleared if this is the primary.`,
                        evidence: { integrationType: ig.integrationType, siblingSlug: sib.slug, matchedToken: t },
                        scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
                    })
                }
            }
        }
    }

    // 5) Check: brand_books — verify active's brand book is its own
    const [bb] = await db.select().from(brandBooks)
        .where(and(eq(brandBooks.instanceId, ctx.instanceId), eq(brandBooks.agentId, ctx.agentId), eq(brandBooks.status, 'approved')))
        .limit(1)
    if (bb) {
        const bbText = JSON.stringify(bb).toLowerCase()
        for (const sib of siblingIdentifiers) {
            for (const t of sib.uniqueTokens) {
                if (bbText.includes(t)) {
                    findings.push({
                        category: 'cross_agent',
                        id: `bb_sibling_leak:${sib.slug}`,
                        title: `Brand book של ${active.name} מזכיר ${sib.name}`,
                        severity: 'warn',
                        detail:
                            `Active agent's approved brand book contains sibling-unique token "${t}". ` +
                            `Brand books should never reference sibling brands by name unless explicitly framed as competitor mention.`,
                        evidence: { siblingSlug: sib.slug, matchedToken: t },
                        scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
                    })
                }
            }
        }
    }

    // 6) Check: googleAdsConfig (per-agent column) — verify operatingCustomerId
    // is NOT identical to a sibling's operating customer (often the symptom of
    // a user picking the wrong sub-account on the OAuth flow).
    const activeAdsCfg = active.googleAdsConfig as { scope?: { operatingCustomerId?: string }; customerId?: string } | null
    const activeOpCust = activeAdsCfg?.scope?.operatingCustomerId
    if (activeOpCust) {
        for (const sib of siblings) {
            const sibAdsCfg = sib.googleAdsConfig as { scope?: { operatingCustomerId?: string } } | null
            const sibOpCust = sibAdsCfg?.scope?.operatingCustomerId
            if (sibOpCust && sibOpCust === activeOpCust) {
                findings.push({
                    category: 'cross_agent',
                    id: `gads_shared_op_cust:${sib.id}`,
                    title: `Google Ads operatingCustomerId משותף עם ${sib.name}`,
                    severity: 'warn',
                    detail:
                        `${active.name} and ${sib.name} both use operatingCustomerId ${activeOpCust}. ` +
                        `If this is intentional (same advertiser account, different campaigns) — fine. ` +
                        `If they should be on DIFFERENT sub-accounts, ConversionActions/campaigns from sibling will leak into active.`,
                    fixHint:
                        `Verify in Google Ads UI that ${activeOpCust} is the correct customer for ${active.name}. ` +
                        `If not, reconnect Google Ads on this agent and pick the right sub-account.`,
                    evidence: { sharedOperatingCustomerId: activeOpCust, siblingName: sib.name },
                    scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
                })
            }
        }
    }

    // 7) Check: googleAdsConfig customerId (top-level MCC) vs siblings —
    // sharing same MCC is normal (one user, multiple businesses), but worth
    // surfacing so the operator knows.
    if (activeAdsCfg?.customerId) {
        const sharedMccSiblings = siblings.filter(s => {
            const sc = s.googleAdsConfig as { customerId?: string } | null
            return sc?.customerId === activeAdsCfg.customerId
        })
        if (sharedMccSiblings.length > 0) {
            findings.push({
                category: 'cross_agent',
                id: 'gads_shared_mcc_info',
                title: `${active.name} חולק MCC עם ${sharedMccSiblings.length} סוכן/ים נוסף/ים`,
                severity: 'info',
                detail:
                    `Active agent's Google Ads MCC (${activeAdsCfg.customerId}) is shared with: ` +
                    sharedMccSiblings.map(s => s.name).join(', ') + '. ' +
                    `Make sure each agent's operating sub-account + campaign scope is distinct.`,
                evidence: { mcc: activeAdsCfg.customerId, siblings: sharedMccSiblings.map(s => ({ id: s.id, name: s.name })) },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
            })
        }
    }

    if (findings.filter(f => f.severity === 'fail' || f.severity === 'warn').length === 0) {
        findings.push({
            category: 'cross_agent',
            id: 'cross_agent_clean',
            title: 'אין דליפות בין הסוכן הפעיל לאחיו',
            severity: 'pass',
            detail: `Checked research_data, agent_integrations, brand_books, googleAdsConfig vs ${siblings.length} sibling agent(s) on same VPS — no leaks detected.`,
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, agentName: active.name },
        })
    }

    return findings
}

function tokenize(s: string): string[] {
    if (!s) return []
    const STOP = new Set(['the', 'and', 'site', 'web', 'www', 'com', 'co', 'il', 'ltd', 'inc', 'app'])
    return Array.from(new Set(
        s.toLowerCase().split(/[\s\W_]+/).filter(t => t.length >= 4 && !STOP.has(t)),
    ))
}

function escapeReg(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}