import type {
    AgentConfigResponse,
    BillingHistoryResponse,
    ClawEnvVarsResponse,
    BillingInvoiceResponse,
    Claw,
    ClawCredentialsResponse,
    RenameClawData,
    UpdateClawSubdomainData,
    ClawAgentsResponse,
    ClawChannelsResponse,
    ClawFilesResponse,
    ClawSkillsResponse,
    ClawVersionResponse,
    ClawVersionsResponse,
    InstallClawVersionResponse,
    CreateClawData,
    CreateSSHKeyData,
    CustomerPortalResponse,
    DeleteClawResponse,
    DiagnosticsLogsResponse,
    DiagnosticsStatusResponse,
    GetAgentSkillsResponse,
    JoinWaitlistResponse,
    Location,
    PlansResponse,
    PlanAvailability,
    PurchaseClawData,
    PurchaseClawResponse,
    ReadClawFileResponse,
    ResolveCredentialConflictData,
    SSHKey,
    CreateAgentData,
    CreateAgentResponse,
    DeleteAgentData,
    UpdateAgentConfigData,
    UpdateAgentSkillsData,
    UpdateClawChannelsData,
    WaitlistStatusResponse,
    WhatsAppPairResponse,
    WhatsAppPairStatusResponse,
    BrowseClawHubData,
    ClawHubSkillActionData,
    ClawHubUpdateData,
    ClawHubBrowseResponse,
    ClawHubInstalledResponse,
    ClawHubUpdatesResponse,
    ClawBindingsResponse,
    UpdateClawBindingsData,
    UpdateClawEnvVarsData,
    UpdateClawFileData,
    UpdateClawSkillsData,
    LicenseCheckoutResponse,
    UpdateProfileData,
    UserProfile,
    UserStats,
    VerifyOtpResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { RequestClient } from '@openclaw/shared'
import { signOut } from 'firebase/auth'
import { auth, clearTokenCache, getCachedToken } from '@/lib/firebase'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
    },
    onUnauthorized: async (): Promise<void> => {
        clearTokenCache()
        const token = await getCachedToken(true)
        if (!token) {
            await signOut(auth)
        }
    }
})

