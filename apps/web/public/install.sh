#!/bin/bash
# ClawFlow VPS Installer — pulled by cloud-init bootstrap from /install.sh
#
# Reads /etc/openclaw/instance.env for tenant-specific variables:
#   INSTANCE_ID, SUBDOMAIN_NAME, OPENCLAW_TOKEN,
#   AUTOMATION_TOOL, AUTOMATION_PORT, AUTOMATION_PASSWORD,
#   MEM0_API_KEY, HAS_OLLAMA (true/false), HAS_BACKUP (true/false)
#
# Same logic as scripts/cloud-init-template.yaml runcmd block — extracted
# here because Hetzner's user_data 32 KiB limit (45 KiB raw template) blocks
# in-line cloud-init. cloud-init now does only credentials + env + curls us.

set -e
exec > >(tee -a /var/log/openclaw-install.log) 2>&1
echo "════ ClawFlow install.sh started @ $(date -Iseconds) ════"

# Source tenant variables (written by cloud-init write_files)
if [ ! -f /etc/openclaw/instance.env ]; then
    echo "FATAL: /etc/openclaw/instance.env missing — cannot install" >&2
    exit 1
fi
set -a; . /etc/openclaw/instance.env; set +a
echo "Loaded tenant: INSTANCE_ID=$INSTANCE_ID SUBDOMAIN_NAME=$SUBDOMAIN_NAME"

# Activepieces requires AP_ENCRYPTION_KEY to be exactly 32 hex chars (16 bytes).
# OPENCLAW_TOKEN is 64 hex chars — derive a valid AP key by truncating.
AP_ENCRYPTION_KEY=$(echo -n "${OPENCLAW_TOKEN}" | head -c 32)
export AP_ENCRYPTION_KEY

DEBIAN_FRONTEND=noninteractive
export DEBIAN_FRONTEND

# ── Base packages ─────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg nginx certbot python3-certbot-nginx ufw python3-pip jq

# ── Docker CE ─────────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

# ── Node.js 22 + OpenClaw ─────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs
# Pinned (I7): @latest silently bumped new instances to 2026.6.5, which requires
# an explicit plugin manifest our extensions lacked → gateway crash-loop / 502.
# Pin to the version master runs in production. Bump centrally via the release
# channel (S3), never auto.
npm install -g openclaw@2026.4.14

# ── Optional Python tools (best-effort, non-blocking) ─────────────────────
apt-get install -y -qq python3-pip chromium-browser ffmpeg libass9 fonts-noto-core fonts-noto-cjk fonts-noto-hinted 2>/dev/null || true
snap install chromium 2>/dev/null || true
pip3 install --break-system-packages openai-whisper 2>/dev/null || true
pip3 install --break-system-packages crawl4ai 2>/dev/null || true
pip3 install --break-system-packages llm-guard 2>/dev/null || true
pip3 install --break-system-packages crewai crewai-tools 2>/dev/null || true

# 2GB swap (prevents OOM on 4GB VPS)
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# ── Firewall ──────────────────────────────────────────────────────────────
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# ── openclaw user + dirs ──────────────────────────────────────────────────
id openclaw &>/dev/null || useradd -r -m -d /home/openclaw -s /bin/bash openclaw
mkdir -p /home/openclaw/.openclaw/media /home/openclaw/.openclaw/workspace
chmod o+x /home/openclaw /home/openclaw/.openclaw

# Pre-cache whisper base (139MB, NOT large-v3 1.6GB which OOM's small VPS)
su - openclaw -c "python3 -c 'import whisper; whisper.load_model(\"base\")'" 2>/dev/null || true
python3 -c "from crawl4ai import AsyncWebCrawler" 2>/dev/null || true

