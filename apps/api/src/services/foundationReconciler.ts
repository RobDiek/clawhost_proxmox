/**
 * Foundation Reconciler — Layer 2 of the Campaign Foundation Engine (roadmap/24).
 *
 * PURE logic. Takes an AccountSnapshot (live truth) + a FoundationStrategy
 * (the tenant's plan from research) and emits a DeltaPlan: the list of changes
 * that would bring the account up to the planned foundation — and ONLY the
 * delta (idempotent §0.10: never re-proposes what already exists/is correct).
 *
 * Every §0 rule from roadmap/24 maps to a check here:
 *   §0.4  sibling-brand negatives (the #1 shared-account leak)
 *   §0.5  brand-defense split + geo overlap (anti-cannibalization)
 *   §0.6  Search only — PMax is reported, never restructured
 *   §0.7  bidding maturity gate — defer tROAS/tCPA until conv14d ≥ 20
 *   §0.8  budget coherence vs the brand's monthly cap
 *   §0.9  match types: broad is a REJECT; foundation = exact + phrase
 *   §0.10 idempotent — propose only what's MISSING or MIS-set
 *   §0.11 change-velocity freeze (don't pile changes on an unstable account)
 *
 * No I/O except buildFoundationStrategy (reads research_data). reconcile() is
 * a deterministic function of its inputs — trivially testable, and a second
 * run with no strategy change yields 0 deltas.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import type { MatehAgentRow } from '@/services/agentContext'
import type { AccountSnapshot, SnapCampaign } from '@/services/adsAccountSnapshot'

// ─── Strategy input (built from research_data) ───────────────────────────────

export interface PlannedAdGroup {
    label: string
    intentTier: 'BOFU' | 'MOFU' | 'TOFU' | 'BRAND' | string
    keywords: Array<{ keyword: string; matchType: 'exact' | 'phrase' | 'broad' | string }>
    negativeKeywords: string[]
    bidStrategyRecommended?: string
    bidBlockedUntilTrackingFix?: boolean
}
export interface FoundationStrategy {
    brand: string
    brandTokens: string[]
    siblingTokens: string[]
    siblingNames: string[]
    plannedAdGroups: PlannedAdGroup[]
    accountNegatives: string[]
    brandDefenseRequired: boolean
    monthlyBudgetCapIls?: number
    convValueQualitySubscore?: number
    hasStrategy: boolean        // false = research not run; reconciler limits to safety/structure deltas
}

// ─── Delta plan output ───────────────────────────────────────────────────────

export type DeltaKind =
    | 'create_ad_group' | 'add_keywords' | 'fix_match_type' | 'missing_exact_coverage'
    | 'add_sibling_negatives' | 'add_account_negatives' | 'brand_defense_split'
    | 'geo_redundancy' | 'budget_coherence' | 'bidding_defer' | 'change_velocity_freeze'
export type DeltaSeverity = 'critical' | 'high' | 'medium' | 'info'
export interface FoundationDelta {
    id: string
    kind: DeltaKind
    severity: DeltaSeverity
    target: { campaignId?: string; campaignName?: string; adGroupId?: string }
    before: string
    after: string
    rationaleHe: string
    risk: 'low' | 'medium' | 'high'
    /** Hint for the Layer-4 applier; creates land PAUSED. */
    apply?: { kind: string; payload?: Record<string, unknown> }
}
export interface DeltaPlan {
    ok: boolean
    brand: string
    generatedAt: string
    searchCampaignIds: string[]
    maturity: { conversions14d: number; mature: boolean; reason: string }
    budget: { proposedMonthlyIls: number; capIls?: number; withinCap: boolean }
    deltas: FoundationDelta[]
    blockers: string[]
    summary: Record<DeltaSeverity, number>
}

// ─── token / normalization helpers ───────────────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'של', 'עם', 'רשת', 'החיפוש', 'קבוצת', 'מודעות', 'ad', 'group', 'bofu', 'mofu', 'tofu', 'brand'])
function toks(s: string): string[] {
    return String(s || '').toLowerCase().split(/[^a-z0-9֐-׿]+/).filter(t => t.length >= 2 && !STOP.has(t))
}
function norm(s: string): string { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim() }
function jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0
    let inter = 0; for (const x of a) if (b.has(x)) inter++
    return inter / (a.size + b.size - inter)
}
let _seq = 0
const did = (kind: string) => `fd_${kind}_${++_seq}`

