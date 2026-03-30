/**
 * Output Sync Service
 * Polls VPS agent session files and ingests new outputs into agent_outputs table.
 *
 * OpenClaw stores session data in JSONL files:
 *   /home/openclaw/.openclaw/agents/{agent}/sessions/{sessionId}.jsonl
 *
 * Each line is JSON with type, message, timestamp, etc.
 * We look for assistant messages from cron sessions (daily-brief, weekly-competitive, monthly-aeo).
 */

import { db } from '@/db'
import { agentOutputs, instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
const generateId = () => randomBytes(6).toString('hex')

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timeout = setTimeout(() => { conn.end(); resolve('') }, 30000)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timeout); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timeout); conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', (err) => { clearTimeout(timeout); resolve('') })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch { }
        conn.connect(opts)
    })
}

interface SessionMessage {
    type: string
    message?: {
        role: string
        content: Array<{ type: string; text?: string }> | string
    }
    timestamp?: string
    data?: Record<string, unknown>
}

interface ParsedOutput {
    agentRole: string
    sessionId: string
    content: string
    model: string
    timestamp: string
    tokens: number
    cost: number
}

/**
 * Parse a JSONL session file and extract assistant responses
 */
function parseSessionOutputs(jsonlContent: string, agentRole: string): ParsedOutput[] {
    const outputs: ParsedOutput[] = []
    const lines = jsonlContent.split('\n').filter(Boolean)

    let sessionModel = ''
    let lastUserPrompt = ''

    for (const line of lines) {
        try {
            const entry: SessionMessage = JSON.parse(line)

            // Track model
            if (entry.type === 'custom' && entry.data?.modelId) {
                sessionModel = String(entry.data.modelId)
            }

            // Track user prompt (to understand context)
            if (entry.type === 'message' && entry.message?.role === 'user') {
                const content = entry.message.content
                if (typeof content === 'string') {
                    lastUserPrompt = content
                } else if (Array.isArray(content)) {
                    lastUserPrompt = content.map(c => c.text || '').join('\n')
                }
            }

            // Capture assistant responses
            if (entry.type === 'message' && entry.message?.role === 'assistant') {
                const content = entry.message.content
                let text = ''
                if (typeof content === 'string') {
                    text = content
                } else if (Array.isArray(content)) {
                    text = content.map(c => c.text || '').join('\n')
                }

                // Skip trivial/intermediate responses
                if (!text || text.length < 100 || text === 'HEARTBEAT_OK') continue
                // Skip agent "thinking out loud" messages (intermediate steps, errors, tool usage)
                if (text.startsWith('[[reply_to_current]]') && text.length < 200) continue
                if (text.match(/^(DuckDuckGo|Reddit|Google|Bing|Brave)\s*(חסום|blocked|error)/i)) continue
                if (text.match(/^(עובר ל|מנסה|ניסה|חסום|timeout|error)/i) && text.length < 200) continue
                if (text.match(/^(HEARTBEAT|heartbeat|No changes|Nothing)/i)) continue

                const usage = (entry as any).message?.usage || (entry as any).usage || {}

                outputs.push({
                    agentRole,
                    sessionId: '',
                    content: text,
                    model: sessionModel,
                    timestamp: entry.timestamp || new Date().toISOString(),
                    tokens: usage.totalTokens || 0,
                    cost: usage.cost?.total || 0,
                })
            }
        } catch { /* skip malformed lines */ }
    }

    return outputs
}

/**
 * Classify an output based on content and user prompt context
 */
function classifyOutput(content: string, userPrompt: string): {
    outputType: string
    title: string
    platform: string | null
} {
    const lc = (content + ' ' + userPrompt).toLowerCase()

    if (lc.includes('daily brief') || lc.includes('סיכום יומי') || lc.includes('משימות עדיפות')) {
        return {
            outputType: 'daily_brief',
            title: 'Daily Brief — ' + new Date().toLocaleDateString('he-IL'),
            platform: 'telegram',
        }
    }

    if (lc.includes('תחרותי') || lc.includes('מתחרים') || lc.includes('competitive')) {
        return {
            outputType: 'weekly_report',
            title: 'דוח תחרותי שבועי — ' + new Date().toLocaleDateString('he-IL'),
            platform: 'telegram',
        }
    }

    if (lc.includes('aeo') || lc.includes('ביקורת') || lc.includes('schema')) {
        return {
            outputType: 'aeo_audit',
            title: 'ביקורת AEO — ' + new Date().toLocaleDateString('he-IL'),
            platform: null,
        }
    }

    if (lc.includes('פוסט') || lc.includes('instagram') || lc.includes('linkedin') || lc.includes('hashtag')) {
        const platform = lc.includes('instagram') ? 'instagram' :
                        lc.includes('linkedin') ? 'linkedin' :
                        lc.includes('facebook') ? 'facebook' : 'blog'
        return {
            outputType: 'content_post',
            title: content.split('\n')[0]?.substring(0, 60) || 'פוסט תוכן',
            platform,
        }
    }

    // Default
    return {
        outputType: 'content_post',
        title: content.split('\n')[0]?.substring(0, 60) || 'תוצאת סוכן',
        platform: null,
    }
}

