/**
 * Self-critique 2nd-pass gate — Phase 3.5e.
 *
 * After the main stage Anthropic call produces content, this module runs
 * a separate critic call that audits the output against the 10 quality
 * gate checks (methodology.QUALITY_GATE_CHECKS). When HARD failures are
 * detected (math errors, script mismatch, intent integrity, unsupported
 * claims), the critic is asked to produce a revised version in the same
 * response — saving us a 3rd round-trip in the common case.
 *
 * Cost: one extra Anthropic call per stage (~+40% on the main stage).
 * Per playbook decision: quality > cost. Same model as the main stage.
 *
 * Failure modes:
 *   - Critic call fails (rate limit, network) → log warning, ship
 *     original content with `quality_gate.skipped: true` flag.
 *   - Critic returns malformed JSON → log warning, ship original.
 *   - Hard failure detected but no revised_content → ship original
 *     with `quality_gate.hard_failures` populated, UI surfaces a banner.
 *   - Revised content is suspiciously short (<50% of original) → reject
 *     the revision, ship original with warning.
 */

import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'
import { HARD_FAILURE_CHECKS, QUALITY_GATE_CHECKS, type QualityCheck } from './methodology'
import type { StageId } from './types'

export interface CheckResult {
    pass: boolean
    /** 1-line reason if failed; absent on pass. */
    reason?: string
    /** 'hard' = blocking; 'warning' = ship-with-flag */
    severity: 'hard' | 'warning'
}

export interface QualityGateOutcome {
    /** Overall pass: no hard failures (warnings allowed). */
    pass: boolean
    /** Per-check audit — every check from QUALITY_GATE_CHECKS produces an entry. */
    checks: Partial<Record<QualityCheck, CheckResult>>
    /** Human-readable hard failures (for fail() msg). */
    hardFailures: string[]
    /** Warnings — content shipped but UI shows a banner. */
    warnings: string[]
    /**
     * If critic produced a revised version that fixes hard failures, caller
     * uses this in place of the original content. Undefined = use original.
     */
    revisedContent?: string
    /** Why a hard-failure revision was NOT applied: http_error | too_short |
     *  truncated | identical | exception. Absent when revision landed or no
     *  hard failures. Observability for the "revised:false" cases. */
    revisionSkipReason?: string
    /** Diagnostic — true if critic call itself failed (rate limit, malformed). */
    skipped: boolean
    /** USD cost of the critic call. Logging only — same balance as main call. */
    costUsd?: number
}

interface RunInput {
    content: string
    stageId: StageId
    /** The original prompt from the main call — gives critic context on what was asked. */
    originalPrompt: string
    /** Same model the main call used. */
    model: string
    /** For Anthropic API key lookup. */
    instanceId: string
    /** Apparent business name — for context echo. */
    businessName?: string
}

/**
 * Run the self-critique pass. Always returns — never throws.
 */
