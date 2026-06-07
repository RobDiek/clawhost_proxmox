# Plan-context: fix `content.create` end-to-end (monthly tasks → real article drafts)

**Status:** READY TO EXECUTE (found + diagnosed 2026-06-07, not yet fixed).
**Why it matters:** content is a core SEO/AEO deliverable. Today monthly
`content_creation` tasks report "queued" but **no article is ever generated** —
the queue is dead and items land on the wrong agent. Launch-critical for the
content track (NOT for the Google Ads track, which works).

## Evidence (verified on Packing, agent `mta_Un9jXRuf`, instance `44f484a852`)
- Packing `research_data.contentPlan` = **undefined**; 0 cp_ items; 0
  `blog_article`/`content_post` outputs — despite 7 content.create tasks today
  reporting "Added content item cp_… to plan".
- storage-station (`mta_44f484a852`, the PRIMARY) has `contentPlan.items` with
  **11 cp_ items** incl. Packing's — i.e. Packing's items were written there.
- `draftDuePlanItemsForInstance(onlyItemId=cp_…)` → `drafted=[]` (reads a legacy
  ARRAY; the v4 object `contentPlan.items` is invisible to it).
- `index.ts` registers only `startPlanDraftRunner()` (legacy array reader). No
  consumer of `contentPlan.items` exists → dead queue.

## The 3 defects + fixes

### Fix 1 — write to the TASK's agent, not the primary
`services/monthlyTaskExecutor.ts` → `runContentCreationAdapter(instanceId, task, _plan)`
uses `resolvePrimaryAgent(instanceId)` (line ~2341). On a secondary agent
(Packing) this writes `contentPlan.items` to the wrong tenant.
- Thread the resolved `agent` into the adapter (mirror the SEO adapters which
  already take `agent`). Call site ~line 241: `runContentCreationAdapter(instanceId, task, plan, agent)`.
- Use that agent for `readResearchData` + `mutateResearchData`. (If null, fall
  back to resolvePrimaryAgent.)

### Fix 2 — make the drafter read+write the v4 object shape
`services/planDraftRunner.ts`:
- Read (line ~320): `const plan = Array.isArray(rd.contentPlan) ? rd.contentPlan : (rd.contentPlan?.items || [])`.
- Track shape: `const isV4 = !Array.isArray(rd.contentPlan)`.
- Write-back (lines ~402, ~432, and the failure-revert): currently
  `writeResearchData(..., { ...rd, contentPlan: plan })` — this CLOBBERS the v4
  object with a bare array. Make it shape-aware: if `isV4` →
  `contentPlan: { ...rd.contentPlan, items: plan }`, else `contentPlan: plan`.
  Use a small helper so all write-back sites stay consistent.
- The v4 item shape (id,date,time,channel,type,pillar,hook,brief,persona,
  ctaType,status,agentRole) already matches `PlanItem` → `generateDraftContent`
  works unchanged.

### Fix 3 — sweep ALL agents, not just primary
`services/planDraftRunner.ts` `startPlanDraftRunner` / the sweep entry iterates
the PRIMARY agent only (`resolvePrimaryAgent`). Secondary agents (Packing, and
the upcoming Moving Station) never get content drafted.
- Iterate every `mateh_agents` row of the instance (pattern: `adsRecommendationsRunner.ts`
  iterates all agents), drafting each agent's own `contentPlan.items`.
- Keep per-agent isolation: read/write each agent's own research_data.

## E2E verification (after fixes, on Packing)
1. Re-run one content.create task (e.g. `tsk_pillar_…`) → confirm `cp_` lands on
   **Packing's** `contentPlan.items` (not storage-station).
2. `draftDuePlanItemsForInstance('44f484a852', { onlyItemId: cp_… })` (or the
   per-agent sweep) → expect `drafted=[cp_…]`.
3. Confirm a `blog_article` agent_output appears (status pending_review), and
   READ IT — verify the 4-pass pipeline produced a genuine, on-brand, Hebrew,
   senior-quality article (not a thin stub). Check against
   [[project_content_plan_v4]] quality bar + [[feedback_hebrew_plural]] +
   [[feedback_senior_marketing_bar]].
4. Cleanup any test outputs.

## Gotchas / invariants
- [[feedback_research_data_dual_write]] — only mutate via mutateResearchData/
  writeResearchData; raw db.update gets wiped.
- [[reference_research_data_location]] — per-agent research_data on mateh_agents.
- [[feedback_no_deploy_during_runs]] — don't restart API mid content-gen.
- Deploy: `-i ~/.ssh/openclaw_master` root key-only; `scripts/prod-deploy.sh`.
- Pre-commit hook runs full `pnpm check` — eslint the whole tree (eol-last on
  any new script will fail the commit; `eslint --fix` first).
