import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { agentProvider, agentStatus, agentType } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { configStore, processManager, agentSpec } from '@/main/services'

const POST_START_CONFIG_DELAY = 5000

const ensureAgentConfig = (
    agentDir: string,
    selectedAgentType: string
): void => {
    const spec = agentSpec.getAgentSpec(selectedAgentType)
    const configPath = path.join(agentDir, spec.configFileName)
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

const schedulePostStartConfigFix = (
    agentDir: string,
    selectedAgentType: string
): void => {
    setTimeout(() => {
        ensureAgentConfig(agentDir, selectedAgentType)
    }, POST_START_CONFIG_DELAY)
}

const resolveAgentType = (
    agent: NonNullable<ReturnType<typeof configStore.findAgent>>
): string => agent.agentType || agentType.OPENCLAW

const buildAgentResponse = (
    agent: NonNullable<ReturnType<typeof configStore.findAgent>>,
    status: string
) => ({
    id: agent.id,
    name: agent.name,
    agentType: resolveAgentType(agent),
    provider: agentProvider.local,
    status,
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
})

const registerAgentProcessHandlers = (): void => {
    ipcMain.handle(
        'startAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (!agent.version) {
                throw new Error(t('go.noVersionInstalled'))
            }

            const selectedAgentType = resolveAgentType(agent)
            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir, selectedAgentType)
            try {
                await processManager.startGateway(
                    agent.id,
                    agentDir,
                    agent.port,
                    agent.version,
                    agent.gatewayToken,
                    selectedAgentType
                )
                schedulePostStartConfigFix(agentDir, selectedAgentType)
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : t('go.failedToStartClaw')
                )
            }

            return buildAgentResponse(agent, agentStatus.running)
        }
    )

    ipcMain.handle(
        'stopAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            await processManager.stopGateway(id)

            return buildAgentResponse(agent, agentStatus.stopped)
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

            const selectedAgentType = resolveAgentType(agent)
            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir, selectedAgentType)
            await processManager.restartGateway(
                agent.id,
                agentDir,
                agent.port,
                agent.version,
                agent.gatewayToken,
                selectedAgentType
            )
            schedulePostStartConfigFix(agentDir, selectedAgentType)

            return buildAgentResponse(agent, agentStatus.running)
        }
    )

    ipcMain.handle(
        'getAgentDiagnostics',
        (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const running = processManager.isRunning(id)
            const info = processManager.getProcessInfo(id)

            const spec = agentSpec.getAgentSpec(resolveAgentType(agent))
            const serviceName = `${spec.binaryName}-gateway`
            const service = running
                ? `${serviceName}: active (running)\n  PID: ${info?.pid || 'unknown'}`
                : `${serviceName}: inactive (stopped)`

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

            const selectedAgentType = resolveAgentType(agent)
            const agentDir = configStore.getAgentDir(agent.name)
            ensureAgentConfig(agentDir, selectedAgentType)
            await processManager.restartGateway(
                agent.id,
                agentDir,
                agent.port,
                agent.version,
                agent.gatewayToken,
                selectedAgentType
            )
            schedulePostStartConfigFix(agentDir, selectedAgentType)

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
                const selectedAgentType = resolveAgentType(agent)
                const agentDir = configStore.getAgentDir(agent.name)
                ensureAgentConfig(agentDir, selectedAgentType)
                await processManager.startGateway(
                    agent.id,
                    agentDir,
                    agent.port,
                    agent.version,
                    agent.gatewayToken,
                    selectedAgentType
                )
                schedulePostStartConfigFix(agentDir, selectedAgentType)
            }

            return { success: true }
        }
    )
}

export default registerAgentProcessHandlers