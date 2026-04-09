import type { UpdateProfileData } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'
import PROFILE_QUERY_KEY from '@/hooks/useUser/PROFILE_QUERY_KEY'

const useUpdateProfile = createApiMutation(
    (data: UpdateProfileData) => api.updateProfile(data),
    {
        invalidateKeys: [PROFILE_QUERY_KEY]
    }
)

export default useUpdateProfile