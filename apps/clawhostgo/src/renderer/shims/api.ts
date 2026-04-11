import type {
    BillingHistoryResponse,
    ClawEnvVarsResponse,
    BillingInvoiceResponse,
    Claw,
    ClawCredentialsResponse,
    RenameClawData,
    UpdateClawSubdomainData,
    ClawAgentsResponse,
    ClawFilesResponse,
    ClawVersionResponse,
    ClawVersionsResponse,
    InstallClawVersionResponse,
    CreateSSHKeyData,
    CustomerPortalResponse,
    DeleteClawResponse,
    DiagnosticsLogsResponse,
    DiagnosticsStatusResponse,
    Location,
    PlansResponse,
    PlanAvailability,
    PurchaseClawResponse,
    ReadClawFileResponse,
    ResolveCredentialConflictData,
    SSHKey,
    CreateAgentData,
    CreateAgentResponse,
    DeleteAgentData,
    UpdateClawEnvVarsData,
    UpdateClawFileData,
    UpdateProfileData,
    UserProfile,
    UserStats,
    VerifyOtpResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { RequestClient } from '@openclaw/shared'
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

    getPlans: (_provider?: string) =>
        invoke('getPlans') as Promise<PlansResponse>,
    getLocations: (_provider?: string) =>
        invoke('getLocations') as Promise<Location[]>,
    getVolumePricing: (_provider?: string) =>
        invoke('getVolumePricing') as Promise<VolumePricing>,
    getPlanAvailability: (_provider?: string) =>
        invoke('getPlanAvailability') as Promise<PlanAvailability>,

    getClaws: () => invoke('getClaws') as Promise<Claw[]>,
    getAdminClaws: () => invoke('getClaws') as Promise<Claw[]>,
    getClaw: (id: string, _sync?: boolean) =>
        invoke('getClaw', id) as Promise<Claw>,
    syncClaw: (id: string) => invoke('syncClaw', id) as Promise<Claw>,
    createClaw: (data: unknown) => invoke('createClaw', data) as Promise<Claw>,
    purchaseClaw: (_data: unknown) =>
        Promise.reject(
            new Error('Purchasing is not available in local mode.')
        ) as Promise<PurchaseClawResponse>,
    startClaw: (id: string) => invoke('startClaw', id) as Promise<Claw>,
    stopClaw: (id: string) => invoke('stopClaw', id) as Promise<Claw>,
    restartClaw: (id: string) => invoke('restartClaw', id) as Promise<Claw>,
    deleteClaw: (id: string) =>
        invoke('deleteClaw', id) as Promise<DeleteClawResponse>,
    renameClaw: (id: string, data: RenameClawData) =>
        invoke('renameClaw', id, data) as Promise<Claw>,
    updateClawSubdomain: (id: string, data: UpdateClawSubdomainData) =>
        invoke('updateClawSubdomain', id, data) as Promise<Claw>,
    cancelDeletion: (id: string) =>
        invoke('cancelDeletion', id) as Promise<Claw>,
    hardDeleteClaw: (id: string) =>
        invoke('hardDeleteClaw', id) as Promise<void>,
    getClawDiagnostics: (id: string) =>
        invoke('getClawDiagnostics', id) as Promise<DiagnosticsStatusResponse>,
    getClawLogs: (id: string) =>
        invoke('getClawLogs', id) as Promise<DiagnosticsLogsResponse>,
    repairClaw: (id: string) => invoke('repairClaw', id) as Promise<void>,
    reinstallClaw: (id: string) => invoke('reinstallClaw', id) as Promise<void>,
    getClawCredentials: (id: string) =>
        invoke('getClawCredentials', id) as Promise<ClawCredentialsResponse>,
    getClawVersion: (id: string) =>
        invoke('getClawVersion', id) as Promise<ClawVersionResponse>,
    getClawVersions: (id: string) =>
        invoke('getClawVersions', id) as Promise<ClawVersionsResponse>,
    installClawVersion: (id: string, version: string) =>
        invoke(
            'installClawVersion',
            id,
            version
        ) as Promise<InstallClawVersionResponse>,
    getClawAgents: (id: string) =>
        invoke('getClawAgents', id) as Promise<ClawAgentsResponse>,
    createClawAgent: (id: string, data: CreateAgentData) =>
        invoke('createClawAgent', id, data) as Promise<CreateAgentResponse>,
    deleteClawAgent: (id: string, data: DeleteAgentData) =>
        invoke('deleteClawAgent', id, data) as Promise<void>,
    getClawEnvVars: (id: string) =>
        invoke('getClawEnvVars', id) as Promise<ClawEnvVarsResponse>,
    updateClawEnvVars: (id: string, data: UpdateClawEnvVarsData) =>
        invoke('updateClawEnvVars', id, data) as Promise<void>,
    exportClaw: async (id: string, filename: string) => {
        await invoke('exportClaw', id, filename)
    },
    listClawFiles: (id: string) =>
        invoke('listClawFiles', id) as Promise<ClawFilesResponse>,
    readClawFile: (id: string, filePath: string) =>
        invoke('readClawFile', id, {
            path: filePath
        }) as Promise<ReadClawFileResponse>,
    updateClawFile: (id: string, data: UpdateClawFileData) =>
        invoke('updateClawFile', id, data) as Promise<void>,

    cancelPendingClaw: (_id: string) => Promise.resolve(),

    purchaseLicense: () =>
        Promise.reject(
            new Error('Purchase from clawhost.cloud/account#license')
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

export default api