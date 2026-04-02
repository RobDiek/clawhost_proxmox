import type { UpdateAdminUserMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_USERS_QUERY_KEY from '@/hooks/useAdmin/ADMIN_USERS_QUERY_KEY'

const useUpdateAdminUser = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: UpdateAdminUserMutationParams) =>
            api.updateAdminUser(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
        }
    })
}

export default useUpdateAdminUser