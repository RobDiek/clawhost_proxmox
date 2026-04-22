import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import removeAgentFromCaches from '@/hooks/useAgents/removeAgentFromCaches'
import { USER_STATS_QUERY_KEY } from '@/hooks/useUser'

const useHardDeleteAgent = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.hardDeleteAgent(id),
        onSuccess: (_response, id) => {
            removeAgentFromCaches(queryClient, id)
            queryClient.invalidateQueries({ queryKey: USER_STATS_QUERY_KEY })
        }
    })
}

export default useHardDeleteAgent