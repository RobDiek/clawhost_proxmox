# ClawFlow Privacy Policy — Additions for OAuth Verification

**Цель:** Эти секции **добавить** в существующий `clawflow.flowmatic.co.il/privacy`. Покрывают:
- Google OAuth scopes (текущие + future)
- Data retention periods (Google требует explicit)
- Sub-processors disclosure (Anthropic, DataForSEO, etc.)
- Israeli PPL 2025 compliance
- Future scopes coverage (Meta, Microsoft, LinkedIn, TikTok, CRM, payment processors)

---

## הוסיפו את הסעיפים הבאים לפוליסה הקיימת (לפני "שינויים במדיניות")

---

### 4. אינטגרציות צד-שלישי דרך OAuth

ClawFlow מאפשרת לכם לחבר חשבונות צד-שלישי כדי שהפלטפורמה תוכל לקרוא נתונים, להציע המלצות ולבצע פעולות אוטומציה בשמכם. כל אינטגרציה דורשת **אישור מפורש** דרך OAuth של ספק השירות. אנו מבקשים את הרשאות המינימום הנדרשות בלבד (principle of least privilege).

#### 4.1 שירותי Google (Google APIs)

כאשר אתם מחברים את חשבון Google שלכם, אתם עשויים להעניק לנו את ההרשאות הבאות (לפי שירות):

| Scope | מטרה | קריאה/כתיבה | שמירת נתונים |
|---|---|---|---|
| `analytics.readonly` | קריאת נתוני Google Analytics 4 (אירועי המרה, מקורות תנועה, פילוח קהל) להצגת המלצות אופטימיזציה | קריאה בלבד | aggregated metrics בלבד, 30 ימים |
| `tagmanager.readonly` | קריאת תצורת Google Tag Manager (containers, tags, triggers, variables) להצגת סטטוס התקנה ודיאגנוסטיקה | קריאה בלבד | metadata בלבד, 30 ימים |
| `tagmanager.edit.containers` | יצירה אוטומטית של tags קריטיים (Conversion Linker, GCLID Capture, Google Ads, GA4) כשאתם לוחצים על כפתור "Mazhir GTM Auto-Setup". אנחנו לא מבצעים versioning ולא מפרסמים — אתם מפרסמים workspace בעצמכם דרך ממשק GTM | יצירה (לא מחיקה / שינוי tags שלכם) | event log של פעולות שלנו, 90 ימים |
| `adwords` (Google Ads API) | קריאת ביצועי קמפיינים (קליקים, חשיפות, המרות, search terms) והכנת campaign drafts. ביצוע (השקה / שינוי תקציב) דורש אישור מפורש בכל פעם | קריאה + יצירה (campaigns ב-PAUSED state) | aggregated metrics, 90 ימים |
| `webmasters.readonly` (Search Console) | קריאת ביצועי חיפוש אורגני (impressions, clicks, CTR, position per query) להצגת המלצות SEO | קריאה בלבד | aggregated metrics, 90 ימים |
| `userinfo.email` + `openid` | זיהוי החשבון המחובר (להציג איזה Google Account מחובר) | קריאה בלבד | email בלבד, עד ניתוק |
| `calendar`, `gmail.readonly`, `gmail.send`, `drive.readonly` | (אם רלוונטי — לסוכן OpenClaw Personal) ניהול לוח שנה, קריאת/שליחת מיילים, גישה לקבצים. רק אם תפעילו את הסוכן ותעניקו את ההרשאות במפורש | משתנה לפי scope | אופציונלי, 30 ימים |

**מנגנון Property/Container Picker:** לאחר OAuth, אנחנו מציגים בורר שמאפשר לכם לבחור **מפורשות** איזה GA4 property ואיזה GTM container שייכים ל-tenant הנוכחי. זאת מניעת זליגת נתונים בין לקוחות במצב agency.

#### 4.2 שירותי Meta (Facebook + Instagram)

