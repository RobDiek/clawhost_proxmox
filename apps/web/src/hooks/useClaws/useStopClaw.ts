import { api } from '@/lib'
import createClawLifecycleMutation from '@/hooks/useClaws/createClawLifecycleMutation'

const useStopClaw = createClawLifecycleMutation((id) => api.stopClaw(id))

export default useStopClaw