# ── LLM Guard scanner ─────────────────────────────────────────────────────
mkdir -p /opt/openclaw
cat > /opt/openclaw/llm-guard-scan.py <<'LGEOF'
#!/usr/bin/env python3
"""LLM Guard scanner — validates input/output for AI agents."""
import sys, json
def scan_input(text):
    try:
        from llm_guard.input_scanners import PromptInjection, TokenLimit, Toxicity
        from llm_guard.input_scanners.prompt_injection import MatchType
        scanners = [PromptInjection(threshold=0.7, match_type=MatchType.FULL), TokenLimit(limit=8000), Toxicity(threshold=0.7)]
        flagged, sanitized, max_score = [], text, 0.0
        for s in scanners:
            sanitized, ok, score = s.scan("", sanitized)
            if not ok: flagged.append(s.__class__.__name__)
            max_score = max(max_score, score)
        return {"safe": len(flagged) == 0, "score": round(max_score, 3), "flagged": flagged, "sanitized": sanitized[:10000]}
    except Exception as e:
        return {"safe": True, "score": 0, "flagged": [], "sanitized": text, "error": str(e)}
def scan_output(text):
    try:
        from llm_guard.output_scanners import NoRefusal, Sensitive
        scanners = [NoRefusal(threshold=0.5), Sensitive(threshold=0.5)]
        flagged, sanitized, max_score = [], text, 0.0
        for s in scanners:
            sanitized, ok, score = s.scan("", sanitized)
            if not ok: flagged.append(s.__class__.__name__)
            max_score = max(max_score, score)
        return {"safe": len(flagged) == 0, "score": round(max_score, 3), "flagged": flagged, "sanitized": sanitized[:10000]}
    except Exception as e:
        return {"safe": True, "score": 0, "flagged": [], "sanitized": text, "error": str(e)}
if __name__ == "__main__":
    d = json.loads(sys.stdin.read())
    print(json.dumps((scan_output if d.get("direction") == "output" else scan_input)(d.get("text", ""))))
LGEOF
chmod +x /opt/openclaw/llm-guard-scan.py

# ── Pre-cache MCP packages (best-effort) ──────────────────────────────────
npm install -g \
  @brave/brave-search-mcp-server \
  @mem0/mcp-server \
  @respira/wordpress-mcp-server \
  @gongrzhe/image-gen-server \
  mcp-mail-server \
  mcp-communicator-telegram \
  @mcpware/instagram-mcp \
  dataforseo-mcp-server \
  firecrawl-mcp \
  2>/dev/null || true

# ── OpenClaw config ───────────────────────────────────────────────────────
cat > /home/openclaw/.openclaw/openclaw.json <<OCEOF
{
  "gateway": {
    "mode": "local",
    "auth": { "token": "${OPENCLAW_TOKEN}" },
    "controlUi": { "allowInsecureAuth": true, "dangerouslyDisableDeviceAuth": true, "allowedOrigins": ["*"] },
    "trustedProxies": ["127.0.0.1", "::1"]
  },
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["anthropic/claude-haiku-4-5-20251001", "openai/gpt-4o-mini"] },
      "models": {
        "anthropic/claude-opus-4-8": { "alias": "opus" },
        "anthropic/claude-sonnet-4-6": { "alias": "sonnet" },
        "anthropic/claude-haiku-4-5-20251001": { "alias": "haiku" },
        "openai/gpt-4o": { "alias": "gpt4o" },
        "openai/gpt-4o-mini": { "alias": "gpt4o-mini" }
      },
      "subagents": { "model": "anthropic/claude-haiku-4-5-20251001", "maxConcurrent": 2, "archiveAfterMinutes": 60 },
      "bootstrapMaxChars": 10000,
      "bootstrapTotalMaxChars": 30000,
      "bootstrapPromptTruncationWarning": "always",
      "heartbeat": { "every": "4h", "model": "anthropic/claude-haiku-4-5-20251001", "lightContext": true,
        "activeHours": { "start": "06:00", "end": "23:00", "timezone": "Asia/Jerusalem" } },
      "compaction": { "reserveTokens": 40000, "keepRecentTokens": 25000, "reserveTokensFloor": 25000 }
    }
  },
  "plugins": {
    "allow": ["anthropic", "openai", "telegram", "browser"],
    "entries": {
      "anthropic": { "enabled": true },
      "openai": { "enabled": true },
      "telegram": { "enabled": true },
      "browser": { "enabled": true }
    }
  }
}
OCEOF
chmod 600 /home/openclaw/.openclaw/openclaw.json

# ── CLAUDE.md (system instructions) ───────────────────────────────────────
cat > /home/openclaw/.openclaw/workspace/CLAUDE.md <<'CLEOF'
# System Instructions — מטה (Orchestrator)

