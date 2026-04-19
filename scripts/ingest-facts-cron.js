#!/usr/bin/env node
/**
 * ingest-facts-cron.js — tenant-side cron script (Phase F)
 *
 * Installed at: /opt/openclaw/ingest-facts-cron.js
 * Scheduled by: /etc/systemd/system/openclaw-facts-ingest.{service,timer}
 *   OR           /etc/cron.d/openclaw-facts-ingest  (fallback)
 *
 * Purpose:
 *   Drains /home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl into Neo4j
 *   via the openclaw-facts plugin's `ingest_pending_facts` handler. Runs every
 *   30 minutes. Idempotent via PENDING_FACTS.processed.log sidecar.
 *
 * Why standalone vs agent session:
 *   - No Anthropic token cost
 *   - Runs even if openclaw-gateway is down
 *   - Direct neo4j-driver bolt connection, same auth as plugin
 *
 * Exits:
 *   0 on success (or no work), 1 on error.
 */

const fs = require('fs')
const path = require('path')

const PLUGIN_PATH = '/home/openclaw/.openclaw/extensions/openclaw-facts/dist/index.js'
const OPENCLAW_JSON = '/home/openclaw/.openclaw/openclaw.json'
const PENDING_FACTS = '/home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl'

async function main() {
    // 1. Verify prerequisites
    if (!fs.existsSync(PLUGIN_PATH)) {
        console.log('[ingest-facts] plugin not installed, skipping')
        return 0
    }
    if (!fs.existsSync(PENDING_FACTS)) {
        console.log('[ingest-facts] no pending facts, skipping')
        return 0
    }
    const stat = fs.statSync(PENDING_FACTS)
    if (stat.size === 0) {
        console.log('[ingest-facts] pending facts file empty')
        return 0
    }

    // 2. Load plugin + its config from openclaw.json
    let plugin
    try {
        plugin = require(PLUGIN_PATH)
    } catch (err) {
        console.error('[ingest-facts] plugin require failed:', err.message)
        return 1
    }

    let config
    try {
        const cfg = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf8'))
        config = cfg?.plugins?.entries?.['openclaw-facts']?.config
        if (!config) {
            console.error('[ingest-facts] plugin config not found in openclaw.json')
            return 1
        }
    } catch (err) {
        console.error('[ingest-facts] config load failed:', err.message)
        return 1
    }

    // 3. Call the ingest_pending_facts tool handler directly
    if (!plugin.tools?.ingest_pending_facts?.handler) {
        console.error('[ingest-facts] ingest_pending_facts tool not exported by plugin — plugin version too old?')
        return 1
    }

    try {
        const result = await plugin.tools.ingest_pending_facts.handler(
            { maxBatch: 500 },
            { config },
        )
        console.log('[ingest-facts]', JSON.stringify(result))
        // Unload plugin if supported (frees Neo4j driver)
        if (typeof plugin.onUnload === 'function') {
            try { await plugin.onUnload() } catch { /* ignore */ }
        }
        return 0
    } catch (err) {
        console.error('[ingest-facts] handler failed:', err.message)
        return 1
    }
}

main().then(code => process.exit(code)).catch(err => {
    console.error('[ingest-facts] uncaught:', err)
    process.exit(1)
})
