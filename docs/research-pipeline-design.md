# Research Pipeline — Intent-Aware Architecture

**Status:** approved design, implementation pending
**Last updated:** 2026-05-05
**Owner:** Sergei (product) / Claude (implementation)

## 1. Why we're refactoring

Today there are two parallel research mechanisms with overlapping scope:

- **Generic 5-stage research** (`/setup/agents/research/stage`) — competitors,
  keywords, personas, strategy, validation. Universal but shallow on any
  specific channel.
- **SEO First Run** (`/seo/first-run`) — keyword research with real DataForSEO
  data, technical audit, content plan. SEO-deep but isolated.

A user with SEO-only intent ends up running both, getting two competitor
analyses (one AI-fabricated, one real-data), two keyword sets, and a
confused mental model. Code-side, prompts and stage logic are duplicated.

**Goal:** one adaptive research pipeline. Intent drives which stages run.
No duplication. Real data when integrations exist; honest, prominent
warnings when they don't.

## 2. Core principles

1. **One entry point, one widget.** Frontend pipeline UI reads the plan from
   backend and renders only the relevant stages.
2. **Stages are independent units.** Each has explicit `produces` /
   `consumes` / `requiredIntegrations`. Re-runnable individually.
3. **Real data preferred, AI fallback labeled.** When DataForSEO/Firecrawl/
   Brave/GSC integrations are missing, the stage runs degraded with a
   bright warning that the strategy built on this is at risk.
4. **Re-planning at runtime.** Users (or agents) can expand the plan
   without losing already-completed stages.
5. **No legacy paths.** When we delete the old endpoints, they're gone —
   not deprecated-but-still-routed. Migration is one-shot.
6. **Per-tenant integration keys.** Every API key (DataForSEO, Firecrawl,
   Brave, GSC OAuth) lives in `instances` columns or `agent_integrations`,
   never on the master server's `.env`. Tenants connect their own.

## 3. Intents

```ts
type ResearchIntent =
  | 'seo_organic'     // SEO + content marketing (blog, organic search, AEO)
  | 'paid_search'     // Google Ads / Meta paid (lead gen)
  | 'social_organic'  // IG/FB/LinkedIn organic posting
  | 'email_crm'       // Email/CRM nurturing
  | 'ecommerce'       // Shopify/Woo product feed driven
  | 'multichannel'    // Three or more of the above
```

Note: AEO (AI search visibility) is **inside** `seo_organic`, not its own
intent. See §6.

### 3.1 Auto-detection

After the user finishes פרופיל עסקי, we read `researchData.answers`:

```ts
function detectIntent(answers): ResearchIntent {
  const text = (answers.marketingGoals + ' ' + answers.platforms).toLowerCase()
  const hasSEO    = /seo|אורגנ|בלוג|תוכן/.test(text)
  const hasPaid   = /google ads|מודעות|פרסום ממומן|מטא ads|פייסבוק ads/.test(text)
  const hasSocial = /אינסטגרם|פייסבוק|לינקדאין|טיקטוק|רשתות חברתיות/.test(text)
  const hasEmail  = /מייל|אימייל|ניוזלטר|crm/.test(text)
  const hasEcom   = /shopify|woocommerce|חנות אונליין|מוצרים/.test(text)
  const count = [hasSEO, hasPaid, hasSocial, hasEmail, hasEcom].filter(Boolean).length

  if (count >= 3) return 'multichannel'
  if (hasSEO && !hasPaid) return 'seo_organic'
  if (hasPaid && !hasSEO) return 'paid_search'
  if (hasSocial) return 'social_organic'
  if (hasEmail) return 'email_crm'
  if (hasEcom) return 'ecommerce'
  return 'multichannel'
}
```

### 3.2 Visible confirmation

The wizard always shows the detected intent with a dropdown to override:

> 🎯 זיהינו את המטרה: **SEO + תוכן אורגני**
> זה נכון? [SEO + תוכן ▼] [שנה]

Stored in `researchData.intent`. Changing intent re-plans (see §7.3).

## 4. Stage catalog

| Stage ID | Category | Required Integrations | Produces |
|---|---|---|---|
| `competitor_landscape` | discovery | Brave or web | top-10 competitors, positioning matrix |
| `seo_keyword_research` | discovery | **DataForSEO** + Firecrawl | 30+ keywords (volume, CPC, difficulty), gaps |
| `aeo_visibility` | discovery | Anthropic + Firecrawl + GSC* | AEO score, AI citation count, schema gaps |
| `paid_audit` | discovery | Google Ads OAuth | account audit, history, blockers |
| `social_landscape` | discovery | Brave | competitor social patterns |
| `email_competitor_audit` | discovery | Anthropic | newsletter teardown |
| `audience_personas` | audience | Anthropic + GA4* | 1-3 personas |
| `positioning` | strategy | depends on prior | mission, positioning statement, value props |
| `strategy_options` | strategy | personas + positioning + intent data | Smart vs All-In scenarios with KPIs |
| `validation` | strategy | strategy_options | KPI realism check, blindspots |
| `content_plan` | execution | strategy committed | 3-month editorial calendar |
| `media_plan` | execution | strategy committed + paid_audit | Mazhir media plan |

