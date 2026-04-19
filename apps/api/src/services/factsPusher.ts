/**
 * Facts Pusher (Phase F) — closed learning loop
 *
 * After concluded hypotheses + winning creatives are recorded in mgmt DB,
 * push them as facts to the tenant VPS Neo4j (via openclaw-facts plugin).
 * This closes the learning loop: next time Yotzer drafts a concept,
 * fact_query returns winning patterns for this instance.
 *
 * Strategy:
 *   - Write to staging file /home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl
 *     (one JSON per line — append mode)
 *   - Tenant-side cron (or next agent session) processes and calls fact_add
 *   - Mgmt-side daily cron queries concluded hypotheses + winning renders
 *     that haven't been pushed yet, appends JSONL, marks as pushed
 *
 * Why staging file + tenant cron vs direct Neo4j bolt from mgmt?
 *   - Neo4j is localhost-bound on tenant (security)
 *   - Staging preserves order + allows replay
 *   - Tenant plugin ecosystem is authoritative
 *
 * Schema of PENDING_FACTS.jsonl entries:
 *   {subject, predicate, object, subjectType?, objectType?, metadata?, validFrom?, source: 'mgmt_push'}
 */

import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'
import { and, eq, isNull, inArray } from 'drizzle-orm'

import { db } from '@/db'
import {
    instances,
    creativeHypotheses,
    creativeRenders,
    creativeReferences,
    creativePerformance,
} from '@/db/schema'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}
function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

interface FactEntry {
    subject: string
    subjectType?: string
    predicate: string
    object: string
    objectType?: string
    metadata?: Record<string, unknown>
    validFrom?: string
    source: string
    _key: string   // dedup key (subject+predicate+object) — plugin consumer uses this
}

// ═══════════════════════════════════════════════════════════════════════════
// Main: push facts for all instances
// ═══════════════════════════════════════════════════════════════════════════

