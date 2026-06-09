# Claude Developer Agent — architecture & build plan

**Goal:** On the dashboard "צ'אט עם סוכן" page, add a screen switcher
**[OpenClaw Chat] ↔ [Claude Developer]**. The Developer screen drives **real
Claude Code running on the tenant's own VPS** — BYO Claude subscription or API
key, autonomous within the VPS (jailed to the box), with a clean Claude-Code-Open-
style chat UX (messages + tool calls + diffs), plus a raw terminal tab.

## Locked decisions (2026-06-09)
- **Engine:** real Claude Code (`@anthropic-ai/claude-code`) on the VPS — not a custom loop.
- **Auth:** BYO — Claude Pro/Max **subscription** (OAuth token) **and** Anthropic **API key**.
- **Autonomy:** autonomous **within the VPS** + hard jail (cannot reach mgmt infra / other tenants).
- **Rollout:** pilot on `hello@flowmatic.co.il` (instance `19c2481ba5`) → then gate to Developer plan.

## Existing infra we reuse (don't reinvent)
- `services/terminalServer.ts` — SSH WebSocket bridge: `/ws/terminal/:id` (client) +
  `/ws/admin/terminal/:id` (admin). SSHes to VPS (master key + root_password
  fallback), opens an `xterm-256color` shell, pipes both ways, handles resize.
- Dashboard already bundles **xterm** (lines ~783-816 in dashboard-staging.html).
- `sshExec` (agentSetup.ts:131) for one-off VPS commands.
- Per-instance VPS access already established (ip + root_password in `instances`).

## Security model (Phase 0 — blocking)
1. **FIX existing hole:** `/ws/terminal/:id` has **no ownership check** (only
   `status='running'`). Any known instanceId → root shell. Add: a `token`
   query param (user JWT) → verify the JWT user **owns** the instance, + feature
   gating (pilot allowlist / Developer plan). Same gate for `/ws/claude/:id`.
2. **Jail = the VPS boundary.** Each tenant VPS is single-tenant and holds **no
   cross-tenant secrets** (the master SSH key + platform DB live on the mgmt box,
   not the VPS — VERIFY per-VPS before enabling). So "autonomous on own VPS" can't
   pivot to other tenants. The agent works inside a dedicated **`developer` user +
   workspace** (`/home/developer/workspace` symlinked to the OpenClaw project),
   with `sudo` available for full-file access but a guard around `/opt/openclaw`
   provisioning + the systemd units that keep the box billable/healthy.
3. **Audit + snapshot:** log every Claude Developer session (like
   `admin.ssh.connect`). Optional: `restic`/tar snapshot of the workspace before a
   session so a runaway agent is recoverable.

## Phases

### Phase 0 — Foundations (security + VPS prep)
- Fix `/ws/terminal/:id` ownership auth + add pilot/Developer gating (shared helper).
- On hello@ VPS (`19c2481ba5`): verify Node 18+ (install if missing), verify no
  mgmt secrets present, `npm i -g @anthropic-ai/claude-code`, create `developer`
  user + workspace, sudo guard.
- Provisioning hook so new Developer-plan VPSs get the same setup.

### Phase 1 — Connect Claude (auth UI + storage)
- Developer screen "connect" card with two paths:
  - **API key:** paste Anthropic key → encrypted in `mateh_agents`/instance →
    written to VPS as `ANTHROPIC_API_KEY` for the `developer` user.
  - **Subscription:** `claude setup-token` flow — tenant authorizes via claude.ai
    OAuth in browser, pastes the long-lived token → stored → set as
    `CLAUDE_CODE_OAUTH_TOKEN` on the VPS. (Official headless-subscription path.)
- Connection test (`claude -p "ping"`), status surfaced in UI.

### Phase 2 — Claude Developer chat (core)
- New WS bridge `/ws/claude/:id`: SSH → run `claude` **headless** on the VPS in the
  workspace: `claude -p --output-format=stream-json --input-format=stream-json
  --verbose [--permission-mode=acceptEdits]`. Pipe stream-json both ways.
- Dashboard **chat UI** (Claude-Code-Open style): render assistant text, `tool_use`
  (file edits with diffs, bash commands), tool results, token/cost. Send user
  turns as stream-json input.
- **Screen switcher** on the page: tabs `[OpenClaw צ'אט] [Claude Developer]`,
  state-preserving, clean transitions.

### Phase 3 — UX polish
- File tree (browse the workspace), inline diffs, session **resume** (`--resume`),
  Stop button, usage/cost meter, and a **raw terminal** sub-tab (reuses
  `/ws/terminal/:id`) for power users.

## Pilot acceptance (hello@)
Connect key → in Claude Developer, ask "add a health endpoint / fix X" → watch it
read/edit files + run commands on the VPS → verify the change on the VPS over SSH →
confirm it cannot see other tenants / the mgmt box.
