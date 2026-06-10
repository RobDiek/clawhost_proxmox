/**
 * Instance Version & Upgrade Service
 *
 * Sprint A — Version diff
 *   • getLatestManifest(): pulls /version.json from public CDN
 *   • getInstalledManifest(instanceId): SSH cat /var/openclaw/version.json
 *   • diffVersions(): structural comparison → drift list
 *
 * Sprint B — Rollback-safe upgrade
 *   • snapshotInstance(): Hetzner image (24h retention)
 *   • runMigrations(): sequential .sh scripts with verify-after-each
 *   • rollback(): restore from snapshot
 *   • upgradeInstance(): full orchestration with progress events
 *
 * No AI in this iteration — pure rule-based, fail-fast, snapshot-protected.
 * AI self-healing earmarked for Sprint C.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import executeSSH from './ssh'

const LATEST_MANIFEST_URL = 'https://clawflow.flowmatic.co.il/version.json'
const HETZNER_API = 'https://api.hetzner.cloud/v1'

// ─── Types ────────────────────────────────────────────────────────────────

export interface VersionManifest {
    stackVersion: string
    schemaVersion: number
    releasedAt?: string
    releaseNotes?: string[]
    components: Record<string, string>
    migrations?: string[]
    installedAt?: string
    appliedMigrations?: string[]
    /**
     * S3 update-channel release type:
     *   'optional' (default) — client sees a dismissible opt-in card and applies
     *      when they choose (I7 sovereignty).
     *   'silent'             — critical systemic fix; NO client card. The operator
     *      force-pushes it to all outdated VPSes (admin "push upgrade to all").
     */
    updateType?: 'silent' | 'optional'
}

export interface VersionDiff {
    upToDate: boolean
    installed: VersionManifest | null
    latest: VersionManifest | null
    /** Components that differ between installed and latest */
    componentDrift: Array<{ component: string; from: string; to: string }>
    /** Migrations on the server that haven't been applied yet on this VPS */
    pendingMigrations: string[]
    /** Latest version reachable? */
    reachable: boolean
    notes: string[]
    /** Master-canary instances are by definition at-latest (the master IS the source). UI should suppress upgrade prompts. */
    isMaster?: boolean
    /** S3 — 'silent' (operator force-push, no client card) | 'optional' (opt-in card). */
    updateType: 'silent' | 'optional'
}

export interface UpgradeProgress {
    instanceId: string
    step: string
    pct: number
    detail?: string
    status: 'running' | 'success' | 'failed' | 'rolled_back'
    snapshotId?: number | null
    error?: string
    startedAt: string
    finishedAt?: string
}

// ─── Manifest fetching ───────────────────────────────────────────────────

export async function getLatestManifest(): Promise<VersionManifest> {
    const res = await fetch(LATEST_MANIFEST_URL, { cache: 'no-store' } as any)
    if (!res.ok) throw new Error(`Latest manifest fetch failed: ${res.status}`)
    return await res.json() as VersionManifest
}

export async function getInstalledManifest(instanceId: string): Promise<VersionManifest | null> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    if (!inst.ip || !(inst as any).rootPassword) {
        return null  // not yet provisioned or missing creds
    }
    try {
        const out = await executeSSH(
            inst.ip as any as string,
            (inst as any).rootPassword,
            'cat /var/openclaw/version.json 2>/dev/null || echo "{}"',
            10_000,
        )
        const trimmed = out.trim()
        if (!trimmed || trimmed === '{}') return null
        return JSON.parse(trimmed) as VersionManifest
    } catch (err) {
        console.warn(`[instanceVersion] SSH read failed for ${instanceId}:`, (err as Error).message)
        return null
    }
}

// ─── Diff logic ──────────────────────────────────────────────────────────

