/**
 * Turns seoTracking time-series into report-ready summaries: period-over-period
 * deltas for organic (rank/traffic) + AI visibility (citations/mentions), plus
 * keyword movers (up/down/entered/lost). Pure functions — reused by the weekly
 * report and the monthly report card.
 */
import type { SeoTrackingState, KeywordPosPoint } from '@/services/seoTracking'

export interface Delta { latest: number | null; prior: number | null; deltaAbs: number | null; deltaPct: number | null }

function delta(latest?: number, prior?: number): Delta {
    const l = latest ?? null, p = prior ?? null
    if (l == null || p == null) return { latest: l, prior: p, deltaAbs: null, deltaPct: null }
    const deltaAbs = l - p
    const deltaPct = p !== 0 ? (deltaAbs / p) * 100 : null
    return { latest: l, prior: p, deltaAbs, deltaPct }
}

/** Pick the latest point and the one ~N steps back (default the immediately prior). */
function pair<T>(arr: T[], back = 1): { latest?: T; prior?: T } {
    if (!arr.length) return {}
    return { latest: arr[arr.length - 1], prior: arr[arr.length - 1 - back] }
}

export interface KeywordMovers {
    up: Array<{ keyword: string; from: number; to: number }>
    down: Array<{ keyword: string; from: number; to: number }>
    entered: Array<{ keyword: string; to: number }>      // newly ranked (was unranked)
    lost: Array<{ keyword: string; from: number }>       // fell out of top 100
}

function keywordMovers(points: KeywordPosPoint[]): KeywordMovers {
    const m: KeywordMovers = { up: [], down: [], entered: [], lost: [] }
    if (points.length < 2) return m
    const cur = points[points.length - 1].byKeyword
    const prev = points[points.length - 2].byKeyword
    for (const kw of Object.keys(cur)) {
        const to = cur[kw], from = prev[kw]
        if (to != null && from == null) m.entered.push({ keyword: kw, to })
        else if (to == null && from != null) m.lost.push({ keyword: kw, from })
        else if (to != null && from != null && to !== from) {
            // lower position number = better rank
            if (to < from) m.up.push({ keyword: kw, from, to })
            else m.down.push({ keyword: kw, from, to })
        }
    }
    // biggest movements first
    m.up.sort((a, b) => (b.from - b.to) - (a.from - a.to))
    m.down.sort((a, b) => (a.from - a.to) - (b.from - b.to))
    return m
}

export interface OrganicAiSummary {
    hasData: boolean
    rank: { etv: Delta; keywordsCount: Delta }
    traffic: Delta
    keywordMovers: KeywordMovers
    aiMentions: { citations: Delta; mentions: Delta; perEngine?: Record<string, { citations: number; mentions: number }> }
    aiResponses?: { perEngine: Record<string, { brandCited: number; competitorsCited: number; prompts: number }>; date: string }
    paused?: { status: string; reason?: string }
}

/** Build a period-over-period organic + AI summary from tracking state. `back` =
 *  steps to compare against (1 = vs last week; 4 ≈ vs last month for weekly series). */
export function summarizeOrganicAi(state: SeoTrackingState, opts: { back?: number } = {}): OrganicAiSummary {
    const back = opts.back ?? 1
    const r = pair(state.series.ranks, back)
    const t = pair(state.series.traffic, back)
    const a = pair(state.series.aiMentions, back)
    const lastResp = state.series.aiResponses[state.series.aiResponses.length - 1]
    const hasData = !!(state.series.ranks.length || state.series.traffic.length || state.series.aiMentions.length)
    return {
        hasData,
        rank: {
            etv: delta(r.latest?.etv, r.prior?.etv),
            keywordsCount: delta(r.latest?.keywordsCount, r.prior?.keywordsCount),
        },
        traffic: delta(t.latest?.etv, t.prior?.etv),
        keywordMovers: keywordMovers(state.series.keywordPositions),
        aiMentions: {
            citations: delta(a.latest?.totalCitations, a.prior?.totalCitations),
            mentions: delta(a.latest?.totalMentions, a.prior?.totalMentions),
            perEngine: a.latest?.perEngine,
        },
        aiResponses: lastResp ? { perEngine: lastResp.perEngine, date: lastResp.date } : undefined,
        paused: (state.status === 'paused_cap' || state.status === 'paused_balance')
            ? { status: state.status, reason: state.statusReason } : undefined,
    }
}

function arrow(d: Delta, betterWhenLower = false): string {
    if (d.deltaAbs == null) return '—'
    if (d.deltaAbs === 0) return '↔'
    const good = betterWhenLower ? d.deltaAbs < 0 : d.deltaAbs > 0
    return good ? '🟢↑' : '🔴↓'
}
function fmt(n: number | null | undefined): string { return n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US') }
function pct(d: Delta): string { return d.deltaPct == null ? '' : ` (${d.deltaPct > 0 ? '+' : ''}${Math.round(d.deltaPct)}%)` }

/** Hebrew markdown block for reports. `period` labels the comparison window. */
export function renderOrganicAiHe(s: OrganicAiSummary, period = 'מול התקופה הקודמת'): string {
    if (!s.hasData) return '### אורגני + AI\n_אין עדיין נתוני מעקב (trackingעדיין לא רץ או לא מופעל)._'
    const L: string[] = ['### אורגני + AI — ' + period]
    L.push(`- **תנועה אורגנית (ETV):** ${fmt(s.traffic.latest)} ${arrow(s.traffic)}${pct(s.traffic)}`)
    L.push(`- **מילות מפתח מדורגות:** ${fmt(s.rank.keywordsCount.latest)} ${arrow(s.rank.keywordsCount)}${pct(s.rank.keywordsCount)} · ערך אורגני ${fmt(s.rank.etv.latest)} ${arrow(s.rank.etv)}`)
    const mv = s.keywordMovers
    if (mv.up.length) L.push(`- **עלו:** ${mv.up.slice(0, 5).map(k => `${k.keyword} (${k.from}→${k.to})`).join(' · ')}`)
    if (mv.entered.length) L.push(`- **נכנסו לדירוג:** ${mv.entered.slice(0, 5).map(k => `${k.keyword} (#${k.to})`).join(' · ')}`)
    if (mv.down.length) L.push(`- **ירדו:** ${mv.down.slice(0, 3).map(k => `${k.keyword} (${k.from}→${k.to})`).join(' · ')}`)
    L.push(`- **ציטוטים ב-AI:** ${fmt(s.aiMentions.citations.latest)} ${arrow(s.aiMentions.citations)}${pct(s.aiMentions.citations)} · אזכורים ${fmt(s.aiMentions.mentions.latest)} ${arrow(s.aiMentions.mentions)}`)
    if (s.aiResponses) {
        const eng = Object.entries(s.aiResponses.perEngine)
            .map(([e, v]) => `${e}: ${v.brandCited}/${v.prompts}`).join(' · ')
        L.push(`- **נצפינו בתשובות AI (brand cited / prompts):** ${eng}`)
    }
    if (s.paused) L.push(`- ⚠️ _מעקב מושהה (${s.paused.status}): ${s.paused.reason || ''}_`)
    return L.join('\n')
}