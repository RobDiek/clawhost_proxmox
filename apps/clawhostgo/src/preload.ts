import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel: string, ...args: unknown[]) =>
        ipcRenderer.invoke(channel, ...args),
    isDesktop: true,
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
    openWindowed: (url: string) => ipcRenderer.invoke('open-windowed', url),
    checkNetwork: () =>
        ipcRenderer.invoke('checkNetwork') as Promise<
            'online' | 'unstable' | 'offline'
        >,
    getDnsStatus: () => ipcRenderer.invoke('getDnsStatus'),
    setupDns: () => ipcRenderer.invoke('setupDns'),
    onTerminalData: (callback: (id: string, data: string) => void) => {
        const listener = (
            _event: Electron.IpcRendererEvent,
            id: string,
            data: string
        ) => callback(id, data)
        ipcRenderer.on('terminal:data', listener)
        return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onTerminalExit: (callback: (id: string) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, id: string) =>
            callback(id)
        ipcRenderer.on('terminal:exit', listener)
        return () => ipcRenderer.removeListener('terminal:exit', listener)
    },
    checkAppUpdate: () => ipcRenderer.invoke('check-app-update')
})