import type {
    Claw,
    CheckSubdomainResponse,
    ClawCredentialsResponse,
    ClawFilesResponse,
    ClawVersionResponse,
    ClawVersionsResponse,
    DeleteClawResponse,
    DiagnosticsLogsResponse,
    DiagnosticsStatusResponse,
    InstallClawVersionResponse,
    PurchaseClawData,
    PurchaseClawResponse,
    ReadClawFileResponse,
    RenameClawData,
    UpdateClawFileData,
    UpdateClawSubdomainData
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { getCachedToken } from '@/lib/firebase'
import { client, BASE_URL } from '@/lib/api/client'
import getReferralHeaders from '@/lib/api/getReferralHeaders'

const claws = {
    getClaws: () => client.get<Claw[]>(API_PATHS.CLAWS.BASE),
    getAdminClaws: () => client.get<Claw[]>(API_PATHS.CLAWS.ADMIN),
    getClaw: (id: string, sync?: boolean) =>
        client.get<Claw>(
            `${API_PATHS.CLAWS.byId(id)}${sync ? '?sync=true' : ''}`
        ),
    syncClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.SYNC(id)),
    purchaseClaw: (data: PurchaseClawData) =>
        client.post<PurchaseClawResponse>(API_PATHS.CLAWS.PURCHASE, data, {
            headers: getReferralHeaders()
        }),
    startClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.START(id)),
    stopClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.STOP(id)),
    restartClaw: (id: string) => client.post<Claw>(API_PATHS.CLAWS.RESTART(id)),
    deleteClaw: (id: string) =>
        client.delete<DeleteClawResponse>(API_PATHS.CLAWS.byId(id)),
    renameClaw: (id: string, data: RenameClawData) =>
        client.patch<Claw>(API_PATHS.CLAWS.byId(id), data),
    updateClawSubdomain: (id: string, data: UpdateClawSubdomainData) =>
        client.patch<Claw>(API_PATHS.CLAWS.SUBDOMAIN(id), data),
    checkSubdomain: (subdomain: string) =>
        client.get<CheckSubdomainResponse>(
            `${API_PATHS.CLAWS.CHECK_SUBDOMAIN}?subdomain=${encodeURIComponent(subdomain)}`
        ),
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
        client.put<void>(API_PATHS.CLAWS.FILES.BASE(id), data)
}

export default claws