/**
 * Phase 4.3-N v8 — Pass 3: Senior-Bar Coverage Check.
 *
 * Deterministic scan of 15 senior-agency rules against the assembled tasks.
 * For each rule that's MISSING from the plan, spawn a targeted single-task
 * Opus call to synthesize a fill. Merge fills into the plan.
 *
 * Why this works where v7's "ask Opus to include all 10 rules in one prompt"
 * didn't: Opus drops rules under output-budget pressure in single-pass
 * generation. By moving rule coverage to a SEPARATE deterministic check,
 * we guarantee 100% senior-bar coverage. The LLM call per missing rule has
 * full context window for ONE task — depth is high.
 *
 * Rules 1-10 are the senior-agency-bar rules (from feedback_senior_marketing_bar).
 * Rules 11-15 are link-audit-driven (data-conditional).
 */

import type { PromptCtx } from './monthlyPlanGenerator'
import { callOpusStream } from './llmStream'
import { extractLlmJson } from './llmJson'
import { withHebrewStyleGuide } from './hebrewStyleGuide'
import { randomBytes } from 'crypto'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

interface RuleDefinition {
    id: string                          // 'cr_validation' | 'rsa_variants' | ...
    label: string                       // Hebrew + English label for logs
    applies: (ctx: PromptCtx) => boolean // does this rule apply to this tenant?
    matches: (tasks: MonthlyTask[], ctx: PromptCtx) => boolean // does the plan already satisfy it?
    fillBrief: (ctx: PromptCtx) => { systemAddon: string; userBrief: string; type: MonthlyTask['type']; channel: MonthlyTask['channel']; priority: MonthlyTask['priority'] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function lower(s: string | undefined): string {
    return (s || '').toLowerCase()
}
function taskMatchesKeywords(t: MonthlyTask, patterns: RegExp[]): boolean {
    const haystack = `${t.title || ''} ${t.summary || ''} ${(t.actionPlan || []).map(a => a.step).join(' ')}`.toLowerCase()
    return patterns.some(p => p.test(haystack))
}
function countTasksMatchingKeywords(tasks: MonthlyTask[], patterns: RegExp[]): number {
    return tasks.filter(t => taskMatchesKeywords(t, patterns)).length
}

// ─── Tenant signal detection ──────────────────────────────────────────────
function isRecurringRevenue(ctx: PromptCtx): boolean {
    // Heuristic — better to over-include than miss this senior-bar rule.
    const desc = lower(ctx.businessDesc) + ' ' + lower((ctx.brandBookFull as any)?.businessDescription)
    const positioning = lower(JSON.stringify(ctx.positioningResults || {})).slice(0, 4000)
    const recurringMarkers = [
        'subscription', 'recurring', 'storage', 'saas', 'membership', 'מנוי',
        'אחסון', 'חוזר', 'מנויים', 'monthly', 'חודשי', 'service contract', 'retainer',
    ]
    if (recurringMarkers.some(m => desc.includes(m) || positioning.includes(m))) return true
    // Default: TRUE — retention is rarely wrong to include; missing it = senior-bar fail.
    return true
}
function hasLongResearchCycle(ctx: PromptCtx): boolean {
    const personasJson = lower(JSON.stringify(ctx.audiencePersonas || {})).slice(0, 6000)
    const cycleMarkers = [
        'research cycle', 'long cycle', 'מחקר ארוך', 'תהליך החלטה ארוך',
        '2 weeks', '3 weeks', 'בועות', 'consideration phase', 'long consideration',
        'b2b', 'wedding', 'חתונה', 'renovation', 'שיפוץ', 'moving', 'הובלה', 'מעבר דירה',
    ]
    return cycleMarkers.some(m => personasJson.includes(m))
}
function hasPaidSearchActive(ctx: PromptCtx, tasks: MonthlyTask[]): boolean {
    const adsConnected = !!ctx.tenantState?.signals?.googleAds?.connected
    const hasPaidTask = tasks.some(t => t.channel === 'google_ads')
    return adsConnected || hasPaidTask
}

// ─── Link-audit signal detection ──────────────────────────────────────────
// K22: ctx.linkAudit IS `rd.results.link_audit` (the whole object, NOT just
// extras). Real schema produced by the link_audit prefetch stage:
//   linkAudit.extras = {
//     our_profile_summary: { referring_domains_total, spam_score, ... },
//     anchor_distribution_analysis: { exact_match_pct, partial_pct, ... },
//     velocity_signal: { new_referring_90d, lost_referring_90d },
//     competitor_link_benchmarks: [...],
//     ...
//   }
//   linkAudit.records = [
//     { type: 'link_gap_outreach',  domain, outreach_angle, priority, ... },
//     { type: 'lost_link_recovery', domain, _metric_value, outreach_angle, ... },
//     { type: 'anchor_remediation', ... },
//   ]
// Legacy fields (la.linkGap / la.lostLinks / la.anchor_distribution / la.
// referring_domains_total at root) are kept as fallbacks so older fixtures
// continue to work; new prefetch shape takes precedence.
function linkAuditData(ctx: PromptCtx): { hasData: boolean; exactMatchPct: number; linkGapCount: number; lostLinksCount: number; referringDomains: number } {
    const la: any = ctx.linkAudit || {}
    const extras: any = la.extras || {}
    const records: any[] = Array.isArray(la.records) ? la.records : []

    const anchor = extras.anchor_distribution_analysis || la.anchor_distribution || la.anchorDistribution || {}
    const exactMatchPct = Number(anchor.exact_match_pct || anchor.exactMatchPct || 0)

    // Prefer records[] from the new prefetch; fall back to legacy arrays.
    const linkGapCount = records.filter(r => r && r.type === 'link_gap_outreach').length
        || (Array.isArray(la.linkGap) ? la.linkGap.length : 0)
    const lostLinksCount = records.filter(r => r && r.type === 'lost_link_recovery').length
        || (Array.isArray(la.lostLinks) ? la.lostLinks.length : 0)

    const ourProfile = extras.our_profile_summary || {}
    const referringDomains = Number(
        ourProfile.referring_domains_total
        || la.referring_domains_total
        || la.referringDomainsTotal
        || (Array.isArray(la.referringDomains) ? la.referringDomains.length : 0)
    )

    const hasData = referringDomains > 0
        || linkGapCount > 0
        || lostLinksCount > 0
        || exactMatchPct > 0
        || records.length > 0
    return { hasData, exactMatchPct, linkGapCount, lostLinksCount, referringDomains }
}

// ─── Primary competitor extraction ────────────────────────────────────────
function primaryCompetitor(ctx: PromptCtx): string | null {
    const cl: any = ctx.competitorLandscape || {}
    const list = cl.competitors || cl.primary_competitors || cl.top_competitors || cl.list
    if (Array.isArray(list) && list.length > 0) {
        const first = list[0]
        return (typeof first === 'string' ? first : first?.name || first?.domain || first?.businessName) || null
    }
    return null
}

// ─── Rule definitions ─────────────────────────────────────────────────────
const RULES: RuleDefinition[] = [
    // 1. CR validation precedes Smart Bidding migration
    {
        id: 'cr_validation',
        label: 'CR validation before Smart Bidding',
        applies: (ctx) => hasPaidSearchActive(ctx, []),
        matches: (tasks) => tasks.some(t =>
            t.type === 'measurement_gap' &&
            taskMatchesKeywords(t, [
                /(המרה|conversion|cr |cr validation|funnel|פאנל|הגדרת המרות|אימות המרה)/i,
            ])
        ),
        fillBrief: (ctx) => {
            const maxCpa = (ctx.paidProfile as any)?.maxCpaIls
            const cpaConstraint = (typeof maxCpa === 'number' && maxCpa > 0)
                ? ` The user has set a HARD MAX CPA of ₪${maxCpa.toLocaleString()} — the validation MUST explicitly verify the CR definition supports landing at or below this ceiling, and the actionPlan must include a step that confirms 'current measured CR × ₪${maxCpa.toLocaleString()} target produces conversions matching account economics'.`
                : ''
            return {
                type: 'measurement_gap',
                channel: 'google_ads',
                priority: 'P0',
                systemAddon: 'You produce a P0 measurement_gap task that audits current Google Ads conversion definitions + validates the funnel from button-click → form-submit → qualified-lead → customer. The output task MUST be a hard dependency for any tCPA/Smart-Bidding task in the plan.' + cpaConstraint,
                userBrief: `Produce ONE measurement_gap task titled in Hebrew (≤80 chars) about auditing what counts as conversion in the current Google Ads account and validating the funnel before any Smart-Bidding migration. Sources should cite the existing conversion_actions list from tenantState.signals.googleAds.existingConversionActions, GA4 event definitions, and the chosenScenario's first_win + 30_day_plan if they mention bid-strategy changes. ActionPlan must include: (a) Mazhir conv audit endpoint call (automated:true ~10min), (b) GA4 funnel audit (automated:true), (c) manual interview-1 with founder about which actions = qualified lead (automated:false ~20min), (d) reconciliation document, (e) monitoring trigger for next month.${cpaConstraint}`,
            }
        },
    },

    // 2. Creative diversity: 3 RSA variants (price / urgency / trust)
    {
        id: 'rsa_variants',
        label: '3 RSA variants (price/urgency/trust)',
        applies: (ctx) => hasPaidSearchActive(ctx, []),
        matches: (tasks) => {
            const rsaTasks = tasks.filter(t =>
                t.channel === 'google_ads' &&
                t.type === 'creative_refresh' &&
                taskMatchesKeywords(t, [/(rsa|מודעת חיפוש|responsive search ad)/i])
            )
            return rsaTasks.length >= 3
        },
        fillBrief: () => ({
            type: 'creative_refresh',
            channel: 'google_ads',
            priority: 'P1',
            systemAddon: 'You produce 3 separate creative_refresh tasks (one per psychological angle: A=price-first, B=urgency, C=trust). Return ALL 3 as a JSON array.',
            userBrief: `Produce THREE creative_refresh tasks for Google Ads RSA variants — each with its own angle: A) price-first (anchor on a concrete price/discount from brandBookFull.usps), B) urgency (limited-time / availability / seasonal), C) trust (reviews count / years in business / insurance / 24/7). Each task should specify the actual 15 Hebrew RSA headlines (≤30 chars each) and 4 descriptions (≤90 chars) inside actionPlan steps. Output as JSON array of 3 tasks.`,
        }),
    },

    // 3. Funnel-stage coverage — BOFU comparison page vs primary competitor
    {
        id: 'bofu_comparison',
        label: 'BOFU comparison page vs primary competitor',
        applies: (ctx) => !!primaryCompetitor(ctx),
        matches: (tasks, ctx) => {
            const comp = primaryCompetitor(ctx)
            if (!comp) return true
            const compLower = comp.toLowerCase()
            return tasks.some(t =>
                (t.type === 'landing_page' || t.type === 'content_creation') &&
                (lower(t.title).includes(compLower) || lower(t.summary).includes(compLower)) &&
                taskMatchesKeywords(t, [/(vs|השוואה|comparison|בעד ונגד)/i])
            )
        },
        fillBrief: (ctx) => {
            const comp = primaryCompetitor(ctx) || 'מתחרה ראשי'
            return {
                type: 'landing_page',
                channel: 'seo',
                priority: 'P1',
                systemAddon: 'You produce a BOFU comparison landing page task — the highest-converting page type for recurring-revenue sites.',
                userBrief: `Produce ONE landing_page task to create a BOFU comparison page: "${ctx.businessName} vs ${comp}". Hebrew title. Sources MUST cite competitorLandscape entry for ${comp} (positioning, USPs, weaknesses) and chosenScenario.first_win. ActionPlan: outline H1+H2 (8-12 sections), comparison table (5-8 feature rows: pricing, contract length, included services, response time, coverage, etc. — use real data from competitorLandscape), trust signals slot, schema markup (Product / Service + ComparisonTable + FAQPage), CTA copy in Hebrew, monitoring step.`,
            }
        },
    },

    // 4. Competitive intelligence monitor (weekly)
    {
        id: 'competitive_intel',
        label: 'Competitive intel monitor (weekly scan)',
        applies: () => true,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(transparency center|wayback|backlink alert|מתחרים.*ניטור|competitive (intel|monitor)|weekly scan)/i])
        ),
        fillBrief: (ctx) => ({
            type: 'measurement_gap',
            channel: 'cross',
            priority: 'P1',
            systemAddon: 'You produce a competitive intelligence monitoring task. Reaction window 24-48h.',
            userBrief: `Produce ONE task setting up WEEKLY competitive intel monitoring for the top 3 competitors named in competitorLandscape. Hebrew title (≤80 chars). ActionPlan: (1) Google Ads Transparency Center scan (saved URL per competitor), (2) Wayback Machine site diff (every 7 days), (3) backlink delta alert via DataForSEO or manual GSC Links, (4) ad copy archive (screenshot top creative per competitor), (5) escalation trigger: if competitor launches new offer → 48h response plan spawned. Monitoring metric: weekly delta report delivered to founder.`,
        }),
    },

    // 5. CRO audit (form / WhatsApp / mobile speed / trust signals)
    {
        id: 'cro_audit',
        label: 'CRO audit (form + WA + mobile speed + trust)',
        applies: () => true,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(cro|heatmap|session recording|form abandon|אופטימיזציית המרה|שדות טופס|כפתור (whatsapp|וואטסאפ)|מהירות (mobile|נייד)|signals proximity|אמון)/i])
        ),
        fillBrief: () => ({
            type: 'website_change',
            channel: 'website',
            priority: 'P1',
            systemAddon: 'You produce a CRO audit task — heatmap + session recording + form abandonment analytics + mobile speed.',
            userBrief: `Produce ONE website_change task: full CRO audit. Hebrew title. Sources cite ga4.funnel (drop-off rates per step) + audit.existingAccountAudit (CR baseline) + internal_seo_audit (mobile speed / CWV). ActionPlan: (1) install heatmap (Microsoft Clarity — free) on top-3 LPs, (2) install session recording, (3) form field-by-field abandonment analytics via GA4 events, (4) mobile speed audit (PageSpeed Insights INP/LCP/CLS), (5) WhatsApp button placement + visibility audit, (6) trust signal proximity audit (reviews/certifications near CTA), (7) monitoring after 14 days collection → ship A/B test for top friction point.`,
        }),
    },

    // 6. Retention / LTV (cross-sell / reactivation / referral)
    {
        id: 'retention_ltv',
        label: 'Retention / LTV task',
        applies: (ctx) => isRecurringRevenue(ctx),
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(reactivation|cross-sell|referral|מכירה צולבת|הפעלה מחדש|הפניה|loyalty|שימור|reactivat|retention|repeat)/i])
        ),
        fillBrief: (ctx) => ({
            type: 'audience_expansion',
            channel: 'email',
            priority: 'P1',
            systemAddon: 'You produce a retention / LTV task. Acquisition-only plans leave 30-50% revenue on the table.',
            userBrief: `Produce ONE retention/LTV task for ${ctx.businessName}. Choose one or bundle: cross-sell sequence (existing customers → adjacent product), reactivation (lapsed customers → win-back offer), or referral (happy customers → "bring a friend" discount). Sources cite brandBookFull.usps + chosenScenario + audiencePersonas (existing-customer persona). ActionPlan: (1) segment past customers via Customer Match upload (automated via mazhir_conv_setup), (2) draft 3-email sequence in Hebrew (lead-magnet → educate → offer), (3) define qualification criteria (e.g. ≥6 months tenure, no complaints), (4) ship to 100-name test cohort, (5) measure response rate + revenue lift over 30d, (6) scale if response ≥15%.`,
        }),
    },

    // 7. Mobile-first (click-to-call / WhatsApp Business / mobile LP)
    {
        id: 'mobile_first',
        label: 'Mobile-first optimization',
        applies: () => true,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(click-to-call|לחצן חיוג|whatsapp business|וואטסאפ עסקי|mobile lp|דף נחיתה (נייד|מובייל)|mobile variant|mobile speed)/i])
        ),
        fillBrief: (ctx) => ({
            type: 'website_change',
            channel: 'website',
            priority: 'P1',
            systemAddon: 'You produce a mobile-first optimization task. Mandatory for IL market.',
            userBrief: `Produce ONE mobile-first website_change task. Mandatory components: (a) click-to-call button on every LP above-the-fold, (b) WhatsApp Business automation with lead-qualification flow (greeting → 3 qualifying questions → route to human if qualified), (c) mobile LP variant for top-converting page (single-column, sticky CTA, compressed images <100KB, no carousel). Sources: ga4.demographics (mobile %), audit.industrySignals (IL mobile penetration ~95%). ActionPlan: (1) audit current mobile CR vs desktop, (2) ship click-to-call buttons, (3) configure WhatsApp Business API + qualification flow, (4) ship mobile variant via WordPress conditional shortcode or new template, (5) monitor mobile CR delta for 30d.`,
        }),
    },

    // 8. Data warehouse / Customer Match upload
    {
        id: 'data_warehouse',
        label: 'Data warehouse / Customer Match',
        applies: (ctx) => hasPaidSearchActive(ctx, []),
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(bigquery|customer match|first[- ]party|lookalike|מאגר נתונים|customer list upload|הקלאה|customer match upload)/i])
        ),
        fillBrief: () => ({
            type: 'audience_expansion',
            channel: 'google_ads',
            priority: 'P2',
            systemAddon: 'You produce a data warehouse / Customer Match task — quarterly cadence, but required quarterly.',
            userBrief: `Produce ONE audience_expansion task: hash existing customer list (SHA256 lowercase, emails + phones) and upload to Google Ads Customer Match for lookalike audience expansion + remarketing. Sources cite chosenScenario.channel_priority_list (audience tier) + tenantState.signals.googleAds (account ID for upload). ActionPlan: (1) export customer list from CRM/sheet (last 12 months, ≥1k records ideally), (2) hash via mazhir_customer_match_prep utility (automated), (3) upload via google_ads_mutate.create_user_list (automated), (4) wait 24-48h for list size confirmation (auto check), (5) create lookalike audience at 1%/2%/5% similarity (automated), (6) deploy as observation segment first → bid up if conv rate ≥1.2× account baseline, (7) monitor 30d.`,
        }),
    },

    // 9. Decision rules / replan triggers
    {
        id: 'decision_rules',
        label: 'Decision rules / replan triggers',
        applies: () => true,
        matches: (tasks, ctx) => {
            // Either a task documents thresholds OR plan.qualityWarnings includes them
            // Pass 3 only sees tasks, not plan.qualityWarnings — so just look at tasks.
            return tasks.some(t =>
                taskMatchesKeywords(t, [/(replan|escalation|kill threshold|decision rule|emergency|incident response|root.?cause|trigger.*replan|חוקי החלטה|טריגר|אסקלציה|כללי החלטה)/i])
            )
        },
        fillBrief: () => ({
            type: 'other',
            channel: 'cross',
            priority: 'P2',
            systemAddon: 'You produce a decision-rules framework task. Document explicit thresholds for replan triggers so the founder/agent can react predictably.',
            userBrief: `Produce ONE task documenting the decision-rules framework. Hebrew title. The task content goes into actionPlan as explicit rules: (1) "CPA >40% above 90-day baseline for 14 consecutive days → emergency replan spawn", (2) "ranking drop >5 positions on any tracked priority keyword → incident response within 48h", (3) "traffic drop >20% WoW → root-cause investigation task auto-spawned", (4) "active campaign CR drops below 50% of account baseline for 7d → pause + investigate", (5) "ad spend exceeds budget cap by >10% mid-month → throttle bid strategies". Sources cite clientBaseline (CPA/CR baselines) + chosenScenario.kpis_90_day. The final step: schedule monthly review of these thresholds (re-baseline as plan iterates).`,
        }),
    },

    // 10. Email lead nurture sequence (long-research-cycle personas)
    {
        id: 'email_nurture',
        label: 'Email lead nurture sequence',
        applies: (ctx) => hasLongResearchCycle(ctx),
        matches: (tasks) => tasks.some(t =>
            t.channel === 'email' &&
            taskMatchesKeywords(t, [/(lead.?nurture|email sequence|lead.?magnet|רצף.*מייל|טפטוף|drip)/i])
        ),
        fillBrief: (ctx) => ({
            type: 'content_creation',
            channel: 'email',
            priority: 'P1',
            systemAddon: 'You produce an email lead-nurture sequence task for the primary long-research-cycle persona.',
            userBrief: `Produce ONE email lead-nurture task for ${ctx.businessName}'s primary persona. Sources cite audiencePersonas (primary persona name + jobs-to-be-done + research-cycle length) + brandBookFull.voice. ActionPlan: (1) design lead magnet (Hebrew: checklist / calculator / guide / template aligned with persona JTBD), (2) write 3-5 email sequence in Hebrew (Day 0 deliver magnet, Day 3 educate problem, Day 7 case study, Day 10 offer, Day 14 last call), (3) configure send via email tool (Mailchimp / Klaviyo / Sendgrid), (4) lead-magnet LP creation with form, (5) qualify trigger (≥3 emails opened → mark sales-ready), (6) monitor conversion 30d → iterate weakest-performing email.`,
        }),
    },

    // 11. Link audit pre-check (P0 if no link_audit data)
    {
        id: 'link_audit_precheck',
        label: 'Link audit pre-check',
        applies: (ctx) => !linkAuditData(ctx).hasData,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(backlink audit|link audit|ahrefs export|gsc links|referring domains pull|בדיקת בקלינקים|ביקורת קישורים)/i])
        ),
        fillBrief: () => ({
            type: 'measurement_gap',
            channel: 'seo',
            priority: 'P0',
            systemAddon: 'You produce a P0 backlink audit pre-check task. Required because linkAudit data is missing — invented link targets are top-agency-unacceptable.',
            userBrief: `Produce ONE P0 measurement_gap task: pull existing referring domains before recommending any specific external directories. ActionPlan: (1) export GSC Links Report via Search Console (automated:false ~10min), (2) supplement with Ahrefs / DataForSEO Backlinks export if available (automated via dfs.backlinks ~5min), (3) catalogue by DR + anchor type, (4) feed back into research_data.results.link_audit, (5) trigger re-run of link-strategy tasks once data is in place. Sources: chosenScenario.cost_timeline (link budget calibrated but not yet target-aware), audit.recommendedActions (link-strategy items pending audit data).`,
        }),
    },

    // 12. Anchor diversification (if exact_match_pct ≥ 50)
    {
        id: 'anchor_diversification',
        label: 'Anchor diversification (over-optimization risk)',
        applies: (ctx) => {
            const la = linkAuditData(ctx)
            return la.hasData && la.exactMatchPct >= 50
        },
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(anchor|עוגן|diversif|פיזור|branded|naked.?url|brand mention|אזכור מותג|over.?optim)/i])
        ),
        fillBrief: (ctx) => {
            const la = linkAuditData(ctx)
            return {
                type: 'cross_channel_amplification',
                channel: 'seo',
                priority: 'P1',
                systemAddon: 'You produce an anchor diversification task — exact-match anchors over 50% trigger Penguin / spam-pattern risk.',
                userBrief: `Produce ONE task to diversify anchor profile. Current exact-match anchor share: ${la.exactMatchPct.toFixed(1)}% — over the 50% red line. Sources cite linkAudit.anchor_distribution with the actual percentage. ActionPlan: (1) acquire 3-5 branded/naked-URL anchor backlinks (digital PR mentions / brand interviews / podcast appearances — NO exact-match), (2) audit existing exact-match anchors for ones acquired via paid placements → request anchor change to branded, (3) shift internal-linking strategy to use branded anchor on next 20 new internal links, (4) update content briefs to reference brand by name in citations, (5) monitor anchor delta over 60d (target: exact-match share drops below 35%).`,
            }
        },
    },

    // 13. linkGap outreach (per linkGap top prospects)
    {
        id: 'linkgap_outreach',
        label: 'linkGap outreach',
        applies: (ctx) => linkAuditData(ctx).linkGapCount > 0,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(linkgap|link.?gap|competitor.?only.*refer|outreach.*linkgap|פניה.*ממליצים)/i])
        ),
        fillBrief: (ctx) => {
            const la = linkAuditData(ctx)
            // K22-fix2: serialize real records[] so Opus sees concrete domains
            // + outreach_angle + priority from the prefetch, instead of citing
            // a non-existent linkAudit.linkGap[] field. Falls back to legacy
            // shape only if no records exist.
            const records = Array.isArray((ctx.linkAudit as any)?.records)
                ? ((ctx.linkAudit as any).records as any[]).filter(r => r?.type === 'link_gap_outreach').slice(0, 5)
                : []
            const recordsBlock = records.length > 0
                ? `\n\nReal linkGap candidates from link_audit.records (top ${records.length}, already analyzed):\n${records.map((r, i) => `  ${i + 1}. ${r.domain || '?'} — priority=${r.priority || 'medium'}, current_rank=${r.current_rank ?? '?'}, outreach_angle="${(r.outreach_angle || '').slice(0, 200)}", est_effort=${r.estimated_effort_hours || '?'}h`).join('\n')}`
                : `\n\n(records[] empty — fall back to legacy linkAudit.linkGap[] if present)`
            return {
                type: 'cross_channel_amplification',
                channel: 'seo',
                priority: 'P1',
                systemAddon: 'You produce a linkGap outreach task — domains that link to competitors but not us are high-conversion targets.',
                userBrief: `Produce ONE outreach task targeting the top-${records.length || 5} linkGap domains (${la.linkGapCount} total prospects identified by DFS prefetch). Sources MUST cite link_audit.records[i] with concrete domain + DFS-derived outreach_angle. ActionPlan: (1) review the pre-computed outreach_angle per domain (DON'T re-research what was already analyzed), (2) find decision-maker contact (LinkedIn / Apollo / Hunter — automated:false ~30min total), (3) craft personalized Hebrew outreach email per domain using the outreach_angle as the hook, (4) send ${records.length || 5} emails, (5) follow-up cadence (Day 3 / Day 7 / Day 14), (6) target: 1-2 placements within 30d, monitor.${recordsBlock}`,
            }
        },
    },

    // 14. lostLinks recovery
    {
        id: 'lostlinks_recovery',
        label: 'lostLinks recovery',
        applies: (ctx) => linkAuditData(ctx).lostLinksCount > 0,
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(lostlinks|lost.?links|broken.?link|404.*backlink|השבת.*קישור|שחזור.*קישור|recovery)/i])
        ),
        fillBrief: (ctx) => {
            const la = linkAuditData(ctx)
            // K22-fix2: same as linkgap_outreach — pass real records[] of
            // type='lost_link_recovery' with domain, lost_date, outreach_angle.
            const records = Array.isArray((ctx.linkAudit as any)?.records)
                ? ((ctx.linkAudit as any).records as any[]).filter(r => r?.type === 'lost_link_recovery').slice(0, 5)
                : []
            const recordsBlock = records.length > 0
                ? `\n\nReal lost-link recovery candidates from link_audit.records (top ${records.length}):\n${records.map((r, i) => `  ${i + 1}. ${r.domain || '?'} — lost ${r._metric_value || '?'}, priority=${r.priority || 'medium'}, outreach_angle="${(r.outreach_angle || '').slice(0, 200)}", est_effort=${r.estimated_effort_hours || '?'}h`).join('\n')}`
                : `\n\n(records[] empty — fall back to legacy linkAudit.lostLinks[] if present)`
            return {
                type: 'website_change',
                channel: 'seo',
                priority: 'P1',
                systemAddon: 'You produce a lostLinks recovery task — domains that USED to link to us and stopped are easier to win back than new links.',
                userBrief: `Produce ONE lostLinks recovery task. ${la.lostLinksCount} lost referring domains identified. Sources MUST cite link_audit.records[i] with domain + lost date + DFS-derived outreach_angle. ActionPlan: (1) review the pre-computed outreach_angle per domain (classification already done — broken URL vs replaced vs removed), (2) for broken-URL cases: 301-redirect or restore page (automated via WordPress), (3) for replaced-link cases: outreach using the outreach_angle (Hebrew email, mention the historical relationship), (4) target top-${records.length || 5}, (5) monitor restore rate over 30d, (6) document recurring loss patterns for prevention playbook.${recordsBlock}`,
            }
        },
    },

    // 15. Linkable asset creation (if referring_domains_total < 50 AND scenario=smart)
    {
        id: 'linkable_asset',
        label: 'Linkable asset creation',
        applies: (ctx) => {
            const la = linkAuditData(ctx)
            return la.hasData && la.referringDomains < 50 && ctx.chosenScenarioKey === 'smart'
        },
        matches: (tasks) => tasks.some(t =>
            taskMatchesKeywords(t, [/(linkable asset|calculator|מחשבון|guide.*download|template|tool|kit|מדריך.*להורדה|כלי חינמי)/i])
        ),
        fillBrief: (ctx) => ({
            type: 'content_creation',
            channel: 'seo',
            priority: 'P1',
            systemAddon: 'You produce a linkable-asset creation task — Smart-scenario sites with <50 referring domains need passive link magnets that earn citations organically.',
            userBrief: `Produce ONE linkable-asset task for ${ctx.businessName}. Choose ONE asset type that fits the business: (a) interactive calculator (price estimator / cost-of-ownership / savings vs alternative), (b) downloadable guide / checklist / template, (c) free tool / kit, (d) data study / industry report. Sources cite audiencePersonas (primary persona JTBD) + brandBookFull.usps + competitorLandscape (what competitors HAVE — pick a category they DON'T cover). ActionPlan: (1) define asset scope + data sources, (2) design wireframe / outline, (3) build (WordPress + simple JS calc OR static PDF), (4) launch with dedicated LP + schema (HowTo / Article + FAQPage), (5) seed in 5-10 relevant Israeli communities/forums (Hebrew, value-first not promotion), (6) outreach to industry sites that publish "best of" round-ups, (7) monitor link acquisition 60d (target: 5-10 referring domains from this asset alone).`,
        }),
    },
]

