/**
 * GitHub Integration — connect repo for content publishing
 *
 * Agent writes MDX article → approve → publish to GitHub repo
 * → Cloudflare Pages / Vercel / Netlify auto-builds → live on site
 *
 * Uses @modelcontextprotocol/server-github MCP on VPS for agent access.
 * Uses GitHub REST API directly for publishing from management server.
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

// POST /integrations/github/save
export const saveGithubConfig = async (c: Context) => {
    try {
        const body = await c.req.json<{
            instanceId: string
            token: string       // GitHub Personal Access Token (fine-grained)
            repo: string        // "owner/repo" format
            branch?: string     // default: main
            contentPath?: string // path to content dir, e.g. "content/guides"
        }>()

        if (!body.instanceId || !body.token || !body.repo) {
            return fail(c, 'instanceId, token, and repo required', 400)
        }

        if (!body.repo.includes('/')) {
            return fail(c, 'repo must be in "owner/repo" format', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(body.instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Validate token by calling GitHub API
        const testRes = await fetch(`https://api.github.com/repos/${body.repo}`, {
            headers: {
                'Authorization': `Bearer ${body.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ClawFlow-SEO',
            },
        })
        if (testRes.status === 401) return fail(c, 'Invalid GitHub token', 401)
        if (testRes.status === 404) return fail(c, 'Repository not found or no access', 404)

        const repoData = await testRes.json() as { default_branch?: string; full_name?: string }

        // Save config
        const githubConfig = {
            token: body.token,
            repo: body.repo,
            branch: body.branch || repoData.default_branch || 'main',
            contentPath: body.contentPath || 'content/guides',
            connectedAt: new Date().toISOString(),
        }

        await db.update(instances)
            .set({ githubConfig: githubConfig as any })
            .where(eq(instances.id, body.instanceId))

        // Deploy GitHub MCP server to VPS
        if (instance.ip) {
            try {
                await deployGithubMcpToVPS(instance.ip, instance.rootPassword || undefined, body.token)
            } catch (err) {
                console.error('Failed to deploy GitHub MCP:', err)
            }
        }

        console.log(`GitHub connected for ${body.instanceId}: ${body.repo}`)
        return ok(c, { repo: body.repo, branch: githubConfig.branch }, 'GitHub connected.')
    } catch (err) {
        console.error('saveGithubConfig error:', err)
        return fail(c, 'Failed to save GitHub config', 500)
    }
}

// GET /integrations/github/status
export const getGithubStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const config = instance.githubConfig as any
        if (!config?.token) return ok(c, { connected: false }, 'Not connected.')

        return ok(c, {
            connected: true,
            repo: config.repo,
            branch: config.branch,
            contentPath: config.contentPath,
        }, 'Connected.')
    } catch (err) {
        console.error('getGithubStatus error:', err)
        return fail(c, 'Failed', 500)
    }
}

// POST /integrations/github/disconnect
export const disconnectGithub = async (c: Context) => {
    try {
        const body = await c.req.json<{ instanceId: string }>()
        if (!body.instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(body.instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        await db.update(instances)
            .set({ githubConfig: null })
            .where(eq(instances.id, body.instanceId))

        // Remove MCP from VPS
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('github', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'GitHub disconnected.')
    } catch (err) {
        console.error('disconnectGithub error:', err)
        return fail(c, 'Failed', 500)
    }
}

// POST /integrations/github/publish — publish content to GitHub repo
export const publishToGithub = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const config = instance.githubConfig as any
        if (!config?.token) return fail(c, 'GitHub not connected', 400)

        const body = await c.req.json<{
            filePath: string    // e.g. "content/guides/seo-pricing-2026.mdx"
            content: string     // full MDX content with frontmatter
            commitMessage: string
        }>()

        if (!body.filePath || !body.content) {
            return fail(c, 'filePath and content required', 400)
        }

        // Create or update file via GitHub API
        const apiUrl = `https://api.github.com/repos/${config.repo}/contents/${body.filePath}`

        // Check if file exists (for update — need sha)
        let existingSha: string | undefined
        try {
            const existing = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'ClawFlow-SEO',
                },
            })
            if (existing.ok) {
                const data = await existing.json() as { sha?: string }
                existingSha = data.sha
            }
        } catch { /* file doesn't exist — create new */ }

        // Create/update file
        const payload: Record<string, string> = {
            message: body.commitMessage || `Add ${body.filePath.split('/').pop()}`,
            content: Buffer.from(body.content).toString('base64'),
            branch: config.branch || 'main',
        }
        if (existingSha) payload.sha = existingSha

        const res = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'ClawFlow-SEO',
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json() as { message?: string }
            return fail(c, `GitHub API error: ${err.message || res.status}`, 502)
        }

        const result = await res.json() as { content?: { html_url?: string } }
        console.log(`Published to GitHub: ${config.repo}/${body.filePath}`)

        return ok(c, {
            url: result.content?.html_url || `https://github.com/${config.repo}/blob/${config.branch}/${body.filePath}`,
            repo: config.repo,
            filePath: body.filePath,
        }, 'Published to GitHub.')
    } catch (err) {
        console.error('publishToGithub error:', err)
        return fail(c, 'Failed to publish', 500)
    }
}

// Deploy GitHub MCP server to VPS
async function deployGithubMcpToVPS(ip: string, password: string | undefined, token: string): Promise<void> {
    console.log(`Deploying GitHub MCP server to ${ip}...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: token,
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['github'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('github MCP configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`GitHub MCP server deployed to ${ip}`)
}
