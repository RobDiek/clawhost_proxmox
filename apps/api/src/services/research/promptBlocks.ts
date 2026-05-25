/**
 * Prompt blocks — Hebrew text fragments injected into per-stage prompts.
 *
 * These encode Sergei's playbook into operational instructions the agent
 * reads. Per-stage prompt builders (services/research/prompts.ts) compose
 * these blocks instead of duplicating methodology inline.
 *
 * Style rules:
 *   - Hebrew throughout (matches output language; no mental translation)
 *   - Plural address (אתם / תוכלו) per project memory
 *   - Tight: each block earns its tokens — no padding
 *   - No invocations of Hashem, religious framing, or politics
 *   - English technical terms in parentheses where standard (SERP, CTR, etc.)
 *
 * Why separate from methodology.ts:
 *   - methodology.ts is structural (types, formulas, schemas)
 *   - promptBlocks.ts is communicative (what the agent reads)
 *   - Splitting keeps each file's concern clear and reviewable
 */

// ────────────────────────────────────────────────────────────────────────────
// Hard-block rules — go at the bottom of every research prompt
// ────────────────────────────────────────────────────────────────────────────

export const HARD_BLOCK_RULES = `
★★★ חוקי-על — כשל אוטומטי אם תפרו אותם ★★★

🚫 **אסור לקרוא קבצים מ-/home/openclaw/.openclaw/workspace/** — בפרט:
   MEMORY.md / HEARTBEAT.md / AGENTS.md / SOUL.md / CHANNELS.md / TOOLS.md
   /workspace/state/* / /workspace/brands/* / /workspace/content/*
   הם **לא חלק מהמשימה הזאת**. ההקשר היחיד שלכם הוא ה-prompt הזה.

🚫 **אסור לדווח על מצב המערכת** — לא cron jobs, לא Telegram Chat ID,
   לא integrations מחוברות, לא plugins disabled, לא config warnings.
   זה לא market research. זו תמיכה טכנית — לא המשימה שלכם.

🚫 **אסור להתחיל בתשובה מתאר** "מה אני יודע" / "מה אני רואה" / "Session
   חדש" / "נתחיל מחדש". התחילו ישר עם התוצאה — מתחרים, keywords, וכו'.

חוקים תפעוליים:
- כתבו הכל כאן בתשובה — לא בקובץ
- לכל עובדה — ציינו מקור (URL, שם אתר, או שם dataset)
- זו משימה חדשה לגמרי — לא ראיתם אותה קודם. אל תאמרו "כבר עניתי" — ענו מחדש.
- אל תדקלמו מה אתם מתכננים לחפש — בצעו את החיפוש או כתבו את הדוח.`

// ────────────────────────────────────────────────────────────────────────────
// Phase 3.16 — Hebrew-only enforcement with explicit allowlist + forbid-list.
// ────────────────────────────────────────────────────────────────────────────
// Earlier rule "בעברית בלבד (מונחים מקצועיים באנגלית מותרים)" was too vague —
// model interpreted "מונחים מקצועיים" generously and produced sentences like
// "Decision: השקעה ב-FAQ + schema markup ה-bet הוא עם ה-confidence הגבוה
// וה-effort הנמוך — priority #1 ל-Q1 2026". Native Hebrew speakers find this
// jarring and unprofessional. This block lists permitted abbreviations and
// forbids common filler words that creep in.

