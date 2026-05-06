/**
 * Devil's-advocate second pass.
 *
 * After Mazhir's primary audit/media-plan output, run a second LLM pass
 * (Sonnet — cheaper + faster) tasked with "find 5+ reasons this plan
 * could fail or this audit could be wrong." Output is appended to the
 * primary as `qualityWarnings`.
 *
 * Goals:
 *   - catch silent assumptions ("you assumed deal value but it's wrong")
 *   - catch missing-source impacts ("this CPA depends on data we didn't pull")
 *   - catch math inconsistencies (tCPA × expected ≠ budget)
 *   - catch budget reality checks (recommended > paidProfile.monthlyBudget)
 *
 * Output format: array of plain-Hebrew strings, each <= 200 chars,
 * grouped by severity in the calling renderer.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

interface DevilsAdvocateInput {
    apiKey: string
    audit?: any
    mediaPlan?: any
    paidProfile: any
    sourceCoverage: any
}

export async function runDevilsAdvocate(input: DevilsAdvocateInput): Promise<string[]> {
    const { apiKey, audit, mediaPlan, paidProfile, sourceCoverage } = input

    const missingSources = Object.entries(sourceCoverage || {})
        .filter(([_, v]: [string, any]) => v.status === 'missing' || v.status === 'failed')
        .map(([k, v]: [string, any]) => `${k}: ${v.reason || v.status}`)
        .join('; ')

    const targetSummary = mediaPlan
        ? {
            campaignCount: (mediaPlan.campaigns || []).length,
            totalDailyBudget: (mediaPlan.campaigns || []).reduce((s: number, c: any) => s + (c.dailyBudgetIls || 0), 0),
            tCpaSuggested: mediaPlan.transitionToTcpa?.suggestedCpaIls,
            methodology: mediaPlan.methodology?.framework,
        }
        : audit
            ? {
                methodology: audit.methodology,
                expectedConv: audit.estimatedMonthlyConversions?.expected,
                blockerCount: (audit.blockers || []).length,
                trackingScore: audit.trackingHealth?.score,
            }
            : {}

    const system = `You are a devil's-advocate PPC auditor. Your ONLY job is to find weaknesses in another senior PPC's plan or audit.

Be specific, not generic. Say "this CPA assumes Y conversion rate but the data shows Z" — not "verify your assumptions". Be brutal but fair.

Output STRICT JSON: { "warnings": ["<hebrew warning 1>", "<hebrew warning 2>", ...] }
Each warning <= 200 Hebrew characters. 4-8 warnings ideal.`

    const user = `Here is the primary audit/plan output. Find weaknesses.

═══ PAID PROFILE ═══
${JSON.stringify(paidProfile, null, 2).slice(0, 2000)}

═══ SUMMARY OF AUDIT/PLAN ═══
${JSON.stringify(targetSummary, null, 2)}

${audit ? `═══ FULL AUDIT (truncated) ═══\n${JSON.stringify(audit, null, 2).slice(0, 4000)}` : ''}

${mediaPlan ? `═══ MEDIA PLAN — first 2 campaigns ═══\n${JSON.stringify((mediaPlan.campaigns || []).slice(0, 2), null, 2).slice(0, 4000)}` : ''}

═══ MISSING DATA SOURCES ═══
${missingSources || '(all sources available)'}

═══ YOUR TASK ═══

Find 4-8 SPECIFIC weaknesses. Examples of what to look for:

1. **Math inconsistencies**: Does (tCPA × expected_conversions) match monthly_budget within 25%? If not, the math is broken.
2. **Hidden assumptions**: Does the plan assume deal value, conversion rate, or CPC the data doesn't actually support?
3. **Missing source dependencies**: Are recommendations being made that REQUIRE data we don't have?
4. **Budget realism**: Does the plan recommend budgets the client said they can't afford?
5. **Methodology mismatch**: Is the chosen methodology appropriate for the budget × goal combo? (e.g. PMax for leadgen with no offline conv = junk-lead farm)
6. **Headline/copy weakness**: Is the offer (₪29.9) actually featured? Are USPs present in headlines?
7. **Keyword waste risk**: Are broad-match keywords used without negative keyword protection?
8. **Quality Score risk**: Are landing pages flagged as slow but the plan ignores LP optimization?
9. **Overconfident projections**: Is "expected" conversions much higher than seasonal/historical data justifies?
10. **Tracking blind-spots**: Are conversions counted that GA4 events don't actually fire for?

Return ONLY: { "warnings": [...] } — no markdown, no commentary.`

    try {
        const res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 2000,
                system,
                messages: [{ role: 'user', content: user }],
            }),
            signal: AbortSignal.timeout(90_000),
        })
        if (!res.ok) {
            console.warn(`[devilsAdvocate] HTTP ${res.status}`)
            return []
        }
        const j = await res.json() as any
        const text = j?.content?.[0]?.text || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) return []
        const parsed = JSON.parse(m[0]) as { warnings?: string[] }
        return Array.isArray(parsed.warnings) ? parsed.warnings.filter(w => typeof w === 'string') : []
    } catch (err) {
        console.warn('[devilsAdvocate] failed:', (err as Error).message)
        return []
    }
}