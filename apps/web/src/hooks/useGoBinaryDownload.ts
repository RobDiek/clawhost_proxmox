import type { GoPlatform, MacArch } from '@/ts/Types'
import type { UseGoBinaryDownloadReturn } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'
import { downloadGoBinary } from '@/lib'
import { TOAST_TYPE } from '@/lib/constants'

const useGoBinaryDownload = (
    errorContext: string
): UseGoBinaryDownloadReturn => {
    const [isFetching, setIsFetching] = useState(false)
    const showToast = useUIStore((s) => s.showToast)

    const trigger = async (
        platform: GoPlatform,
        macArch?: MacArch
    ): Promise<void> => {
        if (isFetching) return
        setIsFetching(true)
        try {
            await downloadGoBinary(platform, macArch)
            showToast(t('go.downloadStarted'), TOAST_TYPE.SUCCESS)
        } catch (error) {
            console.error(errorContext, error)
            showToast(t('go.downloadFailed'), TOAST_TYPE.ERROR)
        } finally {
            setIsFetching(false)
        }
    }

    return { trigger, isFetching }
}

export default useGoBinaryDownload