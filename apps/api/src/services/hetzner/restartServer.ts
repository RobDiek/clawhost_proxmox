import getClient from '@/services/hetzner/hetznerClient'

const restartServer = async (serverId: string): Promise<void> => {
    await getClient().post(`/servers/${serverId}/actions/reboot`)
}

export default restartServer