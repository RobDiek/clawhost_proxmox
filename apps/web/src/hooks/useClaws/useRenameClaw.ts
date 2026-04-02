import type { RenameClawMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useRenameClaw = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, name }: RenameClawMutationParams) =>
            api.renameClaw(id, { name }),
        onSuccess: (updatedClaw, { id }) => {
            updateClawInCaches(queryClient, id, updatedClaw)
        }
    })
}

export default useRenameClaw