// ─── strategy builder (the only I/O) ─────────────────────────────────────────

function asPlannedAdGroups(records: unknown[]): PlannedAdGroup[] {
    if (!Array.isArray(records)) return []
    return records.map((r: any) => ({
        label: String(r?.ad_group_label_he || r?.ad_group_id || '').trim(),
        intentTier: String(r?.intent_tier || 'UNKNOWN'),
        keywords: Array.isArray(r?.keywords) ? r.keywords.map((k: any) => ({
            keyword: String(k?.keyword || '').trim(),
            // STAG "broad_with_smart_bidding" is still broad for foundation purposes.
            matchType: /broad/.test(String(k?.match_type || '')) ? 'broad' : String(k?.match_type || 'phrase').toLowerCase(),
        })).filter((k: any) => k.keyword) : [],
        negativeKeywords: Array.isArray(r?.negative_keywords) ? r.negative_keywords.map((x: any) => String(x)).filter(Boolean) : [],
        bidStrategyRecommended: r?.bid_strategy_recommended,
        bidBlockedUntilTrackingFix: r?.bid_strategy_blocked_until_tracking_fix === true,
    })).filter(p => p.label)
}

/** Read the tenant's planned foundation from research_data. */
export async function buildFoundationStrategy(agent: MatehAgentRow, snapshot: AccountSnapshot): Promise<FoundationStrategy> {
    const rd: any = agent.researchData || {}
    const kw = rd.results?.paid_keyword_research || {}
    const extras: any = kw.extras || {}
    const records: unknown[] = (kw.records as unknown[]) || []

    // budget cap: chosenScenario.budget_allocation_ils may be a number (monthly
    // total) or a per-cluster breakdown object — sum it either way.
    let capIls: number | undefined
    const rawBudget = rd.chosenScenario?.budget_allocation_ils ?? rd.chosenScenario?.monthly_budget_ils
    if (typeof rawBudget === 'number') capIls = rawBudget
    else if (rawBudget && typeof rawBudget === 'object') {
        const sum = Object.values(rawBudget).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
        if (sum > 0) capIls = sum
    }

    // brand / sibling tokens — reuse the snapshot's scope-integrity tokenization.
    const si = snapshot.scopeIntegrity
    const me = si?.agents.find(a => a.agentId === agent.id)
    const brandTokens = me?.distinctiveTokens?.length ? me.distinctiveTokens : toks(agent.name || '')
    const siblingTokens = si ? si.agents.filter(a => a.agentId !== agent.id).flatMap(a => a.distinctiveTokens) : []

    const baseline: any = rd.results?.client_account_baseline?.extras || rd.results?.client_account_baseline || {}
    const convQ = Number(baseline?.conv_value_quality_subscore_0_100 ?? baseline?.conv_value_quality_subscore)

    return {
        brand: agent.name || snapshot.brand,
        brandTokens,
        siblingTokens: [...new Set(siblingTokens)],
        siblingNames: snapshot.siblingBrands.map(b => b.name),
        plannedAdGroups: asPlannedAdGroups(records),
        accountNegatives: Array.isArray(extras.account_level_negatives) ? extras.account_level_negatives.map((x: any) => String(x)) : [],
        brandDefenseRequired: extras.brand_bidding_defense_required === true,
        monthlyBudgetCapIls: capIls,
        convValueQualitySubscore: Number.isFinite(convQ) ? convQ : undefined,
        hasStrategy: records.length > 0,
    }
}

// ─── the reconciler (pure) ───────────────────────────────────────────────────