const publicClient = new RequestClient({
    baseUrl: BASE_URL
})

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

    getPlans: (provider?: string) =>
        client.get<PlansResponse>(
            `/plans${provider ? `?provider=${provider}` : ''}`
        ),
    getLocations: (provider?: string) =>
        client.get<Location[]>(
            `/plans/locations${provider ? `?provider=${provider}` : ''}`
        ),
    getVolumePricing: (provider?: string) =>
        client.get<VolumePricing>(
            `/plans/volume-pricing${provider ? `?provider=${provider}` : ''}`
        ),
    getPlanAvailability: (provider?: string) =>
        client.get<PlanAvailability>(
            `/plans/availability${provider ? `?provider=${provider}` : ''}`
        ),

    getClaws: () => client.get<Claw[]>('/claws'),
    getAdminClaws: () => client.get<Claw[]>('/claws/admin'),
    getClaw: (id: string, sync?: boolean) =>
        client.get<Claw>(`/claws/${id}${sync ? '?sync=true' : ''}`),
    syncClaw: (id: string) => client.post<Claw>(`/claws/${id}/sync`),
    createClaw: (data: CreateClawData) => client.post<Claw>('/claws', data),
    purchaseClaw: (data: PurchaseClawData) =>
        client.post<PurchaseClawResponse>('/claws/purchase', data),
    startClaw: (id: string) => client.post<Claw>(`/claws/${id}/start`),
    stopClaw: (id: string) => client.post<Claw>(`/claws/${id}/stop`),
    restartClaw: (id: string) => client.post<Claw>(`/claws/${id}/restart`),
    deleteClaw: (id: string) =>
        client.delete<DeleteClawResponse>(`/claws/${id}`),
    renameClaw: (id: string, data: RenameClawData) =>
        client.patch<Claw>(`/claws/${id}`, data),
    updateClawSubdomain: (id: string, data: UpdateClawSubdomainData) =>
        client.patch<Claw>(`/claws/${id}/subdomain`, data),
    cancelDeletion: (id: string) =>
        client.post<Claw>(`/claws/${id}/cancel-deletion`),
    hardDeleteClaw: (id: string) =>
        client.post<void>(`/claws/${id}/hard-delete`),
    cancelPendingClaw: (id: string) =>
        client.delete<void>(`/claws/pending/${id}`),
    getClawDiagnostics: (id: string) =>
        client.post<DiagnosticsStatusResponse>(
            `/claws/${id}/diagnostics/status`
        ),
    getClawLogs: (id: string) =>
        client.post<DiagnosticsLogsResponse>(`/claws/${id}/diagnostics/logs`),
    repairClaw: (id: string) =>
        client.post<void>(`/claws/${id}/diagnostics/repair`),
    reinstallClaw: (id: string) => client.post<void>(`/claws/${id}/reinstall`),
    getClawCredentials: (id: string) =>
        client.get<ClawCredentialsResponse>(`/claws/${id}/credentials`),
    getClawVersion: (id: string) =>
        client.post<ClawVersionResponse>(`/claws/${id}/version`),
    getClawVersions: (id: string) =>
        client.post<ClawVersionsResponse>(`/claws/${id}/versions`),
    installClawVersion: (id: string, version: string) =>
        client.post<InstallClawVersionResponse>(
            `/claws/${id}/install-version`,
            { version }
        ),
    getClawAgents: (id: string) =>
        client.post<ClawAgentsResponse>(`/claws/${id}/agents`),
    getClawAgentConfig: (id: string, agentId: string) =>
        client.post<AgentConfigResponse>(`/claws/${id}/agent-config`, {
            agentId
        }),
    updateClawAgentConfig: (id: string, data: UpdateAgentConfigData) =>
        client.put<void>(`/claws/${id}/agent-config`, data),
    createClawAgent: (id: string, data: CreateAgentData) =>
        client.post<CreateAgentResponse>(`/claws/${id}/agents/create`, data),
    deleteClawAgent: (id: string, data: DeleteAgentData) =>
        client.post<void>(`/claws/${id}/agents/delete`, data),
    getClawChannels: (id: string) =>
        client.post<ClawChannelsResponse>(`/claws/${id}/channels`),
    updateClawChannels: (id: string, data: UpdateClawChannelsData) =>
        client.put<void>(`/claws/${id}/channels`, data),
    pairWhatsApp: (id: string, force?: boolean) =>
        client.post<WhatsAppPairResponse>(
            `/claws/${id}/channels/whatsapp/pair${force ? '?force=true' : ''}`
        ),
    pairWhatsAppStatus: (id: string) =>
        client.post<WhatsAppPairStatusResponse>(
            `/claws/${id}/channels/whatsapp/pair-status`
        ),
    getClawBindings: (id: string) =>
        client.post<ClawBindingsResponse>(`/claws/${id}/bindings`),
    updateClawBindings: (id: string, data: UpdateClawBindingsData) =>
        client.put<void>(`/claws/${id}/bindings`, data),
    getClawSkills: (id: string) =>
        client.post<ClawSkillsResponse>(`/claws/${id}/skills`),
    updateClawSkills: (id: string, data: UpdateClawSkillsData) =>
        client.put<void>(`/claws/${id}/skills`, data),
    getAgentSkills: (clawId: string, agentId: string) =>
        client.post<GetAgentSkillsResponse>(
            `/claws/${clawId}/agents/${agentId}/skills`,
            { agentId }
        ),
    updateAgentSkills: (
        clawId: string,
        agentId: string,
        data: UpdateAgentSkillsData
    ) => client.put<void>(`/claws/${clawId}/agents/${agentId}/skills`, data),
    browseClawHubSkills: (clawId: string, params: BrowseClawHubData) => {
        const qs = new URLSearchParams()
        if (params.query) qs.set('query', params.query)
        if (params.limit) qs.set('limit', String(params.limit))
        if (params.cursor) qs.set('cursor', params.cursor)
        if (params.agentId) qs.set('agentId', params.agentId)
        const str = qs.toString()
        return client.get<ClawHubBrowseResponse>(
            `/claws/${clawId}/clawhub/skills${str ? `?${str}` : ''}`
        )
    },
    getClawHubInstalled: (clawId: string, agentId?: string) =>
        client.post<ClawHubInstalledResponse>(
            `/claws/${clawId}/clawhub/installed`,
            agentId ? { agentId } : {}
        ),
    installClawHubSkill: (clawId: string, data: ClawHubSkillActionData) =>
        client.post<void>(`/claws/${clawId}/clawhub/install`, data),
    removeClawHubSkill: (clawId: string, data: ClawHubSkillActionData) =>
        client.post<void>(`/claws/${clawId}/clawhub/remove`, data),
    updateClawHubSkill: (clawId: string, data: ClawHubUpdateData) =>
        client.post<void>(`/claws/${clawId}/clawhub/update`, data),
    checkClawHubUpdates: (clawId: string, agentId?: string) =>
        client.post<ClawHubUpdatesResponse>(
            `/claws/${clawId}/clawhub/updates`,
            agentId ? { agentId } : {}
        ),
    getClawEnvVars: (id: string) =>
        client.get<ClawEnvVarsResponse>(`/claws/${id}/env`),
    updateClawEnvVars: (id: string, data: UpdateClawEnvVarsData) =>
        client.put<void>(`/claws/${id}/env`, data),
    exportClaw: async (id: string, filename: string) => {
        const token = await getCachedToken()
        const res = await fetch(`${BASE_URL}/claws/${id}/export`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        if (!res.ok) {
            if (res.status === 429) {
                const body = await res.json()
                const error = new Error(body?.message ?? 'Export rate limited')
                ;(error as Error & { retryAfter: number }).retryAfter =
                    body?.data?.retryAfter ?? 0
                throw error
            }
            throw new Error('Export failed')
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    },
    listClawFiles: (id: string) =>
        client.post<ClawFilesResponse>(`/claws/${id}/files`),
    readClawFile: (id: string, path: string) =>
        client.post<ReadClawFileResponse>(`/claws/${id}/files/read`, { path }),
    updateClawFile: (id: string, data: UpdateClawFileData) =>
        client.put<void>(`/claws/${id}/files`, data),

    getSSHKeys: () => client.get<SSHKey[]>('/ssh-keys'),
    createSSHKey: (data: CreateSSHKeyData) =>
        client.post<SSHKey>('/ssh-keys', data),
    deleteSSHKey: (id: string) => client.delete<void>(`/ssh-keys/${id}`),

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
        client.post<CustomerPortalResponse>('/users/me/billing/portal'),
    purchaseLicense: () =>
        client.post<LicenseCheckoutResponse>('/users/me/license/checkout'),

    joinWaitlist: (email: string) =>
        publicClient.post<JoinWaitlistResponse>('/waitlist', { email }),
    checkWaitlistStatus: (email: string) =>
        publicClient.get<WaitlistStatusResponse>(
            `/waitlist/status?email=${encodeURIComponent(email)}`
        )
}

export default api