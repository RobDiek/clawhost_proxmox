import { api } from '@/lib'
import createAgentLifecycleMutation from '@/hooks/useAgents/createAgentLifecycleMutation'

const useRestartAgent = createAgentLifecycleMutation((id) =>
    api.restartAgent(id)
)

export default useRestartAgent