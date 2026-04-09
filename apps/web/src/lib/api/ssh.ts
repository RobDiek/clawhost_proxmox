import type { CreateSSHKeyData, SSHKey } from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'

const ssh = {
    getSSHKeys: () => client.get<SSHKey[]>(API_PATHS.SSH_KEYS.BASE),
    createSSHKey: (data: CreateSSHKeyData) =>
        client.post<SSHKey>(API_PATHS.SSH_KEYS.BASE, data),
    deleteSSHKey: (id: string) =>
        client.delete<void>(API_PATHS.SSH_KEYS.byId(id))
}

export default ssh