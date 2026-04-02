import type { UpdateClawSubdomainMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useUpdateClawSubdomain = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, subdomain }: UpdateClawSubdomainMutationParams) =>
            api.updateClawSubdomain(id, { subdomain }),
        onSuccess: (updatedClaw, { id }) => {
            updateClawInCaches(queryClient, id, updatedClaw)
        }
    })
}

export default useUpdateClawSubdomain