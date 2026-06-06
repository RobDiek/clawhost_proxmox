/**
 * Monthly Report Card — the deliverable that reconciles the month's TARGETS
 * (chosen-scenario KPIs + CPA ceiling) against ACTUAL results across BOTH
 * channels: paid (Ads spend/ROAS/conversions from the latest weekly report) and
 * organic + AI (rank/traffic/keyword movers + AI citations from seoTracking,
 * GSC clicks/impressions from the monitoring digest). Composes a Hebrew card
 * (goal↔actual per channel + wins/misses + next-month corrections) and emits a
 * `monthly_report_card` agent_output. The actual plan rewrite still happens in
 * monthlyPlanGenerator (baselineDelta + completedTaskOutcomes) — this card is
 * the human-readable executive reconciliation + the corrections it should apply.
 */
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { agentOutputs, matehAgents, instances } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import { readSeoTracking } from '@/services/seoTracking'
import { summarizeOrganicAi, renderOrganicAiHe, type OrganicAiSummary } from '@/services/seoTrackingReport'
import { and, eq, desc } from 'drizzle-orm'

interface ReportCardData {
    monthLabel: string
    targets: { revenue?: number; customers?: number; mrr?: number; maxCpaIls?: number; raw?: any }
    paid: { totalSpend?: number; avgRoas?: number; totalConversions?: number; source: string } | null
    organicAi: OrganicAiSummary
    gsc: { clicksFrom?: number; clicksTo?: number; imprFrom?: number; imprTo?: number } | null
}

async function gather(agent: MatehAgentRow, instanceId: string): Promise<ReportCardData> {
    const rd: any = agent.researchData || {}
    const now = new Date()
    const monthLabel = now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

    // targets — chosen scenario KPIs (month1 = first month of the run)
    const sc = rd.chosenScenario || {}
    const k = sc.kpis?.month1 || sc.kpis?.month3 || sc.kpis || {}
    const targets = {
        revenue: Number(k.revenue ?? k.revenueIls) || undefined,
        customers: Number(k.customers ?? k.newCustomers) || undefined,
        mrr: Number(k.mrr) || undefined,
        maxCpaIls: Number(rd.paidProfile?.maxCpaIls) || undefined,
        raw: k,
    }

    // paid actuals — reuse the latest weekly_creative_report stats (no Ads re-pull)
    let paid: ReportCardData['paid'] = null
    const [wr] = await db.select().from(agentOutputs)
        .where(and(eq(agentOutputs.agentId, agent.id), eq(agentOutputs.outputType, 'weekly_creative_report')))
        .orderBy(desc(agentOutputs.createdAt)).limit(1) as any[]
    if (wr?.metadata?.stats) {
        const st = wr.metadata.stats
        paid = { totalSpend: st.totalSpend, avgRoas: st.avgRoas, totalConversions: st.totalConversions, source: 'weekly_creative_report' }
    }

    // organic + AI — month-over-month (weekly series → back≈4)
    const organicAi = summarizeOrganicAi(readSeoTracking(agent), { back: 4 })

    // GSC clicks/impressions trend from the monitoring digest (first vs last in month)
    let gsc: ReportCardData['gsc'] = null
    const hist: any[] = rd.seoMonitoring?.gscDigest?.dailyHistory || []
    const thisMonth = hist.filter(h => typeof h.date === 'string' && h.date.slice(0, 7) === now.toISOString().slice(0, 7))
    const sumClicks = (h: any) => (h?.topQueries || []).reduce((s: number, q: any) => s + (Number(q.clicks) || 0), 0)
    const sumImpr = (h: any) => (h?.topQueries || []).reduce((s: number, q: any) => s + (Number(q.impressions) || 0), 0)
    if (thisMonth.length >= 2) {
        const f = thisMonth[0], l = thisMonth[thisMonth.length - 1]
        gsc = { clicksFrom: sumClicks(f), clicksTo: sumClicks(l), imprFrom: sumImpr(f), imprTo: sumImpr(l) }
    }

    return { monthLabel, targets, paid, organicAi, gsc }
}

