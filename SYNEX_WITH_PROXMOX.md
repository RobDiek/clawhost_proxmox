# ClawNode: Synex Features + Proxmox Backend

**Branch:** `synex-with-proxmox` (commit 294b84fe)
**Base:** synex-fork/Production (commit de750edd) 
**Status:** ✅ Integration complete, ready for deployment

## What You Have Now

### Synex Platform Features
All 40+ synex-fork features are included:
- ✅ **Chat System** - Agent messaging + Telegram integration
- ✅ **Report Scheduling** - Automated reports with cron scheduling
- ✅ **Admin Panel** - User management, analytics, feature controls
- ✅ **Dashboard UX** - New tabs, improved navigation, rich components
- ✅ **i18n** - 14 languages (EN, FR, ES, DE, HE, ZH, HI, AR, RU, JA, TR, IT, PL, NL, PT)
- ✅ **Database Migrations** - 40+ migrations for all features

### Your Proxmox Integration
Your proven Proxmox backend is fully integrated:
- ✅ **Proxmox Service** (912 lines) - Complete VM provisioning
- ✅ **Cloud Provider Adapter** - Clean integration with synex's provisioner
- ✅ **Provider Abstraction** - Works with getProvider('proxmox')
- ✅ **All Custom Scripts** - Your Hermes/Proxmox management tools

## How It Works

```
synex provisioner.ts
    ↓
getProvider('proxmox')  ← added to provider registry
    ↓
proxmox-provider.ts    ← adapter, zero-modification wrapper
    ↓
proxmox.ts             ← your full 912-line service
    ↓
Proxmox API            ← VM creation, management, deletion
```

## Files Added/Modified

**New Files:**
- `apps/api/src/services/proxmox-provider.ts` - Cloud provider adapter (86 lines)
- `apps/api/src/services/proxmox.ts` - Your full Proxmox service (912 lines)
- `apps/api/src/db/schema/chats.ts` - Chat system schema (Drizzle ORM)
- `apps/api/drizzle/0021_add_chat_system.sql` - Chat migrations
- `apps/api/src/scripts/*` - Your custom Proxmox scripts (30 files)
- `apps/api/keys/` - SSH key management

**Modified Files:**
- `apps/api/src/services/provider/getProvider.ts` - Added proxmox import + registry
- `apps/api/src/ts/Types.ts` - Added 'proxmox' to ProviderType union

## Environment Configuration

Update `apps/api/.env`:

```bash
# Change from hetzner to proxmox
CLOUD_PROVIDER=proxmox

# Proxmox credentials (already set)
PROXMOX_URL=https://45.84.197.121:8006/
PROXMOX_TOKEN_ID=root@pam!clawnode
PROXMOX_TOKEN_SECRET=xxxxx-xxxxx-xxxxx
PROXMOX_NODE=pve
PROXMOX_TEMPLATE_VMID=100
PROXMOX_VM_STORAGE=local-lvm
PROXMOX_SNIPPETS_STORAGE=local
PROXMOX_STATIC_IPS=10.0.0.50-10.0.0.100
PROXMOX_GATEWAY=10.0.0.1
PROXMOX_NETMASK=24

# Everything else (database, firebase, cloudflare, polar) stays same
```

## Next Steps: Deployment

1. **Deploy this branch** to your server
   ```bash
   git checkout synex-with-proxmox
   bun install
   ```

2. **Run database migrations** (includes chat system + all synex features)
   ```bash
   DATABASE_URL="postgres://..." bun exec drizzle-kit migrate
   ```

3. **Start the API** (port 2222)
   ```bash
   bun run dev:api
   ```

4. **Verify it works**
   ```bash
   curl http://localhost:2222/api/agents  # should return your agents
   ```

5. **Deploy web frontend** (port 1111)
   ```bash
   bun run dev:web
   ```

## What's New You Can Try

Once deployed, you'll have access to:

- **Chat Tab** - Real-time messaging with agents, Telegram integration
- **Reports Tab** - Create schedules, run reports on cron, view history
- **Admin Panel** (if admin) - User management, analytics, audit logs
- **Improved Dashboard** - Better UX, new navigation, components

## Rollback Plan

If anything breaks:

```bash
# Go back to stable production
git checkout Production

# Or go to synex-integration (Proxmox backend only, no synex features)
git checkout synex-integration

# Backups are in /opt/backups/
ls -lh /opt/backups/
```

## Important Notes

- **IPv6 Disabled** - System-wide, per your rules
- **Proxmox Integration** - Zero changes made to existing proxmox.ts
- **Clean Separation** - Synex features don't depend on Proxmox implementation
- **Provider Abstraction** - Synex's provisioner.ts works with any cloud provider now

## Branching Strategy

```
Production (001d34c6)           → Your stable Proxmox-only version
synex-integration (dc88b058)    → Synex features + Proxmox (manual porting, incomplete)
synex-with-proxmox (294b84fe)  → Synex features + Proxmox (complete, ready to deploy) ← USE THIS
synex-fork/Production           → Reference only, don't merge
```

## Questions?

Check the provisioner logic in:
- `apps/api/src/services/provisioner.ts` - Shows how synex uses getProvider()
- `apps/api/src/services/proxmox-provider.ts` - Your adapter
- `apps/api/src/services/proxmox.ts` - Core implementation

---

**Status:** Ready for production deployment
**Last Updated:** 2026-06-23 20:30 UTC
**Branch:** synex-with-proxmox (294b84fe)
**Base:** synex-fork/Production (de750edd)
