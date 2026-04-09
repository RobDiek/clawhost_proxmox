import type { UseCopyWithFeedbackReturn } from '@/ts/Interfaces'

import { useState, useEffect, useRef, useCallback } from 'react'
import { copyToClipboard } from '@/lib'

const useCopyWithFeedback = (timeoutMs = 2000): UseCopyWithFeedbackReturn => {
    const [copied, setCopied] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const copy = useCallback(
        (value: string) => {
            void copyToClipboard(value).then(() => {
                setCopied(true)
                if (timerRef.current) clearTimeout(timerRef.current)
                timerRef.current = setTimeout(() => setCopied(false), timeoutMs)
            })
        },
        [timeoutMs]
    )

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    return { copied, copy }
}

export default useCopyWithFeedback