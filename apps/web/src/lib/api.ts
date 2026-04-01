import type {
    AffiliateInfo,
    GenerateReferralCodeResponse,
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
    UpdateReferralCodeData,
    UpdateReferralCodeResponse,
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
import { apiPaths as API_PATHS } from '@openclaw/shared'
import STORAGE_KEYS from '@/lib/storageKeys'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const getReferralCode = (): string | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.REFERRAL)
        if (!raw || raw === 'none') return null
        const stored = JSON.parse(raw)
        return stored.code || null
    } catch {
        return null
    }
}

const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const referral = getReferralCode()
        if (referral) headers['X-Referral-Code'] = referral
        return headers
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

const api = {
    sendOtp: (email: string) =>
        publicClient.post<void>(API_PATHS.AUTH.SEND_OTP, { email }),
    verifyOtp: (email: string, code: string) =>
        publicClient.post<VerifyOtpResponse>(API_PATHS.AUTH.VERIFY_OTP, {
            email,
            code
        }),
    resolveCredentialConflict: (data: ResolveCredentialConflictData) =>
        publicClient.post<VerifyOtpResponse>(
            API_PATHS.AUTH.RESOLVE_CONFLICT,
            data
        ),

    getPlans: () => client.get<PlansResponse>(API_PATHS.PLANS.BASE),
    getLocations: () => client.get<Location[]>(API_PATHS.PLANS.LOCATIONS),
    getVolumePricing: () =>
        client.get<VolumePricing>(API_PATHS.PLANS.VOLUME_PRICING),
    getPlanAvailability: () =>
        client.get<PlanAvailability>(API_PATHS.PLANS.AVAILABILITY),

    getClaws: () => client.get<Claw[]>(API_PATHS.CLAWS.BASE),
    getAdminClaws: () => client.get<Claw[]>(API_PATHS.CLAWS.ADMIN),
    getClaw: (id: string, sync?: boolean) =>
        client.get<Claw>(`${API_PATHS.CLAWS.byId(id)}${sync ? '?sync=true' : ''}`),
    syncClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.SYNC(id)),
    createClaw: (data: CreateClawData) =>
        client.post<Claw>(API_PATHS.CLAWS.BASE, data),
    purchaseClaw: (data: PurchaseClawData) =>
        client.post<PurchaseClawResponse>(API_PATHS.CLAWS.PURCHASE, data),
    startClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.START(id)),
    stopClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.STOP(id)),
    restartClaw: (id: string) =>
        client.post<Claw>(API_PATHS.CLAWS.RESTART(id)),
    deleteClaw: (id: string) =>
        client.delete<DeleteClawResponse>(API_PATHS.CLAWS.byId(id)),
    renameClaw: (id: string, data: RenameClawData) =>
        client.patch<Claw>(API_PATHS.CLAWS.byId(id), data),
    updateClawSubdomain: (id: string, data: UpdateClawSubdomainData) =>
        client.patch<Claw>(API_PATHS.CLAWS.SUBDOMAIN(id), data),
    cancelDeletion: (id: string) =>
        client.post<Claw>(API_PATHS.CLAWS.CANCEL_DELETION(id)),
    hardDeleteClaw: (id: string) =>
        client.post<void>(API_PATHS.CLAWS.HARD_DELETE(id)),
    cancelPendingClaw: (id: string) =>
        client.delete<void>(API_PATHS.CLAWS.PENDING(id)),
    getClawDiagnostics: (id: string) =>
        client.post<DiagnosticsStatusResponse>(
            API_PATHS.CLAWS.DIAGNOSTICS.STATUS(id)
        ),
    getClawLogs: (id: string) =>
        client.post<DiagnosticsLogsResponse>(
            API_PATHS.CLAWS.DIAGNOSTICS.LOGS(id)
        ),
    repairClaw: (id: string) =>
        client.post<void>(API_PATHS.CLAWS.DIAGNOSTICS.REPAIR(id)),
    reinstallClaw: (id: string) =>
        client.post<void>(API_PATHS.CLAWS.REINSTALL(id)),
    getClawCredentials: (id: string) =>
        client.get<ClawCredentialsResponse>(API_PATHS.CLAWS.CREDENTIALS(id)),
    getClawVersion: (id: string) =>
        client.post<ClawVersionResponse>(API_PATHS.CLAWS.VERSION(id)),
    getClawVersions: (id: string) =>
        client.post<ClawVersionsResponse>(API_PATHS.CLAWS.VERSIONS(id)),
    installClawVersion: (id: string, version: string) =>
        client.post<InstallClawVersionResponse>(
            API_PATHS.CLAWS.INSTALL_VERSION(id),
            { version }
        ),
    getClawAgents: (id: string) =>
        client.post<ClawAgentsResponse>(API_PATHS.CLAWS.AGENTS.BASE(id)),
    getClawAgentConfig: (id: string, agentId: string) =>
        client.post<AgentConfigResponse>(API_PATHS.CLAWS.AGENTS.CONFIG(id), {
            agentId
        }),
    updateClawAgentConfig: (id: string, data: UpdateAgentConfigData) =>
        client.put<void>(API_PATHS.CLAWS.AGENTS.CONFIG(id), data),
    createClawAgent: (id: string, data: CreateAgentData) =>
        client.post<CreateAgentResponse>(
            API_PATHS.CLAWS.AGENTS.CREATE(id),
            data
        ),
    deleteClawAgent: (id: string, data: DeleteAgentData) =>
        client.post<void>(API_PATHS.CLAWS.AGENTS.DELETE(id), data),
    getClawChannels: (id: string) =>
        client.post<ClawChannelsResponse>(API_PATHS.CLAWS.CHANNELS.BASE(id)),
    updateClawChannels: (id: string, data: UpdateClawChannelsData) =>
        client.put<void>(API_PATHS.CLAWS.CHANNELS.BASE(id), data),
    pairWhatsApp: (id: string, force?: boolean) =>
        client.post<WhatsAppPairResponse>(
            `${API_PATHS.CLAWS.CHANNELS.WHATSAPP_PAIR(id)}${force ? '?force=true' : ''}`
        ),
    pairWhatsAppStatus: (id: string) =>
        client.post<WhatsAppPairStatusResponse>(
            API_PATHS.CLAWS.CHANNELS.WHATSAPP_PAIR_STATUS(id)
        ),
    getClawBindings: (id: string) =>
        client.post<ClawBindingsResponse>(API_PATHS.CLAWS.BINDINGS(id)),
    updateClawBindings: (id: string, data: UpdateClawBindingsData) =>
        client.put<void>(API_PATHS.CLAWS.BINDINGS(id), data),
    getClawSkills: (id: string) =>
        client.post<ClawSkillsResponse>(API_PATHS.CLAWS.SKILLS(id)),
    updateClawSkills: (id: string, data: UpdateClawSkillsData) =>
        client.put<void>(API_PATHS.CLAWS.SKILLS(id), data),
    getAgentSkills: (clawId: string, agentId: string) =>
        client.post<GetAgentSkillsResponse>(
            API_PATHS.CLAWS.AGENTS.SKILLS(clawId, agentId),
            { agentId }
        ),
    updateAgentSkills: (
        clawId: string,
        agentId: string,
        data: UpdateAgentSkillsData
    ) =>
        client.put<void>(
            API_PATHS.CLAWS.AGENTS.SKILLS(clawId, agentId),
            data
        ),
    browseClawHubSkills: (clawId: string, params: BrowseClawHubData) => {
        const qs = new URLSearchParams()
        if (params.query) qs.set('query', params.query)
        if (params.limit) qs.set('limit', String(params.limit))
        if (params.cursor) qs.set('cursor', params.cursor)
        if (params.agentId) qs.set('agentId', params.agentId)
        const str = qs.toString()
        return client.get<ClawHubBrowseResponse>(
            `${API_PATHS.CLAWS.CLAWHUB.SKILLS(clawId)}${str ? `?${str}` : ''}`
        )
    },
    getClawHubInstalled: (clawId: string, agentId?: string) =>
        client.post<ClawHubInstalledResponse>(
            API_PATHS.CLAWS.CLAWHUB.INSTALLED(clawId),
            agentId ? { agentId } : {}
        ),
    installClawHubSkill: (clawId: string, data: ClawHubSkillActionData) =>
        client.post<void>(API_PATHS.CLAWS.CLAWHUB.INSTALL(clawId), data),
    removeClawHubSkill: (clawId: string, data: ClawHubSkillActionData) =>
        client.post<void>(API_PATHS.CLAWS.CLAWHUB.REMOVE(clawId), data),
    updateClawHubSkill: (clawId: string, data: ClawHubUpdateData) =>
        client.post<void>(API_PATHS.CLAWS.CLAWHUB.UPDATE(clawId), data),
    checkClawHubUpdates: (clawId: string, agentId?: string) =>
        client.post<ClawHubUpdatesResponse>(
            API_PATHS.CLAWS.CLAWHUB.UPDATES(clawId),
            agentId ? { agentId } : {}
        ),
    getClawEnvVars: (id: string) =>
        client.get<ClawEnvVarsResponse>(API_PATHS.CLAWS.ENV(id)),
    updateClawEnvVars: (id: string, data: UpdateClawEnvVarsData) =>
        client.put<void>(API_PATHS.CLAWS.ENV(id), data),
    exportClaw: async (id: string, filename: string) => {
        const token = await getCachedToken()
        const res = await fetch(`${BASE_URL}${API_PATHS.CLAWS.EXPORT(id)}`, {
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
        client.post<ClawFilesResponse>(API_PATHS.CLAWS.FILES.BASE(id)),
    readClawFile: (id: string, path: string) =>
        client.post<ReadClawFileResponse>(API_PATHS.CLAWS.FILES.READ(id), {
            path
        }),
    updateClawFile: (id: string, data: UpdateClawFileData) =>
        client.put<void>(API_PATHS.CLAWS.FILES.BASE(id), data),

    getAffiliate: () => client.get<AffiliateInfo>(API_PATHS.AFFILIATE.BASE),
    generateReferralCode: () =>
        client.post<GenerateReferralCodeResponse>(
            API_PATHS.AFFILIATE.GENERATE
        ),
    updateReferralCode: (data: UpdateReferralCodeData) =>
        client.put<UpdateReferralCodeResponse>(
            API_PATHS.AFFILIATE.CODE,
            data
        ),

    getSSHKeys: () => client.get<SSHKey[]>(API_PATHS.SSH_KEYS.BASE),
    createSSHKey: (data: CreateSSHKeyData) =>
        client.post<SSHKey>(API_PATHS.SSH_KEYS.BASE, data),
    deleteSSHKey: (id: string) =>
        client.delete<void>(API_PATHS.SSH_KEYS.byId(id)),

    getProfile: () => client.get<UserProfile>(API_PATHS.USERS.ME),
    updateProfile: (data: UpdateProfileData) =>
        client.put<UserProfile>(API_PATHS.USERS.ME, data),
    connectAuthMethod: (method: string) =>
        client.post<void>(API_PATHS.USERS.AUTH_METHOD(method)),
    disconnectAuthMethod: (method: string) =>
        client.delete<void>(API_PATHS.USERS.AUTH_METHOD(method)),
    getUserStats: () => client.get<UserStats>(API_PATHS.USERS.STATS),
    getBillingHistory: (page: number = 1, limit: number = 10) =>
        client.get<BillingHistoryResponse>(
            `${API_PATHS.USERS.BILLING}?page=${page}&limit=${limit}`
        ),
    getOrderInvoice: (orderId: string) =>
        client.get<BillingInvoiceResponse>(
            API_PATHS.USERS.ORDER_INVOICE(orderId)
        ),
    getCustomerPortal: () =>
        client.post<CustomerPortalResponse>(API_PATHS.USERS.BILLING_PORTAL),
    purchaseLicense: () =>
        client.post<LicenseCheckoutResponse>(
            API_PATHS.USERS.LICENSE_CHECKOUT
        ),

    joinWaitlist: (email: string) =>
        publicClient.post<JoinWaitlistResponse>(API_PATHS.WAITLIST.BASE, {
            email
        }),
    checkWaitlistStatus: (email: string) =>
        publicClient.get<WaitlistStatusResponse>(
            `${API_PATHS.WAITLIST.STATUS}?email=${encodeURIComponent(email)}`
        )
}

export default api