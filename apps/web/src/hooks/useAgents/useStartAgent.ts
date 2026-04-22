import { api } from '@/lib'
import createAgentLifecycleMutation from '@/hooks/useAgents/createAgentLifecycleMutation'

const useStartAgent = createAgentLifecycleMutation((id) => api.startAgent(id))

export default useStartAgent