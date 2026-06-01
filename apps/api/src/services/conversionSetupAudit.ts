/**
 * Conversion Setup Audit — ONE-TIME check, ~24h after a Mazhir GTM/conversion
 * auto-setup completes.
 *
 * Born from the Packing Station incident (2026-06): a GTM/GA4 overhaul left the
 * account's own purchase signal under-firing while a SIBLING brand's primary
 * purchase action (shared MCC operating account) silently fed the campaigns'
 * Max-Conversion-Value bidding. Nothing alerted, because nothing audits the
 * post-setup state. This closes that gap for every VPS.
 *
 * Two independent checks per agent:
 *   1. Firing (baseline-aware) — did the agent's expected conversion EVENTS
 *      that USED TO fire before setup stop firing after it? We compare a 7-day
 *      pre-setup window vs the post-setup window, so naturally low-volume
 *      tenants don't false-alarm. For purchase we also flag value=₪0.
 *   2. Contamination — delegated to ensureCampaignGoalIsolation (hybrid:
 *      auto-isolate on unambiguous risk, else raise an approval task). The
 *      primitive surfaces its own task/Telegram; the audit just records it.
 *
 * Firing findings are surfaced as a `pending_review` agent_output + Telegram.
 * Each setup is audited exactly once: we stamp research_data.mazhirGtm.auditRanAt
 * and only re-run if a newer lastSetupAt appears. Transient read failures do NOT
 * stamp — they retry on the next hourly sweep.
 */

import { isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import telegram from '@/services/telegram'
import { ensureCampaignGoalIsolation, type IsolationDecision } from '@/services/campaignGoalIsolation'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'

const AUDIT_DELAY_MS = 24 * 60 * 60 * 1000
const BASELINE_MIN_EVENTS = 7   // pre-window total below this = "low volume", don't flag a post-zero

const ACTION_KEY_TO_GA4_EVENT: Record<string, string> = {
    purchase: 'purchase',
    form_submit: 'form_submit',
    generate_lead: 'generate_lead',
    phone_call: 'Phone_call_from_Leader_GA4',
    qualified_lead: 'qualify_lead',
    whatsapp: 'WhatsApp from Leader',
}

interface AuditFinding { severity: 'critical' | 'warn'; code: string; he: string }
interface AuditResult { findings: AuditFinding[]; isolation: IsolationDecision | null; transient: boolean }

async function refresh(rt: string): Promise<string | null> {
    const cid = process.env.GOOGLE_CLIENT_ID || ''
    const csec = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!cid || !csec || !rt) return null
    try {
        const r = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
        })
        const j = await r.json() as { access_token?: string }
        return j.access_token || null
    } catch { return null }
}

// Lock the GA4 property to the agent's measurementId — never guess.
async function resolvePropertyByMeasurementId(at: string, measurementId: string): Promise<string | null> {
    const r = await fetch(`${ADMIN_API}/accountSummaries?pageSize=200`, {
        headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(20000),
    })
    const j = await r.json() as { accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string }> }> }
    const props: string[] = []
    for (const a of j.accountSummaries || []) for (const p of a.propertySummaries || []) if (p.property) props.push(p.property)
    for (const prop of props) {
        const ds = await fetch(`${ADMIN_API}/${prop}/dataStreams?pageSize=50`, {
            headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(15000),
        })
        const dj = await ds.json() as { dataStreams?: Array<{ webStreamData?: { measurementId?: string } }> }
        for (const s of dj.dataStreams || []) {
            if (s.webStreamData?.measurementId === measurementId) return prop.replace('properties/', '')
        }
    }
    return null
}

