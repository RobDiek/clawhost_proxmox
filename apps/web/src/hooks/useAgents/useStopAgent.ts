import { api } from '@/lib'
import createAgentLifecycleMutation from '@/hooks/useAgents/createAgentLifecycleMutation'

const useStopAgent = createAgentLifecycleMutation((id) => api.stopAgent(id))

export default useStopAgent