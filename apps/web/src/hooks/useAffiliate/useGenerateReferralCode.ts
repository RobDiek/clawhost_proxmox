import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import { PROFILE_QUERY_KEY } from '@/hooks/useUser'

const useGenerateReferralCode = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () => api.generateReferralCode(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
        }
    })
}

export default useGenerateReferralCode