const SMART_BIDDING = new Set(['TARGET_CPA', 'TARGET_ROAS', 'MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'MAXIMIZE_CONVERSION_VALUE_TARGET_ROAS'])

export function reconcile(snapshot: AccountSnapshot, strategy: FoundationStrategy): DeltaPlan {
    _seq = 0
    const deltas: FoundationDelta[] = []
    const blockers: string[] = []
    const searchCampaigns = snapshot.campaigns.filter(c => c.channel === 'SEARCH')
    const searchCampaignIds = searchCampaigns.map(c => c.id)
    const primarySearch: SnapCampaign | undefined = searchCampaigns.sort((a, b) => b.perf14d.costIls - a.perf14d.costIls)[0]

    // ── §0.7 maturity gate ────────────────────────────────────────────────────
    const conv14d = Math.round(snapshot.perf14dTotal.conversions)
    const qualityOk = strategy.convValueQualitySubscore == null || strategy.convValueQualitySubscore >= 70
    const mature = conv14d >= 20 && qualityOk
    const maturity = {
        conversions14d: conv14d, mature,
        reason: mature
            ? `conversions(14d)=${conv14d} ≥20${strategy.convValueQualitySubscore != null ? ` + conv-value-quality ${strategy.convValueQualitySubscore}/100` : ''} — bidding changes can be trusted`
            : `conversions(14d)=${conv14d}${conv14d < 20 ? ' (<20)' : ''}${strategy.convValueQualitySubscore != null && !qualityOk ? ` / conv-value-quality ${strategy.convValueQualitySubscore} (<70)` : ''} — bidding proposals deferred`,
    }

    // ── §0.11 change-velocity freeze (gates everything) ───────────────────────
    const vel = snapshot.safety?.rawSnapshot?.changeEventsLast7d ?? 0
    if (vel >= 5) {
        blockers.push(`change_velocity=${vel}/7d`)
        deltas.push({
            id: did('velocity'), kind: 'change_velocity_freeze', severity: 'high',
            target: {}, before: `${vel} שינויים ב-7 ימים`, after: 'הקפאת שינויים ~14 יום',
            rationaleHe: `זוהו ${vel} שינויים משמעותיים בחשבון ב-7 הימים האחרונים. כדי ש-Smart Bidding ילמד מנתונים יציבים, מומלץ להקפיא שינויים מבניים ל-~14 יום לפני יישום ה-foundation. הדלתות למטה מוכנות — אך כדאי ליישם בהדרגה ולא הכל באותו שבוע.`,
            risk: 'low',
        })
    }

    // ── §0.9 match types: broad is a REJECT ───────────────────────────────────
    const broad = snapshot.keywords.filter(k => k.matchType === 'BROAD')
    if (broad.length) {
        const sample = broad.slice(0, 8).map(k => `"${k.text}"`).join(', ')
        deltas.push({
            id: did('broad'), kind: 'fix_match_type', severity: 'high',
            target: {}, before: `${broad.length} מילות מפתח ב-broad match`, after: 'phrase / exact בלבד',
            rationaleHe: `מדיניות האיכות שלנו: רק exact + phrase. ${broad.length} מילות מפתח רצות כעת ב-broad match (${sample}${broad.length > 8 ? '…' : ''}) — broad מושך תנועה רחבה ולא ממירה ומבזבז תקציב. יש להמיר ל-phrase (או exact ל-BOFU), או להחליף ב-broad+Smart Bidding רק כשהנתונים בשלים ויש negatives אגרסיביים.`,
            risk: 'medium',
            apply: { kind: 'convert_broad_keywords', payload: { criterionIds: broad.map(k => ({ adGroupId: k.adGroupId, criterionId: k.criterionId, text: k.text })) } },
        })
    }

    // ── §0.9 exact coverage for high-intent ───────────────────────────────────
    const exactCount = snapshot.keywords.filter(k => k.matchType === 'EXACT').length
    if (snapshot.keywords.length > 0 && exactCount === 0) {
        deltas.push({
            id: did('noexact'), kind: 'missing_exact_coverage', severity: 'medium',
            target: {}, before: '0 מילות מפתח ב-exact match', after: 'exact למונחי BOFU/מותג',
            rationaleHe: `אין אף מילת מפתח ב-exact match. למונחי כוונת-קנייה (BOFU) ולמונחי המותג, exact נותן שליטה מדויקת על מי שרואה את המודעה ו-Quality Score גבוה יותר. מומלץ לכסות את מונחי ה-BOFU המובילים ב-exact.`,
            risk: 'low',
        })
    }

    // ── §0.4 sibling-brand negatives (the #1 shared-account leak) ──────────────
    if (strategy.siblingTokens.length && primarySearch) {
        const negText = snapshot.negatives.map(n => norm(n.text)).join(' | ')
        const missing = strategy.siblingTokens.filter(t => !negText.includes(t.toLowerCase()))
        if (missing.length) {
            deltas.push({
                id: did('sibneg'), kind: 'add_sibling_negatives', severity: 'critical',
                target: { campaignId: primarySearch.id, campaignName: primarySearch.name },
                before: `0 מ-${strategy.siblingTokens.length} מונחי מותגים-אחים חסומים`,
                after: `הוספת negatives: ${missing.join(', ')}`,
                rationaleHe: `חשבון משותף עם ${strategy.siblingNames.join(', ') || 'מותגים אחרים'}. כדי שלא תשלמו על קליקים שמיועדים למותג אחר ולא תתחרו בעצמכם, יש להוסיף את מונחי המותגים-האחים (${missing.join(', ')}) כ-negatives (phrase) לקמפיין. זו הדליפה מספר 1 בחשבונות משותפים.`,
                risk: 'low',
                apply: { kind: 'add_campaign_negatives', payload: { campaignId: primarySearch.id, keywords: missing, matchType: 'PHRASE' } },
            })
        }
    }

    // ── account-level junk negatives from strategy ────────────────────────────
    if (strategy.accountNegatives.length && primarySearch) {
        const have = new Set(snapshot.negatives.map(n => norm(n.text)))
        const missing = strategy.accountNegatives.filter(n => !have.has(norm(n)))
        if (missing.length) {
            deltas.push({
                id: did('acctneg'), kind: 'add_account_negatives', severity: 'medium',
                target: { campaignId: primarySearch.id, campaignName: primarySearch.name },
                before: `${snapshot.negatives.length} negatives קיימים`,
                after: `+${missing.length} מילות זבל מהמחקר`,
                rationaleHe: `המחקר זיהה ${missing.length} מונחי-זבל שכדאי לחסום (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}) — תנועה לא רלוונטית שמבזבזת תקציב ללא המרה.`,
                risk: 'low',
                apply: { kind: 'add_campaign_negatives', payload: { campaignId: primarySearch.id, keywords: missing, matchType: 'PHRASE' } },
            })
        }
    }

    // ── §0.10 create missing planned ad groups (idempotent) ───────────────────
    if (strategy.hasStrategy && primarySearch) {
        const existing = snapshot.adGroups.map(g => ({ g, t: new Set(toks(g.name)) }))
        for (const plan of strategy.plannedAdGroups) {
            const pt = new Set(toks(plan.label))
            const match = existing.find(e => norm(e.g.name) === norm(plan.label) || jaccard(e.t, pt) >= 0.5)
            if (match) {
                // ad group exists → propose only MISSING exact/phrase keywords (§0.10)
                const have = new Set(snapshot.keywords.filter(k => k.adGroupId === match.g.id).map(k => norm(k.text)))
                const allHave = new Set(snapshot.keywords.map(k => norm(k.text)))
                const missingKw = plan.keywords.filter(k => k.matchType !== 'broad' && !have.has(norm(k.keyword)) && !allHave.has(norm(k.keyword)))
                if (missingKw.length) {
                    deltas.push({
                        id: did('addkw'), kind: 'add_keywords', severity: 'medium',
                        target: { campaignId: primarySearch.id, adGroupId: match.g.id },
                        before: `קבוצה "${match.g.name}" — ${have.size} מילות מפתח`,
                        after: `+${missingKw.length}: ${missingKw.slice(0, 6).map(k => `${k.keyword}[${k.matchType}]`).join(', ')}${missingKw.length > 6 ? '…' : ''}`,
                        rationaleHe: `קבוצת המודעות "${match.g.name}" קיימת אך חסרות בה ${missingKw.length} מילות מפתח מתוכננות (exact/phrase) מהמחקר.`,
                        risk: 'low',
                        apply: { kind: 'add_keywords', payload: { adGroupId: match.g.id, keywords: missingKw } },
                    })
                }
            } else {
                const exactPhrase = plan.keywords.filter(k => k.matchType !== 'broad')
                deltas.push({
                    id: did('newag'), kind: 'create_ad_group', severity: 'high',
                    target: { campaignId: primarySearch.id },
                    before: '(חסר)',
                    after: `קבוצת מודעות "${plan.label}" [${plan.intentTier}] — ${exactPhrase.length} מילות מפתח`,
                    rationaleHe: `המבנה המתוכנן כולל קבוצת מודעות "${plan.label}" (${plan.intentTier}) שאינה קיימת בחשבון. יצירה במצב מושהה (PAUSED) לאישורכם, עם ${exactPhrase.length} מילות מפתח exact/phrase.`,
                    risk: 'low',
                    apply: { kind: 'create_ad_group_paused', payload: { campaignId: primarySearch.id, label: plan.label, intentTier: plan.intentTier, keywords: exactPhrase } },
                })
            }
        }
    }

    // ── §0.5a brand-defense split ─────────────────────────────────────────────
    if (strategy.brandDefenseRequired && primarySearch) {
        const hasBrandAdGroup = snapshot.adGroups.some(g => {
            const t = toks(g.name)
            return strategy.brandTokens.some(bt => t.includes(bt))
        }) || strategy.plannedAdGroups.some(p => p.intentTier === 'BRAND' && snapshot.adGroups.some(g => jaccard(new Set(toks(g.name)), new Set(toks(p.label))) >= 0.5))
        if (!hasBrandAdGroup) {
            deltas.push({
                id: did('branddef'), kind: 'brand_defense_split', severity: 'high',
                target: { campaignId: primarySearch.id },
                before: 'אין קבוצת הגנת-מותג ייעודית',
                after: 'קבוצת BRAND נפרדת + negative למונח המותג בקבוצות הגנריות',
                rationaleHe: `זוהה צורך בהגנת מותג (מתחרים עשויים להציע על שמכם), אך אין קבוצת מודעות ייעודית למונחי המותג. מומלץ ליצור קבוצת "הגנת מותג" נפרדת (exact, CPC נמוך, QS גבוה) ולהוסיף את מונח המותג כ-negative בקבוצות הגנריות — כדי למנוע קניבליזציה וייקור מיותר.`,
                risk: 'low',
            })
        }
    }

    // ── §0.5b geo overlap (national + districts on the same campaign) ──────────
    for (const c of searchCampaigns) {
        const geos = snapshot.geo.filter(g => g.campaignId === c.id && !g.negative)
        const national = geos.find(g => /^israel$/i.test((g.geoName || '').trim()))
        const districts = geos.filter(g => /district|מחוז/i.test(g.geoName || '') || (!/^israel$/i.test((g.geoName || '').trim()) && g.geoName))
        if (national && districts.length) {
            deltas.push({
                id: did('geo'), kind: 'geo_redundancy', severity: 'medium',
                target: { campaignId: c.id, campaignName: c.name },
                before: `יעד ארצי (Israel) + ${districts.length} מחוזות חופפים`,
                after: 'בחירה אחת: או ארצי, או מחוזות עם bid-modifiers',
                rationaleHe: `בקמפיין "${c.name}" מוגדר גם יעד ארצי (כל ישראל) וגם ${districts.length} מחוזות ספציפיים — חפיפה שמקשה על שליטה ב-bid לפי אזור. מומלץ לבחור מודל אחד: יעד ארצי בלבד, או פירוק למחוזות עם bid-modifiers מותאמים.`,
                risk: 'low',
            })
        }
    }

    // ── §0.7 bidding posture (defer smart bidding until mature) ────────────────
    const smartCampaigns = searchCampaigns.filter(c => SMART_BIDDING.has(c.biddingStrategyType))
    if (!mature && smartCampaigns.length) {
        deltas.push({
            id: did('biddefer'), kind: 'bidding_defer', severity: 'medium',
            target: {},
            before: `${smartCampaigns.length} קמפיינים על Smart Bidding`,
            after: 'דחיית הצעות tROAS/tCPA עד לבשלות נתונים',
            rationaleHe: `${maturity.reason}. ${smartCampaigns.length} קמפיינים כבר על Smart Bidding (${smartCampaigns.map(c => c.biddingStrategyType).join(', ')}) — ה-foundation לא ישנה את ה-bidding כעת; הצעות אסטרטגיית-הצעות יידחו עד שייאספו ≥20 המרות נקיות ב-14 יום. עד אז: מבנה, מילות מפתח ו-negatives בלבד.`,
            risk: 'low',
        })
    }

    // ── §0.8 budget coherence ─────────────────────────────────────────────────
    const proposedMonthly = Math.round(snapshot.campaigns.reduce((s, c) => s + (c.dailyBudgetIls || 0), 0) * 30.4)
    const cap = strategy.monthlyBudgetCapIls
    const withinCap = cap == null || proposedMonthly <= cap * 1.1
    if (cap != null && !withinCap) {
        deltas.push({
            id: did('budget'), kind: 'budget_coherence', severity: 'medium',
            target: {},
            before: `תקציב חודשי נוכחי ~₪${proposedMonthly.toLocaleString()}`,
            after: `תקרה מהאסטרטגיה ₪${cap.toLocaleString()}`,
            rationaleHe: `סך התקציבים היומיים של ${snapshot.brand} מסתכם ב-~₪${proposedMonthly.toLocaleString()}/חודש — מעל התקרה שנקבעה באסטרטגיה (₪${cap.toLocaleString()}). יש ליישר את התקציב לתקרה לפני הרחבת מבנה.`,
            risk: 'low',
        })
    }

    const summary: Record<DeltaSeverity, number> = { critical: 0, high: 0, medium: 0, info: 0 }
    for (const d of deltas) summary[d.severity]++
    deltas.sort((a, b) => ({ critical: 0, high: 1, medium: 2, info: 3 }[a.severity] - { critical: 0, high: 1, medium: 2, info: 3 }[b.severity]))

    return {
        ok: true, brand: snapshot.brand, generatedAt: snapshot.capturedAt,
        searchCampaignIds, maturity,
        budget: { proposedMonthlyIls: proposedMonthly, capIls: cap, withinCap },
        deltas, blockers, summary,
    }
}

/** Convenience: snapshot already in hand → strategy → reconcile. */
export async function reconcileForAgent(agent: MatehAgentRow, snapshot: AccountSnapshot): Promise<DeltaPlan> {
    const strategy = await buildFoundationStrategy(agent, snapshot)
    return reconcile(snapshot, strategy)
}

export function renderDeltaPlan(p: DeltaPlan): string {
    const L: string[] = []
    L.push(`═══ FOUNDATION DELTA PLAN — ${p.brand} ═══`)
    L.push(`generated ${p.generatedAt} · search campaigns: ${p.searchCampaignIds.join(', ') || 'none'}`)
    L.push(`maturity: ${p.maturity.reason}`)
    L.push(`budget: ~₪${p.budget.proposedMonthlyIls.toLocaleString()}/mo${p.budget.capIls != null ? ` vs cap ₪${p.budget.capIls.toLocaleString()} → ${p.budget.withinCap ? 'within' : 'OVER'}` : ' (no cap in strategy)'}`)
    if (p.blockers.length) L.push(`⚠ blockers: ${p.blockers.join(', ')}`)
    L.push(`deltas: ${p.deltas.length} (${p.summary.critical}🔴 ${p.summary.high}🟠 ${p.summary.medium}🟡 ${p.summary.info}ℹ)`)
    L.push('')
    for (const d of p.deltas) {
        const icon = d.severity === 'critical' ? '🔴' : d.severity === 'high' ? '🟠' : d.severity === 'medium' ? '🟡' : 'ℹ'
        L.push(`${icon} [${d.kind}] risk=${d.risk}${d.target.campaignName ? ` · ${d.target.campaignName}` : ''}`)
        L.push(`    before: ${d.before}`)
        L.push(`    after:  ${d.after}`)
        L.push(`    why:    ${d.rationaleHe}`)
    }
    if (!p.deltas.length) L.push('✅ no deltas — account matches the planned foundation.')
    return L.join('\n')
}

/** Script/cron convenience: load agent by id (caller supplies snapshot). */
export async function loadAgent(agentId: string): Promise<MatehAgentRow | null> {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
    return (a as MatehAgentRow) || null
}