// ─── Fill generation (per missing rule) ───────────────────────────────────
const FILL_SYSTEM_BASE = `You are the senior strategic marketing director for ClawFlow. This is PASS 3 of 3 — your job is to fill a SPECIFIC senior-bar coverage gap in an already-assembled monthly plan. You produce ONE task (or rarely, an array of tasks if instructed) that satisfies the rule below.

Hard policy:
  · Human-in-the-loop — every task is approval-gated. The user decides.
  · Read-only verifications NEVER become user tasks — they're auto pre-check steps.
  · Atomic — 1 task = 1 atomic action.
  · Hebrew for user-facing strings, 2nd person plural (אתם/לכם/תוכלו) or impersonal infinitive.
  · Link budgets — chosenScenario VERBATIM. Never invent.

Source citation MANDATORY — ≥3 sources, real numbers/quotes, mix types. ActionPlan 5-8 steps,
last step = monitoring with metric + horizon + kill threshold. Hebrew creative copy embedded
for creative-bearing channels. JSON STRICTNESS: DOUBLE-quote delimiters; SINGLE-quote 'word'
for emphasis inside strings; no embedded JSON arrays inside string values; no literal newlines
in strings (\\n only); no trailing commas; no markdown fences.

Hebrew jargon expansions on first use: CPA → "עלות לליד (CPA)", RSA → "מודעת חיפוש מותאמת (RSA)",
GTM → "מנהל התגיות של גוגל (GTM)", schema → "סכמה / תיוג מובנה", Smart Bidding → "הצעות חכמות".

Output STRICT JSON — schema in user message.`

