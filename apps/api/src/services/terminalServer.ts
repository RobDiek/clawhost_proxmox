// SSH Terminal via WebSocket — connects to client VPS
import type { Server } from 'http'
import { readFileSync } from 'fs'
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from 'ssh2'
import { eq } from 'drizzle-orm'
import pg from 'pg'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const DB_URL = process.env.DATABASE_URL || ''

const pool = new pg.Pool({ connectionString: DB_URL })

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

async function getInstanceIp(instanceId: string): Promise<string | null> {
    const client = await pool.connect()
    try {
        const res = await client.query('SELECT ip FROM instances WHERE id = $1 AND status = $2', [instanceId, 'running'])
        return res.rows[0]?.ip || null
    } finally { client.release() }
}

const PING_INTERVAL = 5000

function handleTerminalConnection(ws: WebSocket, ip: string) {
    const conn = new Client()
    let sshReady = false

    const pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, PING_INTERVAL)

    ws.on('close', () => clearInterval(pingTimer))

    conn.on('ready', () => {
        sshReady = true
        conn.shell(
            { term: 'xterm-256color', cols: 80, rows: 24 },
            (err, stream) => {
                if (err) { ws.close(); conn.end(); return }

                stream.on('data', (data: Buffer) => {
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
        )
    })

    conn.on('error', () => {
        if (ws.readyState === WebSocket.OPEN) ws.close()
    })

    ws.on('close', () => { if (sshReady) conn.end() })

    conn.connect({
        host: ip,
        port: 22,
        username: 'root',
        privateKey: getSSHKey(),
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
        algorithms: {
            serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256']
        }
    })
}

export function setupTerminalServer(server: Server) {
    const wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', async (request, socket, head) => {
        const url = request.url || ''
        const match = url.match(/^\/ws\/terminal\/([a-f0-9]+)/)

        if (!match) return // Let other handlers process

        const instanceId = match[1]

        try {
            const ip = await getInstanceIp(instanceId)
            if (!ip) { socket.destroy(); return }

            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTerminalConnection(ws, ip)
            })
        } catch {
            socket.destroy()
        }
    })

    console.log('🖥  Terminal WebSocket server ready on /ws/terminal/:id')
}
