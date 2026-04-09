import type {
    AudioContextWithSinkId,
    UseTextToSpeechReturn
} from '@/ts/Interfaces'

import { useState, useCallback, useRef, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { getCachedToken } from '@/lib/firebase'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import Envs from '@/lib/Envs'
import playStreamingAudio from '@/hooks/useTextToSpeech/playStreamingAudio'

const BASE_URL = Envs.VITE_API_URL

const useTextToSpeech = (): UseTextToSpeechReturn => {
    const { showToast } = useUIStore()
    const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
    const [loadingMessageId, setLoadingMessageId] = useState<string | null>(
        null
    )
    const abortRef = useRef<AbortController | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const isPlayingRef = useRef(false)
    const outputDeviceIdRef = useRef<string | null>(null)
    const cacheRef = useRef<Map<string, AudioBuffer>>(new Map())

    const getAudioContext = useCallback((): AudioContext => {
        if (
            !audioContextRef.current ||
            audioContextRef.current.state === 'closed'
        ) {
            audioContextRef.current = new AudioContext()
        }
        return audioContextRef.current
    }, [])

    const stopPlayback = useCallback(() => {
        isPlayingRef.current = false
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        if (
            audioContextRef.current &&
            audioContextRef.current.state !== 'closed'
        ) {
            audioContextRef.current.close()
            audioContextRef.current = null
        }
    }, [])

    const stop = useCallback(() => {
        stopPlayback()
        setActiveMessageId(null)
        setLoadingMessageId(null)
    }, [stopPlayback])

    const setOutputDeviceId = useCallback((deviceId: string | null) => {
        outputDeviceIdRef.current = deviceId
    }, [])

    const playCachedAudio = useCallback(
        (messageId: string, buffer: AudioBuffer) => {
            const ctx = getAudioContext()

            if (outputDeviceIdRef.current && 'setSinkId' in ctx) {
                ;(ctx as AudioContextWithSinkId).setSinkId(
                    outputDeviceIdRef.current
                )
            }

            const source = ctx.createBufferSource()
            source.buffer = buffer
            source.connect(ctx.destination)
            source.onended = () => {
                isPlayingRef.current = false
                setActiveMessageId(null)
            }

            setLoadingMessageId(null)
            setActiveMessageId(messageId)
            isPlayingRef.current = true
            source.start()
        },
        [getAudioContext]
    )

    const speak = useCallback(
        async (messageId: string, text: string) => {
            stopPlayback()
            setActiveMessageId(null)

            const cached = cacheRef.current.get(messageId)
            if (cached) {
                playCachedAudio(messageId, cached)
                return
            }

            setLoadingMessageId(messageId)
            isPlayingRef.current = true

            try {
                const token = await getCachedToken()
                const controller = new AbortController()
                abortRef.current = controller

                const res = await fetch(`${BASE_URL}/ai/tts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ text }),
                    signal: controller.signal
                })

                if (!res.ok) {
                    isPlayingRef.current = false
                    setLoadingMessageId(null)
                    showToast(
                        t('playground.chatSpeechFailed'),
                        TOAST_TYPE.ERROR
                    )
                    return
                }

                await playStreamingAudio({
                    messageId,
                    response: res,
                    ctx: getAudioContext(),
                    outputDeviceId: outputDeviceIdRef.current,
                    isPlayingRef,
                    cache: cacheRef.current,
                    setLoadingMessageId,
                    setActiveMessageId
                })
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    setLoadingMessageId(null)
                    return
                }
                stopPlayback()
                setActiveMessageId(null)
                setLoadingMessageId(null)
                showToast(t('playground.chatSpeechFailed'), TOAST_TYPE.ERROR)
            }
        },
        [stopPlayback, playCachedAudio, getAudioContext, showToast]
    )

    useEffect(() => {
        return () => {
            stopPlayback()
            cacheRef.current.clear()
        }
    }, [stopPlayback])

    return { activeMessageId, loadingMessageId, speak, stop, setOutputDeviceId }
}

export default useTextToSpeech