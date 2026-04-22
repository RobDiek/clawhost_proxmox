import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'

const useRotateGatewayToken = createApiMutation(
    ({ id, token }: { id: string; token?: string }) =>
        api.rotateGatewayToken(id, token),
    {
        invalidateKeys: [AGENTS_QUERY_KEY]
    }
)

export default useRotateGatewayToken