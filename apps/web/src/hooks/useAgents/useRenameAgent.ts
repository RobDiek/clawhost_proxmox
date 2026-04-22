import type { RenameAgentMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateAgentInCaches from '@/hooks/useAgents/updateAgentInCaches'

const useRenameAgent = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, name }: RenameAgentMutationParams) =>
            api.renameAgent(id, { name }),
        onSuccess: (updatedAgent, { id }) => {
            updateAgentInCaches(queryClient, id, updatedAgent)
        }
    })
}

export default useRenameAgent