export const HEBREW_ONLY_BLOCK = `
## כללי שפה — אכיפה קשיחה

**הפלט כולו בעברית.** משפטים, מילות קישור, מסקנות, header-prefixes,
summary-lines — בעברית. אסור לערבב מילים אנגליות במשפט עברי.

**אסור (דוגמאות מתוך פלט קודם — לא לחזור עליהן):**
- ❌ "Decision: השקעה ב-FAQ schema markup"
  ✅ "החלטה: השקעה ב-FAQ ובסכמת מבנה (schema markup)"
- ❌ "ה-bet הוא עם ה-confidence הגבוה ביותר וה-effort הנמוך"
  ✅ "ההימור הוא בעל הביטחון הגבוה ביותר והמאמץ הנמוך ביותר"
- ❌ "priority #1 ל-Q1 2026"
  ✅ "עדיפות #1 לרבעון 1 של 2026"
- ❌ "Threat Ranking" / "Recommended Actions" / "Why Now?"
  ✅ "דירוג איומים" / "פעולות מומלצות" / "למה עכשיו?"

**רק מונחים מקצועיים מהרשימה הזאת מותרים באנגלית** (allowlist):
- ראשי תיבות: SEO, SERP, AEO, GEO, GMB, EEAT, JTBD, KPI, ROI, CTR, CPM, CPC, CPL, KD, FAQ, CMS, API, URL, UTM, CDP, B2B, B2C, SaaS
- מונחי טכניקה: schema markup, structured data, content hub, long-tail, head terms,
  cluster, pillar, spoke, silo, anchor (text), backlink, referring domain, link-gap,
  spam score, striking distance, opportunity score, programmatic, canonical
- ערכי enum (קוד): take_now, take_if_strategic, backlog, high, medium, working_hypothesis,
  low, info_broad, info_deep, commercial_eval, transactional, support, navigational,
  brand_validation, direct, substitute, adjacent, reference, ymyl, none, locality, urgency
- שמות עצמיים: שמות מותגים, שמות כלים, domain names, שמות חברות, שמות סוכנויות

**מילים נפוצות שאסור להשאיר באנגלית** (תרגמו אותן):
and→ו | but→אבל/אך | or→או | with→עם | without→ללא | for→ל-/בשביל |
best→הטוב ביותר | worst→הגרוע ביותר | top→המוביל/העליון | bottom→התחתון |
first→ראשון | second→שני | next→הבא | later→אחר כך |
approach→גישה | method→שיטה | result→תוצאה | decision→החלטה |
recommendation→המלצה | summary→סיכום | conclusion→מסקנה |
priority→עדיפות | high→גבוה | low→נמוך | medium→בינוני |
effort→מאמץ | bet→הימור | win→ניצחון | lose→הפסד |
threat→איום | ranking→דירוג | action→פעולה | timing→תזמון | confidence→ביטחון.

**Phase 3.21 — מילים שכן ראינו במצב שיווקי קודם ומחייבים תרגום ישיר:**
Refresh→רענון | Backlog→המתנה / לבחון אחר כך | Defense play→מהלך הגנתי |
pickup→איסוף | pickup-only→איסוף בלבד | cross-sell→מכירה צולבת |
upsell→מכירה משדרגת | entry product→מוצר כניסה | target (כפעולה)→מטרה |
section→סעיף / קטע | synonym→מילה נרדפת | canon→דף קנוני / canonical |
canonical→canonical (זה allowlist — לכן השאירו) | landing page→דף נחיתה |
SaaS→נאה לאנגלית (allowlist) | Refresh דחוף→רענון דחוף.

**Phase QA round-2 — מילים שתפסנו ב-stage 3 ואסור לחזור עליהן:**
push→דחיפה / לקדם | angle→זווית | variant/variants→וריאציה / וריאציות |
flag→סימון / לסמן (אסור "to flag") | rebuild→בנייה מחדש |
hub→מרכז (לא "hub geographic") | sub-section→תת-סעיף |
marketing fog→ערפל שיווקי | conversion happens→המרה מתרחשת |
fog→ערפל | happens→מתרחש | shopping (בלי schema)→קניות |
**אסור להשתמש ב-enum values כפעלים בעברית:**
"take_if_strategic" / "skip" / "take_now" — אלו ערכי decision ב-JSON בלבד.
ב-narrative בעברית כתבו: "כדאי לקחת" / "לדלג" / "לקחת מיד" וכו'.
**דוגמה אסורה:** "כדאי skip את ה-keyword הזה" → ✅ "כדאי לדלג על ה-keyword הזה".
**דוגמה אסורה:** "אנחנו עושים flag למילים" → ✅ "אנחנו מסמנים את המילים".

**זהירות מבנה משפט מעורב:** משפט שמתחיל באנגלית ואז עברית או להפך — אסור.
דוגמאות אסורות: "Refresh דחוף של ה-pillar הקיים" → צ"ל: "רענון דחוף של ה-pillar הקיים".
"Backlog — לחזור אליו ברבעון הבא" → צ"ל: "להמתין — לחזור אליו ברבעון הבא".
"AEO target חזק" → צ"ל: "מטרת AEO חזקה". (target = מילה אסורה כשפועל בעברית)

**צורת פנייה: רבים בלבד** (אתם / תוכלו / לכם / כדאי לכם) או infinitive impersonal
(להשקיע, לבנות, להוסיף). **אסור יחיד** (אתה / תוכל / לך).

**self-critique יבדוק את זה.** מצא מילה מהרשימה האסורה במשפט עברי = \`language_script_qa\` **hard fail**.

## Phase 3.21d — Single Source of Truth: scoring numbers ב-records בלבד

**אסור לכלול ב-markdown narrative את ה-scoring numbers הבאים** שהשרת מחשב מחדש:
- \`opportunity.total\` (לדוגמה: "score 80.5", "opp 78.5", "73 נקודות")
- \`aeo.total\` (לדוגמה: "AEO 65")
- \`scorecard.total\` (לדוגמה: "Threat 75")

**אלו מספרים שהserver עושה recompute** — אם תכפילו אותם ב-narrative, ה-narrative יסטה מהrecords ויפר עקביות.

**מותר ונדרש להציג ב-narrative** מספרים שמקורם **שאינם recompute-able**:
- ✅ GSC source data: "1,653 impressions", "position 11", "CTR 0.18%"
- ✅ DFS volume: "880 חיפושים/חודש", "KD 32"
- ✅ Word counts: "755 מילים", "3,000 מילים target"
- ✅ Traffic estimates: "ETV 42.3"
- ✅ Time/cost: "60-80 שעות עבודה", "₪12,750", "תוך 30 יום"
- ✅ Counts: "5 מתחרים", "23 records", "3 risks identified"

**Rule of thumb**: אם המספר מגיע מ-DFS / GSC / DB / time / cost / count — **חובה להציג** עבור readability.
אם המספר הוא \`*.total\` של opportunity / scorecard / aeo — **אסור להציג ב-narrative**, רק ב-records.

**self-critique יבדוק את זה.** רק \`opportunity.total\` / \`aeo.total\` / \`scorecard.total\` מספרים ב-narrative = \`contradiction_pass\` warning. מספרי source data כמו GSC impressions = OK.`

// ────────────────────────────────────────────────────────────────────────────
// 1. Intent taxonomy — how to classify each query
// ────────────────────────────────────────────────────────────────────────────

