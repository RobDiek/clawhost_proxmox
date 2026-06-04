/**
 * Monthly Plan Hebrew Cleanup — Phase 2026.02 Block 6 K16
 *
 * Runs after monthlyPlanDetailer to scrub English snake_case / camelCase
 * identifiers + Smart-Bidding-style English terms from generated tasks.
 * Reuses the Sonnet 4.6 hebrew cleanup pass — applies it specifically to
 * string fields inside each task (title, summary, actionPlan[].step,
 * expectedImpact.rationale, sources[].excerpt).
 *
 * Why a separate cleanup pass:
 *   - monthlyPlanSkeleton + Detailer prompts have HEBREW_STYLE_GUIDE
 *     injected, but Opus 4.7 occasionally lapses to English for
 *     technical concepts ("createGtmContainer", "Smart Bidding", etc.)
 *   - Existing research/hebrewCleanup runs only for research stages,
 *     not monthly plan
 *   - Catches edge cases the prompt missed without re-generating the
 *     whole plan
 */

import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'

const SONNET_MODEL = 'claude-sonnet-4-6'
const MAX_INPUT_TOKENS_APPROX = 60_000      // safety cap (per batch)
// K19-fix: chunk size matched to the backfill script. 3 tasks per Sonnet
// call keeps each request well under the per-call token cap AND well under
// undici's default headersTimeout (5min). 60 tasks → 20 sequential batches
// → ~10–15 min total. Replaces the previous single-call mode that skipped
// entire 60-task plans (190K+ chars > 180K threshold).
const CHUNK_SIZE = 3

const STRICT_RULES = `אתה עורך תוכן עברי מקצועי. המשימה: לקחת תוכניות עבודה חודשיות עם משימות, ולהפוך כל טקסט פונה-משתמש לעברית פשוטה ויומיומית — בלי מילים באנגלית מלבד קיצורים מקובלים.

⚠ **כללי ברזל**

1. **שינויים מותרים רק בשדות string פונים-משתמש**:
   - task.title (כותרת המשימה)
   - task.summary (תיאור קצר)
   - task.actionPlan[].step (תיאור צעד הביצוע)
   - task.expectedImpact.rationale (הסבר ההשפעה הצפויה)
   - task.expectedImpact.rationaleHe
   - task.sources[].excerpt (ציטוט מקור)
   - task.detail (אם קיים)

2. **לעולם לא לשנות**:
   - שמות שדות JSON (taskId, status, priority, weekOfMonth, וכו')
   - מספרים, ערכי enum (P0/P1/P2, take_now, monthly_task, וכו')
   - שדות id, ref, type, channel, kind, status, מקלידים enum
   - JSON structure / שמות properties
   - URLs, timestamps

3. **מילים אסורות באנגלית בטקסט עברי** — חייב תרגום:

   ❌ "createGtmContainer"  → ✅ "יצירת מנהל תגיות (GTM)"
   ❌ "Conversion Linker"   → ✅ "מקשר המרות (Conversion Linker)"
   ❌ "GCLID"               → נשאר (קיצור)
   ❌ "Consent Mode v2"     → ✅ "מצב הסכמה v2 (Consent Mode)"
   ❌ "EC"                  → ✅ "המרות משופרות (Enhanced Conversions)"
   ❌ "WP snippet install"  → ✅ "התקנת קטע קוד באתר ה-WordPress"
   ❌ "Smart Bidding"       → ✅ "אופטימיזציית הצעות חכמה"
   ❌ "Bidding"             → ✅ "אופטימיזציית הצעות / מערכת הצעות"
   ❌ "static_value_pollution" → ✅ "זיהום ערכי המרות סטטיים"
   ❌ "polluted signal"     → ✅ "סיגנל מזוהם"
   ❌ "conv_value_quality_subscore" → ✅ "ציון איכות ערך ההמרה"
   ❌ "fix_tracking_first"  → ✅ "תיקון מעקב לפני הכל"
   ❌ "MAXIMIZE_CONVERSION_VALUE" → ✅ "אופטימיזציה לערך מרבי מהמרות"
   ❌ "MAXIMIZE_CONVERSIONS" → ✅ "אופטימיזציה למספר המרות מרבי"
   ❌ "MANUAL_CPC"          → ✅ "הצעות ידניות (Manual CPC)"
   ❌ "TARGET_CPA"          → ✅ "יעד עלות לליד (tCPA)"
   ❌ "TARGET_ROAS"         → ✅ "יעד ROAS"
   ❌ "PERFORMANCE_MAX"     → ✅ "ביצועי מקסימום (Performance Max / PMax)"
   ❌ "RSA"                 → נשאר (קיצור — מתועד באנגלית בענף)
   ❌ "FAQPage"             → נשאר (Schema.org type)
   ❌ "Smart Bidding will spend budget chasing inflated CR" → ✅ "אופטימיזציית הצעות חכמה תוציא תקציב על שיעור המרה מנופח"
   ❌ "remarketing"         → ✅ "פניה חוזרת לגולשים"
   ❌ "audience match"      → ✅ "התאמת קהל"
   ❌ "carousel"            → ✅ "סבב תמונות"
   ❌ "pillar"              → ✅ "דף עוגן"
   ❌ "spoke"               → ✅ "דף נושא משני"
   ❌ "anchor diversification" → ✅ "גיוון טקסטי עוגן"

4. **מילים שנשארות באנגלית** (allowlist מקובל):
   GTM, GA4, AW, AWCT, GCLID, CPC, tCPA, tROAS, CTR, ROAS, CPA, CPM, CPV, CVR, KPI, MRR,
   SEO, AEO, GEO, SERP, FAQ, JSON, JSON-LD, HTML, CSS, JS, URL, API, SDK, ID, UI, UX, A/B,
   PMax, RSA, DSA, OCT, EC, CMP, GDPR, ITP, BQ, LTV, AOV, ROI, CR, BR, B2B, B2C, SaaS,
   DR, PA, DA, EEAT, E-E-A-T.
   שמות מותגים: Google, Meta, WordPress, WooCommerce, Yad2, וכו'.

5. **snake_case / SCREAMING_SNAKE_CASE / camelCase של זיהויים תכנותיים** בתוך טקסט פונה-משתמש — חייב תרגום עם הסבר טבעי בעברית.

⚠ **פלט**: החזר JSON אחד עם שדה אחד \`cleaned_tasks_json\` המכיל את מערך המשימות הנקי כ-JSON.stringify. שמור על מבנה זהה, רק תרגם strings.`