| Scope | מטרה | שמירת נתונים |
|---|---|---|
| `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata` | פרסום אורגני בדפי Facebook, קריאת תגובות ואנליטיקס | aggregated metrics, 30 ימים |
| `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` | פרסום ב-Instagram Business, קריאת ביצועים | aggregated metrics, 30 ימים |
| `ads_read`, `ads_management` | קריאת/יצירת קמפיינים ב-Meta Ads (Facebook + Instagram). יצירה תמיד ב-PAUSED state | aggregated metrics + campaign metadata, 90 ימים |
| `business_management` | גישה לחשבון Meta Business Manager שלכם | metadata בלבד |
| `leads_retrieval` | קריאת לידים מטופסי Lead Ads ל-CRM שלכם | event log, 30 ימים |
| `whatsapp_business_management`, `whatsapp_business_messaging` | (אופציונלי) ניהול WhatsApp Business משולב | מסרים נשמרים ב-VPS שלכם בלבד |

**Pixel + Conversion API (CAPI):** ClawFlow עשויה להתקין במידת הצורך — לפי בחירתכם — Meta Pixel + CAPI server-side events. הנתונים נשלחים ישירות מ-VPS שלכם ל-Meta, לא דרך השרתים שלנו.

#### 4.3 שירותי Microsoft (Bing/LinkedIn)

| Scope | מטרה |
|---|---|
| Microsoft Advertising (Bing Ads) | קריאת/יצירת קמפיינים בחיפוש Bing |
| LinkedIn Marketing | קריאת ביצועי LinkedIn organic + Ads (B2B) |

#### 4.4 פלטפורמות נוספות (במידה ותחברו)

- **TikTok Business**: קריאת קמפיינים אורגניים + ממומנים
- **YouTube Data API**: ניהול ערוץ + ניתוח ביצועי וידאו
- **CRM** (HubSpot, Salesforce, Pipedrive, Monday, Zoho): סנכרון לידים ועסקאות
- **Email platforms** (Mailchimp, Klaviyo, ActiveCampaign): ניהול רשימות תפוצה ואוטומציות
- **E-commerce** (Shopify, WooCommerce): סנכרון קטלוג מוצרים + רכישות
- **Call tracking** (CallRail, WhatConverts): ייחוס שיחות טלפון לקמפיינים
- **Payment processors** (Pelecard, Cardcom, Tranzilla, Stripe, PayPal): קריאת אירועי תשלום ל-conversion attribution. אנחנו לא נוגעים בפרטי כרטיס אשראי — רק metadata של עסקאות (סכום, תאריך, מזהה).

#### 4.5 עקרונות גישה לכלל האינטגרציות

**Least Privilege:** אנחנו מבקשים תמיד את ה-scope הצר ביותר שמאפשר את הפיצ'ר. למשל, ל-Tag Manager אנחנו מבקשים `edit.containers` ולא `publish` — אתם מפרסמים בעצמכם.

**Property Picker:** בכל אינטגרציה שמעניקה גישה לכמה משאבים (GA4 properties, GTM containers, Ads accounts), אנחנו מציגים בורר שמאפשר לכם לבחור מפורשות איזה משאב שייך ל-tenant הזה.

**מצב agency:** אם אתם מפעילים את ClawFlow במצב agency (ניהול מספר tenants), כל tenant מקבל בידוד מלא — אנחנו לא מחליפים נתונים בין tenants. ה-operator של ה-agency מוצהר במפורש בפני המשתמש בכל אינטגרציה.

**ניתוק:** תוכלו לנתק כל אינטגרציה בכל זמן דרך לוח הבקרה או דרך הגדרות חשבון Google/Meta/Microsoft. הניתוק מבטל את ה-OAuth tokens שלנו תוך 24 שעות ומוחק את הנתונים שנאספו תוך 30 ימים.

