import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useCancelDeletion = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.cancelDeletion(id),
        onSuccess: (updatedClaw, id) => {
            updateClawInCaches(queryClient, id, updatedClaw)
        }
    })
}

export default useCancelDeletion