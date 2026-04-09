import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const useReinstallClaw = createApiMutation(
    (id: string) => api.reinstallClaw(id),
    {
        invalidateKeys: [CLAWS_QUERY_KEY, ADMIN_CLAWS_QUERY_KEY]
    }
)

export default useReinstallClaw