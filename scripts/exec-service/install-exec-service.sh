#!/bin/bash
# Install / update the on-VPS exec-service (tenant sovereignty S1).
#
# Idempotent. Run ON A TENANT VPS as root. For S1 this is applied MANUALLY to the
# DISPOSABLE dev box (flow) ONLY — NOT folded into install.sh until proven. It adds
# a standalone loopback HTTP service (no npm deps — node built-ins + global fetch)
# and exposes /exec/* on the agent vhost. The central API does not depend on it.
#
# Rollback (full): systemctl disable --now exec-service; rm -rf /opt/exec-service;
#   remove the /exec/ location from /etc/nginx/sites-available/openclaw (a timestamped
#   backup is written here on every run); nginx -t && systemctl reload nginx.
set -euo pipefail

PORT="${EXEC_PORT:-3101}"
APP_DIR=/opt/exec-service
OPENCLAW_HOME=/home/openclaw/.openclaw
OPENCLAW_JSON="$OPENCLAW_HOME/openclaw.json"
TOKEN_FILE="$OPENCLAW_HOME/sovereign/token"
NGINX_SITE=/etc/nginx/sites-available/openclaw
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== exec-service install (port $PORT) ==="

# 1. Stage app files (zero npm deps — node built-ins only).
mkdir -p "$APP_DIR"
cp -f "$SRC_DIR/server.js" "$APP_DIR/server.js"
cp -f "$SRC_DIR/package.json" "$APP_DIR/package.json"
chown -R openclaw:openclaw "$APP_DIR"

# 2. Sanity — the service needs a resolvable openclaw_token (openclaw.json).
TOKEN=$(node -e "try{const j=require('$OPENCLAW_JSON');process.stdout.write(((j.gateway||{}).auth||{}).token||'')}catch(e){}")
if [ -z "$TOKEN" ] && [ ! -s "$TOKEN_FILE" ]; then
    echo "FATAL: no openclaw_token (gateway.auth.token in $OPENCLAW_JSON, nor $TOKEN_FILE)" >&2
    exit 1
fi

# 3. systemd unit (runs as the openclaw user — NOT root; loopback only).
cat > /etc/systemd/system/exec-service.service <<SVCEOF
[Unit]
Description=Exec-service (on-VPS sovereign execution, S1)
After=network.target

[Service]
Type=simple
User=openclaw
Environment=HOME=/home/openclaw
Environment=EXEC_PORT=$PORT
Environment=EXEC_HOME=$OPENCLAW_HOME
Environment=EXEC_OPENCLAW_JSON=$OPENCLAW_JSON
Environment=EXEC_TOKEN_FILE=$TOKEN_FILE
Environment=EXEC_LITELLM_URL=http://127.0.0.1:4000
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable exec-service >/dev/null 2>&1 || true
systemctl restart exec-service
sleep 2
systemctl is-active exec-service || { journalctl -u exec-service --no-pager | tail -20; exit 1; }

# 4. Expose /exec/* on the agent vhost (the only server block proxying to :3000).
#    Idempotent + nginx -t guarded; restores the backup if the config fails.
echo "=== nginx /exec/ injection ==="
BACKUP="$NGINX_SITE.bak-exec-$(date +%s)"
cp -f "$NGINX_SITE" "$BACKUP"
EXEC_PORT="$PORT" python3 - "$NGINX_SITE" <<'PYEOF'
import os, re, sys
path = sys.argv[1]
port = os.environ.get("EXEC_PORT", "3101")
src = open(path, "r", encoding="utf-8").read()
block = (
    "\n    location /exec/ {\n"
    "        proxy_pass http://127.0.0.1:%s/exec/;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_read_timeout 1800s;\n"
    "        proxy_send_timeout 1800s;\n"
    "        client_max_body_size 32m;\n"
    "    }\n"
) % port
out, i, n = [], 0, len(src)
changed = False
while i < n:
    if src.startswith("server", i) and re.match(r"server\s*\{", src[i:i+12]):
        depth, j = 0, i
        while j < n:
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        seg = src[i:j]
        if "127.0.0.1:3000" in seg and "location /exec/" not in seg:
            brace = seg.index("{") + 1
            seg = seg[:brace] + block + seg[brace:]
            changed = True
        out.append(seg)
        i = j
    else:
        out.append(src[i])
        i += 1
if changed:
    open(path, "w", encoding="utf-8").write("".join(out))
    print("injected /exec/ location")
else:
    print("already present or no agent vhost — no change")
PYEOF

if nginx -t 2>&1; then
    systemctl reload nginx
    echo "nginx reloaded"
else
    echo "nginx -t FAILED — restoring backup $BACKUP" >&2
    cp -f "$BACKUP" "$NGINX_SITE"
    exit 1
fi

# 5. Health probe (loopback + authed).
echo "=== health ==="
curl -fsS -m 5 "http://127.0.0.1:$PORT/exec/health" && echo
echo "=== exec-service install OK ==="
