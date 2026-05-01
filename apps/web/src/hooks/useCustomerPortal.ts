import type { UseCustomerPortalReturn } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { api, handleAbortToast } from '@/lib'
import { useUIStore } from '@/lib/store'
import { useToast, useAbortController } from '@/hooks'

const useCustomerPortal = (): UseCustomerPortalReturn => {
    const [isLoading, setIsLoading] = useState(false)
    const toast = useToast()
    const { showToast } = useUIStore()
    const getSignal = useAbortController()

    const openPortal = useCallback(
        async (agentId?: string) => {
            setIsLoading(true)
            try {
                const { url } = await api.getCustomerPortal(
                    agentId,
                    getSignal()
                )
                window.open(url, '_blank')
            } catch (error) {
                if (
                    !handleAbortToast(
                        error,
                        showToast,
                        'billing.portalCanceledNavigation'
                    )
                )
                    toast.error(t('billing.failedToLoadPortal'))
            } finally {
                setIsLoading(false)
            }
        },
        [toast, showToast, getSignal]
    )

    return { openPortal, isLoading }
}

export default useCustomerPortal