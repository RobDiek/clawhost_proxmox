import type { UpdateReferralCodeData, UserProfile } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { t } from '@openclaw/i18n'
import { AFFILIATE_QUERY_KEY, PROFILE_QUERY_KEY } from '@/hooks'

const useUpdateReferralCode = () => {
    const queryClient = useQueryClient()
    const showToast = useUIStore((s) => s.showToast)

    return useMutation({
        mutationFn: (data: UpdateReferralCodeData) =>
            api.updateReferralCode(data),
        onSuccess: (_result, data) => {
            queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, (old) =>
                old
                    ? {
                          ...old,
                          referralCode: data.code,
                          referralCodeChanged: true
                      }
                    : old
            )
            queryClient.invalidateQueries({ queryKey: AFFILIATE_QUERY_KEY })
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
            showToast(t('affiliate.codeUpdated'), TOAST_TYPE.SUCCESS)
        },
        onError: (error: Error) => {
            showToast(
                error.message || t('affiliate.codeUpdateFailed'),
                TOAST_TYPE.ERROR
            )
        }
    })
}

export default useUpdateReferralCode