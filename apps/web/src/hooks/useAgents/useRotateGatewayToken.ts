import type { RotateGatewayTokenMutationParams } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'

const useRotateGatewayToken = createApiMutation(
    ({ id, token, signal }: RotateGatewayTokenMutationParams) =>
        api.rotateGatewayToken(id, token, signal),
    {
        invalidateKeys: [AGENTS_QUERY_KEY]
    }
)

export default useRotateGatewayToken