export async function runSelfCritique(input: RunInput): Promise<QualityGateOutcome> {
    const { content, stageId, originalPrompt, model, instanceId, businessName } = input

    if (!content || content.length < 200) {
        return {
            pass: false,
            checks: {},
            hardFailures: ['Content too short to audit'],
            warnings: [],
            skipped: true,
        }
    }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) {
        console.warn(`[selfCritique/${stageId}] no API key — skipping critique pass`)
        return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
    }

    const anthropicModel = model.replace(/^anthropic\//, '')
    const criticPrompt = buildCriticPrompt({ content, stageId, originalPrompt, businessName })

    let raw = ''
    try {
        // Phase 3.20 — switched to streaming. Critic call can take 5+ minutes
        // when reviewing a 32K-token main output against 30K of original prompt
        // context; non-streaming requests get dropped server-side at ~5min
        // regardless of client timeout. Streaming keeps the TCP connection
        // alive via chunked transfer.
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: anthropicModel,
                // Phase 3.21c — bumped 16K → 32K. With max_tokens=32K on the main
                // call the content under review can be ~65K chars; producing a
                // revised_content that fixes hard failures requires re-emitting
                // most of that content, which doesn't fit in 16K. 32K matches
                // the main path and lets revisions actually land.
                max_tokens: 32000,
                stream: true,
                messages: [{ role: 'user', content: criticPrompt }],
            }),
            signal: AbortSignal.timeout(720_000),
        })
        if (!res.ok) {
            console.warn(`[selfCritique/${stageId}] HTTP ${res.status} — skipping`)
            return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
        }
        // Inline SSE stream consumer — kept here (not extracted) to avoid
        // a circular import with stageExecutor.ts. Same shape as
        // consumeAnthropicStream over there.
        if (!res.body) {
            return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        try {
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buf.indexOf('\n\n')) >= 0) {
                    const event = buf.substring(0, nl)
                    buf = buf.substring(nl + 2)
                    for (const line of event.split('\n')) {
                        if (!line.startsWith('data: ')) continue
                        const data = line.substring(6).trim()
                        if (!data || data === '[DONE]') continue
                        try {
                            const j = JSON.parse(data) as {
                                type?: string
                                delta?: { type?: string; text?: string }
                            }
                            if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
                                raw += j.delta.text
                            }
                        } catch { /* skip non-JSON SSE chatter */ }
                    }
                }
            }
        } finally {
            try { reader.releaseLock() } catch { /* noop */ }
        }
    } catch (err) {
        console.warn(`[selfCritique/${stageId}] network error — skipping:`, (err as Error).message)
        return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
    }

    const outcome = parseCriticResponse(raw, content, stageId)

    // Phase QA round-10 — if hard failures were found, run a SEPARATE
    // revision pass that returns RAW corrected content (not JSON-wrapped).
    // This is what makes revisions actually land: the full 32K-token output
    // budget goes to the content, so it no longer truncates mid-string the
    // way the old in-JSON revised_content did.
    if (!outcome.pass && outcome.hardFailures.length > 0) {
        try {
            const rev = await runRevision({
                content,
                hardFailures: outcome.hardFailures,
                stageId,
                anthropicModel,
                apiKey,
            })
            if (rev.revised) outcome.revisedContent = rev.revised
            else outcome.revisionSkipReason = rev.reason
        } catch (err) {
            outcome.revisionSkipReason = 'exception'
            console.warn(`[selfCritique/${stageId}] revision pass failed — shipping original with hard-failure banner:`, (err as Error).message)
        }
    }

    return outcome
}

/**
 * Phase QA round-10 — separate raw-text revision call. Given the original
 * content + the hard failures the critic found, produce a corrected full
 * version. Output is RAW markdown (no JSON envelope) so the model's entire
 * output budget goes to content — the fix that the old in-JSON
 * revised_content kept truncating on.
 *
 * Guards: reject if the revision is <50% of the original (truncation) or
 * identical. Returns null in those cases → caller keeps original + banner.
 */
