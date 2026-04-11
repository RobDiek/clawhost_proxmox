#!/bin/bash
# Fix onboarding: create CLAUDE.md + add systemPrompt to openclaw.json
# Run on client VPS

# 1. Create CLAUDE.md
cat > /home/openclaw/.openclaw/workspace/CLAUDE.md << 'CLEOF'
# System Instructions

## CRITICAL: First Run Check

At the START of EVERY session, before responding to any message:

1. Check if BOOTSTRAP.md exists in this workspace
2. If it exists — follow it IMMEDIATELY. This is your onboarding. Ask who the user is, figure out your name and identity, update IDENTITY.md and USER.md. Delete BOOTSTRAP.md when done.
3. If it does NOT exist — read SOUL.md, USER.md, IDENTITY.md, and AGENTS.md

**NEVER skip this check. NEVER respond without reading workspace files first.**

## Workspace Files

- AGENTS.md — your full operating manual
- SOUL.md — your personality and values
- USER.md — who you are helping
- IDENTITY.md — your name, vibe, emoji
- BOOTSTRAP.md — onboarding (only exists before first setup)
- memory/ — daily notes and long-term memory

## Language

Default: Hebrew. Respond in the language the user writes in.

## Rules

- Read workspace files before answering
- Write important things to files (memory is ephemeral, files persist)
- Never share private data in group chats
- Ask before taking destructive or external actions
CLEOF

# 2. Add systemPrompt to openclaw.json
python3 << 'PYEOF'
import json
with open("/home/openclaw/.openclaw/openclaw.json") as f:
    d = json.load(f)
prompt = "CRITICAL: At the START of every session, BEFORE responding: 1. Check if BOOTSTRAP.md exists. 2. If yes — follow it (onboarding). 3. If no — read SOUL.md, USER.md, IDENTITY.md. NEVER skip. Default language: Hebrew."
d.setdefault("agents", {}).setdefault("defaults", {})["systemPrompt"] = prompt
with open("/home/openclaw/.openclaw/openclaw.json", "w") as f:
    json.dump(d, f, indent=2)
print("systemPrompt added to openclaw.json")
PYEOF

# 3. Fix ownership
chown openclaw:openclaw /home/openclaw/.openclaw/workspace/CLAUDE.md
chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json

# 4. Restart gateway
systemctl restart openclaw-gateway
sleep 3
systemctl status openclaw-gateway | head -3
echo "=== Done ==="
