/**
 * Hebrew Validation Service
 *
 * Second-pass validator for Hebrew content produced by LLM composers.
 * Catches hallucinated words (non-existent Hebrew like "לבריח" that was
 * seen in Flowmatic brand_book v1).
 *
 * Strategy:
 *   1. Walk JSON draft, extract all Hebrew strings in known-linguistic fields
 *   2. Pass to Claude Haiku with explicit "reject non-existent words" prompt
 *   3. Receive { field_path: { original, fixed, issue } } corrections
 *   4. Apply fixes back to draft
 *
 * Runs AFTER compose, BEFORE persist. Cost: ~$0.005 per brand book
 * (Haiku is cheap, small payload).
 *
 * Fields checked (linguistic text, not keys/urls/hexes):
 *   - identity.taglineHe, missionHe, manifestoHe, positioningLine
 *   - voice.vocabularyDo[], vocabularyDont[], signaturePhrases[], personalityAdjectives[]
 *   - imagery.moodKeywords[], doNotUse[]
 *   - principles[]
 *   - colors.*.name (Hebrew color names)
 *   - logo.usageRules.forbiddenContexts[] (if Hebrew)
 *   - gaps[*].suggestion
 */

import type { BrandBookDraft, Gap } from './brandBookCompose'

interface Correction {
    path: string         // dot-path like "identity.taglineHe" or "voice.vocabularyDont[4]"
    original: string     // the original content (may be substring of the field, or the full field)
    fixed: string | null // null = remove from list; otherwise new value (substring replacement if length mismatch)
    issue: string        // reason in Hebrew
}

interface ValidationResult {
    draft: BrandBookDraft
    corrections: Correction[]
    ok: boolean
    error?: string
}

/** Regex-based pre-filter: only validate strings containing Hebrew chars */
const HEBREW_CHAR = /[\u0590-\u05FF]/

/** Keys to skip (urls, hexes, enum values that aren't linguistic) */
const SKIP_KEYS = new Set([
    'hex', 'url', 'format', 'family', 'license', 'tone', 'humor',
    'hebrewRegister', 'style', 'tenantPath', 'variant', 'priority',
    'field', 'id', 'lineHeight', 'letterSpacing', 'minSizePx', 'safeZonePx',
])

export async function validateHebrew(
    draft: BrandBookDraft,
    gaps: Gap[],
    anthropicKey: string,
): Promise<ValidationResult> {
    // Step 1: harvest Hebrew strings with their paths
    const items: Array<{ path: string; text: string }> = []
    harvest(draft, '', items)
    for (let i = 0; i < gaps.length; i++) {
        if (gaps[i].suggestion && HEBREW_CHAR.test(gaps[i].suggestion)) {
            items.push({ path: `gaps[${i}].suggestion`, text: gaps[i].suggestion })
        }
    }

    if (items.length === 0) {
        return { draft, corrections: [], ok: true }
    }

    // Step 2: batch validate via Claude Haiku
    let corrections: Correction[]
    try {
        corrections = await callHebrewValidator(items, anthropicKey)
    } catch (err) {
        console.error('Hebrew validation error (non-fatal):', err)
        return { draft, corrections: [], ok: false, error: String(err) }
    }

    // Step 3: apply corrections back to draft + gaps
    const patched = JSON.parse(JSON.stringify(draft)) as BrandBookDraft
    const patchedGaps = [...gaps]
    for (const c of corrections) {
        if (c.path.startsWith('gaps[')) {
            const m = c.path.match(/^gaps\[(\d+)\]\.suggestion$/)
            if (m) {
                const idx = parseInt(m[1], 10)
                if (patchedGaps[idx] && c.fixed !== null) {
                    // Gap suggestions are short free-text, full replacement is safe
                    patchedGaps[idx] = { ...patchedGaps[idx], suggestion: c.fixed }
                }
            }
        } else {
            applyPatch(patched, c.path, c.fixed, c.original)
        }
    }

    // Note: we mutate gaps in place so caller sees corrections
    for (let i = 0; i < gaps.length; i++) {
        gaps[i] = patchedGaps[i]
    }

    return { draft: patched, corrections, ok: true }
}

// ═══════════════════════════════════════════════════════════════════════════
// Harvest Hebrew strings with paths
// ═══════════════════════════════════════════════════════════════════════════

