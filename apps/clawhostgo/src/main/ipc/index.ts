import { ipcMain, app, BrowserWindow, net } from 'electron'
import { execFile } from 'child_process'
import registerClawHandlers from '@/main/ipc/claws'
import registerClawProcessHandlers from '@/main/ipc/clawProcess'
import registerClawConfigHandlers from '@/main/ipc/clawConfig'
import registerClawFileHandlers from '@/main/ipc/clawFiles'
import registerClawVersionHandlers from '@/main/ipc/clawVersions'
import registerStubHandlers from '@/main/ipc/stubs'
import registerClawTerminalHandlers from '@/main/ipc/clawTerminal'
import { appUpdater, dnsResolver } from '@/main/services'

const registerAllHandlers = (): void => {
    ipcMain.handle('get-app-version', () => app.getVersion())
    ipcMain.handle('get-platform', () => process.platform)
    ipcMain.handle('open-external', (_event: unknown, url: string) => {
        execFile('open', [url])
    })
    ipcMain.handle('open-windowed', (_event: unknown, url: string) => {
        const win = new BrowserWindow({
            width: 1280,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        })
        win.setMenuBarVisibility(false)
        win.loadURL(url)
    })
    ipcMain.handle('checkNetwork', async () => {
        const PING_URL = 'https://clients3.google.com/generate_204'
        const LATENCY_THRESHOLD = 3000

        if (!net.isOnline()) return 'offline'

        try {
            const start = Date.now()
            const response = await net.fetch(PING_URL, { cache: 'no-store' })
            const latency = Date.now() - start
            if (!response.ok && response.status !== 204) return 'unstable'
            return latency > LATENCY_THRESHOLD ? 'unstable' : 'online'
        } catch {
            return 'unstable'
        }
    })
    ipcMain.handle('getDnsStatus', () => dnsResolver.isDnsSetup())
    ipcMain.handle('setupDns', () => dnsResolver.setupResolver())
    ipcMain.handle('check-app-update', () => appUpdater.checkForUpdate())
    registerClawHandlers()
    registerClawProcessHandlers()
    registerClawConfigHandlers()
    registerClawFileHandlers()
    registerClawVersionHandlers()
    registerStubHandlers()
    registerClawTerminalHandlers()
}

export default registerAllHandlers