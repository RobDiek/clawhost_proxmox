import { randomBytes } from 'crypto'
import { PLANS } from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import cloudflare from '@/services/cloudflare'
import telegram from '@/services/telegram'
import { renderCloudInit } from '@/services/cloudInit'

interface ProvisionParams {
    instanceId: string
    planKey: string
    automationTool: 'n8n' | 'activepieces'
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

        const subdomainAgent = `${name}.openclaw`
        const subdomainFlows = `${name}-flows.openclaw`

        await Promise.all([
            cloudflare.createDNSRecord(subdomainAgent, server.ip),
            cloudflare.createDNSRecord(subdomainFlows, server.ip),
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

    async terminate(instanceId: string, serverId: string): Promise<void> {
        const provider = getProvider('hetzner')
        await provider.deleteServer(serverId)

        const subdomainAgent = `agent.${instanceId}.openclaw`
        const subdomainFlows = `flows.${instanceId}.openclaw`

        const [agentRecord, flowsRecord] = await Promise.all([
            cloudflare.findDNSRecord(subdomainAgent),
            cloudflare.findDNSRecord(subdomainFlows),
        ])

        await Promise.all([
            agentRecord ? cloudflare.deleteDNSRecord(agentRecord.id) : Promise.resolve(),
            flowsRecord ? cloudflare.deleteDNSRecord(flowsRecord.id) : Promise.resolve(),
        ])
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
