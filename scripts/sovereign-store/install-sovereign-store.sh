#!/bin/bash
# Install / update the on-VPS sovereign-store (tenant sovereignty Phase 2, P2.0).
#
# Idempotent. Run ON A TENANT VPS as root. For P2.0 this is applied MANUALLY to
# the master VPS (44f484a852) ONLY — it is NOT folded into the global install.sh
# yet (so new provisions are untouched until the design is proven). It does NOT
# change any existing service; it adds a standalone loopback HTTP + SQLite store
# and exposes /sovereign/* on the agent vhost.
#
# Source files (server.js, package.json) are expected NEXT TO this script.
# Copy the scripts/sovereign-store/ directory to the box, then run this.
#
# Rollback (full): systemctl disable --now sovereign-store; rm -rf /opt/sovereign-store;
#   remove the /sovereign/ location from /etc/nginx/sites-available/openclaw (a
#   timestamped backup is written here on every run); nginx -t && systemctl reload nginx.
#   The central API does not depend on this service, so removal is safe.
set -euo pipefail

PORT="${SOVEREIGN_PORT:-3100}"
APP_DIR=/opt/sovereign-store
DATA_DIR=/home/openclaw/.openclaw/data
TOKEN_DIR=/home/openclaw/.openclaw/sovereign
OPENCLAW_JSON=/home/openclaw/.openclaw/openclaw.json
NGINX_SITE=/etc/nginx/sites-available/openclaw
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== sovereign-store install (port $PORT) ==="

# 1. Stage app files.
mkdir -p "$APP_DIR"
cp -f "$SRC_DIR/server.js" "$APP_DIR/server.js"
cp -f "$SRC_DIR/package.json" "$APP_DIR/package.json"

# 2. Install deps (better-sqlite3 native; prefers a prebuilt binary).
echo "=== npm install (better-sqlite3) ==="
( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5 )

# 3. Drop the auth token (same value as gateway.auth.token) so the service has a
#    dedicated source; the service also falls back to openclaw.json if absent.
mkdir -p "$TOKEN_DIR" "$DATA_DIR"
TOKEN=$(node -e "try{const j=require('$OPENCLAW_JSON');process.stdout.write(((j.gateway||{}).auth||{}).token||'')}catch(e){}")
if [ -z "$TOKEN" ]; then
    echo "FATAL: could not read gateway.auth.token from $OPENCLAW_JSON" >&2
    exit 1
fi
printf '%s' "$TOKEN" > "$TOKEN_DIR/token"
chmod 600 "$TOKEN_DIR/token"
chown -R openclaw:openclaw "$TOKEN_DIR" "$DATA_DIR" "$APP_DIR"

# 4. systemd unit (runs as the openclaw user; loopback only).
cat > /etc/systemd/system/sovereign-store.service <<SVCEOF
[Unit]
Description=Sovereign-store (on-VPS tenant content store, Phase 2)
After=network.target

[Service]
Type=simple
User=openclaw
Environment=HOME=/home/openclaw
Environment=SOVEREIGN_PORT=$PORT
Environment=SOVEREIGN_DB=$DATA_DIR/sovereign.db
Environment=SOVEREIGN_TOKEN_FILE=$TOKEN_DIR/token
Environment=SOVEREIGN_OPENCLAW_JSON=$OPENCLAW_JSON
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable sovereign-store >/dev/null 2>&1 || true
systemctl restart sovereign-store
sleep 2
systemctl is-active sovereign-store || { journalctl -u sovereign-store --no-pager | tail -20; exit 1; }

# 5. Expose /sovereign/* on the agent vhost (the only server block proxying to
#    :3000). Idempotent + nginx -t guarded; restores the backup if the config
#    fails to validate.
echo "=== nginx /sovereign/ injection ==="
BACKUP="$NGINX_SITE.bak-$(date +%s)"
cp -f "$NGINX_SITE" "$BACKUP"
SOVEREIGN_PORT="$PORT" python3 - "$NGINX_SITE" <<'PYEOF'
import os, re, sys
path = sys.argv[1]
port = os.environ.get("SOVEREIGN_PORT", "3100")
src = open(path, "r", encoding="utf-8").read()

block = (
    "\n    location /sovereign/ {\n"
    "        proxy_pass http://127.0.0.1:%s/sovereign/;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "        proxy_set_header X-Forwarded-Proto $scheme;\n"
    "        proxy_read_timeout 120s;\n"
    "        client_max_body_size 16m;\n"
    "    }\n"
) % port

# Walk top-level server { ... } blocks by brace depth; inject into any block that
# proxies to :3000 (the agent gateway vhost) and lacks a /sovereign/ location.
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
        if "127.0.0.1:3000" in seg and "location /sovereign/" not in seg:
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
    print("injected /sovereign/ location")
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

# 6. Health probes (loopback + through nginx with token).
echo "=== health ==="
curl -fsS -m 5 "http://127.0.0.1:$PORT/sovereign/health" && echo
echo "=== stats (authed, loopback) ==="
curl -fsS -m 5 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/sovereign/stats" && echo

echo "=== sovereign-store install OK ==="
