import getClient from '@/services/hetzner/hetznerClient'

const deleteSSHKey = async (keyId: number): Promise<void> => {
    await getClient().delete(`/ssh_keys/${keyId}`)
}

export default deleteSSHKey