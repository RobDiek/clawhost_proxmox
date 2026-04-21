#!/usr/bin/env python3
"""Generate Twenty CRM API key and configure OpenClaw MCP server."""
import urllib.request, json, sys, os, uuid
from datetime import datetime, timedelta

URL = "http://127.0.0.1:3080/metadata"
EMAIL = sys.argv[1] if len(sys.argv) > 1 else "admin@clawflow.co.il"
PASS = sys.argv[2] if len(sys.argv) > 2 else "ClawFlow2026!"
CRM_URL = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:3080"
OPENCLAW_CONFIG = "/opt/openclaw/data/openclaw/openclaw.json"

def gql(query, token=None):
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except Exception as e:
        body = e.read().decode() if hasattr(e, "read") else str(e)
        return {"error": body}

# Step 1: Get login token
print("Step 1: Getting login token...")
r = gql(f'mutation {{ getLoginTokenFromCredentials(email: "{EMAIL}", password: "{PASS}", origin: "{CRM_URL}") {{ loginToken {{ token }} }} }}')
if "error" in r or "errors" in r:
    print(f"Login failed: {r}")
    sys.exit(1)
login_token = r["data"]["getLoginTokenFromCredentials"]["loginToken"]["token"]
print(f"  Login token: {login_token[:30]}...")

# Step 2: Exchange login token for access+refresh tokens via Twenty's token exchange
# The /verify endpoint exchanges login tokens
print("Step 2: Exchanging for access token...")
verify_data = json.dumps({"loginToken": login_token}).encode()
verify_req = urllib.request.Request(
    f"{CRM_URL}/api/auth/tokens",
    data=verify_data,
    headers={"Content-Type": "application/json"}
)
try:
    verify_resp = urllib.request.urlopen(verify_req)
    tokens = json.loads(verify_resp.read())
    access_token = tokens.get("accessToken", {}).get("token") or tokens.get("tokens", {}).get("accessToken", {}).get("token")
    if not access_token:
        # Try nested structure
        print(f"  Token response: {json.dumps(tokens)[:300]}")
        # Fallback: try to find token in response
        for key in ["accessToken", "access_token", "token"]:
            if key in tokens and isinstance(tokens[key], str):
                access_token = tokens[key]
                break
            elif key in tokens and isinstance(tokens[key], dict) and "token" in tokens[key]:
                access_token = tokens[key]["token"]
                break
except Exception as e:
    print(f"  Token exchange failed: {e}")
    # Try alternative: /api/auth/verify
    try:
        verify_req2 = urllib.request.Request(
            f"{CRM_URL}/api/auth/verify",
            data=json.dumps({"loginToken": login_token}).encode(),
            headers={"Content-Type": "application/json"}
        )
        verify_resp2 = urllib.request.urlopen(verify_req2)
        tokens = json.loads(verify_resp2.read())
        access_token = tokens.get("accessToken", {}).get("token") or tokens.get("tokens", {}).get("accessToken", {}).get("token")
        print(f"  Verify response: {json.dumps(tokens)[:300]}")
    except Exception as e2:
        print(f"  Verify also failed: {e2}")
        access_token = None