export function diffVersions(
    installed: VersionManifest | null,
    latest: VersionManifest,
): Pick<VersionDiff, 'upToDate' | 'componentDrift' | 'pendingMigrations'> {
    if (!installed) {
        return {
            upToDate: false,
            componentDrift: Object.entries(latest.components).map(([component, to]) => ({
                component, from: '(unknown)', to,
            })),
            pendingMigrations: latest.migrations || [],
        }
    }

    const componentDrift: VersionDiff['componentDrift'] = []
    for (const [component, latestVer] of Object.entries(latest.components)) {
        const installedVer = installed.components?.[component]
        if (installedVer && installedVer !== latestVer) {
            componentDrift.push({ component, from: installedVer, to: latestVer })
        } else if (!installedVer) {
            componentDrift.push({ component, from: '(missing)', to: latestVer })
        }
    }

    const applied = new Set(installed.appliedMigrations || [])
    const pendingMigrations = (latest.migrations || []).filter(m => !applied.has(m))

    const upToDate = componentDrift.length === 0
        && pendingMigrations.length === 0
        && installed.stackVersion === latest.stackVersion

    return { upToDate, componentDrift, pendingMigrations }
}

export async function getVersionStatus(instanceId: string): Promise<VersionDiff> {
    const notes: string[] = []
    let latest: VersionManifest | null = null
    let reachable = false
    try {
        latest = await getLatestManifest()
        reachable = true
    } catch (err) {
        notes.push(`Latest manifest unreachable: ${(err as Error).message}`)
    }

    // Master canary check — master is BY DEFINITION at the latest version
    // (it's the source of truth from which other instances follow). Suppress
    // upgrade detection entirely. We still surface the latest manifest so the
    // dashboard can display "you are the master" copy with version label.
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const isMaster = !!(inst as any)?.isMaster

    const installed = await getInstalledManifest(instanceId).catch(err => {
        notes.push(`Installed manifest read failed: ${(err as Error).message}`)
        return null
    })

    if (!latest) {
        return {
            upToDate: false,
            installed,
            latest: null,
            componentDrift: [],
            pendingMigrations: [],
            reachable: false,
            notes,
            isMaster,
            updateType: 'optional',
        }
    }

    if (isMaster) {
        // Master is canonical — present as up-to-date regardless of what
        // /var/openclaw/version.json contains (it may not even exist on
        // older masters that pre-date the version manifest era).
        return {
            upToDate: true,
            installed: installed || latest,  // pretend installed=latest if missing
            latest,
            componentDrift: [],
            pendingMigrations: [],
            reachable,
            notes: ['Master canary instance — always at latest by definition.'],
            isMaster: true,
            updateType: latest.updateType || 'optional',
        }
    }

    const diff = diffVersions(installed, latest)
    return { ...diff, installed, latest, reachable, notes, isMaster, updateType: latest.updateType || 'optional' }
}

// ─── Sprint B — Upgrade orchestration ────────────────────────────────────

const upgradeProgress = new Map<string, UpgradeProgress>()

function setProgress(instanceId: string, patch: Partial<UpgradeProgress>) {
    const cur = upgradeProgress.get(instanceId) || {
        instanceId, step: 'init', pct: 0, status: 'running' as const,
        startedAt: new Date().toISOString(),
    }
    upgradeProgress.set(instanceId, { ...cur, ...patch })
}

export function getUpgradeProgress(instanceId: string): UpgradeProgress | null {
    return upgradeProgress.get(instanceId) || null
}

async function hetznerRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: any) {
    const res = await fetch(`${HETZNER_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Hetzner ${method} ${path} ${res.status}: ${t.slice(0, 200)}`)
    }
    return await res.json()
}

export async function snapshotInstance(instanceId: string): Promise<number> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst?.hetznerServerId) throw new Error('No Hetzner server id for instance')
    setProgress(instanceId, { step: 'snapshot', pct: 5, detail: 'Creating Hetzner image (≈30-60s)' })

    const j = await hetznerRequest('POST', `/servers/${inst.hetznerServerId}/actions/create_image`, {
        type: 'snapshot',
        description: `pre-upgrade ${instanceId} ${new Date().toISOString()}`,
        labels: { instance: instanceId, kind: 'pre-upgrade' },
    }) as any
    const imageId = j.image?.id
    if (!imageId) throw new Error('Snapshot returned no image id')

    // Poll image until available (max 5 min)
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5_000))
        const img = await hetznerRequest('GET', `/images/${imageId}`) as any
        if (img.image?.status === 'available') {
            setProgress(instanceId, { step: 'snapshot_ready', pct: 15, snapshotId: imageId })
            return imageId
        }
    }
    throw new Error('Snapshot did not become available in 5 min')
}

