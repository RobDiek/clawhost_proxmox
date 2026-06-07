import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import { agentType } from '@openclaw/shared'
import { configStore, versionManager, processManager } from '@/main/services'
import { t } from '@openclaw/i18n'

const resolveAgentType = (
    agent: NonNullable<ReturnType<typeof configStore.findAgent>>
): string => agent.agentType || agentType.OPENCLAW

const registerAgentVersionHandlers = (): void => {
    ipcMain.handle(
        'getAgentVersion',
        (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))
            return { version: agent.version || null }
        }
    )

    ipcMain.handle(
        'getAgentVersions',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const selectedAgentType = resolveAgentType(agent)
            const available =
                await versionManager.getAvailableVersions(selectedAgentType)
            const latest =
                await versionManager.getLatestVersion(selectedAgentType)

            return {
                versions: available,
                currentVersion: agent.version || null,
                latestVersion: latest
            }
        }
    )

    ipcMain.handle(
        'installAgentVersion',
        async (_event: IpcMainInvokeEvent, id: string, version: string) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            const selectedAgentType = resolveAgentType(agent)
            const agentDir = configStore.getAgentDir(agent.name)
            await versionManager.installVersionTo(
                selectedAgentType,
                version,
                agentDir
            )

            configStore.updateAgent(id, { version })

            if (processManager.isRunning(id)) {
                await processManager.restartGateway(
                    id,
                    agentDir,
                    agent.port,
                    version,
                    agent.gatewayToken,
                    selectedAgentType
                )
            }

            return { success: true, version }
        }
    )
}

export default registerAgentVersionHandlers