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

interface LocalAgentConfig {
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
    agents: LocalAgentConfig[]
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

interface CreateAgentData {
    name?: string
    gatewayToken?: string
    password?: string
}

interface RenameAgentData {
    name: string
}

interface ReadAgentFileData {
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
    LocalAgentConfig,
    ConfigFile,
    CertPaths,
    CreateAgentData,
    RenameAgentData,
    ReadAgentFileData,
    UpdateProfileData,
    NpmVersionEntry,
    VersionEntry,
    AppUpdateInfo
}