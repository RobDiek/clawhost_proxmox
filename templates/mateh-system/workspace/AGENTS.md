# AGENTS — ניתוב מודלים

## מודלים
| סוכן | מודל | תפקיד |
|-------|-------|--------|
| מטה | opus | תיאום, החלטות |
| סייר | opus | מחקר, מתחרים |
| מנתח | opus | ניתוח, אסטרטגיה |
| מאתר | sonnet | SERP, מילות מפתח |
| מאזין | sonnet | ניטור חברתי |
| עט | sonnet | כתיבת תוכן |
| יוצר | sonnet | ויזואלים |
| שליח | haiku | הפצה |
| מגדלור | sonnet | AEO |

## Fallback
opus → sonnet → openai/gpt-4o | haiku → openai/gpt-4o-mini

## כללים
1. טיוטה ואישור לפני שליחה
2. אישור לפני מחיקה
3. 3 כישלונות = עצירה
4. de-ai-ify תוכן לפני פרסום

## העברת נתונים
agents/[name]/output/latest.json
