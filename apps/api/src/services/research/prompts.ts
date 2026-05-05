/**
 * Per-stage prompt builders. One function per StageId — each takes the same
 * shared context (instance + answers + upstream stage results) and returns
 * a prompt + agent + minLength + useDirectApi switch for the executor.
 *
 * Spec: docs/research-pipeline-design.md §7
 *
 * Source: lifted from agentSetup.buildResearchPrompt with these mappings:
 *   competitor_landscape ← stage 1
 *   seo_keyword_research ← stage 2
 *   audience_personas    ← stage 3
 *   positioning          ← NEW (small focused prompt, was implicit in stage 4)
 *   strategy_options     ← stage 4
 *   validation           ← stage 5 (ai_sim + real_interviews modes)
 *
 * The other stages (aeo_visibility, social_landscape, email_competitor_audit,
 * paid_audit, content_plan, media_plan) are either Phase 4 (live integrations)
 * or wrap existing handlers, so they don't need prompt builders here.
 */

import { getStageContent } from './reader'
import type { ResearchDataV2, StageId } from './types'

interface PromptOpts {
    businessName: string
    businessDesc: string
    answers: Record<string, unknown>
    rd: ResearchDataV2
    /** Optional user feedback to inject into the prompt for re-run. */
    feedback?: string
    /** Tools available on the VPS — controls the search/crawl/dfs hints. */
    tools: { hasBrave: boolean; hasDataforseo: boolean; hasFirecrawl: boolean }
    /** Historical assets block (Meta/Google Ads/GA/GSC CSVs) — already formatted markdown. */
    historicalAssetsBlock?: string
}

export interface PromptResult {
    /** OpenClaw CLI agent if useDirectApi=false. Ignored otherwise. */
    agentId: 'sayer' | 'menateach'
    prompt: string
    /** Floor below which executor treats result as "too short". */
    minLength: number
    /**
     * Stages without web research (analytical) → direct Anthropic API,
     * bypassing OpenClaw workspace context which confuses menateach.
     */
    useDirectApi: boolean
}

interface ProductSku {
    name: string
    priceIls: number | null
    priceModel: 'subscription_monthly' | 'one_time' | 'tiered' | 'free' | 'unknown'
    description: string
    isPrimary?: boolean
}

// Format products list as a Hebrew block. Empty string ⇒ caller flows normally.
function productsBlock(answers: { products?: ProductSku[]; productsFunnel?: string }): string {
    const list = answers.products || []
    if (list.length === 0) return ''
    const modelLabels: Record<string, string> = {
        subscription_monthly: 'מנוי חודשי',
        one_time: 'חד-פעמי',
        tiered: 'מדורג',
        free: 'חינם (ליד-מגנט)',
        unknown: 'לא ברור',
    }
    const lines = list.map((p, i) => {
        const price = p.priceIls != null ? `₪${p.priceIls}` : 'מחיר לא צוין'
        const model = modelLabels[p.priceModel] || p.priceModel
        const mark = p.isPrimary ? ' 🎯 **[מוצר כניסה — דרכו נכנסים ל-funnel]**' : ''
        return `${i + 1}. **${p.name}** — ${price} (${model})${mark} — ${p.description || 'ללא תיאור'}`
    })
    const funnel = (answers.productsFunnel || '').trim()
    const funnelLine = funnel
        ? `\n\n**הקשר בין המוצרים (מהמשתמש ישירות — חייב לכבד!):** ${funnel}`
        : ''
    return lines.join('\n') + funnelLine
}

// Hard-block rules that go at the bottom of every prompt — sayer/menateach
// occasionally produces "system status reports" instead of research, this is
// the last line of defense before the meta-leak validator catches it.
const RULES = `
★★★ חוקי-על — כשל אוטומטי אם תפר אותם ★★★

🚫 **אסור לקרוא קבצים מ-/home/openclaw/.openclaw/workspace/** — בפרט:
   MEMORY.md / HEARTBEAT.md / AGENTS.md / SOUL.md / CHANNELS.md / TOOLS.md
   /workspace/state/* / /workspace/brands/* / /workspace/content/*
   הם **לא חלק מהמשימה הזאת**. ההקשר היחיד שלך הוא ה-prompt הזה.

🚫 **אסור לדווח על מצב המערכת** — לא cron jobs, לא Telegram Chat ID,
   לא integrations מחוברות, לא plugins disabled, לא config warnings.
   זה לא market research. זו תמיכה טכנית — לא המשימה שלך.

🚫 **אסור להתחיל בתשובה מתאר** "מה אני יודע" / "מה אני רואה" / "Session
   חדש" / "נתחיל מחדש". התחל ישר עם התוצאה — מתחרים, keywords, וכו'.

חוקים תפעוליים:
- **מקסימום 6 חיפושים בסך הכל** — לאחר מכן עצור וכתוב את הדוח הסופי המלא.
- אל תדקלם מה אתה מתכנן לחפש — פשוט בצע את החיפוש או כתוב את הדוח.
- אחרי שאספת מספיק מידע, התשובה הבאה שלך חייבת להיות **הדוח המלא בפורמט שבוקש**, לא עוד חיפוש ולא עוד הערה.
- כתוב הכל כאן בתשובה — לא בקובץ
- בעברית בלבד (מונחים מקצועיים באנגלית מותרים)
- לכל עובדה — ציין מקור (URL, שם אתר, או שם מחקר)
- זו משימה חדשה לגמרי — לא ראית אותה קודם. אל תאמר "כבר עניתי" — ענה מחדש.`