export const INTENT_TAXONOMY = `
## טקסונומיית כוונה (Intent) — חובה לכל keyword/topic

**שכבה 1: כוונה בסיסית (בחרו אחת מ-10 הקטגוריות הבאות — 7-intent ladder מורחב לפי 2026 IL spec):**
- \`navigational\` — חיפוש URL/דף ספציפי (לוגו של brand exact)
- \`brand_validation\` — בדיקת brand reputation, reviews, "X scam"
- \`info_broad\` — שאלה כללית, browsing topic
- \`info_deep\` — בעיה ספציפית, "איך לפתור X", "ההבדל בין X ל-Y"
- \`commercial_eval\` — השוואה לפני קנייה, "best X", "X reviews", "X vs Y"
- \`transactional\` — כוונה לקנות/לפעול עכשיו
- \`support\` — post-purchase, problem with existing product
- \`local\` — *(Phase 2026.01)* כוונה גיאוגרפית בסיסית: "קרטונים פתח תקווה", "מסעדה ליד", "אינסטלטור בחיפה". טריגר ל-Local Pack/GMP-first. שונה ממודיפיקטור \`locality\` בכך שהlocality כוונה היא הציר הראשי, לא overlay.
- \`visual\` — *(Phase 2026.01)* "X לפני ואחרי", "תמונות X", queries שמטרגטים Image Pack. חיוני ל-Hebrew (Image Pack מופיע ב-~40% מ-IL queries).
- \`conversational_aio\` — *(Phase 2026.01)* long-form FAQ-style/AIO-targeted: "איך, מה, מתי, האם" של 6-10+ מילים. ה-cornerstone ל-AEO funnel — Hebrew AIO coverage עוד נמוך (~20-25%), זה window of opportunity.

**שכבה 2: מודיפיקטורים (אורתוגונליים — כל שילוב אפשרי):**
- \`locality\`: none / city / region / near_me / branch
- \`urgency\`: none / same_day / urgent
- \`trust_load\`: low / medium / high / ymyl (Your Money Your Life — health/legal/finance)
- \`language_mode\`: he / en / mixed / translit
- \`buyer_maturity\`: first_time / switcher / expert

**JTBD = שכבת הסבר, לא peer-class.** הוא overlay מעל intent — אסור להציג כאלטרנטיבה ל-intent. JTBD statement format:
"כש[סיטואציה], אני רוצה [פעולה], על מנת ש[תוצאה], מבלי לסכן [חרדה / עלות מעבר / חיסרון]."

**Coverage requirement (Phase 2026.01):** records[] חייבים לכסות לפחות 5 מ-10 הקטגוריות (אם הtopic מאפשר). חובה ≥1 record עם \`conversational_aio\` (אם business יש blog/FAQ surface) — זה ה-funnel ל-AEO.`

// ────────────────────────────────────────────────────────────────────────────
// 2. Opportunity Score — weighted formula instructions
// ────────────────────────────────────────────────────────────────────────────

export const OPPORTUNITY_SCORING = `
## ניקוד הזדמנות (Opportunity Score) — חובה לכל keyword/topic

**אסור להשתמש ב-KD × Volume בלבד.** עבור IL/Hebrew זה גס מדי.

**הנוסחה (משקלים מדויקים — Σ=1.0):**
\`Opportunity = 0.25·BV + 0.20·WP + 0.15·QD + 0.15·CY + 0.10·AEO + 0.10·CL + 0.05·OE\`

🚫 **אסור משקלים שווים (1/7=0.1428) או ממוצע פשוט (avg).** משקלים מדויקים: 0.25 / 0.20 / 0.15 / 0.15 / 0.10 / 0.10 / 0.05.

**דוגמת חישוב מלאה (must-follow pattern):**
נתון: BV=95, WP=80, QD=70, CY=75, AEO=85, CL=90, OE=70
חישוב מילולי שלב-אחר-שלב:
- 0.25 × 95 = 23.75
- 0.20 × 80 = 16.00
- 0.15 × 70 = 10.50
- 0.15 × 75 = 11.25
- 0.10 × 85 = 8.50
- 0.10 × 90 = 9.00
- 0.05 × 70 = 3.50
- **Σ = 82.50** ← total

תפיקו \`opportunity.total\` = 82 (round to int) או 82.5 (keep decimal). לעולם לא 80 (avg) ולא משקלים שווים.

**JSON record חובה לכלול שדה verification:**
\`\`\`json
"opportunity": {
  "business_value": 95, "win_probability": 80, "qualified_demand": 70,
  "click_yield": 75, "aeo_fit": 85, "cluster_leverage": 90, "operational_ease": 70,
  "total": 82.5,
  "decision": "take_now",
  "_formula_verification": "0.25·95 + 0.20·80 + 0.15·70 + 0.15·75 + 0.10·85 + 0.10·90 + 0.05·70 = 23.75+16.00+10.50+11.25+8.50+9.00+3.50 = 82.50"
}
\`\`\`
**\`_formula_verification\` חובה לכלול את החישוב המילולי** — self-critique בודק אותו.

**Thresholds:**
- 70+ → לוקחים במחזור הקרוב
- 60-69 → רק אם זה local defense / brand defense / cluster-critical
- 50-59 → backlog
- <50 → לא לוקחים

**Hard-stop rules** (מדלגים גם אם ניקוד גבוה):
1. אין distinct intent-page type
2. לא ניתן לתת ערך ייחודי מעבר ל-SERP הנוכחי
3. נושא YMYL ללא expert/legal review זמין
4. תוצאה כמעט-רק zero-click ללא assisted-conversion value
5. Programmatic candidate שייסחף ל-thin/scaled content`

// ────────────────────────────────────────────────────────────────────────────
// 3. AEO Target Score — separate subset selection
// ────────────────────────────────────────────────────────────────────────────

