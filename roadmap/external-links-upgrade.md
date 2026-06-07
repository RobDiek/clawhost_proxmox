# Plan-context: upgrade external-link (backlink) strategy to senior-pro grade

**Status:** assessed 2026-06-07 on Packing. Research layer is solid; the
**actionable per-link recommendations are under-specified**. Upgrade needed.

## What's ALREADY good (don't rebuild)
`controllers/hosting/research/stages/prefetch/link_audit.ts` uses the DFS
**Backlinks API comprehensively** (verified PS ran with real data — evidence
`dfs_lost_referring_domains`, link-gap "81 חפיפות"):
- Our domain: summary + anchors(100) + referring_domains(200, include_lost) +
  competitors/link-gap(100).
- Top-10 competitors: summary + anchors(50) + referring_domains(50).
- Derives: lost-links (recovery), link-gap (outreach prospects), anchor
  distribution. 13 prioritized records with `priority/timeline/outreach_angle/
  estimated_effort_hours/domain/evidence`.
- Soft-fails to degraded mode on 40204 (no Backlinks subscription) with a clear
  message. (Confirm PS subscription stays active.)

## The gap (Sergei's instinct — confirmed): records/tasks lack the pro specifics
A 7-year-SEO-grade link plan must say, **per link**: where, what anchor, how
much, in what order, why. Today's records/tasks are MISSING:
1. **Target page** — which OUR money/pillar page each link should point to
   (link-equity flow to priority URLs from seo_keyword_research/positioning).
2. **Anchor keyword** — the exact anchor, drawn from the keyword set AND
   respecting an anchor-text **distribution** (branded ≥50% / partial / exact
   capped) per [[project_seo_playbook_sergei]] anti-over-optimization rules.
   (Data exists — task #30 even flags "75% exact-match = over_optimization
   risk" — but it's not turned into per-link anchor guidance.)
3. **₪ cost per link** — link tasks currently show `cost=—`. Tier by prospect
   DR using `services/research/ilCostConstants.ts` + `cost_timeline_modeling.ts`.
4. **Prospect DR + relevance tiering** — tier-1/tier-2 by Domain Rank + topical
   relevance (we have DFS DR on referring domains; surface it per prospect).
5. **Build sequence + monthly cadence** — an ordered plan that fits the chosen
   budget (Smart ₪1K → 2-3 mid-DR links/mo; Aggressive ₪3K → 5-8 multi-tier),
   per [[project_link_strategy_scenarios]] + `chosenScenario`.
6. **Strategy alignment check** — total links/budget in the plan must match
   `research_data.chosenScenario` (NEVER ask the user for link budget — read the
   scenario, per [[project_link_strategy_scenarios]]).

## Proposed implementation
- Enrich the `link_audit` STAGE output (or add a `linkStrategy` post-processor)
  so each of the 13 records becomes a fully-specified recommendation:
  `{ prospect_domain, prospect_DR, relevance, type(gap|recovery|citation),
     target_page, anchor_keyword, anchor_type(branded|partial|exact),
     estimated_cost_ils, tier, sequence_order, month_week, outreach_angle,
     expected_impact }`.
- Anchor planner: distribute anchors across the link set to hit a healthy
  branded/partial/exact ratio (anti-penalty) — not per-link greedy.
- Cost/sequence: map prospects to ilCostConstants DR tiers, then pack into the
  chosenScenario monthly budget, ordered recovery → high-DR-gap → citations.
- Surface in the monthly plan link tasks with these fields populated (so the
  kabinet card shows target/anchor/₪/order), and in the report card.
- Quality gate: validate anchor distribution + target-page coverage + budget
  fit before emitting (pattern: [[feedback_schema_ne_strategy]] — pair schema
  fields with content validators).

## Verify on PS
Re-run link_audit (Backlinks sub active) → confirm each record has
target_page + anchor_keyword + ₪cost + tier + sequence, anchor distribution is
healthy, and the total respects chosenScenario. Compare against a manual
senior-SEO link plan for sanity.

## Refs
[[project_seo_playbook_sergei]] · [[project_link_strategy_scenarios]] ·
[[feedback_seo_depth]] · [[project_dfs_proxy]] · [[feedback_strategic_data_audit_pattern]]