// Throws on transport error (→ caller treats as transient). Returns map on success.
async function ga4EventCounts(at: string, propertyId: string, startDate: string, endDate: string): Promise<Map<string, { count: number; revenue: number }>> {
    const r = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }, { name: 'eventValue' }, { name: 'purchaseRevenue' }],
            limit: 500,
        }),
        signal: AbortSignal.timeout(30000),
    })
    const j = await r.json() as any
    if (!r.ok) throw new Error(j?.error?.message || `GA4 runReport ${r.status}`)
    const out = new Map<string, { count: number; revenue: number }>()
    for (const row of j.rows || []) {
        const ev = row.dimensionValues[0]?.value || ''
        out.set(ev, {
            count: Number(row.metricValues[0]?.value || 0),
            revenue: Number(row.metricValues[2]?.value || row.metricValues[1]?.value || 0),
        })
    }
    return out
}

const dateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export async function auditAgentConversionSetup(agent: MatehAgentRow): Promise<AuditResult> {
    const findings: AuditFinding[] = []
    let transient = false
    const rd = (agent.researchData || {}) as any
    const gtm = rd.mazhirGtm
    const measurementId: string | undefined = gtm?.target?.measurementId
    const lastSetupAt = gtm?.lastSetupAt ? Date.parse(gtm.lastSetupAt) : NaN
    const tokens = (agent.googleTokens || {}) as any
    const refreshToken: string | undefined = tokens.refreshToken || tokens.refresh_token

    if (!refreshToken) {
        findings.push({ severity: 'warn', code: 'no_oauth', he: 'אין חיבור Google פעיל לסוכן — לא ניתן לאמת איסוף נתונים.' })
        return { findings, isolation: null, transient: false }
    }
    const at = await refresh(refreshToken)
    if (!at) return { findings, isolation: null, transient: true }   // refresh hiccup → retry later

    // ── Check 1: GA4 firing (baseline-aware) ──
    if (measurementId && !Number.isNaN(lastSetupAt)) {
        try {
            const propertyId = await resolvePropertyByMeasurementId(at, measurementId)
            if (!propertyId) {
                findings.push({ severity: 'warn', code: 'ga4_property_unresolved', he: `לא נמצא נכס GA4 התואם ל-${measurementId} — ייתכן שהחיבור ל-GA4 נותק.` })
            } else {
                const preStart = dateStr(lastSetupAt - 8 * 86400_000)
                const preEnd = dateStr(lastSetupAt - 86400_000)
                const postStart = dateStr(lastSetupAt)
                const postEnd = dateStr(Date.now())
                const pre = await ga4EventCounts(at, propertyId, preStart, preEnd)
                const post = await ga4EventCounts(at, propertyId, postStart, postEnd)

                const active: any[] = rd.mazhirConversions?.active || rd.mazhirConversions?.created || []
                const keys: string[] = active.map((a: any) => a.actionKey).filter(Boolean)
                const expected = Array.from(new Set((keys.length ? keys : ['purchase']).map(k => ACTION_KEY_TO_GA4_EVENT[k]).filter(Boolean)))
                for (const ev of expected) {
                    const preN = pre.get(ev)?.count || 0
                    const postHit = post.get(ev)
                    const postN = postHit?.count || 0
                    // Only flag a STOP: was firing meaningfully before, zero after.
                    if (preN >= BASELINE_MIN_EVENTS && postN === 0) {
                        findings.push({ severity: 'critical', code: `event_stopped:${ev}`, he: `אירוע ההמרה «${ev}» הפסיק להירשם ב-GA4 אחרי ההגדרה (היו ~${preN} בשבוע שלפני, 0 אחרי) — ייתכן שהמדידה נשברה.` })
                    } else if (ev === 'purchase' && postN > 0 && (postHit?.revenue || 0) === 0) {
                        findings.push({ severity: 'critical', code: 'purchase_no_revenue', he: 'אירועי רכישה נרשמים אך ללא ערך כספי (₪0) — הצעות מחיר מבוססות-ערך (tROAS) לא יעבדו.' })
                    }
                }
            }
        } catch {
            transient = true   // GA4 transport error → don't finalize, retry next sweep
        }
    }

    // ── Check 2: contamination → delegate to the isolation primitive ──
    let isolation: IsolationDecision | null = null
    try {
        isolation = await ensureCampaignGoalIsolation(agent, { source: 'audit' })
        if (isolation.status === 'error') transient = true
    } catch (err) {
        console.warn(`[conversionAudit] ${agent.id} isolation failed:`, (err as Error).message)
        transient = true
    }

    return { findings, isolation, transient }
}

