import type { ToastType } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { t } from '@openclaw/i18n'
import { TOAST_TYPE } from '@/lib/constants'

const handleAbortToast = (
    error: unknown,
    showToast: (message: string, type?: ToastType, duration?: number) => void,
    messageKey: TranslationKey
): boolean => {
    if ((error as Error)?.name !== 'AbortError') return false
    showToast(t(messageKey), TOAST_TYPE.NEUTRAL)
    return true
}

export default handleAbortToast