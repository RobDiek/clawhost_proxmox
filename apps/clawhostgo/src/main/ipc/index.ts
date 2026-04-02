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
import { t } from '@openclaw/i18n'

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
    ipcMain.handle(
        'oauth-window',
        (
            _event: unknown,
            url: string,
            callbackPrefix: string,
            title: string
        ) => {
            return new Promise((resolve, reject) => {
                const win = new BrowserWindow({
                    width: 500,
                    height: 700,
                    title,
                    autoHideMenuBar: true
                })

                let resolved = false

                const tryResolve = (navUrl: string) => {
                    if (resolved || !navUrl.startsWith(callbackPrefix)) return
                    resolved = true
                    const parsed = new URL(navUrl)
                    const hashParams = new URLSearchParams(parsed.hash.slice(1))
                    const queryParams = parsed.searchParams
                    resolve({
                        accessToken:
                            hashParams.get('access_token') ||
                            queryParams.get('access_token'),
                        idToken:
                            hashParams.get('id_token') ||
                            queryParams.get('id_token'),
                        code: queryParams.get('code')
                    })
                    setImmediate(() => win.close())
                }

                win.webContents.on('did-navigate', () => {
                    const pageUrl = win.webContents.getURL()
                    try {
                        const host = new URL(pageUrl).host
                        win.setTitle(`${host} — ${title}`)
                    } catch {}
                    tryResolve(pageUrl)
                })

                win.webContents.on('will-redirect', (_e, redirectUrl) => {
                    tryResolve(redirectUrl)
                })

                win.webContents.on('will-navigate', (_e, navUrl) => {
                    tryResolve(navUrl)
                })

                win.webContents.on('did-finish-load', async () => {
                    try {
                        const currentUrl: string =
                            await win.webContents.executeJavaScript(
                                'location.href'
                            )
                        tryResolve(currentUrl)
                    } catch {}
                })

                win.on('closed', () => {
                    if (!resolved) reject(new Error(t('go.oauthCancelled')))
                })

                win.loadURL(url)
            })
        }
    )

    ipcMain.handle(
        'oauth-github-exchange',
        async (_event: unknown, code: string) => {
            const response = await net.fetch(
                'https://github.com/login/oauth/access_token',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: process.env.GITHUB_CLIENT_ID,
                        client_secret: process.env.GITHUB_CLIENT_SECRET,
                        code
                    })
                }
            )
            const data = (await response.json()) as Record<string, string>
            return { accessToken: data.access_token }
        }
    )

    registerClawHandlers()
    registerClawProcessHandlers()
    registerClawConfigHandlers()
    registerClawFileHandlers()
    registerClawVersionHandlers()
    registerStubHandlers()
    registerClawTerminalHandlers()
}

export { registerAllHandlers }