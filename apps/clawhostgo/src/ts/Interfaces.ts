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
}

interface LocalClawConfig {
    id: string
    name: string
    port: number
    version: string
    gatewayToken: string
    subdomain: string
    password?: string
    createdAt: string
}

interface ConfigFile {
    claws: LocalClawConfig[]
    defaultVersion: string
    portRange: {
        min: number
        max: number
    }
    userName?: string
    createdAt?: string
    setupComplete?: boolean
}

interface CertPaths {
    key: string
    cert: string
    ca: string
}

interface CreateClawData {
    name?: string
    gatewayToken?: string
    password?: string
}

interface RenameClawData {
    name: string
}

interface ReadClawFileData {
    path: string
}

interface UpdateProfileData {
    name?: string
}

interface NpmVersionEntry {
    version: string
    publishedAt: string
    downloads: number
}

interface VersionEntry extends NpmVersionEntry {
    installed: boolean
}

interface AppUpdateInfo {
    hasUpdate: boolean
    currentVersion: string
    latestVersion?: string
    downloadUrl?: string
}

export type {
    ElectronAPI,
    LocalClawConfig,
    ConfigFile,
    CertPaths,
    CreateClawData,
    RenameClawData,
    ReadClawFileData,
    UpdateProfileData,
    NpmVersionEntry,
    VersionEntry,
    AppUpdateInfo
}