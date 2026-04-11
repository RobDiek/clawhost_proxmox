import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { isFeatureSupported } from '@openclaw/shared'
import { configStore, processManager } from '@/main/services'
import { t } from '@openclaw/i18n'

const assertFeatureSupported = (
    version: string | null,
    feature: string
): void => {
    if (!version || !isFeatureSupported(version, feature)) {
        throw new Error(
            t('api.featureVersionUnsupported', {
                version: version || 'unknown'
            })
        )
    }
}

const readOpenclawConfig = (clawDir: string): Record<string, unknown> => {
    const configPath = path.join(clawDir, 'openclaw.json')
    if (!fs.existsSync(configPath)) return {}
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

const writeOpenclawConfig = (
    clawDir: string,
    config: Record<string, unknown>
): void => {
    const configPath = path.join(clawDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4))
}

const parseEnvFile = (envPath: string): Record<string, string> => {
    if (!fs.existsSync(envPath)) return {}
    const content = fs.readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue
        env[trimmed.slice(0, eqIndex).trim()] = trimmed
            .slice(eqIndex + 1)
            .trim()
    }
    return env
}

const serializeEnvFile = (env: Record<string, string>): string => {
    return Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
}

const restartGatewayIfRunning = async (clawId: string): Promise<void> => {
    if (!processManager.isRunning(clawId)) return
    const claw = configStore.findClaw(clawId)
    if (!claw || !claw.version) return
    const clawDir = configStore.getClawDir(claw.name)
    await processManager.restartGateway(
        claw.id,
        clawDir,
        claw.port,
        claw.version,
        claw.gatewayToken
    )
}

const registerClawConfigHandlers = (): void => {
    ipcMain.handle(
        'getClawAgents',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            const config = readOpenclawConfig(clawDir)
            const agents = (config.agents as Record<string, unknown>) || {}
            let list = (agents.list || []) as Array<Record<string, unknown>>

            if (list.length === 0) {
                const agentsDir = path.join(clawDir, 'agents')
                if (fs.existsSync(agentsDir)) {
                    const dirs = fs
                        .readdirSync(agentsDir)
                        .filter((name) =>
                            fs
                                .statSync(path.join(agentsDir, name))
                                .isDirectory()
                        )
                    if (dirs.length > 0) {
                        list = dirs.map((name) => ({ id: name, name }))
                        config.agents = { ...agents, list }
                        writeOpenclawConfig(clawDir, config)
                    }
                }
            }

            const mapped = list.map((agent) => ({
                id: agent.id || agent.name,
                name: agent.name || agent.id,
                model:
                    agent.model ||
                    (agents.defaults as Record<string, unknown>)?.model ||
                    null,
                status: processManager.isRunning(id) ? 'running' : 'idle',
                directory: agent.workspace || agent.directory || null
            }))

            return {
                agents: mapped,
                reachable: processManager.isRunning(id)
            }
        }
    )

    ipcMain.handle(
        'createClawAgent',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: {
                name: string
                model?: string
                envVars?: Record<string, string>
            }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))
            assertFeatureSupported(claw.version, 'agents')

            const nameRegex = /^[a-zA-Z0-9-]+$/
            if (!data.name || !nameRegex.test(data.name)) {
                throw new Error(t('go.invalidAgentName'))
            }

            const clawDir = configStore.getClawDir(claw.name)
            const config = readOpenclawConfig(clawDir)
            const agents = (config.agents as Record<string, unknown>) || {}
            const list = (
                (agents.list || []) as Array<Record<string, unknown>>
            ).slice()

            const duplicate = list.find(
                (a) =>
                    String(a.name || a.id).toLowerCase() ===
                    data.name.toLowerCase()
            )
            if (duplicate) throw new Error(t('go.agentNameAlreadyExists'))

            const agentId = `${data.name.toLowerCase()}-${Date.now()}`
            const newAgent = {
                id: agentId,
                name: data.name,
                model: data.model || null
            }
            list.push(newAgent)

            config.agents = { ...agents, list }
            writeOpenclawConfig(clawDir, config)

            if (data.envVars && Object.keys(data.envVars).length > 0) {
                const envPath = path.join(clawDir, '.env')
                const existing = parseEnvFile(envPath)
                for (const [key, value] of Object.entries(data.envVars)) {
                    if (value === '') {
                        delete existing[key]
                    } else {
                        existing[key] = value
                    }
                }
                fs.writeFileSync(envPath, serializeEnvFile(existing))
            }

            const agentDir = path.join(clawDir, 'agents', agentId, 'agent')
            fs.mkdirSync(agentDir, { recursive: true })

            await restartGatewayIfRunning(id)

            return {
                agent: {
                    id: agentId,
                    name: data.name,
                    model: data.model || null,
                    status: processManager.isRunning(id) ? 'running' : 'idle',
                    directory: null
                }
            }
        }
    )

    ipcMain.handle(
        'deleteClawAgent',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: { agentId: string }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))
            assertFeatureSupported(claw.version, 'agents')

            const clawDir = configStore.getClawDir(claw.name)
            const config = readOpenclawConfig(clawDir)
            const agents = (config.agents as Record<string, unknown>) || {}
            const list = (
                (agents.list || []) as Array<Record<string, unknown>>
            ).slice()

            config.agents = {
                ...agents,
                list: list.filter(
                    (a) => String(a.id || a.name) !== data.agentId
                )
            }
            writeOpenclawConfig(clawDir, config)

            await restartGatewayIfRunning(id)
            return { success: true }
        }
    )

    ipcMain.handle(
        'getClawEnvVars',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            const envPath = path.join(clawDir, '.env')
            const vars = parseEnvFile(envPath)
            return { envVars: vars }
        }
    )

    ipcMain.handle(
        'updateClawEnvVars',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: { envVars: Record<string, string> }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            const envPath = path.join(clawDir, '.env')
            const existing = parseEnvFile(envPath)

            for (const [key, value] of Object.entries(data.envVars)) {
                if (value === '') {
                    delete existing[key]
                } else {
                    existing[key] = value
                }
            }

            fs.writeFileSync(envPath, serializeEnvFile(existing))

            await restartGatewayIfRunning(id)
            return { success: true }
        }
    )
}

export default registerClawConfigHandlers