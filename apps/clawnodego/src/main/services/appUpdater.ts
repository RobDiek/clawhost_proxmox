import type { AppUpdateInfo } from '@/ts/Interfaces'

import { autoUpdater, BrowserWindow, app } from 'electron'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'

let pendingUpdate: AppUpdateInfo | null = null

const start = (): void => {
    if (!app.isPackaged) return

    updateElectronApp({
        updateSource: {
            type: UpdateSourceType.StaticStorage,
            baseUrl: 'https://cdn.clawnode.cloud/go/${platform}/${arch}'
        },
        updateInterval: '1 hour',
        notifyUser: false
    })

    autoUpdater.on(
        'update-downloaded',
        (_event, _releaseNotes, releaseName) => {
            pendingUpdate = {
                hasUpdate: true,
                currentVersion: app.getVersion(),
                latestVersion: releaseName
            }
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send('update-downloaded', pendingUpdate)
            }
        }
    )
}

const getPendingUpdate = (): AppUpdateInfo => {
    if (pendingUpdate) return pendingUpdate
    return { hasUpdate: false, currentVersion: app.getVersion() }
}

const quitAndInstall = (): void => {
    autoUpdater.quitAndInstall()
}

const appUpdater = { start, getPendingUpdate, quitAndInstall }

export default appUpdater