async function runRevision(args: {
    content: string
    hardFailures: string[]
    stageId: StageId
    anthropicModel: string
    apiKey: string
}): Promise<{ revised: string | null; reason: string }> {
    const { content, hardFailures, stageId, anthropicModel, apiKey } = args

    // Model-aware output budget so large stage outputs aren't truncated mid-fix
    // (Opus 4.8 → 128K, Sonnet/Haiku → 64K). 32K was below some stage outputs.
    const maxTokens = /opus/i.test(anthropicModel) ? 120000 : 60000

    const failuresBlock = hardFailures.map((f, i) => `${i + 1}. ${f}`).join('\n')
    const basePrompt = `אתם עורך בכיר. הפלט שלמטה עבר בקרת איכות ונמצאו בו הכשלים הקשים הבאים שחובה לתקן:

${failuresBlock}

תקנו **רק** את הכשלים האלה. אם הכשל הוא חישובי (math/ניקוד/עדיפות) — **חשבו מחדש את כל המספרים הרלוונטיים מהרכיבים** ודאגו שכל המופעים של אותו ערך (בטבלאות, ב-records, ובטקסט) **זהים ועקביים**. שמרו על כל שאר התוכן זהה לחלוטין — אותו מבנה, אותם sections, אותם code-blocks של JSON, אותה שפה (עברית). אל תקצרו ואל תשמיטו תוכן.

## הפלט לתיקון

${content}

---

החזירו את **כל התוכן המתוקן** כפי שהוא (markdown + code-blocks), בלי שום הקדמה, בלי הסבר, בלי JSON עוטף. רק התוכן עצמו.`

    const escalatedPrompt = `הפלט הקודם שהחזרתם היה **זהה למקור** — לא תיקנתם כלום. זו טעות.
חובה לתקן את הכשלים הקשים הבאים, בעיקר ע"י **חישוב מחדש מפורש** של כל המספרים שאינם עקביים, כך שאותו ערך יופיע זהה בכל מקום (טבלאות + records + טקסט):

${failuresBlock}

## הפלט לתיקון

${content}

---

החזירו את **כל התוכן המתוקן** (markdown + code-blocks), בלי הקדמה ובלי JSON עוטף.`

    async function callRevise(promptText: string): Promise<string | null> {
        let raw = ''
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: anthropicModel, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: promptText }] }),
            signal: AbortSignal.timeout(720_000),
        })
        if (!res.ok || !res.body) {
            console.warn(`[selfCritique/${stageId}] revision HTTP ${res.status} — keeping original`)
            return null
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        try {
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buf.indexOf('\n\n')) >= 0) {
                    const event = buf.substring(0, nl)
                    buf = buf.substring(nl + 2)
                    for (const line of event.split('\n')) {
                        if (!line.startsWith('data: ')) continue
                        const data = line.substring(6).trim()
                        if (!data || data === '[DONE]') continue
                        try {
                            const j = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                            if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) raw += j.delta.text
                        } catch { /* skip non-JSON SSE chatter */ }
                    }
                }
            }
        } finally {
            try { reader.releaseLock() } catch { /* noop */ }
        }
        let revised = raw.trim()
        const fence = revised.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
        if (fence) revised = fence[1].trim()
        return revised
    }

    // Validate a candidate; returns the reason it's unusable, or '' if good.
    const reject = (r: string | null): string => {
        if (r === null) return 'http_error'
        if (r.length < 200) return 'too_short'
        if (r.length < content.length * 0.5) return 'truncated'
        if (r === content.trim()) return 'identical'
        return ''
    }

    let candidate = await callRevise(basePrompt)
    let reason = reject(candidate)
    // Retry ONCE on identical — the most common "didn't engage" failure (the LLM
    // echoes the input on math/consistency fixes). The escalated prompt forces a
    // recompute. (Don't retry http/truncated — those are infra/size, not engagement.)
    if (reason === 'identical') {
        console.warn(`[selfCritique/${stageId}] revision identical — retrying with escalated prompt`)
        candidate = await callRevise(escalatedPrompt)
        reason = reject(candidate)
    }
    if (reason) {
        console.warn(`[selfCritique/${stageId}] revision unusable (${reason}) — keeping original`)
        return { revised: null, reason }
    }
    console.log(`[selfCritique/${stageId}] revision applied (${content.length}→${candidate!.length} chars)`)
    return { revised: candidate, reason: 'ok' }
}

// ────────────────────────────────────────────────────────────────────────────

