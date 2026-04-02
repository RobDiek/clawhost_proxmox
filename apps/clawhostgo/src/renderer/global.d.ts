interface AppUpdateInfo {
    hasUpdate: boolean
    currentVersion: string
    latestVersion?: string
    downloadUrl?: string
}

interface ElectronAPI {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    isDesktop: boolean
    getAppVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    openWindowed: (url: string) => Promise<void>
    checkNetwork: () => Promise<'online' | 'unstable' | 'offline'>
    getDnsStatus: () => Promise<boolean>
    setupDns: () => Promise<boolean>
    onTerminalData: (callback: (id: string, data: string) => void) => () => void
    onTerminalExit: (callback: (id: string) => void) => () => void
    checkAppUpdate: () => Promise<AppUpdateInfo>
}

interface Window {
    electronAPI: ElectronAPI
}