# Storage4You — Google Ads Search Setup (Manual Mode)

> Полная инструкция для ручной настройки Search кампании в Google Ads UI.
> Это эквивалент того что прислал бы Mazhir manual exporter в Degraded mode
> (нет developer token → executor не может пушить через API → клиент делает руками).

---

## Базовая информация

- **Бизнес:** Storage4You · `storage4you.co.il` · Ришон ле-Цион
- **Methodology:** STAG (Single Theme Ad Group) — оптимально для leadgen SMB с ₪3,000/мес
- **Бюджет месячный:** ₪3,000 → **Daily total: ₪97** (Search ₪82 + Display Remarketing ₪15)
- **Зам launch time:** 7-14 дней (после закрытия blockers)
- **Главная цель:** leadgen → WhatsApp clicks + form submissions
- **Главный canalpane:** WhatsApp Click = **Primary Conversion** (98% всех конверсий по GA4)
- **Geography:** Ришон ле-Цион + 5 km radius (план расширения после первого месяца)
- **Mode:** Degraded (нет Developer Token → ручная настройка через Google Ads UI)

### Database basis для расчётов

| Источник | Значение | Подтверждение |
|----------|----------|---------------|
| Historical spend | ₪29,464 | CSV (предыдущая кампания) |
| Historical clicks | 1,305 | CSV |
| **Historical CPC** | **₪22.58** | calculated: 29464 / 1305 |
| GA4 conversions (365d) | 120 | 118 WhatsApp + 2 form |
| GA4 sessions | 1,715 | |
| Conversion rate (organic) | 7% | 120 / 1715 |
| Conversion rate (paid, expected) | 3.5% | 50% organic (industry standard IL leadgen cold) |
| **Avg deal value** | **₪750** | client-confirmed: 5 m³ × 6 mo × ₪29.9 / conservative |

---

## 🚫 Blockers — обязательно перед launch

1. **Enhanced Conversions for Web** — не активирован. Mandatory 2026, влияет на точность Smart Bidding 10-60%.
2. **Consent Mode v2** — не установлен. Регуляторное требование IL/EU. Без него Google ограничит conversion data.
3. **Native Google Ads pixel** — нет. Прошлая кампания (₪29,464) шла слепой — все «0 conversions» в CSV это технический сбой, не fail кампании. GA4 видел 120 конверсий.
4. **WhatsApp Click → Conversion Action linkage** — 98% конверсий это WhatsApp clicks, без этого Smart Bidding учится на пустом множестве.

Все 4 закрываются в шагах 4-5. Не переключай PAUSED → ENABLED пока эти не работают.

---

## 💬 WhatsApp Click → Primary Conversion (КРИТИЧНО)

Это **самый важный** шаг — без него все CPA расчёты не сработают.

### 6 шагов:

1. **GA4 проверка:** в Reports → Engagement → Events → видишь `click_on_whatsapp` event? Если да — переходи к шагу 2.

2. **GTM tag (storage4you GTM container `GTM-N6PQVSJW`):**
   - New Tag → Google Ads Conversion Tracking
   - Name: `awct - whatsapp_click`
   - Trigger: Custom Event = `click_on_whatsapp`

3. **Google Ads → Tools & Settings → Conversions → New Conversion Action → Website → Set up manually:**
   - **Category:** Lead → Submit lead form
   - **Name:** `WhatsApp Click`
   - **Value:** Use the same value = **₪750**
   - **Count:** One per click
   - **Click-through window:** 30 days
   - **Attribution model:** Data-driven (если доступно), иначе Last-click
   - **Primary conversion goal:** ✓ MARKED

4. **Получи Conversion ID + Label** из Google Ads → вернись в GTM → залейте в tag из шага 2.

5. **Enhanced Conversions:** в Google Ads → Conversion Action → Settings → Enhanced Conversions ON → Code = Google Tag → form fields (email, phone) hashed автоматически.

6. **Consent Mode v2:** GTM → Variables → Built-in: enable все Consent State variables. Add Tag → Consent Initialization → All Pages → default consent = denied (если нет CMP), updates to granted после CMP confirm.

### Verification перед launch

Tag Assistant Live → нажми WhatsApp button на сайте → должен появиться "Conversion Hit Sent" в течение 5 секунд + Google Ads → Conversions → status = **Recording conversions**. Если красное — НЕ запускай.

---

## Step 1 — Open Google Ads Account

