/**
 * Setup Readiness Audit — the SELF-SERVE "reality scan".
 *
 * The MS cleanup showed the system understood ~80% of the work but never
 * SURFACED the real blockers (mis-scope, competing tracking plugin, broken GA4)
 * as actionable cabinet items — so a self-serve user would be stuck. This audit
 * runs the existing detectors and turns their findings into ONE readable,
 * plain-Hebrew task a non-technical business owner can act on.
 *
 * Detectors reused (no new infra):
 *   • adsScopeIntegrity      — mis-scope / shared / orphaned campaigns
 *   • detectTrackingConflicts — foreign GTM container / competing plugin
 *   • runTrackingHealthCheck  — GA4 / Ads / conversion-role health
 *
 * Output quality bar (per Sergei): readable for an ordinary user — 2nd-person
 * plural Hebrew, no machine keys / English jargon / raw JSON. Each blocker says
 * WHAT is wrong, WHY it matters for the business, and WHAT to do.
 */
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, agentOutputs } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'

export type ReadinessSeverity = 'critical' | 'high' | 'medium'
export interface ReadinessBlocker {
    id: string
    severity: ReadinessSeverity
    area: 'scope' | 'tracking' | 'measurement' | 'conversions'
    titleHe: string
    whyHe?: string
    actionHe?: string
}
export interface ReadinessResult {
    ok: boolean
    error?: string
    score: number
    blockers: ReadinessBlocker[]
    taskId?: string
    skipped?: string
}

const SEV_RANK: Record<ReadinessSeverity, number> = { critical: 0, high: 1, medium: 2 }
const SEV_ICON: Record<ReadinessSeverity, string> = { critical: '🔴', high: '🟠', medium: '🟡' }
const SEV_HE: Record<ReadinessSeverity, string> = { critical: 'דחוף', high: 'חשוב', medium: 'מומלץ' }

// ─── detector → user-language blocker normalizers ────────────────────────────

async function scopeBlockers(instanceId: string): Promise<ReadinessBlocker[]> {
    const { analyzeScopeIntegrity } = await import('@/services/adsScopeIntegrity')
    const r = await analyzeScopeIntegrity(instanceId).catch(() => null)
    if (!r || !r.ok) return []
    const out: ReadinessBlocker[] = []
    for (const i of r.issues) {
        if (i.kind === 'brand_mismatch') out.push({
            id: 'scope_brand_mismatch_' + (i.campaignId || ''), severity: 'critical', area: 'scope',
            titleHe: 'הסוכן מנהל קמפיין שכנראה שייך לעסק אחר',
            whyHe: `הקמפיין «${i.campaignName || ''}» מזוהה עם מותג אחר. כך התקציב וההמרות עלולים להתערבב בין עסקים, וההצעות (bidding) ילמדו מנתונים לא נכונים.`,
            actionHe: 'בהגדרות Google Ads ← בחירת קמפיינים, ודאו שנבחרו רק הקמפיינים של העסק שלכם.',
        })
        else if (i.kind === 'shared_campaign') out.push({
            id: 'scope_shared_' + (i.campaignId || ''), severity: 'high', area: 'scope',
            titleHe: 'אותו קמפיין משויך ליותר מעסק אחד',
            whyHe: `הקמפיין «${i.campaignName || ''}» מנוהל בו-זמנית ע"י כמה סוכנים — ההמרות והתקציב נספרים פעמיים וה-bidding מתבלבל.`,
            actionHe: 'הפרידו: לכל עסק הקמפיינים שלו בלבד.',
        })
        else if (i.kind === 'orphaned_campaign') out.push({
            id: 'scope_orphan_' + (i.campaignId || ''), severity: 'medium', area: 'scope',
            titleHe: 'קמפיין פעיל שאינו מנוהל במערכת',
            whyHe: `הקמפיין «${i.campaignName || ''}» רץ ומוציא תקציב, אך אינו משויך לאף סוכן — הוא לא נמדד ולא מנוהל.`,
            actionHe: 'שייכו אותו לעסק המתאים בבחירת הקמפיינים, או השהו אותו אם אינו בשימוש.',
        })
        else if (i.kind === 'empty_scope') out.push({
            id: 'scope_empty_' + (i.agentId || ''), severity: 'medium', area: 'scope',
            titleHe: 'לא נבחרו קמפיינים לניהול',
            whyHe: 'הסוכן מחובר ל-Google Ads אך לא נבחרו קמפיינים — אין מה לנהל או למדוד.',
            actionHe: 'בחרו את הקמפיינים של העסק בהגדרות Google Ads.',
        })
    }
    return out
}

async function trackingConflictBlockers(instanceId: string, agentId: string): Promise<ReadinessBlocker[]> {
    const { detectTrackingConflicts } = await import('@/services/trackingConflictResolver')
    const r = await detectTrackingConflicts(instanceId, agentId).catch(() => null)
    if (!r || !r.ok || !r.hasConflict) return []
    const plugins = r.competingPlugins.map(p => p.name).filter(Boolean).join(', ')
    return [{
        id: 'tracking_conflict', severity: 'high', area: 'tracking',
        titleHe: 'זוהה כלי מעקב מתחרה על האתר',
        whyHe: `על האתר רץ מנהל תגיות (GTM) נוסף${plugins ? ` (${plugins})` : ''}. שני מנהלי תגיות על אותו עמוד גורמים לספירה כפולה של גולשים ורכישות — והנתונים מפסיקים להיות מדויקים.`,
        actionHe: 'פתחו את כרטיס ה-GTM ובחרו: «שילוב» (משאיר את הכלי הקיים ומפנה אותו לקונטיינר שלנו) או «החלפה» (מנטרל את המתחרה ומתקין רק את שלנו).',
    }]
}

