import type { UpdateClawEmojiMutationParams } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import updateClawInCaches from '@/hooks/useClaws/updateClawInCaches'

const useUpdateClawEmoji = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, emoji, emojiColor }: UpdateClawEmojiMutationParams) =>
            api.updateClawEmoji(id, emoji, emojiColor),
        onSuccess: (updatedClaw, { id }) => {
            updateClawInCaches(queryClient, id, updatedClaw)
        }
    })
}

export default useUpdateClawEmoji