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
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: anthropicModel,
                max_tokens: 16000,
                messages: [{ role: 'user', content: criticPrompt }],
            }),
            // Phase 3.12 — bumped 180s→300s. Phase 3.11 expanded promptTrimmed
            // to 30K chars so critic sees full DFS context; Anthropic processing
            // time grew accordingly and 180s started timing out for stage_1.
            signal: AbortSignal.timeout(300_000),
        })
        if (!res.ok) {
            console.warn(`[selfCritique/${stageId}] HTTP ${res.status} — skipping`)
            return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
        }
        const data = await res.json() as { content?: Array<{ text: string }> }
        raw = data.content?.[0]?.text || ''
    } catch (err) {
        console.warn(`[selfCritique/${stageId}] network error — skipping:`, (err as Error).message)
        return { pass: true, checks: {}, hardFailures: [], warnings: [], skipped: true }
    }

    return parseCriticResponse(raw, content, stageId)
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
| 1 | source_spot_check | **hard** | בחרו 3-5 claims אקראיים. האם המקור (DFS evidence / upstream stage / answers) באמת אומר את מה שהפלט טוען? **חובה לבדוק מול ה-DFS data sections בprompt המקור (top 50 competitors / top 5 enriched / our_link_profile / GMB), לא רק מול evidence array של הרשומה.** מספרים כמו onpage_score / plain_text_words / organic_count יכולים להופיע ב-on_page audit section גם אם evidence רושם רק dfs_competitors_domain. אם נמצאה fabrication — חובה לעדכן \`record.confidence\` ל-working_hypothesis ב-revised_content (לא להשאיר medium). |
| 2 | contradiction_pass | warning | האם sections סותרים זה את זה? |
| 3 | actionability_pass | warning | האם כל recommendation הופך ל-next-task ברור? |
| 4 | language_script_qa | **hard** | **עברית טהורה במשפטים** — Hebrew prompt → Hebrew output. אסור לערבב מילים אנגליות במשפט עברי. **forbid-list** (אם נמצאה אחת מאלו במשפט עברי = hard fail; הפיקו revised_content שמתרגם): "decision", "priority", "high", "low", "medium", "effort", "bet", "win", "threat", "ranking", "action", "best", "worst", "top", "bottom", "first", "second", "next", "approach", "method", "result", "recommendation", "summary", "conclusion", "with", "without", "and", "but", "for", "the", "this", "that", "however", "therefore", "moreover", "Why now?", "So what?", "Decision:". **allowlist** (מותר): SEO/SERP/AEO/GEO/GMB/EEAT/JTBD/KPI/ROI/CTR/CPM/CPC/KD/FAQ/CMS/API/URL/UTM, schema markup, structured data, content hub, long-tail, head terms, cluster, pillar, anchor, backlink, link-gap, spam score, striking distance, opportunity score, programmatic, canonical, take_now/take_if_strategic/backlog, high/medium/working_hypothesis (כערכי enum בלבד, לא בתוך משפט עברי), שמות מותגים/כלים/domain. דוגמה אסורה: "Decision: השקעה ב-FAQ schema markup ה-bet הוא עם ה-confidence הגבוה". דוגמה נכונה: "החלטה: השקעה ב-FAQ ובסכמת מבנה (schema markup) — ההימור עם הביטחון הגבוה ביותר". |
| 5 | math_sanity | **hard** | Opportunity score: 0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE — בדקו ש-\`opportunity._formula_verification\` נוכח ושהחישוב המילולי מתחבר ל-\`total\`. אסור משקלים שווים (1/7=0.1428). אותו הדין ל-AEO (0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV). KPI forecasts + CTR logic נבדקים גם. |
| 6 | intent_integrity | **hard** | אין mixed intents בתוך cluster? Each KW/page = single primary_intent? |
| 7 | thinness_novelty | warning | לכל proposed page יש distinct reason-to-exist? |
| 8 | stakeholder_readout_test | warning | SEO lead + content lead + founder יבינו אותו דבר? |
| 9 | out_loud_read | warning | האם זה רק מילים יפות, או אמירות קונקרטיות? |
| 10 | so_what_test | warning | האם כל major section מסתיים ב-clear decision? |

## כללי revision

- אם **בדיקה hard נכשלה** → הפיקו \`revised_content\` שמתקן אותה (שמרו את שאר התוכן זהה).
- אם **רק warnings** — אל תפיקו revised_content; ה-warnings יוצגו למשתמש.
- אם הפלט "ok in spirit" אבל יש מינוס פרטים — זה warning, לא hard.
- אסור revised_content קצר מ-50% מהמקור (סימן לאיבוד תוכן).

## פורמט תשובה — JSON only

\`\`\`json
{
  "checks": {
    "source_spot_check": { "pass": true, "severity": "hard" },
    "contradiction_pass": { "pass": true, "severity": "warning" },
    "actionability_pass": { "pass": true, "severity": "warning" },
    "language_script_qa": { "pass": true, "severity": "hard" },
    "math_sanity": { "pass": true, "severity": "hard" },
    "intent_integrity": { "pass": true, "severity": "hard" },
    "thinness_novelty": { "pass": true, "severity": "warning" },
    "stakeholder_readout_test": { "pass": true, "severity": "warning" },
    "out_loud_read": { "pass": true, "severity": "warning" },
    "so_what_test": { "pass": true, "severity": "warning" }
  },
  "summary": {
    "hard_failures": [],
    "warnings": []
  },
  "revised_content": null
}
\`\`\`

**במקרה כשל hard:** \`{ "pass": false, "reason": "תיאור 1-משפט", "severity": "hard" }\` + \`revised_content\` עם הפלט המתוקן (כל הפלט המתוקן, לא רק החלק הבעייתי).

**אסור text מחוץ ל-JSON.** רק JSON code-block.`
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
            } catch (err) {
                console.warn(`[selfCritique/${stageId}] critic returned malformed JSON (3 tiers):`, (err as Error).message)
                result.skipped = true
                return result
            }
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        result.skipped = true
        return result
    }
    const obj = parsed as { checks?: Record<string, CheckResult>; revised_content?: string | null; summary?: { hard_failures?: string[]; warnings?: string[] } }

    // Process checks. Iterate over the canonical list so missing keys default to "pass".
    for (const checkName of QUALITY_GATE_CHECKS) {
        const c = obj.checks?.[checkName]
        const isHard = HARD_FAILURE_CHECKS.has(checkName)
        if (!c || typeof c !== 'object') {
            result.checks[checkName] = { pass: true, severity: isHard ? 'hard' : 'warning' }
            continue
        }
        const passed = c.pass !== false
        const severity = c.severity === 'hard' ? 'hard' : (isHard ? 'hard' : 'warning')
        result.checks[checkName] = {
            pass: passed,
            ...(c.reason ? { reason: c.reason } : {}),
            severity,
        }
        if (!passed) {
            const label = `${checkName}: ${c.reason || 'failed'}`
            if (severity === 'hard') result.hardFailures.push(label)
            else result.warnings.push(label)
        }
    }

    result.pass = result.hardFailures.length === 0

    // Accept revised_content only if:
    //   - hard failures present (otherwise revision is pointless)
    //   - revision is not suspiciously short
    //   - revision is meaningfully different from original
    if (!result.pass && typeof obj.revised_content === 'string' && obj.revised_content.length > 200) {
        const revised = obj.revised_content
        if (revised.length < originalContent.length * 0.5) {
            console.warn(`[selfCritique/${stageId}] rejected revision: too short (${revised.length} vs original ${originalContent.length})`)
        } else if (revised === originalContent) {
            console.warn(`[selfCritique/${stageId}] revision identical to original — skipping`)
        } else {
            result.revisedContent = revised
        }
    }

    console.log(`[selfCritique/${stageId}] pass=${result.pass} hardFailures=${result.hardFailures.length} warnings=${result.warnings.length} revised=${!!result.revisedContent}`)
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