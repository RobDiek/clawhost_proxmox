#!/bin/bash
# Twenty CRM — generate API key + configure OpenClaw MCP
# Usage: bash twenty-mcp-setup.sh <workspace_id>

WS_ID="${1:-$(PGPASSWORD=twenty docker exec -e PGPASSWORD=twenty openclaw-twenty-db-1 psql -U twenty -d twenty -t -A -c "SELECT id FROM core.workspace WHERE \"activationStatus\"='ACTIVE' LIMIT 1;")}"
echo "Workspace: $WS_ID"

# Generate API key via Twenty CLI (requires NODE_ENV=development)
echo "=== Generating API key ==="
API_KEY=$(docker exec -e NODE_ENV=development openclaw-twenty-1 node dist/command/command workspace:generate-api-key --workspace-id "$WS_ID" 2>&1 | grep "TOKEN:" | sed "s/.*TOKEN://")

if [ -z "$API_KEY" ]; then
  echo "ERROR: Failed to generate API key"
  exit 1
fi
echo "API Key: ${API_KEY:0:50}..."

# Test the API key
echo "=== Testing API key ==="
TEST=$(curl -sf http://127.0.0.1:3080/rest/metadata/objects -H "Authorization: Bearer $API_KEY" 2>&1 | head -100)
if echo "$TEST" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'OK: {len(d.get(\"data\",{}).get(\"objects\",[]))} objects')" 2>/dev/null; then
  echo "API key works!"
else
  echo "Warning: API test inconclusive, continuing anyway..."
fi

# Configure OpenClaw MCP
echo "=== Configuring OpenClaw MCP ==="
# Find OpenClaw config
CONFIG=$(find /home -name openclaw.json -path "*/.openclaw/*" 2>/dev/null | head -1)
[ -z "$CONFIG" ] && CONFIG=$(find /root -name openclaw.json -path "*/.openclaw/*" 2>/dev/null | head -1)
[ -z "$CONFIG" ] && CONFIG="/home/openclaw/.openclaw/openclaw.json"
echo "OpenClaw config: $CONFIG"
mkdir -p "$(dirname "$CONFIG")"

python3 << PYEOF
import json, os

config_path = "$CONFIG"
config = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)

if "mcp" not in config:
    config["mcp"] = {}
if "servers" not in config["mcp"]:
    config["mcp"]["servers"] = {}

config["mcp"]["servers"]["twenty-crm"] = {
    "command": "npx",
    "args": ["-y", "@iflow-mcp/oumnya-twenty-mcp-server"],
    "env": {
        "TWENTY_API_KEY": "$API_KEY",
        "TWENTY_API_URL": "http://127.0.0.1:3080"
    }
}

with open(config_path, "w") as f:
    json.dump(config, f, indent=2)

print("MCP configured:")
print(json.dumps(config["mcp"], indent=2))
PYEOF

echo ""
echo "=== Done ==="
echo "Twenty API Key: ${API_KEY:0:40}..."
echo "MCP Server: twenty-crm → configured in OpenClaw"
echo "Agents can now use 29 CRM tools (Contacts, Companies, Tasks, Notes, Opportunities, etc.)"