export const AEO_TARGET_SCORING = `
## ניקוד AEO Target — בחירת subset לציטוט במנועי AI

**לא כל keyword טוב ל-SEO הוא טוב ל-AEO.** AEO target = subset נפרד.

**הנוסחה (משקלים מדויקים — Σ=1.0):**
\`AEO Target = 0.30·SN + 0.25·FD + 0.20·FU + 0.15·ES + 0.10·CV\`

🚫 **אסור משקלים שווים (1/5=0.20) או ממוצע פשוט.** משקלים מדויקים: 0.30 / 0.25 / 0.20 / 0.15 / 0.10.

**דוגמת חישוב מלאה:**
SN=75, FD=80, FU=85, ES=60, CV=70
- 0.30 × 75 = 22.5
- 0.25 × 80 = 20.0
- 0.20 × 85 = 17.0
- 0.15 × 60 = 9.0
- 0.10 × 70 = 7.0
- **Σ = 75.5**

| רכיב | משמעות |
|---|---|
| SN | Synthesis Need — האם נדרש synthesis ממספר מקורות? (0-100) |
| FD | Fact Density Potential — האם התשובה צריכה facts/lists/tables? |
| FU | Follow-up Likelihood — סבירות גבוהה לשאלות המשך? |
| ES | Entity Specificity — entity ברור (מותג, אדם, מקום, מוצר)? |
| CV | Citation Value — שווה ציטוט במקום אחר? (data, definition, comparison) |

**70+ → AEO-priority subset** (מקבל content treatment ייחודי: structured, factual, comparison-tables, schema)

**JSON: \`aeo._formula_verification\` חובה** — חישוב מילולי כמו opportunity.

**Query shapes שלרוב מתאימים ל-AEO:**
"מה ההבדל בין", "איך לבחור", "כמה עולה", "מה זה", "הכי טוב X ל-Y",
"איך עובד", "מה כולל", "כמה זמן", "האם אפשר", "X לעומת Y", "יתרונות וחסרונות"

**Query shapes שנשארים ב-traditional SEO bucket:**
- pure navigational / exact brand URL
- login / docs / support navigation
- category browse ללא synthesis (e.g. "shoes")
- SKU / exact product / exact branch
- pure "near me" עם dominance של Local Pack

**פלטפורמות AEO לפי עדיפות (IL):**
Tier 1 (must-target): Google AI Overviews + AI Mode → ChatGPT Search → Perplexity
Tier 2: Gemini, Claude

**מה מצוטט הרבה:** מבנה תשובה ברור / facts+lists+comparison tables+definitions / local pages עם address+service+zone+hours+FAQs / מאמרים עם author+org+date / entity+claim structure ברורים.

**מה מצוטט נדיר:** marketing fog ללא facts / thin local pages / JS-hidden content / title/body language mismatch / programmatic sludge / gated content.`

// ────────────────────────────────────────────────────────────────────────────
// 4. Language decision tree
// ────────────────────────────────────────────────────────────────────────────

export const LANGUAGE_DECISION = `
## עברית או אנגלית? — Decision Rule

**עברית ברירת מחדל אם:** local / B2C / trust-heavy / שאלות בחירה-אמון-מחירים-ביקורות-"רוצים-מה" / local service delivery / IL context (חוק, מחיר, זמינות, קלנדר) / Local Pack/Maps/Hebrew reviews/Hebrew support.

**אנגלית ברירת מחדל אם:** B2B/SaaS עם buyer research corpus באנגלית / dev/API/docs-heavy / category language כבר English-dominant in-market / persona = procurement/product/tech / מוצר נמכר מ-IL לעולם.

**Mixed/bilingual אם:** ביקוש מעורב באמת / Hebrew query יש לו stable English sub-terms / buyer research מתחיל באנגלית, conversion happens locally בעברית / brand/category נחפשים bilingual.

**כלל קשיח:** לעולם לא "תוכן אנגלי שתורגם לעברית" כ-IL acquisition pathway. Google מחליף titles אם יש title/script mismatch. אם בספק — Hebrew commercial page + English supporting glossary/docs.

**ל-AI Overviews:** indexability + snippet eligibility נדרשים בעברית — אסור JS-hidden content על Hebrew commercial pages.`

// ────────────────────────────────────────────────────────────────────────────
// 5. SERP feature priorities
// ────────────────────────────────────────────────────────────────────────────

export const SERP_FEATURE_RULES_HE = `
## עדיפויות SERP Features (default — מבוסס playbook IL)

| Feature | Default | Must-capture | Skip |
|---|---|---|---|
| AI Overview / AI Mode | **Must-capture** | info-deep / comparison / how-to-choose / trust-heavy / "מה / הכי טוב / מחיר / חוקי / בטוח" | pure nav / exact login |
| People Also Ask | **Must-harvest** | תמיד (research layer + FAQ architecture) | אף פעם לא לדלג כ-research |
| Featured Snippet | **Must-capture** | definition / steps / comparison / list / short answer | pure local pack / product browse |
| Video Carousel | Nice | demo / procedure / education / visual-trust | abstract B2B |
| Image Pack | Nice | visual services / hospitality / beauty / retail / local proof | pure SaaS / abstract |
| Local Pack | **Must-capture** | כל geo-modified intent / offline service-area | pure national/international SaaS |
| Shopping Carousel | Conditional must | ecommerce / catalog / physical products / real pricing feed | lead-gen / local service / consulting |

**הערה טרמינולוגית:** השתמשו ב-"AI Overviews" + "AI Mode" — אל תשתמשו ב-"SGE" כ-operational label. AI Mode עובד עם query fan-out (מחפש sub-topics).`

// ────────────────────────────────────────────────────────────────────────────
// 6. Competitor analysis rules
// ────────────────────────────────────────────────────────────────────────────

