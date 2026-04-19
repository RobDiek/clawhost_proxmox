/**
 * openclaw-facts — OpenClaw MCP plugin
 *
 * Temporal knowledge graph for marketing facts. Backed by Neo4j Community.
 * Purpose: reduce agent token usage by storing structured facts (competitors,
 * personas, keywords, channels, customers) instead of re-reading STRATEGY.md /
 * BRAND.md on every task.
 *
 * Tools:
 *   fact_add        — store a fact (subject, predicate, object, validFrom?, source?)
 *   fact_query      — query facts by subject/predicate/object/type
 *   entity_timeline — all facts involving an entity, time-sorted
 *   entity_list     — list entities by type
 *
 * Node schema: (:Entity { id, name, type, createdAt, metadata })
 *   types: competitor, persona, keyword, channel, customer, pillar, campaign, ...
 * Edge schema: -[:FACT { predicate, validFrom, validTo?, source, confidence }]->
 *
 * Connection: Bolt protocol @ localhost:7687 (neo4j:AUTOMATION_PASSWORD).
 * License: Neo4j used as external DB only — no code embedding/modification.
 */

const neo4j = require('neo4j-driver')
const fs = require('fs')
const path = require('path')

const PENDING_FACTS_PATH = '/home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl'
const PENDING_FACTS_PROCESSED = '/home/openclaw/.openclaw/workspace/PENDING_FACTS.processed.log'

let driver = null

function getDriver(uri, user, password) {
  if (driver) return driver
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 5,
    connectionTimeout: 15000,
  })
  return driver
}

function nowIso() { return new Date().toISOString() }

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

