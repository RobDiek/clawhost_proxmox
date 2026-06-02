#!/bin/bash
# Twenty CRM — auto-create admin workspace + user
# Usage: bash twenty-setup.sh <email> <password>

EMAIL="${1:-admin@clawflow.co.il}"
PASS="${2:-Flowmatic2026!}"

dbcmd() {
  PGPASSWORD=twenty docker exec -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty -t -A -c "$1"
}

echo "=== Waiting for Twenty ==="
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://127.0.0.1:3080/metadata -H "Content-Type: application/json" -d '{"query":"{__typename}"}' && break
  sleep 5
done
echo "Twenty ready"

# Hash password via Twenty container (has bcrypt)
HASH=$(docker exec openclaw-twenty-1 node -e "require('bcrypt').hash('$PASS',10).then(h=>console.log(h))" 2>/dev/null)
[ -z "$HASH" ] && echo "ERROR: bcrypt failed" && exit 1
echo "Password hashed"

# UUIDs
WS_ID=$(cat /proc/sys/kernel/random/uuid)
UW_ID=$(cat /proc/sys/kernel/random/uuid)
DS_ID=$(cat /proc/sys/kernel/random/uuid)

# Insert user
dbcmd "INSERT INTO core.\"user\" (id, \"firstName\", \"lastName\", email, \"passwordHash\", \"isEmailVerified\", disabled, \"canImpersonate\", \"canAccessFullAdminPanel\", \"createdAt\", \"updatedAt\", locale) VALUES (gen_random_uuid(), '${EMAIL%%@*}', '', '$EMAIL', '$HASH', true, false, true, true, NOW(), NOW(), 'en') ON CONFLICT (email) WHERE \"deletedAt\" IS NULL DO UPDATE SET \"passwordHash\" = EXCLUDED.\"passwordHash\", \"isEmailVerified\" = true, \"canImpersonate\" = true, \"canAccessFullAdminPanel\" = true;"

USER_ID=$(dbcmd "SELECT id FROM core.\"user\" WHERE email='$EMAIL' AND \"deletedAt\" IS NULL LIMIT 1;")
echo "User: $USER_ID"

# Create workspace
dbcmd "INSERT INTO core.workspace (id, \"displayName\", subdomain, \"activationStatus\", \"createdAt\", \"updatedAt\") VALUES ('$WS_ID', 'Flowmatic CRM', 'twenty', 'ACTIVE', NOW(), NOW());"
echo "Workspace: $WS_ID"

# Link user to workspace
dbcmd "INSERT INTO core.\"userWorkspace\" (id, \"userId\", \"workspaceId\", \"createdAt\", \"updatedAt\") VALUES ('$UW_ID', '$USER_ID', '$WS_ID', NOW(), NOW());"

# Restart Twenty to pick up new workspace
docker restart openclaw-twenty-1
echo "Restarting Twenty..."
sleep 15

echo "=== Verify ==="
dbcmd "SELECT email, \"canAccessFullAdminPanel\" FROM core.\"user\";"
dbcmd "SELECT \"displayName\", subdomain, \"activationStatus\" FROM core.workspace;"
dbcmd "SELECT \"userId\", \"workspaceId\" FROM core.\"userWorkspace\";"
echo "=== Login: $EMAIL / $PASS ==="
