/**
 * DFS MCP shim deployment (tenant sovereignty D3).
 *
 * Deploys scripts/dfs-mcp-shim.js to the VPS and registers it as the per-agent
 * `dataforseo` openclaw MCP, pointing at the central relay (dfsRelay.ts). The shim
 * holds NO DataForSEO key — it authenticates to the relay with the INSTANCE
 * openclaw_token (the relay validates instances.openclaw_token and debits the
 * instance's prepaid balance), so the SAME instance token is used for the primary
 * and every secondary agent on the VPS. Registration is HOME-based (agent-aware)
 * so each agent's own gateway picks it up — see agentVpsPaths/baseHome.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { sshExec } from '@/controllers/hosting/agentSetup'

const RELAY_BASE = process.env.DFS_RELAY_BASE || 'https://api.clawflow.flowmatic.co.il'

let _shimSrc: string | null = null
function shimSource(): string {
    if (_shimSrc) return _shimSrc
    const here = dirname(fileURLToPath(import.meta.url)) // apps/api/src/services
    const candidates = [
        join(here, '../../../../scripts/dfs-mcp-shim.js'),
        '/opt/openclaw-hosting/scripts/dfs-mcp-shim.js',
    ]
    for (const p of candidates) {
        try { _shimSrc = readFileSync(p, 'utf8'); return _shimSrc } catch { /* try next candidate */ }
    }
    throw new Error('dfs-mcp-shim.js not found in any candidate path')
}

/**
 * Deploy + register the DFS MCP shim for one agent. Idempotent (re-writes the file
 * + `openclaw mcp set` overwrites). Throws on SSH failure — callers wrap in a
 * non-fatal try/catch (DFS shim must never block agent setup).
 */
export async function setupDfsShim(opts: {
    ip: string
    password?: string
    baseHome: string       // gateway $HOME: /home/openclaw (primary) | /home/openclaw/agents/<id>
    instanceId: string
    instanceToken: string  // instances.openclaw_token — relay auth + balance owner
}): Promise<void> {
    const { ip, password, baseHome, instanceId, instanceToken } = opts
    if (!instanceToken) throw new Error('instanceToken required for DFS shim relay auth')

    // 1) write the shared shim file (one per VPS; all agents reuse it)
    const shimB64 = Buffer.from(shimSource()).toString('base64')
    await sshExec(ip,
        `echo '${shimB64}' | base64 -d > /opt/openclaw/dfs-mcp-shim.js && ` +
        `chown openclaw:openclaw /opt/openclaw/dfs-mcp-shim.js && node --check /opt/openclaw/dfs-mcp-shim.js`,
        password, 30000)

    // 2) register as the 'dataforseo' MCP for THIS agent (HOME-based → agent-aware)
    const relayUrl = `${RELAY_BASE}/hosting/instances/${instanceId}/dfs/relay`
    const cfg = JSON.stringify({
        command: 'node',
        args: ['/opt/openclaw/dfs-mcp-shim.js'],
        env: { DFS_RELAY_URL: relayUrl, OPENCLAW_TOKEN: instanceToken },
    })
    const cfgB64 = Buffer.from(cfg).toString('base64')
    await sshExec(ip,
        `echo '${cfgB64}' | base64 -d > /tmp/dfsmcp.json && chown openclaw:openclaw /tmp/dfsmcp.json && ` +
        `su - openclaw -c 'HOME=${baseHome} openclaw mcp set dataforseo "$(cat /tmp/dfsmcp.json)" 2>&1' | head -3; ` +
        `rm -f /tmp/dfsmcp.json`,
        password, 30000)
}