import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveUserId } from './authHelper'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, 30000)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { /* key not available */ }
        conn.connect(opts)
    })
}

// GET /hosting/instances/:id/backups
export const listBackups = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const output = await sshExec(instance.ip,
            `ls -1t /opt/openclaw-backups/backup-*.tar.gz 2>/dev/null | head -7 | while read f; do
                SIZE=$(stat -c%s "$f" 2>/dev/null || echo 0)
                NAME=$(basename "$f")
                TIMESTAMP=$(echo "$NAME" | sed 's/backup-//;s/.tar.gz//')
                echo "$TIMESTAMP|$SIZE|$NAME"
            done`,
            instance.rootPassword || undefined
        )

        const backups = output.split('\n').filter(Boolean).map(line => {
            const [timestamp, size, name] = line.split('|')
            return {
                name,
                timestamp,
                date: timestamp ? `${timestamp.slice(0,4)}-${timestamp.slice(4,6)}-${timestamp.slice(6,8)} ${timestamp.slice(9,11)}:${timestamp.slice(11,13)}` : '',
                sizeMb: Math.round((parseInt(size) || 0) / 1024 / 1024),
            }
        })

        return ok(c, { backups, count: backups.length, maxDays: 7 }, 'Backups listed.')
    } catch (err) {
        console.error('listBackups error:', err)
        return fail(c, 'Failed to list backups.', 500)
    }
}

// POST /hosting/instances/:id/backups/create — trigger manual backup
export const createBackup = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        // Check if backup script exists
        const check = await sshExec(instance.ip, 'test -f /opt/openclaw-backup.sh && echo "yes" || echo "no"', instance.rootPassword || undefined)
        if (check !== 'yes') {
            return fail(c, 'Backup not configured for this instance.', 400)
        }

        // Run backup in background
        await sshExec(instance.ip, 'nohup /opt/openclaw-backup.sh > /var/log/openclaw-backup.log 2>&1 &', instance.rootPassword || undefined)

        return ok(c, null, 'Backup started. It will be available in ~1 minute.')
    } catch (err) {
        console.error('createBackup error:', err)
        return fail(c, 'Failed to create backup.', 500)
    }
}

// POST /hosting/instances/:id/backups/restore — restore from backup
export const restoreBackup = async (c: Context<HonoEnv>) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized.', 401)
        const instanceId = c.req.param('id')
        const { backupName } = await c.req.json<{ backupName: string }>()

        if (!backupName || !/^backup-\d{8}-\d{6}\.tar\.gz$/.test(backupName)) {
            return fail(c, 'Invalid backup name.', 400)
        }

        const [instance] = await db.select()
            .from(instances)
            .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))

        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        // Verify backup exists
        const exists = await sshExec(instance.ip,
            `test -f /opt/openclaw-backups/${backupName} && echo "yes" || echo "no"`,
            instance.rootPassword || undefined
        )
        if (exists !== 'yes') return fail(c, 'Backup not found.', 404)

        // Stop services, restore, restart
        await sshExec(instance.ip, `
            systemctl stop openclaw-gateway &&
            cd / && tar -xzf /opt/openclaw-backups/${backupName} 2>/dev/null &&
            chown -R openclaw:openclaw /home/openclaw/.openclaw &&
            systemctl start openclaw-gateway
        `, instance.rootPassword || undefined)

        return ok(c, { restored: backupName }, 'Backup restored. Services restarting.')
    } catch (err) {
        console.error('restoreBackup error:', err)
        return fail(c, 'Failed to restore backup.', 500)
    }
}

// POST /hosting/instances/:id/backup-report — called by VPS cron
export const backupReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<{ timestamp: string; size: number; count: number }>()
        // Just log for now — could store in DB later
        console.log(`Backup report: instance=${instanceId} time=${body.timestamp} size=${body.size} count=${body.count}`)
        return ok(c, null, 'OK')
    } catch {
        return ok(c, null, 'OK')
    }
}