function harvest(obj: unknown, path: string, out: Array<{ path: string; text: string }>): void {
    if (obj == null) return

    if (typeof obj === 'string') {
        if (HEBREW_CHAR.test(obj)) out.push({ path, text: obj })
        return
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            harvest(obj[i], `${path}[${i}]`, out)
        }
        return
    }

    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            if (SKIP_KEYS.has(k)) continue
            // Skip url-ish strings that happen to have Hebrew chars (unlikely but safe)
            if (typeof v === 'string' && /^https?:\/\//i.test(v)) continue
            const nextPath = path ? `${path}.${k}` : k
            harvest(v, nextPath, out)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Apply correction by dot-path
// ═══════════════════════════════════════════════════════════════════════════

// Apply a validator correction safely.
// The validator often returns a SHORT substring as `fixed` and `original`,
// intending a substring replacement — but earlier code would clobber the
// entire field, turning a 300-char manifesto into a 20-char fragment.
// Behavior:
//   1. If fixed === null: delete key / splice array item.
//   2. If current value at path is a short string or matches original exactly:
//      do full-field replacement.
//   3. If current value is a longer string AND original is a substring of it:
//      replace just that substring (preserves surrounding sentences).
//   4. If current value is much longer than fixed and original is NOT found:
//      skip this correction (log warning) — safer to leave original than to
//      destroy the field.
export function applyPatch(obj: unknown, path: string, fixed: string | null, original?: string): void {
    const parts: Array<string | number> = []
    const re = /[^.[\]]+|\[(\d+)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(path)) !== null) {
        if (m[1] !== undefined) parts.push(parseInt(m[1], 10))
        else parts.push(m[0])
    }

    let cur: any = obj
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null) return
        cur = cur[parts[i]]
    }
    if (cur == null) return

    const last = parts[parts.length - 1]

    // null = delete
    if (fixed === null) {
        if (typeof last === 'number') cur.splice(last, 1)
        else delete cur[last]
        return
    }

    // Read current value
    const existing = cur[last]

    // Simple case: slot is empty or short (treat as full replacement)
    if (typeof existing !== 'string' || existing.length < 50) {
        cur[last] = fixed
        return
    }

    // Length-guard: fixed is drastically shorter than existing — suspicious
    const shrinkRatio = fixed.length / existing.length
    if (shrinkRatio < 0.5) {
        // Try substring replacement if `original` is found in `existing`
        if (original && existing.includes(original)) {
            cur[last] = existing.replace(original, fixed)
            return
        }
        // Otherwise bail — do not destroy the field. Log so the validator
        // return shape can be tightened over time.
        console.warn(`[hebrewValidate] skipping suspicious correction on ${path} — fixed shorter than 50% of existing and original not found`)
        return
    }

    // Normal length replacement
    cur[last] = fixed
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude Haiku validator call
// ═══════════════════════════════════════════════════════════════════════════