function buildCriticPrompt(args: { content: string; stageId: StageId; originalPrompt: string; businessName?: string }): string {
    const { content, stageId, originalPrompt, businessName } = args

    // Phase 3.11c — earlier window (1500/800) was too aggressive: critic
    // missed the DFS data section (which lives in the prompt middle, after
    // the description but before methodology). When AI cited valid DFS
    // numbers (onpage_score=98.17, plain_text_words=2761), critic flagged
    // them as fabricated because they weren't in the truncated head/tail.
    //
    // New approach: include up to 30K chars of the original prompt. Anthropic
    // 200K context window absorbs this easily; critic now sees full DFS data
    // sections + JSON schema + methodology blocks + output rules.
    const promptTrimmed = originalPrompt.length <= 30000
        ? originalPrompt
        : originalPrompt.substring(0, 25000) + '\n\n[...truncated middle...]\n\n' + originalPrompt.substring(originalPrompt.length - 5000)

    return `אתם reviewer בכיר עם 15 שנות ניסיון ב-SEO/strategy QA. בדקו את הפלט שלמטה מול 10 בדיקות איכות. **תוצאה ב-JSON בלבד** — אסור text מחוץ ל-JSON code-block.

## משימת המקור (ל-${stageId} עבור ${businessName || 'העסק'})

${promptTrimmed}

## הפלט לבקרה

\`\`\`
${content.length <= 60000 ? content : content.substring(0, 50000) + '\n\n[...truncated middle...]\n\n' + content.substring(content.length - 10000)}
\`\`\`
${content.length > 60000 ? `\n_(הפלט קוצץ ל-60K תווים — בדקו לפי מה שיש)_` : ''}

---

## 10 בדיקות איכות

| # | בדיקה | severity | למה זה חשוב |
|---|---|---|---|
| 1 | source_spot_check | **hard** | בחרו 3-5 claims אקראיים. האם המקור (DFS evidence / upstream stage / answers) באמת אומר את מה שהפלט טוען? **חובה לבדוק מול ה-DFS data sections בprompt המקור (top 50 competitors / top 5 enriched / our_link_profile / GMB / ourGmb / people_also_search / palsRating), לא רק מול evidence array של הרשומה.** מספרים כמו onpage_score / plain_text_words / organic_count יכולים להופיע ב-on_page audit section גם אם evidence רושם רק dfs_competitors_domain. **Phase 4.0**: ourGmb.rating.value + ourGmb.rating.votes_count + ourGmb.people_also_search[].rating הם **DFS authoritative source** — אם ה-narrative מצטט אותם (לדוגמה "522 ביקורות 5/5") **זה אינו fabrication** גם אם אנשרים answers מכילים מספר שונה (DFS עדכני יותר). אם נמצאה fabrication אמיתית — חובה לעדכן \`record.confidence\` ל-working_hypothesis ב-revised_content (לא להשאיר medium). |
| 2 | contradiction_pass | warning | האם sections סותרים זה את זה? **כלל מספרים (Phase 3.21d מתוקן)**: המספרים היחידים שאסור לכפול ב-narrative הם \`opportunity.total\`, \`aeo.total\`, \`scorecard.total\` — כי השרת מחשב אותם מחדש. אבל **GSC source data** (impressions / clicks / position / CTR), **DFS source data** (volume / KD / CPC / ETV), **time/cost** (hours / ₪), **counts** (records / clusters / risks identified) **מותרים ונדרשים** ב-narrative. רק אם נמצא ערך מ-records.opportunity.total/aeo.total/scorecard.total במספרי ה-narrative = flag warning. |
| 3 | actionability_pass | warning | האם כל recommendation הופך ל-next-task ברור? |
| 4 | language_script_qa | warning | **עברית טהורה במשפטים** — Hebrew prompt → Hebrew output. הזהירו על ערבוב מילים אנגליות במשפט עברי, **חוץ מ-allowlist המורחב למטה**. ⚠ **חשוב**: לפני שאתם מסמנים warning — בדקו אם המילה ב-allowlist. אם כן → לא flag. ⚠ **שינוי 5/2026 (Phase QA round-5)**: הבדיקה הזו ירדה מ-hard ל-warning כי SEO content ב-IL מאוטומטית code-switching עם מאות מונחים מקצועיים אנגליים (audience, conversion, citation, brand, citation, comparison, programmatic, etc) וניסיון להחליף את כולם הפיק whack-a-mole בלתי-נגמר. השרת עושה scrubbing דטרמיניסטי על filler ספציפי (push, fast win, etc) — ה-warning שלך משלים את זה. **אסור לציין language_script_qa ב-hard_failures** — תמיד ל-warnings בלבד. forbid-list (hard fail רק אם הופיעו במשפט עברי): "decision" (כפעולה), "priority", "effort", "bet", "win", "threat" (כפעולה), "ranking" (כפעולה), "fast win", "pain point", "duplicate", "thin", "bridge", "video tour", "glossary section", "acquisition pathway", "hub regional/geographic", "marketing fog", "conversion happens", "push" (כפועל), "angle", "variants", "flag" (כפועל), "rebuild", "fog". **ALLOWLIST מורחב — אלו מותרים גם בתוך משפט עברי, ואסור לראות אותם כ-fail**: SEO / SERP / AEO / GEO / AIO / GMB / EEAT / JTBD / KPI / ROI / CTR / CPM / CPC / KD / FAQ / CMS / API / URL / UTM / DFS / GSC / GA4, schema markup / structured data / FAQPage / Article / Organization / LocalBusiness / Product / Service, content hub / long-tail / head terms / cluster / pillar / spoke / silo / anchor / anchor text / backlink / link-gap / link gap / spam score / striking distance / opportunity score / programmatic / canonical / canonicalize / 301 redirect / cannibalization / cannibalization risk / hreflang / sitemap / robots.txt / breadcrumb, **decision values כ-enum** (take_now / take_if_strategic / backlog — אבל לא כפעלים), confidence values (high / medium / working_hypothesis), intent tier values (info_broad / commercial_eval / transactional / וכו'), שמות מותגים / כלים / domain names / שמות חברות. **כלל זהב**: הוא נמצא ב-allowlist? לא flag. הוא מילת filler באנגלית בתוך משפט עברי שיש לה תרגום עברי טבעי? flag. דוגמה אסורה: "fast win כי position 7.6" → צ"ל: "ניצחון מהיר כי position 7.6". דוגמה מותרת: "cannibalization risk בין pillar ל-spoke" — שלוש מילות allowlist, **לא flag**. |
| 5 | math_sanity | **hard** | Opportunity score: 0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE — בדקו ש-\`opportunity._formula_verification\` נוכח ושהחישוב המילולי מתחבר ל-\`total\`. אסור משקלים שווים (1/7=0.1428). אותו הדין ל-AEO (0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV). KPI forecasts + CTR logic נבדקים גם. |
| 6 | intent_integrity | **hard** | אין mixed intents בתוך cluster? Each KW/page = single primary_intent? |
| 7 | thinness_novelty | warning | לכל proposed page יש distinct reason-to-exist? |
| 8 | stakeholder_readout_test | warning | SEO lead + content lead + founder יבינו אותו דבר? |
| 9 | out_loud_read | warning | האם זה רק מילים יפות, או אמירות קונקרטיות? |
| 10 | so_what_test | warning | האם כל major section מסתיים ב-clear decision? |

## כלל ה-reason — קריטי

\`reason\` נקרא ע"י **בעל העסק** (לא מתכנת). לכן בכל בדיקה שנכשלה:
- **משפט אחד קצר בעברית פשוטה, עד 140 תווים.**
- בלי רשימות של מילים באנגלית, בלי snake_case, בלי ציטוט מספרים ארוכים.
- מסביר *מה הבעיה במילים אנושיות*, לא *איזו בדיקה רצה*.

דוגמה גרועה (אסור): "language_script_qa: מילים אסורות: dominate, advantage, rollout, audit, native, recovery campaign…"
דוגמה טובה (נכון): "יש ערבוב של מילים באנגלית בתוך משפטים בעברית — כדאי לתרגם."

דוגמה גרועה: "contradiction_pass: scorecard totals (79.20, 73.05) contradict narrative rank ordering"
דוגמה טובה: "ציוני הסיכום לא תואמים את סדר הדירוג בטקסט."

## פורמט תשובה — JSON only (בדיקות בלבד, בלי תוכן מתוקן)

\`\`\`json
{
  "checks": {
    "source_spot_check": { "pass": true, "severity": "hard" },
    "contradiction_pass": { "pass": true, "severity": "warning" },
    "actionability_pass": { "pass": true, "severity": "warning" },
    "language_script_qa": { "pass": true, "severity": "warning" },
    "math_sanity": { "pass": true, "severity": "hard" },
    "intent_integrity": { "pass": true, "severity": "hard" },
    "thinness_novelty": { "pass": true, "severity": "warning" },
    "stakeholder_readout_test": { "pass": true, "severity": "warning" },
    "out_loud_read": { "pass": true, "severity": "warning" },
    "so_what_test": { "pass": true, "severity": "warning" }
  }
}
\`\`\`

**במקרה כשל:** \`{ "pass": false, "reason": "משפט עברי קצר אחד", "severity": "hard|warning" }\`.

**אל תפיקו תוכן מתוקן כאן** — אם יש כשל hard, התיקון נעשה בקריאה נפרדת. כאן רק ה-JSON של הבדיקות. **אסור text מחוץ ל-JSON.**`
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Short, human Hebrew label per quality check — used to build a warning/
 * failure string a business owner can read. The raw snake_case check id
 * (contradiction_pass, language_script_qa…) is never shown to users.
 */
const CHECK_LABEL_HE: Record<string, string> = {
    source_spot_check: 'אימות מקורות',
    contradiction_pass: 'סתירות בנתונים',
    actionability_pass: 'ישימות ההמלצות',
    language_script_qa: 'ניקיון עברית',
    math_sanity: 'בדיקת חישובים',
    intent_integrity: 'עקביות כוונת חיפוש',
    thinness_novelty: 'ייחודיות תוכן',
    stakeholder_readout_test: 'בהירות',
    out_loud_read: 'קונקרטיות',
    so_what_test: 'מסקנה ברורה',
}

/** Build the short user-facing line: "<label>: <reason>", reason capped. */
function formatCheckLine(checkName: string, reason?: string): string {
    const label = CHECK_LABEL_HE[checkName] || checkName
    let r = (reason || '').trim()
    if (!r) return label
    // Defensive cap — even if the critic ignores the 140-char instruction,
    // never surface a giant dump to the user.
    if (r.length > 180) r = r.slice(0, 177).trimEnd() + '…'
    return `${label}: ${r}`
}

// ────────────────────────────────────────────────────────────────────────────

function parseCriticResponse(raw: string, originalContent: string, stageId: StageId): QualityGateOutcome {
    const result: QualityGateOutcome = {
        pass: true,
        checks: {},
        hardFailures: [],
        warnings: [],
        skipped: false,
    }

    // Extract JSON block. Critic prompt asks for JSON-only but tolerate
    // surrounding markdown. Phase 3.17 — be robust to multiple fence styles
    // observed in the wild:
    //   1. ```json\n{...}\n```  (canonical, with newlines around content)
    //   2. ```json{...}```      (single line, no newlines)
    //   3. ```{...}```          (no language tag)
    //   4. raw {...} prose      (no fence at all)
    //   5. fence opens but no close (response truncated)
    let jsonText: string
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fencedMatch) {
        jsonText = fencedMatch[1].trim()
    } else {
        // No closing fence found — try stripping a stray opening fence + slice
        // from first { to last }.
        const stripped = raw.replace(/^[\s\S]*?```(?:json)?\s*/i, '').trim()
        const firstBrace = stripped.indexOf('{')
        const lastBrace = stripped.lastIndexOf('}')
        jsonText = (firstBrace >= 0 && lastBrace > firstBrace)
            ? stripped.substring(firstBrace, lastBrace + 1)
            : raw.trim()
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        try {
            // Tier 2: control-char sanitization.
            parsed = JSON.parse(sanitizeJsonControlChars(jsonText))
        } catch {
            try {
                // Tier 3: common LLM hallucination repairs (mirrors hybridParser).
                const repaired = sanitizeJsonControlChars(jsonText)
                    .replace(/""(\s*[,}\]\n])/g, '"$1')
                    .replace(/,(\s*[}\]])/g, '$1')
                parsed = JSON.parse(repaired)
            } catch {
                try {
                    // Tier 4: truncated JSON repair — handles "Unterminated string"
                    // from critic responses that hit max_tokens mid-output. Walks
                    // the JSON depth-first, closes any open string with a quote,
                    // trims back to last comma at safe depth, then closes any
                    // open brace/bracket. Recovers what the critic did emit.
                    const sanitized = sanitizeJsonControlChars(jsonText)
                        .replace(/""(\s*[,}\]\n])/g, '"$1')
                        .replace(/,(\s*[}\]])/g, '$1')
                    parsed = JSON.parse(repairTruncatedJsonInline(sanitized))
                    console.warn(`[selfCritique/${stageId}] critic JSON repaired via Tier 4 (truncated)`)
                } catch (err) {
                    console.warn(`[selfCritique/${stageId}] critic returned malformed JSON (4 tiers):`, (err as Error).message)
                    result.skipped = true
                    return result
                }
            }
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        result.skipped = true
        return result
    }
    const obj = parsed as { checks?: Record<string, CheckResult> }

    // Process checks. Iterate over the canonical list so missing keys default to "pass".
    for (const checkName of QUALITY_GATE_CHECKS) {
        const c = obj.checks?.[checkName]
        const isHard = HARD_FAILURE_CHECKS.has(checkName)
        if (!c || typeof c !== 'object') {
            result.checks[checkName] = { pass: true, severity: isHard ? 'hard' : 'warning' }
            continue
        }
        const passed = c.pass !== false
        let severity: 'hard' | 'warning' = c.severity === 'hard' ? 'hard' : (isHard ? 'hard' : 'warning')
        // language_script_qa is methodology-mandated WARNING-only (Phase QA round-5):
        // IL SEO content legitimately code-switches with hundreds of English terms,
        // and the server scrubs filler deterministically. The critic is told never
        // to mark it hard, but it occasionally does anyway — enforce it here so a
        // Hebrew-mixing nitpick can never block a stage as a hard failure.
        if (checkName === 'language_script_qa') severity = 'warning'
        result.checks[checkName] = {
            pass: passed,
            ...(c.reason ? { reason: c.reason } : {}),
            severity,
        }
        if (!passed) {
            const label = formatCheckLine(checkName, c.reason)
            if (severity === 'hard') result.hardFailures.push(label)
            else result.warnings.push(label)
        }
    }

    result.pass = result.hardFailures.length === 0

    // Revision is no longer produced inside this JSON (Phase QA round-10).
    // Wrapping the full revised content in a JSON string blew past the
    // 32K-token output cap → the response truncated mid-JSON → Tier-4 repair
    // dropped the revised_content entirely → revised=false every time the
    // fix was actually needed. Hard-failure revision now runs as a separate
    // RAW-text call in runSelfCritique(), where the whole token budget goes
    // to content instead of fighting JSON escaping.
    void originalContent
    console.log(`[selfCritique/${stageId}] checks parsed — pass=${result.pass} hardFailures=${result.hardFailures.length} warnings=${result.warnings.length}`)
    return result
}

function sanitizeJsonControlChars(src: string): string {
    let out = ''
    let inStr = false
    let esc = false
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { out += ch; esc = false; continue }
            if (ch === '\\') { out += ch; esc = true; continue }
            if (ch === '"') { out += ch; inStr = false; continue }
            const code = ch.charCodeAt(0)
            if (code === 0x0A) { out += '\\n'; continue }
            if (code === 0x0D) { out += '\\r'; continue }
            if (code === 0x09) { out += '\\t'; continue }
            if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue }
            out += ch
        } else {
            out += ch
            if (ch === '"') { inStr = true; esc = false }
        }
    }
    return out
}

/**
 * Phase QA round-3 — Tier 4 truncated JSON repair for critic responses.
 * Mirrors the same logic as hybridParser.repairTruncatedJson but inline here
 * to avoid a circular import between selfCritique and hybridParser.
 *
 * Walks the string tracking string state + brace/bracket depth. At end:
 *   1. If inside an unterminated string → close it (or trim back to last
 *      comma at depth 1 = top-level checks/summary array).
 *   2. Trim trailing dangling key/comma/whitespace.
 *   3. Close all open `{` / `[` in reverse stack order.
 *
 * Best-effort: rescues whatever check entries the critic emitted before the
 * cutoff. Better partial than zero.
 */
function repairTruncatedJsonInline(src: string): string {
    if (!src.trim().startsWith('{') && !src.trim().startsWith('[')) return src
    let depth = 0
    const stack: string[] = []
    let inStr = false
    let esc = false
    let lastSafeCommaIdx = -1   // last comma at depth 1 (inside top-level object's properties)
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inStr) {
            if (esc) { esc = false; continue }
            if (ch === '\\') { esc = true; continue }
            if (ch === '"') inStr = false
            continue
        }
        if (ch === '"') { inStr = true; continue }
        if (ch === '{' || ch === '[') {
            stack.push(ch)
            depth++
        } else if (ch === '}' || ch === ']') {
            stack.pop()
            depth--
        } else if (ch === ',' && depth === 1) {
            lastSafeCommaIdx = i
        }
    }
    if (!inStr && depth === 0) return src

    let out = src
    if (inStr) {
        // Trim back to last safe comma to drop the broken string entirely.
        if (lastSafeCommaIdx >= 0) {
            out = src.substring(0, lastSafeCommaIdx)
            // Re-walk to recompute stack
            depth = 0
            stack.length = 0
            inStr = false
            esc = false
            for (let i = 0; i < out.length; i++) {
                const ch = out[i]
                if (inStr) {
                    if (esc) { esc = false; continue }
                    if (ch === '\\') { esc = true; continue }
                    if (ch === '"') inStr = false
                    continue
                }
                if (ch === '"') { inStr = true; continue }
                if (ch === '{' || ch === '[') { stack.push(ch); depth++ }
                else if (ch === '}' || ch === ']') { stack.pop(); depth-- }
            }
        } else {
            out += '"'
        }
    }
    out = out.replace(/[\s,]*"\s*[a-zA-Z_]+\s*:\s*$/, '')
    out = out.replace(/[,\s]+$/, '')
    while (stack.length) {
        const open = stack.pop()
        out += open === '{' ? '}' : ']'
    }
    return out
}