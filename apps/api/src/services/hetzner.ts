import type {
    CloudProvider,
    HetznerCreateServerResponse,
    HetznerDatacentersResponse,
    HetznerLocationsResponse,
    HetznerPricingResponse,
    HetznerSSHKeyResponse,
    HetznerServerResponse,
    HetznerServerTypesResponse,
    HetznerServersResponse,
    HetznerVolumeResponse,
    ServerStatus,
    CreateServerResult,
    ServerTypeInfo,
    LocationInfo,
    CreateSSHKeyResult,
    VolumeInfo,
    VolumeDetails,
    VolumePricingResult,
    RawServerType,
    DatacenterAvailability
} from '@/ts/Interfaces'

import { RequestClient, clawStatus } from '@openclaw/shared'

const mapStatus = (hetznerStatus: string): string => {
    const statusMap: Record<string, string> = {
        off: clawStatus.stopped,
        init: clawStatus.initializing
    }
    return statusMap[hetznerStatus] || hetznerStatus
}

const getClient = () => {
    const token = process.env.HETZNER_API_TOKEN
    if (!token) {
        throw new Error('HETZNER_API_TOKEN is not set')
    }

    return new RequestClient({
        baseUrl: 'https://api.hetzner.cloud/v1',
        getHeaders: () => ({ Authorization: `Bearer ${token}` })
    })
}

