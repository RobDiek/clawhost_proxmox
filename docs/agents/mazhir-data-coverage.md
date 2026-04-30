# Mazhir — Reference Data Coverage

> **Purpose:** Before Mazhir gives any recommendation that affects a client's
> ad budget, this document is the single source of truth for **what data
> sources a senior PPC consultant would consult** vs. **what we actually pull**.
>
> Every gap is either: (a) closed in code, (b) explicitly disclosed to the
> client in the audit's `sourceCoverage` block, or (c) blocked from launch.
>
> Maintainer rule: **if you add a recommendation type to Mazhir, you update
> this document first.** No exceptions.

---

## Coverage matrix

Legend:
- `✓` — fully integrated
- `◐` — partial (limited, see notes)
- `✗` — not integrated, surfaced as gap
- `→` — replaced by alternative (see notes)

### Tier 1 — Conversion truth (can't operate without)

| # | Source | Coverage | Service | Notes |
|---|--------|----------|---------|-------|
| 1 | GA4 conversion events | ✓ | `ga4Enrich.ts` | 365d, multi-event filter, sessions for CR |
| 2 | GA4 audiences | ✗ | (planned phase 3) | Remarketing segments already configured by client |
| 3 | GA4 demographics + tech | ✗ | (planned phase 3) | Required for location/device bid adjustments |
| 4 | GA4 funnel/path exploration | ✗ | (planned phase 3) | Where users drop pre-conversion |
| 5 | GA4 multi-year seasonality | ✗ | (planned phase 3) | 730d trend for IL seasonal businesses |
| 6 | Google Ads native conversions | ✓ | `googleAds.ts` getCampaignMetrics | Last 90d aggregate |
| 7 | Google Ads search terms (SQR) | ✗ | (planned phase 2) | n-gram waste analysis without this = guessed |
| 8 | Google Ads auction insights | ✗ | (planned phase 2) | Impression share, top-of-page rate |
| 9 | Google Ads change history | ✗ | (planned phase 2) | Explains historical performance shifts |
| 10 | Google Ads recommendations | ✓ | `googleAds.ts` getRecommendations | Top 8 |
| 11 | Search Console queries | ✓ | `gscEnrich.ts` | Cannibalization + paid-lift candidates |
| 12 | Search Console pages | ✗ | (planned phase 6) | Landing-page ranking signal |
| 13 | Call tracking duration/quality | ✗ | (planned phase 2 if connected) | CallRail / WhatConverts API |
| 14 | WhatsApp Business webhook | ✗ | (planned phase 6) | #1 lead channel for IL SMB |
| 15 | Client historical memory | ✓ | `paidProfile.historicalCpcIls / historicalConversionRatePct / historicalNotes` | Free-text + numeric ground-truth |
| 16 | Uploaded CSV/PDF reports | ◐ | `paidProfile.historicalReports` (raw 4K preview) → **phase 2 server-aggregation** | Currently raw text preview, agent should see aggregates |

### Tier 2 — Market signal (needed for keyword/budget planning)

| # | Source | Coverage | Service | Notes |
|---|--------|----------|---------|-------|
| 17 | DataForSEO Keyword Planner | ✓ | `dataforseoEnrich.ts` | IL geo, Hebrew, vol/CPC/comp/YoY |
| 18 | Google Ads Keyword Planner native | ✗ | (planned phase 6) | Client already pays Ads — alternative when DFS unavailable |
| 19 | PageSpeed Insights | ✓ | `pagespeedInsights.ts` | Mobile, Core Web Vitals, QS signal |
| 20 | Google Ads Transparency Center | ✓ | `googleAdsTransparency.ts` | Competitor active creatives |
| 21 | Meta Ads Library | ✗ | (planned phase 6) | IL competitors crowd Meta heavier than Google |
| 22 | Competitor pricing scrape | ✗ | (planned phase 6) | Required for value-position copy |

### Tier 3 — Tracking infrastructure inventory

| # | Source | Coverage | Service | Notes |
|---|--------|----------|---------|-------|
| 23 | GTM existing tags inventory | ✗ | (planned phase 2) | Avoid duplicate tag creation |
| 24 | GTM existing triggers | ✗ | (planned phase 2) | Same |
| 25 | GTM workspace/version status | ◐ | `mazhirGtmSetup.ts` (write-only) | We push, we don't audit current |

### Tier 4 — Reasoning safety (for the agent itself)