interface FillResult {
    task?: MonthlyTask
    tasks?: MonthlyTask[]
}

function buildFillUserPrompt(ctx: PromptCtx, rule: RuleDefinition): string {
    const brief = rule.fillBrief(ctx)
    const ctxBlock = `═══ CLIENT ═══
Business: ${ctx.businessName}
Website: ${ctx.websiteUrl}
Description: ${(ctx.businessDesc || '').slice(0, 500)}

═══ CHOSEN SCENARIO ═══
${ctx.chosenScenarioKey || '(none)'}
${(() => {
    try {
        const s = JSON.stringify(ctx.chosenScenarioFull, null, 2)
        return s.length <= 5000 ? s : s.slice(0, 5000) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ BRAND BOOK (voice / USPs / banned phrases) ═══
${(() => {
    try {
        const s = JSON.stringify(ctx.brandBookFull, null, 2)
        return s.length <= 3500 ? s : s.slice(0, 3500) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ AUDIT (recommendedActions + blockers) ═══
${(() => {
    try {
        const s = JSON.stringify(ctx.audit, null, 2)
        return s.length <= 5000 ? s : s.slice(0, 5000) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ TENANT STATE (Google Ads / GTM / GA4 signals) ═══
classification=${ctx.tenantState?.classification}
${(() => {
    try {
        const s = JSON.stringify(ctx.tenantState?.signals || {}, null, 2)
        return s.length <= 3000 ? s : s.slice(0, 3000) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ AUDIENCE PERSONAS ═══
${(() => {
    try {
        const s = JSON.stringify(ctx.audiencePersonas, null, 2)
        return s.length <= 3500 ? s : s.slice(0, 3500) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ LINK AUDIT (anchor / linkGap / lostLinks) ═══
${(() => {
    try {
        const s = JSON.stringify(ctx.linkAudit, null, 2)
        return s.length <= 4500 ? s : s.slice(0, 4500) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}

═══ COMPETITOR LANDSCAPE ═══
${(() => {
    try {
        const s = JSON.stringify(ctx.competitorLandscape, null, 2)
        return s.length <= 3500 ? s : s.slice(0, 3500) + '\n… [truncated]'
    } catch { return '(unserializable)' }
})()}`

    const schemaSingleOrArray = brief.systemAddon.includes('JSON array')
        ? `{
  "tasks": [
    { ...MonthlyTask schema...  ≥3 sources, 5-8 actionPlan steps },
    { ...MonthlyTask schema... },
    { ...MonthlyTask schema... }
  ]
}`
        : `{
  "task": { ...MonthlyTask schema... ≥3 sources, 5-8 actionPlan steps }
}`

    return `${ctxBlock}

═══ RULE TO FILL ═══

Rule: ${rule.label}
Target type: ${brief.type}
Target channel: ${brief.channel}
Target priority: ${brief.priority}

${brief.userBrief}

═══ MonthlyTask schema (return EXACTLY) ═══

{
  "id": "<tsk_xxxxxxxxxx — 10-char nanoid; server will assign if you omit>",
  "type": "${brief.type}",
  "title": "<Hebrew ≤80 chars>",
  "summary": "<Hebrew 1-2 sentences ≤200 chars>",
  "channel": "${brief.channel}",
  "priority": "${brief.priority}",
  "estimatedEffort": "<15_min|30_min|1_hour|2_3_hours|1_day|2_3_days|1_week>",
  "expectedImpact": {
    "metric": "<conversions|cpa_reduction_pct|spend_savings_ils|ctr_pct|ranking_position|organic_traffic_pct|leads_per_month|roas_pct|qs_points|other>",
    "value": <number>,
    "horizon": "<7d|14d|30d|60d|90d>",
    "confidence": "<high|medium|low>",
    "rationale": "<Hebrew ≤120 chars anchored on ONE data point>"
  },
  "sources": [
    { "type": "<audit.recommendedActions.X | gsc.queries | dfs.keywords | ga4.event | strategy.persona | contentPlan.gap | sqr.waste | aucIns.opportunity | transparency.competitor | paidHypothesis | other>", "ref": "<concrete pointer>", "excerpt": "<Hebrew real-number quote ≤100 chars>" }
  ],
  "dependsOn": ["<other task IDs or empty>"],
  "actionPlan": [
    { "step": "<Hebrew ≤120 chars>", "automated": <true|false>, "estimatedMinutes": <N> }
  ],
  "scheduledFor": "<YYYY-MM-DD within next 30d>",
  "weekOfMonth": <1|2|3|4>,
  "status": "proposed",
  "proposedAt": "<ISO timestamp now>"
}

Output STRICT JSON in this shape:

${schemaSingleOrArray}

Return ONLY the JSON. No markdown fences. No preamble.`
}

