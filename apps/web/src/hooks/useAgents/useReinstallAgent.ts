import type { AgentIdMutationParams } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'
import ADMIN_AGENTS_QUERY_KEY from '@/hooks/useAgents/ADMIN_AGENTS_QUERY_KEY'

const useReinstallAgent = createApiMutation(
    ({ id, signal }: AgentIdMutationParams) => api.reinstallAgent(id, signal),
    {
        invalidateKeys: [AGENTS_QUERY_KEY, ADMIN_AGENTS_QUERY_KEY]
    }
)

export default useReinstallAgent