export async function pushAllPendingFacts(): Promise<{
    instances: number
    pushedFacts: number
    errors: number
}> {
    const stats = { instances: 0, pushedFacts: 0, errors: 0 }

    try {
        // Find instances with concluded hypotheses or facts-worthy signals
        const instanceIds = await db.selectDistinct({ id: creativeHypotheses.instanceId })
            .from(creativeHypotheses)
            .where(and(
                eq(creativeHypotheses.status, 'concluded'),
                isNull(creativeHypotheses.savedAsFact),   // not pushed yet — we clear savedAsFact after push
            ))

        for (const { id: instanceId } of instanceIds) {
            stats.instances++
            try {
                const count = await pushInstanceFacts(instanceId)
                stats.pushedFacts += count
            } catch (err) {
                stats.errors++
                console.error(`[factsPusher] ${instanceId} failed:`, err)
            }
        }
        console.log(`[factsPusher] ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[factsPusher] top-level error:', err)
        stats.errors++
    }
    return stats
}

// ═══════════════════════════════════════════════════════════════════════════
// Single instance: build facts + append to staging file
// ═══════════════════════════════════════════════════════════════════════════

export async function pushInstanceFacts(instanceId: string): Promise<number> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst?.ip) return 0

    // Ensure tenant-side ingest cron is installed. Idempotent: checks for
    // existing systemd timer before installing. This covers instances provisioned
    // before Phase F cloud-init changes.
    await ensureIngestCronInstalled(inst.ip, inst.rootPassword || undefined)
        .catch(err => console.warn(`[factsPusher] ingest cron install skipped: ${err instanceof Error ? err.message : err}`))

    const facts: FactEntry[] = []

    // ── Concluded hypotheses ──
    const concluded = await db.select().from(creativeHypotheses)
        .where(and(
            eq(creativeHypotheses.instanceId, instanceId),
            eq(creativeHypotheses.status, 'concluded'),
        ))
    for (const h of concluded) {
        if (!h.winnerRenderId) continue

        // Pull DNA of the winner render (if available via linked creative_references)
        // For MVP: winner render's own attributes (tier/formatType/scenesId)
        const [winnerRender] = await db.select().from(creativeRenders)
            .where(eq(creativeRenders.id, h.winnerRenderId))
            .limit(1)

        // Fact: hypothesis → winner
        facts.push({
            subject: `hypothesis:${h.id}`,
            subjectType: 'hypothesis',
            predicate: 'HAS_WINNER',
            object: `creative:${h.winnerRenderId}`,
            objectType: 'creative',
            metadata: {
                statement: h.statement,
                metric: h.primaryMetric,
                posterior: parseFloat(h.posteriorProbability as string),
                liftPct: h.metricLiftPct ? parseFloat(h.metricLiftPct as string) : null,
                concludedAt: h.concludedAt?.toISOString(),
                insight: h.insightHe,
            },
            validFrom: h.concludedAt?.toISOString(),
            source: 'hypothesis_analyzer',
            _key: `hyp_winner:${h.id}`,
        })

        // Fact: winner creative attributes (tier/formatType → winning pattern)
        if (winnerRender) {
            facts.push({
                subject: `creative:${h.winnerRenderId}`,
                subjectType: 'creative',
                predicate: 'WON_ON',
                object: `metric:${h.primaryMetric}`,
                objectType: 'metric',
                metadata: {
                    tier: winnerRender.tier,
                    formatType: winnerRender.formatType,
                    selectedModel: winnerRender.selectedModel,
                    brandBookVersion: winnerRender.brandBookVersion,
                    variantLabel: winnerRender.variantLabel,
                    posterior: parseFloat(h.posteriorProbability as string),
                    hypothesisId: h.id,
                },
                validFrom: h.concludedAt?.toISOString(),
                source: 'hypothesis_winner',
                _key: `won_on:${h.winnerRenderId}:${h.primaryMetric}`,
            })
        }
    }

    // ── Top-performing references (DNA patterns that empirically signal well) ──
    // Pattern: reference with high signalScore → fact linking its DNA to "winning"
    const topRefs = await db.select().from(creativeReferences)
        .where(and(
            eq(creativeReferences.instanceId, instanceId),
            eq(creativeReferences.isActive, true),
        ))
    const topRefsSorted = [...topRefs]
        .filter(r => r.dna && parseFloat(r.signalScore as string) > 0)
        .sort((a, b) => parseFloat(b.signalScore as string) - parseFloat(a.signalScore as string))
        .slice(0, 10)

    for (const r of topRefsSorted) {
        const dna = r.dna as any
        if (!dna?.hookType) continue
        // Fact: high-signal reference → hook pattern
        facts.push({
            subject: `reference:${r.id}`,
            subjectType: 'reference',
            predicate: 'USES_HOOK_TYPE',
            object: `hook:${dna.hookType}`,
            objectType: 'hook_type',
            metadata: {
                competitor: r.competitorName,
                daysActive: r.daysActive,
                variationCount: r.variationCount,
                signalScore: parseFloat(r.signalScore as string),
                hookFormat: dna.hookFormat,
                hookEmotion: dna.hookEmotion,
                claimStyle: dna.claimStyle,
                summary: dna.summaryHe || dna.summary,
            },
            source: 'reference_mining',
            _key: `ref_hook:${r.id}`,
        })
    }

    if (facts.length === 0) return 0

    // ── Append to staging file on tenant VPS ──
    const jsonl = facts.map(f => JSON.stringify(f)).join('\n') + '\n'
    const b64 = Buffer.from(jsonl, 'utf-8').toString('base64')

    try {
        await sshExec(
            inst.ip,
            `mkdir -p /home/openclaw/.openclaw/workspace && ` +
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl && ` +
            `chown openclaw:openclaw /home/openclaw/.openclaw/workspace/PENDING_FACTS.jsonl`,
            inst.rootPassword || undefined,
            30000,
        )
    } catch (err) {
        console.error(`[factsPusher] SSH append failed for ${instanceId}:`, err)
        throw err
    }

    // Mark hypotheses as pushed — stash their _key so we don't push same fact twice
    for (const h of concluded) {
        const pushedKeys = facts.filter(f => f._key.includes(h.id)).map(f => f._key)
        if (pushedKeys.length === 0) continue
        await db.update(creativeHypotheses)
            .set({
                savedAsFact: { pushedAt: new Date().toISOString(), factKeys: pushedKeys } as any,
                updatedAt: new Date(),
            })
            .where(eq(creativeHypotheses.id, h.id))
    }

    console.log(`[factsPusher] ${instanceId}: appended ${facts.length} facts to PENDING_FACTS.jsonl`)
    return facts.length
}

