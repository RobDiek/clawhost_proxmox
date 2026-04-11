import type { IpcMainInvokeEvent } from 'electron'

import { ipcMain } from 'electron'
import { OPENCLAW_VERSION } from '@openclaw/shared'
import { configStore, versionManager, processManager } from '@/main/services'
import { t } from '@openclaw/i18n'

const registerClawVersionHandlers = (): void => {
    ipcMain.handle(
        'getClawVersion',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))
            return { version: claw.version || OPENCLAW_VERSION }
        }
    )

    ipcMain.handle(
        'getClawVersions',
        async (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const available = await versionManager.getAvailableVersions()
            const latest = await versionManager.getLatestVersion()

            return {
                versions: available,
                currentVersion: claw.version || null,
                latestVersion: latest
            }
        }
    )

    ipcMain.handle(
        'installClawVersion',
        async (_event: IpcMainInvokeEvent, id: string, version: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            await versionManager.installVersionTo(version, clawDir)

            configStore.updateClaw(id, { version })

            if (processManager.isRunning(id)) {
                await processManager.restartGateway(
                    id,
                    clawDir,
                    claw.port,
                    version,
                    claw.gatewayToken
                )
            }

            return { success: true, version }
        }
    )
}

export default registerClawVersionHandlers