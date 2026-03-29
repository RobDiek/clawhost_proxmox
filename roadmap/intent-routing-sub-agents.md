# Intent-Based Routing & Real Sub-Agents

## Current State
- OpenClaw gateway sees only 1 agent: `main` (מטה)
- Sub-agents (סייר, מנתח, etc.) are SOUL.md instructions, not real agents
- All requests use default gateway model regardless of task type
- User-selected models in dashboard table are decorative for daily Telegram interactions

## Goal
מטה analyzes each request → routes to appropriate model:
- Simple question → Haiku (cheap)
- Research task → Opus (deep)
- Content writing → Sonnet (balanced)
- Calendar/simple action → GPT-4o (fast)

## Architecture Options

### Option A: AGENTS.md Routing Instructions (Quick)
Add explicit routing rules to SOUL.md:
```
כשמקבל משימה, בחר מודל:
- שאלה פשוטה / פעולה ביומן → השתמש במודל הנוכחי
- מחקר / ניתוח עמוק → בקש מהמערכת להריץ עם Opus
- כתיבת תוכן → בקש Sonnet
```
Limitation: agent can't actually switch models mid-conversation.

### Option B: Gateway Model Override per Session (Medium)
- Create named sessions with different models
- `openclaw agent --session-id research --model opus`
- מטה delegates by creating sub-sessions
- Each sub-session has its own model

### Option C: Register Real Sub-Agents in OpenClaw (Full)
```bash
openclaw agents create sayer --model anthropic/claude-opus-4-6
openclaw agents create et --model anthropic/claude-sonnet-4-6
```
- Each sub-agent is a separate OpenClaw agent with own model
- מטה delegates via agent routing
- Full isolation and model control

**Recommendation: Option B first, then C**

## Implementation Steps

### Phase 1 (Option B — medium effort)
- [ ] Research endpoint already uses --model flag
- [ ] Extend to cron jobs (pass model from DB config)
- [ ] Add model override to agent command in SOUL.md instructions

### Phase 2 (Option C — separate session)
- [ ] Register sub-agents in OpenClaw
- [ ] Set up routing bindings
- [ ] Update SOUL.md to delegate via agent references
- [ ] Test model isolation

## Priority: HIGH (next session)
