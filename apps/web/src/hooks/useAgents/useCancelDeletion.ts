import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateAgentInCaches from '@/hooks/useAgents/updateAgentInCaches'

const useCancelDeletion = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.cancelDeletion(id),
        onSuccess: (updatedAgent, id) => {
            updateAgentInCaches(queryClient, id, updatedAgent)
        }
    })
}

export default useCancelDeletion