export const COMPETITOR_BUCKETING = `
## חלוקת מתחרים — 4 buckets (לא 3!)

| Bucket | הגדרה |
|---|---|
| Direct (ישיר) | אותו buyer + אותו job + אותו monetization model |
| Substitute (תחליף) | פתרון אחר, אותו job — גונב את ה-job, לא את ה-keyword |
| Adjacent (סמוכה) | קטגוריה שכנה, חפיפה חלקית ב-SERP+audience, expansion lane |
| Reference / Aspirational | דוגמת biztronz גבוהה (לא בהכרח מתחרה אמיתי) — standards-setting |

**Substitute vs Adjacent — disambiguation (Phase 2026.01):**
שאלת הבחנה: האם הלקוח מבצע את אותו ה-JTBD כשהוא משתמש במתחרה? אם כן → substitute. אם הלקוח נשאר לבצע ה-JTBD שלנו אבל ויכול לקנות גם משם → adjacent. דוגמה: עבור חברת קרטונים, חברת הובלות (Get Moving) = SUBSTITUTE כי אותו JTBD ("אני עובר דירה — מה אני צריך?") + הלקוח לא רוכש בנפרד קרטונים (השירות כולל / מספק). חברת ארגוניות בית = ADJACENT — חופף audience אבל JTBD שונה ("לארגן את הבית" ≠ "לארוז למעבר").

**Free / secondhand alternatives — חובה לכלול אם vertical יש commodity component (Phase 2026.01):**
ל-vertical שבו free or used substitute is widely available (e.g. cartons → Yad2 / קבוצות פייסבוק / סופרי שכונה; furniture → Yad2; software → open-source), חובה להוסיף ≥1 record עם bucket="substitute" שמייצג את ערוץ ה-free-source הזה — גם אם הוא לא חברה traditional. הסיבה: free alternative משפיע ישירות על WTP של segment-budget, ו-Stage 6 personas + Stage 10 validation יחשפו את זה. תקציר השפעה ב-threats_to_us של אותו record.

**Per-record minimum content (Phase 2026.01) — חובה גם ל-unenriched competitors:**
לכל record ב-records[], גם אם enrichmentMissing משמעותי (no deep pages, no backlinks summary, no reviews), חובה לכלול:
- threats_to_us[]: לפחות 1 איום קונקרטי (גם אם confidence=working_hypothesis מבוסס על bucket + domain pattern + name)
- content_gaps_at_competitor[]: לפחות 1 פער תוכן/SEO (גם hypothesis based על vertical norms)
- backlink_worthy_assets_inventory[]: לפחות 1 asset hypothesis (לפחות "homepage / category pages" אם אין יותר ספציפי)
ערכים ריקים ([]) אסורים — junior-level analysis. אם באמת אין מידע — מציינים confidence:working_hypothesis + ערך כללי מבוסס bucket.

**Scorecard (60% score / 40% narrative):**

| Dimension | Weight |
|---|---|
| SERP overlap on priority clusters | 25 |
| Page-type fit | 20 |
| Authority / trust proof | 15 |
| Local presence quality | 15 |
| Content system maturity | 15 |
| Asset / linkability strength | 10 |

Total threat score = sum / 100.
**הניקוד מודד "כמה הוא מסוכן ל-route-to-win שלנו"** — לא "כמה הוא מגניב באופן כללי".`

export const COMPETITOR_ALWAYS_ON_SIGNALS = `
## 5 סיגנלים שחובה לכלול בכל ניתוח מתחרה

1. **Topical Authority Venn** — איפה אנחנו חופפים בנושא, ואיפה לא
2. **Site Architecture Depth** — scalability ויכולת לתפוס intent depth
3. **Link Profile Depth** — לא vanity metric, אלא off-site corroboration (referring domains, anchor patterns, link velocity)
4. **Backlink-worthy Assets Inventory** — מאיפה הם מקבלים authority (calculators, research, datasets, tools), לא רק כמה ssylok
5. **E-E-A-T Signals** — author bylines, expert quotes, third-party press, reviews, schema, brand entity strength

**לעולם לא must-on — בודקים בהקשר:**
- content velocity 90d (רועש ללא איכות)
- brand SERP defense (must רק אם brand significant)
- AIO presence per priority *non-branded* comparison set (לא per branded query — vanity)
- funding/team-size proxy (overweight בקלות)`

export const IL_SIGNALS_CHECKLIST = `
## סיגנלים ספציפיים ל-IL — חובה לבדוק בכל מתחרה

**שפה:**
- כיסוי Hebrew-only / Hebrew+English / Latin transliteration
- אין script mismatch ב-primary commercial pages
- עברית native (לא "אנגלית מתורגמת שמתחזה לעברית")

**Trust מקומי:**
- כמות ואיכות Hebrew reviews
- תמונות, תגובות לביקורות, Q&A בפרופיל
- כתובות, סניפים, שעות, אזורי שירות
- Hebrew local proof (case studies, testimonials בעברית)

**Off-site corroboration ב-IL:**
- אזכורים: Geektime, Ynet, Calcalist, Globes, אתרים vertical-specific
- אגודות תחום + business directories ישראליים
- Vertical-specific local listings
- שותפויות / אוניברסיטאות / אגודות

**מציאות צרכן ב-IL:**
- זמינות שירות בלוח שנה ישראלי, שבת, חגים
- אזורי שירות עירוניים/אזוריים (לא רק "Israel-wide")
- נראות ב-Local Pack על Hebrew geo-modifiers
- מובייל אמיתי (IL = mobile-first market)

**לא להשתמש כ-primary signal:**
- צילומי מסך מקבוצות WhatsApp — discovery artifact בלבד, לעולם לא בסיס לדליבר.`

// ────────────────────────────────────────────────────────────────────────────
// 7. Cluster architecture + programmatic + striking + cannibalization
// ────────────────────────────────────────────────────────────────────────────

export const CLUSTER_ARCHITECTURE = `
## ארכיטקטורת cluster

**Default = Topic Cluster + Page-Type Lattice (לא pure silo!).**

לכל commercial pillar — ממוצע 6-8 spokes:
- 1 pillar / service page
- 2-3 info-deep spokes
- 1-2 comparison spokes
- 1 pricing / cost explainer
- 1 FAQ או decision guide
- 1 trust / proof page
- N local pages אם geo-intent חזק

**קישוריות:** hub→spoke + spoke↔spoke + proof→money + local→service + FAQ→comparison.
**למה לא silo:** AI surfaces + modern SERP מתגמלים sub-topic + follow-up coverage (תואם ל-AI Mode query fan-out).`