export async function rollbackToSnapshot(instanceId: string, snapshotId: number): Promise<void> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst?.hetznerServerId) throw new Error('No Hetzner server id')
    setProgress(instanceId, { step: 'rollback', pct: 50, detail: 'Restoring from snapshot' })

    await hetznerRequest('POST', `/servers/${inst.hetznerServerId}/actions/rebuild`, {
        image: snapshotId,
    })
    setProgress(instanceId, { step: 'rolled_back', pct: 100, status: 'rolled_back' })
}

async function listAvailableMigrations(): Promise<string[]> {
    try {
        const manifest = await getLatestManifest()
        return manifest.migrations || []
    } catch {
        return []
    }
}

async function runMigrationOnVps(
    instanceId: string,
    ip: string,
    rootPassword: string,
    migrationId: string,
): Promise<{ ok: boolean; output: string }> {
    // Migrations live at https://clawflow.flowmatic.co.il/migrations/<id>.sh
    // Each script is idempotent and runs verify at the end (exit 0 = ok).
    //
    // version.json bootstrap: many older VPSes were provisioned before the
    // manifest era and don't have /var/openclaw/version.json. Migrations
    // tried to update the file and crashed with FileNotFoundError, then the
    // upgrade rolled back the snapshot — looking like a system-wide failure.
    // We now ensure the file exists before running migrations: fetch the
    // platform's current latest manifest as a baseline, OR start from an
    // empty {} skeleton if the platform is unreachable.
    const url = `https://clawflow.flowmatic.co.il/migrations/${encodeURIComponent(migrationId)}.sh`
    const cmd = `set -e
mkdir -p /var/openclaw /var/openclaw/migrations /var/openclaw/migration-marks
# ── Bootstrap version.json if missing (idempotent) ──
if [ ! -f /var/openclaw/version.json ]; then
    if curl -fsSL --max-time 15 https://clawflow.flowmatic.co.il/version.json -o /tmp/cf-latest.json; then
        cp /tmp/cf-latest.json /var/openclaw/version.json
    else
        echo '{"stackVersion":"0.0.0","schemaVersion":0,"components":{},"appliedMigrations":[]}' > /var/openclaw/version.json
    fi
fi
# ── Run the migration script ──
curl -fsSL --max-time 60 ${url} -o /var/openclaw/migrations/${migrationId}.sh
chmod +x /var/openclaw/migrations/${migrationId}.sh
bash /var/openclaw/migrations/${migrationId}.sh 2>&1
# ── Mark as applied (resilient — recreate file if migration removed it somehow) ──
python3 - <<PYAPPLY
import json, os
path = '/var/openclaw/version.json'
if os.path.exists(path):
    with open(path) as f: d = json.load(f)
else:
    d = {"stackVersion":"0.0.0","schemaVersion":0,"components":{},"appliedMigrations":[]}
d.setdefault('appliedMigrations', [])
if '${migrationId}' not in d['appliedMigrations']:
    d['appliedMigrations'].append('${migrationId}')
with open(path, 'w') as f: json.dump(d, f, indent=2)
PYAPPLY
echo "MIGRATION_OK"`

    try {
        const output = await executeSSH(ip, rootPassword, cmd, 600_000)  // 10 min per migration
        const ok = /MIGRATION_OK\s*$/.test(output)
        return { ok, output: output.slice(-2000) }
    } catch (err) {
        return { ok: false, output: (err as Error).message }
    }
}

async function bumpStackVersionOnVps(
    ip: string,
    rootPassword: string,
    latestStackVersion: string,
): Promise<void> {
    // After all migrations succeed, replace stackVersion + components with the latest manifest.
    // Resilient: creates version.json from latest if missing (same bootstrap logic
    // as runMigrationOnVps — should never reach here without it, but defensive).
    const cmd = `mkdir -p /var/openclaw && python3 - <<PYBUMP
import json, urllib.request, os, datetime
latest = json.load(urllib.request.urlopen('${LATEST_MANIFEST_URL}', timeout=15))
path = '/var/openclaw/version.json'
if os.path.exists(path):
    with open(path) as f: cur = json.load(f)
else:
    cur = {"appliedMigrations": []}
cur['stackVersion'] = latest['stackVersion']
cur['schemaVersion'] = latest['schemaVersion']
cur['components'] = latest['components']
cur['lastUpgradedAt'] = datetime.datetime.utcnow().isoformat() + 'Z'
cur.setdefault('installedAt', cur['lastUpgradedAt'])
with open(path, 'w') as f: json.dump(cur, f, indent=2)
PYBUMP`
    await executeSSH(ip, rootPassword, cmd, 30_000)
}