## מי אתה
אתה הסוכן הראשי שמנהל את מערכת השיווק של המשתמש. המשתמש כבר עבר אונבורדינג מלא באתר — אל תבקש ממנו להציג את עצמו או את העסק שוב.
המערכת עובדת אוטומטית: אונבורדינג → נבנית תוכנית → הסוכנים מבצעים → אתה מדווח ומבקש אישור. אתה בעיקר עונה על שאלות, מדווח סטטוס, ומכוון את הביצוע — לא מתחיל מאפס.

## תחילת שיחה
לפני כל תגובה: קרא SOUL.md, USER.md, AGENTS.md.
אם קיים BOOTSTRAP.md — מחק אותו מיד ואל תבצע אותו. זו תבנית ברירת-מחדל של openclaw ל"היכרות" ולא רלוונטית כאן, כי המשתמש כבר עבר אונבורדינג.
בהודעה הראשונה: הצג את עצמך במשפט אחד (שם + שאתה הסוכן הראשי), אמור מה הסטטוס כרגע, וסיים ברוח המשפט: «אני אעדכן אותך בכל התקדמות — ואם יש לך שאלות על המערכת או על הנתונים, אני כאן.» — ועצור.
אסור לסיים בשאלה פתוחה ("מה צריך?" / "מה נתחיל?" / "במה לעזור?") — אתה מוביל את התהליך, לא ממתין להוראות.
אסור: לשאול "ספר לי על העסק" / "מה הפרויקט הראשון" / "איך תרצה שאתנהג". אסור: להציג רשימת יכולות כמצגת מכירה.

## שפה (חובה)
עברית בלבד. בלי ערבוב אנגלית בתוך משפט עברי. אנגלית אך ורק לראשי-תיבות ומונחים שאין להם תרגום (SEO, AI, CTA, KPI, URL, API). לא "creative" אלא "ויזואל", לא "brand" אלא "מותג", לא "copy" אלא "תוכן", לא "Brand Book" אלא "ספר מותג".

## קבצי Workspace
- `AGENTS.md` — מדריך התפעול המלא
- `SOUL.md` — אישיות, ערכים, וניתוב הסוכנים
- `USER.md` — מי המשתמש (נוצר באונבורדינג)
- `memory/` — זיכרון יומי וארוך-טווח

## כללים
- קרא קבצי workspace לפני תשובה
- שמור דברים חשובים לקבצים (זיכרון נדיף, קבצים נשארים)
- לא לשתף מידע פרטי בקבוצות
- אישור לפני כל פעולה חיצונית או הרסנית
CLEOF

chown -R openclaw:openclaw /home/openclaw

# ── OpenClaw systemd ──────────────────────────────────────────────────────
cat > /etc/systemd/system/openclaw-gateway.service <<SVCEOF
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=NODE_ENV=production
Environment=OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_TOKEN}
Environment=MEM0_API_KEY=${MEM0_API_KEY}
ExecStart=/usr/bin/openclaw gateway run --port 3000 --bind loopback --auth token
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

# ── Pair CLI device with Gateway ──────────────────────────────────────────
sleep 5
su - openclaw -c '
openclaw config set gateway.port 3000 2>/dev/null
openclaw cron list 2>/dev/null || true
sleep 2
DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\"/.openclaw/identity/device.json\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
if [ -n "$DEVICE_ID" ]; then
    PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\"/.openclaw/devices/pending.json\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)
    if [ -n "$PUB_KEY" ]; then
        mkdir -p ~/.openclaw/devices
        cat > ~/.openclaw/devices/paired.json <<EOFPAIR
{
  "$DEVICE_ID": {
    "deviceId": "$DEVICE_ID",
    "publicKey": "$PUB_KEY",
    "platform": "linux",
    "clientId": "cli",
    "clientMode": "cli",
    "role": "operator",
    "roles": ["operator"],
    "scopes": ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"],
    "pairedAtMs": $(date +%s)000,
    "label": "local-cli"
  }
}
EOFPAIR
        echo "{}" > ~/.openclaw/devices/pending.json
    fi
fi
'
systemctl restart openclaw-gateway
sleep 3

