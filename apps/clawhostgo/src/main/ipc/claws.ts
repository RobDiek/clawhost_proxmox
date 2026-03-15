import type { IpcMainInvokeEvent } from 'electron'
import type { CreateClawData, RenameClawData } from '@/ts/Interfaces'

import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { execFile } from 'child_process'
import { clawProvider, clawStatus, OPENCLAW_VERSION } from '@openclaw/shared'
import {
    configStore,
    processManager,
    versionManager,
    certManager,
    reverseProxy
} from '@/main/services'

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

const DEFAULT_OPENCLAW_CONFIG = (subdomain: string, gatewayToken?: string) => ({
    gateway: {
        mode: 'local',
        ...(gatewayToken
            ? {
                auth: {
                    mode: 'token',
                    token: gatewayToken
                }
            }
            : {}),
        controlUi: {
            allowInsecureAuth: true,
            dangerouslyDisableDeviceAuth: true,
            allowedOrigins: [
                `https://${subdomain}.clawhost`,
                `http://${subdomain}.clawhost`,
                'http://localhost:*'
            ]
        },
        trustedProxies: ['127.0.0.1', '::1']
    },
    channels: {
        whatsapp: { dmPolicy: 'open', allowFrom: ['*'] },
        telegram: { dmPolicy: 'open', allowFrom: ['*'] },
        discord: {},
        slack: {},
        signal: { dmPolicy: 'open', allowFrom: ['*'] }
    },
    commands: {
        restart: true,
        bash: true
    },
    agents: {
        defaults: {
            sandbox: { mode: 'off' }
        },
        list: [
            {
                id: 'main',
                name: 'main'
            }
        ]
    }
})

