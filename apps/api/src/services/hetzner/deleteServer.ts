import getClient from '@/services/hetzner/hetznerClient'

const deleteServer = async (serverId: string): Promise<void> => {
    await getClient().delete(`/servers/${serverId}`)
}

export default deleteServer