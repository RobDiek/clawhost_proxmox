# Strategy Quality Fix — CRITICAL

## Current Problem (2026-03-29)

Strategy pipeline produces 5.5/10 quality. Previous single-prompt Opus strategy was 8.5/10.

### Specific Issues Found

1. **Research context lost** — only 2000 chars per stage passed to strategy prompts.
   Real competitors (MyClaw.ai, EZClaws, OpenClawZero) replaced with hallucinated names.

2. **Unrealistic KPIs** — "200 new customers in 3 months" for a zero-traffic startup.
   No basis in research data.

3. **Personas degraded** — generic "Dan, 35" instead of research's detailed
   "שלמה המתמוטט" with specific triggers, channels, objections.

4. **Elevator pitch broken** — contained nonsensical text ("מיואם").

5. **Content calendar shallow** — "twice a month" without specific topic ideas.
   Previous Opus version had concrete article titles.

6. **Paid strategy empty** — no budgets, CPCs, audience definitions.

### Root Causes

1. **Context truncation** — 2000 chars per research stage = loss of critical details
2. **Model quality** — GPT-4o generates generic content. Anthropic Sonnet/Opus uses context better.
3. **No explicit data referencing** — prompts say "use research" but don't inject specific data points
4. **Multi-stage fragmentation** — 4 short outputs < 1 coherent long output

### What Worked Better (Previous Opus Strategy — 8.5/10)

- Single comprehensive prompt with full research in workspace
- Agent had access to complete RESEARCH_REPORT.md (16K chars)
- Opus model followed instructions more precisely
- Concrete competitor names, URLs, specific keyword recommendations
- Realistic budgets tied to business context

## Fix Plan

### Approach 1: Hybrid (Recommended)
- Use direct API with Anthropic Sonnet (not GPT-4o)
- Pass FULL research stages (not truncated) — they fit in Sonnet's 200K context
- Still 4 stages but each gets the complete picture
- Each stage prompt explicitly says "use these specific competitors: [list from research]"
- Validation: check output contains actual competitor names from research

### Approach 2: Single comprehensive call
- One API call with full research + comprehensive 9-section prompt
- Use Anthropic Sonnet with 8K max_tokens
- Higher coherence, but may miss depth in some sections
- Fallback if multi-stage quality is still poor

### Approach 3: Manus-style (Best quality, most complex)
- Research Phase: decompose into focused sub-tasks, each with web search
- Analysis Phase: synthesize findings with structured output
- Strategy Phase: generate strategy referencing specific data points
- Review Phase: self-critique and improve
- Each phase validates output quality before proceeding

## Prompt Engineering Improvements

### 1. Data injection (not reference)
BAD: "על סמך המחקר שביצעת"
GOOD: "המתחרים שנמצאו: 1) MyClaw.ai — אירוח מנוהל, $X/חודש 2) EZClaws — deploy ב-60 שניות..."

### 2. Output constraints
BAD: "כתוב אסטרטגיה"
GOOD: "כתוב אסטרטגיה שכוללת לפחות 3 אזכורים של מתחרים ספציפיים, 5 מילות מפתח מהמחקר, ו-2 פרסונות עם שמות"

### 3. Anti-hallucination
Add: "השתמש רק במידע שמופיע במחקר שלמעלה. אם אין לך מידע — כתוב 'לא נמצא במחקר' במקום להמציא."

### 4. Chain-of-thought
Each stage should start with "בוא נחשוב צעד אחר צעד:" before generating output.

### 5. Self-reflection
End of each stage: "בדוק: האם השתמשת בנתונים אמיתיים מהמחקר? האם ה-KPIs ריאליסטיים? האם הפרסונות מבוססות על המחקר?"

## Token Budget

Anthropic Sonnet context window: 200K tokens.
Full research (stages 1-4): ~27K chars = ~9K tokens.
Strategy prompt: ~3K chars = ~1K token.
Total per stage: ~10K tokens input + 8K output = 18K tokens.
Well within limits. No need to truncate.

## Implementation Priority

1. Switch strategy to Anthropic Sonnet (not GPT-4o fallback)
2. Pass FULL research data (not truncated 2000 chars)
3. Inject specific data points into prompts
4. Add anti-hallucination instructions
5. Add self-reflection step
6. Validate output references real research data

## Files to Modify
- apps/api/src/controllers/hosting/agentSetup.ts — STRATEGY_STAGES prompts
- apps/api/src/controllers/hosting/agentSetup.ts — buildStrategy function (context passing)

## Priority: CRITICAL
This is the core product value. Users pay for quality strategy, not generic advice.
