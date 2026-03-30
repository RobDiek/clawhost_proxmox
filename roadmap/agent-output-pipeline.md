# Agent Output Pipeline — Production Design
## 2026-03-30

## Problem
Dashboard shows placeholder tasks. Users can't see real agent output (reports, content, media) before approving. No persistence of agent work between sessions.

## Full Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  VPS (OpenClaw Gateway)                                         │
│                                                                 │
│  Cron trigger (daily/weekly/monthly)                            │
│       ↓                                                         │
│  Agent runs (sayer → menateach → et → yotzer → shaliach)        │
│       ↓                                                         │
│  Output written to: agents/{name}/output/latest.json            │
│       ↓                                                         │
│  Post-execution hook: curl POST → Management API                │
│  OR: Management API polls VPS every 5 min                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Management API (Hono.js)                                       │
│                                                                 │
│  POST /hosting/instances/:id/outputs/ingest                     │
│  - Receives agent output (text, media URLs, metadata)           │
│  - Validates format                                             │
│  - Saves to agent_outputs table                                 │
│  - Status = 'pending_review'                                    │
│  - Sends Telegram notification: "יש תוכן חדש לאישור"           │
│                                                                 │
│  GET /hosting/instances/:id/outputs                             │
│  - Returns all outputs with filters (status, agent, type, date) │
│  - Dashboard polls this                                         │
│                                                                 │
│  PATCH /hosting/instances/:id/outputs/:id/approve               │
│  - Status → 'approved'                                          │
│  - Triggers shaliach to publish                                 │
│                                                                 │
│  PATCH /hosting/instances/:id/outputs/:id/reject                │
│  - Status → 'rejected' + reason                                 │
│  - Notifies agent to regenerate                                 │
│                                                                 │
│  PATCH /hosting/instances/:id/outputs/:id/edit                  │
│  - User edits content before approval                           │
│  - Saves edited version, keeps original                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard (Frontend)                                           │
│                                                                 │
│  Approval Queue (משימות פעילות)                                 │
│  - Polls GET /outputs every 30 sec                              │
│  - Shows real content, media, agent info                        │
│  - Click → popup with full content + approve/edit/reject        │
│                                                                 │
│  Calendar (לוח תוכן)                                            │
│  - Maps outputs to dates                                        │
│  - Color-coded by status                                        │
│  - Click → same popup                                           │
│                                                                 │
│  Notifications (עדכונים והמלצות)                                 │
│  - "יש 3 פריטים חדשים לאישור"                                   │
│  - "Daily Brief נשלח בהצלחה"                                    │
│  - "שגיאה: סוכן עט נכשל — נסו שוב"                             │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
CREATE TABLE agent_outputs (
    id              TEXT PRIMARY KEY DEFAULT nanoid(12),
    instance_id     TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,

    -- What
    agent_role      TEXT NOT NULL,       -- 'sayer', 'et', 'yotzer', 'mateh', etc.
    output_type     TEXT NOT NULL,       -- 'daily_brief', 'weekly_report', 'content_post',
                                        --  'media_image', 'aeo_audit', 'competitive_scan'
    title           TEXT NOT NULL,       -- Human-readable title
    content         TEXT,                -- Main text content (markdown)
    content_html    TEXT,                -- Pre-rendered HTML (optional)

    -- Media
    media_url       TEXT,               -- URL to image/video (on VPS or CDN)
    media_type      TEXT,               -- 'image/png', 'video/mp4', etc.
    media_meta      JSONB,              -- { width, height, alt_text, platform }

    -- Context
    platform        TEXT,               -- 'instagram', 'linkedin', 'blog', 'telegram', etc.
    scheduled_for   TIMESTAMPTZ,        -- When to publish (from strategy calendar)
    metadata        JSONB,              -- { model, tokens, duration, session_id, pillar }

    -- Workflow
    status          TEXT NOT NULL DEFAULT 'pending_review',
                    -- pending_review → approved → published
                    -- pending_review → rejected
                    -- pending_review → edited → approved → published

    edited_content  TEXT,               -- User's edited version (keeps original)
    rejection_reason TEXT,
    approved_at     TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_outputs_instance ON agent_outputs(instance_id);
CREATE INDEX idx_agent_outputs_status ON agent_outputs(instance_id, status);
CREATE INDEX idx_agent_outputs_scheduled ON agent_outputs(instance_id, scheduled_for);
```

## Output Types & Their Content

| Type | Agent | Content | Media | Platform | Frequency |
|------|-------|---------|-------|----------|-----------|
| daily_brief | mateh | Summary text (markdown) | — | Telegram | Daily 07:00 |
| weekly_report | sayer+menateach | Analysis (markdown tables) | — | Telegram | Monday 08:00 |
| content_post | et | Post text + hashtags | Optional image | Instagram/LinkedIn/Blog | Per strategy |
| media_image | yotzer | Alt text, caption | Image file | Per content_post | On demand |
| aeo_audit | migdalor | Audit report (markdown) | — | Telegram | Monthly 1st |
| competitive_scan | sayer | Competitor changes | — | Internal | Weekly |
| content_idea | menateach | Topic + brief | — | Internal | On demand |

## Popup Layouts Per Type

### daily_brief
```
┌─ Daily Brief ─────────────────────────────────────┐
│ [פורסם] סוכן: מטה · היום 07:00                    │
│                                                    │
│ ┌─ תוכן ──────────────────────────────────────┐   │
│ │ פעילויות אתמול:                              │   │
│ │ 1. פורסמו 2 מאמרים בבלוג...                  │   │
│ │ 2. העלאת סרטון הדרכה חדש...                  │   │
│ │                                              │   │
│ │ משימות עדיפות להיום:                         │   │
│ │ 1. יצירת 3 reels לאינסטגרם...               │   │
│ │ 2. כתיבת סקירה חודשית...                    │   │
│ └──────────────────────────────────────────────┘   │
│ ערוץ: Telegram · תדירות: א-ה, 07:00              │
│                                          [סגרו]   │
└────────────────────────────────────────────────────┘
```

### content_post
```
┌─ פוסט לאינסטגרם ──────────────────────────────────┐
│ [ממתין לאישור] סוכן: עט · מתוכנן ל: 31/03        │
│                                                    │
│ ┌─ תוכן ──────────────────────────────────────┐   │
│ │ 🎯 מה זה OpenClaw ואיך הוא עוזר לעסק שלך?  │   │
│ │                                              │   │
│ │ אם יש לכם עסק קטן או בינוני בישראל,        │   │
│ │ כנראה שאתם מכירים את הכאב...                │   │
│ │ [טקסט מלא של הפוסט]                         │   │
│ │                                              │   │
│ │ #OpenClaw #AI #שיווקדיגיטלי                 │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ ┌─ מדיה ──────────────────────────────────────┐   │
│ │ [תמונה/carousel preview]                     │   │
│ │ 1080×1080 · Instagram · Carousel             │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ פלטפורמה: Instagram · עמוד תוכן: OpenClaw בעברית │
│                                                    │
│ [דחו]  [תקנו]  [אשרו ←]                          │
└────────────────────────────────────────────────────┘
```

### weekly_report
```
┌─ דוח תחרותי שבועי ────────────────────────────────┐
│ [ממתין לאישור] סוכנים: סייר → מנתח → עט           │
│                                                    │
│ ┌─ ניתוח מתחרים ──────────────────────────────┐   │
│ │ | מתחרה | שינוי | השפעה |                    │   │
│ │ | UniClaw | מחיר חדש $29 | בינונית |          │   │
│ │ | EasyClaw | פיצ'ר חדש | גבוהה |              │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ ┌─ הזדמנויות ─────────────────────────────────┐   │
│ │ 1. מילת מפתח "openclaw hosting" ירדה ב-3... │   │
│ │ 2. מתחרה X לא מכסה נושא Y...               │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ ┌─ הצעות תוכן (2 פוסטים מוכנים) ──────────────┐   │
│ │ 📝 פוסט 1: "השוואה: OpenClaw vs ChatGPT"    │   │
│ │ 📝 פוסט 2: "5 טיפים לשיווק עם AI"          │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ [דחו]  [תקנו]  [אשרו ←]                          │
└────────────────────────────────────────────────────┘
```

## Capture Mechanism: VPS → API

### Option A: Post-execution hook (recommended)
Add to each cron job a POST callback after agent completes:

```bash
# In HEARTBEAT.md or cron command
openclaw cron add \
  --name "daily-brief" \
  --cron "0 7 * * 0-4" \
  --message "הכן Daily Brief..." \
  --session isolated \
  --on-complete "curl -s -X POST https://api.openclaw.flowmatic.co.il/hosting/instances/INSTANCE_ID/outputs/ingest \
    -H 'Authorization: Bearer GATEWAY_TOKEN' \
    -H 'Content-Type: application/json' \
    -d '{\"agent\":\"mateh\",\"type\":\"daily_brief\",\"content\":\"$OUTPUT\"}'"
```

Problem: OpenClaw cron `--on-complete` may not exist as a feature.

### Option B: API polls VPS (simpler, works now)
Management server SSH polls VPS every 5 min:

```typescript
// services/outputSync.ts
async function syncAgentOutputs(instanceId: string) {
    const instance = await getInstance(instanceId)

    // Read latest session output
    const sessions = await sshExec(instance.ip,
        `su - openclaw -c 'openclaw sessions list --json --limit 5'`,
        instance.rootPassword
    )

    // Read agent output files
    const agents = ['sayer', 'menateach', 'et', 'yotzer', 'shaliach', 'migdalor']
    for (const agent of agents) {
        const output = await sshExec(instance.ip,
            `cat /home/openclaw/.openclaw/agents/${agent}/output/latest.json 2>/dev/null`,
            instance.rootPassword
        )
        if (output) {
            await upsertAgentOutput(instanceId, agent, JSON.parse(output))
        }
    }
}
```

### Option C: Telegram bot intercepts (hybrid)
Bot already receives agent messages. Add middleware to store them:

```typescript
// When bot receives message from agent session
bot.on('message', async (msg) => {
    // If message is from an agent session (not user)
    if (isAgentOutput(msg)) {
        await db.insert(agentOutputs).values({
            instanceId,
            agentRole: detectAgent(msg),
            outputType: detectType(msg),
            content: msg.text,
            status: 'pending_review',
        })
    }
})
```

## Implementation Order

1. **DB table** — agent_outputs schema + migration
2. **Ingest endpoint** — POST /outputs/ingest (accepts agent output)
3. **Sync service** — SSH poll VPS every 5 min for new outputs
4. **CRUD endpoints** — GET/PATCH for dashboard
5. **Dashboard integration** — approval queue reads from API
6. **Telegram notification** — "יש תוכן חדש לאישור" when new output arrives
7. **Publish flow** — approve → shaliach publishes → status = published

## Files to Create/Modify

### New files:
- `apps/api/src/db/schema.ts` — add agentOutputs table
- `apps/api/src/controllers/hosting/outputs.ts` — CRUD controller
- `apps/api/src/services/outputSync.ts` — VPS polling service

### Modified files:
- `apps/api/src/routes/hosting.ts` — add output routes
- `apps/web/public/dashboard.html` — connect to real API
- `apps/api/src/services/telegram.ts` — notification on new output
