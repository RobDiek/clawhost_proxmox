import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { clawProvider, clawStatus } from '@openclaw/shared'
import { configStore, processManager } from '@/main/services'

const ensureClawConfig = (clawDir: string, subdomain: string): void => {
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
        const expectedOrigins = [
            `https://${subdomain}.clawhost`,
            `http://${subdomain}.clawhost`,
            'http://localhost:*'
        ]
        const current = config.gateway.controlUi.allowedOrigins
        if (!current || JSON.stringify(current) !== JSON.stringify(expectedOrigins)) {
            config.gateway.controlUi.allowedOrigins = expectedOrigins
            changed = true
        }
        if (changed) {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
        }
    } catch {}
}

const getDeviceIp = (): string => {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address
            }
        }
    }
    return '127.0.0.1'
}

const registerClawProcessHandlers = (): void => {
    ipcMain.handle(
        'startClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            if (!claw.version) {
                throw new Error(
                    'No OpenClaw version installed. Go to the Versions tab and install one first.'
                )
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir, claw.subdomain)
            try {
                await processManager.startGateway(
                    claw.id,
                    clawDir,
                    claw.port,
                    claw.version,
                    claw.gatewayToken
                )
            } catch (err) {
                throw new Error(
                    err instanceof Error ? err.message : 'Failed to start claw.'
                )
            }

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.running,
                ip: getDeviceIp(),
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
            if (!claw) throw new Error('Claw not found')

            await processManager.stopGateway(id)

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.stopped,
                ip: getDeviceIp(),
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
            if (!claw) throw new Error('Claw not found')

            if (!claw.version) {
                throw new Error('No OpenClaw version assigned to this claw.')
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir, claw.subdomain)
            await processManager.restartGateway(
                claw.id,
                clawDir,
                claw.port,
                claw.version,
                claw.gatewayToken
            )

            return {
                id: claw.id,
                name: claw.name,
                provider: clawProvider.local,
                status: clawStatus.running,
                ip: getDeviceIp(),
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
            if (!claw) throw new Error('Claw not found')

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
        if (!claw) throw new Error('Claw not found')

        const clawDir = configStore.getClawDir(claw.name)
        const logs = processManager.getLogs(clawDir, 100)
        return { logs }
    })

    ipcMain.handle(
        'repairClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            if (!claw.version) {
                throw new Error('No OpenClaw version assigned.')
            }

            const clawDir = configStore.getClawDir(claw.name)
            ensureClawConfig(clawDir, claw.subdomain)
            await processManager.restartGateway(
                claw.id,
                clawDir,
                claw.port,
                claw.version,
                claw.gatewayToken
            )

            return { success: true }
        }
    )

    ipcMain.handle(
        'reinstallClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            if (claw.version) {
                const clawDir = configStore.getClawDir(claw.name)
                ensureClawConfig(clawDir, claw.subdomain)
                await processManager.startGateway(
                    claw.id,
                    clawDir,
                    claw.port,
                    claw.version,
                    claw.gatewayToken
                )
            }

            return { success: true }
        }
    )
}

export default registerClawProcessHandlers