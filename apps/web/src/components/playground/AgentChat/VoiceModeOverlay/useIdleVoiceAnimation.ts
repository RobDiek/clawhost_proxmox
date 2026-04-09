import type { UseIdleVoiceAnimationParams } from '@/ts/Interfaces'

import { useEffect, useRef } from 'react'
import { CHAT_TYPING_INDICATOR } from '@/lib/constants'

const useIdleVoiceAnimation = ({
    isRecording,
    isTranscribing,
    isStreaming,
    typingIndicator,
    ttsActiveMessageId,
    ttsLoadingMessageId,
    setIntensity
}: UseIdleVoiceAnimationParams): void => {
    const rafRef = useRef<number>(0)

    useEffect(() => {
        if (!isRecording && !isTranscribing && !isStreaming) {
            const hasActivity =
                typingIndicator === CHAT_TYPING_INDICATOR.THINKING ||
                typingIndicator === CHAT_TYPING_INDICATOR.WRITING ||
                !!ttsLoadingMessageId ||
                !!ttsActiveMessageId

            if (!hasActivity) {
                setIntensity(0)
                return
            }

            const tick = () => {
                const now = Date.now()
                let val = 0

                if (typingIndicator === CHAT_TYPING_INDICATOR.THINKING) {
                    val = 0.15 + Math.sin(now / 300) * 0.05
                } else if (typingIndicator === CHAT_TYPING_INDICATOR.WRITING) {
                    val = 0.2 + Math.sin(now / 250) * 0.08
                } else if (ttsLoadingMessageId) {
                    val = 0.2 + Math.sin(now / 200) * 0.05
                } else if (ttsActiveMessageId) {
                    val = 0.25 + Math.sin(now / 180) * 0.1
                }

                setIntensity(val)
                rafRef.current = requestAnimationFrame(tick)
            }

            rafRef.current = requestAnimationFrame(tick)
            return () => cancelAnimationFrame(rafRef.current)
        }
    }, [
        isRecording,
        isTranscribing,
        isStreaming,
        typingIndicator,
        ttsActiveMessageId,
        ttsLoadingMessageId,
        setIntensity
    ])
}

export default useIdleVoiceAnimation