// ═══════════════════════════════════════════════════════════════════════════
// Ensure tenant-side ingest cron is installed (idempotent)
// Uses systemd timer if available; falls back to crontab on older systems.
// ═══════════════════════════════════════════════════════════════════════════

async function ensureIngestCronInstalled(ip: string, password: string | undefined): Promise<void> {
    // Check if already installed — if systemd timer is active, skip
    const check = await sshExec(
        ip,
        `systemctl is-active openclaw-facts-ingest.timer 2>/dev/null || echo NEEDS_INSTALL`,
        password, 10000,
    )
    if (check.trim() === 'active') return

    const ingestUrl = 'https://raw.githubusercontent.com/synex-os/openclaw-hosting/Production/scripts/ingest-facts-cron.js'
    // Install in one SSH command — includes fetch + systemd units + enable
    const installCmd = `
mkdir -p /opt/openclaw
curl -fsSL "${ingestUrl}" -o /opt/openclaw/ingest-facts-cron.js
chmod +x /opt/openclaw/ingest-facts-cron.js
cat > /etc/systemd/system/openclaw-facts-ingest.service <<'SVCEOF'
[Unit]
Description=OpenClaw facts ingest — drains PENDING_FACTS.jsonl into Neo4j
After=network.target

[Service]
Type=oneshot
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw/.openclaw
ExecStart=/usr/bin/node /opt/openclaw/ingest-facts-cron.js
StandardOutput=append:/var/log/openclaw-facts-ingest.log
StandardError=append:/var/log/openclaw-facts-ingest.log
SVCEOF
cat > /etc/systemd/system/openclaw-facts-ingest.timer <<'TIMEREOF'
[Unit]
Description=Run openclaw-facts-ingest every 30 minutes
Requires=openclaw-facts-ingest.service

[Timer]
OnBootSec=10min
OnUnitActiveSec=30min
Unit=openclaw-facts-ingest.service

[Install]
WantedBy=timers.target
TIMEREOF
touch /var/log/openclaw-facts-ingest.log
chown openclaw:openclaw /var/log/openclaw-facts-ingest.log
systemctl daemon-reload
systemctl enable openclaw-facts-ingest.timer
systemctl start openclaw-facts-ingest.timer
echo INGEST_CRON_INSTALLED
`
    const result = await sshExec(ip, installCmd, password, 60000)
    if (!result.includes('INGEST_CRON_INSTALLED')) {
        throw new Error(`Ingest cron install failed: ${result.substring(0, 300)}`)
    }
    console.log(`[factsPusher] ingest cron installed on ${ip}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// Cron starter — runs every 6 hours (facts accumulate slowly)
// ═══════════════════════════════════════════════════════════════════════════

let started = false
export function startFactsPusher(): void {
    if (started) return
    started = true
    const INTERVAL_MS = 6 * 60 * 60 * 1000
    console.log(`[factsPusher] starting (every 6h)`)
    setTimeout(() => { pushAllPendingFacts().catch(() => { /* logged inside */ }) }, 30 * 60 * 1000)   // first run 30min after boot
    setInterval(() => { pushAllPendingFacts().catch(() => { /* logged inside */ }) }, INTERVAL_MS)
}