1. `ads.google.com` → Sign in → Create new Google Ads account
2. Skip Smart Mode → bottom "Switch to Expert Mode"
3. Skip campaign creation now
4. **Billing:**
   - Country: Israel
   - Currency: **ILS (₪)**
   - Time zone: **(GMT+02:00) Jerusalem**
   - Add credit card / Israeli debit
   - Initial billing threshold: **₪500**
5. Account access (Tools → Setup): добавь себя как Admin
6. **Linked accounts (важно!):**
   - GA4 property `storage4you web` (`properties/493627118`)
   - Search Console `sc-domain:storage4you.co.il`
   - Google My Business (если есть) — auto location extensions

---

## Step 2 — GTM Setup (Conversion Linker, awct, gaawe, Enhanced Conv, Consent Mode v2)

GTM container: `storage4you.co.il` (`GTM-N6PQVSJW`).

### 2.1 Conversion Linker (mandatory)
New Tag → Conversion Linker → Trigger: All Pages → Save → Submit → Publish.

### 2.2 GCLID Capture variable
Variables → New → Custom JavaScript:
```js
function() {
  var u = new URLSearchParams(location.search);
  var g = u.get('gclid');
  if (g) localStorage.setItem('gclid', g);
  return localStorage.getItem('gclid') || '';
}
```
Name: `cv - GCLID`. В форме сайта — hidden field `gclid` заполняется этой переменной перед submit.

### 2.3 Google Tag (gtag config)
Если ещё не установлен — Tags → New → Google Tag → Tag ID: `AW-XXXXXXXXX` (из Google Ads). Trigger: All Pages.

### 2.4 awct - WhatsApp Click
Tags → New → Google Ads Conversion Tracking:
- Conversion ID: (из Google Ads → Conversions → WhatsApp Click → Tag setup → Use GTM)
- Conversion Label: (из того же места)
- Conversion Value: `750`
- Currency: `ILS`
- Enhanced Conversions: ON → Manual → email + phone

Trigger: Custom Event = `click_on_whatsapp`

### 2.5 awct - Form Submit
То же самое, Trigger = Form Submission, Label of Form Submit action.

### 2.6 gaawe - GA4 events
GA4 Event tags для `click_on_whatsapp` + form_submit. User-Provided Data: email + phone (для Enhanced Conv merge).

### 2.7 Consent Mode v2
Tags → New → Consent Initialization → All Pages:
```
Default state:
  ad_storage = denied
  ad_user_data = denied
  ad_personalization = denied
  analytics_storage = denied
  functionality_storage = granted
  security_storage = granted
```
Если есть CMP → trigger update consent после client agree.

### 2.8 Publish workspace
Submit → Publish → version "Mazhir initial conversion setup". Tag Assistant Live для verification.

---

## Step 3 — Conversion Actions in Google Ads

Создай 2 actions:

| Conversion Action | Category | Value | Count | Window | Primary? |
|-------------------|----------|-------|-------|--------|----------|
| WhatsApp Click | Lead → Submit lead form | ₪750 | One per click | 30d | **YES** |
| Form Submit | Lead → Submit lead form | ₪750 | One per click | 30d | Secondary |

---

## Step 4 — Search Campaign (STAG)

### 4.1 New Campaign
- Campaigns → + New campaign → **Create without goal's guidance** → **Search**
- Results: Website visits → URL: `https://storage4you.co.il/`
- Name: **`Search | אחסון ראשון לציון | STAG`**

### 4.2 Bidding (cold start)
- Bidding focus: **Clicks** + max CPC limit
- Maximum CPC: **₪25**
- Strategy: **Maximize Clicks**

⚠️ Не выбирай tCPA / Maximize Conversions сейчас. Без 30+ conv в истории Smart Bidding не работает корректно.

### 4.3 Networks
- Search Network: YES
- Search Partners: NO
- Display Network: NO

### 4.4 Locations + Languages
- Custom radius — **Ришон ле-Цион, 5 km**
- Location options: **Presence** (не "interested in")
- Languages: Hebrew + English

### 4.5 Audiences (Observation)
- `website-visitors-30d` (после создания в шаге 1.5)
- In-market: "Real Estate → Apartments" + "Moving Services"

### 4.6 Budget
- Daily: **₪82**
- Delivery: **Standard**

### 4.7 Final URL Expansion
**OFF**

---

## Step 5 — 5 Ad Groups

Все ad groups: **STAG** structure — single theme each. ₪82 / 5 = ~₪16/group/day → 50-75 clicks/group/month.

### AG01 — Мчасан לhaschera כללי
- finalUrl: `https://storage4you.co.il/`
- maxCpc: ₪22