async function generateFill(
    ctx: PromptCtx,
    rule: RuleDefinition,
    apiKey: string,
    model: string,
): Promise<MonthlyTask[]> {
    const brief = rule.fillBrief(ctx)
    const userPrompt = buildFillUserPrompt(ctx, rule)
    const system = withHebrewStyleGuide(FILL_SYSTEM_BASE + '\n\n' + brief.systemAddon)
    console.log(`[monthlyPlanSeniorBarCheck] fill rule=${rule.id} starting (prompt=${system.length + userPrompt.length} chars)`)
    try {
        const raw = await callOpusStream({
            label: `monthlyPlanSeniorBarCheck:${rule.id}`,
            apiKey, model, system, user: userPrompt,
            maxTokens: 6000,
            timeoutMs: 600000, // 10 min — single task should complete in 1-3 min
        })
        const parsed = extractLlmJson<FillResult>(raw, `monthlyPlanSeniorBarCheck:${rule.id}`)
        const tasks: MonthlyTask[] = []
        if (Array.isArray(parsed.tasks)) {
            for (const t of parsed.tasks) {
                if (t && typeof t === 'object') tasks.push(normalizeFillTask(t, rule))
            }
        } else if (parsed.task) {
            tasks.push(normalizeFillTask(parsed.task, rule))
        }
        if (tasks.length === 0) {
            console.warn(`[monthlyPlanSeniorBarCheck] fill rule=${rule.id} returned no tasks (raw len=${raw.length})`)
        } else {
            console.log(`[monthlyPlanSeniorBarCheck] fill rule=${rule.id} produced ${tasks.length} task(s)`)
        }
        return tasks
    } catch (err) {
        console.error(`[monthlyPlanSeniorBarCheck] fill rule=${rule.id} FAILED: ${(err as Error).message}`)
        return []
    }
}