const mapClawToResponse = (claw: ReturnType<typeof configStore.findClaw>) => {
    if (!claw) return null
    return {
        id: claw.id,
        name: claw.name,
        provider: clawProvider.local,
        status: processManager.isRunning(claw.id)
            ? clawStatus.running
            : clawStatus.stopped,
        ip: getDeviceIp(),
        planId: clawProvider.local,
        location: clawProvider.local,
        rootPassword: claw.password || null,
        hasRootPassword: !!claw.password,
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

const registerClawHandlers = (): void => {
    ipcMain.handle('getClaws', () => {
        const config = configStore.readConfig()
        return config.claws.map((claw) => mapClawToResponse(claw))
    })

    ipcMain.handle('getClaw', (_event: IpcMainInvokeEvent, id: string) => {
        const claw = configStore.findClaw(id)
        return mapClawToResponse(claw)
    })

    ipcMain.handle(
        'createClaw',
        async (_event: IpcMainInvokeEvent, data: CreateClawData) => {
            const config = configStore.readConfig()
            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!data.name || !nameRegex.test(data.name)) {
                throw new Error(
                    'Invalid claw name. Use only letters, numbers, and hyphens.'
                )
            }

            const duplicate = config.claws.find(
                (c) => c.name.toLowerCase() === data.name.toLowerCase()
            )
            if (duplicate) {
                throw new Error('A claw with this name already exists.')
            }

            const version = OPENCLAW_VERSION

            const id = crypto.randomUUID()
            const port = configStore.getNextAvailablePort()
            const gatewayToken = data.gatewayToken || ''
            const subdomain = configStore.generateSlug(id)

            const clawDir = configStore.getClawDir(data.name)
            fs.mkdirSync(clawDir, { recursive: true })
            fs.mkdirSync(path.join(clawDir, 'agents', 'main', 'agent'), {
                recursive: true
            })

            await versionManager.installVersionTo(version, clawDir)

            const openclawConfig = DEFAULT_OPENCLAW_CONFIG(subdomain, gatewayToken || undefined)
            fs.writeFileSync(
                path.join(clawDir, 'openclaw.json'),
                JSON.stringify(openclawConfig, null, 4)
            )
            fs.writeFileSync(path.join(clawDir, '.env'), '')

            const newClaw = {
                id,
                name: data.name,
                port,
                version,
                gatewayToken,
                subdomain,
                ...(data.password && { password: data.password }),
                createdAt: new Date().toISOString()
            }

            configStore.addClaw(newClaw)
            try {
                certManager.regenerateServerCert()
                reverseProxy.reloadCerts()
            } catch {}

            if (version) {
                try {
                    await processManager.startGateway(
                        id,
                        clawDir,
                        port,
                        version,
                        gatewayToken
                    )
                } catch {}
            }

            return mapClawToResponse(newClaw)
        }
    )

    ipcMain.handle(
        'deleteClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            const clawDir = configStore.getClawDir(claw.name)
            if (fs.existsSync(clawDir)) {
                fs.rmSync(clawDir, { recursive: true, force: true })
            }

            configStore.removeClaw(id)
            return { success: true }
        }
    )

    ipcMain.handle(
        'renameClaw',
        (_event: IpcMainInvokeEvent, id: string, data: RenameClawData) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!data.name || !nameRegex.test(data.name)) {
                throw new Error(
                    'Invalid claw name. Use only letters, numbers, and hyphens.'
                )
            }

            const config = configStore.readConfig()
            const duplicate = config.claws.find(
                (c) =>
                    c.id !== id &&
                    c.name.toLowerCase() === data.name.toLowerCase()
            )
            if (duplicate) {
                throw new Error('A claw with this name already exists.')
            }

            const oldDir = configStore.getClawDir(claw.name)
            const newDir = configStore.getClawDir(data.name)

            if (fs.existsSync(oldDir)) {
                fs.renameSync(oldDir, newDir)
            }

            configStore.updateClaw(id, { name: data.name })
            const updated = configStore.findClaw(id)
            return mapClawToResponse(updated)
        }
    )

    ipcMain.handle(
        'updateClawSubdomain',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            data: { subdomain: string }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            const slugRegex = /^[a-z0-9]{3,20}$/
            if (!data.subdomain || !slugRegex.test(data.subdomain)) {
                throw new Error(
                    'Invalid subdomain. Use 3-20 lowercase letters and numbers.'
                )
            }

            const config = configStore.readConfig()
            const duplicate = config.claws.find(
                (c) => c.id !== id && c.subdomain === data.subdomain
            )
            if (duplicate) {
                throw new Error('This subdomain is already in use.')
            }

            configStore.updateClaw(id, { subdomain: data.subdomain })
            try {
                certManager.regenerateServerCert()
                reverseProxy.reloadCerts()
            } catch {}
            const updated = configStore.findClaw(id)
            return mapClawToResponse(updated)
        }
    )

    ipcMain.handle('syncClaw', (_event: IpcMainInvokeEvent, id: string) => {
        const claw = configStore.findClaw(id)
        if (!claw) throw new Error('Claw not found')
        return mapClawToResponse(claw)
    })

    ipcMain.handle(
        'cancelDeletion',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')
            return mapClawToResponse(claw)
        }
    )

    ipcMain.handle(
        'hardDeleteClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            const clawDir = configStore.getClawDir(claw.name)
            if (fs.existsSync(clawDir)) {
                fs.rmSync(clawDir, { recursive: true, force: true })
            }

            configStore.removeClaw(id)
            return { success: true }
        }
    )

    ipcMain.handle('getNextAvailablePort', () => {
        return configStore.getNextAvailablePort()
    })

    ipcMain.handle(
        'exportClaw',
        async (_event: IpcMainInvokeEvent, id: string, filename: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error('Claw not found')

            const clawDir = configStore.getClawDir(claw.name)
            if (!fs.existsSync(clawDir)) throw new Error('Claw directory not found')

            const win = BrowserWindow.getFocusedWindow()
            const result = await dialog.showSaveDialog(win!, {
                defaultPath: filename,
                filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }]
            })

            if (result.canceled || !result.filePath) return

            await new Promise<void>((resolve, reject) => {
                execFile(
                    'tar',
                    ['-czf', result.filePath!, '-C', path.dirname(clawDir), path.basename(clawDir)],
                    (error) => {
                        if (error) reject(new Error('Export failed'))
                        else resolve()
                    }
                )
            })
        }
    )
}

export default registerClawHandlers