**Keywords:**
- `מחסן להשכרה` PHRASE (vol 1300, CPC ₪5.18)
- `מחסן להשכרה ראשון לציון` PHRASE (vol 110)
- `אחסון עצמי` PHRASE (vol 720)
- `self storage` PHRASE (vol 880)
- `[מחסן להשכרה]` EXACT
- `[אחסון עצמי]` EXACT

**15 Headlines** (≤30 chars):
- מחסן להשכרה ₪29.9 לקוב
- אחסון עצמי בראשון לציון
- גישה 24/6 עם צ'יפ
- מבנה בטון — בטיחות מלאה
- מחיר השוק הטוב באזור
- השאירו פרטים בוואטסאפ
- כל גודל — מיחידה לחלל
- אבטחה 24/7 ללא דאגות
- בלי התחייבות לטווח ארוך
- תפעול פשוט וקל
- פנו אלינו לבירור פנוי
- פתרון מקומי — קרוב לבית
- גישה גמישה ונוחה
- מחסן מאובטח ב-29.9 לקוב
- Storage For You — אנחנו כאן

**4 Descriptions** (≤90 chars):
1. מחסן להשכרה ב-29.9 ש"ח לקוב — גישה עם צ'יפ 24 שעות 6 ימים. השאירו פרטים בוואטסאפ.
2. אחסון עצמי מאובטח בראשון לציון. מבנה בטון, אבטחה 24/7, בלי התחייבות. ניתן לכל גודל.
3. פתרון אחסון מקומי וגמיש. ₪29.9 לקוב — מחיר תחרותי ביותר באזור. בואו לבדוק.
4. Storage For You — מחסן מאובטח ראשון לציון. גישה 24/6 עם צ'יפ. פנו אלינו עכשיו.

**Sitelinks** (4):
- מחירון 29.9 לקוב → `/pricing` (или homepage)
- שירות הובלה ואריזה → `/moving`
- שאלות נפוצות → `/faq`
- צרו קשר → `/contact`

**Callouts**: גישה 24/6 · כניסה עם צ'יפ · מבנה בטון · ₪29.9 לקוב · ללא התחייבות

**Structured Snippets**: Header `Services` → אחסון תכולת דירה · אחסון עסקי · אחסון רהיטים · הובלה · אריזה

### AG02 — Achsun Tehulat Dira
- finalUrl: `/` → recommended LP `/achsun-dira/`
- maxCpc: ₪22
- Keywords: `אחסון תכולת דירה` (vol 880, CPC ₪9.72), `[אחסון תכולת דירה]`, `אחסון רהיטים` (vol 320), `אחסון בזמן מעבר דירה`, `אחסון זמני לדירה`, `מחסן לתכולת דירה`
- Headlines: см. HTML doc
- Descriptions: focus on transitions/renovations

### AG03 — Achsun Iski (B2B)
- finalUrl: `/` → recommended LP `/esek/`
- maxCpc: **₪25** (B2B LTV higher)
- Keywords: `אחסון עסקי` (vol 140, CPC ₪11.20), `מחסן לעסק`, `אחסון מלאי`, `מחסן למשרד`, `שטח אחסון לעסקים`, `[אחסון עסקי]`
- Headlines: B2B focus — חשבונית מס, גמישות חוזה

### AG04 — Pricing
- finalUrl: `/` → recommended LP `/pricing/`
- maxCpc: ₪20
- Keywords: `מחיר אחסון` (vol 180), `מחירון מחסן`, `אחסון זול`, `השכרת מחסן מחיר`, `[מחיר אחסון]`
- Headlines: ₪29.9 lead, transparency emphasis

### AG05 — Geographic
- finalUrl: `/` → recommended LP `/rishon-lezion/`
- maxCpc: **₪18** (long-tail cheaper)
- Keywords: `מחסן ראשון לציון` (vol 110), `אחסון ראשון לציון`, `self storage גוש דן`, `מחסן בת ים`, `מחסן חולון`, `אחסון נס ציונה`, `[מחסן ראשון לציון]`
- Headlines: location-rich

---

## Step 6 — Negative Keywords

Tools & Settings → Negative keyword lists → New → "Storage4You Master Negatives" → link to campaign.

