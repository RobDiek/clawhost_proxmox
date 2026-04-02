import type { IpcMainInvokeEvent } from 'electron'
import type { CreateClawData, RenameClawData } from '@/ts/Interfaces'

import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { clawProvider, clawStatus, OPENCLAW_VERSION } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import {
    configStore,
    processManager,
    versionManager,
    certManager,
    reverseProxy
} from '@/main/services'

const adjectives = [
    'cozy',
    'swift',
    'brave',
    'calm',
    'tiny',
    'wild',
    'warm',
    'cool',
    'happy',
    'lucky',
    'fuzzy',
    'snowy',
    'dusty',
    'misty',
    'sunny',
    'sleepy',
    'clever',
    'gentle',
    'mighty',
    'silent',
    'golden',
    'cosmic',
    'polar',
    'rusty',
    'nimble',
    'jolly',
    'witty',
    'noble',
    'vivid',
    'crisp'
]

const nouns = [
    'claw',
    'panda',
    'otter',
    'fox',
    'wolf',
    'bear',
    'falcon',
    'lynx',
    'raven',
    'crane',
    'pike',
    'owl',
    'hare',
    'frog',
    'moth',
    'finch',
    'cedar',
    'maple',
    'birch',
    'reef',
    'dune',
    'peak',
    'brook',
    'grove',
    'ember',
    'spark',
    'drift',
    'frost',
    'cloud',
    'storm'
]

const generateClawName = (): string => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    return `${adj}-${noun}`
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
            allowedOrigins: ['*']
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

const resolveGatewayToken = (
    claw: NonNullable<ReturnType<typeof configStore.findClaw>>
): string => {
    if (claw.gatewayToken) return claw.gatewayToken
    try {
        const configPath = path.join(
            configStore.getClawDir(claw.name),
            'openclaw.json'
        )
        const raw = fs.readFileSync(configPath, 'utf-8')
        const cfg = JSON.parse(raw)
        const token = cfg?.gateway?.auth?.token
        if (token) {
            configStore.updateClaw(claw.id, { gatewayToken: token })
            return token
        }
    } catch {}
    return ''
}

const mapClawToResponse = (claw: ReturnType<typeof configStore.findClaw>) => {
    if (!claw) return null
    const gatewayToken = resolveGatewayToken(claw)
    return {
        id: claw.id,
        name: claw.name,
        provider: clawProvider.local,
        status: processManager.isRunning(claw.id)
            ? clawStatus.running
            : clawStatus.stopped,
        ip: '127.0.0.1',
        planId: clawProvider.local,
        location: clawProvider.local,
        rootPassword: claw.password || null,
        hasRootPassword: !!claw.password,
        sshKeyId: null,
        providerServerId: null,
        subdomain: claw.subdomain,
        gatewayToken,
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
            const name = data.name || generateClawName()
            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!nameRegex.test(name)) {
                throw new Error(t('go.invalidClawName'))
            }

            const duplicate = config.claws.find(
                (c) => c.name.toLowerCase() === name.toLowerCase()
            )
            if (duplicate) {
                throw new Error(t('go.clawNameAlreadyExists'))
            }

            const version = OPENCLAW_VERSION

            const id = crypto.randomUUID()
            const port = configStore.getNextAvailablePort()
            const gatewayToken =
                data.gatewayToken || crypto.randomBytes(24).toString('hex')
            const subdomain = configStore.generateSlug(id)

            const clawDir = configStore.getClawDir(name)
            fs.mkdirSync(clawDir, { recursive: true })
            fs.mkdirSync(path.join(clawDir, 'agents', 'main', 'agent'), {
                recursive: true
            })

            await versionManager.installVersionTo(version, clawDir)

            const openclawConfig = DEFAULT_OPENCLAW_CONFIG(
                subdomain,
                gatewayToken || undefined
            )
            fs.writeFileSync(
                path.join(clawDir, 'openclaw.json'),
                JSON.stringify(openclawConfig, null, 4)
            )
            fs.writeFileSync(path.join(clawDir, '.env'), '')

            const newClaw = {
                id,
                name,
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
                    setTimeout(() => {
                        const configPath = path.join(clawDir, 'openclaw.json')
                        try {
                            const raw = fs.readFileSync(configPath, 'utf-8')
                            const cfg = JSON.parse(raw)
                            if (!cfg.gateway?.controlUi) return
                            const origins = cfg.gateway.controlUi.allowedOrigins
                            if (
                                JSON.stringify(origins) !==
                                JSON.stringify(['*'])
                            ) {
                                cfg.gateway.controlUi.allowedOrigins = ['*']
                                fs.writeFileSync(
                                    configPath,
                                    JSON.stringify(cfg, null, 4)
                                )
                            }
                        } catch {}
                    }, 5000)
                } catch {}
            }

            return mapClawToResponse(newClaw)
        }
    )

    ipcMain.handle(
        'deleteClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

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
            if (!claw) throw new Error(t('go.clawNotFound'))

            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!data.name || !nameRegex.test(data.name)) {
                throw new Error(t('go.invalidClawName'))
            }

            const config = configStore.readConfig()
            const duplicate = config.claws.find(
                (c) =>
                    c.id !== id &&
                    c.name.toLowerCase() === data.name.toLowerCase()
            )
            if (duplicate) {
                throw new Error(t('go.clawNameAlreadyExists'))
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
            if (!claw) throw new Error(t('go.clawNotFound'))

            const slugRegex = /^[a-z0-9]{3,20}$/
            if (!data.subdomain || !slugRegex.test(data.subdomain)) {
                throw new Error(t('go.invalidSubdomain'))
            }

            const config = configStore.readConfig()
            const duplicate = config.claws.find(
                (c) => c.id !== id && c.subdomain === data.subdomain
            )
            if (duplicate) {
                throw new Error(t('go.subdomainAlreadyInUse'))
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
        if (!claw) throw new Error(t('go.clawNotFound'))
        return mapClawToResponse(claw)
    })

    ipcMain.handle(
        'cancelDeletion',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))
            return mapClawToResponse(claw)
        }
    )

    ipcMain.handle(
        'hardDeleteClaw',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

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
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            if (!fs.existsSync(clawDir))
                throw new Error(t('go.clawDirectoryNotFound'))

            const win = BrowserWindow.getFocusedWindow()
            const result = await dialog.showSaveDialog(win!, {
                defaultPath: filename,
                filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }]
            })

            if (result.canceled || !result.filePath) return

            await new Promise<void>((resolve, reject) => {
                execFile(
                    'tar',
                    [
                        '-czf',
                        result.filePath!,
                        '-C',
                        path.dirname(clawDir),
                        path.basename(clawDir)
                    ],
                    (error) => {
                        if (error) reject(new Error(t('go.exportFailed')))
                        else resolve()
                    }
                )
            })
        }
    )
}

export default registerClawHandlers