// Tool hint helpers — pick the right tool description based on what's
// available on the VPS, so the prompt accurately reflects the agent's
// capabilities.
function searchToolHint(tools: PromptOpts['tools']): string {
    return tools.hasBrave
        ? `השתמש ב-brave_search MCP tool. בצע לפחות 5 חיפושים נפרדים בעברית ובאנגלית.`
        : `השתמש ב-web_search. בצע לפחות 5 חיפושים נפרדים.`
}
function crawlToolHint(tools: PromptOpts['tools']): string {
    return tools.hasFirecrawl
        ? `\nהשתמש ב-firecrawl MCP לסריקת אתרי מתחרים — בדוק pricing pages, about pages, features.`
        : ''
}
function dfsToolHint(tools: PromptOpts['tools']): string {
    return tools.hasDataforseo
        ? `השתמש ב-dataforseo MCP tool לנפחי חיפוש אמיתיים, difficulty, CPC.`
        : `הערך difficulty (low/medium/high) על סמך כמות תוצאות ואיכות התחרות ב-SERP.`
}

// ────────────────────────────────────────────────────────────────────────────
// competitor_landscape (was stage 1)
// ────────────────────────────────────────────────────────────────────────────

export function buildCompetitorLandscapePrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, feedback, tools, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)
    const competitors = answers.competitors as string | undefined

    return {
        agentId: 'sayer',
        useDirectApi: false,
        minLength: 2000,
        prompt: `# משימה: גילוי מתחרים + SERP עבור "${businessName}"

## תיאור העסק
${businessDesc}
${competitors ? `\nמתחרים שציין המשתמש: ${competitors}` : ''}
${prodBlk ? `\n## המוצרים/שירותים של ${businessName} (כל אחד בנפרד — חשוב לניתוח תחרותי!)\n${prodBlk}\n` : ''}
${haBlock}
## הוראות
${searchToolHint(tools)}${crawlToolHint(tools)}

חפש ומצא (בסדר הזה):
1. **5 מתחרים ישירים** — שמציעים פתרון דומה לאותו קהל. לא כלים כלליים (כמו HubSpot) אלא מתחרים שנלחמים על אותו לקוח.
2. **SERP Deep-Dive** — לכל מתחרה: איזה URL שלו מופיע ב-Top 10 של גוגל? על איזו מילת מפתח? באיזה מיקום? איזה סוג דף (מאמר, landing, hub)?
3. **Content Gaps** — מה המתחרים **לא** כוסו (נושאים, שאלות, זוויות)?
4. **נוכחות דיגיטלית של "${businessName}"** — חפש את השם בגוגל, ברשתות חברתיות, ב-G2/Capterra/ProductHunt
5. **Why Now** — 3 גורמי timing (מה השתנה ב-2026 שיוצר חלון הזדמנות?)

## פורמט תשובה (חובה)
### מתחרים ישירים
#### 1. [שם המתחרה]
- **URL:** [קישור]
- **מה עושים:** [תיאור קצר]
- **טווח מחירים:** [מספרים ומטבע]
- **חוזקות:** [2-3 נקודות]
- **חולשות:** [2-3 נקודות — במיוחד מול ${businessName}]
- **נוכחות דיגיטלית:** [בלוג? תכיפות? רשתות?]
- **השוואה per SKU:** ${prodBlk ? 'לכל מוצר של ' + businessName + ' — מה האלטרנטיבה אצל המתחרה? מי זול יותר/יקר יותר/חסר בכלל?' : 'השוואה כללית'}
- **SERP — הדירוגים שלהם:**
  | מילת מפתח | מיקום | URL ספציפי | סוג דף | איכות/עומק |
  |---|---|---|---|---|
  | ... | #X | ... | מאמר 2000 מילה | חזק/בינוני/חלש |
  (לפחות 3 מילות מפתח שמתחרה זה מדורג עליהן)
- **Content Gaps אצל המתחרה:** [מה הוא לא מכסה?]
- **מקור:** [URL]
(חזור ל-5 מתחרים)

### נוכחות דיגיטלית — ${businessName}
- **אתר:** [מה מוצאים]
- **G2/Capterra/ProductHunt:** [יש דף? ביקורות?]
- **רשתות חברתיות:** [נוכחות? תדירות?]
- **SEO:** [מופיע על אילו keywords? מיקום?]
- **ציון כולל:** X/10

### Content Gaps — הזדמנויות ייחודיות
| נושא/זווית | למה חסר בשוק | רמת קושי להיכנס |
|---|---|---|
| ... | ... | נמוך/בינוני/גבוה |
(לפחות 5 gaps)

### Why Now? — ניתוח Timing
1. **[גורם 1]** — [הסבר + מקור] — איך זה משפיע על ${businessName}
2. **[גורם 2]** — ...
3. **[גורם 3]** — ...
(כל גורם עם תאריך/מחקר/מקור)

### טרנדים בתחום
1. **[טרנד]** — [הסבר + מקור: שם מחקר/URL + תאריך]
2. ...
3. ...
${feedbackLine}
${RULES}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// seo_keyword_research (was stage 2)
// ────────────────────────────────────────────────────────────────────────────

export function buildSeoKeywordResearchPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, feedback, tools, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const platforms = answers.platforms as string | undefined

    return {
        agentId: 'sayer',
        useDirectApi: false,
        minLength: 1000,
        prompt: `# משימה: מחקר מילות מפתח עבור "${businessName}"
${haBlock}
## הוראות
קרא את research-data/RESEARCH_STAGE1.md (תוצאות שלב 1 — מתחרים).
${dfsToolHint(tools)}
${searchToolHint(tools)}

מצא (בסדר הזה):
1. **15 מילות מפתח** (עברית + אנגלית) — ממוקדות לתחום של ${businessName}
2. **SERP Position Analysis** — לכל מילה: **מי מדורג בטופ 3**? באיזה URL ספציפי? מה **אורך המאמר** שם? איך ${businessName} יכול לעקוף?
3. **שאלות נפוצות** (10) — שאנשים שואלים בגוגל
4. **Long-tail keywords** (10) — ספציפיות עם כוונת רכישה גבוהה
5. **Real Gap Analysis** — 3 מילות מפתח ש**אף אחד** מהמתחרים לא מכסה
${platforms ? `\nפלטפורמות: ${platforms}` : ''}

## פורמט תשובה (חובה)
### מילות מפתח ראשיות — עם ניתוח SERP
לכל מילה — טבלה עם 3 תוצאות טופ 3:

**מילה 1: [מילה עברית] / [מילה אנגלית]**
- **כוונה:** מסחרית/מידעית/ניווטית
${tools.hasDataforseo ? '- **Volume/Difficulty/CPC:** [מספרים מ-DataForSEO]' : '- **Difficulty משוערת:** low/medium/high'}
- **טופ 3 ב-SERP:**
  | # | URL | שם אתר | אורך מאמר | זווית/זוית תוכן |
  |---|---|---|---|---|
  | 1 | [URL] | [domain] | X מילה | [מה הזווית] |
  | 2 | ... | ... | ... | ... |
  | 3 | ... | ... | ... | ... |
- **איך לעקוף:** [מה צריך לעשות כדי להיכנס לטופ 10 — אורך, זווית, עומק]
- **עדיפות:** 🔴/🟡/🟢

(חזור ל-15 מילות מפתח — לפחות 10 עם ניתוח SERP מלא)

### שאלות נפוצות (People Also Ask / FAQ)
לכל שאלה: כוונה + ${tools.hasDataforseo ? 'volume' : 'תחרות'} + **מי עונה עליה כיום בעברית** + גודל ה-gap

1. **[שאלה]** — כוונה: [מידעית/מסחרית] — [volume/תחרות] — עונים: [שמות ספקים / "אין"] — Gap: [רמה]
...

### Long-Tail Keywords (BOFU — Bottom of Funnel)
| # | מילת מפתח | שפה | כוונה | הכאב שמאחוריה | מתחרה מדורג? |
|---|---|---|---|---|---|
| 1 | ... | עברית/אנגלית | מסחרית | [הכאב] | [שם/"אין"] |

### 3 הזדמנויות מפתח (Quick Wins)
לכל הזדמנות:
1. **[מילה]**
   - למה quick win: [difficulty X, volume Y, תחרות חלשה]
   - כמה זמן להגיע לטופ 10: [הערכה]
   - נוסחת מאמר: [כותרת מוצעת + מבנה: X מילה, FAQ, טבלה השוואה]
2. ...
3. ...

### Real Content Gaps (נושאים שאף אחד לא מכסה)
| # | נושא / שאילתה | למה חסר | איך לנצל |
|---|---|---|---|
| 1 | ... | ... | ... |

${feedbackLine}
${RULES}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// audience_personas (was stage 3)
// ────────────────────────────────────────────────────────────────────────────

export function buildAudiencePersonasPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, feedback, tools, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const prodBlk = productsBlock(answers)
    const targetAudience = answers.targetAudience as string | undefined

    return {
        agentId: 'sayer',
        useDirectApi: false,
        minLength: 1500,
        prompt: `# משימה: מחקר קהל יעד + Pricing Validation עבור "${businessName}"
${haBlock}
## הוראות
קרא את research-data/RESEARCH_STAGE1.md (מתחרים) ו-research-data/RESEARCH_STAGE2.md (מילות מפתח).
${searchToolHint(tools)}${crawlToolHint(tools)}
${prodBlk ? `\n## המוצרים של ${businessName} (עובד עם כל אחד בנפרד!)\n${prodBlk}\n\n**חשוב:** לכל פרסונה — ציין איזה מוצר/ים מתאימים לה, ואם יש הבדלי WTP בין המוצרים.\n` : ''}

חפש בעומק:
1. **איפה קהל היעד מדבר** — שמות ספציפיים של קבוצות/subreddits/פורומים עם מספר חברים
2. **6+ כאבים מרכזיים** — ציטוטים אמיתיים עם מקור (URL)
3. **3 פרסונות מפורטות** — עם קשר למילות המפתח ${prodBlk ? 'ו**לכל פרסונה — איזה מוצר/ים היא קונה, ובאיזה סדר**' : ''}
4. **Pricing Validation ${prodBlk ? 'per SKU' : ''}** — חפש ראיות אמיתיות לכמה הקהל מוכן לשלם: דיונים על מחיר ב-Reddit/פורומים, מחירים של מתחרים, statistics על average SaaS spend${prodBlk ? '. **לכל מוצר בנפרד:** האם המחיר הנוכחי הגיוני? צריך לעלות/לרדת?' : ''}
5. **גודל שוק TAM/SAM/SOM** — עם מקורות${prodBlk ? ' (נפרד לכל מוצר אם הקהל שונה)' : ''}
6. **Why Now** — מה משתנה עכשיו שיוצר הזדמנות לפרסונות אלה?
${prodBlk ? '7. **Cross-sell / Upsell path** — איך המוצרים מחוברים? מי feeder של מי? (e.g. קורס → SaaS, או חבילה משותפת)' : ''}
${targetAudience ? `\nקהל יעד שצוין: ${targetAudience}` : ''}

## פורמט תשובה (חובה)
### איפה הקהל נמצא
| פלטפורמה | קבוצות/ערוצים ספציפיים | גודל משוער | רלוונטיות |
|---|---|---|---|
| פייסבוק | [שמות קבוצות] | [מספר חברים] | 🔴/🟡/🟢 |

### כאבים מרכזיים (6+)
1. **[כאב]** — "[ציטוט מדויק]" (מקור: [URL])

### פרסונה 1: [שם פיקטיבי]
- **גיל:** ...
- **תפקיד:** ...
- **גודל סגמנט בישראל:** [מספר + מקור]
- **כאבים הספציפיים:** [3 כאבים]
- **מוטיבציות:** [מה יגרום להם לשלם]
- **מילות מפתח שמחפשים:** [3 מילות מפתח מ-STAGE2]
- **איפה אונליין:** [פלטפורמות ספציפיות]

**💰 Pricing Validation:**
- **כמה משלמים היום** על פתרונות דומים: [טווח + מקור — דיון Reddit / pricing page של מתחרה]
- **WTP (Willingness to Pay):** [טווח + ראיה — ציטוט או מחקר]
- **Price sensitivity:** [גבוה/בינוני/נמוך — ראיה]
- **המלצה על price point ל-${businessName}:** [₪X-Y/חודש]

**מה ישכנע לקנות:** [משפט ממוקד]

(חזור ל-3 פרסונות — עם pricing validation לכל אחת)

### Why Now? — Timing Analysis
למה הפרסונות האלה **בדיוק עכשיו** מוכנות לפתרון של ${businessName}?
1. **[גורם timing 1]** — [הסבר + מקור + תאריך]
2. **[גורם 2]** — ...
3. **[גורם 3]** — ...

### סיכום: הזדמנות השוק
- **TAM גלובלי:** [מספר + מקור — שם מחקר/חברה]
- **TAM ישראל:** [מספר + מקור]
- **SAM (נגיש):** [מספר + הסבר]
- **SOM (ריאלי לשנה):** [מספר + הסבר]
- **סגמנט #1 לתקוף:** [שם פרסונה + 3 סיבות]
${feedbackLine}
${RULES}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// positioning (NEW — was implicit in old stage 4)
// ────────────────────────────────────────────────────────────────────────────
//
// Why a separate stage: design doc moves positioning out of strategy_options
// so the user can review/edit positioning *before* generating the channel
// strategy, KPIs, budget. Single-shot strategy bundled positioning in a way
// that locked the user into one framing without a checkpoint.

export function buildPositioningPrompt(opts: PromptOpts): PromptResult {
    const { businessName, businessDesc, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const competitorContent = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 5000)
    const personasContent = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const tone = answers.tone as string | undefined

    return {
        agentId: 'menateach',
        useDirectApi: true, // analytical, no live web search needed
        minLength: 800,
        prompt: `# משימה: מיצוב + Brand Foundation עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.

## תיאור העסק
${businessDesc}
${tone ? `\n## טון רצוי\n${tone}` : ''}

## תמצית המתחרים (משלב competitor_landscape)
${competitorContent || 'לא זמין'}

## תמצית הפרסונות (משלב audience_personas)
${personasContent || 'לא זמין'}
${haBlock}
## הוראות
אתה brand strategist בכיר. בנה Brand Foundation שעונה על: **למה ${businessName}? למה דווקא הם? ולמה דווקא עכשיו?**

זה לא marketing fluff — כל החלטה צריכה להיגזר מהמתחרים והפרסונות שלמעלה.

## פורמט תשובה (חובה)

### Mission (משימה)
משפט אחד — **למה אנחנו קמים בבוקר**. לא "to be the leading X" — מה הבעיה שאנחנו פותרים בעולם?

### Positioning Statement
פורמט: **עבור [פרסונה] שמתמודדים עם [כאב], ${businessName} הוא [קטגוריה] שעוזר ל[תוצאה], בניגוד ל[מתחרה ראשי] שעושים [חולשה].**

### Value Propositions (3 בדיוק)
לכל אחת:
1. **[שם הצעת ערך]**
   - **למי:** [פרסונה ספציפית]
   - **התוצאה:** [מה הם מקבלים]
   - **למה אנחנו:** [למה לא מתחרה X]
   - **הוכחה:** [אם יש — נתון/ציטוט מהמחקר]

### Brand Archetype
1 ארכיטיפ ראשי + 1 משני (Hero / Sage / Rebel / Caregiver / Magician / וכו').
**למה דווקא אלה:** [קישור לפרסונות ולמתחרים]

### Voice & Tone
| מימד | מה כן | מה לא | דוגמה במשפט |
|---|---|---|---|
| פורמליות | ... | ... | "..." |
| הומור | ... | ... | "..." |
| אקטיביות | ... | ... | "..." |

### Brand Promise
משפט אחד שהמותג מתחייב אליו ללקוח. נמדד — לא "the best", אלא "אנחנו תמיד [מדיד]".

### Differentiation Map
| מתחרה ראשי | מה הם משדרים | מה אנחנו משדרים | ההבדל לפרסונה |
|---|---|---|---|
| [שם] | ... | ... | ... |
| [שם] | ... | ... | ... |
| [שם] | ... | ... | ... |
(לפחות 3 מתחרים מהמחקר)

### Anti-Positioning
מה ${businessName} **לא** רוצה להיות? אילו לקוחות לא רלוונטיים? באיזה ערוץ לא להופיע?
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// strategy_options (was stage 4)
// ────────────────────────────────────────────────────────────────────────────
//
// Reads competitor_landscape + seo_keyword_research + audience_personas +
// positioning. Pulls them through the reader to support legacy stage1..3
// during the migration window.

export function buildStrategyOptionsPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, rd, feedback, historicalAssetsBlock } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    const haBlock = historicalAssetsBlock || ''
    const s1 = (getStageContent(rd, 'competitor_landscape') || '').substring(0, 5000)
    const s2 = (getStageContent(rd, 'seo_keyword_research') || '').substring(0, 5000)
    const s3 = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const positioning = (getStageContent(rd, 'positioning') || '').substring(0, 3000)
    const budget = answers.budget as string | undefined
    const marketingGoals = answers.marketingGoals as string | undefined

    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 1500,
        prompt: `# משימה: ניתוח ערוצים ואסטרטגיה עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.
- אל תאמר "כבר עניתי" — ענה מחדש.

## תמצית מחקר — מתחרים
${s1 || 'לא זמין'}

## תמצית מחקר — מילות מפתח
${s2 || 'לא זמין'}

## תמצית מחקר — קהל יעד
${s3 || 'לא זמין'}

${positioning ? `## מיצוב + Brand Foundation\n${positioning}\n` : ''}
${budget ? `## תקציב\n${budget}` : ''}
${marketingGoals ? `## מטרות שיווק\n${marketingGoals}` : ''}
${haBlock}
## הוראות
אתה senior מרקטולוג עם 15 שנות ניסיון. נתח את הנתונים ובנה אסטרטגיית ערוצים:
1. **FIRST WIN CHANNEL** (הכי חשוב) — בחר ערוץ אחד + פעולה אחת + פרסונה אחת שיביאו את 5 הלקוחות הראשונים. פוקוס מוחלט.
2. **Competitive activity deep-dive לכל ערוץ** — מה המתחרים מפרסמים? מה ה-engagement שלהם? מה ה-hashtags/topics שעובדים?
3. **Cross-references חובה** — כל ערוץ קשור לפרסונה ספציפית + מילות מפתח ספציפיות מהשלבים הקודמים.
4. **תוכנית 30 ימים עם תאריכים ספציפיים** — לא "שבוע 1" אלא "יום 1-3"

## פורמט תשובה (חובה)

### 🎯 FIRST WIN CHANNEL — הערוץ #1 ל-5 הלקוחות הראשונים
**זה הכי חשוב. עונה על: "איפה להתמקד עכשיו?"**

- **ערוץ:** [שם]
- **למה דווקא זה:** [3 סיבות מתוך הנתונים]
- **פרסונה:** [שם + מאיפה מהשלב 3]
- **מילות מפתח:** [2-3 מהשלב 2]
- **פעולה אחת ספציפית:** [מה בדיוק לעשות היום, לא תיאוריה]
- **Expected outcome:** [5 לקוחות תוך X ימים]
- **למה לא ערוץ אחר עכשיו:** [פוקוס > splay]

### ערוצים נוספים (לפי עדיפות — אחרי שה-First Win עובד)

#### 2. [שם הערוץ] ⭐⭐⭐ קריטי
- **למה (על סמך המחקר):** [קשר ישיר לשלבים 1-3 עם ציטוטים]
- **פרסונה מרכזית:** [שם]
- **מילות מפתח:** [3 מהשלב 2]
- **🔍 Competitive Activity Deep-Dive:**
  | מתחרה | מה הם מפרסמים | תכיפות | Engagement | הזווית שלהם | מה חסר |
  |---|---|---|---|---|---|
  | [שם] | [דוגמה + URL] | [3/שבוע] | [לייקים/תגובות] | [זווית] | [הזדמנות] |
- **Content formula:** [אורך, תדירות, סוג פוסט]
- **תדירות:** [X פוסטים/שבוע]
- **עלות משוערת:** ₪[מספר] / חודש
- **ROI צפוי:** [מספרים מוחשיים: X leads, Y visits, Z conversions תוך 30/60/90 ימים]
(חזור ל-4 ערוצים נוספים)

#### ❌ מה לא לעשות עכשיו
| ערוץ | למה לא | מתי כן (חודש X) |
|---|---|---|

### פאנל שיווק — פרסונה #1
| שלב | ערוץ | פעולה ספציפית | Trigger/CTA | מדד |
|---|---|---|---|---|
| Awareness | ... | ... | ... | [מספר] |
| Consideration | ... | ... | ... | [מספר] |
| Conversion | ... | ... | ... | [מספר] |
| Retention | ... | ... | ... | [מספר] |

### תוכנית פעולה — 30 ימים (עם ימים ספציפיים)
#### ימים 1-3 — FIRST WIN SETUP
1. [פעולה — קונקרטית, ניתנת לביצוע היום]
2. ...
#### ימים 4-10
3. ...
#### ימים 11-20
4. ...
#### ימים 21-30
5. ...

### KPIs ל-90 ימים (שמרניים / ריאליים / אופטימיים)
| מדד | 30 יום — שמרני | 30 יום — ריאלי | 90 יום — ריאלי | 90 יום — אופטימי |
|---|---|---|---|---|
| ביקורים אורגניים | ... | ... | ... | ... |
| לידים | ... | ... | ... | ... |
| לקוחות משלמים | ... | ... | ... | ... |
| MRR | ₪... | ₪... | ₪... | ₪... |
| CAC | ₪... | ₪... | ₪... | ₪... |
| LTV:CAC ratio | ... | ... | ... | ... |

### Budget Allocation (לפי תקציב זמין)
| תקציב זמין | ערוץ #1 | ערוץ #2 | ערוץ #3 | רזרבה |
|---|---|---|---|---|
| ₪1,000/חודש | ₪... | ₪... | ₪... | ₪... |
| ₪3,000/חודש | ₪... | ₪... | ₪... | ₪... |
| ₪5,000/חודש | ₪... | ₪... | ₪... | ₪... |

### הסיכונים וההקלות (Risks & Mitigations)
| סיכון | הסתברות | אימפקט | הקלה |
|---|---|---|---|
| [סיכון] | נמוך/בינוני/גבוה | נמוך/בינוני/גבוה | [פעולה] |
(לפחות 3 סיכונים מרכזיים)

${feedbackLine}
${RULES}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// validation (was stage 5) — two modes: ai_sim (default) + real_interviews
// ────────────────────────────────────────────────────────────────────────────

export function buildValidationPrompt(opts: PromptOpts): PromptResult {
    const { businessName, answers, rd, feedback } = opts
    const feedbackLine = feedback ? `\nהערות המשתמש: ${feedback}` : ''
    // validationMode passed via answers.validationMode (set by user toggle).
    const mode = (answers.validationMode as string | undefined) || 'ai_sim'

    const personasContent = (getStageContent(rd, 'audience_personas') || '').substring(0, 5000)
    const strategyContent = (getStageContent(rd, 'strategy_options') || '').substring(0, 6000)
    // Split strategy across two summary slots to match legacy prompt structure.
    const strategyHalf1 = strategyContent.substring(0, 3000)
    const strategyHalf2 = strategyContent.substring(3000)

    if (mode === 'real_interviews') {
        return {
            agentId: 'menateach',
            useDirectApi: true,
            minLength: 1200,
            prompt: `# משימה: סקריפט לראיונות אמת — Mom Test Style

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.

## תמצית המחקר
### פרסונות
${personasContent || 'לא זמין'}

### אסטרטגיה
${strategyHalf1}
${strategyHalf2}

## הוראות
הכן סקריפט לראיון customer discovery של 20 דקות ל-5 לקוחות פוטנציאליים, לפי עקרונות "The Mom Test":
- שאלות על **עבר** (מה כבר עשו), לא עתיד (מה יעשו)
- שאלות על **התנהגות**, לא על דעות
- אל תזכיר את המוצר של ${businessName} מוקדם מדי

## פורמט תשובה
### מי לראיין (קהל יעד)
- **פרסונה #1:** [שם + איפה למצוא אותם + איך לפנות]

### הסקריפט (20 דקות)
#### פתיחה (2 דקות)
"[טקסט מדויק בעברית]"

#### חלק 1: הבנת ההקשר (5 דקות)
1. **שאלה:** "[שאלה ממוקדת עבר]"
   - למה השאלה: [מה אנחנו מוצאים]
   - red flag: [מה לא לעשות]
2. ...

#### חלק 2: כאבים ופתרונות נוכחיים (7 דקות)
3. ...

#### חלק 3: אימות ההזדמנות (5 דקות)
5. ...

#### סגירה (1 דקה)
"[טקסט]"

### מה לחפש בתשובות
| סיגנל חיובי | סיגנל שלילי | משמעות |
|---|---|---|
| [ציטוט לדוגמה] | [ציטוט לדוגמה] | [מה עושים] |

### איך לנתח אחרי 5 ראיונות
1. **אימות כאב:** X מתוך 5 הזכירו [הכאב] ← [אמת / להמשיך לבדוק]
2. **WTP:** ממוצע X שילמו/משלמים ₪Y על פתרונות דומים
3. **סגמנט:** איזה פרסונה הגיבה הכי חזק

### Template לתיעוד (Google Sheet מבנה)
| ראיון # | שם/תפקיד | כאב #1 | כאב #2 | משלם היום על | WTP עבור פתרון | סיגנלים חיוביים | תגובה למוצר |
|---|---|---|---|---|---|---|---|

### Confidence Threshold
- **60%+ מהראיונות מאמתים את הכאב** → האסטרטגיה מאומתת, המשך
- **30-60%** → לבדוק שוב את הפרסונה, ייתכן שהגדרת קהל שגויה
- **<30%** → חזור לשלבים 1-3 עם pivot
${feedbackLine}`,
        }
    }

    // Default: AI-simulated validation
    return {
        agentId: 'menateach',
        useDirectApi: true,
        minLength: 1500,
        prompt: `# משימה: AI-Simulated Customer Validation עבור "${businessName}"

## חשוב
- זו משימה חדשה. לא ראית אותה קודם.
- אל תקרא קבצים. השתמש רק בנתונים המסופקים כאן.
- אתה משחק תפקיד של **3 פרסונות שונות** ועונה בשם כל אחת.

## תמצית המחקר
### פרסונות
${personasContent || 'לא זמין'}

### אסטרטגיה
${strategyHalf1}
${strategyHalf2}

## הוראות
דמה 3 ראיונות customer discovery. לכל פרסונה (מהשלב 3):
1. **היכנס לתפקיד** — חשוב כמו הפרסונה, לא כמו AI
2. ענה על 10 שאלות validation — ביקורתית, אמיתית, לא "כן כן כן"
3. **50% מהתשובות צריכות להיות קריטיות** — אחרת זה לא validation

אחרי 3 ראיונות — Cross-Validation Matrix: מה **אומת**, מה **נפל**, מה **לא ברור**.

## פורמט תשובה

### ראיון 1: פרסונה [שם]

**פרופיל:** [תמצית פרסונה — גיל, תפקיד, כאבים]

**Q1: ספר לי על [הכאב הראשי] — איך זה נראה בפועל אצלך?**
*[תשובה כפרסונה — ציטוט בגוף ראשון, 2-3 משפטים אמיתיים]*

**Q2: מה ניסית לעשות כדי לפתור את זה עד היום?**
*[תשובה]*

**Q3: כמה שילמת על פתרונות קודמים? מה הרגיז אותך בהם?**
*[תשובה עם מספרים]*

**Q4: ${businessName} מציע [הצעת ערך]. מה התגובה הראשונית שלך? (כולל ביקורת!)**
*[תשובה ביקורתית]*

**Q5: מה לא ברור? מה מעורר חשד?**
*[תשובה]*

**Q6: איך תשווה בין ${businessName} ל-[מתחרה מהשלב 1]?**
*[תשובה]*

**Q7: במחיר של ₪X/חודש — התשובה שלך: (בחר: אקנה מיד / אשקול / יקר מדי)?**
*[תשובה עם הסבר]*

**Q8: מה יגרום לך לומר "לא" סופית?**
*[תשובה]*

**Q9: איפה חיפשת פתרון כזה — מה היו מילות המפתח?**
*[תשובה — אמיתית לפרסונה]*

**Q10: מי עוד היית מתייעץ לפני הרכישה?**
*[תשובה]*

**🔴 Red Flags שעלו:** [מה הפרסונה חשפה שמעורר דאגה]
**🟢 Green Flags:** [מה חיזק את ההשערה]

(חזור ל-ראיון 2 ו-3 עם 2 הפרסונות האחרות)

### Cross-Validation Matrix
| השערה (מהאסטרטגיה) | פרסונה 1 | פרסונה 2 | פרסונה 3 | Status |
|---|---|---|---|---|
| הכאב X הוא הכאב #1 | ✅/❌/🟡 | ... | ... | ✅ מאומת / ❌ נפל / 🟡 לא ברור |
| WTP של ₪X/חודש ריאלי | ... | ... | ... | ... |
| הערוץ Y הוא המתאים | ... | ... | ... | ... |
| הצעת הערך "Z" משכנעת | ... | ... | ... | ... |
| הפרסונה Φ היא הסגמנט #1 | ... | ... | ... | ... |
(לפחות 7 השערות)

### Confidence Score
- **השערות מאומתות:** X מתוך Y = Z%
- **Score כללי:** [0-100]
- **המלצה:**
  - 80+ → המשך לאסטרטגיה
  - 60-80 → pivot קטן — עדכן [מה]
  - <60 → חזור למחקר — [איזה שלב]

### Top 3 Blindspots שהתגלו
1. **[Blindspot]** — [איך התגלה + מה לעשות]
2. ...
3. ...

### המלצות אקשן מידיות
1. **[פעולה קונקרטית]** — על סמך [ממצא]
2. ...
3. ...
${feedbackLine}`,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatch helper — used by per-stage controllers to get prompt by id.
// New prompts (aeo_visibility, social_landscape, email_competitor_audit)
// belong here when they ship (Phase 4).
// ────────────────────────────────────────────────────────────────────────────

export function buildPromptForStage(stageId: StageId, opts: PromptOpts): PromptResult | null {
    switch (stageId) {
        case 'competitor_landscape':   return buildCompetitorLandscapePrompt(opts)
        case 'seo_keyword_research':   return buildSeoKeywordResearchPrompt(opts)
        case 'audience_personas':      return buildAudiencePersonasPrompt(opts)
        case 'positioning':            return buildPositioningPrompt(opts)
        case 'strategy_options':       return buildStrategyOptionsPrompt(opts)
        case 'validation':             return buildValidationPrompt(opts)
        // Phase 4 stages (live integrations) + intent wrappers handle their
        // own prompt construction inside their per-stage controller.
        default: return null
    }
}