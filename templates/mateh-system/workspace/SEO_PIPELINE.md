# SEO/AEO Pipeline — 6 שלבים

## סקירה
Pipeline אוטומטי לייצור תוכן שמדורג ב-Google **ו**מצוטט ב-AI (ChatGPT, Perplexity, Claude).
Human-in-the-loop: אישור חובה לפני פרסום.

## שלבים

### 1. Research (סייר)
**מטרה:** מצא מה לכתוב ולמה.
**כלים:** DataForSEO MCP, Firecrawl MCP, Brave Search, GSC MCP
**Output:** `agents/sayer/output/latest.json`

- Keyword gaps vs מתחרים
- SERP analysis: מי מדורג, איזה סוג תוכן
- Competitor crawl: מבנה תוכן, internal linking
- שאלות אמיתיות מ-Reddit/HN/Quora
- GSC: impressions ללא קליקים = הזדמנויות
- **Entity Consensus**: כל עובדה מסומנת verified/single/contradicted

### 2. Strategy (מנתח)
**מטרה:** נתח את המחקר, בנה תוכנית תוכן.
**Input:** agents/sayer/output/latest.json
**Output:** `agents/menateach/output/latest.json`

- סינון: רק verified claims
- Keyword clustering לפי intent (informational/transactional/navigational)
- ROI scoring: estimated traffic × conversion potential
- תוכנית תוכן מדורגת: מה לכתוב קודם
- Telegram: סיכום + אישור

### 3. Write (עט)
**מטרה:** כתוב תוכן שמדורג ב-Google ומצוטט ב-AI.
**Input:** agents/menateach/output/latest.json + BRAND.md
**Output:** `agents/et/output/latest.json`

**מבנה עמוד:**
1. AI Summary Nugget (200 תווים) — לציטוט מיידי ב-AI
2. Intro + H1 + keywords טבעי
3. Body: sections עם H2, כל פסקה ≤ 500 tokens
4. Internal links (3-5)
5. CTA ברור
6. Schema.org JSON-LD מצורף (Article/FAQ/HowTo)

**כללי Entity Consensus:**
- כל claim מרכזי = 2+ מקורות verified
- De-AI-ify חובה (כלל #4)
- עברית טבעית, לא תרגום מאנגלית

### 4. Audit (מאתר)
**מטרה:** ביקורת טכנית של האתר.
**כלים:** Firecrawl MCP, GSC MCP, DataForSEO PageSpeed
**Output:** `agents/meater/output/latest.json`

בדיקות:
- קישורים שבורים (404, 5xx)
- כפילויות title/meta description
- Core Web Vitals (LCP, FID, CLS)
- Schema.org validation
- llms.txt — קיים? מעודכן?
- Mobile-friendliness
- Index coverage (GSC)

### 5. Monitor (מגדלור)
**מטרה:** מעקב אחרי ביצועי SEO ונראות AI.
**כלים:** GSC MCP (daily), DataForSEO AI Visibility (monthly), Brave Search

**יומי:** ירידות > 3 מיקומים → alert ב-Telegram
**שבועי:** top 10 queries, trends, הזדמנויות
**חודשי:** AEO Deep Audit — ציטוטים ב-AI, entity consensus check, AEO score

**Alerts:**
- ירידה > 3 מיקומים → Telegram + trigger Stage 6
- דף נפל מאינדוקס → Telegram
- AI אומר עלינו מידע שגוי → Telegram + תוכנית תיקון

### 6. Fix (עט + שליח)
**מטרה:** תיקון אוטומטי של ירידות.
**Trigger:** מגדלור זיהה בעיה

**תהליך:**
1. **Detect** — מגדלור מזהה ירידה
2. **Diagnose** — מנתח מנתח סיבה (מתחרה עדכן? אלגוריתם? תוכן ישן?)
3. **Fix** — עט מעדכן תוכן: מידע טרי, E-E-A-T חזק יותר, entity consensus
4. **Publish** — שליח מפרסם גרסה מעודכנת (עם אישור)
5. **Verify** — מגדלור בודק אחרי 7 ימים: חזר למיקום?

---

## כלים נדרשים

| כלי | סטטוס | חיוני? |
|-----|--------|--------|
| GSC MCP | Dashboard → Integrations | כן — בסיס המעקב |
| DataForSEO MCP | Dashboard → Integrations | מומלץ — מחקר + AI visibility |
| Firecrawl MCP | Dashboard → Integrations | מומלץ — audit + competitor crawl |
| Brave Search MCP | Dashboard → Integrations | כן — כבר מותקן |
| WordPress MCP | Dashboard → Integrations | כן — פרסום |

## עלויות
- GSC: חינם
- DataForSEO: ~$5-15/חודש (500-1500 queries)
- Firecrawl: 500 דפים/חודש חינם
- Brave Search: $5/חודש חינם

## תזמון

| משימה | תדירות | סוכן | מודל |
|-------|---------|-------|------|
| GSC Daily Check | יומי א-ה | מגדלור | haiku |
| SEO Weekly Digest | שבועי (יום ד) | מגדלור+מנתח+עט | sonnet |
| AEO Deep Audit | חודשי (1 או 15) | מגדלור+סייר | sonnet |
| Content Pipeline | on-demand | סייר→מנתח→עט→שליח | mixed |
| Ranking Recovery | trigger-based | מנתח→עט→שליח→מגדלור | sonnet |
