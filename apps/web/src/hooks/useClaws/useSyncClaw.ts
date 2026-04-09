import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const useSyncClaw = createApiMutation((id: string) => api.syncClaw(id), {
    invalidateKeys: [CLAWS_QUERY_KEY, ADMIN_CLAWS_QUERY_KEY]
})

export default useSyncClaw