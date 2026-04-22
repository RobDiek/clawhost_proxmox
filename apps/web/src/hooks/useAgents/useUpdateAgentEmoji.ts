import type { UpdateAgentEmojiMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateAgentInCaches from '@/hooks/useAgents/updateAgentInCaches'

const useUpdateAgentEmoji = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, emoji, emojiColor }: UpdateAgentEmojiMutationParams) =>
            api.updateAgentEmoji(id, emoji, emojiColor),
        onSuccess: (updatedAgent, { id }) => {
            updateAgentInCaches(queryClient, id, updatedAgent)
        }
    })
}

export default useUpdateAgentEmoji