interface MonthlyPlanCleanupInput {
    tasks: Array<Record<string, unknown>>
    instanceId: string
}

interface MonthlyPlanCleanupResult {
    cleanedTasks?: Array<Record<string, unknown>>
    applied: boolean
    skipped: boolean
    reason?: string
}

// Cleans a single CHUNK_SIZE-sized batch. Returns the cleaned subset on
// success, or {ok:false} on any failure (HTTP error, JSON parse, count
// mismatch). Callers should fall back to the original batch tasks.
async function cleanupOneBatch(batch: Array<Record<string, unknown>>, apiKey: string): Promise<{ ok: boolean; cleaned?: Array<Record<string, unknown>>; reason?: string }> {
    const tasksJson = JSON.stringify(batch)
    if (tasksJson.length > MAX_INPUT_TOKENS_APPROX * 3) {
        return { ok: false, reason: `batch too large (${tasksJson.length} chars) — increase chunk granularity` }
    }
    const prompt = `${STRICT_RULES}

## משימות לשכתוב

\`\`\`json
${tasksJson}
\`\`\``

    // Up to 2 attempts; each fetch has a hard 90s timeout so a stalled/hung
    // Anthropic connection (socket open, no response) can NEVER block the whole
    // regen — it aborts, we retry once, then fall back to the original batch.
    let lastErr = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: SONNET_MODEL,
                    max_tokens: 16000,
                    messages: [{ role: 'user', content: prompt }],
                }),
                signal: AbortSignal.timeout(90000),
            })
            if (!res.ok) {
                const text = await res.text().catch(() => '')
                return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 120)}` }
            }
            const data = await res.json() as { content?: Array<{ text?: string }> }
            const rawText = data.content?.[0]?.text || ''
            const jsonMatch = /\{[\s\S]*\}/.exec(rawText)
            if (!jsonMatch) return { ok: false, reason: 'no JSON in response' }
            let parsed: { cleaned_tasks_json?: string }
            try { parsed = JSON.parse(jsonMatch[0]) } catch (e) {
                return { ok: false, reason: `response JSON parse failed: ${(e as Error).message.slice(0, 80)}` }
            }
            const cleanedJson = parsed.cleaned_tasks_json
            if (!cleanedJson) return { ok: false, reason: 'no cleaned_tasks_json' }
            let cleanedTasks: Array<Record<string, unknown>>
            try { cleanedTasks = JSON.parse(cleanedJson) } catch (e) {
                return { ok: false, reason: `cleaned_tasks_json parse failed: ${(e as Error).message.slice(0, 80)}` }
            }
            if (!Array.isArray(cleanedTasks) || cleanedTasks.length !== batch.length) {
                return { ok: false, reason: `task count changed ${batch.length} → ${cleanedTasks.length}` }
            }
            return { ok: true, cleaned: cleanedTasks }
        } catch (err) {
            lastErr = (err as Error).message.slice(0, 100)
            if (attempt < 2) continue   // timeout/abort/network → retry once
        }
    }
    return { ok: false, reason: `fetch error (after retry): ${lastErr}` }
}

export async function runMonthlyPlanHebrewCleanup(input: MonthlyPlanCleanupInput): Promise<MonthlyPlanCleanupResult> {
    const { tasks, instanceId } = input
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { applied: false, skipped: true, reason: 'no tasks' }
    }

    let apiKey: string
    try { apiKey = await getApiKeyForInstance(instanceId) } catch (e) {
        return { applied: false, skipped: true, reason: `no api key: ${(e as Error).message}` }
    }

    // K19-fix: chunk over CHUNK_SIZE-sized batches; per-batch failures keep
    // originals untouched. Single-call mode previously skipped 60-task plans
    // entirely (190K+ chars > 180K threshold) so the safety-net never ran.
    const merged: Array<Record<string, unknown>> = []
    let batchesCleaned = 0
    let batchesKept = 0
    const failureReasons: string[] = []
    for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        const batch = tasks.slice(i, i + CHUNK_SIZE)
        const r = await cleanupOneBatch(batch, apiKey)
        if (r.ok && r.cleaned) {
            merged.push(...r.cleaned)
            batchesCleaned++
        } else {
            merged.push(...batch)
            batchesKept++
            if (failureReasons.length < 3 && r.reason) failureReasons.push(r.reason)
        }
    }
    if (batchesCleaned === 0) {
        console.warn(`[monthlyPlanHebrewCleanup] all ${batchesKept} batches kept as-is. First failures: ${failureReasons.join(' | ')}`)
        return { applied: false, skipped: true, reason: `all ${batchesKept} batches failed cleanup` }
    }
    console.log(`[monthlyPlanHebrewCleanup] applied — ${batchesCleaned} batches cleaned, ${batchesKept} kept as-is (total ${tasks.length} tasks)`)
    return { applied: true, skipped: false, cleanedTasks: merged }
}