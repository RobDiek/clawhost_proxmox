// SSH Terminal via WebSocket — connects to client VPS
import type { Server } from 'http'
import { readFileSync } from 'fs'
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from 'ssh2'
import { eq } from 'drizzle-orm'
import pg from 'pg'

import { userIdFromJwt } from '@/controllers/hosting/authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const DB_URL = process.env.DATABASE_URL || ''

const pool = new pg.Pool({ connectionString: DB_URL })

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

// Client variant WITH ownership check — the instance must belong to the JWT user
// AND be running. Closes the hole where any known instanceId opened a root shell.
async function getOwnedInstanceInfo(instanceId: string, userId: string): Promise<{ ip: string; password: string | null } | null> {
    const client = await pool.connect()
    try {
        const res = await client.query('SELECT ip, root_password FROM instances WHERE id = $1 AND user_id = $2 AND status = $3', [instanceId, userId, 'running'])
        if (!res.rows[0]?.ip) return null
        return { ip: res.rows[0].ip, password: res.rows[0].root_password }
    } finally { client.release() }
}

// Admin variant: works on ANY status (suspended/initializing/running/failed)
// so admin can investigate failures. Auth checked separately via JWT.
async function getInstanceInfoAdmin(instanceId: string): Promise<{ ip: string; password: string | null } | null> {
    const client = await pool.connect()
    try {
        const res = await client.query('SELECT ip, root_password FROM instances WHERE id = $1', [instanceId])
        if (!res.rows[0]?.ip) return null
        return { ip: res.rows[0].ip, password: res.rows[0].root_password }
    } finally { client.release() }
}

async function verifyAdminToken(token: string): Promise<{ ok: boolean; adminId?: string }> {
    try {
        const { verifyAdminJwt } = await import('@/services/adminAuth')
        const r = await verifyAdminJwt(token)
        return { ok: r.ok, adminId: r.adminId }
    } catch { return { ok: false } }
}

const PING_INTERVAL = 5000

// startupCmd: when set, runs that command in a PTY (e.g. launch `claude` as the
// developer user) instead of a plain login shell. Used by /ws/claude/:id.
function handleTerminalConnection(ws: WebSocket, ip: string, password?: string | null, startupCmd?: string) {
    const conn = new Client()
    let sshReady = false

    const pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, PING_INTERVAL)

    ws.on('close', () => clearInterval(pingTimer))

    const onStream = (err: Error | undefined, stream: any) => {
        if (err) { ws.close(); conn.end(); return }

        stream.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data.toString('utf-8'))
        })
        // exec channels also emit stderr — surface it in the terminal
        if (stream.stderr) stream.stderr.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data.toString('utf-8'))
        })

        stream.on('close', () => { ws.close(); conn.end() })

        ws.on('message', (msg: Buffer | string) => {
            const str = typeof msg === 'string' ? msg : msg.toString('utf-8')

            if (str[0] === '{') {
                try {
                    const parsed = JSON.parse(str)
                    if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                        stream.setWindow(parsed.rows, parsed.cols, 0, 0)
                        return
                    }
                } catch {}
            }

            stream.write(str)
        })

        ws.on('close', () => { stream.close(); conn.end() })
    }

    conn.on('ready', () => {
        sshReady = true
        const ptyOpts = { term: 'xterm-256color', cols: 80, rows: 24 }
        if (startupCmd) conn.exec(startupCmd, { pty: ptyOpts }, onStream)
        else conn.shell(ptyOpts, onStream)
    })

    conn.on('error', () => {
        if (ws.readyState === WebSocket.OPEN) ws.close()
    })

    ws.on('close', () => { if (sshReady) conn.end() })

    const connectOpts: Record<string, unknown> = {
        host: ip,
        port: 22,
        username: 'root',
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
        algorithms: {
            serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256']
        }
    }
    // Use password + SSH key (password as fallback if key not accepted)
    if (password) connectOpts.password = password
    try { connectOpts.privateKey = getSSHKey() } catch { /* key not available */ }
    conn.connect(connectOpts)
}

// Claude Developer CHAT bridge — runs Claude Code headless in stream-json mode
// (the protocol the VS Code extension uses) and relays line-delimited JSON both
// ways. No PTY: the dashboard renders a custom chat UI. Optional resumeSession
// continues a saved conversation.
function handleClaudeChatConnection(ws: WebSocket, ip: string, password: string | null, resumeSession?: string) {
    const conn = new Client()
    let sshReady = false
    const pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping() }, PING_INTERVAL)
    ws.on('close', () => clearInterval(pingTimer))

    conn.on('ready', () => {
        sshReady = true
        const resumeFlag = resumeSession ? ` --resume ${resumeSession}` : ''
        const claudeCmd = `sudo -u developer bash -lc 'cd /home/developer/workspace && set -a && . /home/developer/.config/dev-agent.env 2>/dev/null && set +a && exec claude --print --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-mode bypassPermissions${resumeFlag}'`
        conn.exec(claudeCmd, (err, stream) => {
            if (err) { ws.close(); conn.end(); return }
            let buf = ''
            stream.on('data', (data: Buffer) => {
                buf += data.toString('utf-8')
                let idx
                while ((idx = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, idx).trim()
                    buf = buf.slice(idx + 1)
                    if (line && ws.readyState === WebSocket.OPEN) ws.send(line)
                }
            })
            if (stream.stderr) stream.stderr.on('data', (data: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stderr', text: data.toString('utf-8') }))
            })
            stream.on('close', () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'closed' })); ws.close(); conn.end() })
            ws.on('message', (msg: Buffer | string) => {
                const str = typeof msg === 'string' ? msg : msg.toString('utf-8')
                try { stream.write(str.endsWith('\n') ? str : str + '\n') } catch { /* channel closed */ }
            })
            ws.on('close', () => { try { stream.end() } catch {} ; conn.end() })
        })
    })

    conn.on('error', () => { if (ws.readyState === WebSocket.OPEN) ws.close() })
    ws.on('close', () => { if (sshReady) conn.end() })

    const connectOpts: Record<string, unknown> = {
        host: ip, port: 22, username: 'root', readyTimeout: 10000,
        keepaliveInterval: 15000, keepaliveCountMax: 3,
        algorithms: { serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256'] },
    }
    if (password) connectOpts.password = password
    try { connectOpts.privateKey = getSSHKey() } catch { /* key not available */ }
    conn.connect(connectOpts)
}