async function callHebrewValidator(
    items: Array<{ path: string; text: string }>,
    apiKey: string,
): Promise<Correction[]> {
    const systemPrompt = `אתה עורך לשוני מקצועי של טקסטים בעברית שפורסמו לקהל ישראלי. תפקידך לזהות **כל** שגיאה — גם קטנה — שתבייש מותג מול דוברי עברית: מילים שלא קיימות (hallucinations), הלחמים שגויים, כתיב, הטיה, רווחים, ניקוד-תנועות. תהיה דקדקני אבל הוגן — אל תתקן בחירות סגנוניות, רק שגיאות שעורך אנושי היה מסמן בעט אדום.`

    const payload = items.map((it, i) => `${i + 1}. [${it.path}]: ${JSON.stringify(it.text)}`).join('\n')

    const userPrompt = `בדוק את ${items.length} הפריטים הבאים. לכל פריט אתה מחליט:
(a) תקין — אל תכלול בתשובה
(b) מכיל שגיאה — החזר תיקון

**חוקי טופס חובה (אל תפר):**
- \`original\` חייב להיות מחרוזת שקיימת בדיוק בטקסט המקורי של הפריט (case + spaces matching).
- \`fixed\` הוא מחרוזת חליפית שתחליף את \`original\` בתוך הפריט. אם ברצונך לתקן מילה אחת בתוך משפט ארוך — \`original\` = המילה השגויה, \`fixed\` = המילה המתוקנת. השאר הפריט יישמר.
- אסור להחליף פריט ארוך (50+ תווים) במחרוזת קצרה שאינה תחליף בתוכו — זה יהרוס את השדה.
- \`fixed\` יכול להיות null רק אם ברור שצריך למחוק את הפריט כולו (למשל מילה hallucination בתוך vocabularyDo).

החזר JSON יחיד בלי markdown, במבנה:
{
  "corrections": [
    {
      "path": "<path כמו בקלט>",
      "original": "<המחרוזת הבעייתית בדיוק כפי שמופיעה — תיאום תווים מלא>",
      "fixed": "<המחרוזת החליפית, או null למחיקה>",
      "issue": "<הסבר קצר בעברית>"
    }
  ]
}

**סוגי שגיאות לתפוס (רשימה מחייבת):**
1. **מילים שאינן קיימות בעברית** (LLM hallucinations):
   - דוגמה: "לבריח" (לא קיים) → "לברוח"
   - דוגמה: "בישיגה" (לא קיים — הלחם שגוי של "בהישג יד") → "בהישג יד"
   - דוגמה: "סנקוקרים" (לא קיים) → מחק או בחר מילה אמיתית
2. **הלחמים שגויים / חסרי רווח**:
   - "תפסיד לתחרות" — תקין
   - "ב-הישג יד" → "בהישג יד" (מקף שגוי)
   - "ש-בועי" → "שבועי" (חתך שגוי)
   - "תתחילהיום" → "תתחיל היום" (חסר רווח)
3. **הטיות שגויות** (זכר/נקבה, יחיד/רבים):
   - "העסקים קטן" → "העסקים קטנים"
   - "הסוכנות מקצועי" → "הסוכנות מקצועית"
4. **כתיב שגוי**:
   - "מחרר" → "משחרר"
   - "תעסקה" → "תעסוקה"
5. **שברי משפטים** (בשדות שצריכים משפט שלם — manifestoHe/missionHe):
   - "עם גישה לכל החיים." ← רק צירוף שם עצם, חסר פועל. זה שבר. החזר null או הצע משפט שלם.
6. **כפילויות בין שדות** — אם אותה פרזה מדויקת מופיעה גם ב-taglineHe וגם ב-manifestoHe / signaturePhrases, סמן את ההופעה השנייה כ-null (מחיקה) עם issue="כפילות מיותרת".

**מה לא לתקן:**
- מותגים/שמות באנגלית (Flowmatic, Flowmatic, AllPay)
- קיצורים סטנדרטיים (AI, VPS, API, URL, SVG)
- בחירות סגנוניות ("אתם" vs "אתה" — שיקול המותג)
- מילים טכניות שאולות (יוזר, טאגליין, פרומפט)
- איות חלופי לגיטימי (כאלה / כמו אלה)
- שפה דיבורית אם הפריט משדה casual (voice.vocabularyDo)

**קלט:**
${payload}

החזר JSON בלבד, ללא markdown fence. אל תדווח על פריטים תקינים. סדר ה-corrections לא חשוב.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            // Upgraded Haiku → Sonnet 4.6 for Hebrew morphology + word-fusion
            // detection. Haiku missed "בישיגה" (a fused hallucination of "בהישג יד")
            // in the v5 Flowmatic brand book. Sonnet catches these reliably.
            model: 'claude-sonnet-4-6',
            max_tokens: 3500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Haiku validator HTTP ${res.status}: ${errText.substring(0, 200)}`)
    }

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Validator returned no JSON')

    let parsed: { corrections: Correction[] }
    try {
        parsed = JSON.parse(jsonMatch[0])
    } catch {
        throw new Error('Validator JSON parse failed: ' + text.substring(0, 200))
    }

    const raw = parsed.corrections || []

    // Tier 3-W: normalize paths — Claude sometimes wraps with outer brackets
    // like "[voice.vocabularyDont[3]]". Strip before returning so downstream
    // code + DB + UI see clean paths.
    return raw.map(c => ({
        ...c,
        path: cleanPath(c.path),
    }))
}

function cleanPath(path: string): string {
    if (!path) return path
    let p = path.trim()
    // Strip matching outer brackets: "[voice.vocabularyDont[3]]" -> "voice.vocabularyDont[3]"
    while (p.startsWith('[') && p.endsWith(']') && isBalancedInside(p.slice(1, -1))) {
        p = p.slice(1, -1).trim()
    }
    return p
}

function isBalancedInside(s: string): boolean {
    // Check if brackets inside are balanced (so stripping outer won't break inner paths)
    let depth = 0
    for (const ch of s) {
        if (ch === '[') depth++
        else if (ch === ']') { depth--; if (depth < 0) return false }
    }
    return depth === 0
}