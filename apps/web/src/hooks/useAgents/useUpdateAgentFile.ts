import type { UpdateAgentFileParams } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const useUpdateAgentFile = createApiMutation(
    ({ id, data }: UpdateAgentFileParams) => api.updateAgentFile(id, data)
)

export default useUpdateAgentFile