function normalizeFillTask(t: any, rule: RuleDefinition): MonthlyTask {
    return {
        id: typeof t.id === 'string' && t.id.startsWith('tsk_') ? t.id : ('tsk_' + randomBytes(5).toString('hex')),
        type: t.type || rule.fillBrief({} as PromptCtx).type,
        title: String(t.title || rule.label).slice(0, 200),
        summary: String(t.summary || '').slice(0, 600),
        channel: t.channel || 'cross',
        priority: ['P0', 'P1', 'P2'].includes(t.priority) ? t.priority : 'P1',
        estimatedEffort: t.estimatedEffort || '2_3_hours',
        expectedImpact: t.expectedImpact || {
            metric: 'other', value: 1, horizon: '30d', confidence: 'medium',
            rationale: `כיסוי כלל senior-bar: ${rule.label}`,
        },
        sources: Array.isArray(t.sources) && t.sources.length > 0
            ? t.sources
            : [{ type: 'other', ref: `senior_bar_fill:${rule.id}`, excerpt: `כיסוי כלל ${rule.label}` }],
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        actionPlan: Array.isArray(t.actionPlan) ? t.actionPlan : [],
        status: 'proposed',
        proposedAt: new Date().toISOString(),
        scheduledFor: t.scheduledFor,
        weekOfMonth: t.weekOfMonth,
        childTaskIds: [],
    }
}

