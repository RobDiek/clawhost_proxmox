import type { UseAutoSpeakLastMessageParams } from '@/ts/Interfaces'

import { useEffect, useRef } from 'react'
import { CHAT_MESSAGE_ROLE, CHAT_MESSAGE_STATUS } from '@/lib/constants'

const useAutoSpeakLastMessage = ({
    sessionMessages,
    speak
}: UseAutoSpeakLastMessageParams): void => {
    const lastSpokenIdRef = useRef<string | null>(null)

    useEffect(() => {
        if (sessionMessages.length === 0) return

        const lastMessage = sessionMessages[sessionMessages.length - 1]
        if (
            lastMessage.role === CHAT_MESSAGE_ROLE.ASSISTANT &&
            lastMessage.status === CHAT_MESSAGE_STATUS.COMPLETE &&
            lastMessage.id !== lastSpokenIdRef.current
        ) {
            lastSpokenIdRef.current = lastMessage.id
            speak(lastMessage.id, lastMessage.content)
        }
    }, [sessionMessages, speak])
}

export default useAutoSpeakLastMessage