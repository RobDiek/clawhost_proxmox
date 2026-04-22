import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'

const useUpdateAgentSSHKey = createApiMutation(
    ({ id, sshKeyId }: { id: string; sshKeyId: string | null }) =>
        api.updateAgentSSHKey(id, sshKeyId),
    {
        invalidateKeys: [AGENTS_QUERY_KEY]
    }
)

export default useUpdateAgentSSHKey