async function healthBlockers(instanceId: string, agentId: string): Promise<{ blockers: ReadinessBlocker[]; score: number }> {
    const { runTrackingHealthCheck } = await import('@/services/trackingHealthCheck')
    const h = await runTrackingHealthCheck(instanceId, agentId).catch(() => null)
    if (!h) return { blockers: [], score: 0 }
    // Map the health checks (already plain Hebrew) to readiness blockers. fail =
    // high/critical, warn = medium. Skip pass/skip. A couple of ids are critical.
    const CRIT = new Set(['ga4_oauth', 'ga4_property', 'purchase_primary'])
    const blockers: ReadinessBlocker[] = []
    for (const c of h.checks) {
        if (c.status === 'pass' || c.status === 'skip') continue
        const severity: ReadinessSeverity = c.status === 'fail' ? (CRIT.has(c.id) ? 'critical' : 'high') : 'medium'
        const area: ReadinessBlocker['area'] = /purchase_primary|leads_secondary|conversion/.test(c.id) ? 'conversions' : 'measurement'
        blockers.push({ id: 'health_' + c.id, severity, area, titleHe: c.he, actionHe: c.fix })
    }
    return { blockers, score: h.score }
}

// ─── orchestrator ────────────────────────────────────────────────────────────

export async function runSetupReadinessAudit(agent: MatehAgentRow, opts: { createTask?: boolean; force?: boolean } = {}): Promise<ReadinessResult> {
    const instanceId = agent.vpsInstanceId
    const [scope, conflict, health] = await Promise.all([
        scopeBlockers(instanceId),
        trackingConflictBlockers(instanceId, agent.id),
        healthBlockers(instanceId, agent.id),
    ])
    const blockers = [...scope, ...conflict, ...health.blockers]
        .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    const score = health.score

    // Persist latest readiness for the dashboard.
    try {
        const { mutateResearchData } = await import('./agentContext')
        await mutateResearchData(agent, instanceId, (cur: any) => {
            const c = cur || {}
            c.setupReadiness = { ranAt: new Date().toISOString(), score, blockerCount: blockers.length, severities: blockers.map(b => b.severity) }
            return c
        })
    } catch { /* best-effort */ }

    if (blockers.length === 0) return { ok: true, score, blockers: [], skipped: 'all_clear' }
    if (!opts.createTask) return { ok: true, score, blockers }

    if (!opts.force) {
        const existing = await db.select().from(agentOutputs).where(and(
            eq(agentOutputs.agentId, agent.id),
            eq(agentOutputs.outputType, 'setup_readiness_review'),
            eq(agentOutputs.status, 'pending_review'),
        ))
        if (existing.length) return { ok: true, score, blockers, skipped: 'pending_task_exists', taskId: existing[0].id }
    }

    const displayHe = buildReadinessDisplayHe(agent.name || 'העסק', score, blockers)
    const counts = blockers.reduce((m, b) => { m[b.severity]++; return m }, { critical: 0, high: 0, medium: 0 } as Record<ReadinessSeverity, number>)
    const [row] = await db.insert(agentOutputs).values({
        id: 'rdy_' + randomBytes(6).toString('hex'),
        instanceId,
        agentId: agent.id,
        agentRole: 'mazhir',
        outputType: 'setup_readiness_review',
        platform: 'google_ads',
        status: 'pending_review',
        title: `בדיקת מוכנות מדידה — ${counts.critical}🔴 ${counts.high}🟠 ${counts.medium}🟡 (ציון ${score}/100)`,
        content: JSON.stringify({ displayHe, score, blockerCount: blockers.length, counts }, null, 2),
        metadata: { kind: 'setup_readiness_review', score, blockers } as never,
    }).returning()

    if (row?.id) {
        import('@/services/approvalQueueTelegram')
            .then(m => m.sendApprovalQueueMessage(row.id))
            .catch((err: Error) => console.warn('[setupReadiness] telegram send failed:', err.message))
    }
    return { ok: true, score, blockers, taskId: row?.id }
}

function buildReadinessDisplayHe(business: string, score: number, blockers: ReadinessBlocker[]): string {
    const L: string[] = []
    L.push(`## בדיקת מוכנות המדידה — ${business}`)
    L.push('')
    L.push(`**ציון מוכנות:** ${score}/100`)
    L.push('')
    L.push(`מצאנו ${blockers.length} נושאים שכדאי לטפל בהם כדי שהמדידה והקמפיינים יעבדו נכון. עברו עליהם לפי הסדר — מהדחוף לפחות-דחוף:`)
    for (const sev of ['critical', 'high', 'medium'] as ReadinessSeverity[]) {
        const group = blockers.filter(b => b.severity === sev)
        if (!group.length) continue
        L.push('')
        L.push(`### ${SEV_ICON[sev]} ${SEV_HE[sev]}`)
        for (const b of group) {
            L.push('')
            L.push(`**${b.titleHe}**`)
            if (b.whyHe) L.push(`למה זה חשוב: ${b.whyHe}`)
            if (b.actionHe) L.push(`מה לעשות: ${b.actionHe}`)
        }
    }
    return L.join('\n')
}

/** Script/cron + on-demand convenience. */
export async function runReadinessForAgent(agentId: string, opts: { createTask?: boolean; force?: boolean } = {}): Promise<ReadinessResult> {
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    if (!agent) return { ok: false, error: `agent_not_found:${agentId}`, score: 0, blockers: [] }
    return runSetupReadinessAudit(agent as MatehAgentRow, opts)
}