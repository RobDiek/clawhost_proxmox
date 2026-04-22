import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'

const useRotatePassword = createApiMutation(
    ({ id, password }: { id: string; password?: string }) =>
        api.rotatePassword(id, password),
    {
        invalidateKeys: [AGENTS_QUERY_KEY]
    }
)

export default useRotatePassword