| # | Source | Coverage | Service | Notes |
|---|--------|----------|---------|-------|
| 26 | Show-your-math derivation | ✓ | `MazhirAudit.assumptions[]` + per-recommendation `derivation` (phase 1) | Every numeric output traces to formula |
| 27 | Multi-source reconciliation | ✓ | Audit prompt `═══ DATA RECONCILIATION ═══` block (phase 1) | Explicit table + conflict resolution |
| 28 | Devil's-advocate review | ✓ | `mazhirDevilsAdvocate.ts` Sonnet 2nd pass (phase 4) | Generates `qualityWarnings` |
| 29 | Consensus pass for critical numbers | ✓ | `mazhirMediaPlan.ts` 2-temp (phase 4) | tCPA, expected conv, budget |
| 30 | Regression fixtures | ✓ | `apps/api/tests/fixtures/mazhir-storage4you.json` (phase 1) | Catches silent quality drift |
| 31 | Source-freshness stamps | ✓ | per-source `pulledAt` (phase 5) | Every enrich result includes ISO timestamp |
| 32 | Audit diff vs prior run | ✓ | `mazhirAuditDiff.ts` (phase 5) | Surface what changed |

---

## Source coverage badge contract

The audit output exposes a `sourceCoverage` object that the dashboard renders
as plain-Hebrew badges next to each recommendation:

```json
{
  "sourceCoverage": {
    "ga4": { "status": "ok", "pulledAt": "2026-04-28T16:30:00Z", "totalConversions": 306 },
    "ga4Audiences": { "status": "missing", "reason": "phase 3 — not yet implemented" },
    "googleAdsAccount": { "status": "ok", "pulledAt": "...", "spendIls": 4800 },
    "searchTermsReport": { "status": "missing", "reason": "phase 2 — not yet implemented" },
    "auctionInsights": { "status": "missing", "reason": "phase 2 — not yet implemented" },
    "changeHistory": { "status": "missing", "reason": "phase 2 — not yet implemented" },
    "searchConsole": { "status": "missing", "reason": "user has not granted scope" },
    "callTracking": { "status": "n/a", "reason": "client said phone calls not relevant" },
    "dataforseo": { "status": "ok", "pulledAt": "...", "queryCount": 50 },
    "transparency": { "status": "ok", "pulledAt": "...", "competitorsFound": 3 },
    "pagespeed": { "status": "ok", "pulledAt": "...", "rating": "needs-improvement" },
    "uploadedReports": { "status": "ok", "files": 4, "aggregatedRows": 12500 }
  }
}
```

`status` values: `ok | missing | n/a | failed`. UI:
- `ok` — green dot
- `missing` — yellow "מבוסס גם על נתונים שלא נמשכו" warning if recommendation depends on it
- `n/a` — grey, no warning (legitimately unused)
- `failed` — red, shows reason; if Tier 1, blocks launch

---

## Reconciliation policy

When **3+ sources contradict** (CSV says X, GA4 says Y, client memory says Z),
the agent **MUST**:

1. Output a `dataReconciliation.conflicts[]` array listing each disagreement with
   numbers from each source.
2. State its chosen "ground truth" with rationale (priority: client memory >
   GA4 events > Google Ads CSV > DataForSEO benchmarks).
3. Set `dataReconciliation.requiresClientConfirmation = true` if the conflict
   is wider than 30%, blocking final tCPA recommendation until user confirms
   in UI.

---

## Show-your-math contract

Every numeric recommendation in the JSON output **MUST** include a `derivation`
field:

```json
{
  "recommendedTcpa": 37,
  "derivation": "historicalCpcIls (₪22) ÷ historicalConversionRatePct (60%) = ₪37 baseline · 1.0× headroom (no algo learning needed yet — manual CPC works) = ₪37 final"
}
```

**Reject rule:** if `derivation` is missing for any numeric recommendation,
audit fails validation and re-prompts Opus once with the violation cited.
After 2 failed retries → return last attempt with `qualityWarnings` flagging
the missing derivation; UI hides the suspect number.

---

## Pre-flight checklist (onboarding)

Before user can hit "הריצו אודיט":

- [ ] paidProfile filled (9 questions + USPs)
- [ ] OAuth: Google Ads scope (if hasExistingAccount)
- [ ] OAuth: GA4 analytics scope
- [ ] OAuth: GTM scope (if launching new pixel)
- [ ] OAuth: Search Console scope (recommended)
- [ ] historicalReports uploaded OR explicit "we have no past data" toggle
- [ ] historicalCpcIls / historicalConversionRatePct filled OR explicit "first campaign" toggle

UI surfaces missing items as a checklist with "what we lose without this"
plain-Hebrew explanation per item.

---

## Update log

- 2026-04-28: Initial doc, post-storage4you incident (CSV said 0 conversions,
  GA4 had 306, agent didn't reconcile). Phase 1 process foundation locked in.
