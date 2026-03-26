// Real-time Chat: WebSocket server + Telegram bridge
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import crypto from 'crypto'
import pg from 'pg'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_SUPPORT_CHAT_ID || ''
const DB_URL = process.env.DATABASE_URL || ''

// ── DB helpers ──
const pool = new pg.Pool({ connectionString: DB_URL })

async function dbQuery(sql: string, params: unknown[] = []) {
    const client = await pool.connect()
    try { return await client.query(sql, params) }
    finally { client.release() }
}

// ── State ──
const sessions = new Map<string, Set<WebSocket>>() // sessionId -> connected clients
const telegramToSession = new Map<string, string>() // telegramChatId -> sessionId

// ── Telegram helpers ──
async function tgSend(chatId: string, text: string, replyMarkup?: object) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...replyMarkup }),
    })
}

async function notifyAdmin(sessionId: string, visitorName: string, message: string) {
    // Create inline keyboard with session ID for routing replies
    const text = `💬 <b>הודעה חדשה</b>\n\n👤 ${visitorName}\n📝 ${message}\n\n🔗 Session: <code>${sessionId}</code>`

    await tgSend(ADMIN_CHAT_ID, text, {
        reply_markup: {
            inline_keyboard: [[
                { text: '↩️ השב', callback_data: `reply:${sessionId}` }
            ]]
        }
    })
}

// ── Save message to DB ──
async function saveMessage(sessionId: string, sender: string, message: string) {
    const id = crypto.randomUUID()
    await dbQuery(
        'INSERT INTO chat_messages (id, session_id, sender, message) VALUES ($1, $2, $3, $4)',
        [id, sessionId, sender, message]
    )
    await dbQuery(
        'UPDATE chat_sessions SET last_message_at = NOW() WHERE id = $1',
        [sessionId]
    )
    return id
}

// ── Create or get session ──
async function getOrCreateSession(sessionId?: string, visitorName?: string): Promise<string> {
    if (sessionId) {
        const res = await dbQuery('SELECT id FROM chat_sessions WHERE id = $1', [sessionId])
        if (res.rows.length > 0) return sessionId
    }

    const id = crypto.randomBytes(8).toString('hex')
    await dbQuery(
        'INSERT INTO chat_sessions (id, visitor_name, status) VALUES ($1, $2, $3)',
        [id, visitorName || 'אורח', 'active']
    )
    return id
}

// ── Get chat history ──
async function getHistory(sessionId: string, limit = 50): Promise<Array<{ sender: string; message: string; created_at: string }>> {
    const res = await dbQuery(
        'SELECT sender, message, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
        [sessionId, limit]
    )
    return res.rows
}

// ── Broadcast to session WebSocket clients ──
function broadcastToSession(sessionId: string, data: object) {
    const clients = sessions.get(sessionId)
    if (!clients) return
    const msg = JSON.stringify(data)
    clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })
}

// ── Send admin reply to visitor ──
export async function sendAdminReply(sessionId: string, message: string) {
    await saveMessage(sessionId, 'admin', message)
    broadcastToSession(sessionId, {
        type: 'message',
        sender: 'admin',
        message,
        timestamp: new Date().toISOString(),
    })
}

// ── Telegram polling for admin replies ──
let lastTgUpdateId = 0
const replyState = new Map<number, string>() // telegram user -> waiting for reply to sessionId

async function pollTelegramReplies() {
    if (!BOT_TOKEN) return
    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastTgUpdateId + 1}&timeout=5`)
        const data = await res.json() as { ok: boolean; result: Array<any> }

        if (!data.ok || !data.result.length) return

        for (const update of data.result) {
            lastTgUpdateId = update.update_id

            // Handle callback query (reply button pressed)
            if (update.callback_query) {
                const cb = update.callback_query
                const cbData = cb.data as string
                if (cbData.startsWith('reply:')) {
                    const sessionId = cbData.slice(6)
                    replyState.set(cb.from.id, sessionId)
                    await tgSend(ADMIN_CHAT_ID, `✏️ כתבו את התשובה ללקוח (session: ${sessionId}):`)
                    // Answer callback
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callback_query_id: cb.id }),
                    })
                }
                continue
            }

            // Handle text message (admin reply)
            const msg = update.message
            if (!msg?.text || !msg.from) continue

            const waitingFor = replyState.get(msg.from.id)
            if (waitingFor && String(msg.chat.id) === ADMIN_CHAT_ID) {
                await sendAdminReply(waitingFor, msg.text)
                replyState.delete(msg.from.id)
                await tgSend(ADMIN_CHAT_ID, `✅ תשובה נשלחה ללקוח`)
                continue
            }

            // Handle /start and /setup commands (onboarding bot)
            if (msg.text.startsWith('/')) continue
        }
    } catch (err) {
        // Silent fail, will retry
    }
}

// ── WebSocket Server ──
export function setupChatWebSocket(server: Server) {
    const wss = new WebSocketServer({ noServer: true })

    // Handle upgrade manually before Hono
    server.on('upgrade', (request, socket, head) => {
        if (request.url === '/ws/chat') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request)
            })
        }
    })

    wss.on('connection', (ws) => {
        let sessionId: string | null = null

        ws.on('message', async (raw) => {
            try {
                const data = JSON.parse(raw.toString())

                switch (data.type) {
                    case 'init': {
                        // Client connects, create or restore session
                        sessionId = await getOrCreateSession(data.sessionId, data.name)

                        // Register WebSocket for this session
                        if (!sessions.has(sessionId)) sessions.set(sessionId, new Set())
                        sessions.get(sessionId)!.add(ws)

                        // Send session ID and history
                        const history = await getHistory(sessionId)
                        ws.send(JSON.stringify({
                            type: 'init',
                            sessionId,
                            history,
                        }))
                        break
                    }

                    case 'message': {
                        if (!sessionId) return
                        const message = (data.message || '').trim()
                        if (!message) return

                        // Save to DB
                        await saveMessage(sessionId, 'visitor', message)

                        // Broadcast to all clients in session
                        broadcastToSession(sessionId, {
                            type: 'message',
                            sender: 'visitor',
                            message,
                            timestamp: new Date().toISOString(),
                        })

                        // Notify admin via Telegram
                        const sess = await dbQuery('SELECT visitor_name FROM chat_sessions WHERE id = $1', [sessionId])
                        const name = sess.rows[0]?.visitor_name || 'אורח'
                        await notifyAdmin(sessionId, name, message)
                        break
                    }

                    case 'name': {
                        if (!sessionId) return
                        await dbQuery('UPDATE chat_sessions SET visitor_name = $1 WHERE id = $2', [data.name, sessionId])
                        break
                    }
                }
            } catch (err) {
                console.error('Chat WS error:', err)
            }
        })

        ws.on('close', () => {
            if (sessionId) {
                sessions.get(sessionId)?.delete(ws)
                if (sessions.get(sessionId)?.size === 0) sessions.delete(sessionId)
            }
        })
    })

    // Poll Telegram for admin replies every 2 seconds
    setInterval(pollTelegramReplies, 2000)

    console.log('💬 Chat WebSocket server ready on /ws/chat')
}
