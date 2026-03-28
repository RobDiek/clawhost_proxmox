# Google OAuth Integrations (Calendar, Drive, Ads)

## Overview
Системный OAuth flow для подключения Google-сервисов клиентов.
Первый сервис: Google Calendar. Архитектура покрывает все Google APIs.

## Architecture

### OAuth Flow
```
Dashboard: кнопка "חברו Google"
    ↓
API: GET /integrations/google/auth?scope=calendar&instanceId=xxx
    ↓
Redirect → Google Consent Screen
    ↓
User approves → Google redirects to callback
    ↓
API: GET /integrations/google/callback?code=xxx&state=instanceId
    ↓
Exchange code → access_token + refresh_token
    ↓
Save tokens to DB (instances.google_tokens)
    ↓
Deploy gcalcli credentials to VPS
    ↓
Dashboard shows "מחובר"
```

### Google Cloud Setup (one-time, our project)
1. Create Google Cloud project: "ClawFlow Integrations"
2. Enable APIs: Calendar, Drive (future), Ads (future)
3. OAuth Consent Screen: external, production
4. Create OAuth 2.0 Client ID (Web application)
5. Authorized redirect URI: `https://api.openclaw.flowmatic.co.il/hosting/integrations/google/callback`

### Database
```sql
ALTER TABLE instances ADD COLUMN google_tokens JSONB;
-- Structure: { accessToken, refreshToken, expiresAt, scopes[], email }
```

### API Endpoints
```
GET  /integrations/google/auth?scope=calendar&instanceId=xxx
     → redirects to Google OAuth
GET  /integrations/google/callback?code=xxx&state=xxx
     → exchanges code, saves tokens, redirects to dashboard
POST /integrations/google/disconnect?instanceId=xxx
     → revokes tokens, removes from DB + VPS
GET  /integrations/google/status?instanceId=xxx
     → returns connected scopes + email
```

### VPS Deployment
After OAuth success:
1. Install gcalcli on VPS: `pip install gcalcli`
2. Write OAuth credentials to `~/.gcalcli_oauth`
3. Agent can now use calendar skill

### Security
- Tokens encrypted in DB
- Refresh token rotation
- Scoped access (only calendar, not full Google account)
- Revoke on instance termination

## Implementation Steps

### Step 1: Google Cloud Project (Sergei manual)
- [ ] Create project on console.cloud.google.com
- [ ] Enable Calendar API
- [ ] OAuth consent screen (external)
- [ ] Create OAuth client credentials
- [ ] Add redirect URI

### Step 2: Backend OAuth Flow
- [ ] GET /integrations/google/auth — build OAuth URL, redirect
- [ ] GET /integrations/google/callback — exchange code, save tokens
- [ ] DB migration: add google_tokens column
- [ ] Deploy credentials to VPS via SSH

### Step 3: Frontend
- [ ] Dashboard: Google Calendar card with "חברו" button
- [ ] Status indicator (connected/disconnected)
- [ ] Disconnect button

### Step 4: Agent Integration
- [ ] Install gcalcli on VPS at provision time
- [ ] Deploy OAuth tokens after Google connect
- [ ] Verify agent can list/create events

## Google Workspace Scopes (all in one OAuth flow)

### Available at launch:
- `calendar.events` — Calendar: read/write events
- `drive.readonly` — Drive: read documents
- `gmail.send` — Gmail: send emails
- `spreadsheets` — Sheets: read/write data

### Phase C:
- Google Ads API (separate OAuth + business verification)

### UI: user selects which services to connect
```
┌─────────────────────────────────────────┐
│ חברו Google Workspace                   │
│                                         │
│ ☑ Google Calendar — ניהול אירועים       │
│ ☑ Google Drive — גישה למסמכים           │
│ ☐ Gmail — שליחת אימיילים               │
│ ☐ Google Sheets — נתונים ודוחות         │
│                                         │
│ [חברו חשבון Google →]                   │
└─────────────────────────────────────────┘
```

## Estimated Time: 1-2 days