```
Industry not relevant:
מחסן נשק, מחסן תרופות, מחסן סמים, מחסן חומרים מסוכנים, מחסן מקרר

Buying (vs renting):
מחסן לקנייה, קנה מחסן, רכישת מחסן, מחסן זול לקנייה, מחיר רכישה

DIY / video games / unrelated:
minecraft, cloud storage, אחסון ענן, ביטוח אחסון, DIY storage, קופסאות אחסון

Far geography:
ירושלים, חיפה, באר שבע, אילת, עפולה, עכו, נצרת, רעננה
(нетания — opcional, если хочешь)

Employment (irrelevant):
משרת, עבודה, job, משכורת, שכר, employee, מנהל מחסן, משלוח

Apartment (not storage):
דירה להשכרה, השכרת דירה, דירה לקנייה

Professional equipment unrelated:
תמונות מחסן, עיצוב מחסן, מחשב מחסן, תוכנה למחסן, ERP, ניהול מחסן

Free / freebies:
חינם, free, בחינם, ללא תשלום
```

---

## Step 7 — Geography Bid Adjustments

| Location | Adjustment | Reason |
|----------|------------|--------|
| Ришон ле-Цион центр | +15% | Physical location, highest conv rate |
| Холон | 0% | Borders radius |
| Бат Ям | 0% | Borders radius |
| Нес Циона | 0% | In radius |

**Device adjustments:**
- Mobile: **+10%** (GA4: 73% conv on mobile)
- Desktop: **0%**
- Tablet: **-30%**

**Future expansion (month 2+, GA4 demographics-driven):**
- Тель-Авив-Яффо + radius 3 km → bid -15% (CPC higher)
- Петах-Тиква center → 0%
- Нетания + radius 5 km → -25%

---

## Step 8 — Ad Schedule (IL-specific)

| День | Часы | Bid Adjustment |
|------|------|----------------|
| **Воскресенье** (1st workday IL) | 09:00 – 21:00 | **+15%** (peak 09-13) |
| Пн-Чт | 09:00 – 21:00 | +10% (peak 09-13, 16-20) |
| Пятница | 09:00 – 14:00 | 0% |
| **Суббота** | — | **-90%** (effectively paused — религиозный рынок) |

Ночные часы (00:00-08:00) и поздние (21:00-23:59) — bid -50%, не выключай полностью.

---

## Step 9 — Display Remarketing Campaign

### 9.1 Setup
- New campaign → Goal: None → **Display** → Standard
- Name: `Display | Remarketing | Storage4You`

### 9.2 Audience
- Targeting: **Audiences only**
- Audience: `website-visitors-30d` (от GA4)
- Frequency cap: 5 impressions/user/day

### 9.3 Bidding
- **Maximize Clicks** (cold start, не Maximize Conversions!)
- Max CPC: **₪3**

### 9.4 Budget
- Daily: **₪15**
- Schedule: same as Search (Saturday paused)

### 9.5 Responsive Display Ad creative
- 5 logos (primary + square variant)
- 5 images (1.91:1 + 1:1 — внешний вид склада, ворота, юниты)
- 5 headlines (≤30):
  - חזרו לאחסון שחיפשתם
  - ₪29.9 לקוב — עדיין מחכה
  - מחסן מאובטח ראשון לציון
  - גישה 24/6 — אחסון חכם
  - Storage For You — חזרו
- 5 long headlines + 5 descriptions: см. HTML doc
- Final URL: `https://storage4you.co.il/`

---

## Step 10 — Launch Sequence

1. **Conversion Setup verify:** Tools & Settings → Conversions → status = "Recording conversions"
2. **Tag Assistant Live:** awct + gaawe + Conversion Linker fire on homepage
3. **Save campaign as PAUSED.** НЕ activate yet.
4. **Wait 24-48 hours** (Conversion Tracking accumulates baseline + tracking sanity)
5. **Preview ads:** Tools → Ad preview → 5 keywords IL → no disapproval errors
6. **Activate:** both campaigns → Status → Enabled
7. **First 3 days:** check daily, не меняй ничего, просто следи за pacing
8. **Week 1:** добавляй negatives на основе Search Terms Report (раз в неделю)

---

## Step 11 — Bid Transition (after 30+ conv)

### Trigger
30+ conv accumulated in last 30 days **AND** Enhanced Conversions firing **AND** Consent Mode v2 active.

**Estimated date:** day 30-45 from launch.

### tCPA calculation
```
historicalCpcIls (₪22.58) ÷ historicalConversionRatePct (3.5% paid) × 1.3 headroom
= ₪645 initial tCPA target
```

(Conservative. Если в реальности conv rate 5-7% — tCPA автоматически опустится до ₪322-450.)

