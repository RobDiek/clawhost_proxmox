import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

const useRotatePassword = createApiMutation(
    ({ id, password }: { id: string; password?: string }) =>
        api.rotatePassword(id, password),
    {
        invalidateKeys: [CLAWS_QUERY_KEY]
    }
)

export default useRotatePassword