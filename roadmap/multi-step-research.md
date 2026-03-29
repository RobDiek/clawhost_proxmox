# Multi-Step Research + Data Integrations

## Current Problem
Research is a single agent call → agent responds from memory.
No real data (SERP volumes, keyword difficulty, competitor traffic).
Manus-style multi-step research produces significantly better results.

## Manus-Style Architecture

### How Manus does it better:
1. Decomposes research into 5-10 subtasks
2. Each subtask uses specialized tools (browser, search, scraper)
3. Intermediate results validated before next step
4. Final synthesis combines all data
5. Human-in-the-loop at key decision points

### Our Multi-Step Research Pipeline:
```
Step 1: Business Context Analysis
  → Read USER.md, BRAND.md
  → Identify gaps in knowledge
  → Generate research plan

Step 2: Competitor Discovery
  → Brave Search API: find competitors
  → Visit each competitor website (browser)
  → Extract: pricing, features, messaging, content
  → Save: competitors.json

Step 3: SERP & Keyword Research
  → Brave Search: target keywords
  → Ahrefs API (if connected): volumes, difficulty, SERP features
  → Identify keyword gaps vs competitors
  → Save: keywords.json

Step 4: Audience Research
  → Brave Search: forums, communities, Q&A
  → Reddit/Twitter analysis
  → Bright Data (if connected): deeper scraping
  → Save: audience.json

Step 5: Content Gap Analysis
  → Compare our content vs competitors
  → Identify opportunities
  → Prioritize by effort/impact

Step 6: Synthesis & Report
  → Combine all data
  → Generate RESEARCH_REPORT.md
  → Validate: all sections present, real URLs, real data
  → Present to user for review
```

## Data Integrations

### Tier 1: Free / Cheap (implement now)
- **Brave Search API** ($3/мес)
  - Real SERP results
  - Competitor discovery
  - Keyword suggestions
  - Skill: `openclaw skills install brave-search`

### Tier 2: Premium ($50-100/мес)
- **Ahrefs API** ($99/мес Lite)
  - Keyword volumes & difficulty
  - Backlink analysis
  - Competitor organic traffic estimates
  - SERP position tracking

### Tier 3: Enterprise ($200+/мес)
- **Bright Data**
  - Full website scraping
  - Price monitoring
  - Review aggregation
  - Social media data collection

### UX: Integration Suggestion Before Research
```
┌─────────────────────────────────────────────┐
│ 🔍 לפני שמתחילים — שפרו את המחקר           │
│                                              │
│ חברו כלים נוספים לתוצאות טובות יותר:         │
│                                              │
│ ☑ Brave Search — תוצאות חיפוש אמיתיות ($3)  │
│ ☐ Ahrefs — נפחי חיפוש ודירוג ($99)           │
│ ☐ Bright Data — סריקת אתרי מתחרים ($200+)   │
│                                              │
│ [חברו עכשיו ←]   [דלגו — הריצו בלי]         │
└─────────────────────────────────────────────┘
```

## User Feedback Loop
- After research/strategy generated → show in modal
- User can comment: "add more detail about X", "wrong competitor"
- Agent regenerates with feedback
- User approves final version
- Approved version becomes the working strategy

## Implementation Plan

### Phase 1 (next session)
- [ ] Brave Search skill integration
- [ ] Pre-research integration suggestion in UI
- [ ] Multi-step prompt (decompose into sub-tasks)

### Phase 2
- [ ] Ahrefs API integration (Premium add-on)
- [ ] Competitor monitoring cron job
- [ ] Keyword tracking dashboard

### Phase 3
- [ ] Bright Data integration
- [ ] Full competitor scraping pipeline
- [ ] Automated content gap analysis

## Priority: HIGH
This directly affects product quality and user perception.
