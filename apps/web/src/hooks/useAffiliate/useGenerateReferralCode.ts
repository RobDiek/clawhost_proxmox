import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import { useAuth } from '@/lib/auth'
import { PROFILE_QUERY_KEY } from '@/hooks/useUser'

const useGenerateReferralCode = () => {
    const queryClient = useQueryClient()
    const { updateCachedProfile } = useAuth()

    return useMutation({
        mutationFn: () => api.generateReferralCode(),
        onSuccess: (data) => {
            updateCachedProfile({
                referralCode: data.referralCode,
                referralCodeChanged: false
            })
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
        }
    })
}

export default useGenerateReferralCode