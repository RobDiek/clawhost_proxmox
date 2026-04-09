import type { Claw } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const createClawLifecycleMutation = (apiFn: (id: string) => Promise<Claw>) => {
    const useClawLifecycleMutation = () => {
        const queryClient = useQueryClient()

        return useMutation({
            mutationFn: (id: string) => apiFn(id),
            onSuccess: (updatedClaw, id) => {
                updateClawInCaches(queryClient, id, updatedClaw)
            }
        })
    }

    return useClawLifecycleMutation
}

export default createClawLifecycleMutation