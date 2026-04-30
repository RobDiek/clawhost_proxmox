# Полный алгоритм настройки Google Ads через Mazhir

> **Назначение:** Этот документ описывает каждый шаг — от момента когда клиент впервые
> попадает в раздел `ניהול שיווק` (Marketing Hub), до момента когда кампании в Google Ads
> запущены и автоматически оптимизируются. Включает все ветвления, сценарии (Full API
> mode / Degraded mode), блокеры, fallback'и, регистр последствий пропущенных данных,
> и решения которые принимает агент в каждой точке.
>
> Документ актуален для архитектуры на дату 2026-04-29 после внедрения 6 фаз hardening
> (см. `docs/agents/mazhir-data-coverage.md`) **и расширения post-launch automation**:
> bid transition runner, monthly re-audit, manual exporter (degraded mode),
> revise-with-note flow, executor с bidStrategyTransition contract.
>
> Аудитория: разработчики платформы, поддержка, клиенты желающие понять что происходит.

---

## Оглавление

1. [Высокоуровневая схема](#1-высокоуровневая-схема)
2. [Шаг 0 — Foundation: Research → Strategy → Brand Book](#шаг-0)
3. [Шаг 1 — Активация интента "Платный трафик"](#шаг-1)
3. [Шаг 2 — OAuth подключения + scope normalization](#шаг-2)
4. [Шаг 3 — Заполнение פרופיל קידום ממומן](#шаг-3)
5. [Шаг 4 — Pre-flight Data Coverage](#шаг-4)
6. [Шаг 5 — Запуск Mazhir Audit](#шаг-5)
7. [Шаг 6 — Чтение результата аудита](#шаг-6)
8. [Шаг 7 — GTM Auto-Setup](#шаг-7)
9. [Шаг 8 — Создание Conversion Actions](#шаг-8)
10. [Шаг 9 — Генерация Media Plan](#шаг-9)
11. [Шаг 10 — Devil's Advocate ревью](#шаг-10)
12. [Шаг 11 — Утверждение клиентом (approve / revise / reject)](#шаг-11)
13. [Шаг 12 — Push в Google Ads](#шаг-12)
14. [Шаг 13 — Запуск кампании](#шаг-13)
15. [Шаг 14 — Bid transition (auto-flip 30+ conv → tCPA)](#шаг-14)
16. [Шаг 15 — Еженедельная оптимизация](#шаг-15)
17. [Шаг 16 — Ежемесячный re-audit (cron)](#шаг-16)
18. [Карта блокеров и fallback'ов](#карта-блокеров)
19. [Системность для новых пользователей](#системность)
20. [Глоссарий и сокращения](#глоссарий)

---

## 1. Высокоуровневая схема

```
┌──────────────────────────────────────────────────────────────────┐
│              ВХОД: Клиент в Marketing Hub (любой instance)        │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 0. FOUNDATION (обязательно ДО paid traffic):              │
   │    Research → Strategy → 🎨 Brand Book                    │
   │    ─ Research: stage1-5 (рынок, конкуренты, аудитория)    │
   │    ─ Strategy: позиционирование, USPs, сценарии           │
   │    ─ Brand Book: логотип, цвета, voice, vocabulary,       │
   │      tagline, banned phrases — фид для каждого creative   │
   │    Без Brand Book paid pipeline ЗАБЛОКИРОВАН              │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 1. Активация интента "paid_traffic" в Marketing Intents   │
   │    → авто-активация связанных pipelines:                  │
   │    mazhir_audit · gtm_setup · conversions · media_plan   │
   │    · mazhir_executor · weekly_ops_brief · monthly_reaudit │
   │    · bid_transition_runner                                │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 2. OAuth: Google Ads · GA4 · GTM · Search Console         │
   │    Branch A: все scope → Full API mode                   │
   │    Branch B: только OAuth scope → Degraded mode           │
   │    Branch C: ничего → blocker, не пускаем дальше          │
   │    + scope normalization (gtm/tagmanager, gsc/webmasters) │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 3. פרופיל קידום ממומן (9 вопросов + USPs + история)        │
   │    + auto-fill historical fields из CSV+GA4 в audit       │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 4. Pre-flight Data Coverage Check                         │
   │    🟢/🟡/🔴 + plain-Hebrew "что мы теряем"                  │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 5. mazhir_audit (Opus + Sonnet devil's advocate)          │
   │    Параллельно тянет 19 источников:                       │
   │    GA4 (events/audiences/demographics/funnel/seasonality) │
   │    Google Ads (SQR/Auction Insights/Change History/       │
   │      metrics/recommendations)                             │
   │    GTM inventory · Call tracking · DataForSEO · GSC ·     │
   │    GSC Pages · Transparency · PageSpeed · Meta Ads Lib ·  │
   │    CSV aggregator · WhatsApp · competitor pricing         │
   │    + brand-root match для GA4/GTM/GSC selection           │
   │    + auto-derive historical CPC/CR при пустых полях       │
   │    + dataGaps registry с benchmark fallbacks              │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 6. Клиент видит аудит:                                    │
   │    summary · trackingHealth · sourceCoverage · diff ·     │
   │    dataReconciliation · assumptions · qualityWarnings ·   │
   │    recommendedActions · methodology + rationale ·         │
   │    industrySignals · blockers · dataGaps                  │
   └──────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┴─────────────────┐
                ▼                                  ▼
   ┌────────────────────────┐         ┌────────────────────────┐
   │ Есть hard blockers?    │         │ Нет blockers           │
   │   → закрыть их         │         │   → продолжать          │
   └────────────────────────┘         └────────────────────────┘
                                                    │
                                                    ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 7. mazhir_gtm_setup (только Full API + tagmanager scope)  │
   │    Conversion Linker · GCLID Capture · awct · gaawe ·     │
   │    Enhanced Conversions · Consent Mode v2 · publish       │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 8. mazhir_conversions (Full API)                          │
   │    ConversionAction в Google Ads + linkage к GTM tags    │
   │    + WhatsApp click → Primary Action автоматически        │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 9. mazhir_media_plan (Opus / Sonnet)                      │
   │    Полный план: campaigns × adGroups × keywords × RSAs ·  │
   │    extensions · budget split · bid sequence · LP recs ·   │
   │    geography expansion (GA4) · budget escalation          │
   │    (seasonality) · IL Sunday workday rule · math check    │
   │    + auto-fill transitionToTcpa (если model omitted)      │
   │    + Display cold-start force MAXIMIZE_CLICKS              │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 10. Devil's Advocate Review (Sonnet)                      │
   │     Ищет дыры → qualityWarnings                           │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 11. Approval Queue                                        │
   │     [✓ אשרו] [📝 תיקון] [📄 מסמך ידני] [⟲ ייצור מחדש]      │
   └──────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┴─────────────────┐
                ▼                                  ▼
   ┌────────────────────────┐         ┌────────────────────────┐
   │ Full API mode:         │         │ Degraded mode:         │
   │  → mazhirExecutor      │         │  → mazhirManualExporter│
   │  пушит план через API  │         │  HTML/PDF документ      │
   │  + stamps bidContract  │         │  с пошаговой инструкцией│
   └────────────────────────┘         └────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 13. Запуск (PAUSED → ENABLED через 24-48h наблюдения)     │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 14. bidTransitionRunner (daily cron)                      │
   │     Когда 30+ conv в 30d + Enhanced Conv верифицирован →  │
   │     proposal в queue → клиент аппрувит → API flip          │
   │     bid strategy: MAXIMIZE_CLICKS → TARGET_CPA            │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 15. weeklyOpsBrief (Monday 09:00 IL cron)                 │
   │     7d метрики · SQR analysis · CPA vs target · QS check ·│
   │     IS check · negatives candidates · Hebrew brief в TG    │
   └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 16. monthlyReauditRunner (day-1 UTC cron, hourly check)   │
   │     mazhirAuditDiff показывает что изменилось             │
   │     methodology shift / blockers / projection ±20% / etc  │
   └──────────────────────────────────────────────────────────┘
```

---

<a id="шаг-0"></a>
## Шаг 0 — Foundation: Research → Strategy → Brand Book

**Прежде** чем начинать platный трафик, **обязательны** 3 шага.

### 0.1 Research (`stage1` — `stage5`)
Выявление рынка, конкурентов, целевой аудитории, сценариев использования. Хранится в `researchData.stage1..5` + `researchData.answers`.

### 0.2 Strategy
Mazhir + Menateach строят positioning, USPs, scenario picker. Клиент утверждает один из 2-3 сценариев → `researchData.chosenScenario`.

### 0.3 Brand Book (🎨 obligatory)
**Это новое жёсткое требование** — было обнаружено в архитектурном ревью что paid рекламы **не должна** идти до бренд-конструкции, потому что:

1. **Headlines/descriptions** в RSA должны выдерживать voice tone (warm/professional/edgy/etc) — без brand book Mazhir генерит generic копи
2. **Display/PMax/Video creative** требует логотипа + brand colors как visual anchor — без них asset groups неконсистентны
3. **Landing page recommendations** должны иметь brand-consistent H1, voice, и vocabulary
4. **Multi-channel expansion позже** (Meta Ads, TikTok) переиспользует тот же brand book — без его наличия каждый channel пришлось бы переделывать

**Brand Book содержит** (`brand_books` table):
- `businessName`, `legalName`, `taglineHe/En`, `missionHe/En`, `positioningLine`
- `voice` (jsonb): `tone`, `principles`, `vocabulary`, `banned phrases`
- `colors` (jsonb): `primary`, `secondary`, `accent`
- `logo` (jsonb): `url`, `variants`
- `typography` (jsonb), `imagery` (jsonb), `principles` (jsonb)

**UI flow:**
- Setup tasks order: `research` → `strategy` → `brand-foundation` → `marketing_config` → Google Ads pipeline
- **`mazhir_pipeline` widget gated на `hasBrandBook`**: если paid intent активирован но brand book не утверждён, widget заменяется красной задачей `🔒 Google Ads דורש Brand Book תחילה` с кнопкой `הגדירו ברנד-בוק`

**Использование в Mazhir media plan:**

Prompt включает блок:
```
═══ BRAND FOUNDATION (must respect across ALL ad copy + creative) ═══
Business: ...
Tagline: ...
Voice tone: ...
Approved vocabulary: ...
Banned phrases: ...
Brand colors: primary=#..., secondary=#..., accent=#...
Logo URL: ...

USE THIS:
- Every headline + description MUST reflect voice tone
- Use APPROVED vocabulary, NEVER use banned phrases
- Tagline appears in 1+ headline per campaign
- For Display/PMax/Video — asset groups reference logoUrl + colors
- Landing-page recommendations include brand-consistent H1 + voice
```

---

<a id="шаг-1"></a>
## Шаг 1 — Активация интента "Платный трафик"

**Где:** Дашборд → таб `ניהול שיווק` → раздел "Intents" (карточки интентов).

**Что делает клиент:** Включает галочку напротив интента "תנועה ממומנת" (paid_traffic).

**Что происходит на бэке:**

1. POST `/hosting/instances/:id/marketing-intents` сохраняет `marketingIntents.enabled.paid_traffic = true`.
2. Вызывается `pipelineActivation.deriveAndApply()` — функция, которая по карте `intent → pipelines` автоматически включает связанные пайплайны:

   | Intent | Auto-enabled pipelines |
   |--------|------------------------|
   | `paid_traffic` | `mazhir_audit`, `mazhir_gtm_setup`, `mazhir_conversions`, `mazhir_media_plan`, `mazhir_executor`, `bid_transition_runner`, `weekly_ops_brief`, `monthly_reaudit` |

3. На каждом пайплайне ставится `enabled: true` в `pipelineState`. Cron'ы (`bidTransitionRunner`, `monthlyReauditRunner`, `weeklyOpsBrief`) через `isPipelineEnabled()` проверяют этот флаг — не запускаются на отключённых клиентах.
4. UI отображает в боковой панели **единый виджет** `Google Ads — צינור הקמת קמפיין` с 5 шагами в вертикальном stepper'е (paid_profile → audit → gtm_setup* → conversions* → media_plan, где * только Full API).

**Развилка #1:** Если клиент уже активировал ранее интент `seo_organic` или `content_calendar`, эти пайплайны не дублируются — registry дедуплицирует.

**Развилка #2:** Если клиент позже отключит `paid_traffic` — `orphanedItemsCleaner.archiveOrphanedItems()` помечает все ранее созданные планы/задачи `archived: true`, не удаляя.

---

<a id="шаг-2"></a>
## Шаг 2 — OAuth подключения + scope normalization

**Где:** Дашборд → `הגדרות → Google integrations`. У клиента 3 (или 4) карточки: Google Ads, GA4, Tag Manager, Search Console (последняя — отдельный OAuth flow).

**Scopes которые мы запрашиваем (per карточка):**

| Карточка | Scope alias | Full URL |
|----------|-------------|----------|
| Google Ads | `ads` | `https://www.googleapis.com/auth/adwords` |
| GA4 | `analytics` | `https://www.googleapis.com/auth/analytics.readonly` |
| Tag Manager | `gtm` | `tagmanager.edit.containers + edit.containerversions + publish + readonly` |
| Search Console | `gsc` | `webmasters.readonly` |

**Scope normalization (системно):** dashboard сохраняет scopes коротким именем (`["ads", "gtm", "analytics"]`) или full URL — зависит от OAuth path. **`googleScopes.ts:normalizeGoogleScopes()`** — единственная точка истины для проверки capabilities. Каждый enricher (ga4Enrich, gtmInventory, gscEnrich, gscPagesEnrich) использует именно этот normalizer — устранена ошибка где `scopes.some(s => s.includes('tagmanager'))` падал на `'gtm'`.

**Token storage (системно):** OAuth tokens хранятся в **2 местах**:
1. `instances.googleTokens` (legacy top-level field)
2. `agent_integrations.{instance,agent_type,integration_type}.config` (новая система, per-agent OAuth)

**audit + media plan читают оба и merge'ят scopes**:
```js
const merged = [...new Set([...legacyScopes, ...integrationScopes])]
googleTokensForAudit = { ...integrationConfig, scopes: merged }
```
Это устраняет рассинхронизацию когда client добавил scope позже, но legacy field стейл.

**GSC отдельный OAuth:** `agent_integrations.gsc` имеет собственный refresh token со своим webmasters scope. mazhirAudit пробрасывает его отдельно от main `google` integration.

**Развилка по доступности:**

- **Branch A — Full API mode:** Все scope + `googleAdsConfig.customerId` + `process.env.GOOGLE_ADS_DEVELOPER_TOKEN`. Mazhir работает на 100%, executor пушит кампании напрямую.
- **Branch B — Degraded mode:** OAuth scope есть, но dev token / customer ID отсутствует. Audit + plan генерятся, push блокируется → запускается `mazhirManualExporter` для HTML/PDF.
- **Branch C — Не подключено:** Сетап-task `connect_google` красный, остальное недоступно. Pre-flight Data Coverage = 🔴.

**Особый случай — multiple GA4 properties (агентство):** OAuth user может иметь доступ к множеству properties (например, agency исполняет storage4you + Zing Music + 5 других клиентов). **Brand-root match (системно):**
1. `host = paidProfile.websiteUrl.split('.')[0]` → `"storage4you"`
2. Search через `accountSummaries` для property whose displayName содержит этот корень (с нормализацией пробелов/подчёркиваний)
3. Если match не найден — **аудит отказывается**, surface'ит явный error: `"No GA4 property matches brand 'storage4you'. Accessible: [...]. Set mazhirGa4PropertyId"`. **НЕ берёт `props[0]`** (это инжектило данные другого клиента).

**Та же логика для GTM** (account selection) и **GSC** (`sc-domain:` vs URL-prefix).

---

<a id="шаг-3"></a>
## Шаг 3 — Заполнение פרופיל קידום ממומן

**Поля и зачем:**

1. **Месячный бюджет (₪)** — определяет методологию + max CPC
2. **Главная цель** — `leadgen / ecommerce / awareness / store_visits / app_installs`
3. **Средняя стоимость сделки (₪)** — для расчёта target ROAS / max CPA
4. **LTV (если знаешь)** — позволяет дать tROAS вместо tCPA
5. **Decision cycle** — `same_day / 1-7 days / 7-30 days / 30+ days`
6. **Geography** — `country / city_list / radius`
7. **Existing Google Ads account?**
8. **Tracking stack** — `ga4 / gtm / callTracking / phoneCallsRelevant`
9. **Launch path** — `fix_first / launch_now`

**Дополнительно:** keyOffer, keyDifferentiators (3-5 USPs), historicalCpcIls, historicalConversionRatePct, historicalNotes, historicalReports (CSV/PDF файлы).

**Auto-fill системно (КРИТИЧНО):**

Если клиент оставил `historicalCpcIls`, `historicalConversionRatePct`, или `historicalNotes` пустыми — после первого аудита, `mazhirAudit` **заполнит их автоматически** на основе подключённых источников:

```ts
// Auto-derive после параллельных enrichments
if (!ppMutated.historicalCpcIls && csvAggs.totalClicks > 100) {
    ppMutated.historicalCpcIls = csvAggs.totalCost / csvAggs.totalClicks
    autoDerivations.push({ field: 'historicalCpcIls', from: 'CSV aggregation' })
}
if (!ppMutated.historicalConversionRatePct && ga4Data.available) {
    ppMutated.historicalConversionRatePct = ga4Data.totalConversions / ga4Data.sessionCount * 100
    autoDerivations.push({ field: 'historicalConversionRatePct', from: 'GA4 events/sessions' })
}
if (autoDerivations.length > 0) {
    // Persist to DB — следующие audits/plans видят как если клиент сам ввёл
    await db.update(instances).set({ researchData: { ...rd, paidProfile: ppMutated } })
}
```

**Также синхронизация trackingStack:** Если `ga4Data.available && !pp.trackingStack.ga4` → флаг исправляется на `true` и пишется warning. То же для GTM. Это устраняет рассинхронизацию когда клиент сказал "нет GA4" в onboarding, а позже подключил.

**savePaidProfile preserve fix (системно):** При сохранении профиля делает `...existing` spread + явно сохраняет `historicalReports` — раньше каждое сохранение профиля **стирало** загруженные файлы (баг). Сейчас файлы устойчивы.

**Файлы (CSV/PDF/изображения):** до 15 файлов, base64 в `paidProfile.historicalReports`. CSV парсятся `csvAggregator.aggregateAllCsvs()` → totals (cost/clicks/conversions/CTR/CPC/CPA), weekly trend (last 26 weeks), top by cost / by conversions. **Не первые 4000 байт сырого текста**, а реальные агрегаты.

---

<a id="шаг-4"></a>
## Шаг 4 — Pre-flight Data Coverage

**Где:** Дашборд → перед `הריצו אודיט` → кнопка `בדיקת נתונים`.

**Endpoint:** `GET /hosting/instances/:id/mazhir/data-preflight` — `runDataPreflight()` проверяет 11 источников, возвращает `{ overallReady: 'green' | 'yellow' | 'red', items: [...] }`.

**Что видит клиент:** Список с цветными индикаторами (зелёный/жёлтый/красный) + `whatWeLose` + `howToFix` per item.

**Развилка по статусу:**

- 🟢 **Green** — все critical items есть. Кнопка `הריצו אודיט` активна.
- 🟡 **Yellow** — critical есть, но >2 recommended отсутствуют. Кнопка активна, в `sourceCoverage` будут жёлтые badges.
- 🔴 **Red** — критичные источники отсутствуют. Кнопка доступна, но клиент видит большое предупреждение что результат будет неточным.

**Не блокируем по жёлтому/красному** — клиент имеет право работать с тем что есть. Audit честно покажет где пробелы.

---

<a id="шаг-5"></a>
## Шаг 5 — Запуск Mazhir Audit

**Триггер:** Клиент нажал `הריצו אודיט`. POST `/hosting/instances/:id/mazhir/audit` → `runMazhirAudit(instanceId)`.

### 5.1 Параллельный сбор 19 источников

| # | Источник | Service | Timeout |
|---|----------|---------|---------|
| 1 | GA4 conversion events | `ga4Enrich.ts` | 30s |
| 2 | GA4 audiences | `ga4DeepEnrich.ts` | 15s |
| 3 | GA4 demographics | `ga4DeepEnrich.ts` | 30s |
| 4 | GA4 funnel | `ga4DeepEnrich.ts` | 30s |
| 5 | GA4 seasonality (730d) | `ga4DeepEnrich.ts` | 30s |
| 6 | Google Ads metrics 90d | `googleAds.ts:getCampaignMetrics` | 30s |
| 7 | Google Ads recommendations | `googleAds.ts:getRecommendations` | 30s |
| 8 | Search Terms Report | `googleAdsDeepEnrich.ts` | 60s |
| 9 | Auction Insights | `googleAdsDeepEnrich.ts` | 60s |
| 10 | Change History | `googleAdsDeepEnrich.ts` | 60s |
| 11 | GTM tags inventory | `gtmInventory.ts` | 15s |
| 12 | GSC queries | `gscEnrich.ts` | 30s |
| 13 | GSC pages | `gscPagesEnrich.ts` | 30s |
| 14 | Call tracking | `callTrackingEnrich.ts` | 30s |
| 15 | DataForSEO | `dataforseoEnrich.ts` | 60s |
| 16 | Transparency Center | `googleAdsTransparency.ts` | 60s |
| 17 | PageSpeed Insights | `pagespeedInsights.ts` | 30s |
| 18 | Meta Ads Library | `metaAdsLibrary.ts` | 15s |
| 19 | CSV aggregator | `csvAggregator.ts` | (sync) |

**Все 19 имеют graceful failure** — если источник упал/недоступен, возвращает `{ available: false, reason }`. Аудит **не прерывается**.

### 5.2 sourceCoverage manifest + dataGaps registry

Server строит `sourceCoverage` (server-authoritative, не trust LLM), затем для каждого failed/missing вызывает **`buildDataGaps(coverage, primaryGoal)`** из `enrichmentContract.ts`:

```js
{
  key: 'searchTermsReport',
  label: 'Google Ads — Search Terms Report',
  impact: 'high',
  status: 'missing',
  reason: '...',
  consequenceIfMissing: 'ללא SQR — невозможно создать negatives на данных. Бюджет жжётся на нерелевантных кликах',
  fallbackStrategy: 'Используем 30-50 industry-specific negatives + manual weekly review',
  appliedBenchmark: 'CPC: ₪4-₪18 (WordStream IL leadgen 2024)'
}
```

**Источники benchmarks** в registry: WordStream IL 2024, Statista IL e-commerce 2025, Google Ads IL benchmark 2025, SE Land IL 2025-2026. **Не выдумано** — указаны конкретно в `notes` каждого entry.

### 5.3 Промпт Opus

Содержит:
- **Client context** (business name, audience, competitors)
- **Historical Performance Ground Truth** (real CPC, conv rate, notes — auto-derived если пусто)
- **Key Offer & Differentiators** (USPs)
- **Paid Profile** (все 9 полей)
- **Platform Capabilities** (что мы автоматизируем — GTM, Conversions)
- **Avg Deal Value Guidance** (если 0 — выведи heuristic, persisted в profile)
- **Math Sanity Check** (tCPA × expected ≈ budget)
- **All 19 enrichmentBlocks** (рендеры)
- **Existing Account Snapshot** (90d aggregate)
- **═══ DATA SOURCE COVERAGE MANIFEST ═══** (статус каждого источника)
- **═══ DATA GAPS & APPLIED FALLBACKS ═══** (registry-built per gap)
- **═══ DATA RECONCILIATION POLICY ═══** (приоритет: client memory > GA4 > Ads CSV > DFS > industry)
- **JSON schema** (с обязательным `derivation` для каждого числа)

### 5.4 Devil's Advocate (Sonnet)

После Opus: `runDevilsAdvocate({ apiKey, audit, paidProfile, sourceCoverage })` — Sonnet ищет 4-8 weaknesses, объединяет в `qualityWarnings`. Stop-words: math inconsistencies, hidden assumptions, missing-source dependencies, budget realism, methodology mismatch.

### 5.5 Audit Diff

Если есть prior audit, `computeAuditDiff(prev, curr)` находит изменения methodology / blockers / tracking score / projection ±20% / sources. Persist в `researchData.mazhirAuditDiff`.

### 5.6 Persist

```js
researchData.mazhirAudit       = audit (включает sourceCoverage, dataGaps, dataReconciliation, assumptions, qualityWarnings)
researchData.mazhirAuditDiff   = diff vs predyduschiy
researchData.mazhirAuditPrev   = previous audit (для следующего diff)
researchData.paidProfile       = ppMutated (auto-derived fields persisted)
```

**Длительность:** ~60-180 секунд (зависит от подключённых источников).

---

<a id="шаг-6"></a>
## Шаг 6 — Чтение результата аудита

**Структура modal:**

1. **סיכום** — 2-3 предложения executive summary + методология + estimated conversions/month
2. **🚫 Blockers**
3. **תשתית מעקב** (score + issues с severity)
4. **חשבון קיים** (если existing account)
5. **תוכנית פעולה** (immediate/shortTerm/ongoing)
6. **סיגנלים תעשייתיים** (keyword groups, competitor observations, seasonality)
7. **📈 שינויים מהאודיט הקודם** (если diff есть)
8. **📡 כיסוי מקורות נתונים** — таблица 22 источника с цветными статусами
9. **📉 פערי נתונים והשלמות** (dataGaps registry — per gap impact + consequence + fallback + benchmark)
10. **⚖ פיוס נתונים** (reconciliation conflicts)
11. **🧠 הנחות שעמדו בבסיס האודיט** (assumptions с confidence + ifWrongImpact)
12. **⚠ אזהרות איכות** (qualityWarnings)

**Развилка #6:** Если `dataReconciliation.requiresClientConfirmation = true` — жёлтое предупреждение, кнопка `בנו תוכנית מדיה` блокируется до подтверждения.

---

<a id="шаг-7"></a>
## Шаг 7 — GTM Auto-Setup (Full API only)

**Условия:** OAuth scope `tagmanager.edit.containers + tagmanager.publish` есть.

**Что делает `mazhirGtmSetup.ts`:**

1. Идемпотентная проверка inventory — не создаём существующее
2. Conversion Linker (если отсутствует)
3. GCLID Capture variable (90 дней localStorage)
4. awct (Google Ads Conversion) tag per primaryAction
5. gaawe (GA4 Event) tag для тех же событий
6. customEvent triggers связываются с тэгами
7. Enhanced Conversions config — flip в awct
8. Consent Mode v2 (default denied → granted при CMP signal)
9. Workspace publish — новая версия, live

**Развилка #8:** Тэги клиента (предыдущее агентство) с не-стандартными именами **не перезаписываются** — логируется в audit как "kept existing tags".

---

<a id="шаг-8"></a>
## Шаг 8 — Создание Conversion Actions (Full API only)

**Что делает `mazhirConversions.ts`:**

1. Читает `paidProfile.conversionTypes` + GA4 top events
2. Для каждого создаёт `ConversionAction` через Google Ads API:
   - `name: 'Mazhir — Lead'`
   - `type: WEBPAGE | WEBSITE_CALL`
   - `category: LEAD / PURCHASE / etc`
   - `value_settings: { default_value: avgDealValue }`
   - `count_type: ONE_PER_CLICK | MANY_PER_CLICK`
   - `attribution_model: GOOGLE_ADS_LAST_CLICK` (auto-flip к DATA_DRIVEN если ≥300 conv/30d)
3. Линкуется к GTM tags

**WhatsApp системно:** если GA4 показал `click_on_whatsapp` events > 50% от всех conversions — pipeline создаёт WhatsApp как **Primary Action** автоматически. План включает 6 Hebrew setup steps + Tag Assistant validation gate.

**Phone calls:** только если `phoneCallsRelevant=true` AND есть call tracking provider (CallRail/WhatConverts). Иначе `callExtensions: null` в плане (предотвращает API rejection on placeholder phone).

**PMax leadgen:** если в plan есть PMax campaign для leadgen, **обязательно** offline qualified-lead upload setup. Без него — blocker.

---

<a id="шаг-9"></a>
## Шаг 9 — Генерация Media Plan

**Триггер:** `▶ בנו תוכנית מדיה`. POST `/hosting/instances/:id/mazhir/media-plan`.

### 9.1 Подготовка контекста

**Pulls параллельно** (как audit):
- DFS keywords для seed terms
- GSC cannibalization signals (positions 1-3 — drop, 8-30 — paid candidates)
- Transparency Center competitor RSAs
- GA4 events / Demographics / Funnel / Seasonality (через тот же merged token что audit)

### 9.2 16 правил Mazhir PPC + IL-specific (системно)

**Keyword selection** — DFS validation, vol > 50, cpc < budget/30. Skip vol=0 noise.

**Headline diversity** — ZERO duplicates через ad groups. Каждая группа: ≥3 keyword-relevance, ≥2 USP, ≥2 CTA, ≥2 trust, ≥2 location.

**Conversion actions** — primaryActions содержит каждое значение из `paidProfile.conversionTypes`. WhatsApp обязательно при наличии `click_on_whatsapp` event в GA4.

**CPC caps** — `min(historic_cpc * 1.2, monthlyBudget/30/8)`.

**Budget utilization** — 70-90% от monthlyBudget/30 (не 60%).

**Location bid adjustments** — для local-radius `geo.bidAdjustments`.

**Display remarketing** — 10-15% от total budget, только website-visitors-30d, **НЕ prospecting**.

**IL Sunday workday rule (системно):**
```
Sunday = FIRST WORK DAY (Western Monday equivalent), +15-20% peak hours
Mon-Thu = full work days, +10% peak (09-13, 16-20)
Friday = half-day until 14:00, 0% adjustment
Saturday = paused entirely (-90% или exclude)
```

**Display/PMax cold-start (системно):** `NEVER MAXIMIZE_CONVERSIONS / tCPA / tROAS до 30+ conv в 30d`. Cold start week 1-4 = MAXIMIZE_CLICKS only. Output `bidStrategyTransition: { week1to4, weekTransitionGate, weekAfterTransition }` чтобы executor знал когда flip'ать.

**Geography expansion (GA4-driven, системно):** Если GA4 demographics показал top-converting cities OUT of paidProfile.geography — output `geo.recommendedExpansion: [{city, reason: 'GA4: 191 conv'}]`. UI рендерит зелёный блок `📍 הרחבת גיאוגרפיה`.

**Seasonality budget escalation (системно):** Если GA4 seasonality показал peak month within 60 days — output `budgetEscalation: {peakMonths, multiplier 1.3-1.5, recommendedExtraBudgetIls, rationale}`.

**Channel mix (Phase 1 — Search-only execution, Phase 2 — full funnel planned):**

Текущая реализация executor умеет полноценно создавать только **SEARCH** + **DISPLAY remarketing** кампании. Однако `mazhirMediaPlan` уже **выводит план будущей экспансии** в поле `recommendedChannelMix`:

```json
recommendedChannelMix: [
  { channel: "Search + Display Remarketing", when: "current launch", rationale: "...", estimatedExtraBudgetIls: 0, dependencies: [] },
  { channel: "Performance Max", when: "after 30+ conversions + offline upload pipeline", rationale: "...", estimatedExtraBudgetIls: 1500, dependencies: ["offline_conversion_upload"] },
  { channel: "Demand Gen", when: "month 2-3 if ecommerce", rationale: "...", estimatedExtraBudgetIls: 800, dependencies: ["video_assets_uploaded"] },
  { channel: "YouTube In-stream", when: "if awareness goal", rationale: "...", estimatedExtraBudgetIls: 1200, dependencies: ["brand_video_creative_ready"] }
]
```

**Логика рекомендации (системно через prompt rules):**
- Cold start всегда = Search + Display Remarketing
- `primaryGoal=leadgen` + offline upload pipeline → +PMax после 30+ conv
- `primaryGoal=ecommerce` + budget ≥ ₪10K → +PMax + Demand Gen
- `primaryGoal=awareness` → +YouTube + Discovery от week 2
- GA4 audiences strong returner signal → +Discovery remarketing

**UI рендерит:** секция `🎯 מיקס ערוצים — נוכחי + הרחבות עתידיות` показывает per-channel: **когда** добавлять, **rationale**, **дополнительный бюджет**, **зависимости** (например "video assets uploaded", "offline upload pipeline").

**Phase 2 roadmap** (не в текущей реализации):
- Asset upload UI (drag-drop image/video) → S3-like storage → linkage в plan
- `googleAds.ts` расширение для PMax / Video / Demand Gen API endpoints (Asset Groups, Customer Asset Sets, Audience Signals)
- Brand Book → automatic creative generation через media pipeline (fal.ai + ElevenLabs + Creatomate)
- Campaign type picker как первый шаг 0 в widget (toggle list with pre-checked recommendations)

**Landing page recommendations (системно):** Per ad group → `landingPageRecommendations[]` с:
- `adGroupName`
- `recommendedUrl` — конкретный URL
- `currentUrl` — текущий
- `status: "exists" | "recommended_to_create"`
- `contentBrief` — Hebrew brief: H1, ключевой текст, CTA, social proof, USP

### 9.3 JSON repair (5-level)

Если model вернула malformed JSON, `extractJson` пробует 5 strategies:
1. raw parse
2. sanitize control chars (\n/\r/\t inside strings)
3. strip trailing commas
4. aggressive cleanup (unquoted keys, single quotes, embedded `"` escaping)
5. auto-close walker (стек скобок/кавычек, дописывает missing closers)

Если всё провалилось — dump raw output в журнал в чанках 4K для диагностики.

### 9.4 applyGuardrails (post-process)

- Headline truncation > 30 chars / Description > 90 chars
- Headline duplicate detection через ad groups
- Conversion types parity (whatsapp_click — auto-add)
- Budget utilization check
- **Auto-fill `transitionToTcpa`** если model omitted (системно):
  ```ts
  suggestedCpa = historicalCpcIls / (historicalConversionRatePct/100) * 1.3
  // OR fallback: monthlyBudget / expectedConversions * 1.2
  ```
- **Display campaign cold-start override (системно):** `MAXIMIZE_CONVERSIONS → MAXIMIZE_CLICKS` если no 30+ conv history. Stamps `bidStrategyTransition` с gate.

### 9.5 Devil's Advocate Pass

После guardrails — Sonnet review ищет дыры в плане. Math consistency check: `(tCPA × expected) within 25% of monthlyBudget`. Если ratio < 0.5 или > 1.5 → warning.

### 9.6 Degraded mode HTML export

**Системно:** если `!hasFullAdsAPI` → `mazhirManualExporter.exportPlanAsManualHtml()` генерирует self-contained HTML doc и стампит в `plan.manualSetupHtml + manualSetupAvailable=true`. UI показывает кнопку `📄 מסמך ידני` → открывает в новой вкладке (Ctrl+P → save as PDF).

### 9.7 Persist

```js
researchData.mediaPlan = plan (включает qualityWarnings, transitionToTcpa, conversionTrackingPlan, landingPageRecommendations, budgetEscalation, manualSetupHtml)
agent_outputs row INSERT — outputType: 'media_plan', status: 'pending_review'
```

Telegram notification клиенту.

---

<a id="шаг-10"></a>
## Шаг 10 — Devil's Advocate (already covered above in 9.5)

---

<a id="шаг-11"></a>
## Шаг 11 — Утверждение клиентом

**Где:** Дашборд → таб `אישור תוצרים` (approval queue) или прямо в plan card.

**Кнопки:** `[✓ אשרו]` `[📝 תיקון]` `[📄 מסמך ידני]` (degraded only) `[⟲ ייצור מחדש]`.

### Развилка А: `✓ אשרו`
- `agent_outputs.status = 'approved'`
- Если **Full API**: автоматически `triggerPostApprove` → `mazhirExecutor.executeMediaPlan` пушит в Google Ads (см. шаг 12)
- Если **Degraded**: PDF/HTML doc уже доступен, клиент сам копирует в Google Ads UI

### Развилка Б: `📝 תיקון` (системно)

Endpoint `POST /hosting/instances/:id/mazhir/media-plan/revise` body `{ note: string (min 10 chars) }`:

1. Записывает `plan.revisionNote + revisionHistory[]`
2. `plan.status = 'awaiting_revision'`
3. **Async fire-and-forget** запускает `generateMediaPlan(instanceId)` повторно
4. Промпт injection: блок `═══ CLIENT REVISION REQUEST ═══` с инструкцией **MUST address EVERY concern, add `qualityWarnings entry "Revision N applied: <what changed>"`**
5. Telegram notify когда новый план готов (~2-3 минуты)

### Развилка В: `דחו`
- `status = 'rejected'`, archived

---

<a id="шаг-12"></a>
## Шаг 12 — Push в Google Ads (Full API mode)

**Триггер:** approval → `mazhir_executor.executePlan(planId)`.

### 12.1 Pre-flight (mazhirPreflight.ts)

Жёсткие проверки:
- `googleAdsConfig.customerId` есть
- OAuth scope `adwords` активен
- ConversionActions созданы и enabled, ≥1 имеет `primary_for_goal: true`
- `paidProfile` complete
- `mediaPlan.status === 'approved'`
- `trackingStack.ga4 + trackingStack.gtm` оба true

Если хоть один fail → 409 + список blockers + `remediation` инструкция.

### 12.2 Создание ресурсов (с bidContract)

Каждая campaign создаётся последовательно:

1. **CampaignBudget** через `customers.{}.campaignBudgets:mutate`
2. **Campaign** через `customers.{}.campaigns:mutate`:
   - `status: PAUSED` (всегда! enabled делает клиент через UI)
   - `bidding_strategy_type: campaign.bidStrategyTransition.week1to4` или `campaign.bidStrategy` (системно — defense-in-depth: TARGET_CPA/ROAS без 30+ conv → fallback на MAXIMIZE_CONVERSIONS)
   - `geo_targets`, `language`, `network_settings`, `start_date`, `end_date`
   - **Стампит `bidContract` на campaign metadata** для bidTransitionRunner
3. **AdGroup**, **Keywords**, **NegativeKeywords**, **ResponsiveSearchAd** (15 headlines, 4 descriptions), **Sitelinks/Callouts/StructuredSnippets**, **bid adjustments**

### 12.3 Error handling

- Retryable (rate limit, transient) → exponential backoff (3 retries)
- Validation (headline too long, keyword duplicates) → откат + save error в `agent_outputs.metadata.executionError` + Telegram alert

### 12.4 После успешного push

- `agent_outputs.metadata.googleAdsCampaignIds`
- `agent_outputs.status = 'pushed_paused'`
- Campaign в БД получает `googleAdsCampaignId, launchedAt, bidContract`
- Telegram: «✅ קמפיינים נוצרו (PAUSED). פתחו ב-Google Ads UI לאקטיבציה»

**Развилка #12 — Degraded mode:** PDF/HTML документ доступен через `manual.html` endpoint.

---

<a id="шаг-13"></a>
## Шаг 13 — Запуск кампании

**Состояние при создании:** Все campaigns в `PAUSED`. Намеренно:
- Даём клиенту время посмотреть структуру
- Избегаем "случайно потратили ₪500 за ночь"
- Даём GTM пикселю время разогреться (24-48h до Smart Bidding learning)

**Что делает клиент:** Через 24-48 часов входит в Google Ads UI → ENABLED.

**Что делаем мы:** `weeklyOpsBrief` cron начинает следить.

---

<a id="шаг-14"></a>
## Шаг 14 — Bid transition (auto-flip 30+ conv → tCPA) — НОВОЕ

**Файлы:** `bidTransitionRunner.ts`, `googleAdsTransitionExecutor.ts`.

**Cron:** ежедневно (после 6h boot delay).

**Logic per campaign with `bidContract` and not yet `transitionedAt`:**
1. Pull 30-day metrics через Google Ads API
2. **Gate 1:** `total conversions ≥ campaign.bidContract.triggerConvCount` (default 30)
3. **Gate 2:** `Enhanced Conversions + Consent Mode v2` cleared from `conversionTrackingPlan.blockers`
4. **Если оба gate pass** → создаёт `agent_outputs` row:
   - `outputType: 'bid_transition_proposal'`
   - `status: 'pending_review'`
   - Hebrew title + body с derivation
   - metadata: `{ campaignId, fromStrategy, toStrategy, targetCpaIls, conversionsLast30d, triggerThreshold }`
5. Telegram уведомляет клиента

**Approval flow (системно):**
- Клиент в queue видит: `🔁 מעבר אסטרטגיה לקמפיין X — 35 המרות נצברו`
- Нажимает `אשרו` → `triggerPostApprove` (в `outputs.ts`) детектит `outputType === 'bid_transition_proposal'`
- Вызывает `applyBidTransition(outputId)` → `googleAdsTransitionExecutor.updateCampaignBiddingStrategy`:
  - PATCH `customers.{}.campaigns:mutate` с `update_mask: target_cpa.target_cpa_micros`
  - Stamps `transitionedAt + activeBidStrategy + activeTargetCpaIls` на campaign
- В случае API failure — пишет `metadata.liveApiStatus: 'failed' + failureReason`

**НЕ auto-applies без approval** — bid changes affect spend, требуют клиентского ока.

---

<a id="шаг-15"></a>
## Шаг 15 — Еженедельная оптимизация

**Cron `weeklyOpsBrief`** Monday 09:00 IL:
1. Тянет 7d metrics через `getCampaignMetrics`
2. Тянет SQR за период
3. Actual CPA vs target — если > 1.5× → flag
4. Search Impression Share check — если < 50% и budget не capped → flag bid issue
5. Conversion count check — если 30+ → создаёт recommendation для tCPA transition (через bidTransitionRunner gates)
6. Quality Score check — если QS < 5 на топ keywords → flag "ad copy / LP mismatch"
7. SQR waste patterns → новые negatives candidates → adds в queue
8. Hebrew brief → Telegram + email

**Auto-apply pipeline (системно):**
- Negatives addition из SQR waste → auto-apply: true
- Pause явно failing ad groups (0 conv + spend > ₪500) → auto-apply: true
- Bid strategy change, budget rebalance → ВСЕГДА approval queue

---

<a id="шаг-16"></a>
## Шаг 16 — Ежемесячный re-audit (cron) — НОВОЕ

**Файл:** `monthlyReauditRunner.ts`.

**Cron:** hourly check, fires только если **`getUTCDate() === 1`**.

**Idempotency:** `researchData.lastMonthlyReauditAt = "2026-05"` → не перезапустит если cron retry'нет в тот же месяц.

**Eligibility:** `instance.status === 'running' && hasPriorAudit && pipelineActive('paid_search')`.

**Что делает:**
1. Запускает `runMazhirAudit(instanceId)` повторно — все 19 enrichments тянут актуальные данные
2. `computeAuditDiff(prev, curr)` находит:
   - Methodology shift (STAG → STAG+PMax если budget вырос + offline upload появился)
   - Новые/закрытые blockers
   - Сдвиг tracking score
   - Изменение estimated conversions ±20%
   - Новые/пропавшие источники
3. Если `diff.changes.length > 0` → Telegram уведомление с summary
4. UI в audit modal автоматически показывает "📈 שינויים מהאודיט הקודם" блок

**Развилка:** Если methodology изменилась → клиент видит recommendation: «методология обновилась с STAG на STAG+PMax потому что conv count достиг 50/мес и budget вырос до ₪10K — рекомендуется добавить PMax campaign».

---

<a id="карта-блокеров"></a>
## Карта блокеров и fallback'ов

| Блокер | Severity | Что блокирует | Как разблокировать |
|--------|----------|---------------|---------------------|
| GA4 не подключён | blocker | Audit | Подключить OAuth analytics scope |
| GTM не подключён | blocker | gtm_setup, executor | Подключить OAuth tagmanager scope |
| customerId пустой | high | executor (Full mode) | Выбрать аккаунт в настройках |
| developer token отсутствует | high | executor (Full mode) | Получить через MCC API Center → Degraded mode |
| paidProfile не заполнен | blocker | audit | Заполнить 9 вопросов |
| website URL пустой | blocker | audit | Добавить в research |
| phone calls relevant + нет call tracking | blocker | leadgen executor | Подключить CallRail/WhatConverts |
| PMax leadgen + нет offline upload | blocker | executor | Настроить qualified-lead upload pipeline |
| existing account, accountSnapshot.accessible = false | high | audit | Refresh OAuth + Customer ID |
| 0 conversions in CSV (no pixel) | warning, NOT blocker | nothing — reconciliation finds GA4 truth | Установить пиксель через gtm_setup |
| historicalCpcIls/CR пусто | warning | nothing — auto-derive из CSV/GA4 | Заполнить если хочешь override (auto-fill всё равно работает) |
| dataReconciliation.requiresClientConfirmation | warning | media plan | Подтвердить ground truth в UI |
| Enhanced Conversions не активен | blocker (для tCPA transition) | bidTransitionRunner | Run mazhir_gtm_setup pipeline или manual в GTM UI |
| Consent Mode v2 не установлен | blocker (для tCPA transition) | bidTransitionRunner | Same as above |
| GA4 property mismatch (другой клиент) | blocker | audit | Set explicit `mazhirGa4PropertyId` или починить OAuth scope |

**Fallback цепочка для отсутствующих данных (системно через `enrichmentContract` registry):**

1. **Нет GA4 events** → используем `client_memory` (historicalConversionRatePct) → CSV uploaded reports → industry benchmark (WordStream IL leadgen 2024)
2. **Нет CSV** → `client_memory` → GA4-derived → DataForSEO benchmarks → competitor transparency
3. **Нет ничего критичного** → industry generic + `confidence: low` в assumptions → `requiresClientConfirmation: true`
4. **Никогда не выдумываем** числа — если все источники пусты, рекомендация блокируется

---

<a id="системность"></a>
## Системность для всех новых пользователей

Каждый компонент описанный в этом документе **работает для любого instance**, не специфичен к одному клиенту:

| Компонент | Как обеспечивается универсальность |
|-----------|------------------------------------|
| `pipelineActivation` | gating через `isPipelineEnabled(instanceId, pipelineId)` — per-instance state |
| `bidTransitionRunner` cron | iterates `instances WHERE status='running' AND paid_search enabled` |
| `monthlyReauditRunner` cron | iterates same with idempotency через `lastMonthlyReauditAt` |
| `mazhirManualExporter` | auto-fires в `generateMediaPlan` для **любого** клиента где `!hasFullAdsAPI` |
| Revise endpoint | `POST /:id/mazhir/media-plan/revise` — per-instance generic |
| `googleScopes.normalizeGoogleScopes` | shared utility, used by все enrichers |
| Brand-root match (GA4/GTM/GSC) | derived из `paidProfile.websiteUrl`, generic |
| GSC sc-domain detection | listSites → priority match (sc-domain → URL-prefix → brand) generic |
| Auto-derive из CSV+GA4 | runs в audit для любого клиента |
| trackingStack auto-sync | runs в audit, исправляет flags на основе real connection state |
| dataGaps registry | централизованный `enrichmentContract.ts`, applies для каждого audit |
| `transitionToTcpa` autofill | runs в guardrails для каждого plan |
| Display cold-start override | runs в guardrails для каждого plan |
| IL Sunday workday rule | в plan prompt, applies для каждого IL клиента |
| Approval queue → triggerPostApprove → executor | wired для всех outputType (включая `bid_transition_proposal`) |

**Что НЕ системно (требует клиент-специфичного onboarding):**
- API ключи в `.env` Google Cloud project (`GOOGLE_ADS_DEVELOPER_TOKEN`, `META_APP_ID/SECRET`, etc) — общие для всей платформы, не per-client
- Per-client credentials (DFS API key, Google OAuth refresh tokens) — стандартный onboarding flow
- В Google Cloud project APIs (`analyticsadmin`, `tagmanager`, `searchconsole`, `pagespeedonline`) **должны быть enabled** на нашем project — один раз для всех клиентов

---

<a id="глоссарий"></a>
## Глоссарий и сокращения

- **STAG** — Single Theme Ad Group. Замена SKAG (мёртв с 2021).
- **SKAG** — Single Keyword Ad Group. Устарела.
- **Hagakure** — японская методология для high-volume e-commerce.
- **PMax** — Performance Max. Опасна для leadgen без offline upload.
- **DemandGen** — преемник Discovery Ads. Top-of-funnel awareness.
- **tCPA** — target CPA bidding. Требует ≥30 conv/30d.
- **tROAS** — target ROAS bidding. Требует ≥50 conv/30d + revenue tracking.
- **GCLID** — Google Click ID. Уникальный ID клика для атрибуции offline conversions.
- **GTM** — Google Tag Manager.
- **GSC** — Google Search Console.
- **GA4** — Google Analytics 4.
- **SQR** — Search Query Report (теперь Search Terms Report).
- **MCC** — My Client Center (Google Ads agency hierarchy).
- **QS** — Quality Score.
- **RSA** — Responsive Search Ad.
- **LP** — Landing Page.
- **USP** — Unique Selling Proposition.
- **DFS** — DataForSEO.
- **CMP** — Consent Management Platform.
- **bidContract** — Mazhir-specific structure stamped on campaign metadata, used by bidTransitionRunner.
- **bidStrategyTransition** — поле в plan campaign: `{ week1to4, weekTransitionGate, weekAfterTransition }`.
- **dataGaps** — array в audit output: per missing source с impact + consequence + fallback + benchmark.
- **enrichmentContract** — registry в `enrichmentContract.ts` со всеми 22 источниками + benchmarks.
- **brand-root match** — алгоритм выбора правильного GA4 property / GTM account / GSC site из множества доступных по domain root.

---

## Источники и цитирования

Методология основана на:
- Optmyzr / Adalysis 2024-2025 takeover playbooks
- Search Engine Land: Vallaeys 2025-2026 PPC trends + warning о PMax-leadgen
- Google Ads documentation v18
- Search Engine Journal: STAG vs SKAG migrations
- WordStream Israel benchmark 2024 (CPC ranges by industry)
- Statista IL e-commerce 2025 (conversion rates)
- Google Ads IL benchmark report 2025
- Mediagistic IL retail study 2024
- Реальная практика storage4you incident (2026-04-28) — отсюда требование к `historicalCpcIls / historicalConversionRatePct` + reconciliation policy + brand-root match.

## История изменений документа

- **2026-04-28 v1.0** — первая версия после внедрения 6 фаз hardening
- **2026-04-29 v2.1** — порядок и channel mix:
  - **Brand Foundation перенесён ДО marketing_config** (был после Google Ads pipeline)
  - **`mazhir_pipeline` widget gated на `hasBrandBook`** — paid pipeline блокируется красной задачей пока brand book не утверждён
  - **Brand Book context inject в `mazhirMediaPlan` prompt** — voice/tone/vocabulary/banned/tagline/colors/logo используются в headlines, descriptions, sitelinks, callouts, LP recommendations
  - **Channel mix awareness** в audit + plan: `recommendedChannelMix[]` — full-funnel roadmap (Search + Display now → PMax / Demand Gen / YouTube later)
  - UI рендерит секцию `🎯 מיקס ערוצים` в plan modal
  - audit `recommendedActions.shortTerm + ongoing` теперь обязаны включать channel-mix expansion suggestions
  - **Phase 2 roadmap добавлен:** asset upload UI, PMax/Video/DemandGen executor extensions, Brand Book → automatic creative generation, campaign type picker
- **2026-04-29 v2.0** — расширение post-launch automation:
  - **#1** bidTransitionRunner cron + applyBidTransition + queue post-approve handler
  - **#2** mazhirManualExporter HTML/PDF + download endpoint + UI button
  - **#3** monthlyReauditRunner cron — fires day-1 UTC только
  - **#4** revise-with-note flow + Opus prompt note injection
  - **#5** executor reads `bidStrategyTransition` + persists `bidContract` на campaign
  - + auto-derive historical fields из CSV+GA4 при пустых полях profile
  - + trackingStack auto-sync с real connection state
  - + brand-root match для GA4 property / GTM account / GSC site selection
  - + GSC sc-domain vs URL-prefix detection
  - + IL Sunday workday rule
  - + Display cold-start MAXIMIZE_CLICKS force override
  - + transitionToTcpa autofill в guardrails
  - + landingPageRecommendations системно
  - + Geography expansion из GA4 demographics
  - + Budget escalation для seasonality
  - + savePaidProfile preserve historicalReports fix
  - + scope normalization (gtm/tagmanager, gsc/webmasters)
  - + token merge legacy + agent_integrations