### How to switch
1. Campaign → Settings → Bidding → Change bid strategy
2. Choose **Target CPA**
3. Initial tCPA: **₪645**
4. Save. Smart Bidding starts learning — week 1 after switch может быть turbulence.

### Warnings
- Если CPA в 7 дней после перехода > ₪900 → откат к Maximize Clicks на 2 недели, потом снова tCPA.
- После 90 дней успешного tCPA → consider tROAS с conv value ₪750 (ROAS target = 1.5×).

---

## Step 12 — Seasonality Budget Plan

| Месяц | Месячный | Дневной | Multiplier | Notes |
|-------|----------|---------|------------|-------|
| 1-2 (cold start) | ₪3,000 | ₪97 | 1.0× | baseline |
| Июнь | ₪4,200 | ₪140 | +40% | Готовь creative за 2 недели |
| Июль-Авг | ₪4,500 | ₪150 | +50% | Max 1.5× без истории |
| Сентябрь (тишрей) | ₪3,750 | ₪125 | +25% | |
| Декабрь | ₪3,300 | ₪110 | +10% | |
| Январь | ₪2,500 | ₪83 | -15% | Спад |

**Правила escalation:**
- Не повышай бюджет более чем на 50% за раз — Smart Bidding нужно 7-14 дней на адаптацию
- Меняй budget ночью (00:00 IL), чтобы получить полный день
- В peak — добавь headlines с urgency: "מקומות מתמלאים מהר"

---

## Step 13 — Landing Page Recommendations

5 dedicated LPs (создай через 2-3 недели с copywriter + designer):

| Ad Group | LP URL | Status | Brief |
|----------|--------|--------|-------|
| AG01 | `/` | ✓ exists | H1 "מחסן להשכרה ב-29.9 ש"ח/קוב — ראשון לציון", WhatsApp button above fold, "X units available now" urgency |
| AG02 | `/achsun-dira/` | NEW | H1 "אחסון תכולת דירה ורהיטים — מ-29.9 ₪/קוב". Checklist для переезда, sizes для квартир 2/3/4/5 комнат, отзывы. Главная LP для июль-авг peak |
| AG03 | `/esek/` | NEW | H1 "פתרון אחסון לעסקים — מ-29.9 ₪/קוב". B2B benefits (חשבונית, гибкость), B2B form, лого корпоративных клиентов |
| AG04 | `/pricing/` | NEW | H1 "מחירון מלא — שקיפות מוחלטת". Pricing table, calculator, comparison с конкурентами |
| AG05 | `/rishon-lezion/` | NEW | H1 "מחסן להשכרה בראשון לציון — 29.9 ₪/קוב". Map, hours, service areas (ראשל"צ, חולון, בת ים, נס ציונה) |

**Quality Score impact:** ожидается прирост 2-3 пункта (с 5/10 до 7-8/10) → CPC падает на 20-40% → тот же бюджет = больше кликов = больше конверсий.

---

## Math Summary

| Параметр | Значение | Формула / источник |
|----------|----------|---------------------|
| Месячный бюджет | ₪3,000 | client-confirmed |
| Дневной total | ₪97 | Search ₪82 + Display ₪15 |
| Historical CPC | ₪22.58 | CSV ground truth |
| Max CPC bid (Search) | ₪22-25 | historical × 1.0-1.1 |
| Conv rate (organic) | 7% | GA4: 120/1715 |
| Conv rate (paid expected) | 3.5% | 50% organic (industry IL standard) |
| Clicks expected/month (Search) | ~110-130 | 82×30÷22 = 112 |
| Conversions expected/month | 4-9 month 1, 8-15 month 2 | 112 × 3.5-7% |
| CPA expected | ₪400-700 | cold start; после tCPA ₪450-600 |
| Conversion value | ₪750 | 5 m³ × 6 mo × ₪29.9 / buffer |
| ROAS (cold start) | 0.9-1.4× | improves to 1.5-2.5× после tCPA |
| Bid transition date | day 30-45 | 30+ conv + Enhanced Conv active |
| Peak budget (Jul-Aug) | ₪4,500 | ×1.5 baseline |

---

**Generated:** 2026-04-29 · Mazhir Manual Setup Mode (Degraded — no Google Ads API)
**Storage4You · Ришон ле-Цион**
**Sources:** GA4 ground truth (120 conv) · CSV history (₪29,464 spend) · DataForSEO IL keywords · WordStream IL benchmark 2024
**Methodology:** STAG · cold-start MAXIMIZE_CLICKS week 1-4 → tCPA after 30+ conv + Enhanced Conversions verified
