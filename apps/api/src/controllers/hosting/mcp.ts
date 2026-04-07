/**
 * MCP Server Management — add/remove/list MCP servers on client VPS
 *
 * Uses `openclaw mcp set/unset/list` CLI commands via SSH.
 * MCP servers are configured in openclaw.json → mcpServers section.
 * Each server runs as a child process of OpenClaw gateway.
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

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
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch {}
        conn.connect(opts)
    })
}

// Known MCP server definitions
const MCP_SERVERS: Record<string, {
    name: string
    nameHe: string
    package: string
    command: string
    args: string[]
    envKeys: string[]  // which env vars are needed
    category: string
}> = {
    'google-workspace': {
        name: 'Google Workspace',
        nameHe: 'Google Workspace',
        package: '@presto-ai/google-workspace-mcp',
        command: 'npx',
        args: ['-y', '@presto-ai/google-workspace-mcp'],
        envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
        category: 'productivity',
    },
    'ms-365': {
        name: 'Microsoft 365',
        nameHe: 'Microsoft 365',
        package: '@softeria/ms-365-mcp-server',
        command: 'npx',
        args: ['-y', '@softeria/ms-365-mcp-server'],
        envKeys: ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_TENANT_ID', 'MS_REFRESH_TOKEN'],
        category: 'productivity',
    },
    'brave-search': {
        name: 'Brave Search',
        nameHe: 'חיפוש Brave',
        package: '@brave/brave-search-mcp-server',
        command: 'npx',
        args: ['-y', '@brave/brave-search-mcp-server'],
        envKeys: ['BRAVE_API_KEY'],
        category: 'search',
    },
    'wordpress': {
        name: 'WordPress',
        nameHe: 'WordPress',
        package: '@respira/wordpress-mcp-server',
        command: 'npx',
        args: ['-y', '@respira/wordpress-mcp-server'],
        envKeys: ['WP_URL', 'WP_USERNAME', 'WP_APP_PASSWORD'],
        category: 'publishing',
    },
    'email': {
        name: 'Email (SMTP/IMAP)',
        nameHe: 'אימייל (SMTP)',
        package: 'mcp-mail-server',
        command: 'npx',
        args: ['-y', 'mcp-mail-server'],
        envKeys: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'],
        category: 'communication',
    },
    'replicate': {
        name: 'Replicate (Image Gen)',
        nameHe: 'ייצור תמונות (Replicate)',
        package: '@gongrzhe/image-gen-server',
        command: 'npx',
        args: ['-y', '@gongrzhe/image-gen-server'],
        envKeys: ['REPLICATE_API_TOKEN'],
        category: 'media',
    },
    'instagram': {
        name: 'Instagram',
        nameHe: 'Instagram',
        package: '@mcpware/instagram-mcp',
        command: 'npx',
        args: ['-y', '@mcpware/instagram-mcp'],
        envKeys: ['INSTAGRAM_ACCESS_TOKEN'],
        category: 'publishing',
    },
    'mem0': {
        name: 'Mem0 Memory',
        nameHe: 'זיכרון (Mem0)',
        package: '@mem0/mcp-server',
        command: 'npx',
        args: ['-y', '@mem0/mcp-server'],
        envKeys: ['MEM0_API_KEY'],
        category: 'memory',
    },
}

// Validate env vars don't contain shell metacharacters
function sanitizeEnvValue(val: string): string {
    return val.replace(/['"\\$`!]/g, '')
}

// GET /instances/:id/mcp/servers — list available + installed MCP servers
export const listMcpServers = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Get currently configured MCP servers from VPS
        let installedServers: string[] = []
        try {
            const result = await sshExec(instance.ip,
                "su - openclaw -c 'openclaw mcp list --json 2>/dev/null'",
                instance.rootPassword || undefined
            )
            try {
                const parsed = JSON.parse(result)
                installedServers = Array.isArray(parsed) ? parsed.map((s: any) => s.name || s) : Object.keys(parsed)
            } catch {
                // Try line-by-line parsing
                installedServers = result.split('\n').filter(l => l && !l.startsWith('[') && !l.startsWith('{'))
            }
        } catch { /* VPS not accessible */ }

        // Build server list with installed status
        const servers = Object.entries(MCP_SERVERS).map(([id, server]) => ({
            id,
            ...server,
            installed: installedServers.some(s => s === id || s.includes(id)),
        }))

        return ok(c, { servers, installedCount: installedServers.length }, 'MCP servers')
    } catch (err) {
        console.error('listMcpServers error:', err)
        return fail(c, 'Failed to list MCP servers', 500)
    }
}

