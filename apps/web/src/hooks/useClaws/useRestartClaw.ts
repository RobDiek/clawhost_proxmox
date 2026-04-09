import { api } from '@/lib'
import createClawLifecycleMutation from '@/hooks/useClaws/createClawLifecycleMutation'

const useRestartClaw = createClawLifecycleMutation((id) => api.restartClaw(id))

export default useRestartClaw