# ── Mem0 plugin ────────────────────────────────────────────────────────────
su - openclaw -c 'openclaw plugins install @mem0/openclaw-mem0 2>/dev/null || true'
su - openclaw -c 'openclaw plugins enable openclaw-mem0 2>/dev/null || true'
systemctl stop openclaw-gateway 2>/dev/null
python3 - <<PYEOF
import json, os
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: cfg = json.load(f)
plugins = cfg.setdefault('plugins', {})
entries = plugins.setdefault('entries', {})
# Only point the memory slot at openclaw-mem0 if the plugin ACTUALLY installed.
# The npm install above is best-effort (|| true); if it fails, a slot pointing at
# a missing plugin is a FATAL "Config invalid" → gateway crash-loop. Fall back to
# the built-in memory-core so the box always boots. (mem0 install reliability is
# tracked separately; this self-heals once it installs.)
mem0_ok = os.path.exists('/home/openclaw/.openclaw/extensions/openclaw-mem0/dist/index.js')
if mem0_ok:
    entries['openclaw-mem0'] = {
        'enabled': True,
        'config': {
            'mode': 'platform',
            'apiKey': '${MEM0_API_KEY}',
            'userId': '${INSTANCE_ID}',
            'autoCapture': True,
            'autoRecall': True,
            'searchThreshold': 0.4,
            'topK': 5,
            'customInstructions': 'Store important facts about the user, business, preferences, decisions. Store in Hebrew when original is Hebrew. Never store API keys or passwords.'
        }
    }
    entries.setdefault('memory-core', {})['enabled'] = False
    plugins.setdefault('slots', {})['memory'] = 'openclaw-mem0'
    print('Mem0 Platform configured')
else:
    entries.pop('openclaw-mem0', None)
    entries.setdefault('memory-core', {})['enabled'] = True
    if isinstance(plugins.get('slots'), dict):
        plugins['slots'].pop('memory', None)
    print('Mem0 not installed — using built-in memory-core (no broken slot)')
plugins['allow'] = list(entries.keys())
cfg['plugins'] = plugins
with open(p, 'w') as f: json.dump(cfg, f, indent=2)
PYEOF

# Patch plugin to tolerate anonymousTelemetryId
PLUGIN_JS=/home/openclaw/.openclaw/extensions/openclaw-mem0/dist/index.js
if [ -f "$PLUGIN_JS" ]; then
    python3 -c "
with open('$PLUGIN_JS') as f: code = f.read()
old = 'const unknown = Object.keys(value).filter((key) => !allowed.includes(key));'
new = 'const unknown = Object.keys(value).filter((key) => !allowed.includes(key) && key !== \"anonymousTelemetryId\");'
if old in code:
    with open('$PLUGIN_JS', 'w') as f: f.write(code.replace(old, new, 1))
"
fi
chown -R openclaw:openclaw /home/openclaw/.openclaw
systemctl start openclaw-gateway

# ── Activepieces (Docker) ─────────────────────────────────────────────────
mkdir -p /opt/openclaw/data/{ap-db,ap-redis,qdrant}
cat > /opt/openclaw/docker-compose.yml <<DCEOF
services:
  activepieces:
    image: activepieces/activepieces:latest
    restart: unless-stopped
    ports: ["127.0.0.1:8080:80"]
    depends_on: [ap-postgres, ap-redis]
    environment:
      - AP_ENGINE_EXECUTABLE_PATH=dist/packages/engine/main.js
      - AP_POSTGRES_DATABASE=activepieces
      - AP_POSTGRES_HOST=ap-postgres
      - AP_POSTGRES_PORT=5432
      - AP_POSTGRES_USERNAME=activepieces
      - AP_POSTGRES_PASSWORD=${AUTOMATION_PASSWORD}
      - AP_REDIS_HOST=ap-redis
      - AP_REDIS_PORT=6379
      - AP_FRONTEND_URL=https://${SUBDOMAIN_NAME}-flows.flowmatic.co.il
      - AP_ENCRYPTION_KEY=${AP_ENCRYPTION_KEY}
      - AP_JWT_SECRET=${AUTOMATION_PASSWORD}
      - AP_EDITION=ce
      - AP_SIGN_UP_ENABLED=false
      - AP_TELEMETRY_ENABLED=false
  ap-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: activepieces
      POSTGRES_USER: activepieces
      POSTGRES_PASSWORD: ${AUTOMATION_PASSWORD}
    volumes: ["/opt/openclaw/data/ap-db:/var/lib/postgresql/data"]
  ap-redis:
    image: redis:7.2-alpine
    restart: unless-stopped
    volumes: ["/opt/openclaw/data/ap-redis:/data"]