`*` = optional but improves quality dramatically.

### 4.1 Plan resolver

```ts
const UNIVERSAL = ['audience_personas', 'positioning', 'strategy_options', 'validation']

function planForIntent(intent: ResearchIntent): StageId[] {
  switch (intent) {
    case 'seo_organic':
      return ['seo_keyword_research', 'aeo_visibility', 'competitor_landscape',
              ...UNIVERSAL, 'content_plan']
    case 'paid_search':
      return ['paid_audit', 'competitor_landscape',
              ...UNIVERSAL, 'media_plan']
    case 'social_organic':
      return ['social_landscape', 'competitor_landscape',
              ...UNIVERSAL, 'content_plan']
    case 'email_crm':
      return ['email_competitor_audit', ...UNIVERSAL, 'content_plan']
    case 'ecommerce':
      return ['paid_audit', 'seo_keyword_research', ...UNIVERSAL,
              'media_plan', 'content_plan']
    case 'multichannel':
      return ['competitor_landscape', 'seo_keyword_research', 'aeo_visibility',
              'paid_audit', 'social_landscape', ...UNIVERSAL,
              'content_plan', 'media_plan']
  }
}
```

## 5. Storage shape

```ts
interface ResearchData {
  answers: ProfileAnswers
  intent: ResearchIntent
  plan: {
    stages: StageId[]
    status: Record<StageId, StageStatus>
  }
  results: Record<StageId, StageResult>
  // Strategy outputs kept flat at top-level for legacy consumers
  // (Mazhir, Brand-Deep, contentPlan, mediaPlan all read these):
  chosenScenario?: ChosenScenario
  paidProfile?: PaidProfile
  mediaPlan?: MediaPlan
  contentPlan?: ContentPlan
}

interface StageStatus {
  state: 'pending' | 'running' | 'completed' | 'failed' | 'degraded'
  runAt?: string
  failureReason?: string
  // 'degraded' = ran without required integrations, AI fallback used.
  // Surfaces a prominent warning in UI.
  degradedReasons?: string[]
}

interface StageResult {
  content: string                           // markdown
  source: 'dataforseo' | 'firecrawl' | 'brave' | 'gsc' | 'anthropic' | 'mixed'
  runAt: string
  // For traceability — what integrations the stage actually used.
  integrationsUsed: string[]
}
```

Re-run = overwrite (no versioning per §10 Q4).

## 6. AEO sub-scope

`aeo_visibility` is the dedicated stage. Per Sergei: this is one of the
most important capabilities and must be implemented at depth.

### What it does

1. **Brand citation count** across AI platforms:
   - Query Anthropic (Claude), OpenAI (ChatGPT API), Perplexity, Gemini
     with parallel prompts: "Name 5 companies offering [category] in [geo]"
     in 5 phrasings × 3 languages
   - Count how often the tenant's brand is mentioned vs each competitor
   - Track exact wording: accurate? outdated? wrong?
2. **Site readiness for AEO** (via Firecrawl crawl + custom parser):
   - Schema.org structured data presence (Organization, FAQ, HowTo, Product)
   - JSON-LD vs microdata
   - FAQ schema coverage on relevant pages
   - Comparison tables markup
   - Sitemap + robots.txt sanity
3. **GSC AI-Overview signals** (when GSC connected):
   - Queries where the site appears but loses clicks to AI summaries
   - Queries where the site is **not** appearing but should be
   - Position trends after AI Overview launch dates
4. **Content recommendations**:
   - Pages needing FAQ schema
   - Comparison-format gaps ("X vs Y" content where competitors rank)
   - Authoritative-source enhancement (data, citations, expert quotes)
5. **Internal linking strategy**:
   - Cluster opportunities for topical authority
   - Anchor text optimization for AI extraction

### Output

Markdown report with:
- AEO score 0-100 (composite of citation rate + schema readiness)
- Citation table: brand mentions per platform per competitor
- Schema audit: 10-20 specific schema-tag fixes
- 5-10 content recommendations prioritized by impact
- 3-month AEO action plan

### Why it lives inside `seo_organic`, not standalone

AEO and traditional SEO share infrastructure (sitemap, schema, content
strategy) and target the same content artifacts. Splitting them invites
duplicate effort. AEO IS modern SEO.