export function setupTerminalServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', async (request, socket, head) => {
        const url = request.url || ''

        // Admin terminal: /ws/admin/terminal/:id?token=<adminJwt>
        const adminMatch = url.match(/^\/ws\/admin\/terminal\/([a-zA-Z0-9_-]+)(?:\?(.*))?/)
        if (adminMatch) {
            const instanceId = adminMatch[1]
            const qs = new URLSearchParams(adminMatch[2] || '')
            const token = qs.get('token') || ''
            try {
                const auth = await verifyAdminToken(token)
                if (!auth.ok) { socket.destroy(); return }
                const info = await getInstanceInfoAdmin(instanceId)
                if (!info) { socket.destroy(); return }
                // Audit the SSH session start (best-effort)
                try {
                    const { writeAudit } = await import('@/services/adminAuth')
                    await writeAudit({
                        adminId: auth.adminId,
                        action: 'admin.ssh.connect',
                        targetType: 'instance',
                        targetId: instanceId,
                        details: { ip: info.ip },
                    })
                } catch {}
                wss.handleUpgrade(request, socket, head, (ws) => {
                    handleTerminalConnection(ws, info.ip, info.password)
                })
            } catch { socket.destroy() }
            return
        }

        // Claude Developer CHAT (stream-json): /ws/claude-chat/:id?token=&session=
        const chatMatch = url.match(/^\/ws\/claude-chat\/([a-f0-9]+)(?:\?(.*))?/)
        if (chatMatch) {
            const instanceId = chatMatch[1]
            const cq = new URLSearchParams(chatMatch[2] || '')
            const uid = userIdFromJwt(cq.get('token') || '')
            if (!uid) { socket.destroy(); return }
            try {
                const info = await getOwnedInstanceInfo(instanceId, uid)
                if (!info) { socket.destroy(); return }
                const session = (cq.get('session') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || undefined
                wss.handleUpgrade(request, socket, head, (ws) => {
                    handleClaudeChatConnection(ws, info.ip, info.password, session)
                })
            } catch { socket.destroy() }
            return
        }

        // Claude Developer (roadmap/15): /ws/claude/:id?token=<userJwt>
        // Same ownership gate as the terminal, but launches Claude Code headed
        // (its TUI) as the jailed `developer` user, sourcing the BYO-key env file.
        const claudeMatch = url.match(/^\/ws\/claude\/([a-f0-9]+)(?:\?(.*))?/)
        if (claudeMatch) {
            const instanceId = claudeMatch[1]
            const cqs2 = new URLSearchParams(claudeMatch[2] || '')
            const uid = userIdFromJwt(cqs2.get('token') || '')
            if (!uid) { socket.destroy(); return }
            try {
                const info = await getOwnedInstanceInfo(instanceId, uid)
                if (!info) { socket.destroy(); return }
                const startupCmd = "sudo -u developer bash -lc 'cd /home/developer/workspace && set -a && . /home/developer/.config/dev-agent.env 2>/dev/null && set +a && exec claude'"
                wss.handleUpgrade(request, socket, head, (ws) => {
                    handleTerminalConnection(ws, info.ip, info.password, startupCmd)
                })
            } catch { socket.destroy() }
            return
        }

        // Client terminal (Developer plan): /ws/terminal/:id?token=<userJwt>
        // SECURITY: require the JWT user to OWN the instance. Previously this
        // path only checked status='running' → any known instanceId opened a
        // root shell to that VPS.
        const match = url.match(/^\/ws\/terminal\/([a-f0-9]+)(?:\?(.*))?/)
        if (!match) return // Let other handlers process

        const instanceId = match[1]
        const cqs = new URLSearchParams(match[2] || '')
        const userId = userIdFromJwt(cqs.get('token') || '')
        if (!userId) { socket.destroy(); return }

        try {
            const info = await getOwnedInstanceInfo(instanceId, userId)
            if (!info) { socket.destroy(); return }

            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTerminalConnection(ws, info.ip, info.password)
            })
        } catch {
            socket.destroy()
        }
    })

    console.log('🖥  Terminal WebSocket server ready on /ws/terminal/:id, /ws/admin/terminal/:id and /ws/claude/:id')
}