export const PROGRAMMATIC_RULES = `
## Programmatic SEO — מותר רק אם כל 6 הכללים עוברים

1. **Distinct intent or entity rule** — לדף יש entity / geo / use-case / decision נפרד
2. **Unique usefulness rule** — payload מעבר לתבנית: price logic, availability, local proof, FAQs, differentiators, branch/team data
3. **Template quality floor** — קורא צריך להבין "איך זה שונה מהדף השכן"
4. **Thin-page quarantine** — מועמדים חלשים → noindex draft bucket עד QA ידני
5. **Scalable proof rule** — אם trust layer לא מתגמש, לא מרחיבים page count
6. **Cannibalization pre-check** — דף ממופה ל-canonical cluster + single target intent

**אסור Programmatic:** דפים עם same intent / auto-gen "per query" ללא ערך / pseudo-local ללא local proof / pages רק לתפוס keywords (= scaled content abuse).`

export const STRIKING_DISTANCE_RULE = `
## Striking Distance — buckets

עם GSC data: positions 4-12 ראשי, secondary 13-20.
ללא GSC: estimate-mode 5-15 (מקובל זמנית, לא production long-term).

**Practical rule:**
- 4-8 → Fast optimization (title/meta/internal links/intent match)
- 9-15 → Content/structure upgrade (length, depth, format, schema)
- 16-20 → Rebuild or re-map (page may be wrong type for intent)`

export const CANNIBALIZATION_RULE = `
## Cannibalization Detection

**Flag רק אם כל אלה true:**
- אותה שפה + geo
- אותו primary intent
- אותו page-type או close variant
- חפיפת queries ≥ 70% על important keyword set
- URL substitution ב-SERP history (Google מחליף את ה-lead URL)

**Exceptions (לא flagging):**
- different location entity
- different language version
- different legal/compliance intent
- different product entity

**עדיפות סיגנלים:** overlapping intent (ראשי) > shared keyword set > URL pattern (triage only) > SERP substitution (אישור) > internal anchor confusion.`

// ────────────────────────────────────────────────────────────────────────────
// 8. Persona JTBD + min fields + journey + trust + pricing
// ────────────────────────────────────────────────────────────────────────────

export const PERSONA_JTBD_FORMAT = `
## פרסונות — JTBD-first, לא דמוגרפיה

**Framework:** Switch interviews + Jobs Map lite (לא Christensen folklore, לא ODI אקדמי).

**JTBD statement format (חובה לכל פרסונה):**
"כש[סיטואציה], אני רוצה [פעולה / התקדמות], על מנת ש[תוצאה רצויה], מבלי לסכן [חרדה / עלות מעבר / חיסרון]."

**שדות חובה לפרסונה (אסור להחסיר):**
1. segment_definition — מי בדיוק נכנס לפרסונה
2. jtbd_statement — בפורמט שלמעלה
3. primary_triggers — מה מפעיל את החיפוש
4. top_queries_by_stage — איך זה מתורגם לחיפושים בפועל (לפי שלב buying journey)
5. decision_criteria — מה חשוב בבחירה
6. trust_hierarchy — למי / למה הם מאמינים
7. objections_anxieties — מה מעכב
8. switching_cost — מה מונע מעבר מ-status quo
9. preferred_proof — cases, reviews, licenses, tables, price transparency
10. channels_and_behaviors — איפה research קורה בפועל
11. language_mode — Hebrew / English / mixed

**שדות אופציונליים — רק אם causally משפיעים על search/decision:**
גיל, תפקיד, lifestyle. רוב "מריה 34 אוהבת קפה" זה filler.`

export const BUYING_JOURNEY_FORMAT = `
## Buying Journey columns (חובה במלואן)

| עמודה | משמעות |
|---|---|
| Stage | awareness / consideration / selection / conversion / post-purchase |
| Trigger | מה הפעיל את החיפוש |
| JTBD | איזה progress רוצים |
| Questions Asked | information needs אמיתיים |
| Query Shapes | איך זה מנוסח בחיפוש |
| Trust Threshold | איזה הוכחה נדרשת בשלב הזה |
| Primary Channel | SERP / Maps / reviews / AI / referrals / direct |
| Best Content Format | comparison / landing / FAQ / calculator / proof page |
| Key CTA | מה נחשב micro-conversion |
| Drop-off Risk | איפה ה-journey נשבר |
| Metric | מה מודדים |
| Owner | מי אחראי |`

export const TRUST_HIERARCHY_METHOD = `
## Trust Hierarchy — שיטה (לפי עדיפות נאמנות)

1. **Customer / win-loss interviews** — fidelity הכי גבוה
2. **Sales-call mining**
3. **Review mining**
4. **Competitor messaging patterns**
5. **Vertical priors** — fidelity הכי נמוך

**אם אין interviews:** label = "working hypothesis based on public signal proxies". **לעולם** לא לטעון "validated".

**Weighted trust stack (לבדוק איזה שילוב באמת מחליט):**
official/licensed authority + peer reviews + expert endorsement + brand familiarity + local proof + price transparency + case evidence + usability/convenience.`

export const PRICING_VALIDATION_METHOD = `
## Pricing Validation — שיטה

**Default (לרוב הפרויקטים):**
- competitor pricing benchmark
- sales-call + objection mining
- win/loss review
- WTP interviews (ראיונות willingness-to-pay)
- segmentation by use case

**רק עם rigor:**
- Van Westendorp PSM — אם audience homogeneous + sample discipline
- Conjoint — רק עם budget + data discipline + real trade-offs
- Packaging / offer tests — לרוב יותר שימושי מ-"price research טהור"

**Early-stage default:** competitor benchmark + interview evidence + offer testing > expensive pseudo-precise conjoint.`

// ────────────────────────────────────────────────────────────────────────────
// 9. Positioning + first-win + realism
// ────────────────────────────────────────────────────────────────────────────

