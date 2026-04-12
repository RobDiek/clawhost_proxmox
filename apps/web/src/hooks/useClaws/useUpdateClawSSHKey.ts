import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

const useUpdateClawSSHKey = createApiMutation(
    ({ id, sshKeyId }: { id: string; sshKeyId: string | null }) =>
        api.updateClawSSHKey(id, sshKeyId),
    {
        invalidateKeys: [CLAWS_QUERY_KEY]
    }
)

export default useUpdateClawSSHKey