// ─── Concurrency-limited fill runner ──────────────────────────────────────
async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    handler: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    async function worker() {
        while (true) {
            const idx = cursor++
            if (idx >= items.length) return
            results[idx] = await handler(items[idx])
        }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
    await Promise.all(workers)
    return results
}

// ─── Public entry ─────────────────────────────────────────────────────────
export async function ensureCoverage(
    ctx: PromptCtx,
    tasks: MonthlyTask[],
    apiKey: string,
    model = 'claude-opus-4-7',
): Promise<{ tasks: MonthlyTask[]; coverage: Array<{ rule: string; status: 'satisfied' | 'filled' | 'skipped' | 'fill_failed' }> }> {
    const coverage: Array<{ rule: string; status: 'satisfied' | 'filled' | 'skipped' | 'fill_failed' }> = []
    const missingRules: RuleDefinition[] = []

    for (const rule of RULES) {
        if (!rule.applies(ctx)) {
            coverage.push({ rule: rule.id, status: 'skipped' })
            continue
        }
        if (rule.matches(tasks, ctx)) {
            coverage.push({ rule: rule.id, status: 'satisfied' })
            continue
        }
        missingRules.push(rule)
    }

    if (missingRules.length === 0) {
        console.log(`[monthlyPlanSeniorBarCheck] Pass 3 done: all applicable rules satisfied (${coverage.filter(c => c.status === 'satisfied').length} satisfied, ${coverage.filter(c => c.status === 'skipped').length} skipped as not applicable)`)
        return { tasks, coverage }
    }

    console.log(`[monthlyPlanSeniorBarCheck] Pass 3 starting fills: ${missingRules.length} rules missing (${missingRules.map(r => r.id).join(', ')})`)

    const fillResults = await runWithConcurrency(missingRules, 5, (rule) => generateFill(ctx, rule, apiKey, model))

    const additionalTasks: MonthlyTask[] = []
    for (let i = 0; i < missingRules.length; i++) {
        const rule = missingRules[i]
        const fills = fillResults[i] || []
        if (fills.length === 0) {
            coverage.push({ rule: rule.id, status: 'fill_failed' })
        } else {
            coverage.push({ rule: rule.id, status: 'filled' })
            additionalTasks.push(...fills)
        }
    }

    console.log(`[monthlyPlanSeniorBarCheck] Pass 3 done: ${additionalTasks.length} fill tasks added; coverage breakdown: ${JSON.stringify(coverage.reduce((acc: Record<string, number>, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc }, {}))}`)

    return { tasks: [...tasks, ...additionalTasks], coverage }
}

export type { RuleDefinition }