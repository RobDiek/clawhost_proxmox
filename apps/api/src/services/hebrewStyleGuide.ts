/**
 * Hebrew Style Guide — Phase 2026.02 Block 6 K16
 *
 * Central style directive injected into ALL prompts that generate
 * user-facing Hebrew text (monthly plans, audits, action plans, follow-up
 * tasks, paid_audit narratives, etc.).
 *
 * Goal: produce HEBREW-FIRST text without English contamination. English
 * is allowed ONLY for standard abbreviations that are commonly read in
 * Hebrew (GTM, GA4, AW, CPC, etc.) — and even those should be expanded
 * inline on first occurrence.
 *
 * Anti-patterns observed in production (29.5.2026):
 *   ❌ "createGtmContainer + Conversion Linker + GCLID + Consent Mode v2 + EC + WP snippet install"
 *   ❌ "static_value_pollution והחזרת אמון בסיגנל ההמרות"
 *   ❌ "Smart Bidding"
 *   ❌ "applied 29.5.2026"
 *   ❌ snake_case English programming identifiers
 *
 * Correct alternatives:
 *   ✓ "יצירת מנהל תגיות חדש (GTM) — קישור המרות, מצב הסכמה, וקודי התגיות באתר"
 *   ✓ "תיקון זיהום ערכי המרות והחזרת אמון בסיגנל"
 *   ✓ "אופטימיזציית הצעות חכמה"
 *   ✓ "הוחל 29.5.2026"
 */

export const HEBREW_STYLE_GUIDE = `═══ סגנון עברית — חוקים חובה ═══

ה-ALL הטקסטים הפונים למשתמש (כותרות, סיכומים, צעדי פעולה, רציונליים, גורמי השפעה) חייבים להיכתב בעברית פשוטה, יומיומית. אסור להשתמש במילים באנגלית אלא בקיצורים מקובלים בלבד.

═══ מותר באנגלית (קיצורים בלבד) ═══

GTM, GA4, AW, AWCT, GCLID, CPC, tCPA, tROAS, CTR, ROAS, CPA, CPM, CPV, CVR, KPI, MRR, ARR,
SEO, AEO, GEO, SERP, FAQ, JSON, JSON-LD, HTML, CSS, JS, URL, API, SDK, ID, UI, UX, A/B,
PMax, RSA, DSA, OCT, EC, CMP, GDPR, ITP, BQ, LTV, AOV, ROI, CR, BR, TLD, SaaS, B2B, B2C,
DR (Domain Rating), PA (Page Authority), DA (Domain Authority).

כל קיצור באנגלית בהיגוי ראשון — ההסבר בעברית אחריו בסוגריים:
✓ "אסטרטגיית הצעות מבוססת יעד עלות לליד (tCPA)"
✓ "מנהל התגיות של גוגל (GTM)"
✓ "ביצועי מקסימום (Performance Max / PMax)"

═══ מילים אסורות — תרגום מחייב ═══

אסור (English)                 → חובה (עברית)
══════════════════════════════════════════════════════════════════════
"applied"                      → "הוחל"
"active"                       → "פעיל"
"available"                    → "זמין"
"loaded"                       → "נטען"
"cancel"                       → "ביטול"
"confirm"                      → "אישור"
"close"                        → "סגירה"
"restore"                      → "החזרה למצב מקורי"
"Smart Bidding"                → "אופטימיזציית הצעות חכמה"
"remarketing" / "retargeting"  → "פניה חוזרת לגולשים"
"audience"                     → "קהל"
"conversion"                   → "המרה"
"attribution"                  → "ייחוס"
"indexation"                   → "אינדוקס" / "סריקה"
"ranking"                      → "דירוג"
"carousel"                     → "סבב תמונות"
"reel"                         → "סרטון Reel"
"headline"                     → "כותרת"
"description"                  → "תיאור"
"pillar"                       → "דף עוגן"
"spoke"                        → "דף נושא משני"
"hub"                          → "צומת" / "מרכז"
"keyword"                      → "מילת מפתח"
"backlink"                     → "קישור נכנס"
"anchor text"                  → "טקסט עוגן"
"funnel"                       → "משפך המרה"
"micro-conversion"             → "המרת מיני" / "פעולה משנית"
"static_value_pollution"       → "זיהום ערכי המרות סטטיים"
"polluted signal"              → "סיגנל מזוהם"
"clean signal"                 → "סיגנל נקי"
"learning state"               → "מצב למידה"
"audience match"               → "התאמת קהל"
"snippet"                      → "קטע קוד" (במידה ומדובר ב-HTML/JS) או "מקטע"
"plugin"                       → "פלאגין"
"plugin install" / "uninstall" → "התקנה" / "הסרה"
"setup"                        → "הקמה" / "הגדרה"
"install"                      → "התקנה"

═══ זיהוי תכנותי — אסור לחלוטין ═══

❌ אסור להשתמש ב-snake_case או camelCase של מזהים תכנותיים בתוך טקסט עברית פונה-משתמש.

דוגמאות אסורות (ראיתי בייצור 29.5.2026):
❌ "createGtmContainer + Conversion Linker + GCLID + Consent Mode v2"
❌ "static_value_pollution"
❌ "MAXIMIZE_CONVERSION_VALUE"
❌ "fix_tracking_first"
❌ "conv_value_quality_subscore"

חליפיהם הנכונים:
✓ "יצירת מנהל תגיות (GTM) + קישור המרות + מצב הסכמה"
✓ "זיהום ערכי המרות סטטיים"
✓ "אופטימיזציה לערך מרבי מהמרות"
✓ "תיקון מעקב ראשון"
✓ "ציון איכות ערך ההמרה"

═══ סגנון פניה ═══

✓ גוף שני רבים: אתם / לכם / תוכלו / הריצו / בדקו
✓ סבילה אישית: יש לבדוק / מומלץ ליישם / נדרש לוודא
✗ גוף שני יחיד: אתה / לך / בדוק

═══ שמות ענייניים ═══

שמות מותגים, שמות מוצרים, ושמות פלאגינים נשארים במקור:
✓ "פלאגין PixelYourSite"
✓ "תוסף Google Analytics"
✓ "פלטפורמת WordPress"
✓ "מסלול אסטרטגיית שמרני (Conservative)" — שם המסלול בעברית + אנגלית בסוגריים

═══ דוגמאות תיקון של טקסטים אמיתיים ═══

לפני: "createGtmContainer + Conversion Linker + GCLID + Consent Mode v2 + EC + WP snippet install"
אחרי: "יצירת מנהל תגיות (GTM) → התקנת קישור המרות, GCLID, מצב הסכמה (Consent Mode v2), והמרות משופרות → הזרקת קטע קוד באתר ה-WordPress"

לפני: "תיקון static_value_pollution והחזרת אמון בסיגנל ההמרות"
אחרי: "תיקון זיהום ערכי המרות סטטיים והחזרת אמון בסיגנל ההמרות"

לפני: "applied 29.5.2026"
אחרי: "הוחל ב-29.5.2026"

═══ כלל זהב ═══

אם זה לא נשמע טבעי כשמדברים בעברית מדוברת — תשנו את הניסוח. הטקסט פונה למשתמש סופי שיש לו הקשר עסקי, לא לראש צוות פיתוח.
`

/**
 * Helper to inject the style guide into a system prompt that ends with
 * "═══ HEBREW UX STANDARDS ═══" or similar marker. Calls the style guide
 * automatically — no need to copy-paste into every prompt.
 */
export function withHebrewStyleGuide(basePrompt: string): string {
    return `${basePrompt}\n\n${HEBREW_STYLE_GUIDE}`
}