import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

const useRotateGatewayToken = createApiMutation(
    ({ id, token }: { id: string; token?: string }) =>
        api.rotateGatewayToken(id, token),
    {
        invalidateKeys: [CLAWS_QUERY_KEY]
    }
)

export default useRotateGatewayToken