import getClient from '@/services/hetzner/hetznerClient'

const detachVolume = async (volumeId: number): Promise<void> => {
    await getClient().post(`/volumes/${volumeId}/actions/detach`)
}

export default detachVolume