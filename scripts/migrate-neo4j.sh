#!/bin/bash
# Migrate existing MATEH instance to include Neo4j Community 5 + schema seed.
# Usage: bash migrate-neo4j.sh <VPS_IP> <ROOT_PASSWORD> <AUTOMATION_PASSWORD>
# License: Neo4j Community = GPLv3. Used as separate DB via Bolt protocol only.

set -e
IP="${1:?missing VPS IP}"
ROOT_PW="${2:?missing root password}"
AP_PW="${3:?missing automation password}"

echo "=== Neo4j migration → $IP ==="

sshpass -p "$ROOT_PW" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@"$IP" bash <<ENDSSH
set -e
cd /opt/openclaw

echo "Step 1: create dirs"
mkdir -p /opt/openclaw/data/neo4j/{data,logs,import,plugins}

echo "Step 2: write compose"
cat > /opt/openclaw/docker-compose.neo4j.yml <<'NEO4JEOF'
services:
  neo4j:
    image: neo4j:5-community
    restart: unless-stopped
    ports: ["127.0.0.1:7474:7474", "127.0.0.1:7687:7687"]
    environment:
      - NEO4J_AUTH=neo4j/${AP_PW}
      - NEO4J_server_memory_heap_initial__size=512m
      - NEO4J_server_memory_heap_max__size=1g
      - NEO4J_server_memory_pagecache_size=512m
      - NEO4J_db_tx__log_rotation_retention__policy=100M size
    volumes:
      - /opt/openclaw/data/neo4j/data:/data
      - /opt/openclaw/data/neo4j/logs:/logs
      - /opt/openclaw/data/neo4j/import:/var/lib/neo4j/import
      - /opt/openclaw/data/neo4j/plugins:/plugins
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p '${AP_PW}' 'RETURN 1' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
NEO4JEOF

echo "Step 3: pull + start Neo4j"
# Discover which other compose files are active (Qdrant, Langfuse, LiteLLM)
COMPOSE_FILES="-f docker-compose.yml"
for f in docker-compose.qdrant.yml docker-compose.langfuse.yml docker-compose.neo4j.yml; do
  [ -f "/opt/openclaw/\$f" ] && COMPOSE_FILES="\$COMPOSE_FILES -f \$f"
done
docker compose \$COMPOSE_FILES up -d neo4j

echo "Step 4: wait for Neo4j readiness (up to 2 min)"
for i in \$(seq 1 24); do
  if docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p '${AP_PW}' 'RETURN 1' >/dev/null 2>&1; then
    echo "Neo4j ready after \$i attempts"; break
  fi
  echo "  attempt \$i/24..."
  sleep 5
done

echo "Step 5: seed schema"
docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p '${AP_PW}' "
  CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;
  CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type);
  CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name);
  CREATE INDEX fact_subject IF NOT EXISTS FOR ()-[r:FACT]-() ON (r.subject);
  CREATE INDEX fact_validFrom IF NOT EXISTS FOR ()-[r:FACT]-() ON (r.validFrom);
"

echo "Step 6: verify"
docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p '${AP_PW}' '
  SHOW CONSTRAINTS;
  SHOW INDEXES;
'

echo "=== Done ==="
docker ps --format '{{.Names}}: {{.Status}}' | grep neo4j
ENDSSH
