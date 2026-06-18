/**
 * Ads Scope Integrity — SYSTEMIC guard for the Campaign Foundation Engine.
 *
 * The Packing/Moving/Storage master taught us (2026-06-18) that a multi-brand
 * shared Google Ads account can have its agent→campaign scope SCRAMBLED: one
 * brand's agent pointed at another brand's campaign, two agents sharing a
 * campaign, the real campaign orphaned. Every downstream layer (goal isolation,
 * bidding, attribution, the foundation reconciler) then builds on a lie.
 *
 * This detector runs for ANY tenant — not just our master — and flags that
 * whole class of problem from the live account, BEFORE the engine acts:
 *   • brand_mismatch  — a scoped campaign whose name matches a SIBLING brand's
 *     distinctive token but NOT the owner's (the exact bug we hit).
 *   • shared_campaign — one campaign in >1 agent's scope.
 *   • orphaned_campaign — an active account campaign in NO agent's scope.
 *   • empty_scope — an Ads-connected agent with no campaigns scoped.
 *
 * It NEVER auto-fixes (per platform policy every external change is approval-
 * gated). It produces issues for review / an approval task. Heuristic by design:
 * "distinctive tokens" = brand tokens unique to one agent among its siblings, so
 * the shared word ("station", "ltd", "store") never triggers a false positive,
 * and single-brand accounts (no siblings → no distinctive sibling tokens) can
 * never raise a brand_mismatch.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'

const ADS = 'https://googleads.googleapis.com/v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type IntegritySeverity = 'critical' | 'high' | 'medium' | 'info'
export interface ScopeIntegrityIssue {
    severity: IntegritySeverity
    kind: 'brand_mismatch' | 'shared_campaign' | 'orphaned_campaign' | 'empty_scope'
    agentId?: string
    agentName?: string
    campaignId?: string
    campaignName?: string
    detail: string
}
export interface ScopeAgent {
    agentId: string
    name: string
    brandTokens: string[]
    distinctiveTokens: string[]
    campaignIds: string[]
}
export interface ScopeIntegrityReport {
    ok: boolean
    error?: string
    instanceId: string
    operatingCustomerId: string
    agents: ScopeAgent[]
    campaignCount: number
    issues: ScopeIntegrityIssue[]
}

// ─── token helpers ───────────────────────────────────────────────────────────

// Split a brand name / domain / campaign name into normalized tokens. Keeps
// Hebrew + latin word characters; drops separators, the TLD, and generic noise.
const STOP = new Set(['the', 'and', 'for', 'ltd', 'inc', 'il', 'co', 'com', 'www', 'search', 'pmax', 'campaign', 'רשת', 'החיפוש', 'קמפיין'])
function tokenize(s: string): string[] {
    return String(s || '').toLowerCase()
        .replace(/https?:\/\//g, '').replace(/\.(co\.il|com|co|net|org|io|ai)\b/g, ' ')
        .split(/[^a-z0-9֐-׿]+/)
        .filter(t => t.length >= 2 && !STOP.has(t))
}

function brandTokens(name?: string | null, domain?: string | null): string[] {
    return [...new Set([...tokenize(name || ''), ...tokenize(domain || '')])]
}

async function accessToken(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || '', csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }) })
        return ((await r.json()) as { access_token?: string }).access_token || null
    } catch { return null }
}

// ─── main ────────────────────────────────────────────────────────────────────

/**
 * Analyze every agent on an instance that shares one Google Ads operating
 * account, and flag scope-integrity problems. Read-only.
 */
