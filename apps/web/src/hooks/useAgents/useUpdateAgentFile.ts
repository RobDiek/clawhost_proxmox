import type { UpdateAgentFileParams } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const useUpdateAgentFile = createApiMutation(
    ({ id, data, signal }: UpdateAgentFileParams) =>
        api.updateAgentFile(id, data, signal)
)

export default useUpdateAgentFile