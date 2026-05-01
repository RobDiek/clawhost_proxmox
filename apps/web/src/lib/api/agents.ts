import type {
    Agent,
    AgentStarsResponse,
    BillingHistoryResponse,
    CheckSubdomainResponse,
    AgentCredentialsResponse,
    AgentFilesResponse,
    AgentMetricsResponse,
    AgentOverviewResponse,
    AgentVersionResponse,
    AgentVersionsResponse,
    CreateLocalAgentData,
    DeleteAgentResponse,
    DiagnosticsLogsResponse,
    DiagnosticsStatusResponse,
    EnablePreviewResponse,
    InstallAgentVersionResponse,
    PurchaseAgentData,
    PurchaseAgentResponse,
    ReadAgentFileResponse,
    RenameAgentData,
    UpdateAgentFileData,
    UpdateAgentSubdomainData
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { getCachedToken } from '@/lib/firebase'
import { client, BASE_URL } from '@/lib/api/client'
import getReferralHeaders from '@/lib/api/getReferralHeaders'

const agents = {
    getAgents: () => client.get<Agent[]>(API_PATHS.CLAWS.BASE),
    getAgentStars: () => client.get<AgentStarsResponse>(API_PATHS.CLAWS.STARS),
    getAdminAgents: () => client.get<Agent[]>(API_PATHS.CLAWS.ADMIN),
    getAgent: (id: string, sync?: boolean) =>
        client.get<Agent>(
            `${API_PATHS.CLAWS.byId(id)}${sync ? '?sync=true' : ''}`
        ),
    syncAgent: (id: string) => client.post<Agent>(API_PATHS.CLAWS.SYNC(id)),
    createAgent: (_data: CreateLocalAgentData): Promise<Agent> => {
        throw new Error('createAgent is only available in the desktop app')
    },
    purchaseAgent: (data: PurchaseAgentData) =>
        client.post<PurchaseAgentResponse>(API_PATHS.CLAWS.PURCHASE, data, {
            headers: getReferralHeaders()
        }),
    startAgent: (id: string) => client.post<Agent>(API_PATHS.CLAWS.START(id)),
    stopAgent: (id: string) => client.post<Agent>(API_PATHS.CLAWS.STOP(id)),
    restartAgent: (id: string) =>
        client.post<Agent>(API_PATHS.CLAWS.RESTART(id)),
    deleteAgent: (id: string, signal?: AbortSignal) =>
        client.delete<DeleteAgentResponse>(API_PATHS.CLAWS.byId(id), {
            signal
        }),
    renameAgent: (id: string, data: RenameAgentData, signal?: AbortSignal) =>
        client.patch<Agent>(API_PATHS.CLAWS.byId(id), data, { signal }),
    updateAgentEmoji: (
        id: string,
        emoji: string | null,
        emojiColor: string | null,
        signal?: AbortSignal
    ) =>
        client.patch<Agent>(
            API_PATHS.CLAWS.EMOJI(id),
            { emoji, emojiColor },
            { signal }
        ),
    updateAgentSubdomain: (
        id: string,
        data: UpdateAgentSubdomainData,
        signal?: AbortSignal
    ) => client.patch<Agent>(API_PATHS.CLAWS.SUBDOMAIN(id), data, { signal }),
    checkSubdomain: (subdomain: string) =>
        client.get<CheckSubdomainResponse>(
            `${API_PATHS.CLAWS.CHECK_SUBDOMAIN}?subdomain=${encodeURIComponent(subdomain)}`
        ),
    cancelDeletion: (id: string, signal?: AbortSignal) =>
        client.post<Agent>(API_PATHS.CLAWS.CANCEL_DELETION(id), undefined, {
            signal
        }),
    hardDeleteAgent: (id: string, signal?: AbortSignal) =>
        client.post<void>(API_PATHS.CLAWS.HARD_DELETE(id), undefined, {
            signal
        }),
    cancelPendingAgent: (id: string) =>
        client.delete<void>(API_PATHS.CLAWS.PENDING(id)),
    getAgentDiagnostics: (id: string) =>
        client.post<DiagnosticsStatusResponse>(
            API_PATHS.CLAWS.DIAGNOSTICS.STATUS(id)
        ),
    getAgentLogs: (id: string) =>
        client.post<DiagnosticsLogsResponse>(
            API_PATHS.CLAWS.DIAGNOSTICS.LOGS(id)
        ),
    repairAgent: (id: string) =>
        client.post<void>(API_PATHS.CLAWS.DIAGNOSTICS.REPAIR(id)),
    reinstallAgent: (id: string, signal?: AbortSignal) =>
        client.post<void>(API_PATHS.CLAWS.REINSTALL(id), undefined, { signal }),
    getAgentCredentials: (id: string) =>
        client.get<AgentCredentialsResponse>(API_PATHS.CLAWS.CREDENTIALS(id)),
    getAgentBilling: (id: string, page: number = 1, limit: number = 100) =>
        client.get<BillingHistoryResponse>(
            `${API_PATHS.CLAWS.BILLING(id)}?page=${page}&limit=${limit}`
        ),
    getAgentVersion: (id: string) =>
        client.post<AgentVersionResponse>(API_PATHS.CLAWS.VERSION(id)),
    getAgentVersions: (id: string) =>
        client.post<AgentVersionsResponse>(API_PATHS.CLAWS.VERSIONS(id)),
    installAgentVersion: (id: string, version: string, signal?: AbortSignal) =>
        client.post<InstallAgentVersionResponse>(
            API_PATHS.CLAWS.INSTALL_VERSION(id),
            { version },
            { signal }
        ),
    exportAgent: async (id: string, filename: string, signal?: AbortSignal) => {
        const token = await getCachedToken()
        const res = await fetch(`${BASE_URL}${API_PATHS.CLAWS.EXPORT(id)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal
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
    listAgentFiles: (id: string) =>
        client.post<AgentFilesResponse>(API_PATHS.CLAWS.FILES.BASE(id)),
    readAgentFile: (id: string, path: string) =>
        client.post<ReadAgentFileResponse>(API_PATHS.CLAWS.FILES.READ(id), {
            path
        }),
    updateAgentFile: (
        id: string,
        data: UpdateAgentFileData,
        signal?: AbortSignal
    ) => client.put<void>(API_PATHS.CLAWS.FILES.BASE(id), data, { signal }),
    getAgentMetrics: (id: string) =>
        client.post<AgentMetricsResponse>(API_PATHS.CLAWS.METRICS(id)),
    getAgentOverview: (id: string) =>
        client.post<AgentOverviewResponse>(API_PATHS.CLAWS.OVERVIEW(id)),
    checkPreview: (id: string) =>
        client.post<EnablePreviewResponse>(
            `${API_PATHS.CLAWS.ENABLE_PREVIEW(id)}?check=true`
        ),
    enablePreview: (id: string, signal?: AbortSignal) =>
        client.post<EnablePreviewResponse>(
            API_PATHS.CLAWS.ENABLE_PREVIEW(id),
            undefined,
            { signal }
        ),
    rotatePassword: (id: string, password?: string, signal?: AbortSignal) =>
        client.post<void>(
            API_PATHS.CLAWS.ROTATE_PASSWORD(id),
            password ? { password } : {},
            { signal }
        ),
    rotateGatewayToken: (id: string, token?: string, signal?: AbortSignal) =>
        client.post<void>(
            API_PATHS.CLAWS.ROTATE_GATEWAY_TOKEN(id),
            token ? { token } : {},
            { signal }
        ),
    updateAgentSSHKey: (
        id: string,
        sshKeyId: string | null,
        signal?: AbortSignal
    ) =>
        client.patch<void>(
            API_PATHS.CLAWS.SSH_KEY(id),
            { sshKeyId },
            { signal }
        )
}

export default agents