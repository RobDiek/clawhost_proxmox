# Google Ads Full Integration — Architecture
## 2026-03-30

## Pipeline

```
Стратегия (stage 3: אורגני וממומן)
    ↓
Агент (menateach) анализирует research + strategy
    → Рекомендует: тип кампании, keywords, бюджет, bidding
    ↓
Output → agent_outputs (status: pending_review)
    ↓
Dashboard popup: пользователь видит план кампании
    → Может редактировать бюджет, keywords, тексты
    → Выбирает: запустить сразу (enabled) или в паузе (paused)
    → Нажимает "אשרו"
    ↓
Publish → Google Ads API
    → Создаёт: Budget → Campaign → Ad Groups → Keywords → RSA Ads → Assets
    → Статус: enabled или paused (по выбору пользователя)
    ↓
Мониторинг (ежедневно)
    → Агент (menateach) читает metrics через API
    → Сравнивает с KPIs из стратегии
    → Предлагает оптимизации → pending_review
    → Применяет Recommendations API → с одобрения пользователя
```

## Требования

### Developer Token
- Подать заявку через MCC → Tools & Settings → API Center
- Test account доступен сразу (для разработки)
- Basic access: 15,000 ops/day — достаточно для десятков аккаунтов

### OAuth (уже есть)
- Scope: `https://www.googleapis.com/auth/adwords` (уже добавлен как 'ads')
- Refresh token хранится в googleTokens

### Conversion Tracking
- При подключении Google Ads → автоматически создаём ConversionAction
- Генерируем gtag.js snippet → показываем пользователю в guide
- Enhanced conversions: опционально, с guide

## Campaign Creation Order (API)

1. CampaignBudget → daily budget в ILS
2. Campaign → type (SEARCH/PERFORMANCE_MAX), bidding strategy, budget ref
3. AdGroup → theme-based, bid
4. AdGroupCriterion → keywords (broad match default)
5. AdGroupAd → RSA (15 headlines, 4 descriptions)
6. Assets → sitelinks, callouts, images

## Best Practices (2026)

- **Broad match + Smart Bidding** = Google's default recommendation
- **RSA**: все 15 headlines, все 4 descriptions, pin минимально
- **Structure**: меньше кампаний, больше данных в каждой
- **Bidding start**: Maximize Clicks → переход на Target CPA после 30+ conversions
- **Budget minimum**: достаточно для 10+ clicks/day
- **Negative keywords**: обязательно с первого дня

## Campaign Types for SMB

| Приоритет | Тип | Когда |
|-----------|-----|-------|
| 1 | Search | Сразу — высокий intent |
| 2 | Performance Max | После 30+ conversions |
| 3 | Display Remarketing | После настройки pixel |
| 4 | Demand Gen | Для визуальных продуктов |
| 5 | YouTube | Если есть видео-контент |

## Agent Output Format (for menateach)

```json
{
  "outputType": "google_ads_campaign",
  "title": "קמפיין חיפוש — OpenClaw Hosting",
  "content": "## תוכנית קמפיין\n\n### סוג: Search\n### תקציב: ₪50/יום\n...",
  "metadata": {
    "campaignType": "SEARCH",
    "dailyBudget": 50,
    "currency": "ILS",
    "biddingStrategy": "MAXIMIZE_CLICKS",
    "keywords": [
      { "text": "openclaw hosting", "matchType": "BROAD" },
      { "text": "AI agent hosting", "matchType": "BROAD" }
    ],
    "negativeKeywords": ["free", "חינם", "tutorial"],
    "headlines": [
      "OpenClaw Hosting בעברית",
      "VPS מוכן ב-3 דקות",
      "סוכן AI לעסק שלך"
    ],
    "descriptions": [
      "OpenClaw hosting מנוהל עם תמיכה בעברית. התחילו היום!",
      "סוכן AI שעובד 24/7 — שיווק, תוכן, ניתוח מתחרים אוטומטי"
    ],
    "sitelinks": [...],
    "launchMode": "PAUSED" // user chooses
  }
}
```

## Files to Create

- `apps/api/src/services/googleAds.ts` — API client
- `apps/api/src/services/googleAdsPublisher.ts` — campaign creation flow
- Update `outputs.ts` → publish handler for google_ads_campaign
- Update dashboard → campaign plan popup with edit fields
- Update guide → conversion tracking setup instructions
