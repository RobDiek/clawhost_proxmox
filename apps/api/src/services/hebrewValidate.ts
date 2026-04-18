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
    original: string
    fixed: string | null // null = remove from list
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
                    patchedGaps[idx] = { ...patchedGaps[idx], suggestion: c.fixed }
                }
            }
        } else {
            applyPatch(patched, c.path, c.fixed)
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

function applyPatch(obj: unknown, path: string, fixed: string | null): void {
    // Parse path like "voice.vocabularyDont[3]" or "identity.taglineHe"
    const parts: Array<string | number> = []
    const re = /[^.\[\]]+|\[(\d+)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(path)) !== null) {
        if (m[1] !== undefined) parts.push(parseInt(m[1], 10))
        else parts.push(m[0])
    }

    // Navigate to parent
    let cur: any = obj
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null) return
        cur = cur[parts[i]]
    }
    if (cur == null) return

    const last = parts[parts.length - 1]
    if (typeof last === 'number') {
        // Array index
        if (fixed === null) {
            // Remove (caller's responsibility to track splice effect)
            cur.splice(last, 1)
        } else {
            cur[last] = fixed
        }
    } else {
        if (fixed === null) delete cur[last]
        else cur[last] = fixed
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Claude Haiku validator call
// ═══════════════════════════════════════════════════════════════════════════

async function callHebrewValidator(
    items: Array<{ path: string; text: string }>,
    apiKey: string,
): Promise<Correction[]> {
    const systemPrompt = `אתה מבקר עריכה לשונית של טקסטים בעברית. תפקידך — לזהות מילים שאינן קיימות בעברית (הזיות LLM), שגיאות הטיה חמורות, או כתיב שגוי, ולהציע תיקון.`

    const payload = items.map((it, i) => `${i + 1}. [${it.path}]: ${JSON.stringify(it.text)}`).join('\n')

    const userPrompt = `בדוק את ${items.length} הפריטים הבאים. לכל פריט ציין אם הוא:
(a) תקין — אל תכלול בתשובה
(b) מכיל שגיאה — החזר תיקון

החזר JSON יחיד בלי markdown, במבנה:
{
  "corrections": [
    {
      "path": "<path כמו בקלט>",
      "original": "<הטקסט המקורי>",
      "fixed": "<הטקסט המתוקן, או null אם פשוט למחוק מילה / פריט>",
      "issue": "<הסבר קצר בעברית מה היה לא תקין>"
    }
  ]
}

**דוגמאות מה כן לתקן:**
- מילה שלא קיימת בעברית (למשל "לבריח", "סנקוקרים") — החזר "fixed" עם מילה דומה שכן קיימת, או null לפסילה
- שגיאת הטיה (זכר/נקבה, יחיד/רבים שלא מתאימים) — תקן
- כתיב שגוי חמור (למשל "ש-בועי" במקום "שבועי") — תקן

**מה לא לתקן:**
- מותגים ושמות באנגלית או תעתיק (Flowmatic, AllPay)
- קיצורים סטנדרטיים (AI, VPS, API)
- בחירות סגנוניות ("אתם" vs "אתה") — זה שיקול המותג, לא שגיאה
- מילים טכניות שמורות (יוזר, טאגליין)
- איות חלופי לגיטימי (כאלה/כמו אלה)

**קלט:**
${payload}

החזר JSON בלבד, ללא markdown fence.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 3000,
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