if not access_token:
    print("ERROR: Could not get access token. Trying GraphQL renewToken...")
    # Get refresh token from signIn
    r_signin = gql(f'mutation {{ signIn(email: "{EMAIL}", password: "{PASS}") {{ tokens {{ refreshToken {{ token }} }} }} }}')
    refresh = r_signin["data"]["signIn"]["tokens"]["refreshToken"]["token"]

    # Try to create API key via direct DB insert
    print("  Falling back to direct DB API key creation...")
    api_key_id = str(uuid.uuid4())
    api_key_token = str(uuid.uuid4()).replace("-", "") + str(uuid.uuid4()).replace("-", "")
    expires = (datetime.now() + timedelta(days=3650)).strftime("%Y-%m-%d")

    # Get workspace ID
    import subprocess
    ws_id = subprocess.run(
        ["docker", "exec", "-e", "PGPASSWORD=twenty", "openclaw-twenty-db-1",
         "psql", "-U", "twenty", "-d", "twenty", "-t", "-A", "-c",
         "SELECT id FROM core.workspace LIMIT 1;"],
        capture_output=True, text=True
    ).stdout.strip()

    user_id = subprocess.run(
        ["docker", "exec", "-e", "PGPASSWORD=twenty", "openclaw-twenty-db-1",
         "psql", "-U", "twenty", "-d", "twenty", "-t", "-A", "-c",
         f"SELECT id FROM core.\"user\" WHERE email='{EMAIL}' LIMIT 1;"],
        capture_output=True, text=True
    ).stdout.strip()

    print(f"  Workspace: {ws_id}, User: {user_id}")

    # Insert API key record
    import hashlib, secrets
    raw_key = secrets.token_hex(32)

    subprocess.run(
        ["docker", "exec", "-e", "PGPASSWORD=twenty", "openclaw-twenty-db-1",
         "psql", "-U", "twenty", "-d", "twenty", "-c",
         f"""INSERT INTO core."apiKey" (id, name, "workspaceId", "expiresAt", "createdAt", "updatedAt")
         VALUES ('{api_key_id}', 'ClawFlow Agent', '{ws_id}', '{expires}', NOW(), NOW())
         ON CONFLICT DO NOTHING;"""],
        capture_output=True, text=True
    )

    # Generate token via Twenty's internal method
    result = subprocess.run(
        ["docker", "exec", "-e", f"NODE_ENV=development", "openclaw-twenty-1",
         "node", "dist/command/command", "workspace:generate-api-key",
         "--workspace-id", ws_id],
        capture_output=True, text=True
    )
    output = result.stdout + result.stderr
    print(f"  CLI output: {output[-500:]}")

    # Extract token from output
    for line in output.split("\n"):
        if "token" in line.lower() or "key" in line.lower():
            print(f"  >> {line}")

    # If all else fails, use the raw key as API key for MCP
    access_token = raw_key
    print(f"  Using generated key: {raw_key[:20]}...")

print(f"  Access token: {access_token[:30] if access_token else 'NONE'}...")

# Step 3: Create API key via GraphQL (if we have access token)
if access_token:
    print("Step 3: Creating API key...")
    api_key_id = str(uuid.uuid4())
    expires = (datetime.now() + timedelta(days=3650)).isoformat() + "Z"

    # First create the API key record
    r3 = gql(f'mutation {{ createApiKey(data: {{name: "ClawFlow Agent", expiresAt: "{expires}"}}) {{ id }} }}', token=access_token)
    print(f"  createApiKey: {json.dumps(r3)[:200]}")

    if r3.get("data", {}).get("createApiKey", {}).get("id"):
        key_id = r3["data"]["createApiKey"]["id"]
        # Generate token for the API key
        r4 = gql(f'mutation {{ generateApiKeyToken(apiKeyId: "{key_id}", expiresAt: "{expires}") {{ token }} }}', token=access_token)
        print(f"  generateApiKeyToken: {json.dumps(r4)[:200]}")

        if r4.get("data", {}).get("generateApiKeyToken", {}).get("token"):
            api_token = r4["data"]["generateApiKeyToken"]["token"]
            print(f"  API Key: {api_token[:30]}...")

            # Step 4: Configure OpenClaw MCP
            print("Step 4: Configuring OpenClaw MCP...")
            config = {}
            if os.path.exists(OPENCLAW_CONFIG):
                with open(OPENCLAW_CONFIG) as f:
                    config = json.load(f)

            if "mcp" not in config:
                config["mcp"] = {}
            if "servers" not in config["mcp"]:
                config["mcp"]["servers"] = {}

            config["mcp"]["servers"]["twenty-crm"] = {
                "command": "npx",
                "args": ["-y", "@iflow-mcp/oumnya-twenty-mcp-server"],
                "env": {
                    "TWENTY_API_KEY": api_token,
                    "TWENTY_API_URL": CRM_URL
                }
            }

            with open(OPENCLAW_CONFIG, "w") as f:
                json.dump(config, f, indent=2)

            print(f"  MCP configured in {OPENCLAW_CONFIG}")
            print(f"\n=== SUCCESS ===")
            print(f"Twenty API Key: {api_token[:20]}...")
            print(f"MCP Server: twenty-crm configured")
        else:
            print(f"  ERROR: Could not generate API key token")
    else:
        print(f"  ERROR: Could not create API key")
