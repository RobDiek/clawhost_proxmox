# Token Optimization — Applied Best Practices

## Problem
Every request to agent sent 72K tokens as system prompt.
Anthropic limit: 30K TPM. OpenAI Tier 1: 10K TPM.
Result: rate limit on every single interaction.

## Root Cause
OpenClaw loads ALL workspace files into system prompt on every request:
- USER.md (10K chars) + BRAND.md (10K chars) = 20K chars = ~7K tokens
- Chat history accumulating (15K+ chars)
- Skills (4K chars)
- Redundant files (BOOTSTRAP, TOOLS, IDENTITY = 4K chars)
- Tool schemas (~8K tokens, fixed overhead)

## Solution Applied (2026-03-28)

### 1. OpenClaw Config (`openclaw.json`)
```json
{
  "agents": {
    "defaults": {
      "bootstrapMaxChars": 12000,      // was 20,000
      "bootstrapTotalMaxChars": 50000, // was 150,000
      "bootstrapPromptTruncationWarning": "always",
      "compaction": {
        "reserveTokens": 40000,
        "keepRecentTokens": 25000,
        "reserveTokensFloor": 25000
      }
    }
  }
}
```

### 2. File Size Limits (enforced in Claude generation prompt)
- USER.md: max 1,500 chars (was 10,000+)
- BRAND.md: max 4,000 chars (was 10,000+)
- SOUL.md: < 3,000 chars
- AGENTS.md: < 2,500 chars
- MEMORY.md: index only, < 1,000 chars

### 3. Cleanup on Deploy
- Clear session history
- Remove BOOTSTRAP.md, TOOLS.md, IDENTITY.md (redundant)
- Remove non-working skills

## Result
72K tokens → 14.5K tokens per request. 5x reduction.

## Recommended File Sizes (per OpenClaw docs)
| File | Max Size | Purpose |
|------|----------|---------|
| SOUL.md | < 3KB | Personality, tone |
| USER.md | < 1.5KB | Business profile (condensed) |
| BRAND.md | < 5KB | Voice, pillars, CTAs |
| AGENTS.md | < 2KB | Model routing, rules |
| MEMORY.md | < 5KB | Index of facts |
| Skills | on-demand | Loaded only when invoked |

## Future Optimization
- Implement `memorySearch.softThresholdTokens: 3000` for smart memory pruning
- Consider `imageMaxDimensionPx: 800` for vision tasks
- Monitor with `bootstrapPromptTruncationWarning: "always"`