/**
 * Sync outputs for a single instance
 */
async function syncInstance(instance: {
    id: string
    ip: string
    rootPassword: string | null
}): Promise<number> {
    let ingested = 0

    try {
        // Get list of recent session files (last 24h)
        const sessionList = await sshExec(instance.ip, `
            find /home/openclaw/.openclaw/agents -name "*.jsonl" -not -name "config*" -newer /home/openclaw/.openclaw/workspace/SOUL.md -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -10
        `, instance.rootPassword || undefined)

        if (!sessionList.trim()) return 0

        const sessionFiles = sessionList.trim().split('\n').map(line => {
            const [_ts, path] = line.split(' ', 2)
            return path
        }).filter(Boolean)

        // Get already-ingested session IDs to avoid duplicates
        const existing = await db.select({ id: agentOutputs.id, metadata: agentOutputs.metadata })
            .from(agentOutputs)
            .where(eq(agentOutputs.instanceId, instance.id))

        const ingestedSessionFiles = new Set(
            existing.map(e => (e.metadata as any)?.sessionFile).filter(Boolean)
        )

        for (const filePath of sessionFiles) {
            // Skip already-ingested files
            if (ingestedSessionFiles.has(filePath)) continue

            // Determine agent role from path
            const agentMatch = filePath.match(/agents\/(\w+)\/sessions/)
            const agentRole = agentMatch ? agentMatch[1] : 'main'
            if (agentRole === 'main') continue // Skip main agent heartbeats

            // Read session file
            const content = await sshExec(instance.ip,
                `cat "${filePath}" 2>/dev/null`,
                instance.rootPassword || undefined
            )
            if (!content || content.length < 100) continue

            // Parse outputs
            const outputs = parseSessionOutputs(content, agentRole)

            for (const output of outputs) {
                const classification = classifyOutput(output.content, '')

                await db.insert(agentOutputs).values({
                    id: generateId(),
                    instanceId: instance.id,
                    agentRole: output.agentRole,
                    outputType: classification.outputType,
                    title: classification.title,
                    content: output.content,
                    platform: classification.platform,
                    metadata: {
                        model: output.model,
                        tokens: output.tokens,
                        cost: output.cost,
                        sessionFile: filePath,
                        syncedAt: new Date().toISOString(),
                    },
                    status: 'pending_review',
                })

                ingested++
            }
        }

        // Also check main agent sessions for cron outputs (daily brief, etc.)
        const mainSessions = await sshExec(instance.ip, `
            find /home/openclaw/.openclaw/agents/main/sessions -name "*.jsonl" -not -name "config*" -newer /home/openclaw/.openclaw/workspace/SOUL.md -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -5
        `, instance.rootPassword || undefined)

        if (mainSessions.trim()) {
            for (const line of mainSessions.trim().split('\n')) {
                const [_ts, filePath] = line.split(' ', 2)
                if (!filePath || ingestedSessionFiles.has(filePath)) continue

                const content = await sshExec(instance.ip,
                    `cat "${filePath}" 2>/dev/null`,
                    instance.rootPassword || undefined
                )
                if (!content || content.length < 200) continue

                const outputs = parseSessionOutputs(content, 'mateh')

                for (const output of outputs) {
                    const classification = classifyOutput(output.content, '')

                    await db.insert(agentOutputs).values({
                        id: generateId(),
                        instanceId: instance.id,
                        agentRole: 'mateh',
                        outputType: classification.outputType,
                        title: classification.title,
                        content: output.content,
                        platform: classification.platform,
                        metadata: {
                            model: output.model,
                            tokens: output.tokens,
                            cost: output.cost,
                            sessionFile: filePath,
                            syncedAt: new Date().toISOString(),
                        },
                        status: classification.outputType === 'daily_brief' ? 'published' : 'pending_review',
                    })

                    ingested++
                }
            }
        }

    } catch (err) {
        console.error(`Output sync error for ${instance.id}:`, err)
    }

    return ingested
}

/**
 * Sync all running instances
 */
async function syncAllInstances(): Promise<void> {
    try {
        const runningInstances = await db.select({
            id: instances.id,
            ip: instances.ip,
            rootPassword: instances.rootPassword,
        })
        .from(instances)
        .where(and(
            eq(instances.status, 'running'),
        ))

        const withIp = runningInstances.filter(i => i.ip)

        for (const instance of withIp) {
            const count = await syncInstance(instance as any)
            if (count > 0) {
                console.log(`Output sync: ${count} new outputs for instance ${instance.id}`)
            }
        }
    } catch (err) {
        console.error('Output sync error:', err)
    }
}

/**
 * Start the output sync loop
 */
export function startOutputSync(): void {
    console.log(`Output sync started (interval: ${SYNC_INTERVAL / 1000}s)`)

    // Run once immediately
    setTimeout(() => syncAllInstances(), 10000)

    // Then every 5 minutes
    setInterval(() => syncAllInstances(), SYNC_INTERVAL)
}

export { syncAllInstances, syncInstance }