export const POSITIONING_STACK_HE = `
## Positioning Stack — שילוב, לא framework יחיד

- **JTBD** — הסבר ביקוש + progress
- **Obviously Awesome** — positioning + category fit
- **The Mom Test** — validation discipline
- **StoryBrand** — messaging layer בלבד (לא strategic core!)
- **Crossing the Chasm** — מוסיפים אם enterprise-heavy

**אסור לבנות SEO/AEO strategy סביב framework יחיד.** צריך stack:
- JTBD מסביר *למה* מחפשים
- positioning מסביר *איך* מתבדלים
- validation מסביר *מה לא ממציאים* בשם הלקוח`

export const FIRST_WIN_CHANNEL_RULES = `
## First-Win Channel — 3 must-pass tests (חובה כולם)

1. **Time-to-first-proof ≤ 45 ימים** — אם ערוץ דורש 4-6 חודשים ל-meaningful signal, הוא רע כ-first-win
2. **Reachable narrowly-defined buyer ללא תשתית כבדה** — existing demand / borrowable attention / reachable outreach surface
3. **High learning density** — מהיר לתת תשובות: מי קליק / למה לא converted / objections / messaging

**Tests משניים (אחרי שעברו 3 הראשונים):**
CAC realism / founder-team fit / repeatability / scalability.

**ל-"5 לקוחות ראשונים":** learning speed > channel elegance.`

export const REALISM_CHECK = `
## Realism Check — מתודה

**Forecast formula:**
\`Forecast = Addressable Clicks × Expected CTR Gain × CVR × Lead Quality × Close Rate\`

**Haircuts:**
- Resource-constraint haircut (כמה bandwidth יש לצוות)
- Execution-risk haircut (סיכון תפעולי)
- Market-noise haircut (משתנים חיצוניים)

**3 תרחישים תמיד:**
- Conservative (תוצאה ריאלית נמוכה)
- Base (תוכנית עיקרית)
- Upside (אם execution+market מתיישרים יוצא מן הכלל)

**Realism checklist (חובה לאמת):**
- baseline קיים?
- comparable cohort זמין?
- page-type precedent ידוע?
- אנחנו לא מבלבלים impressions עם addressable traffic?
- zero-click attrition מחושב?
- CVR לא מנופח?
- מתאים ל-team bandwidth?`

// ────────────────────────────────────────────────────────────────────────────
// 10. Confidence labeling
// ────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE_INTEGRITY_RULE = `
## Confidence Integrity — Hard rules

🚫 **אסור confidence: high אם אין real DFS data backing את ה-claims.**

**Hard rules — חייבים לפסול \`high\` ולסמן \`working_hypothesis\` או \`medium\`:**
- Keyword: אם \`volume_monthly === null\` AND \`difficulty_0_100 === null\` AND \`current_position === null\` → confidence ≠ high (אין נתונים מ-DFS לאמת)
- Competitor: אם \`backlinks data unavailable\` AND \`onpage audit unavailable\` → confidence ≠ high
- Persona: אם אין \`dfs_trustpilot_reviews\` ב-evidence AND אין user interviews → confidence ≠ high (אסור 'validated' ללא ראיונות)
- Pricing: אם method_used יש רק \`competitor_benchmark\` בלי WTP interviews → confidence ל-pricing = working_hypothesis

**מותר \`high\`:**
- DFS verbatim data + entity confirmed (real volume, real KD, real backlinks)
- Upstream stage records cited as source (with explicit reference)
- Real interview transcripts in answers

**\`medium\` כברירת מחדל:**
- Pattern inferred מ-DFS partial data
- Industry priors + 1-2 verifiable points
- Vertical knowledge מוסבר עם ציטוט

**\`working_hypothesis\` חובה:**
- כל invented number ללא DFS backing
- Vertical priors בלבד ללא ראיות specific לעסק
- Cross-stage reference ל-stage שלא הורץ עדיין`

export const CONFIDENCE_LABELING = `
## Confidence Labeling — חובה

**Section-level label** בכל ראש section: \`רמת ביטחון: גבוה / בינוני / השערה — דורש אימות\`

**Claim-level inline marker** — חובה על כל high-stakes claim:
- pricing
- KPI forecast
- traffic projection
- CAC estimate
- TAM/SAM/SOM
- CVR estimate
- time-to-result
- market size

**Format:** \`[confidence: גבוה]\` / \`[confidence: בינוני]\` / \`[confidence: השערה]\`

**רמות:**
- **גבוה** — verified data, primary source מצוטט, observed behavior, structured dataset
- **בינוני** — extrapolation מ-data, pattern inferred from observed signals
- **השערה** — אין interview/data, public-signal proxy. **לעולם לא לטעון "validated".**`

// ────────────────────────────────────────────────────────────────────────────
// 11. Quality gate
// ────────────────────────────────────────────────────────────────────────────

export const QUALITY_GATE_INSTRUCTIONS = `
## Quality Gate — Self-Critique Pre-Ship

לפני סיום, עברו 10 בדיקות:

1. **Source spot-check** — 3-5 claims אקראיים → האם המקור אומר מה שאני אומר?
2. **Contradiction pass** — האם sections סותרים זה את זה?
3. **Actionability pass** — האם כל recommendation → next-task?
4. **Language/script QA** — אין title/body mismatch בעברית?
5. **Math sanity** — opportunity scores, forecasts, CTR logic, effort estimates — מתחברים?
6. **Intent integrity** — אין mixed intents בתוך אותו cluster?
7. **Thinness/novelty** — לכל proposed page יש distinct reason-to-exist?
8. **Stakeholder readout test** — SEO lead + content lead + founder יבינו אותו דבר?
9. **Out-loud read** — האם זה רק מילים יפות, או אמירה קונקרטית?
10. **"So what?" test** — האם כל major section מסתיים ב-clear decision?

אם בדיקה נכשלת — תקנו לפני submit.`