export async function analyzeScopeIntegrity(instanceId: string): Promise<ScopeIntegrityReport> {
    const out: ScopeIntegrityReport = { ok: false, instanceId, operatingCustomerId: '', agents: [], campaignCount: 0, issues: [] }

    const rows = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId))
    // Resolve each agent's brand tokens + scope + the operating account it uses.
    type Raw = { agentId: string; name: string; domain: string; operating: string; manager: string; dev: string; rt: string; campaignIds: string[] }
    const raws: Raw[] = []
    for (const a of rows) {
        const cfg: any = (a.googleAdsConfig as any) || {}
        const rd: any = a.researchData || {}
        const operating = String(cfg.scope?.operatingCustomerId || cfg.mccSubAccountId || cfg.customerId || '').replace(/\D/g, '')
        if (!operating) continue   // not Ads-connected
        raws.push({
            agentId: a.id, name: a.name || '',
            domain: rd.answers?.websiteUrl || rd.paidProfile?.websiteUrl || '',
            operating, manager: String(cfg.loginCustomerId || cfg.customerId || '').replace(/\D/g, ''),
            dev: String(cfg.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''),
            rt: (a.googleTokens as any)?.refreshToken || (a.googleTokens as any)?.refresh_token || '',
            campaignIds: (cfg.scope?.campaignIds || []).map((x: any) => String(x).replace(/\D/g, '')).filter(Boolean),
        })
    }
    if (raws.length === 0) { out.error = 'no_ads_connected_agents'; return out }

    // The shared operating account = the most common one among agents.
    const opCounts = raws.reduce((m, r) => { m[r.operating] = (m[r.operating] || 0) + 1; return m }, {} as Record<string, number>)
    const operating = Object.entries(opCounts).sort((a, b) => b[1] - a[1])[0][0]
    out.operatingCustomerId = operating
    const onAccount = raws.filter(r => r.operating === operating)

    // Distinctive tokens: a brand token held by exactly ONE agent on the account.
    const tokenOwners = new Map<string, Set<string>>()
    for (const r of onAccount) {
        for (const t of brandTokens(r.name, r.domain)) {
            if (!tokenOwners.has(t)) tokenOwners.set(t, new Set())
            tokenOwners.get(t)!.add(r.agentId)
        }
    }
    out.agents = onAccount.map(r => {
        const bt = brandTokens(r.name, r.domain)
        return { agentId: r.agentId, name: r.name, brandTokens: bt, distinctiveTokens: bt.filter(t => tokenOwners.get(t)!.size === 1), campaignIds: r.campaignIds }
    })

    // List every campaign on the operating account (id → name/channel/status).
    const cred = onAccount.find(r => r.dev && r.rt)
    if (!cred) { out.error = 'no_credentials'; return out }
    const at = await accessToken(cred.rt)
    if (!at) { out.error = 'token_refresh_failed'; return out }
    const headers: Record<string, string> = { Authorization: `Bearer ${at}`, 'developer-token': cred.dev, 'Content-Type': 'application/json' }
    if (cred.manager && cred.manager !== operating) headers['login-customer-id'] = cred.manager
    const campaigns: Array<{ id: string; name: string; channel: string; status: string }> = []
    try {
        const res = await fetch(`${ADS}/customers/${operating}/googleAds:searchStream`, {
            method: 'POST', headers,
            body: JSON.stringify({ query: `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'` }),
            signal: AbortSignal.timeout(60_000),
        })
        const data = await res.json() as any
        if (!res.ok) { out.error = `campaign_list:${(data?.error?.message || res.status).toString().slice(0, 160)}`; return out }
        for (const batch of (Array.isArray(data) ? data : [data])) for (const r of (batch?.results || [])) {
            const c = r.campaign || {}
            if (c.id) campaigns.push({ id: String(c.id), name: c.name || '', channel: c.advertisingChannelType || '', status: c.status || '' })
        }
    } catch (e) { out.error = `campaign_list:${(e as Error).message.slice(0, 160)}`; return out }
    out.campaignCount = campaigns.length
    const campById = new Map(campaigns.map(c => [c.id, c]))
    out.ok = true

    // ── Check 1: empty scope ──────────────────────────────────────────────────
    for (const a of out.agents) {
        if (a.campaignIds.length === 0) out.issues.push({ severity: 'medium', kind: 'empty_scope', agentId: a.agentId, agentName: a.name, detail: `Agent "${a.name}" is Ads-connected but has no campaigns scoped — it manages nothing (or leaks the whole account).` })
    }

    // ── Check 2: shared campaign (one campaign in >1 agent's scope) ────────────
    const campToAgents = new Map<string, string[]>()
    for (const a of out.agents) for (const cid of a.campaignIds) {
        if (!campToAgents.has(cid)) campToAgents.set(cid, [])
        campToAgents.get(cid)!.push(a.agentId)
    }
    for (const [cid, agentIds] of campToAgents) {
        if (agentIds.length > 1) {
            const names = agentIds.map(id => out.agents.find(a => a.agentId === id)?.name || id)
            out.issues.push({ severity: 'high', kind: 'shared_campaign', campaignId: cid, campaignName: campById.get(cid)?.name, detail: `Campaign "${campById.get(cid)?.name || cid}" is in the scope of ${agentIds.length} agents (${names.join(', ')}) — conversions + budget cross-attribute. Each campaign belongs to exactly one brand.` })
        }
    }

    // ── Check 3: orphaned campaign (active, in no agent's scope) ───────────────
    const scopedSet = new Set([...campToAgents.keys()])
    for (const c of campaigns) {
        if (c.status === 'ENABLED' && !scopedSet.has(c.id)) {
            out.issues.push({ severity: 'medium', kind: 'orphaned_campaign', campaignId: c.id, campaignName: c.name, detail: `Active campaign "${c.name}" (${c.channel}) is in NO agent's scope — unmanaged by the engine.` })
        }
    }

    // ── Check 4: brand mismatch (scoped campaign named for a SIBLING brand) ────
    for (const a of out.agents) {
        const siblingDistinct = out.agents.filter(s => s.agentId !== a.agentId).flatMap(s => s.distinctiveTokens)
        const siblingSet = new Set(siblingDistinct)
        for (const cid of a.campaignIds) {
            const c = campById.get(cid)
            if (!c) continue
            const nameTokens = new Set(tokenize(c.name))
            const ownerMatch = a.distinctiveTokens.some(t => nameTokens.has(t))
            const siblingMatch = [...siblingSet].filter(t => nameTokens.has(t))
            if (siblingMatch.length && !ownerMatch) {
                const owner = out.agents.find(s => s.distinctiveTokens.some(t => siblingMatch.includes(t)))
                out.issues.push({
                    severity: 'critical', kind: 'brand_mismatch', agentId: a.agentId, agentName: a.name, campaignId: cid, campaignName: c.name,
                    detail: `Agent "${a.name}" is scoped to campaign "${c.name}" whose name matches sibling brand "${owner?.name || siblingMatch.join('/')}" (token: ${siblingMatch.join(', ')}) — likely MIS-SCOPED. It should probably belong to ${owner?.name || 'that sibling'}.`,
                })
            }
        }
    }

    out.issues.sort((a, b) => ({ critical: 0, high: 1, medium: 2, info: 3 }[a.severity] - { critical: 0, high: 1, medium: 2, info: 3 }[b.severity]))
    return out
}

export function renderScopeIntegrity(r: ScopeIntegrityReport): string {
    if (!r.ok) return `scope-integrity: unavailable (${r.error})`
    const L = [`── SCOPE INTEGRITY (acct ${r.operatingCustomerId}, ${r.agents.length} agents, ${r.campaignCount} campaigns) ──`]
    L.push(`   agents: ${r.agents.map(a => `${a.name}[${a.distinctiveTokens.join('/') || '—'}]→${a.campaignIds.length}`).join('  ·  ')}`)
    if (r.issues.length === 0) { L.push('   ✅ no scope-integrity issues'); return L.join('\n') }
    for (const i of r.issues) L.push(`   ${i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🟡'} [${i.kind}] ${i.detail}`)
    return L.join('\n')
}

/** Convenience for an instance lookup-by-id (used by scripts / the snapshot). */
export async function scopeIntegrityForInstance(instanceId: string): Promise<ScopeIntegrityReport> {
    const [inst] = await db.select({ id: instances.id }).from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { ok: false, error: 'instance_not_found', instanceId, operatingCustomerId: '', agents: [], campaignCount: 0, issues: [] }
    return analyzeScopeIntegrity(instanceId)
}