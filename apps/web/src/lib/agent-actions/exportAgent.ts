import type { ToastType } from '@/ts/Types'

import { t } from '@openclaw/i18n'
import { api, handleAbortToast } from '@/lib'
import { TOAST_TYPE } from '@/lib/constants'

const exportAgent = async (
    agentId: string,
    filename: string,
    showToast: (message: string, type?: ToastType, duration?: number) => void,
    signal?: AbortSignal
): Promise<void> => {
    try {
        await api.exportAgent(agentId, filename, signal)
        showToast(t('dashboard.exportSuccess'), TOAST_TYPE.SUCCESS)
    } catch (error) {
        if (
            handleAbortToast(
                error,
                showToast,
                'dashboard.exportCanceledNavigation'
            )
        )
            return
        const retryAfter = (error as Error & { retryAfter?: number })
            ?.retryAfter
        if (!retryAfter || retryAfter <= 0)
            return showToast(t('dashboard.exportFailed'), TOAST_TYPE.ERROR)
        const minutes = Math.max(1, Math.ceil(retryAfter / 60))
        if (minutes === 1)
            return showToast(
                t('dashboard.exportRateLimitedOne'),
                TOAST_TYPE.WARNING
            )
        showToast(
            t('dashboard.exportRateLimited', { minutes }),
            TOAST_TYPE.WARNING
        )
    }
}

export default exportAgent