// firing alert → pending_review task + Telegram. (Contamination surfaces itself
// via the isolation primitive, so it's not duplicated here.)
async function raiseFiringAlert(agent: MatehAgentRow, findings: AuditFinding[]): Promise<void> {
    const critical = findings.filter(f => f.severity === 'critical')
    const head = critical.length
        ? `🔴 *ביקורת מדידה — בעיה קריטית* (${agent.name})`
        : `🟠 *ביקורת מדידה — שימו לב* (${agent.name})`
    const body = findings.map(f => `${f.severity === 'critical' ? '🔴' : '🟠'} ${f.he}`).join('\n')

    await db.insert(agentOutputs).values({
        id: nanoid(12),
        instanceId: agent.vpsInstanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'conversion_audit_alert',
        status: 'pending_review',
        title: critical.length ? '⚠ ביקורת מדידה: ההמרות הפסיקו להירשם' : 'ביקורת מדידה: דרושה תשומת לב',
        content: body,
        metadata: { kind: 'conversion_audit_alert', findings } as never,
        createdAt: new Date(),
    } as never).onConflictDoNothing()

    try {
        const chatId = (agent as any).telegramChatId
        if (chatId) await telegram.sendMessage(String(chatId), `${head}\n\n${body}`)
        else await telegram.alertAdmin(`${head}\n\n${body}`)
    } catch (err) {
        console.warn(`[conversionAudit] ${agent.id} telegram failed:`, (err as Error).message)
    }
}

/**
 * Hourly sweep. Audits each GTM setup exactly once at the ~24h mark. Transient
 * failures are not stamped, so they retry on a later sweep.
 */
export async function runConversionSetupAudit(): Promise<{ scanned: number; audited: number; alerted: number; deferred: number; errors: number }> {
    const stats = { scanned: 0, audited: 0, alerted: 0, deferred: 0, errors: 0 }
    let rows: MatehAgentRow[] = []
    try {
        rows = await db.select().from(matehAgents).where(isNotNull(matehAgents.researchData)) as MatehAgentRow[]
    } catch (err) {
        console.error('[conversionAudit] list error:', (err as Error).message)
        return stats
    }

    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const { mutateResearchData } = await import('./agentContext')

    for (const agent of rows) {
        const rd = (agent.researchData || {}) as any
        const gtm = rd.mazhirGtm
        const lastSetupAt = gtm?.lastSetupAt ? Date.parse(gtm.lastSetupAt) : NaN
        if (!gtm?.lastSetupResult?.published || Number.isNaN(lastSetupAt)) continue
        if (now - lastSetupAt < AUDIT_DELAY_MS) continue
        const auditRanAt = gtm.auditRanAt ? Date.parse(gtm.auditRanAt) : NaN
        if (!Number.isNaN(auditRanAt) && auditRanAt >= lastSetupAt) continue   // already audited THIS setup

        stats.scanned++
        try {
            const res = await auditAgentConversionSetup(agent)
            if (res.findings.length > 0) { await raiseFiringAlert(agent, res.findings); stats.alerted++ }
            if (res.transient) { stats.deferred++; continue }   // retry next sweep, don't stamp
            stats.audited++
            await mutateResearchData(agent, agent.vpsInstanceId, (cur: any) => {
                const c = cur || {}
                c.mazhirGtm = {
                    ...(c.mazhirGtm || {}),
                    auditRanAt: nowIso,
                    lastAuditFindings: res.findings,
                    lastAuditIsolation: res.isolation,
                }
                return c
            })
        } catch (err) {
            stats.errors++
            console.error(`[conversionAudit] ${agent.id} error:`, (err as Error).message)
        }
    }
    console.log(`[conversionAudit] ${nowIso} stats:`, JSON.stringify(stats))
    return stats
}