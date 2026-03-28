# Model Monitoring & Auto-Update System

## Problem
AI model IDs change without notice (deprecation, renaming, new versions).
Example: `claude-sonnet-4-5-20250514` didn't exist, caused silent 404 fallback
to empty templates. Users got broken experience without any alert.

## Requirements

### 1. Daily Model Availability Check (Cron)
- Cron job on management VPS: daily 06:00 UTC
- For each provider (Anthropic, OpenAI):
  - Call `/v1/models` endpoint
  - Compare with our hardcoded model list
  - If any model missing/deprecated: alert via Telegram to admin
  - Log results to DB for dashboard

### 2. Global Model Registry (Single Source of Truth)
- `packages/shared/src/models.ts` — single file defining all models
- Every component reads from here: agentSetup, dashboard UI, sub-agent selectors
- Structure:
  ```typescript
  export const MODELS = {
    anthropic: {
      opus: { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'premium' },
      sonnet: { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'standard' },
      haiku: { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'economy' },
    },
    openai: { ... },
    ollama: { ... },
  }
  ```
- Frontend fetches from API endpoint `/models/available`

### 3. Auto-Fallback Chain
- If primary model unavailable at runtime:
  - Sonnet → try previous Sonnet version → Haiku
  - Opus → try previous Opus → Sonnet
  - Log fallback event, alert admin if >3 fallbacks/day

### 4. Admin Dashboard Panel
- `/admin` page section: "Model Health"
- Table: provider | model | status (ok/deprecated/missing) | last checked
- Alert history: when models changed
- Manual override: update model IDs without code deploy

### 5. Client VPS Model Sync
- When model registry updates:
  - Update AGENTS.md on all running instances via SSH
  - Or: agents read model from API at runtime (preferred)

## Implementation Plan

### Phase 1 (Quick — 1 day)
- [ ] Create `packages/shared/src/models.ts`
- [ ] Refactor agentSetup.ts to use registry
- [ ] Refactor dashboard model selectors to use registry
- [ ] API endpoint: GET `/models/available?provider=anthropic`

### Phase 2 (Monitoring — 2 days)
- [ ] Cron job: daily model check script
- [ ] Telegram alert to admin on model changes
- [ ] Admin dashboard: model health table

### Phase 3 (Auto-update — 1 day)
- [ ] Auto-fallback chain in API calls
- [ ] Batch update AGENTS.md on client VPS when models change
- [ ] Log all fallback events

## Priority: HIGH
Last incident: 2026-03-28 — claude-sonnet-4-5-20250514 returned 404,
all USER.md/BRAND.md generations fell back to empty templates silently.