module.exports = {
  name: 'openclaw-facts',
  version: '0.1.0',
  config: {
    uri:      { type: 'string', default: 'bolt://localhost:7687', description: 'Neo4j Bolt URI' },
    user:     { type: 'string', default: 'neo4j', description: 'Neo4j user' },
    password: { type: 'string', required: true, secret: true, description: 'Neo4j password' },
  },

  tools: {
    fact_add: {
      description: 'Store a marketing fact: (subject)-[predicate]->(object). Creates entities if missing. Use timestamps for temporal validity.',
      parameters: {
        type: 'object',
        properties: {
          subject:     { type: 'string', description: 'Entity name (competitor, persona, etc.)' },
          subjectType: { type: 'string', description: 'Type: competitor | persona | keyword | channel | customer | pillar | campaign | product' },
          predicate:   { type: 'string', description: 'Relationship verb: PRICED_AT | COMPETES_WITH | PREFERS | MENTIONS | CONVERTED_VIA | etc.' },
          object:      { type: 'string', description: 'Target entity or literal value' },
          objectType:  { type: 'string', description: 'Type for object (same list as subjectType, or "value" for literals)' },
          validFrom:   { type: 'string', description: 'ISO timestamp — when fact became true (default: now)' },
          validTo:     { type: 'string', description: 'ISO timestamp — when fact stopped being true (for historical facts)' },
          source:      { type: 'string', description: 'Where fact came from: research-stage-2 | agent:sayer | user | etc.' },
          confidence:  { type: 'number', description: '0-1 confidence score' },
        },
        required: ['subject', 'subjectType', 'predicate', 'object']
      },
      handler: async (args, ctx) => {
        const d = getDriver(ctx.config.uri, ctx.config.user, ctx.config.password)
        const session = d.session()
        try {
          const subjId = slug(args.subjectType + '-' + args.subject)
          const objId  = slug((args.objectType || 'value') + '-' + args.object)
          const res = await session.run(`
            MERGE (s:Entity {id: $subjId})
              ON CREATE SET s.name = $subjName, s.type = $subjType, s.createdAt = $now
              ON MATCH  SET s.name = $subjName, s.type = $subjType
            MERGE (o:Entity {id: $objId})
              ON CREATE SET o.name = $objName, o.type = $objType, o.createdAt = $now
              ON MATCH  SET o.name = $objName, o.type = $objType
            CREATE (s)-[r:FACT {
              predicate:  $predicate,
              validFrom:  $validFrom,
              validTo:    $validTo,
              source:     $source,
              confidence: $confidence,
              createdAt:  $now
            }]->(o)
            RETURN s.id AS sid, o.id AS oid, r.predicate AS pred
          `, {
            subjId, subjName: args.subject, subjType: args.subjectType,
            objId,  objName: args.object,    objType: args.objectType || 'value',
            predicate: args.predicate,
            validFrom: args.validFrom || nowIso(),
            validTo:   args.validTo || null,
            source:    args.source || 'agent',
            confidence: args.confidence != null ? args.confidence : 0.8,
            now: nowIso(),
          })
          const r = res.records[0]
          return { ok: true, sid: r.get('sid'), oid: r.get('oid'), predicate: r.get('pred') }
        } finally { await session.close() }
      }
    },

    fact_query: {
      description: 'Query facts. Filter by subject, predicate, object, types, or validity window.',
      parameters: {
        type: 'object',
        properties: {
          subject:     { type: 'string' },
          subjectType: { type: 'string' },
          predicate:   { type: 'string' },
          object:      { type: 'string' },
          objectType:  { type: 'string' },
          activeAt:    { type: 'string', description: 'ISO — facts valid at this time (default: now)' },
          limit:       { type: 'integer', default: 50 },
        }
      },
      handler: async (args, ctx) => {
        const d = getDriver(ctx.config.uri, ctx.config.user, ctx.config.password)
        const session = d.session()
        try {
          const at = args.activeAt || nowIso()
          const cypher = `
            MATCH (s:Entity)-[r:FACT]->(o:Entity)
            WHERE ($subject IS NULL OR s.name CONTAINS $subject)
              AND ($subjectType IS NULL OR s.type = $subjectType)
              AND ($object IS NULL OR o.name CONTAINS $object)
              AND ($objectType IS NULL OR o.type = $objectType)
              AND ($predicate IS NULL OR r.predicate = $predicate)
              AND r.validFrom <= $at AND (r.validTo IS NULL OR r.validTo >= $at)
            RETURN s.name AS subject, s.type AS subjectType,
                   r.predicate AS predicate, r.source AS source, r.confidence AS confidence,
                   r.validFrom AS validFrom, r.validTo AS validTo,
                   o.name AS object, o.type AS objectType
            ORDER BY r.validFrom DESC
            LIMIT $limit
          `
          const res = await session.run(cypher, {
            subject: args.subject || null, subjectType: args.subjectType || null,
            object: args.object || null, objectType: args.objectType || null,
            predicate: args.predicate || null, at,
            limit: neo4j.int(args.limit || 50),
          })
          return { facts: res.records.map(r => r.toObject()) }
        } finally { await session.close() }
      }
    },

    entity_timeline: {
      description: 'All facts involving this entity (as subject OR object), sorted by time.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Entity name' },
          type: { type: 'string', description: 'Entity type (optional filter)' },
          limit: { type: 'integer', default: 50 },
        },
        required: ['name']
      },
      handler: async (args, ctx) => {
        const d = getDriver(ctx.config.uri, ctx.config.user, ctx.config.password)
        const session = d.session()
        try {
          const res = await session.run(`
            MATCH (e:Entity)
            WHERE e.name CONTAINS $name AND ($type IS NULL OR e.type = $type)
            OPTIONAL MATCH (e)-[r1:FACT]->(other1:Entity)
            OPTIONAL MATCH (other2:Entity)-[r2:FACT]->(e)
            WITH e, collect(DISTINCT {dir:'out', pred:r1.predicate, validFrom:r1.validFrom, other:other1.name, otherType:other1.type, source:r1.source}) AS outs,
                 collect(DISTINCT {dir:'in',  pred:r2.predicate, validFrom:r2.validFrom, other:other2.name, otherType:other2.type, source:r2.source}) AS ins
            RETURN e.name AS entity, e.type AS type, outs + ins AS facts
            LIMIT 1
          `, { name: args.name, type: args.type || null })
          if (res.records.length === 0) return { entity: null, facts: [] }
          const rec = res.records[0].toObject()
          const sorted = (rec.facts || []).filter(f => f.pred).sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))
          return { entity: rec.entity, type: rec.type, facts: sorted.slice(0, args.limit || 50) }
        } finally { await session.close() }
      }
    },

    entity_list: {
      description: 'List all entities of a given type. Useful for agents to scan "what competitors do we know about?"',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'competitor | persona | keyword | channel | customer | pillar' },
          limit: { type: 'integer', default: 50 },
        },
        required: ['type']
      },
      handler: async (args, ctx) => {
        const d = getDriver(ctx.config.uri, ctx.config.user, ctx.config.password)
        const session = d.session()
        try {
          const res = await session.run(`
            MATCH (e:Entity {type: $type})
            RETURN e.name AS name, e.id AS id, e.createdAt AS createdAt
            ORDER BY e.name
            LIMIT $limit
          `, { type: args.type, limit: neo4j.int(args.limit || 50) })
          return { type: args.type, entities: res.records.map(r => r.toObject()) }
        } finally { await session.close() }
      }
    },
  },

  async onUnload() {
    if (driver) { await driver.close(); driver = null }
  },

  // Phase F — ingest pending facts from mgmt-pushed staging file
  // ═══════════════════════════════════════════════════════════════════════
  // PENDING_FACTS.jsonl is appended by mgmt-side factsPusher.ts (Phase F).
  // This tool processes it + marks done via sidecar file PENDING_FACTS.processed.log.
  // Idempotent: only processes facts whose _key isn't in the processed log.
  tools_phaseF: {  // placeholder — actual tool registration done via tools block above
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// Register ingest_pending_facts tool via monkey-patch (run after module.exports).
// Rationale: keeping edit diff minimal — we append the tool to tools{} below.
// ═══════════════════════════════════════════════════════════════════════════
module.exports.tools.ingest_pending_facts = {
  description: 'Phase F — read PENDING_FACTS.jsonl (appended by mgmt server when hypotheses conclude + references gain high signal) and write them to Neo4j. Idempotent: tracks processed keys in PENDING_FACTS.processed.log. Call on demand or from a cron.',
  parameters: {
    type: 'object',
    properties: {
      maxBatch: { type: 'integer', description: 'Max entries to process this call (default 200)' },
    },
  },
  handler: async (args, ctx) => {
    if (!fs.existsSync(PENDING_FACTS_PATH)) {
      return { ok: true, processed: 0, reason: 'no pending facts file' }
    }
    const processedKeys = new Set()
    if (fs.existsSync(PENDING_FACTS_PROCESSED)) {
      try {
        const existing = fs.readFileSync(PENDING_FACTS_PROCESSED, 'utf8').split('\n').filter(Boolean)
        for (const k of existing) processedKeys.add(k.trim())
      } catch {}
    }

    const raw = fs.readFileSync(PENDING_FACTS_PATH, 'utf8')
    const lines = raw.split('\n').filter(l => l.trim())
    const maxBatch = Math.min(args?.maxBatch || 200, 500)

    const d = getDriver(ctx.config.uri, ctx.config.user, ctx.config.password)
    const session = d.session()
    let processed = 0
    let skipped = 0
    let errors = 0
    const newProcessed = []

    try {
      for (const line of lines) {
        if (processed >= maxBatch) break
        let fact
        try { fact = JSON.parse(line) } catch { errors++; continue }
        const key = fact._key || `${fact.subject}|${fact.predicate}|${fact.object}`
        if (processedKeys.has(key)) { skipped++; continue }

        try {
          await session.run(`
            MERGE (s:Entity { id: $subjectId })
            ON CREATE SET s.name = $subjectName, s.type = $subjectType, s.createdAt = $now
            MERGE (o:Entity { id: $objectId })
            ON CREATE SET o.name = $objectName, o.type = $objectType, o.createdAt = $now
            MERGE (s)-[r:FACT { predicate: $predicate }]->(o)
            ON CREATE SET r.source = $source, r.validFrom = $validFrom, r.metadata = $metadata, r.createdAt = $now
            ON MATCH  SET r.metadata = $metadata, r.updatedAt = $now
          `, {
            subjectId: slug(fact.subject),
            subjectName: fact.subject,
            subjectType: fact.subjectType || 'unknown',
            objectId: slug(fact.object),
            objectName: fact.object,
            objectType: fact.objectType || 'unknown',
            predicate: fact.predicate,
            source: fact.source || 'mgmt_push',
            validFrom: fact.validFrom || nowIso(),
            metadata: JSON.stringify(fact.metadata || {}),
            now: nowIso(),
          })
          processed++
          newProcessed.push(key)
        } catch (err) {
          errors++
        }
      }
    } finally {
      await session.close()
    }

    // Append processed keys to sidecar
    if (newProcessed.length > 0) {
      fs.appendFileSync(PENDING_FACTS_PROCESSED, newProcessed.join('\n') + '\n')
    }

    return { ok: true, processed, skipped, errors, totalLinesInFile: lines.length }
  }
}
