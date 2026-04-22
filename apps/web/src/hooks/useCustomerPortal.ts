import type { UseCustomerPortalReturn } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import { useToast } from '@/hooks'

const useCustomerPortal = (): UseCustomerPortalReturn => {
    const [isLoading, setIsLoading] = useState(false)
    const toast = useToast()

    const openPortal = useCallback(
        async (agentId?: string) => {
            setIsLoading(true)
            try {
                const { url } = await api.getCustomerPortal(agentId)
                window.open(url, '_blank')
            } catch {
                toast.error(t('billing.failedToLoadPortal'))
            } finally {
                setIsLoading(false)
            }
        },
        [toast]
    )

    return { openPortal, isLoading }
}

export default useCustomerPortal