# AGENTS — ניתוב מודלים (MATEH)

## עיקרון
השתמש במודל הזול ביותר שמתאים למשימה. יקר = רק כשהלקוח רואה את התוצאה.

## ניתוב סוכנים
| סוכן | מודל | סיבה |
|-------|-------|-------|
| מטה (orchestrator) | sonnet | תיאום — לא client-facing |
| סייר (מחקר) | haiku | פרסור, איסוף נתונים |
| מנתח (אסטרטגיה) | opus | חשיבה מורכבת |
| מאתר (SEO) | haiku | ניתוח טכני |
| מאזין (חברתי) | haiku | ניטור, סיווג |
| עט (תוכן) | sonnet | כתיבה בעברית — הלקוח רואה |
| יוצר (ויזואלים) | haiku | תיאור לתמונה |
| שליח (הפצה) | haiku | פורמט + שליחה |
| מגדלור (AEO) | sonnet | ביקורת חודשית — נראית ללקוח |

## ניתוב cron jobs
| משימה | מודל | סיבה |
|-------|-------|-------|
| Daily Brief (יומי) | haiku | סיכום שגרתי |
| דוח מתחרים (שבועי) | sonnet | ניתוח + כתיבה |
| ביקורת AEO (חודשי) | sonnet | ניתוח מעמיק |

## כללים
1. טיוטה ואישור לפני שליחה
2. אישור לפני מחיקה
3. 3 כישלונות = עצירה ודיווח
4. de-ai-ify תוכן לפני פרסום — אל תכתוב כמו AI
5. אם מודל נוכחי לא מספיק — המערכת תעבור ל-fallback אוטומטית
6. opus — רק למשימות מורכבות (אסטרטגיה, מחקר עמוק)

## Fallback
ברירת מחדל: sonnet. אם לא זמין — המערכת עוברת אוטומטית ל-haiku, ואם גם הוא לא זמין — ל-gpt-4o. סוכנים ספציפיים רשומים עם מודלים ייעודיים (ראה טבלה למעלה).

## SEO/AEO Pipeline (6 שלבים)

| שלב | סוכן | מקור נתונים | פעולה | מודל |
|-----|------|-------------|-------|------|
| Research | סייר | DataForSEO MCP, Brave, Firecrawl | מחקר gaps + keywords | haiku |
| Strategy | מנתח | research output | תוכנית תוכן + ROI scoring | opus |
| Write | עט | content plan | כתיבת תוכן + schema + AI nugget | sonnet |
| Audit | מאתר | Firecrawl, GSC | technical SEO audit + llms.txt | haiku |
| Monitor | מגדלור | GSC, DataForSEO AI Visibility | ranking + AI citation tracking | haiku |
| Fix | עט+שליח | monitoring alerts | content refresh + republish | sonnet |

### כללי SEO content
- Entity consensus: כל עובדה מאומתת מ-2+ מקורות
- 500-token chunks: מותאם ל-Google AI retrieval window
- AI Summary Nugget: 200 תווים בראש כל עמוד — לציטוט ב-AI
- Schema.org: FAQ, HowTo, Article — נוצר אוטומטית
- De-AI-ify: תוכן לא נשמע כמו AI כתב אותו (כלל #4)

## העברת נתונים
agents/[name]/output/latest.json

## ניהול זיכרון (Memory Management)
- **MEMORY.md** — מוגבל ל-80 שורות. אם גדל — סכם עובדות ישנות ומחק.
- **memory/YYYY-MM-DD.md** — קבצים מעל 30 יום → סכם עיקר ל-MEMORY.md → מחק.
- **Mem0** (vector): נשמר אוטומטית. כפילויות מסוננות. אין צורך בניהול ידני.
- **heartbeat memory cleanup**: פעם בשבוע, ב-heartbeat — בדוק גודל memory/ ונקה ישנים.
