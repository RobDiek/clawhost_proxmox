#!/bin/bash
# ClawFlow Self-Healing Health Daemon v2
# Runs every 5 minutes via systemd timer on each client VPS

INSTANCE_ID="__INSTANCE_ID__"
API_URL="https://api.clawflow.flowmatic.co.il"
AUTO_HEAL="__AUTO_HEAL__"
HEALTH_TOKEN="__HEALTH_TOKEN__"
STATE_FILE="/tmp/clawflow-health-state"

# ── Restart limiter: max 2 restarts per service per hour ──
can_restart() {
  local service="$1"
  local count_file="${STATE_FILE}-${service}"
  local now=$(date +%s)
  local last_restart=$(cat "$count_file" 2>/dev/null || echo 0)
  local diff=$((now - last_restart))
  if [ "$diff" -lt 1800 ]; then
    return 1  # Too soon — skip restart
  fi
  echo "$now" > "$count_file"
  return 0
}

# ── Collect Metrics ──
CPU=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print int($2 + $4)}' || echo 0)
RAM=$(free 2>/dev/null | awk '/Mem:/{printf "%d", $3/$2*100}' || echo 0)
DISK=$(df / 2>/dev/null | awk 'NR==2{print int($5)}' || echo 0)

# ── Check Services ──
OC_STATUS="dead"
systemctl is-active openclaw-gateway >/dev/null 2>&1 && OC_STATUS="active"

QDRANT_STATUS="dead"
curl -sf --max-time 3 http://127.0.0.1:6333/healthz >/dev/null 2>&1 && QDRANT_STATUS="ok"

AUTO_STATUS="dead"
curl -sf --max-time 3 http://127.0.0.1:8080/ >/dev/null 2>&1 && AUTO_STATUS="ok"
curl -sf --max-time 3 http://127.0.0.1:5678/healthz >/dev/null 2>&1 && AUTO_STATUS="ok"
curl -sf --max-time 3 http://127.0.0.1:3101/ >/dev/null 2>&1 && AUTO_STATUS="ok"

# ── SSL Days Until Expiry (cached — check once per hour) ──
SSL_DAYS=999
SSL_CACHE="/tmp/clawflow-ssl-days"
if [ ! -f "$SSL_CACHE" ] || [ $(($(date +%s) - $(stat -c %Y "$SSL_CACHE" 2>/dev/null || echo 0))) -gt 3600 ]; then
  DOMAIN=$(grep server_name /etc/nginx/sites-available/openclaw 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';' | tr -d '"')
  if [ -n "$DOMAIN" ] && echo "$DOMAIN" | grep -qE '^[a-zA-Z0-9.-]+$'; then
    EXPIRY=$(echo | timeout 5 openssl s_client -servername "$DOMAIN" -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$EXPIRY" ]; then
      SSL_DAYS=$(( ($(date -d "$EXPIRY" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400 ))
      [ "$SSL_DAYS" -lt 0 ] && SSL_DAYS=0
    fi
  fi
  echo "$SSL_DAYS" > "$SSL_CACHE"
else
  SSL_DAYS=$(cat "$SSL_CACHE" 2>/dev/null || echo 999)
fi

# ── OpenClaw Version (sanitized for JSON) ──
OC_VERSION=$(su - openclaw -c 'openclaw --version 2>/dev/null' | tr -cd '[:alnum:]._-' | head -c 50 || echo "unknown")

# ── Auto-Heal Actions ──
ACTIONS=""

if [ "$AUTO_HEAL" = "true" ]; then

  # Gateway down → restart (with rate limit)
  if [ "$OC_STATUS" = "dead" ] && can_restart "gateway"; then
    systemctl restart openclaw-gateway 2>/dev/null
    sleep 5
    systemctl is-active openclaw-gateway >/dev/null 2>&1 && OC_STATUS="active"
    ACTIONS="${ACTIONS}gateway_restarted,"
  fi

  # Qdrant down → restart (with rate limit)
  if [ "$QDRANT_STATUS" = "dead" ] && can_restart "qdrant"; then
    cd /opt/openclaw && docker compose -f docker-compose.yml -f docker-compose.qdrant.yml up -d qdrant 2>/dev/null
    sleep 8
    curl -sf --max-time 3 http://127.0.0.1:6333/healthz >/dev/null 2>&1 && QDRANT_STATUS="ok"
    ACTIONS="${ACTIONS}qdrant_restarted,"
  fi

  # Automation tool down → restart specific service (with rate limit)
  if [ "$AUTO_STATUS" = "dead" ] && can_restart "automation"; then
    cd /opt/openclaw && docker compose up -d n8n 2>/dev/null; docker compose up -d activepieces 2>/dev/null
    sleep 8
    ACTIONS="${ACTIONS}automation_restarted,"
  fi

  # Disk > 85% → clean (with rate limit — once per hour)
  if [ "$DISK" -gt 85 ] && can_restart "disk_clean"; then
    docker system prune -f 2>/dev/null
    journalctl --vacuum-size=50M 2>/dev/null
    find /var/log -name "*.gz" -mtime +3 -delete 2>/dev/null
    find /tmp -mtime +7 -delete 2>/dev/null
    ACTIONS="${ACTIONS}disk_cleaned,"
  fi

  # RAM > 90% → restart gateway (with rate limit)
  if [ "$RAM" -gt 90 ] && [ "$OC_STATUS" = "active" ] && can_restart "ram"; then
    systemctl restart openclaw-gateway 2>/dev/null
    sleep 5
    ACTIONS="${ACTIONS}ram_restart,"
  fi

  # SSL < 7 days → renew (with rate limit — once per day)
  if [ "$SSL_DAYS" -lt 7 ] && [ "$SSL_DAYS" -ne 999 ] && can_restart "ssl"; then
    certbot renew --quiet 2>/dev/null
    rm -f "$SSL_CACHE"
    ACTIONS="${ACTIONS}ssl_renewed,"
  fi

fi

ACTIONS="${ACTIONS%,}"

# ── Report to Management API (with timeout + auth) ──
curl -sf --max-time 10 --connect-timeout 5 \
  -X POST "$API_URL/hosting/instances/$INSTANCE_ID/health-report" \
  -H "Content-Type: application/json" \
  -H "x-health-token: $HEALTH_TOKEN" \
  -d "{
    \"cpu\": $CPU,
    \"ram\": $RAM,
    \"disk\": $DISK,
    \"gateway\": \"$OC_STATUS\",
    \"qdrant\": \"$QDRANT_STATUS\",
    \"automation\": \"$AUTO_STATUS\",
    \"sslDays\": $SSL_DAYS,
    \"version\": \"$OC_VERSION\",
    \"actions\": \"$ACTIONS\",
    \"ts\": $(date +%s)
  }" > /dev/null 2>&1 || true
