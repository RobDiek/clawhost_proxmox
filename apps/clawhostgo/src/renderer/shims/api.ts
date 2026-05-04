import type {
    AgentStarsResponse,
    BillingHistoryResponse,
    BillingInvoiceResponse,
    Agent,
    AgentCredentialsResponse,
    RenameAgentData,
    UpdateAgentSubdomainData,
    AgentFilesResponse,
    AgentVersionResponse,
    AgentVersionsResponse,
    InstallAgentVersionResponse,
    CreateSSHKeyData,
    CustomerPortalResponse,
    DeleteAgentResponse,
    DiagnosticsLogsResponse,
    DiagnosticsStatusResponse,
    Location,
    PlanAvailability,
    PurchaseAgentResponse,
    ReadAgentFileResponse,
    ResolveCredentialConflictData,
    SSHKey,
    UpdateAgentFileData,
    UpdateProfileData,
    UserProfile,
    UserStats,
    VerifyOtpResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { RequestClient, PLANS } from '@openclaw/shared'
import { signOut } from 'firebase/auth'
import { auth, clearTokenCache, getCachedToken } from '@/lib/firebase'

const BASE_URL = import.meta.env.VITE_API_URL

const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
    },
    onUnauthorized: async (): Promise<boolean> => {
        clearTokenCache()
        const token = await getCachedToken(true)
        if (!token) {
            await signOut(auth)
            return false
        }
        return true
    }
})

const publicClient = new RequestClient({
    baseUrl: BASE_URL
})

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!window.electronAPI) {
        return Promise.reject(new Error('Electron API not available'))
    }
    return window.electronAPI.invoke(channel, ...args)
}

const unsupportedLocally = <T>(): Promise<T> => {
    const error = new Error('Feature not available in local mode') as Error & {
        code: number
    }
    error.code = 422
    return Promise.reject(error)
}

const api = {
    sendOtp: (email: string) =>
        publicClient.post<void>('/auth/send-otp', { email }),
    verifyOtp: (email: string, code: string) =>
        publicClient.post<VerifyOtpResponse>('/auth/verify-otp', {
            email,
            code
        }),
    resolveCredentialConflict: (data: ResolveCredentialConflictData) =>
        publicClient.post<VerifyOtpResponse>(
            '/auth/resolve-credential-conflict',
            data
        ),

    getPlans: () => Promise.resolve(PLANS),
    getLocations: (_provider?: string) =>
        invoke('getLocations') as Promise<Location[]>,
    getVolumePricing: (_provider?: string) =>
        invoke('getVolumePricing') as Promise<VolumePricing>,
    getPlanAvailability: (_provider?: string) =>
        invoke('getPlanAvailability') as Promise<PlanAvailability>,

    getAgentStars: () => client.get<AgentStarsResponse>('/agents/stars'),
    getAgents: () => invoke('getAgents') as Promise<Agent[]>,
    getAdminAgents: () => invoke('getAgents') as Promise<Agent[]>,
    getAgent: (id: string, _sync?: boolean) =>
        invoke('getAgent', id) as Promise<Agent>,
    syncAgent: (id: string) => invoke('syncAgent', id) as Promise<Agent>,
    createAgent: (data: unknown) =>
        invoke('createAgent', data) as Promise<Agent>,
    purchaseAgent: (_data: unknown) =>
        Promise.reject(
            new Error('Purchasing is not available in local mode.')
        ) as Promise<PurchaseAgentResponse>,
    startAgent: (id: string) => invoke('startAgent', id) as Promise<Agent>,
    stopAgent: (id: string) => invoke('stopAgent', id) as Promise<Agent>,
    restartAgent: (id: string) => invoke('restartAgent', id) as Promise<Agent>,
    deleteAgent: (id: string) =>
        invoke('deleteAgent', id) as Promise<DeleteAgentResponse>,
    renameAgent: (id: string, data: RenameAgentData) =>
        invoke('renameAgent', id, data) as Promise<Agent>,
    updateAgentSubdomain: (id: string, data: UpdateAgentSubdomainData) =>
        invoke('updateAgentSubdomain', id, data) as Promise<Agent>,
    cancelDeletion: (id: string) =>
        invoke('cancelDeletion', id) as Promise<Agent>,
    hardDeleteAgent: (id: string) =>
        invoke('hardDeleteAgent', id) as Promise<void>,
    getAgentDiagnostics: (id: string) =>
        invoke('getAgentDiagnostics', id) as Promise<DiagnosticsStatusResponse>,
    getAgentLogs: (id: string) =>
        invoke('getAgentLogs', id) as Promise<DiagnosticsLogsResponse>,
    repairAgent: (id: string) => invoke('repairAgent', id) as Promise<void>,
    reinstallAgent: (id: string) =>
        invoke('reinstallAgent', id) as Promise<void>,
    getAgentCredentials: (id: string) =>
        invoke('getAgentCredentials', id) as Promise<AgentCredentialsResponse>,
    getAgentVersion: (id: string) =>
        invoke('getAgentVersion', id) as Promise<AgentVersionResponse>,
    getAgentVersions: (id: string) =>
        invoke('getAgentVersions', id) as Promise<AgentVersionsResponse>,
    installAgentVersion: (id: string, version: string) =>
        invoke(
            'installAgentVersion',
            id,
            version
        ) as Promise<InstallAgentVersionResponse>,
    exportAgent: async (id: string, filename: string) => {
        await invoke('exportAgent', id, filename)
    },
    listAgentFiles: (id: string) =>
        invoke('listAgentFiles', id) as Promise<AgentFilesResponse>,
    readAgentFile: (id: string, filePath: string) =>
        invoke('readAgentFile', id, {
            path: filePath
        }) as Promise<ReadAgentFileResponse>,
    updateAgentFile: (id: string, data: UpdateAgentFileData) =>
        invoke('updateAgentFile', id, data) as Promise<void>,

    cancelPendingAgent: (_id: string) => Promise.resolve(),

    getAgentOverview: (_id: string) => unsupportedLocally(),
    getAgentMetrics: (_id: string) => unsupportedLocally(),
    getAgentBilling: (_id: string, _page?: number, _limit?: number) =>
        unsupportedLocally(),
    checkPreview: (_id: string) => unsupportedLocally(),
    enablePreview: (_id: string, _signal?: AbortSignal) => unsupportedLocally(),

    purchaseLicense: () =>
        Promise.reject(
            new Error('Purchase from agenthost.cloud/account#license')
        ),

    getSSHKeys: () => Promise.resolve([] as SSHKey[]),
    createSSHKey: (_data: CreateSSHKeyData) => Promise.resolve({} as SSHKey),
    deleteSSHKey: (_id: string) => Promise.resolve(),

    getProfile: () => client.get<UserProfile>('/users/me'),
    updateProfile: (data: UpdateProfileData) =>
        client.put<UserProfile>('/users/me', data),
    connectAuthMethod: (method: string) =>
        client.post<void>(`/users/me/auth/${method}`),
    disconnectAuthMethod: (method: string) =>
        client.delete<void>(`/users/me/auth/${method}`),
    getUserStats: () => client.get<UserStats>('/users/me/stats'),
    getBillingHistory: (page: number = 1, limit: number = 10) =>
        client.get<BillingHistoryResponse>(
            `/users/me/billing?page=${page}&limit=${limit}`
        ),
    getOrderInvoice: (orderId: string) =>
        client.get<BillingInvoiceResponse>(
            `/users/me/billing/${orderId}/invoice`
        ),
    getCustomerPortal: () =>
        client.post<CustomerPortalResponse>('/users/me/billing/portal')
}

export { api }
export default api