// ────────────────────────────────────────────────────────────────────────────
// 12. JSON output schema instructions
// ────────────────────────────────────────────────────────────────────────────

export const JSON_OUTPUT_RULES = `
## פורמט פלט: JSON-first + Markdown narrative

**רשומות מובנות (records)** — תמיד JSON:
- keywords, competitors, personas, opportunity scores, scorecards
- כל אחת חייבת \`confidence\`, \`evidence\` (array of URLs/sources), \`generated_at\` (ISO 8601)

**Sections נרטיביים** — Markdown בעברית:
- Why Now? Timing analysis
- Strategic recommendations
- IL trust analysis
- Content gap narrative

**מבנה תשובה — חובה:**
\`\`\`
## תקציר מנהלים (markdown)
[2-3 פסקאות]

## רשומות מובנות
\`\`\`json
{ "records": [ ... ] }
\`\`\`

## ניתוח (markdown)
[narrative sections]
\`\`\`

חשוב: JSON code-block חייב להיות parseable. אסור comments בתוך JSON. אסור trailing commas.`

// ────────────────────────────────────────────────────────────────────────────
// 13. DataForSEO data presentation rule
// ────────────────────────────────────────────────────────────────────────────

export const DFS_DATA_RULE = `
## DataForSEO — שימוש בנתונים מהדאטהבייס

נתונים מ-DataForSEO (volumes, CPC, difficulty, SERP positions, backlinks, on-page audit) הוזרקו ל-prompt הזה כ-section נפרד אם זמינים.

**כללים:**
- אם יש נתון מ-DFS — השתמשו בו verbatim, ציינו מקור: "DataForSEO live data, [date]"
- אם אין נתון — סמנו כ-\`estimate\` עם confidence: \`בינוני\` או \`השערה\`
- לעולם אל תמציאו מספרים שאתם לא רואים ב-prompt
- אם נתון נראה לא הגיוני (e.g. CPC ₪500 על keyword קטן) — ציינו "anomaly — verify before action"`

// ────────────────────────────────────────────────────────────────────────────
// 14. Evidence-honesty rule (Phase QA round-7)
// ────────────────────────────────────────────────────────────────────────────
//
// Stages where the prefetcher's data might be sparse (small site → short
// link gap list, niche IL business → empty Trustpilot reviews, etc) — model
// has a strong tendency to PAD the output with vertical-knowledge
// recommendations (B144, generic outreach categories, industry priors)
// while LABELING them as DFS-derived. Caught in stage 5 (link_audit) for
// storage-station: 7/13 records claimed `dfs_link_gap_candidates` evidence
// when DFS linkGap had only 2 entries (linkpower.co.il, generatepress.com).
//
// This rule forces strict separation: only domains/entities literally
// visible in the prompt's data tables can be tagged as DFS-derived. Anything
// else (B144, ynet, generic blogs, vertical knowledge) MUST be tagged as
// industry_priors / vertical_priors / business_description, and confidence
// drops to `working_hypothesis`.

export const EVIDENCE_HONESTY_RULE = `
## חוקי הוכחה — Evidence Honesty (CRITICAL)

🚫 **חל איסור מוחלט להפיק רשומה עם evidence מפוברק.**

**כללי כתיבת evidence:**

1. **אם רשומה מתייחסת ל-domain/entity ספציפי** — חובה לבדוק שהמופע **קיים מילולית בטבלאות הנתונים שמועמסות ב-prompt** (linkGap, lostLinks, anchors, referringDomains, competitors, ideas, gsc.queries, וכו'). אם כן — \`evidence: ["dfs_<source_name>"]\`. אם לא — אסור לטעון \`dfs_*\`.

2. **אם המקור הוא ידע אנכי / שוק ישראלי / training data** — חובה לתייג כ-\`["industry_priors", "vertical_priors", "il_market_knowledge"]\` בלבד. **לעולם לא** \`dfs_*\` כשה-domain לא בנתונים שלפניכם.

3. **כל record שה-evidence שלו רק \`industry_priors\` / \`vertical_priors\` / \`il_market_knowledge\`** → confidence MUST = \`working_hypothesis\`. לעולם לא \`high\` או \`medium\` ללא DFS/upstream verifiable signal.

4. **כל record שמזכיר domain/entity שלא בנתונים** (גם אם evidence עצמו תקני) → confidence = \`working_hypothesis\`.

5. **אם הנתונים מ-DFS דלים** (e.g. linkGap = 2 entries בלבד, lostLinks = 0, ref_domains = 13) — חובה לציין במפורש בתקציר המנהלים: "פרופיל הקישורים דליל — N הזדמנויות נמשכו מתוך X DFS data, השאר מבוסס industry priors". **לא להעמיד פנים שהפלט DFS-driven כשרוב הוא vertical knowledge.**

**דוגמה אסורה:**
\`\`\`
{
  "type": "link_gap_outreach",
  "target": "B144 / dapei-zahav",
  "evidence": ["dfs_link_gap_candidates"],   ← B144 לא ב-linkGap
  "confidence": "high"
}
\`\`\`

**דוגמה תקינה — אותו תוכן:**
\`\`\`
{
  "type": "link_gap_outreach",
  "target": "B144 / dapei-zahav",
  "evidence": ["industry_priors", "il_market_knowledge"],
  "confidence": "working_hypothesis",
  "rationale": "...אינדקסים ישראליים סטנדרטיים — לא נמשכו מ-linkGap data שכלל 2 entries בלבד..."
}
\`\`\`

**self-critique בודק את זה:** אם evidence \`dfs_*\` אבל ה-target לא ב-prompt data → hard fail \`source_spot_check\`. אם confidence = \`high\` עם evidence \`industry_priors\` בלבד → hard fail \`confidence_integrity\`.`