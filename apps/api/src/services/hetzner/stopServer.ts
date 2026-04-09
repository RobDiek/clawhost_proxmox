import getClient from '@/services/hetzner/hetznerClient'

const stopServer = async (serverId: string): Promise<void> => {
    await getClient().post(`/servers/${serverId}/actions/shutdown`)
}

export default stopServer