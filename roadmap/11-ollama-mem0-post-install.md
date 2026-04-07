# Ollama Post-Install + Mem0 Auto-Install

## 1. Ollama as Integration (post-provisioning install)

### Problem
Currently Ollama can only be selected at checkout (cloud-init). Users who didn't select it can't add it later from dashboard.

### Solution
Add "התקינו Ollama" button in integrations that:
1. Checks RAM availability (needs 8GB+ free)
2. If insufficient → show upgrade plan dialog
3. If sufficient → SSH to VPS:
   - `curl -fsSL https://ollama.com/install.sh | sh`
   - `systemctl enable ollama && systemctl start ollama`
   - Wait for ready, then `ollama pull llama3.1:8b`
   - Save config to `~/.openclaw/skills-config/ollama.json`
   - Add 'ol' to selectedComponents in DB
4. Show progress (install takes ~2-3 min)
5. After install → model selector becomes active

### Backend
- New endpoint: `POST /instances/:id/ollama/install`
- SSH exec: install script + systemd + pull model
- RAM check before install
- Update DB components

### Frontend
- Ollama card: if not installed, show "התקינו" button
- Progress indicator during install
- After install: show model selector + status

## 2. Mem0 Auto-Install on Every VPS

### Problem
Mem0 (long-term memory for agents) is available as MCP server but not installed by default. Should be standard on every VPS — agents need memory to work effectively.

### Solution
Add Mem0 setup to cloud-init template:

```bash
# In cloud-init-template.yaml, after OpenClaw gateway setup:
- |
    mkdir -p /home/openclaw/.openclaw/mcp-servers
    cat > /home/openclaw/.openclaw/mcp-servers/mem0.json << 'MEMEOF'
    {
      "command": "npx",
      "args": ["-y", "@mem0/mcp-server"],
      "env": {}
    }
    MEMEOF
    chown -R openclaw:openclaw /home/openclaw/.openclaw/mcp-servers
```

Note: Mem0 free tier = local SQLite storage. No API key needed for basic usage.
For cloud Mem0 (with API key) → user configures in integrations.

### Files to modify
- `scripts/cloud-init-template.yaml` — add Mem0 setup
- `apps/api/src/controllers/hosting/agentSetup.ts` — include Mem0 in agent setup
- `apps/web/public/dashboard.html` — show Mem0 status as "מותקן" by default

## Priority
HIGH — both features improve agent capabilities significantly.
Ollama = privacy + no API costs. Mem0 = agent memory = better conversations.
