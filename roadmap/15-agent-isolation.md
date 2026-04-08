# Agent Isolation — Per-Agent Integrations & Data Separation

> Приоритет: КРИТИЧЕСКИЙ · Влияние: Architecture, Security, UX
> Найдено: интеграция Telegram с MATEH видна также в Bare агенте

## Проблема

Текущая архитектура: **1 Instance = 1 VPS = 1 набор интеграций**.
Все агенты (MATEH, Bare, OC Personal) на одном инстансе делят:
- `telegramBotToken` / `telegramChatId`
- `googleTokens`
- `metaTokens` / `microsoftTokens`
- `openclawToken`
- Один subdomain, один IP

Когда пользователь подключает Telegram к MATEH — Bare тоже видит его как подключённый.
Это нарушает изоляцию и создаёт путаницу в UX.

## Корень проблемы

```
instances table:
  id: 64859775ca
  selectedComponents: ['mt', 'bare', 'ap', 'ol']
  telegramBotToken: ***     ← shared
  googleTokens: {...}       ← shared
  metaTokens: {...}         ← shared
```

Агенты — просто строки в массиве `selectedComponents`. Нет отдельной сущности "агент" в БД.

## Решение: Per-Agent Integration Storage

### Phase 1: Database (день 1)

Новая таблица `agent_integrations`:
```sql
CREATE TABLE agent_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT NOT NULL REFERENCES instances(id),
  agent_type TEXT NOT NULL,  -- 'oc' | 'mt' | 'bare'
  integration_type TEXT NOT NULL,  -- 'telegram' | 'google' | 'meta' | 'microsoft' | 'whatsapp'
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(instance_id, agent_type, integration_type)
);
```

Миграция существующих данных:
```sql
-- Перенести текущие интеграции к первому агенту
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config)
SELECT id, 
  CASE WHEN selected_components::jsonb ? 'mt' THEN 'mt'
       WHEN selected_components::jsonb ? 'oc' THEN 'oc'
       ELSE 'bare' END,
  'telegram',
  jsonb_build_object('botToken', telegram_bot_token, 'chatId', telegram_chat_id)
FROM instances WHERE telegram_bot_token IS NOT NULL;
-- Аналогично для google, meta, microsoft
```

### Phase 2: API endpoints (день 1-2)

Все integration endpoints получают параметр `agentType`:

**Было:**
```
POST /hosting/instances/:id/setup/telegram
  body: { botToken }
```

**Стало:**
```
POST /hosting/instances/:id/agents/:agentType/integrations/telegram
  body: { botToken }
```

Контроллеры:
- `setup.ts` → `setupTelegram(instanceId, agentType, botToken)`
- `google.ts` → `connectGoogle(instanceId, agentType, scopes)`
- `meta.ts` → `connectMeta(instanceId, agentType, config)`
- `auth.ts` → возвращает integrations per agent type

### Phase 3: Dashboard (день 2-3)

Dashboard передаёт `activeAgent` в каждый API запрос:

```javascript
// Было:
fetch(API + '/hosting/instances/' + instanceId + '/setup/telegram', ...)

// Стало:
fetch(API + '/hosting/instances/' + instanceId + '/agents/' + activeAgent + '/integrations/telegram', ...)
```

Integrations tab рендерит только интеграции текущего `activeAgent`.
При переключении агента — перезагрузка integration statuses.

### Phase 4: VPS-level isolation (день 3-4)

На VPS: каждый агент получает свой namespace в openclaw.json:
```json
{
  "agents": {
    "list": [
      {
        "id": "mt",
        "name": "MATEH",
        "channels": {
          "telegram": { "botToken": "...", "chatId": "..." }
        },
        "integrations": ["google-workspace", "meta"]
      },
      {
        "id": "bare",
        "name": "Bare",
        "channels": {},
        "integrations": []
      }
    ]
  }
}
```

## Что НЕ нужно менять

- **VPS остаётся один** — экономически нет смысла в отдельных VPS per agent
- **IP и subdomain общие** — nginx роутит на один OpenClaw gateway
- **Ollama общий** — модели доступны всем агентам (это ресурс VPS, не агента)
- **Automation tool общий** — n8n/Activepieces один на instance

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `apps/api/src/db/schema.ts` | Добавить `agentIntegrations` таблицу |
| `apps/api/src/db/migrations/` | Миграция данных |
| `apps/api/src/controllers/hosting/setup.ts` | Принимать agentType |
| `apps/api/src/controllers/hosting/google.ts` | Принимать agentType |
| `apps/api/src/controllers/hosting/meta.ts` | Принимать agentType |
| `apps/api/src/controllers/hosting/microsoft.ts` | Принимать agentType |
| `apps/api/src/controllers/hosting/whatsapp.ts` | Принимать agentType |
| `apps/api/src/controllers/hosting/auth.ts` | Возвращать per-agent integrations |
| `apps/api/src/routes/hosting.ts` | Новые routes с :agentType |
| `apps/web/public/dashboard.html` | Передавать activeAgent в API calls |

## Оценка

- Phase 1 (DB): 0.5 дня
- Phase 2 (API): 1 день
- Phase 3 (Dashboard): 1 день
- Phase 4 (VPS config): 1 день
- Тестирование: 0.5 дня
- **Итого: ~4 дня**

## Временный workaround (до полной реализации)

Dashboard может фильтровать отображение интеграций по `activeAgent`:
- MATEH: показывать все integration cards
- Bare: показывать только Ollama, скрывать Telegram/Google/Meta
- OC Personal: показывать Telegram + Google Calendar

Это не решает проблему на уровне данных, но убирает путаницу в UI.
