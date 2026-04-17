#!/bin/bash
# test-facts-stack.sh — end-to-end smoke test for Neo4j + openclaw-facts plugin.
# Runs on any MATEH-type tenant VPS. Verifies infra + plugin + graph ops.
#
# Usage: bash test-facts-stack.sh   (run as root on tenant VPS)
# Returns: 0 if all tests pass, non-zero otherwise.

set +e
PASS=0
FAIL=0
EMOJI_OK="✓"
EMOJI_FAIL="✗"

check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "$EMOJI_OK $name"; PASS=$((PASS+1))
  else
    echo "$EMOJI_FAIL $name"; FAIL=$((FAIL+1))
  fi
}

check_stdout() {
  local name="$1"; local needle="$2"; shift 2
  local out
  out=$("$@" 2>&1)
  if echo "$out" | grep -q "$needle"; then
    echo "$EMOJI_OK $name"; PASS=$((PASS+1))
  else
    echo "$EMOJI_FAIL $name (expected: $needle)"; FAIL=$((FAIL+1))
  fi
}

# Get Neo4j password from Activepieces postgres env (shared AUTOMATION_PASSWORD)
NEO4J_PW=$(docker inspect openclaw-ap-postgres-1 --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep POSTGRES_PASSWORD | cut -d= -f2)
if [ -z "$NEO4J_PW" ]; then
  echo "$EMOJI_FAIL Cannot retrieve AUTOMATION_PASSWORD (is Activepieces deployed?)"
  exit 1
fi

echo "=== Infrastructure ==="
check "Neo4j container running"    bash -c "docker ps --format '{{.Names}}' | grep -q openclaw-neo4j-1"
check "Neo4j health check passing" docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p "$NEO4J_PW" 'RETURN 1'

echo "=== Schema ==="
check_stdout "Entity constraint exists" "entity_id" docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p "$NEO4J_PW" "SHOW CONSTRAINTS"
check_stdout "Entity type index exists" "entity_type" docker exec openclaw-neo4j-1 cypher-shell -u neo4j -p "$NEO4J_PW" "SHOW INDEXES"

echo "=== Plugin installation ==="
PLUGIN_DIR=/home/openclaw/.openclaw/extensions/openclaw-facts
check "Plugin dir exists"         test -d "$PLUGIN_DIR"
check "package.json present"      test -f "$PLUGIN_DIR/package.json"
check "dist/index.js present"     test -f "$PLUGIN_DIR/dist/index.js"
check "neo4j-driver installed"    test -d "$PLUGIN_DIR/node_modules/neo4j-driver"
check_stdout "Registered in openclaw.json" "openclaw-facts" cat /home/openclaw/.openclaw/openclaw.json

echo "=== End-to-end graph ops ==="
# Write a Node script to a temp file (avoids shell-quote-hell with inline -e)
TEST_SCRIPT=/tmp/_facts_test_$$.js
cat > $TEST_SCRIPT <<NODEEOF
const p = require('$PLUGIN_DIR/dist/index.js');
const ctx = { config: { uri: 'bolt://localhost:7687', user: 'neo4j', password: process.env.NEO4J_PW } };
(async () => {
  const add = await p.tools.fact_add.handler({
    subject: '__TEST_SUBJ', subjectType: '__test',
    predicate: '__TEST_PRED',
    object: '__TEST_OBJ', objectType: '__test',
    source: 'test-suite', confidence: 1.0
  }, ctx);
  if (!add.ok) throw new Error('fact_add failed');
  const q = await p.tools.fact_query.handler({ subjectType: '__test' }, ctx);
  if (!q.facts || q.facts.length === 0) throw new Error('fact_query returned empty');
  if (q.facts[0].predicate !== '__TEST_PRED') throw new Error('predicate mismatch');
  const e = await p.tools.entity_list.handler({ type: '__test' }, ctx);
  if (!e.entities || e.entities.length === 0) throw new Error('entity_list returned empty');
  const neo4j = require('$PLUGIN_DIR/node_modules/neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', process.env.NEO4J_PW));
  const session = driver.session();
  await session.run("MATCH (n:Entity {type:'__test'}) DETACH DELETE n");
  await session.close(); await driver.close();
  await p.onUnload();
  console.log('ALL_GOOD');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
NODEEOF
chown openclaw:openclaw $TEST_SCRIPT
TEST_OUT=$(su - openclaw -c "NEO4J_PW='$NEO4J_PW' node $TEST_SCRIPT" 2>&1)
rm -f $TEST_SCRIPT

if echo "$TEST_OUT" | grep -q "ALL_GOOD"; then
  echo "$EMOJI_OK End-to-end: fact_add -> fact_query -> entity_list -> cleanup"; PASS=$((PASS+1))
else
  echo "$EMOJI_FAIL End-to-end test failed: $TEST_OUT"; FAIL=$((FAIL+1))
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
