/**
 * Instance Health Monitor — checks all running instances every 5 minutes.
 * Detects down instances, attempts auto-restart, notifies user + admin.
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import telegram from './telegram'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

// Track consecutive failures per instance
const failCount = new Map<string, number>()
const MAX_FAILS_BEFORE_ALERT = 2 // Alert after 2 consecutive failures (10 min)
const MAX_FAILS_BEFORE_RESTART = 3 // Auto-restart after 3 consecutive failures (15 min)

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, 10000)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 8000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { /* key not available */ }
        conn.connect(opts)
    })
}

interface HealthResult {
    instanceId: string
    healthy: boolean
    sshReachable: boolean
    gatewayActive: boolean
    dockerRunning: boolean
    error?: string
}

async function checkInstance(instance: {
    id: string
    ip: string
    rootPassword: string | null
    telegramChatId: string | null
}): Promise<HealthResult> {
    const result: HealthResult = {
        instanceId: instance.id,
        healthy: false,
        sshReachable: false,
        gatewayActive: false,
        dockerRunning: false,
    }

    try {
        // IMPORTANT: use `;` not `&&` — otherwise a non-zero exit from
        // `systemctl is-active` (e.g. during 'activating' state) skips
        // subsequent checks and produces false negatives.
        const output = await sshExec(
            instance.ip,
            `echo "SSH_OK" ; echo "GATEWAY:$(systemctl is-active openclaw-gateway 2>/dev/null || echo missing)" ; echo "DOCKER:$(docker ps -q 2>/dev/null | wc -l)"`,
            instance.rootPassword || undefined
        )

        result.sshReachable = output.includes('SSH_OK')

        // Accept 'active' OR 'activating' (transient post-restart state).
        // 'reloading' also counts. Anything else = down.
        const gwMatch = output.match(/GATEWAY:(\S+)/)
        const gwState = gwMatch ? gwMatch[1].trim() : ''
        result.gatewayActive = ['active', 'activating', 'reloading'].includes(gwState)

        const dockerMatch = output.match(/DOCKER:(\d+)/)
        result.dockerRunning = dockerMatch ? parseInt(dockerMatch[1]) > 0 : false

        // Healthy = SSH + (gateway active OR activating). Docker status is
        // informational (not required for healthy — openclaw-gateway is the
        // primary signal; Docker can run but gateway is still primary).
        result.healthy = result.sshReachable && result.gatewayActive

        // Debug context for alert messages
        if (!result.healthy && gwState && gwState !== 'active') {
            result.error = `gateway_state=${gwState}`
        }

    } catch (err) {
        result.error = (err as Error).message
    }

    return result
}

async function handleFailure(instance: {
    id: string
    ip: string
    rootPassword: string | null
    telegramChatId: string | null
}, health: HealthResult) {
    const fails = (failCount.get(instance.id) || 0) + 1
    failCount.set(instance.id, fails)

    console.log(`Instance ${instance.id} health check failed (${fails}x): ssh=${health.sshReachable} gw=${health.gatewayActive} docker=${health.dockerRunning}`)

    // Auto-restart after 3 failures (if SSH is reachable)
    if (fails >= MAX_FAILS_BEFORE_RESTART && health.sshReachable) {
        console.log(`Auto-restarting openclaw-gateway on ${instance.id}...`)
        try {
            await sshExec(instance.ip, 'systemctl restart openclaw-gateway', instance.rootPassword || undefined)
            await telegram.alertAdmin(
                `🔄 Auto-restart: Instance ${instance.id}\n` +
                `Gateway was down, restarted automatically.`
            )
        } catch (err) {
            await telegram.alertAdmin(
                `❌ Auto-restart FAILED: Instance ${instance.id}\n` +
                `Error: ${(err as Error).message}`
            )
        }
        failCount.set(instance.id, 0) // Reset after restart attempt
        return
    }

    // Alert after 2 failures
    if (fails === MAX_FAILS_BEFORE_ALERT) {
        // Notify user
        if (instance.telegramChatId) {
            await telegram.notifyInstanceDown(instance.telegramChatId, instance.id)
        }

        // Alert admin
        await telegram.alertAdmin(
            `🔴 Instance DOWN: ${instance.id} (${instance.ip})\n` +
            `SSH: ${health.sshReachable ? '✓' : '✗'} | Gateway: ${health.gatewayActive ? '✓' : '✗'} | Docker: ${health.dockerRunning ? '✓' : '✗'}` +
            (health.error ? `\nError: ${health.error}` : '') +
            `\nWill auto-restart on next check if SSH reachable.`
        )
    }
}

async function checkAllInstances() {
    try {
        const allInstances = await db.select({
            id: instances.id,
            ip: instances.ip,
            rootPassword: instances.rootPassword,
            status: instances.status,
            telegramChatId: instances.telegramChatId,
        }).from(instances).where(eq(instances.status, 'running'))

        for (const inst of allInstances) {
            if (!inst.ip) continue

            const health = await checkInstance(inst as { id: string; ip: string; rootPassword: string | null; telegramChatId: string | null })

            if (health.healthy) {
                // Reset failure counter on success
                if (failCount.has(inst.id)) {
                    const prevFails = failCount.get(inst.id) || 0
                    if (prevFails >= MAX_FAILS_BEFORE_ALERT) {
                        // Instance recovered — notify admin
                        await telegram.alertAdmin(`✅ Instance ${inst.id} recovered (was down for ${prevFails} checks)`)
                    }
                    failCount.delete(inst.id)
                }
            } else {
                await handleFailure(inst as { id: string; ip: string; rootPassword: string | null; telegramChatId: string | null }, health)
            }
        }
    } catch (err) {
        console.error('Instance monitor error:', err)
    }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null

export function startInstanceMonitor() {
    console.log('  Instance health monitor started (every 5min)')
    // First check after 3 minutes
    setTimeout(() => {
        checkAllInstances()
        monitorInterval = setInterval(checkAllInstances, CHECK_INTERVAL)
    }, 3 * 60 * 1000)
}

export function stopInstanceMonitor() {
    if (monitorInterval) clearInterval(monitorInterval)
}
