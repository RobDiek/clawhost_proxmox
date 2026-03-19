import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clawStatus } from '@openclaw/shared'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useRepairClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => api.repairClaw(id),
        onSuccess: (_data, id) => {
            updateClawInCaches(queryClient, id, { status: clawStatus.running })
        }
    })
}

export default useRepairClaw