import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { agentProvider, agentStatus } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { configStore, processManager } from '@/main/services'

const POST_START_CONFIG_DELAY = 5000

const ensureAgentConfig = (agentDir: string): void => {
    const configPath = path.join(agentDir, 'openclaw.json')
    if (!fs.existsSync(configPath)) return
    try {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        let changed = false
        if (!config.gateway) config.gateway = {}
        if (!config.gateway.controlUi) config.gateway.controlUi = {}
        if (!config.gateway.controlUi.dangerouslyDisableDeviceAuth) {
            config.gateway.controlUi.dangerouslyDisableDeviceAuth = true
            config.gateway.controlUi.allowInsecureAuth = true
            changed = true
        }
        const current = config.gateway.controlUi.allowedOrigins
        if (!current || JSON.stringify(current) !== JSON.stringify(['*'])) {
            config.gateway.controlUi.allowedOrigins = ['*']
            changed = true
        }
        if (changed) {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
        }
    } catch {}
}

const schedulePostStartConfigFix = (agentDir: string): void => {
    setTimeout(() => {
        ensureAgentConfig(agentDir)
    }, POST_START_CONFIG_DELAY)
}

const registerAgentProcessHandlers = (): void => {
    ipcMain.handle(
        'startAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (!agent.version) {
                throw new Error(t('go.noVersionInstalled'))
            }

            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir)
            try {
                await processManager.startGateway(
                    agent.id,
                    agentDir,
                    agent.port,
                    agent.version,
                    agent.gatewayToken
                )
                schedulePostStartConfigFix(agentDir)
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : t('go.failedToStartClaw')
                )
            }

            return {
                id: agent.id,
                name: agent.name,
                provider: agentProvider.local,
                status: agentStatus.running,
                ip: '127.0.0.1',
                planId: agentProvider.local,
                location: agentProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: agent.subdomain,
                gatewayToken: agent.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: agent.createdAt,
                port: agent.port
            }
        }
    )

    ipcMain.handle(
        'stopAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            await processManager.stopGateway(id)

            return {
                id: agent.id,
                name: agent.name,
                provider: agentProvider.local,
                status: agentStatus.stopped,
                ip: '127.0.0.1',
                planId: agentProvider.local,
                location: agentProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: agent.subdomain,
                gatewayToken: agent.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: agent.createdAt,
                port: agent.port
            }
        }
    )

    ipcMain.handle(
        'restartAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (!agent.version) {
                throw new Error(t('go.noVersionAssigned'))
            }

            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir)
            await processManager.restartGateway(
                agent.id,
                agentDir,
                agent.port,
                agent.version,
                agent.gatewayToken
            )
            schedulePostStartConfigFix(agentDir)

            return {
                id: agent.id,
                name: agent.name,
                provider: agentProvider.local,
                status: agentStatus.running,
                ip: '127.0.0.1',
                planId: agentProvider.local,
                location: agentProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: agent.subdomain,
                gatewayToken: agent.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: agent.createdAt,
                port: agent.port
            }
        }
    )

    ipcMain.handle(
        'getAgentDiagnostics',
        (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const running = processManager.isRunning(id)
            const info = processManager.getProcessInfo(id)

            const service = running
                ? `openclaw-gateway: active (running)\n  PID: ${info?.pid || 'unknown'}`
                : 'openclaw-gateway: inactive (stopped)'

            const port = running
                ? `Port ${agent.port}: listening`
                : `Port ${agent.port}: not listening`

            const memInfo = process.memoryUsage()
            const memory = `Heap Used: ${Math.round(memInfo.heapUsed / 1024 / 1024)}MB / Heap Total: ${Math.round(memInfo.heapTotal / 1024 / 1024)}MB`

            return { service, port, memory }
        }
    )

    ipcMain.handle('getAgentLogs', (_event: IpcMainInvokeEvent, id: string) => {
        const agent = configStore.findAgent(id)
        if (!agent) throw new Error(t('go.clawNotFound'))

        const agentDir = configStore.getAgentDir(agent.name)
        const logs = processManager.getLogs(agentDir, 100)
        return { logs }
    })

    ipcMain.handle(
        'repairAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (!agent.version) {
                throw new Error(t('go.noVersionAssigned'))
            }

            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir)
            await processManager.restartGateway(
                agent.id,
                agentDir,
                agent.port,
                agent.version,
                agent.gatewayToken
            )
            schedulePostStartConfigFix(agentDir)

            return { success: true }
        }
    )

    ipcMain.handle(
        'reinstallAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            if (agent.version) {
                const agentDir = configStore.getAgentDir(agent.name)
                ensureAgentConfig(agentDir)
                await processManager.startGateway(
                    agent.id,
                    agentDir,
                    agent.port,
                    agent.version,
                    agent.gatewayToken
                )
                schedulePostStartConfigFix(agentDir)
            }

            return { success: true }
        }
    )
}

export default registerAgentProcessHandlers