## 7. API surface

```
POST   /research/plan              { intent? }    → resolves & stores plan
GET    /research/plan                              → current plan + status
POST   /research/stage/:stageId                    → runs single stage (idempotent)
GET    /research/stage/:stageId/status             → poll
POST   /research/plan/expand       { addIntents }  → adds intent without losing done stages
DELETE /research/plan                              → reset all (existing alias to resetResearch)
```

Each stage controller lives in its own file:

```
apps/api/src/controllers/hosting/research/
├── plan.ts                          # plan resolver, expand, status
└── stages/
    ├── competitor_landscape.ts
    ├── seo_keyword_research.ts
    ├── aeo_visibility.ts
    ├── paid_audit.ts                # delegates to existing mazhirAudit service
    ├── social_landscape.ts
    ├── email_competitor_audit.ts
    ├── audience_personas.ts
    ├── positioning.ts
    ├── strategy_options.ts
    ├── validation.ts
    ├── content_plan.ts              # delegates to existing planDraftRunner
    └── media_plan.ts                # delegates to existing mazhirMediaPlan
```

Each prompt in its own file:

```
apps/api/src/prompts/research/
├── competitor_landscape.prompt.ts
├── seo_keyword_research.prompt.ts
├── aeo_visibility.prompt.ts
└── ...
```

Goodbye 8000-line `agentSetup.ts`.

## 8. Re-planning runtime

### 7.1 User-initiated expand

```
User clicks "Add SEO to my plan" (currently paid_search intent)
  ↓
POST /research/plan/expand { addIntents: ['seo_organic'] }
  ↓
diff(currentPlan, planForIntent('paid_search') ∪ planForIntent('seo_organic'))
  → already done (kept):    audience_personas, positioning, paid_audit, ...
  → newly required:         seo_keyword_research, aeo_visibility
  → status: { seo_keyword_research: 'pending', aeo_visibility: 'pending' }
  ↓
strategy_options + validation marked 'pending' for re-run
(strategy must reflect the expanded channel mix)
```

### 7.2 Agent-initiated suggest

```
Mazhir notices: "User mentioned organic traffic decline — should also run aeo_visibility"
  ↓
PipelineService.suggestExpand({ stages: ['aeo_visibility'], reason: '...' })
  ↓
Notification card to user: "[Approve adding AEO research]" / "[Decline]"
  ↓
On approve → same expand flow as 7.1
```

### 7.3 Intent change (full re-plan)

```
POST /research/plan { intent: 'multichannel' }
  ↓
old plan archived (kept in `researchData.archivedPlans[]` for audit history)
new plan generated
universal stages preserved (personas, positioning) — only re-run strategy onwards
→ user sees warning: "Strategy will be re-run with new intent context"
```

## 9. Degraded-mode warnings

When a stage runs without its required integrations (per §3 principle 6),
we mark it `state: 'degraded'` and surface a **bright, prominent** warning.

### UI treatment

Stage card with degraded result shows:
- Red/amber border instead of green
- Header banner: "⚠ נתונים חלקיים — אין נתוני [DataForSEO/Firecrawl/GSC]"
- Body subtitle: "האסטרטגיה שתתבסס על השלב הזה — בסיכון. כדאי לחבר את השירותים החסרים ולהריץ מחדש."
- CTA: "[חברו עכשיו ←]" deep-links to integrations tab

### Strategy stage warnings

`strategy_options` and `validation` aggregate degradation status of upstream
stages. If any upstream stage was degraded, the strategy itself shows:

> ⚠ אסטרטגיה זו מבוססת בחלקה על הערכות AI ולא על נתונים אמיתיים.
> מקורות חסרים: DataForSEO, GSC.
> רמת ביטחון: בינונית. לפני הפעלה — מומלץ לחבר ולהריץ מחדש.

### Strict mode option (future)

User toggle in Settings: "Block strategy commit if any stage is degraded."
For sensitive verticals (medical, legal, finance) where AI hallucinations
have real cost.

## 10. Migration

One-shot script runs once during deploy. For every instance with legacy
`researchData.stage1..stage5`:

```ts
async function migrateInstance(inst) {
  const rd = inst.researchData as any
  if (!rd || rd.intent) return  // already migrated

  const detectedIntent = detectIntent(rd.answers || {})
  const plannedStages = planForIntent(detectedIntent)

  const results = {}
  const status = {}

  // Map legacy stage1..stage5 to new stage IDs.
  // This is a best-effort mapping for historical data.
  const legacyMap = {
    stage1: 'competitor_landscape',
    stage2: 'seo_keyword_research',
    stage3: 'audience_personas',
    stage4: 'strategy_options',
    stage5: 'validation',
  }
  for (const [legacy, modern] of Object.entries(legacyMap)) {
    if (rd[legacy]) {
      results[modern] = {
        content: rd[legacy],
        source: 'legacy_migration',
        runAt: rd[`${legacy}GeneratedAt`] || new Date().toISOString(),
        integrationsUsed: ['legacy'],
      }
      status[modern] = { state: 'completed', runAt: rd[`${legacy}GeneratedAt`] }
    }
  }

  // Pending status for stages that weren't run yet but are in the new plan.
  for (const stageId of plannedStages) {
    if (!status[stageId]) status[stageId] = { state: 'pending' }
  }

  const newRd = {
    answers: rd.answers,
    intent: detectedIntent,
    plan: { stages: plannedStages, status },
    results,
    // Preserved flat for downstream consumers:
    chosenScenario: rd.chosenScenario,
    paidProfile: rd.paidProfile,
    mediaPlan: rd.mediaPlan,
    contentPlan: rd.contentPlan,
  }

  // Strip ALL legacy keys (Sergei: "no leftover trash in the system").
  // Legacy stage1..stage5 keys are gone after migration; new code never
  // references them. Anything not in the new shape goes.
  await db.update(instances)
    .set({ researchData: newRd })
    .where(eq(instances.id, inst.id))
}
```

Idempotent: detects already-migrated instances by `rd.intent` presence and skips.
Safe: preserved fields (`chosenScenario` etc.) are exactly what Mazhir /
Brand-Deep / contentPlan consumers read.

## 11. Cleanup checklist

Before merging the refactor, verify:

- [ ] `researchStage` (5-fixed) controller deleted
- [ ] `buildResearchPrompt` (8 stage branches) deleted
- [ ] `seoFirstRun` controller deleted (logic moved to `seo_keyword_research` stage)
- [ ] All `RESEARCH_STAGE1.md` ... `STAGE5.md` artifact filenames on VPS
      replaced with stage-id filenames (`competitor_landscape.md`, etc.)
- [ ] All references to `rd.stage1..stage5` in the codebase removed
- [ ] All routes for old endpoints removed from `routes/hosting.ts`
- [ ] Frontend pipeline widget rewritten to read plan dynamically
- [ ] Brand-Deep gating moved from `researchStage4 || chosenScenario` to
      `results.audience_personas && results.positioning`
- [ ] No `// TODO`, `// HACK`, `// legacy-fallback` comments left in
      research-pipeline code
- [ ] Migration script run on production data; legacy keys verified gone

## 12. Brand-Deep gating

After refactor, Brand-Deep wizard activates when:
- `researchData.results.audience_personas` exists, AND
- `researchData.results.positioning` exists

`strategy_options` + `chosenScenario` provide bonus context (archetype
calibration, voice tone) but aren't strictly required.

## 13. Implementation phases

| Phase | Effort | Deliverable |
|---|---|---|
| 0. Design freeze | done | This doc |
| 1. Schema + plan resolver + migration | 1h | Types, `planForIntent`, migration script (idempotent), tests |
| 2. Stage controller scaffolding | 2h | Empty controllers per stage, file structure, route registration |
| 3. Migrate existing logic into stages | 3h | competitor_landscape, audience_personas, positioning, strategy_options, validation, content_plan, media_plan |
| 4. New stages | 3h | seo_keyword_research (real DataForSEO/Firecrawl), aeo_visibility (Anthropic citation tracking + GSC + schema audit), paid_audit (delegate Mazhir), social_landscape, email_competitor_audit |
| 5. Degraded-mode warnings + UI | 1h | Status flag, frontend banner, deep-links to integrations |
| 6. Frontend adaptive widget | 2h | Plan-driven rendering, expand intent UI, per-stage cards |
| 7. Cleanup | 30min | Delete legacy code, verify checklist (§11) |
| 8. Tests + smoke | 1h | Each stage individually, plan resolver edge cases, migration |

**Total ~13.5 hours, splittable into 2-3 sprints.**

## 14. Open questions for product (deferred)

1. **AEO multi-platform queries** — which AI platforms to check? Anthropic
   API costs to query at scale. Start with Claude only, expand later?
2. **Strict mode** for degraded-block-commit — when do we ship it?
3. **Stage cancellation** — user starts a 60s stage, wants to cancel.
   Need cancel endpoint + cleanup of in-flight resources?
4. **Concurrent stage runs** — currently `activeResearchRuns` blocks all.
   Should we allow multiple stages to run in parallel (independent ones)?
   Saves wall-clock time at cost of parallel API quota.

These don't block Phases 1-7. Pick up after first end-to-end ships.
