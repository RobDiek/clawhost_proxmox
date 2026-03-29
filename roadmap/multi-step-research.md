# Multi-Step Research Pipeline — Implementation Plan

## Current Agent Capabilities (no extra API keys needed)
- DuckDuckGo web search (built into OpenClaw)
- Browser (Chromium installed on VPS)
- File read/write
- Bash execution
- PDF analysis
- Image analysis

## Available with API Keys
- **Brave Search** — installed, needs BRAVE_API_KEY ($0 for 2000 req/mo)
- **Ahrefs** — not integrated yet, needs API subscription ($99/mo)
- **SparkToro** — not integrated yet ($50/mo)
- **Google Trends** — free, needs setup
- **Reddit API** — free, needs OAuth app
- **Meta Marketing API** — free, needs Facebook Business account
- **Google Ads API** — free, needs Google Ads account

## Pipeline Architecture

### Stage 1: DISCOVERY (agent: sayer, model: Opus)
```
Input: USER.md answers
Task: "Search the web for 5 competitors in [industry] in [market].
       For each: name, URL, what they do, pricing if visible.
       Also search for the business itself — what exists online?"
Validation: >= 3 competitors found with URLs
Output: competitors.json saved to workspace
User checkpoint: "Found these competitors — correct? Add/remove any?"
```

### Stage 2: KEYWORD RESEARCH (agent: meater, model: Sonnet)
```
Input: competitors.json + USER.md
Task: "Search for keywords related to [business].
       Use DuckDuckGo to find: what people search for,
       related questions (People Also Ask style),
       competitor keyword patterns from their content."
If Brave Search connected: use Brave API for better results
If Ahrefs connected: get real volumes and difficulty
Validation: >= 10 keywords found
Output: keywords.json
User checkpoint: "These keywords — anything to add?"
```

### Stage 3: AUDIENCE RESEARCH (agent: maazin, model: Sonnet)
```
Input: competitors.json + keywords.json
Task: "Search Reddit, forums, social media for discussions
       about [industry]. Find: pain points, questions,
       what people complain about, what they praise."
If SparkToro connected: get audience demographics
Validation: >= 2 personas created
Output: audience.json
User checkpoint: "These personas match your customers?"
```

### Stage 4: CHANNEL ANALYSIS (agent: menateach, model: Opus)
```
Input: ALL previous stage outputs
Task: "Analyze which channels are best for this business.
       Consider: audience location (from Stage 3),
       competitor presence (from Stage 1),
       content type fit, budget constraints."
If Meta API connected: get CPM/CPC estimates
If Google Ads connected: get keyword CPC estimates
Validation: >= 3 channels recommended with reasoning
Output: channels.json
User checkpoint: "These channels — agree? Priority?"
```

### Stage 5: STRATEGY SYNTHESIS (agent: menateach, model: Opus)
```
Input: ALL stage outputs + user feedback from checkpoints
Task: Generate full 9-section strategy document
No web search needed — pure analysis of collected data
Validation: >= 3000 chars, all 9 sections present
Output: STRATEGY.md + DB
User checkpoint: "Review, edit, approve"
```

## API Implementation

### New endpoint: POST /setup/agents/research/pipeline
```typescript
{
  stage: 1 | 2 | 3 | 4 | 5,
  feedback?: string,  // user corrections from previous stage
  skipToStrategy?: boolean  // skip remaining stages, go to synthesis
}
```

### Response:
```typescript
{
  stage: number,
  status: 'completed' | 'needs_review',
  result: string,  // stage output for user review
  nextStage: number | null,
  availableIntegrations: string[],  // suggest what to connect
}
```

### Frontend UX:
```
┌─────────────────────────────────────────┐
│ מחקר שוק — שלב 1 מתוך 5              │
│ ████████░░░░░░░░░░░░ 20%               │
│                                         │
│ 🔍 גילוי מתחרים                        │
│                                         │
│ [Results appear here]                   │
│                                         │
│ הערות: [textarea]                       │
│                                         │
│ [← חזרה] [המשיכו לשלב הבא →] [דלגו]   │
│                                         │
│ 💡 חברו Brave Search לתוצאות טובות יותר │
└─────────────────────────────────────────┘
```

## Integration Cards in תוספים

### New section: "כלי מחקר"
- Brave Search API (free tier: 2000/mo)
- Google Trends (free)
- Reddit API (free)

### Premium section: "כלי מחקר מתקדמים"
- Ahrefs ($99/mo)
- SparkToro ($50/mo)
- SimilarWeb ($200+/mo)
- Bright Data ($200+/mo)

## Priority
Phase 1 (now): Build pipeline with DuckDuckGo + browser (no extra keys)
Phase 2: Add Brave Search integration
Phase 3: Premium integrations (Ahrefs, SparkToro)
