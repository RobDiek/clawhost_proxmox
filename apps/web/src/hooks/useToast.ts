import type { UseToastReturn } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const useToast = (): UseToastReturn => {
    const showToast = useUIStore((s) => s.showToast)
    return useMemo(
        () => ({
            success: (text: string) => showToast(text, TOAST_TYPE.SUCCESS),
            error: (text: string) => showToast(text, TOAST_TYPE.ERROR),
            warning: (text: string) => showToast(text, TOAST_TYPE.WARNING),
            info: (text: string) => showToast(text, TOAST_TYPE.INFO)
        }),
        [showToast]
    )
}

export default useToast