import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'
import removeClawFromCaches from '@/hooks/useClaws/removeClawFromCaches'
import { USER_STATS_QUERY_KEY } from '@/hooks/useUser'

const useDeleteClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.deleteClaw(id),
        onSuccess: (response, id) => {
            if (response.claw) {
                updateClawInCaches(queryClient, id, response.claw)
            } else {
                removeClawFromCaches(queryClient, id)
            }
            queryClient.invalidateQueries({ queryKey: USER_STATS_QUERY_KEY })
        }
    })
}

export default useDeleteClaw