**אישור מפורש לפעולות כתיבה:** כל פעולה שמשנה משהו (יצירת tag ב-GTM, השקת קמפיין ב-Google Ads, פרסום פוסט ב-Facebook) דורשת אישור שלכם בלוח הבקרה. אנחנו לא מבצעים פעולות כתיבה אוטומטית בלי הסכמתכם.

---

### 5. תקופות שמירה (Data Retention)

| סוג נתון | תקופת שמירה | סיבה |
|---|---|---|
| OAuth refresh tokens | עד ניתוק / 24 חודשים inactivity | חידוש access tokens |
| Aggregated metrics (GA4, Ads, Search Console) | 30-90 ימים | היסטוריית המלצות |
| Event log (פעולות שלנו) | 90 ימים | audit + troubleshooting |
| Conversion data | 90 ימים | bid strategy optimization |
| Property/Container IDs נבחרים | עד ניתוק | תצורה |
| חשבונית + פרטי חיוב | 7 שנים | חוק מס הכנסה (חובה רגולטורית) |
| Email + נתוני חשבון | עד מחיקת חשבון + 30 ימים | התאוששות מחיקה בטעות |

**מחיקה מיידית לבקשתכם:** תוכלו לבקש מחיקה מלאה של כל הנתונים שלכם בכל זמן ב-support@flowmatic.co.il. נבצע מחיקה תוך 30 ימים (למעט נתונים חיוביים שאנחנו חייבים לשמור לפי חוק).

---

### 6. מעבדי משנה (Sub-processors)

ClawFlow משתמשת בשירותי צד שלישי לעיבוד נתונים. כל אחד מהם מחויב לעמוד בסטנדרטים שלנו (SOC 2 / GDPR / DPA חתום):

| ספק | שירות | מיקום | תפקיד |
|---|---|---|---|
| **Hetzner Cloud** | Hosting | Helsinki, Finland | אחסון שרת הניהול + DB |
| **Cloudflare** | DNS + CDN | Global | DNS records לתת-דומיינים |
| **AllPay** | Payments | Israel | עיבוד תשלומים (אנחנו לא רואים פרטי כרטיס) |
| **Anthropic Claude API** | AI inference | USA | יצירת המלצות, ניתוח נתונים, יצירת תוכן. הנתונים לא נשמרים אצלם (אין training) |
| **DataForSEO** | SEO data API | EU | נתוני חיפוש, נפחים, CPC |
| **Firecrawl** | Web scraping | USA | סריקה של אתרים פומביים (מתחרים, האתר שלכם) |
| **Brave Search API** | Search API | USA | חיפוש SERP results |
| **ElevenLabs** | TTS (Hebrew voice) | UK | יצירת voiceover לתוכן (אופציונלי) |
| **fal.ai** | Image/video gen | USA | יצירת תוכן ויזואלי (אופציונלי) |

**אנחנו לא משתפים את הנתונים שלכם עם רשתות פרסום / רשתות social** אלא אם אתם מחברים אותן במפורש דרך OAuth (סעיף 4 לעיל).

---

### 7. העברות נתונים בינלאומיות

