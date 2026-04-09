import { api } from '@/lib'
import createClawLifecycleMutation from '@/hooks/useClaws/createClawLifecycleMutation'

const useStartClaw = createClawLifecycleMutation((id) => api.startClaw(id))

export default useStartClaw