export async function upgradeInstance(instanceId: string): Promise<UpgradeProgress> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')
    if (!inst.ip || !(inst as any).rootPassword) {
        throw new Error('Instance has no IP or root password — cannot upgrade')
    }
    const ip = inst.ip as any as string
    const rootPassword = (inst as any).rootPassword as string

    // Reset progress slot for this run
    upgradeProgress.set(instanceId, {
        instanceId, step: 'init', pct: 0, status: 'running',
        startedAt: new Date().toISOString(),
    })

    let snapshotId: number | null = null
    try {
        // 1. Diff
        setProgress(instanceId, { step: 'diff', pct: 2, detail: 'Computing version drift' })
        const diff = await getVersionStatus(instanceId)
        if (diff.upToDate) {
            setProgress(instanceId, { step: 'up_to_date', pct: 100, status: 'success', finishedAt: new Date().toISOString() })
            return upgradeProgress.get(instanceId)!
        }
        if (!diff.latest) throw new Error('Cannot reach latest manifest — abort upgrade')

        // 2. Snapshot
        snapshotId = await snapshotInstance(instanceId)
        setProgress(instanceId, { step: 'snapshot_done', pct: 18, snapshotId })

        // 3. Apply pending migrations sequentially. Halt + rollback on first failure.
        const migrations = diff.pendingMigrations
        for (let i = 0; i < migrations.length; i++) {
            const m = migrations[i]
            const pct = 20 + Math.round((i / Math.max(migrations.length, 1)) * 60)
            setProgress(instanceId, { step: `migration:${m}`, pct, detail: `Applying ${i + 1}/${migrations.length}` })
            const r = await runMigrationOnVps(instanceId, ip, rootPassword, m)
            if (!r.ok) {
                console.error(`[upgrade] ${instanceId} migration ${m} FAILED, rolling back. Output: ${r.output}`)
                await rollbackToSnapshot(instanceId, snapshotId).catch(e =>
                    console.error('rollback also failed:', (e as Error).message))
                setProgress(instanceId, {
                    step: 'failed', pct: 100, status: 'rolled_back',
                    error: `Migration ${m} failed: ${r.output.slice(-500)}`,
                    finishedAt: new Date().toISOString(),
                })
                return upgradeProgress.get(instanceId)!
            }
        }

        // 4. Bump stack version + component refs (no migration required, e.g. minor docker image bumps)
        setProgress(instanceId, { step: 'bump_version', pct: 85, detail: 'Pulling latest images' })
        await bumpStackVersionOnVps(ip, rootPassword, diff.latest.stackVersion)

        // 5. Optional: docker compose pull && up -d for ALL services to get new image tags
        setProgress(instanceId, { step: 'compose_pull', pct: 92, detail: 'docker compose pull && up -d' })
        await executeSSH(
            ip, rootPassword,
            'cd /opt/openclaw && docker compose pull && docker compose up -d --remove-orphans 2>&1 | tail -20',
            300_000,
        ).catch(err => {
            console.warn(`[upgrade] compose pull warning: ${(err as Error).message}`)
        })

        setProgress(instanceId, {
            step: 'success', pct: 100, status: 'success',
            finishedAt: new Date().toISOString(),
        })
        return upgradeProgress.get(instanceId)!
    } catch (err) {
        // Best-effort rollback if snapshot was taken
        if (snapshotId) {
            await rollbackToSnapshot(instanceId, snapshotId).catch(() => {})
        }
        setProgress(instanceId, {
            step: 'failed', pct: 100,
            status: snapshotId ? 'rolled_back' : 'failed',
            error: (err as Error).message,
            finishedAt: new Date().toISOString(),
        })
        return upgradeProgress.get(instanceId)!
    }
}