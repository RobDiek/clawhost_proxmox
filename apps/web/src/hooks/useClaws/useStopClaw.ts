import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useStopClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.stopClaw(id),
        onSuccess: (updatedClaw, id) => {
            updateClawInCaches(queryClient, id, updatedClaw)
        }
    })
}

export default useStopClaw