# Synex Fork Integration Branch

This branch (`synex-integration`) is dedicated to selectively porting features from the synex-fork/Production branch while **maintaining your stable Proxmox backend**.

## Why This Branch?

The synex fork uses a different database schema (`instances`, `matehAgents`) incompatible with your current Proxmox-based schema (`agents`, `sshKeys`). Rather than merge everything (which broke TypeScript), this branch takes a **surgical approach**: cherry-pick and adapt individual features.

## Current Status

- **Base**: 001d34c6 (stable Proxmox backend)
- **Branch**: synex-integration
- **Custom scripts**: /apps/api/src/scripts/ (your Proxmox management tools)
- **Database**: agents, sshKeys, users, volumes (unchanged)

## Features Being Ported (See SYNEX_INTEGRATION_PLAN.md)

### Phase A: Chat System
- Agent-to-user messaging
- Telegram integration
- WebSocket real-time updates

### Phase B: Report Scheduling
- Schedule creation/editing/deletion
- Cron job execution
- Report generation

### Phase C: Admin Panel
- User management
- System analytics
- Feature controls

### Phase D: i18n (14 Languages)
- English, French, Spanish, German, Hebrew, Chinese, Hindi, Arabic, Russian, Japanese, Turkish, Italian, Polish, Dutch, Portuguese

### Phase E: Dashboard UX
- New tabs (reports, schedules, chat)
- Improved navigation
- Component updates

## How to Work on This Branch

1. **Never merge synex-fork/Production into this branch** - use cherry-pick instead
2. **Adapt SQL migrations** to use `agents` table instead of `instances`
3. **Update foreign keys** to reference agents.id not instances.id
4. **Test each feature independently** before moving to the next
5. **Create atomic commits** per feature (Phase A, Phase B, etc.)

## Example: Porting Chat System

```bash
# From synex-fork/Production, get the chat files
git show synex-fork/Production:apps/api/src/controllers/chat/createChat.ts > temp.ts

# Adapt the file:
# - Change: agent.instanceId → agent.id
# - Change: chat references to agentId (not instanceId)
# - Test

# Commit
git add apps/api/src/controllers/chat/
git commit -m "feat(chat): port chat system from synex-fork, adapted for agents schema

Changes:
- Added chat controller with create/read/update/delete endpoints
- Added chat database table (adapted to agents schema)
- Integrated Telegram messaging
- Added chat UI components

Co-Authored-By: Oz <oz-agent@warp.dev>"
```

## Database Schema Mapping

| synex-fork Table | Your Table | Notes |
| --- | --- | --- |
| instances | agents | primary VM/agent record |
| matehAgents | (not used) | synex's agent metadata |
| {table}.instance_id | {table}.agent_id | foreign key |
| {table}.agent_id (mateh) | (not used) | skip mateh-specific fields |

## Testing Checklist

After each phase:
- [ ] No TypeScript errors: `bun run check`
- [ ] Database migrations apply cleanly
- [ ] New feature endpoints respond
- [ ] Web UI components render
- [ ] Proxmox provisioning still works
- [ ] Git history is clean (focused commits)

## Rollback Instructions

If something breaks:
```bash
# Reset to stable Production
git checkout Production

# Or reset this branch to base
git reset --hard 001d34c6
```

## References

- synex-fork: https://github.com/synex-os/openclaw-hosting
- Your Proxmox backend: /apps/api/src/services/proxmox.ts
- Original merge (what NOT to do): commit e758de1d

---

**Last Updated**: 2026-06-23 20:16 UTC
**Branch**: synex-integration
**Base**: 001d34c6