async function compose(data: ReportCardData, apiKey: string | undefined): Promise<string> {
    const organicBlock = renderOrganicAiHe(data.organicAi, 'מול חודש קודם')
    const facts = {
        month: data.monthLabel,
        targets: data.targets,
        paid_actual: data.paid,
        organic_ai_summary: {
            traffic_etv: data.organicAi.traffic,
            ranked_keywords: data.organicAi.rank.keywordsCount,
            ai_citations: data.organicAi.aiMentions.citations,
            movers_up: data.organicAi.keywordMovers.up.slice(0, 8),
            movers_down: data.organicAi.keywordMovers.down.slice(0, 5),
            entered: data.organicAi.keywordMovers.entered.slice(0, 8),
            ai_responses: data.organicAi.aiResponses,
        },
        gsc_trend: data.gsc,
    }
    if (!apiKey) {
        // graceful fallback — deterministic card without LLM narrative
        return `## כרטיס תוצאות חודשי — ${data.monthLabel}\n\n${organicBlock}\n\n_(LLM narrative unavailable — showing measured data only.)_`
    }
    const prompt = `אתם אנליסט שיווק בכיר. כתבו "כרטיס תוצאות חודשי" בעברית (פנייה בלשון רבים), Markdown, על בסיס הנתונים בלבד — בלי להמציא מספרים. מבנה:
## כרטיס תוצאות — ${data.monthLabel}
1. **סטטוס כללי**: שורה אחת (on_track / מאחור / בסיכון) עם נימוק.
2. **יעד מול ביצוע** — טבלה: ערוץ | יעד | בפועל | פער. כסו: הכנסה/לקוחות (אם יש יעד), Ads (spend/ROAS/conversions), אורגני (תנועה/מילות מפתח/ציטוטי AI). אם אין נתון — כתבו "אין מדידה".
3. **מה עבד** (2-3 נקודות מבוססות מספרים).
4. **מה לא עבד / סיכונים** (2-3).
5. **תיקוני תוכנית לחודש הבא** (3-5 פעולות קונקרטיות הנגזרות מהפערים — לדגום מנצחים, לתקן ירידות, לסגור פערי keyword/AI).
שמרו תמציתי וחד. הנתונים:
${JSON.stringify(facts, null, 2)}`

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(90000),
        })
        if (!res.ok) throw new Error(`anthropic ${res.status}`)
        const j = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const text = (j.content?.find(c => c.type === 'text')?.text || '').trim()
        return text || `## כרטיס תוצאות חודשי — ${data.monthLabel}\n\n${organicBlock}`
    } catch (e) {
        console.warn('[monthlyReportCard] compose failed, deterministic fallback:', (e as Error).message)
        return `## כרטיס תוצאות חודשי — ${data.monthLabel}\n\n${organicBlock}`
    }
}

export async function generateMonthlyReportCard(agent: MatehAgentRow, instanceId: string): Promise<{ generated: boolean; outputId?: string; reason?: string }> {
    const data = await gather(agent, instanceId)
    const [inst] = await db.select({ aiProviderKey: instances.aiProviderKey }).from(instances).where(eq(instances.id, instanceId)) as any[]
    const displayHe = await compose(data, inst?.aiProviderKey || process.env.ANTHROPIC_API_KEY)
    const outputId = 'mrc_' + nanoid(8)
    await db.insert(agentOutputs).values({
        id: outputId,
        instanceId,
        agentId: agent.id,
        agentRole: 'menateach',
        outputType: 'monthly_report_card',
        title: `כרטיס תוצאות חודשי — ${data.monthLabel}`,
        content: JSON.stringify({ displayHe, data }),
        platform: null,
        metadata: {
            generatedAt: new Date().toISOString(),
            model: 'claude-sonnet-4-6',
            hasOrganicAi: data.organicAi.hasData,
            hasPaid: !!data.paid,
        },
        status: 'pending_review',
    } as any)
    return { generated: true, outputId }
}

/**
 * Monthly sweeper — generate a report card for each tenant with tracking
 * enabled. Wire on a daily tick gated to the 1st (idempotent enough: one card
 * per run; the cron gate prevents duplicates within the month).
 */
export async function runMonthlyReportCards(): Promise<void> {
    const agents = await db.select().from(matehAgents) as MatehAgentRow[]
    for (const agent of agents) {
        try {
            const s = readSeoTracking(agent)
            if (!s.config.enabled) continue
            const r = await generateMonthlyReportCard(agent, agent.vpsInstanceId)
            console.log(`[monthlyReportCard] ${agent.id}: ${r.generated ? r.outputId : r.reason}`)
        } catch (e) {
            console.error(`[monthlyReportCard] ${agent.id} failed:`, (e as Error).message)
        }
    }
}