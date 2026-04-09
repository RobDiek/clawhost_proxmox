import type { UpdateClawFileParams } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const useUpdateClawFile = createApiMutation(
    ({ id, data }: UpdateClawFileParams) => api.updateClawFile(id, data)
)

export default useUpdateClawFile