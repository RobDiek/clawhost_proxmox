import type { IpcMainInvokeEvent } from 'electron'
import type { CreateAgentData, RenameAgentData } from '@/ts/Interfaces'

import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { agentProvider, agentStatus } from '@openclaw/shared'
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
    'agent',
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

const generateAgentName = (): string => {
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
    agent: NonNullable<ReturnType<typeof configStore.findAgent>>
): string => {
    if (agent.gatewayToken) return agent.gatewayToken
    try {
        const configPath = path.join(
            configStore.getAgentDir(agent.name),
            'openclaw.json'
        )
        const raw = fs.readFileSync(configPath, 'utf-8')
        const cfg = JSON.parse(raw)
        const token = cfg?.gateway?.auth?.token
        if (token) {
            configStore.updateAgent(agent.id, { gatewayToken: token })
            return token
        }
    } catch {}
    return ''
}

const mapAgentToResponse = (
    agent: ReturnType<typeof configStore.findAgent>
) => {
    if (!agent) return null
    const gatewayToken = resolveGatewayToken(agent)
    return {
        id: agent.id,
        name: agent.name,
        provider: agentProvider.local,
        status: processManager.isRunning(agent.id)
            ? agentStatus.running
            : agentStatus.stopped,
        ip: '127.0.0.1',
        planId: agentProvider.local,
        location: agentProvider.local,
        rootPassword: agent.password || null,
        hasRootPassword: !!agent.password,
        sshKeyId: null,
        providerServerId: null,
        subdomain: agent.subdomain,
        gatewayToken,
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

const registerAgentHandlers = (): void => {
    ipcMain.handle('getAgents', () => {
        const config = configStore.readConfig()
        return config.agents.map((agent) => mapAgentToResponse(agent))
    })

    ipcMain.handle('getAgent', (_event: IpcMainInvokeEvent, id: string) => {
        const agent = configStore.findAgent(id)
        return mapAgentToResponse(agent)
    })

    ipcMain.handle(
        'createAgent',
        async (_event: IpcMainInvokeEvent, data: CreateAgentData) => {
            const config = configStore.readConfig()
            const name = data.name || generateAgentName()
            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!nameRegex.test(name)) {
                throw new Error(t('go.invalidAgentName'))
            }

            const duplicate = config.agents.find(
                (c) => c.name.toLowerCase() === name.toLowerCase()
            )
            if (duplicate) {
                throw new Error(t('go.clawNameAlreadyExists'))
            }

            const version = await versionManager.getLatestVersion()
            if (!version) throw new Error(t('go.failedToFetchLatestVersion'))

            const id = crypto.randomUUID()
            const port = configStore.getNextAvailablePort()
            const gatewayToken =
                data.gatewayToken || crypto.randomBytes(24).toString('hex')
            const subdomain = configStore.generateSlug(id)

            const agentDir = configStore.getAgentDir(name)
            fs.mkdirSync(agentDir, { recursive: true })
            fs.mkdirSync(path.join(agentDir, 'agents', 'main', 'agent'), {
                recursive: true
            })

            await versionManager.installVersionTo(version, agentDir)

            const openclawConfig = DEFAULT_OPENCLAW_CONFIG(
                subdomain,
                gatewayToken || undefined
            )
            fs.writeFileSync(
                path.join(agentDir, 'openclaw.json'),
                JSON.stringify(openclawConfig, null, 4)
            )
            fs.writeFileSync(path.join(agentDir, '.env'), '')

            const newAgent = {
                id,
                name,
                port,
                version,
                gatewayToken,
                subdomain,
                ...(data.password && { password: data.password }),
                createdAt: new Date().toISOString()
            }

            configStore.addAgent(newAgent)
            try {
                certManager.regenerateServerCert()
                reverseProxy.reloadCerts()
            } catch {}

            if (version) {
                try {
                    await processManager.startGateway(
                        id,
                        agentDir,
                        port,
                        version,
                        gatewayToken
                    )
                    setTimeout(() => {
                        const configPath = path.join(agentDir, 'openclaw.json')
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

            return mapAgentToResponse(newAgent)
        }
    )

    ipcMain.handle(
        'deleteAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            const agentDir = configStore.getAgentDir(agent.name)
            if (fs.existsSync(agentDir)) {
                fs.rmSync(agentDir, { recursive: true, force: true })
            }

            configStore.removeAgent(id)
            return { success: true }
        }
    )

    ipcMain.handle(
        'renameAgent',
        (_event: IpcMainInvokeEvent, id: string, data: RenameAgentData) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!data.name || !nameRegex.test(data.name)) {
                throw new Error(t('go.invalidAgentName'))
            }

            const config = configStore.readConfig()
            const duplicate = config.agents.find(
                (c) =>
                    c.id !== id &&
                    c.name.toLowerCase() === data.name.toLowerCase()
            )
            if (duplicate) {
                throw new Error(t('go.clawNameAlreadyExists'))
            }

            const oldDir = configStore.getAgentDir(agent.name)
            const newDir = configStore.getAgentDir(data.name)

            if (fs.existsSync(oldDir)) {
                fs.renameSync(oldDir, newDir)
            }

            configStore.updateAgent(id, { name: data.name })
            const updated = configStore.findAgent(id)
            return mapAgentToResponse(updated)
        }
    )

    ipcMain.handle(
        'updateAgentSubdomain',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            data: { subdomain: string }
        ) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const slugRegex = /^[a-z0-9]{3,20}$/
            if (!data.subdomain || !slugRegex.test(data.subdomain)) {
                throw new Error(t('go.invalidSubdomain'))
            }

            const config = configStore.readConfig()
            const duplicate = config.agents.find(
                (c) => c.id !== id && c.subdomain === data.subdomain
            )
            if (duplicate) {
                throw new Error(t('go.subdomainAlreadyInUse'))
            }

            configStore.updateAgent(id, { subdomain: data.subdomain })
            try {
                certManager.regenerateServerCert()
                reverseProxy.reloadCerts()
            } catch {}
            const updated = configStore.findAgent(id)
            return mapAgentToResponse(updated)
        }
    )

    ipcMain.handle('syncAgent', (_event: IpcMainInvokeEvent, id: string) => {
        const agent = configStore.findAgent(id)
        if (!agent) throw new Error(t('go.clawNotFound'))
        return mapAgentToResponse(agent)
    })

    ipcMain.handle(
        'cancelDeletion',
        (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))
            return mapAgentToResponse(agent)
        }
    )

    ipcMain.handle(
        'hardDeleteAgent',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (processManager.isRunning(id)) {
                await processManager.stopGateway(id)
            }

            const agentDir = configStore.getAgentDir(agent.name)
            if (fs.existsSync(agentDir)) {
                fs.rmSync(agentDir, { recursive: true, force: true })
            }

            configStore.removeAgent(id)
            return { success: true }
        }
    )

    ipcMain.handle('getNextAvailablePort', () => {
        return configStore.getNextAvailablePort()
    })

    ipcMain.handle(
        'exportAgent',
        async (_event: IpcMainInvokeEvent, id: string, filename: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const agentDir = configStore.getAgentDir(agent.name)
            if (!fs.existsSync(agentDir))
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
                        path.dirname(agentDir),
                        path.basename(agentDir)
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

export default registerAgentHandlers