import type { HetznerServerResponse, ServerStatus } from '@/ts/Interfaces'

import getClient from '@/services/hetzner/hetznerClient'
import mapStatus from '@/services/hetzner/mapStatus'

const getServer = async (serverId: string): Promise<ServerStatus> => {
    const data = await getClient().get<HetznerServerResponse>(
        `/servers/${serverId}`
    )
    return {
        status: mapStatus(data.server.status),
        ip: data.server.public_net.ipv4.ip
    }
}

export default getServer