DCEOF

cat > /opt/openclaw/docker-compose.qdrant.yml <<'QDEOF'
services:
  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    ports: ["127.0.0.1:6333:6333"]
    volumes: ["/opt/openclaw/data/qdrant:/qdrant/storage"]
QDEOF

cd /opt/openclaw
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.qdrant.yml up -d qdrant

# ── LiteLLM Gateway ───────────────────────────────────────────────────────
mkdir -p /opt/openclaw/data/litellm
cat > /opt/openclaw/litellm-config.yaml <<LLMEOF
model_list:
  - model_name: default
    litellm_params: { model: anthropic/claude-sonnet-4-6, api_key: os.environ/ANTHROPIC_API_KEY }
  - model_name: opus
    litellm_params: { model: anthropic/claude-opus-4-8, api_key: os.environ/ANTHROPIC_API_KEY }
  - model_name: sonnet
    litellm_params: { model: anthropic/claude-sonnet-4-6, api_key: os.environ/ANTHROPIC_API_KEY }
  - model_name: haiku
    litellm_params: { model: anthropic/claude-haiku-4-5-20251001, api_key: os.environ/ANTHROPIC_API_KEY }
  - model_name: gpt4o
    litellm_params: { model: openai/gpt-4o, api_key: os.environ/OPENAI_API_KEY }
  - model_name: gpt4o-mini
    litellm_params: { model: openai/gpt-4o-mini, api_key: os.environ/OPENAI_API_KEY }
  - model_name: local
    litellm_params: { model: ollama/llama3.1:8b, api_base: http://host.docker.internal:11434 }

litellm_settings:
  drop_params: true
  request_timeout: 300
  num_retries: 2
  fallbacks: [ { default: [opus, sonnet, gpt4o] } ]

general_settings:
  master_key: ${OPENCLAW_TOKEN}
  database_url: null
LLMEOF

cat > /opt/openclaw/docker-compose.litellm.yml <<'LITEOF'
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    restart: unless-stopped
    ports: ["127.0.0.1:4000:4000"]
    volumes: ["/opt/openclaw/litellm-config.yaml:/app/config.yaml"]
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    extra_hosts: ["host.docker.internal:host-gateway"]
LITEOF
docker compose -f /opt/openclaw/docker-compose.yml -f /opt/openclaw/docker-compose.qdrant.yml -f /opt/openclaw/docker-compose.litellm.yml up -d litellm

# ── Optional: Ollama ──────────────────────────────────────────────────────
if [ "${HAS_OLLAMA}" = "true" ]; then
    curl -fsSL https://ollama.com/install.sh | sh
    systemctl enable ollama
    systemctl start ollama
    for i in $(seq 1 12); do ollama list 2>/dev/null && break; sleep 5; done
    ollama pull llama3.1:8b
    ollama pull nomic-embed-text
    mkdir -p /home/openclaw/.openclaw/skills-config
    echo '{"provider":"ollama","baseUrl":"http://localhost:11434","defaultModel":"llama3.1:8b"}' > /home/openclaw/.openclaw/skills-config/ollama.json
    chown -R openclaw:openclaw /home/openclaw/.openclaw/skills-config
fi

# ── Nginx (3 vhosts) ──────────────────────────────────────────────────────
cat > /etc/nginx/sites-available/openclaw <<NGEOF
server {
    listen 80;
    server_name ${SUBDOMAIN_NAME}.flowmatic.co.il;

    location /media/ {
        alias /home/openclaw/.openclaw/media/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        location ~* ^/media/.+\.(jpg|jpeg|png|webp|gif|mp4|mov|webm|mp3|wav|m4a)\$ {
            alias /home/openclaw/.openclaw/media/;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # End-users landing on the bare root see the mgmt dashboard (this
    # subdomain is infrastructure — chat is embedded via iframe, not a
    # user-facing UI). All other paths (including /embed, /chat, websocket
    # upgrades, OpenClaw assets) proxy through to the gateway as before.
    location = / {
        return 302 https://app.flowmatic.co.il/dashboard;
    }
    location = /chat {
        return 302 https://app.flowmatic.co.il/dashboard;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Content-Security-Policy;
    }

    location = /embed { proxy_pass http://127.0.0.1:3000/; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection 'upgrade'; proxy_set_header Host \$host; proxy_read_timeout 300s; proxy_hide_header X-Frame-Options; proxy_hide_header Content-Security-Policy; }
    location /embed/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_read_timeout 300s;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Content-Security-Policy;
        sub_filter '</head>' '<style>.shell-nav,.agents-sidebar,.topnav-shell,.agent-header{display:none!important}.shell{grid-template-columns:1fr!important}</style></head>';
        sub_filter_once on;
        sub_filter_types text/html;
    }
}
server {
    listen 80;
    server_name ${SUBDOMAIN_NAME}-flows.flowmatic.co.il;
    location /platform { return 404; }
    location / {
        proxy_pass http://127.0.0.1:${AUTOMATION_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
server {
    listen 80;
    server_name ${SUBDOMAIN_NAME}-obs.flowmatic.co.il;
    location / { proxy_pass http://127.0.0.1:3200; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection 'upgrade'; proxy_set_header Host \$host; }
}
NGEOF

ln -sf /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
grep -q server_names_hash /etc/nginx/nginx.conf || sed -i '/http {/a\    server_names_hash_bucket_size 128;' /etc/nginx/nginx.conf
nginx -t && systemctl enable nginx && systemctl restart nginx

# ── SSL (Let's Encrypt) ───────────────────────────────────────────────────
for i in $(seq 1 30); do
    certbot --nginx \
        -d ${SUBDOMAIN_NAME}.flowmatic.co.il \
        -d ${SUBDOMAIN_NAME}-flows.flowmatic.co.il \
        -d ${SUBDOMAIN_NAME}-obs.flowmatic.co.il \
        --non-interactive --agree-tos -m devops@flowmatic.co.il && break
    sleep 15
done

# ── Optional: Daily Backup ────────────────────────────────────────────────
if [ "${HAS_BACKUP}" = "true" ]; then
    mkdir -p /opt/openclaw-backups
    cat > /opt/openclaw-backup.sh <<BKEOF
#!/bin/bash
BACKUP_DIR="/opt/openclaw-backups"
TIMESTAMP=\$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="\$BACKUP_DIR/backup-\$TIMESTAMP.tar.gz"
tar -czf "\$BACKUP_FILE" -C /home/openclaw .openclaw -C /opt/openclaw data 2>/dev/null
find "\$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +7 -delete
BACKUP_SIZE=\$(stat -c%s "\$BACKUP_FILE" 2>/dev/null || echo 0)
BACKUP_COUNT=\$(ls -1 "\$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | wc -l)
curl -sf -X POST "https://api.clawflow.flowmatic.co.il/hosting/instances/${INSTANCE_ID}/backup-report" \
    -H "Content-Type: application/json" \
    -d "{\"timestamp\":\"\$TIMESTAMP\",\"size\":\$BACKUP_SIZE,\"count\":\$BACKUP_COUNT}" > /dev/null || true
BKEOF
    chmod +x /opt/openclaw-backup.sh
    echo "0 3 * * * root /opt/openclaw-backup.sh >> /var/log/openclaw-backup.log 2>&1" > /etc/cron.d/openclaw-backup
    /opt/openclaw-backup.sh &
fi

# ── Self-Healing Health Check + Auto-update timers ────────────────────────
cat > /etc/systemd/system/clawflow-health.service <<'CHSEOF'
[Unit]
Description=ClawFlow Self-Healing Health Check
After=openclaw-gateway.service docker.service
[Service]
Type=oneshot
ExecStart=/opt/clawflow-health.sh
TimeoutSec=120
CHSEOF

cat > /etc/systemd/system/clawflow-health.timer <<'CHTEOF'
[Unit]
Description=ClawFlow Health Check Timer (every 5 min)
[Timer]
OnBootSec=300
OnUnitActiveSec=300
[Install]
WantedBy=timers.target
CHTEOF

cat > /opt/openclaw-update.sh <<'UPDEOF'
#!/bin/bash
CURRENT=$(su - openclaw -c 'openclaw --version 2>/dev/null' || echo "unknown")
# Pinned (I7): re-installs the pinned version, so the nightly cron is a no-op and
# never drifts to a breaking @latest. Real upgrades flow through the release
# channel (S3, opt-in), not this timer.
npm install -g openclaw@2026.4.14 --silent 2>/dev/null
NEW=$(su - openclaw -c 'openclaw --version 2>/dev/null' || echo "unknown")
if [ "$CURRENT" != "$NEW" ]; then
    systemctl restart openclaw-gateway
    echo "$(date): Updated OpenClaw $CURRENT -> $NEW" >> /var/log/openclaw-update.log
fi
UPDEOF
chmod +x /opt/openclaw-update.sh
echo "0 4 * * * root /opt/openclaw-update.sh >> /var/log/openclaw-update.log 2>&1" > /etc/cron.d/openclaw-update

systemctl daemon-reload

# ── Record installed-stack version + appliedMigrations registry ───────────
# Written to /var/openclaw/version.json. Read on update-check by mgmt API
# via SSH (executeSSH -> cat). On agent.<subdomain>/__version it's also
# exposed read-only for clientside dashboards.
mkdir -p /var/openclaw
LATEST_VERSION_JSON=$(curl -fsSL --max-time 15 https://clawflow.flowmatic.co.il/version.json 2>/dev/null \
    || echo '{"stackVersion":"unknown","schemaVersion":0,"components":{}}')
python3 - <<PYVER
import json, datetime, sys
try:
    d = json.loads("""${LATEST_VERSION_JSON}""")
except Exception:
    d = {"stackVersion":"unknown","schemaVersion":0,"components":{}}
d['installedAt'] = datetime.datetime.utcnow().isoformat() + 'Z'
# A fresh install already contains everything the manifest's migrations do —
# migrations exist ONLY to bring OLDER boxes up to this stack. So mark all of
# the manifest's migrations as already-applied; otherwise diffVersions() sees
# them as pending and the dashboard shows a FALSE "update available" on a
# brand-new VPS. Future migrations added to the manifest AFTER this install
# stay pending (this box's stored list won't contain them) → real updates
# still surface correctly.
d['appliedMigrations'] = list(d.get('migrations') or [])
with open('/var/openclaw/version.json', 'w') as f:
    json.dump(d, f, indent=2)
PYVER
chmod 644 /var/openclaw/version.json || true

# Expose version.json via nginx (read-only) at agent.<subdomain>/__version
cat > /etc/nginx/snippets/openclaw-version.conf <<'NXVER'
location = /__version {
    alias /var/openclaw/version.json;
    add_header Content-Type application/json;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
NXVER
if [ -f /etc/nginx/sites-available/openclaw ] && ! grep -q "openclaw-version.conf" /etc/nginx/sites-available/openclaw; then
    sed -i '/server_name agent\./a \    include /etc/nginx/snippets/openclaw-version.conf;' /etc/nginx/sites-available/openclaw || true
    nginx -t && systemctl reload nginx || true
fi

echo "════ ClawFlow install.sh finished @ $(date -Iseconds) ════"
echo "Instance ${INSTANCE_ID} ready."

# ── Notify mgmt API: status initializing → running ────────────────────────
# Authenticated by openclawToken match (only this VPS knows it). The dashboard
# polls /my-instances and removes the "still installing" banner once status
# flips. Retries on transient network/cert issues during initial boot.
INSTALL_DURATION=$(($(date +%s) - $(stat -c %Y /var/log/openclaw-install.log 2>/dev/null || echo $(date +%s))))
for attempt in 1 2 3 4 5; do
    HTTP_CODE=$(curl -sS -o /tmp/heartbeat.json -w '%{http_code}' \
        -X POST "https://api.clawflow.flowmatic.co.il/hosting/instances/${INSTANCE_ID}/install-complete" \
        -H "Content-Type: application/json" \
        --max-time 30 \
        -d "{\"openclawToken\":\"${OPENCLAW_TOKEN}\",\"durationSec\":${INSTALL_DURATION}}" 2>&1) || HTTP_CODE=000
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ Reported install-complete to mgmt (status → running)"
        break
    fi
    echo "install-complete attempt $attempt failed (HTTP $HTTP_CODE), retrying in 10s..."
    sleep 10
done
