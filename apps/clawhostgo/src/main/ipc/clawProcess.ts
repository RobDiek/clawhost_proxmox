import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { clawProvider, clawStatus } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { configStore, processManager } from '@/main/services'

const POST_START_CONFIG_DELAY = 5000

const ensureClawConfig = (clawDir: string): void => {
    const configPath = path.join(clawDir, 'openclaw.json')
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

const schedulePostStartConfigFix = (clawDir: string): void => {
    setTimeout(() => {
        ensureClawConfig(clawDir)
    }, POST_START_CONFIG_DELAY)
}

const registerClawProcessHandlers = (): void => {
    ipcMain.handle(
        'startClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            if (!claw.version) {
                throw new Error(t('go.noVersionInstalled'))
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir)
            try {
                await processManager.startGateway(
                    claw.id,
                    clawDir,
                    claw.port,
                    claw.version,
                    claw.gatewayToken
                )
                schedulePostStartConfigFix(clawDir)
            } catch (err) {
                throw new Error(
                    err instanceof Error
                        ? err.message
                        : t('go.failedToStartClaw')
                )
            }

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.running,
                ip: '127.0.0.1',
                planId: clawProvider.local,
                location: clawProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: claw.subdomain,
                gatewayToken: claw.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: claw.createdAt,
                port: claw.port
            }
        }
    )

    ipcMain.handle(
        'stopClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            await processManager.stopGateway(id)

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.stopped,
                ip: '127.0.0.1',
                planId: clawProvider.local,
                location: clawProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: claw.subdomain,
                gatewayToken: claw.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: claw.createdAt,
                port: claw.port
            }
        }
    )

    ipcMain.handle(
        'restartClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            if (!claw.version) {
                throw new Error(t('go.noVersionAssigned'))
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir)
            await processManager.restartGateway(
                claw.id,
                clawDir,
                claw.port,
                claw.version,
                claw.gatewayToken
            )
            schedulePostStartConfigFix(clawDir)

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.running,
                ip: '127.0.0.1',
                planId: clawProvider.local,
                location: clawProvider.local,
                rootPassword: null,
                hasRootPassword: false,
                sshKeyId: null,
                providerServerId: null,
                subdomain: claw.subdomain,
                gatewayToken: claw.gatewayToken,
                subscriptionStatus: null,
                currentPeriodStart: null,
                currentPeriodEnd: null,
                volumes: [],
                ownerEmail: null,
                deletionScheduledAt: null,
                createdAt: claw.createdAt,
                port: claw.port
            }
        }
    )

    ipcMain.handle(
        'getClawDiagnostics',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const running = processManager.isRunning(id)
            const info = processManager.getProcessInfo(id)

            const service = running
                ? `openclaw-gateway: active (running)\n  PID: ${info?.pid || 'unknown'}`
                : 'openclaw-gateway: inactive (stopped)'

            const port = running
                ? `Port ${claw.port}: listening`
                : `Port ${claw.port}: not listening`

            const memInfo = process.memoryUsage()
            const memory = `Heap Used: ${Math.round(memInfo.heapUsed / 1024 / 1024)}MB / Heap Total: ${Math.round(memInfo.heapTotal / 1024 / 1024)}MB`

            return { service, port, memory }
        }
    )

    ipcMain.handle('getClawLogs', (_event: IpcMainInvokeEvent, id: string) => {
        const claw = configStore.findClaw(id)
        if (!claw) throw new Error(t('go.clawNotFound'))

        const clawDir = configStore.getClawDir(claw.name)
        const logs = processManager.getLogs(clawDir, 100)
        return { logs }
    })

    ipcMain.handle(
        'repairClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            if (!claw.version) {
                throw new Error(t('go.noVersionAssigned'))
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir)
            await processManager.restartGateway(
                claw.id,
                clawDir,
                claw.port,
                claw.version,
                claw.gatewayToken
            )
            schedulePostStartConfigFix(clawDir)

            return { success: true }
        }
    )

    ipcMain.handle(
        'reinstallClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            if (claw.version) {
                const clawDir = configStore.getClawDir(claw.name)
                ensureClawConfig(clawDir)
                await processManager.startGateway(
                    claw.id,
                    clawDir,
                    claw.port,
                    claw.version,
                    claw.gatewayToken
                )
                schedulePostStartConfigFix(clawDir)
            }

            return { success: true }
        }
    )
}

export default registerClawProcessHandlers