// POST /instances/:id/mcp/add — add MCP server to VPS
export const addMcpServer = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ serverId: string; env: Record<string, string> }>()

        if (!body.serverId || !MCP_SERVERS[body.serverId] || !/^[a-z0-9-]+$/.test(body.serverId)) {
            return fail(c, 'Unknown MCP server', 400)
        }

        const server = MCP_SERVERS[body.serverId]

        // Validate required env vars
        for (const key of server.envKeys) {
            if (!body.env?.[key]) {
                return fail(c, `Missing required: ${key}`, 400)
            }
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Build MCP config JSON
        const mcpConfig: Record<string, unknown> = {
            command: server.command,
            args: server.args,
        }

        // Add env vars (sanitized)
        if (Object.keys(body.env).length > 0) {
            const env: Record<string, string> = {}
            for (const [key, val] of Object.entries(body.env)) {
                // Only allow known env keys for this server
                if (server.envKeys.includes(key)) {
                    env[key] = sanitizeEnvValue(val)
                }
            }
            mcpConfig.env = env
        }

        const configJson = JSON.stringify(mcpConfig)
        const b64Config = Buffer.from(configJson).toString('base64')

        // MCP set + restart in single SSH call
        await sshExec(instance.ip, `
            echo '${b64Config}' | base64 -d > /tmp/mcp-cfg.json &&
            mkdir -p /home/openclaw/.openclaw/mcp-servers &&
            cp /tmp/mcp-cfg.json /home/openclaw/.openclaw/mcp-servers/${body.serverId}.json &&
            chown -R openclaw:openclaw /home/openclaw/.openclaw/mcp-servers &&
            rm -f /tmp/mcp-cfg.json &&
            systemctl restart openclaw-gateway
        `, instance.rootPassword || undefined)

        return ok(c, { serverId: body.serverId, name: server.name }, `MCP server ${server.name} added`)
    } catch (err) {
        console.error('addMcpServer error:', err)
        return fail(c, 'Failed to add MCP server', 500)
    }
}

// DELETE /instances/:id/mcp/:serverId — remove MCP server from VPS
export const removeMcpServer = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const serverId = c.req.param('serverId')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        // Validate server ID (alphanumeric + dashes only)
        if (!/^[a-z0-9-]+$/.test(serverId)) return fail(c, 'Invalid server ID', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        await sshExec(instance.ip, `
            rm -f /home/openclaw/.openclaw/mcp-servers/${serverId}.json && systemctl restart openclaw-gateway
        `, instance.rootPassword || undefined)

        return ok(c, null, `MCP server ${serverId} removed`)
    } catch (err) {
        console.error('removeMcpServer error:', err)
        return fail(c, 'Failed to remove MCP server', 500)
    }
}

// GET /instances/:id/mcp/available — list all available MCP servers (catalog)
export const getMcpCatalog = async (c: Context) => {
    try {
        const catalog = Object.entries(MCP_SERVERS).map(([id, server]) => ({
            id,
            name: server.name,
            nameHe: server.nameHe,
            category: server.category,
            envKeys: server.envKeys,
        }))
        return ok(c, catalog, 'MCP catalog')
    } catch (err) {
        return fail(c, 'Failed', 500)
    }
}