חלק מהמעבדים שלנו ממוקמים מחוץ למדינת ישראל (Anthropic — ארה"ב, fal.ai — ארה"ב, וכו'). ההעברות מבוצעות תחת:

- **Standard Contractual Clauses (SCC)** של האיחוד האירופי (לעיבוד נתונים ב-USA)
- **Adequacy decisions** רלוונטיות
- **DPA חתום** עם כל מעבד משנה
- **הצפנה ב-transit** (TLS 1.3) ו-**at rest** (AES-256)

---

### 8. תאימות לחוק הגנת הפרטיות (תיקון 2025)

תיקון חוק הגנת הפרטיות הישראלי 2025 (בתוקף Q1 2026) דורש הסכמה מפורשת לעיבוד נתונים אישיים, מינוי DPO, ודיווח על אירועי דליפה. ClawFlow מיישמת:

- **הסכמה מפורשת:** כל OAuth + כל איסוף PII דורש הסכמה אקטיבית
- **Consent Mode v2:** באתרים שאנחנו מקימים עבורכם (אם רלוונטי), אנחנו מטמיעים Consent Mode v2 של Google
- **DPO:** ניתן ליצור קשר ב-dpo@flowmatic.co.il (ראו סעיף 11)
- **דיווח על דליפות:** תוך 72 שעות לרשם מאגרי המידע + הודעה למשתמשים מושפעים
- **זכויות משתמש:** access, rectification, erasure, portability, restriction, objection — כל הזכויות לפי GDPR Article 15-22

---

### 9. נתונים שאנחנו לא אוספים

לחיזוק הגישה של "least data":
- ❌ **תוכן צ'אט עם הסוכנים** — רץ ב-VPS שלכם, אנחנו לא רואים
- ❌ **פרטי כרטיס אשראי** — AllPay מטפל
- ❌ **API Keys שאתם מזינים** — נשמרים ישירות ב-VPS שלכם, לא בשרתים שלנו
- ❌ **תוכן OAuth scopes שלא ביקשנו** — Google/Meta מגבילים אותנו ל-scopes שביקשנו בלבד
- ❌ **נתוני tenants אחרים** — בידוד מלא (מצב agency)
- ❌ **נתונים של ילדים מתחת לגיל 16** — השירות לא מיועד לקטינים. אם נגלה שאספנו נתונים של קטין בטעות, נמחק תוך 7 ימים.

---

### 10. בקרת משתמש

תוכלו תמיד:
- **לצפות** בכל ההגדרות + נתונים בלוח הבקרה
- **לערוך** או למחוק parts of data
- **לייצא** העתק מלא (JSON / CSV) דרך request ל-support
- **לבטל** הרשאות OAuth דרך הגדרות חשבון Google/Meta/וכו', או דרך לוח הבקרה
- **למחוק** את חשבון ה-ClawFlow לחלוטין → VPS נמחק → כל הנתונים נמחקים תוך 30 ימים

---

### 11. יצירת קשר — DPO + פניות פרטיות

שאלות, בקשות אקסס, מחיקה, או דיווח על אירוע פרטיות:
- **Email:** support@flowmatic.co.il
- **DPO:** dpo@flowmatic.co.il
- **כתובת:** Flowmatic, רחוב שלמה המלך 18, נתניה
- **טלפון:** [להוסיף]

זמן תגובה: עד 7 ימי עסקים (חירום — 24 שעות).

---

## English equivalent (אם נדרש לוורסיה לועזית)

> The Hebrew version is binding. English provided as informational courtesy.

[Same structure translated, available on request]

---

## רכיבי OAuth Consent Screen Updates

מלבד עדכון ה-policy text, גם בדף Google Cloud Console → OAuth Consent Screen צריך לעדכן:

1. **Privacy policy URL:** `https://clawflow.flowmatic.co.il/privacy`
2. **Terms of service URL:** `https://clawflow.flowmatic.co.il/terms`
3. **Authorized domains:** `flowmatic.co.il` (כולל all subdomains)
4. **App name:** "ClawFlow" (או "ClawFlow by Flowmatic")
5. **User support email:** `support@flowmatic.co.il`
6. **Developer contact:** `dev@flowmatic.co.il` (או isratars@gmail.com)
7. **App logo:** PNG 240x240 (white/transparent background)

---

## Action items לפני verification submit

- [ ] עדכן את `clawflow.flowmatic.co.il/privacy` בסעיפים 4-11 שלמעלה
- [ ] ודא `clawflow.flowmatic.co.il/terms` מעודכן וחי
- [ ] צור email aliases: `support@`, `dpo@`, `dev@` ב-flowmatic.co.il (אם לא קיימים)
- [ ] העלה לוגו ClawFlow PNG 240x240 ל-OAuth consent screen
- [ ] verify domain ownership ב-Search Console (אם לא נעשה)
- [ ] הקלט demo video (2-3 דק') שמראה כל scope בפעולה
- [ ] submit verification request
