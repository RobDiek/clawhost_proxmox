import type { UpdateReferralCodeData } from '@/ts/Interfaces'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { t } from '@openclaw/i18n'
import AFFILIATE_QUERY_KEY from '@/hooks/useAffiliate/AFFILIATE_QUERY_KEY'

const useUpdateReferralCode = () => {
    const queryClient = useQueryClient()
    const showToast = useUIStore((s) => s.showToast)

    return useMutation({
        mutationFn: (data: UpdateReferralCodeData) =>
            api.updateReferralCode(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: AFFILIATE_QUERY_KEY })
            showToast(t('affiliate.codeUpdated'), 'success')
        },
        onError: (error: Error) => {
            showToast(
                error.message || t('affiliate.codeUpdateFailed'),
                'error'
            )
        }
    })
}

export default useUpdateReferralCode