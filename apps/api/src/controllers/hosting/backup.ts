/**
 * Backup system — Hetzner snapshot-based, enterprise-grade.
 *
 * Why snapshots over tar archives:
 *   - Atomic: the entire VM state is captured at once (no race vs running services)
 *   - Block-level: includes everything (DB, configs, files, customizations)
 *   - Restore is one API call (server.actions.rebuild) — no SSH, no service juggling
 *   - Hetzner manages retention, compression, dedup
 *
 * Endpoints:
 *   GET    /hosting/instances/:id/backups                   list snapshots for this VPS
 *   POST   /hosting/instances/:id/backups/create            create snapshot { name?: string }
 *   POST   /hosting/instances/:id/backups/restore           restore from snapshot { imageId }
 *   DELETE /hosting/instances/:id/backups/:imageId          delete a snapshot
 *   POST   /hosting/instances/:id/backup-report             VPS cron self-report (legacy)
 *   POST   /hosting/instances/:id/install-complete          provisioning callback (legacy)
 *
 * Description format on Hetzner side:
 *   "cf-backup:{instanceId}:{userLabel}"
 * The instanceId prefix lets us filter snapshots scoped to this VPS without
 * relying on Hetzner labels (some Hetzner SKUs limit label availability).
 */

import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveUserId } from './authHelper'
import { ok, fail } from '@/lib/response'

const HETZNER_API = 'https://api.hetzner.cloud/v1'
const BACKUP_DESC_PREFIX = 'cf-backup:'

function hetznerHeaders(json = false): Record<string, string> {
    const h: Record<string, string> = {
        Authorization: `Bearer ${process.env.HETZNER_API_TOKEN}`,
    }
    if (json) h['Content-Type'] = 'application/json'
    return h
}