const hetzner: CloudProvider = {
    async createServer(
        name: string,
        serverType: string,
        location: string,
        rootPassword?: string,
        sshKeyIds?: number[],
        snapshotId?: string,
        userData?: string
    ): Promise<CreateServerResult> {
        const body: Record<string, unknown> = {
            name,
            server_type: serverType,
            location,
            start_after_create: true,
            image: snapshotId || 'ubuntu-24.04'
        }

        if (rootPassword) {
            body.root_password = rootPassword
        }

        if (sshKeyIds?.length) {
            body.ssh_keys = sshKeyIds
        }

        if (userData) {
            body.user_data = userData
        }

        const data = await getClient().post<HetznerCreateServerResponse>(
            '/servers',
            body
        )

        return {
            serverId: data.server.id,
            ip: data.server.public_net.ipv4.ip,
            rootPassword: data.root_password
        }
    },

    async getServer(serverId: string): Promise<ServerStatus> {
        const data = await getClient().get<HetznerServerResponse>(
            `/servers/${serverId}`
        )
        return {
            status: mapStatus(data.server.status),
            ip: data.server.public_net.ipv4.ip
        }
    },

    async getServers(): Promise<Map<string, ServerStatus>> {
        const result = new Map<string, ServerStatus>()
        const first = await getClient().get<HetznerServersResponse>(
            '/servers?per_page=50&page=1'
        )

        for (const server of first.servers) {
            result.set(String(server.id), {
                status: mapStatus(server.status),
                ip: server.public_net.ipv4.ip
            })
        }

        const lastPage = first.meta.pagination.last_page
        if (lastPage > 1) {
            const remaining = await Promise.all(
                Array.from({ length: lastPage - 1 }, (_, i) =>
                    getClient().get<HetznerServersResponse>(
                        `/servers?per_page=50&page=${i + 2}`
                    )
                )
            )

            for (const data of remaining) {
                for (const server of data.servers) {
                    result.set(String(server.id), {
                        status: mapStatus(server.status),
                        ip: server.public_net.ipv4.ip
                    })
                }
            }
        }

        return result
    },

    async startServer(serverId: string): Promise<void> {
        await getClient().post(`/servers/${serverId}/actions/poweron`)
    },

    async stopServer(serverId: string): Promise<void> {
        await getClient().post(`/servers/${serverId}/actions/shutdown`)
    },

    async restartServer(serverId: string): Promise<void> {
        await getClient().post(`/servers/${serverId}/actions/reboot`)
    },

    async deleteServer(serverId: string): Promise<void> {
        await getClient().delete(`/servers/${serverId}`)
    },

    async changeServerType(serverId: string, newType: string): Promise<void> {
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

        // 1. Shutdown
        console.log(`[Hetzner] Shutting down server ${serverId}...`)
        await getClient().post(`/servers/${serverId}/actions/shutdown`)
        for (let i = 0; i < 40; i++) {
            const data = await getClient().get<HetznerServerResponse>(`/servers/${serverId}`)
            if (data.server.status === 'off') break
            await sleep(3000)
        }

        // 2. Change type
        console.log(`[Hetzner] Changing server ${serverId} to ${newType}...`)
        const actionRes = await getClient().post<{ action: { id: number } }>(
            `/servers/${serverId}/actions/change_type`,
            { server_type: newType, upgrade_disk: true }
        )

        // 3. Wait for action to complete
        const actionId = actionRes?.action?.id
        if (actionId) {
            for (let i = 0; i < 60; i++) {
                try {
                    const a = await getClient().get<{ action: { status: string } }>(`/actions/${actionId}`)
                    if (a.action.status === 'success') break
                    if (a.action.status === 'error') throw new Error('Hetzner change_type action failed')
                } catch { /* retry */ }
                await sleep(5000)
            }
        } else {
            // Fallback: wait fixed time
            await sleep(30000)
        }

        // 4. Power on
        console.log(`[Hetzner] Powering on server ${serverId}...`)
        await getClient().post(`/servers/${serverId}/actions/poweron`)

        // 5. Wait until running
        for (let i = 0; i < 30; i++) {
            const data = await getClient().get<HetznerServerResponse>(`/servers/${serverId}`)
            if (data.server.status === 'running') break
            await sleep(3000)
        }
        console.log(`[Hetzner] Server ${serverId} upgraded to ${newType} and running`)
    },

    async getServerTypes(): Promise<ServerTypeInfo[]> {
        const data =
            await getClient().get<HetznerServerTypesResponse>('/server_types')

        return data.server_types.map((t) => {
            const ashPrice = t.prices.find((p) => p.location === 'ash')
            const price = ashPrice || t.prices[0]

            return {
                name: t.name,
                description: t.description,
                cores: t.cores,
                memory: t.memory,
                disk: t.disk,
                architecture: t.architecture,
                priceHourly: parseFloat(price.price_hourly.gross),
                priceMonthly: parseFloat(price.price_monthly.gross)
            }
        })
    },

    async getLocations(): Promise<LocationInfo[]> {
        const [locData, dcData] = await Promise.all([
            getClient().get<HetznerLocationsResponse>('/locations'),
            getClient().get<HetznerDatacentersResponse>('/datacenters')
        ])

        const enabledLocations = new Set<string>()
        for (const dc of dcData.datacenters) {
            if (dc.server_types.available.length > 0) {
                enabledLocations.add(dc.location.name)
            }
        }

        const seen = new Set<string>()
        return locData.locations
            .map((l) => ({
                id: l.name.replace(/-dc\d+$/, ''),
                name: l.description,
                city: l.city,
                country: l.country,
                disabled: !enabledLocations.has(l.name.replace(/-dc\d+$/, ''))
            }))
            .filter((l) => {
                if (seen.has(l.id)) return false
                seen.add(l.id)
                return true
            })
    },

    async getRawServerTypes(): Promise<RawServerType[]> {
        const data =
            await getClient().get<HetznerServerTypesResponse>('/server_types')
        return data.server_types.map((st) => ({
            id: st.id,
            name: st.name
        }))
    },

    async getDatacenters(): Promise<DatacenterAvailability[]> {
        const data =
            await getClient().get<HetznerDatacentersResponse>('/datacenters')
        return data.datacenters.map((dc) => ({
            name: dc.name,
            locationName: dc.location.name,
            availableServerTypeIds: dc.server_types.available
        }))
    },

    async createSSHKey(
        name: string,
        publicKey: string
    ): Promise<CreateSSHKeyResult> {
        const data = await getClient().post<HetznerSSHKeyResponse>(
            '/ssh_keys',
            {
                name,
                public_key: publicKey
            }
        )

        return {
            id: data.ssh_key.id,
            name: data.ssh_key.name,
            fingerprint: data.ssh_key.fingerprint
        }
    },

    async deleteSSHKey(keyId: number): Promise<void> {
        await getClient().delete(`/ssh_keys/${keyId}`)
    },

    async getVolumePricing(): Promise<VolumePricingResult> {
        const data = await getClient().get<HetznerPricingResponse>('/pricing')
        return {
            pricePerGbMonthly: parseFloat(
                data.pricing.volume.price_per_gb_month.gross
            )
        }
    },

    async createVolume(
        name: string,
        size: number,
        location: string,
        serverId?: number
    ): Promise<VolumeInfo> {
        const body: Record<string, unknown> = {
            name,
            size,
            location,
            automount: true,
            format: 'ext4'
        }

        if (serverId) {
            body.server = serverId
        }

        const data = await getClient().post<HetznerVolumeResponse>(
            '/volumes',
            body
        )

        return {
            id: data.volume.id,
            size: data.volume.size,
            location: data.volume.location.name
        }
    },

    async attachVolume(volumeId: number, serverId: number): Promise<void> {
        await getClient().post(`/volumes/${volumeId}/actions/attach`, {
            server: serverId,
            automount: true
        })
    },

    async detachVolume(volumeId: number): Promise<void> {
        await getClient().post(`/volumes/${volumeId}/actions/detach`)
    },

    async deleteVolume(volumeId: number): Promise<void> {
        await getClient().delete(`/volumes/${volumeId}`)
    },

    async getVolumes(serverId?: number): Promise<Array<{ id: number; name: string; size: number }>> {
        const url = serverId
            ? `/volumes?status=available&sort=id:asc`
            : '/volumes?sort=id:asc'
        const data = await getClient().get<{ volumes: Array<{ id: number; name: string; size: number; server: number | null }> }>(url)
        const vols = data.volumes || []
        return serverId ? vols.filter(v => v.server === serverId) : vols
    },

    async getVolume(volumeId: number): Promise<VolumeDetails> {
        const data = await getClient().get<HetznerVolumeResponse>(
            `/volumes/${volumeId}`
        )
        return {
            id: data.volume.id,
            size: data.volume.size,
            status: data.volume.status,
            serverId: data.volume.server
        }
    }
}

export default hetzner