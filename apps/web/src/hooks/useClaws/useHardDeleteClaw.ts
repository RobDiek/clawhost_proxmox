import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import removeClawFromCaches from '@/hooks/useClaws/removeClawFromCaches'
import { USER_STATS_QUERY_KEY } from '@/hooks/useUser'

const useHardDeleteClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.hardDeleteClaw(id),
        onSuccess: (_response, id) => {
            removeClawFromCaches(queryClient, id)
            queryClient.invalidateQueries({ queryKey: USER_STATS_QUERY_KEY })
        }
    })
}

export default useHardDeleteClaw