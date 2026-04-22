import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateAgentInCaches from '@/hooks/useAgents/updateAgentInCaches'
import removeAgentFromCaches from '@/hooks/useAgents/removeAgentFromCaches'
import { USER_STATS_QUERY_KEY } from '@/hooks/useUser'

const useDeleteAgent = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.deleteAgent(id),
        onSuccess: (response, id) => {
            if (response.agent) {
                updateAgentInCaches(queryClient, id, response.agent)
            } else {
                removeAgentFromCaches(queryClient, id)
            }
            queryClient.invalidateQueries({ queryKey: USER_STATS_QUERY_KEY })
        }
    })
}

export default useDeleteAgent