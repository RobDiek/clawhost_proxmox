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

    ipcMain.handle(
        'getClawHubInstalled',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data?: { agentId?: string }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            try {
                const body = data?.agentId ? { agentId: data.agentId } : {}
                const res = await fetch(
                    `http://localhost:${claw.port}/clawhub/installed`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }
                )
                return await res.json()
            } catch {
                return { skills: [] }
            }
        }
    )

    ipcMain.handle(
        'installClawHubSkill',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: Record<string, unknown>
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const res = await fetch(
                `http://localhost:${claw.port}/clawhub/install`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            )
            return await res.json()
        }
    )

    ipcMain.handle(
        'removeClawHubSkill',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: Record<string, unknown>
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const res = await fetch(
                `http://localhost:${claw.port}/clawhub/remove`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            )
            return await res.json()
        }
    )

    ipcMain.handle(
        'updateClawHubSkill',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data: Record<string, unknown>
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const res = await fetch(
                `http://localhost:${claw.port}/clawhub/update`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            )
            return await res.json()
        }
    )

    ipcMain.handle(
        'checkClawHubUpdates',
        async (
            _event: IpcMainInvokeEvent,
            id: string,
            data?: { agentId?: string }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            try {
                const body = data?.agentId ? { agentId: data.agentId } : {}
                const res = await fetch(
                    `http://localhost:${claw.port}/clawhub/updates`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }
                )
                return await res.json()
            } catch {
                return { updates: [] }
            }
        }
    )
}

export default registerClawVersionHandlers