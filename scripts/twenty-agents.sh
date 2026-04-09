#!/bin/bash
# Twenty CRM — create sub-agent users for MATEH
# Each sub-agent gets its own CRM user so actions are attributed correctly
# Usage: bash twenty-agents.sh

AGENTS="sayer meater maazin menateach et yotzer shaliach migdalor"
AGENT_NAMES="סייר מאתר מאזין מנתח עט יוצר שליח מגדלור"

dbq() {
  PGPASSWORD=twenty docker exec -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty -t -A -c "$1" 2>/dev/null
}

# Get workspace ID and schema
WS_ID=$(dbq "SELECT id FROM core.workspace WHERE \"activationStatus\"='ACTIVE' LIMIT 1;")
WS_SCHEMA=$(dbq "SELECT schema FROM core.\"dataSource\" WHERE \"workspaceId\"='$WS_ID' LIMIT 1;")
echo "Workspace: $WS_ID (schema: $WS_SCHEMA)"

if [ -z "$WS_ID" ] || [ -z "$WS_SCHEMA" ]; then
  echo "ERROR: No active workspace found"
  exit 1
fi

# Check if workspaceMember table exists in workspace schema
TABLE_CHECK=$(dbq "SELECT 1 FROM information_schema.tables WHERE table_schema='$WS_SCHEMA' AND table_name='workspaceMember' LIMIT 1;")
if [ -z "$TABLE_CHECK" ]; then
  echo "ERROR: workspaceMember table not found in $WS_SCHEMA"
  exit 1
fi

# Get columns of workspaceMember to know exact schema
echo "=== workspaceMember columns ==="
dbq "SELECT column_name FROM information_schema.columns WHERE table_schema='$WS_SCHEMA' AND table_name='workspaceMember' ORDER BY ordinal_position;" | head -20

# Create each agent
set -- $AGENT_NAMES
for AGENT in $AGENTS; do
  HE_NAME=$1; shift
  USER_ID=$(cat /proc/sys/kernel/random/uuid)
  UW_ID=$(cat /proc/sys/kernel/random/uuid)
  WM_ID=$(cat /proc/sys/kernel/random/uuid)
  EMAIL="${AGENT}@agent.clawflow.local"

  # Create user
  dbq "INSERT INTO core.\"user\" (id, \"firstName\", \"lastName\", email, \"isEmailVerified\", disabled, \"canImpersonate\", \"canAccessFullAdminPanel\", locale, \"createdAt\", \"updatedAt\") VALUES ('$USER_ID', '$HE_NAME', 'סוכן', '$EMAIL', true, false, false, false, 'he', NOW(), NOW()) ON CONFLICT (email) WHERE \"deletedAt\" IS NULL DO NOTHING;" 2>/dev/null

  # Get actual user ID (may already exist)
  REAL_UID=$(dbq "SELECT id FROM core.\"user\" WHERE email='$EMAIL' AND \"deletedAt\" IS NULL LIMIT 1;")

  # Link to workspace
  dbq "INSERT INTO core.\"userWorkspace\" (id, \"userId\", \"workspaceId\", \"createdAt\", \"updatedAt\") VALUES ('$UW_ID', '$REAL_UID', '$WS_ID', NOW(), NOW()) ON CONFLICT DO NOTHING;" 2>/dev/null

  # Create workspace member
  dbq "INSERT INTO \"$WS_SCHEMA\".\"workspaceMember\" (id, \"userId\", \"nameFirstName\", \"nameLastName\", \"userEmail\", locale, \"createdAt\", \"updatedAt\") VALUES ('$WM_ID', '$REAL_UID', '$HE_NAME', 'סוכן', '$EMAIL', 'he', NOW(), NOW()) ON CONFLICT DO NOTHING;" 2>/dev/null

  echo "Created: $AGENT ($HE_NAME) → $REAL_UID"
done

# Verify via REST API
API_KEY=$(docker exec -e NODE_ENV=development openclaw-twenty-1 node dist/command/command workspace:generate-api-key --workspace-id $WS_ID 2>&1 | grep "TOKEN:" | sed "s/.*TOKEN://")
echo ""
echo "=== All workspace members ==="
curl -s http://127.0.0.1:3080/rest/workspaceMembers -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for m in d['data']['workspaceMembers']:
    print(f\"  {m['name']['firstName']} {m['name']['lastName']} — {m['userEmail']}\")
" 2>/dev/null

echo ""
echo "=== Done ==="
echo "Sub-agents can now assign tasks to each other in Twenty CRM"
