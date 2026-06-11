import { randomBytes } from 'crypto'
import { PLANS } from '@openclaw/shared'
import getProvider from '@/services/provider/getProvider'
import cloudflare from '@/services/cloudflare'
import telegram from '@/services/telegram'
import { renderCloudInit } from '@/services/cloudInit'

interface ProvisionParams {
    instanceId: string
    planKey: string
    automationTool: 'activepieces'
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

        const subdomainAgent = `${name}`
        const subdomainFlows = `${name}-flows`
        const subdomainObs = `${name}-obs`

        // Phase 4.3-O H5: partial-state alert. If DNS create fails AFTER the VPS
        // is already paid+created, user is stuck in half-state (paid but no URL).
        // Telegram admin alert lets ops intervene immediately. Full rollback
        // (delete VPS + reverse charge) is a separate iteration.
        try {
            await Promise.all([
                cloudflare.createDNSRecord(subdomainAgent, server.ip),
                cloudflare.createDNSRecord(subdomainFlows, server.ip),
                cloudflare.createDNSRecord(subdomainObs, server.ip),
            ])
        } catch (dnsErr) {
            console.error(`[provisioner] DNS creation FAILED after VPS ${server.serverId} created. Partial state — manual cleanup needed. Error: ${(dnsErr as Error).message}`)
            // Best-effort admin alert. Non-blocking — re-throw original error so
            // the caller knows provisioning failed.
            try {
                const telegram = (await import('./telegram')).default
                await telegram.alertAdmin(
                    `🚨 PARTIAL PROVISIONING — VPS ${server.serverId} (ip=${server.ip}) created but DNS failed.\n` +
                    `Subdomains: ${subdomainAgent}, ${subdomainFlows}, ${subdomainObs}\n` +
                    `Error: ${(dnsErr as Error).message}\n` +
                    `Manual cleanup: (1) delete VPS via Hetzner, (2) check Cloudflare for partial records, (3) reverse AllPay charge.`
                )
            } catch { /* alert is best-effort */ }
            throw dnsErr
        }

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

    async pollUntilReady(instanceId: string, serverId: string, subdomainAgent?: string, ip?: string, maxWaitMs: number = 1_200_000): Promise<boolean> {
        const provider = getProvider('hetzner')
        const start = Date.now()

        while (Date.now() - start < maxWaitMs) {
            const status = await provider.getServer(serverId)
            if (status.status === 'running' && subdomainAgent) {
                // The gateway binds to loopback only (nginx proxies it), so the
                // public IP:3000 is NEVER reachable from here — probing it always
                // failed → every provision fired a false "failed to become ready"
                // alert. Probe the agent subdomain over HTTPS instead: 200/302/301/
                // 401 means DNS + SSL + nginx + gateway are all up (302 = the
                // gateway's redirect to the dashboard).
                try {
                    const res = await fetch(`https://${subdomainAgent}/`, {
                        signal: AbortSignal.timeout(8000),
                        redirect: 'manual',
                    })
                    if (res.ok || res.status === 301 || res.status === 302 || res.status === 401) {
                        return true
                    }
                } catch {
                    // DNS/SSL/gateway still coming up — keep polling
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
        // Insert "-obs" after the first label so it works for the real subdomain
        // (flow → flow-obs) AND the legacy fallback (abc123.clawflow → abc123-obs.clawflow).
        // The old `.replace('.clawflow', …)` was a no-op for flowmatic.co.il subdomains
        // → the obs record was never matched and left dangling on the recycled IP.
        const obsHost = agentHost.replace(/^([^.]+)/, '$1-obs')

        // Phase 4.3-O M11: log DNS lookup failures explicitly. Previously
        // `.catch(() => null)` silently treated transient Cloudflare API errors
        // (5xx, rate-limits) as "no record exists" → DNS records left dangling
        // forever, pointing at recycled IPs. Now we log + alert admin so the
        // record can be manually cleaned.
        const hosts = [agentHost, flowsHost, obsHost]
        const records = await Promise.all(hosts.map(async (h, i) => {
            try {
                return await cloudflare.findDNSRecord(h)
            } catch (err) {
                console.error(`[provisioner] DNS lookup failed for ${h} (instance ${instanceId}, idx=${i}): ${(err as Error).message}. Record may be dangling — verify manually.`)
                // Best-effort admin alert (non-blocking, never throws)
                try {
                    const telegram = (await import('./telegram')).default
                    await telegram.alertAdmin(`⚠ DNS cleanup failed for ${h} during terminate of ${instanceId} — manual check needed in Cloudflare`)
                } catch { /* alert is best-effort */ }
                return null
            }
        }))

        const recordsToDelete = records.filter(Boolean) as Array<{ id: string }>
        await Promise.all(
            recordsToDelete.map(async r => {
                try {
                    await cloudflare.deleteDNSRecord(r.id)
                } catch (err) {
                    console.error(`[provisioner] DNS delete failed for record ${r.id} (instance ${instanceId}): ${(err as Error).message}`)
                }
            })
        )

        console.log(`[provisioner] Terminated ${instanceId}: server ${serverId} deleted, DNS cleaned (${agentHost}, ${flowsHost}, ${obsHost}) — ${recordsToDelete.length}/${hosts.length} records removed`)
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