import { randomBytes } from 'crypto'
import { PLANS } from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import cloudflare from '@/services/cloudflare'
import telegram from '@/services/telegram'
import { renderCloudInit } from '@/services/cloudInit'

interface ProvisionParams {
    instanceId: string
    planKey: string
    automationTool: 'n8n' | 'activepieces' | 'dify'
    hasOllama: boolean
    hasBackup: boolean
    telegramChatId?: string
    subdomainName?: string
}

interface ProvisionResult {
    serverId: string
    ip: string
    openclawToken: string
    automationPassword: string
    rootPassword: string
    subdomainAgent: string
    subdomainFlows: string
}

const generateToken = () => randomBytes(32).toString('hex')
const generatePassword = () => randomBytes(16).toString('base64url')

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const provisioner = {
    async provision(params: ProvisionParams): Promise<ProvisionResult> {
        const plan = PLANS.find(p => p.key === params.planKey)
        if (!plan) throw new Error(`Unknown plan: ${params.planKey}`)

        const openclawToken = generateToken()
        const automationPassword = generatePassword()
        const rootPassword = generatePassword()

        const name = params.subdomainName || params.instanceId

        const cloudInitScript = renderCloudInit({
            INSTANCE_ID: params.instanceId,
            SUBDOMAIN_NAME: name,
            OPENCLAW_TOKEN: openclawToken,
            AUTOMATION_TOOL: params.automationTool,
            AUTOMATION_PASSWORD: automationPassword,
            ROOT_PASSWORD: rootPassword,
            HAS_OLLAMA: params.hasOllama,
            HAS_BACKUP: params.hasBackup,
        })

        if (params.telegramChatId) {
            await telegram.notifyProvisioning(params.telegramChatId, params.instanceId)
        }

        const provider = getProvider('hetzner')
        const server = await provider.createServer(
            `oc-${params.instanceId}`,
            plan.hetznerType,
            process.env.HETZNER_DATACENTER || 'hel1',
            rootPassword,
            undefined,
            undefined,
            cloudInitScript
        )

        const subdomainAgent = `${name}.clawflow`
        const subdomainFlows = `${name}-flows.clawflow`
        const subdomainObs = `${name}-obs.clawflow`

        await Promise.all([
            cloudflare.createDNSRecord(subdomainAgent, server.ip),
            cloudflare.createDNSRecord(subdomainFlows, server.ip),
            cloudflare.createDNSRecord(subdomainObs, server.ip),
        ])

        return {
            serverId: String(server.serverId),
            ip: server.ip,
            openclawToken,
            automationPassword,
            rootPassword,
            subdomainAgent: `${subdomainAgent}.flowmatic.co.il`,
            subdomainFlows: `${subdomainFlows}.flowmatic.co.il`,
        }
    },

    async deployHealthDaemon(ip: string, instanceId: string, openclawToken: string, password?: string): Promise<void> {
        const { readFileSync } = await import('fs')
        const { resolve } = await import('path')
        const { Client } = await import('ssh2')

        const scriptPath = resolve(process.cwd(), '../../scripts/clawflow-health.sh')
        let script = readFileSync(scriptPath, 'utf-8')
        script = script.replace(/__INSTANCE_ID__/g, instanceId)
        script = script.replace(/__AUTO_HEAL__/g, 'true')
        script = script.replace(/__HEALTH_TOKEN__/g, openclawToken)

        const b64 = Buffer.from(script).toString('base64')

        const sshExec = (cmd: string): Promise<string> => new Promise((resolve, reject) => {
            const conn = new Client()
            let out = ''
            conn.on('ready', () => {
                conn.exec(cmd, (err, stream) => {
                    if (err) { conn.end(); return reject(err) }
                    stream.on('data', (d: Buffer) => { out += d.toString() })
                    stream.on('close', () => { conn.end(); resolve(out.trim()) })
                })
            }).on('error', reject)
            const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
            if (password) opts.password = password
            try { opts.privateKey = readFileSync(process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master') } catch {}
            conn.connect(opts)
        })

        await sshExec(`echo '${b64}' | base64 -d > /opt/clawflow-health.sh && chmod +x /opt/clawflow-health.sh && systemctl enable --now clawflow-health.timer 2>/dev/null`)
        console.log(`Health daemon deployed to ${ip}`)
    },

    async pollUntilReady(instanceId: string, serverId: string, subdomainAgent?: string, ip?: string, maxWaitMs: number = 600_000): Promise<boolean> {
        const provider = getProvider('hetzner')
        const start = Date.now()

        while (Date.now() - start < maxWaitMs) {
            const status = await provider.getServer(serverId)
            if (status.status === 'running' && ip) {
                // Check gateway port directly (not Nginx which may respond before gateway is installed)
                try {
                    const res = await fetch(`http://${ip}:3000`, { signal: AbortSignal.timeout(5000) })
                    if (res.ok || res.status === 401) {
                        // 200 or 401 (auth required) means gateway is running
                        return true
                    }
                } catch {
                    // gateway not ready yet — keep polling
                }
            }
            await sleep(15_000)
        }

        await telegram.alertAdmin(`Instance ${instanceId} failed to become ready within ${maxWaitMs / 1000}s`)
        return false
    },

    async terminate(instanceId: string, serverId: string, subdomainAgent?: string, subdomainFlows?: string): Promise<void> {
        const provider = getProvider('hetzner')
        await provider.deleteServer(serverId)

        // Clean up DNS — use actual subdomains from DB, fallback to pattern
        const agentHost = subdomainAgent
            ? subdomainAgent.replace('.flowmatic.co.il', '')
            : `${instanceId}.clawflow`
        const flowsHost = subdomainFlows
            ? subdomainFlows.replace('.flowmatic.co.il', '')
            : `${instanceId}-flows.clawflow`
        const obsHost = agentHost.replace('.clawflow', '-obs.clawflow')

        const records = await Promise.all([
            cloudflare.findDNSRecord(agentHost).catch(() => null),
            cloudflare.findDNSRecord(flowsHost).catch(() => null),
            cloudflare.findDNSRecord(obsHost).catch(() => null),
        ])

        await Promise.all(
            records.filter(Boolean).map(r => cloudflare.deleteDNSRecord(r!.id))
        )

        console.log(`[provisioner] Terminated ${instanceId}: server ${serverId} deleted, DNS cleaned (${agentHost}, ${flowsHost})`)
    },

    async suspend(serverId: string): Promise<void> {
        const provider = getProvider('hetzner')
        await provider.stopServer(serverId)
    },

    async resume(serverId: string): Promise<void> {
        const provider = getProvider('hetzner')
        await provider.startServer(serverId)
    },
}

export default provisioner