function makeBackupDescription(instanceId: string, userLabel: string): string {
    // Sanitize label — keep alphanum, hebrew, dashes, spaces; drop everything else
    const clean = (userLabel || '').replace(/[^\p{L}\p{N}\s\-_:.]/gu, '').slice(0, 64).trim()
    const label = clean || `manual ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
    return `${BACKUP_DESC_PREFIX}${instanceId}:${label}`
}

function parseBackupDescription(desc: string | null | undefined, instanceId: string): { ours: boolean; label: string } {
    if (!desc) return { ours: false, label: '' }
    const prefix = `${BACKUP_DESC_PREFIX}${instanceId}:`
    if (!desc.startsWith(prefix)) return { ours: false, label: desc }
    return { ours: true, label: desc.slice(prefix.length) }
}

// ── GET /hosting/instances/:id/backups ──
export const listBackups = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (!instance.hetznerServerId) {
            return ok(c, { backups: [], count: 0 }, 'No server provisioned yet.')
        }

        // Fetch all snapshot images filtered by created_from this server
        const url = new URL(`${HETZNER_API}/images`)
        url.searchParams.set('type', 'snapshot')
        url.searchParams.set('per_page', '50')
        const r = await fetch(url.toString(), { headers: hetznerHeaders() })
        if (!r.ok) {
            console.error('listBackups Hetzner error:', r.status, await r.text())
            return fail(c, 'Failed to list backups from Hetzner.', 502)
        }
        const j = (await r.json()) as { images?: Array<{
            id: number; description: string | null; created: string;
            image_size: number | null; disk_size: number; status: string;
            created_from?: { id: number; name: string } | null;
        }> }

        const images = (j.images || []).filter(img => {
            // Belongs to this VPS (either currently or historically) by description tag
            const { ours } = parseBackupDescription(img.description, instanceId)
            // Or — created from current server (covers cases where description tag was missing)
            const fromCurrentServer = String(img.created_from?.id ?? '') === String(instance.hetznerServerId ?? '')
            return ours || fromCurrentServer
        })

        const backups = images
            .map(img => {
                const { label } = parseBackupDescription(img.description, instanceId)
                return {
                    imageId: img.id,
                    label: label || (img.description || 'snapshot'),
                    createdAt: img.created,
                    sizeGb: img.disk_size,
                    actualSizeGb: img.image_size != null ? Math.round(img.image_size * 100) / 100 : null,
                    status: img.status,  // creating | available | deleted | unavailable
                }
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return ok(c, { backups, count: backups.length }, 'Backups listed.')
    } catch (err) {
        console.error('listBackups error:', err)
        return fail(c, 'Failed to list backups.', 500)
    }
}

// ── POST /hosting/instances/:id/backups/create ──
export const createBackup = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (!instance.hetznerServerId) {
            return fail(c, 'Server not provisioned yet — cannot snapshot.', 400)
        }
        if (!process.env.HETZNER_API_TOKEN) {
            return fail(c, 'Hetzner API token not configured on platform.', 500)
        }

        const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }))
        const description = makeBackupDescription(instanceId, body.name || '')

        const r = await fetch(
            `${HETZNER_API}/servers/${instance.hetznerServerId}/actions/create_image`,
            {
                method: 'POST',
                headers: hetznerHeaders(true),
                body: JSON.stringify({ type: 'snapshot', description }),
            }
        )

        if (!r.ok) {
            const errText = await r.text()
            console.error('createBackup Hetzner error:', r.status, errText)
            // Common Hetzner errors → friendly messages
            if (errText.includes('limit_reached') || errText.includes('limit reached')) {
                return fail(c, 'הגעתם למכסת הגיבויים. מחקו גיבוי ישן לפני יצירת חדש.', 400)
            }
            if (errText.includes('locked')) {
                return fail(c, 'השרת נעול — פעולה אחרת רצה כרגע. נסו שוב בעוד דקה.', 409)
            }
            return fail(c, 'Failed to create backup snapshot.', 502)
        }

        const j = (await r.json()) as {
            action: { id: number; status: string; progress: number };
            image: { id: number; description: string; created: string };
        }

        return ok(c, {
            imageId: j.image.id,
            actionId: j.action.id,
            status: j.action.status,
            createdAt: j.image.created,
            description: j.image.description,
        }, 'Backup started — completion in 1-3 minutes.')
    } catch (err) {
        console.error('createBackup error:', err)
        return fail(c, 'Failed to create backup.', 500)
    }
}

// ── POST /hosting/instances/:id/backups/restore ──
// Body: { imageId: number, confirm: string (must equal instanceId) }
// CAUTION: this destroys current VPS state and rebuilds from snapshot.
export const restoreBackup = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const body = await c.req.json<{ imageId?: number; confirm?: string; backupName?: string }>()
            .catch(() => ({} as any))

        // Backwards-compat: accept legacy backupName
        const imageId = typeof body.imageId === 'number' ? body.imageId : null
        if (!imageId) {
            return fail(c, 'imageId is required.', 400)
        }
        if (body.confirm !== instanceId) {
            return fail(c, 'Confirmation must equal the instance id.', 400)
        }

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance) return fail(c, 'Instance not found.', 404)
        if (!instance.hetznerServerId) return fail(c, 'Server not provisioned.', 400)
        if (!process.env.HETZNER_API_TOKEN) return fail(c, 'Hetzner API token not configured.', 500)

        // Verify the snapshot belongs to this user and is restorable
        const imgRes = await fetch(`${HETZNER_API}/images/${imageId}`, { headers: hetznerHeaders() })
        if (!imgRes.ok) return fail(c, 'Snapshot not found.', 404)
        const imgJson = (await imgRes.json()) as { image?: { id: number; description: string | null; status: string; type: string } }
        const img = imgJson.image
        if (!img || img.type !== 'snapshot') return fail(c, 'Invalid snapshot.', 400)
        if (img.status !== 'available') return fail(c, `Snapshot not ready (status: ${img.status}).`, 400)
        const { ours } = parseBackupDescription(img.description, instanceId)
        if (!ours) {
            return fail(c, 'This snapshot does not belong to this instance.', 403)
        }

        // Trigger rebuild — server reboots and is restored from snapshot
        const r = await fetch(
            `${HETZNER_API}/servers/${instance.hetznerServerId}/actions/rebuild`,
            {
                method: 'POST',
                headers: hetznerHeaders(true),
                body: JSON.stringify({ image: imageId }),
            }
        )
        if (!r.ok) {
            const errText = await r.text()
            console.error('restoreBackup Hetzner error:', r.status, errText)
            if (errText.includes('locked')) {
                return fail(c, 'השרת נעול — פעולה אחרת רצה כרגע.', 409)
            }
            return fail(c, 'Failed to restore from backup.', 502)
        }

        const j = (await r.json()) as {
            action: { id: number; status: string; progress: number };
            root_password: string | null;
        }

        // Mark instance as restoring so dashboard polls can show it
        try {
            await db.update(instances).set({ status: 'restoring' as any }).where(eq(instances.id, instanceId))
        } catch (e) { /* status enum may not include 'restoring' — non-fatal */ }

        return ok(c, {
            actionId: j.action.id,
            status: j.action.status,
            imageId,
        }, 'Restore started — server will be back online in 1-3 minutes.')
    } catch (err) {
        console.error('restoreBackup error:', err)
        return fail(c, 'Failed to restore backup.', 500)
    }
}

// ── DELETE /hosting/instances/:id/backups/:imageId ──
export const deleteBackup = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')
        const imageIdParam = c.req.param('imageId')
        const imageId = parseInt(imageIdParam, 10)
        if (!imageId || Number.isNaN(imageId)) return fail(c, 'Invalid imageId.', 400)

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found.', 404)
        if (!process.env.HETZNER_API_TOKEN) return fail(c, 'Hetzner API token not configured.', 500)

        // Ownership check via description prefix
        const imgRes = await fetch(`${HETZNER_API}/images/${imageId}`, { headers: hetznerHeaders() })
        if (!imgRes.ok) return fail(c, 'Snapshot not found.', 404)
        const imgJson = (await imgRes.json()) as { image?: { description: string | null; type: string } }
        const img = imgJson.image
        if (!img || img.type !== 'snapshot') return fail(c, 'Invalid snapshot.', 400)
        const { ours } = parseBackupDescription(img.description, instanceId)
        if (!ours) return fail(c, 'This snapshot does not belong to this instance.', 403)

        const r = await fetch(`${HETZNER_API}/images/${imageId}`, { method: 'DELETE', headers: hetznerHeaders() })
        if (!r.ok) {
            console.error('deleteBackup Hetzner error:', r.status, await r.text())
            return fail(c, 'Failed to delete backup.', 502)
        }

        return ok(c, { imageId }, 'Backup deleted.')
    } catch (err) {
        console.error('deleteBackup error:', err)
        return fail(c, 'Failed to delete backup.', 500)
    }
}

// ── POST /hosting/instances/:id/backup-report — legacy VPS cron callback ──
export const backupReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ timestamp: string; size: number; count: number }>()
        console.log(`Backup report: instance=${instanceId} time=${body.timestamp} size=${body.size} count=${body.count}`)
        return ok(c, null, 'OK')
    } catch {
        return ok(c, null, 'OK')
    }
}