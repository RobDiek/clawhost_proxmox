import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import { configStore, versionManager, processManager } from '@/main/services'
import { t } from '@openclaw/i18n'

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

            const available = await versionManager.getAvailableVersions()
            const latest = await versionManager.getLatestVersion()

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

            const agentDir = configStore.getAgentDir(agent.name)
            await versionManager.installVersionTo(version, agentDir)

            configStore.updateAgent(id, { version })

            if (processManager.isRunning(id)) {
                await processManager.restartGateway(
                    id,
                    agentDir,
                    agent.port,
                    version,
                    agent.gatewayToken
                )
            }

            return { success: true, version }
        }
    )
}

export default registerAgentVersionHandlers