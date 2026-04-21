/**
 * SFTP upload helpers — transfer bytes from mgmt server to client VPS.
 *
 * Used by the media pipeline: fal.ai / ElevenLabs returns a URL, we fetch
 * the bytes locally, then push them to the client's own VPS filesystem
 * where nginx serves them at /media/... URLs.
 *
 * Standard auth chain (matching existing services/provisioner.ts pattern):
 *   1. root password if provided (from instances.rootPassword)
 *   2. else master private key at MASTER_SSH_KEY_PATH
 */
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

export interface SshTarget {
    host: string                  // IP or hostname
    username?: string             // default 'root'
    password?: string | null
    privateKeyPath?: string       // default $MASTER_SSH_KEY_PATH or /root/.ssh/openclaw_master
}

function resolveKey(): Buffer | null {
    try {
        return readFileSync(process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master')
    } catch {
        return null
    }
}

function connect(target: SshTarget): Promise<Client> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        const opts: Record<string, unknown> = {
            host: target.host,
            port: 22,
            username: target.username || 'root',
            readyTimeout: 20000,
        }
        // Prefer password auth when given — VPSes from early cloud-init revisions
        // don't have our master key in authorized_keys, and passing BOTH causes
        // ssh2 to stall on the first failed publickey attempt.
        if (target.password) {
            opts.password = target.password
            opts.tryKeyboard = true
        } else {
            const key = target.privateKeyPath
                ? (() => { try { return readFileSync(target.privateKeyPath!) } catch { return null } })()
                : resolveKey()
            if (key) opts.privateKey = key
        }
        conn.on('ready', () => resolve(conn))
        conn.on('error', reject)
        conn.connect(opts)
    })
}

/**
 * Upload raw bytes to a remote path on the VPS. Auto-creates parent dirs.
 * Fixes ownership to openclaw:openclaw so nginx (which runs as www-data)
 * can still read them and the user owns them.
 */
// Wrap conn.exec so we always drain stdout+stderr and add a fallback timeout.
// ssh2 exec channels can stall indefinitely if stderr is not consumed; we
// hit this in the first production run when chown wrote to stderr and nobody
// read it.
function runExec(conn: Client, cmd: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`exec timeout: ${cmd.slice(0, 60)}...`)), timeoutMs)
        conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err) }
            let out = ''
            stream.on('data', (d: Buffer) => { out += d.toString() })
            stream.stderr.on('data', (d: Buffer) => { out += d.toString() })
            stream.on('close', () => { clearTimeout(timer); resolve(out.trim()) })
            stream.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
        })
    })
}

export async function sshUploadBuffer(
    target: SshTarget,
    remotePath: string,
    data: Buffer,
): Promise<{ bytes: number }> {
    const conn = await connect(target)
    try {
        // Ensure parent directory exists (chown is advisory — don't fail on it)
        const parentDir = remotePath.substring(0, remotePath.lastIndexOf('/'))
        if (parentDir) {
            await runExec(conn, `mkdir -p ${JSON.stringify(parentDir)} && chown -R openclaw:openclaw ${JSON.stringify(parentDir)} 2>/dev/null; true`)
        }

        // Upload via SFTP — handles binary transparently
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('sftp upload timeout')), 60000)
            conn.sftp((err, sftp) => {
                if (err) { clearTimeout(timer); return reject(err) }
                const ws = sftp.createWriteStream(remotePath, { mode: 0o644 })
                ws.on('close', () => { clearTimeout(timer); resolve() })
                ws.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
                ws.end(data)
            })
        })

        // Fix ownership (best-effort — drained via runExec so no hang)
        await runExec(conn, `chown openclaw:openclaw ${JSON.stringify(remotePath)} 2>/dev/null; true`).catch(() => { /* best effort */ })

        return { bytes: data.length }
    } finally {
        conn.end()
    }
}

/**
 * Download bytes from an HTTPS URL (e.g., fal.ai CDN). Bounded by timeout
 * and max size to prevent runaway memory use.
 */
export async function fetchBytes(url: string, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<Buffer> {
    const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024 // 50 MB cap
    const timeoutMs = opts.timeoutMs ?? 60_000
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > maxBytes) throw new Error(`Fetched file too large: ${buf.length} > ${maxBytes}`)
    return buf
}