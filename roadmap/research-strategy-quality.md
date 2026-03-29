# Research & Strategy Quality System

## Current Problems (2026-03-29)

### 1. Wrong model for research
- Research runs via `openclaw agent --agent main` = מטה
- Uses gateway default model (gpt-4o), not סייר's Opus
- Sub-agents (סייר, מנתח) are SOUL.md instructions, not separate OpenClaw agents
- User selected Opus for סייר in dashboard but it's not used

### 2. Cached/short responses
- Agent remembers previous sessions → answers "already done"
- DB stores short cached response instead of full 16K report
- Strategy builds on bad data

### 3. No quality control
- No minimum length validation
- No required sections check
- No retry on short/bad response
- No user feedback loop

### 4. No error surfacing
- Rate limit errors silently swallowed
- User doesn't know what failed or why
- No fallback options presented to user

## Architecture Fix Required

### Model routing
Option A: Create separate OpenClaw agents for each sub-agent
- `openclaw agents create sayer --model claude-opus-4-6`
- Research calls `--agent sayer` explicitly
- Pros: real model isolation, proper routing
- Cons: 9 separate agent configs, complex

Option B: Override model per-request
- `openclaw agent --agent main --model claude-opus-4-6`
- Pass model from sub-agent config table
- Pros: simpler, uses existing main agent
- Cons: still one agent context

Option C: Model in prompt
- Tell מטה: "use claude-opus-4-6 for this task"
- Agent can't actually switch models mid-run
- Not viable

**Recommendation: Option B** — pass `--model` from dashboard sub-agent model selector

### Quality control pipeline
```
1. Run agent with research prompt
2. Validate response:
   - Length >= 3000 chars
   - Contains required headers (## מתחרים, ## מילות מפתח, etc.)
   - Not a cached/short reply
3. If validation fails:
   - Retry with fresh session + explicit "this is new, don't use cache"
   - Max 2 retries
4. If still fails:
   - Notify user: "המחקר לא הצליח — בחרו פעולה"
   - Options: retry / switch model / manual input
5. Save validated report to DB + VPS
```

### Error surfacing UX
```
┌─────────────────────────────────────────────┐
│ ⚠️ המחקר נתקל בבעיה                        │
│                                              │
│ הסוכן לא הצליח להשלים את המחקר.             │
│ סיבה: rate limit במודל GPT-4o               │
│                                              │
│ [נסו שוב]  [החליפו מודל ←]  [דלגו]         │
│                                              │
│ מודלים זמינים:                               │
│ ○ Claude Sonnet 4.6 (Anthropic)              │
│ ● GPT-4o (OpenAI) — rate limit              │
│ ○ Claude Haiku 4.5 (חסכוני)                 │
└─────────────────────────────────────────────┘
```

### Single source of truth for models
- Dashboard sub-agent model selector saves to AGENTS.md on VPS
- Research/Strategy endpoints read model from AGENTS.md (or DB)
- Cron jobs use the same model config
- No hardcoded model IDs in code

## Implementation Plan

### Phase 1: Fix research quality (priority)
- [ ] Pass --model from sub-agent config when running research
- [ ] Add response validation (length + sections)
- [ ] Retry with fresh session on short response
- [ ] Save full report (not cached) to DB

### Phase 2: Error surfacing
- [ ] On rate limit → show modal with model switch options
- [ ] Quick model fallback buttons
- [ ] מטה sends Telegram notification about failures
- [ ] System notification in ראשי with action buttons

### Phase 3: Model config unification
- [ ] Single model registry (packages/shared/src/models.ts)
- [ ] Dashboard selector → DB → AGENTS.md → cron/research
- [ ] Admin monitoring dashboard

## Priority: CRITICAL
This is the foundation of product quality. Without proper research,
all downstream work (strategy, content, campaigns) is compromised.
