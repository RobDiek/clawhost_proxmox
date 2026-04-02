import type { CreateClawData } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'
import { USER_STATS_QUERY_KEY } from '@/hooks/useUser'

const useCreateClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateClawData) => api.createClaw(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CLAWS_QUERY_KEY })
            queryClient.invalidateQueries({ queryKey: USER_STATS_QUERY_KEY })
        }
    })
}

export default useCreateClaw