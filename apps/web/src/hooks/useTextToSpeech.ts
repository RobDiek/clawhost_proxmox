import type {
    UseTextToSpeechReturn,
    AudioContextWithSinkId
} from '@/ts/Interfaces'

import { useState, useCallback, useRef, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { getCachedToken } from '@/lib/firebase'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'
const BUFFER_THRESHOLD = 4096

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

    const playStreamingAudio = useCallback(
        async (messageId: string, response: Response) => {
            const sampleRate = parseInt(
                response.headers.get('X-Sample-Rate') || '22050',
                10
            )
            const channels = parseInt(
                response.headers.get('X-Channels') || '1',
                10
            )

            const reader = response.body?.getReader()
            if (!reader) return

            const ctx = getAudioContext()

            if (outputDeviceIdRef.current && 'setSinkId' in ctx) {
                ;(ctx as AudioContextWithSinkId).setSinkId(
                    outputDeviceIdRef.current
                )
            }

            const chunks: Uint8Array[] = []
            let totalBytes = 0
            let startedPlaying = false
            let nextStartTime = ctx.currentTime

            const scheduleChunk = (pcmBytes: Uint8Array) => {
                const int16 = new Int16Array(
                    pcmBytes.buffer,
                    pcmBytes.byteOffset,
                    Math.floor(pcmBytes.byteLength / 2)
                )

                const float32 = new Float32Array(int16.length)
                for (let i = 0; i < int16.length; i++) {
                    float32[i] = int16[i] / 32768
                }

                const samplesPerChannel = Math.floor(float32.length / channels)
                const audioBuffer = ctx.createBuffer(
                    channels,
                    samplesPerChannel,
                    sampleRate
                )

                if (channels === 1) {
                    audioBuffer.copyToChannel(float32, 0)
                } else {
                    for (let ch = 0; ch < channels; ch++) {
                        const channelData = new Float32Array(samplesPerChannel)
                        for (let i = 0; i < samplesPerChannel; i++) {
                            channelData[i] = float32[i * channels + ch]
                        }
                        audioBuffer.copyToChannel(channelData, ch)
                    }
                }

                const source = ctx.createBufferSource()
                source.buffer = audioBuffer
                source.connect(ctx.destination)

                if (nextStartTime < ctx.currentTime) {
                    nextStartTime = ctx.currentTime
                }

                source.start(nextStartTime)
                nextStartTime += audioBuffer.duration
            }

            let pendingBuffer = new Uint8Array(0)

            const processChunks = (newChunk: Uint8Array) => {
                const combined = new Uint8Array(
                    pendingBuffer.length + newChunk.length
                )
                combined.set(pendingBuffer)
                combined.set(newChunk, pendingBuffer.length)

                const alignedLength = Math.floor(combined.length / 2) * 2
                if (alignedLength < 2) {
                    pendingBuffer = combined
                    return
                }

                const toSchedule = combined.slice(0, alignedLength)
                pendingBuffer = combined.slice(alignedLength)
                scheduleChunk(toSchedule)
            }

            try {
                while (true) {
                    if (!isPlayingRef.current) {
                        reader.cancel()
                        return
                    }

                    const { done, value } = await reader.read()

                    if (done) break
                    if (!value) continue

                    chunks.push(value)
                    totalBytes += value.byteLength

                    if (!startedPlaying && totalBytes >= BUFFER_THRESHOLD) {
                        startedPlaying = true
                        setLoadingMessageId(null)
                        setActiveMessageId(messageId)

                        for (const buffered of chunks) {
                            processChunks(buffered)
                        }
                    } else if (startedPlaying) {
                        processChunks(value)
                    }
                }

                if (!startedPlaying && totalBytes > 0) {
                    startedPlaying = true
                    setLoadingMessageId(null)
                    setActiveMessageId(messageId)

                    for (const buffered of chunks) {
                        processChunks(buffered)
                    }
                }

                if (!startedPlaying) return

                if (pendingBuffer.length >= 2) {
                    const alignedLength =
                        Math.floor(pendingBuffer.length / 2) * 2
                    scheduleChunk(pendingBuffer.slice(0, alignedLength))
                }

                const fullPcm = new Uint8Array(totalBytes)
                let offset = 0
                for (const chunk of chunks) {
                    fullPcm.set(chunk, offset)
                    offset += chunk.byteLength
                }

                const int16Full = new Int16Array(
                    fullPcm.buffer,
                    fullPcm.byteOffset,
                    Math.floor(fullPcm.byteLength / 2)
                )
                const float32Full = new Float32Array(int16Full.length)
                for (let i = 0; i < int16Full.length; i++) {
                    float32Full[i] = int16Full[i] / 32768
                }
                const samplesPerChannel = Math.floor(
                    float32Full.length / channels
                )
                const cachedBuffer = new (
                    window.OfflineAudioContext || window.AudioContext
                )(channels, samplesPerChannel || 1, sampleRate).createBuffer(
                    channels,
                    samplesPerChannel || 1,
                    sampleRate
                )
                if (channels === 1) {
                    cachedBuffer.copyToChannel(float32Full, 0)
                } else {
                    for (let ch = 0; ch < channels; ch++) {
                        const channelData = new Float32Array(samplesPerChannel)
                        for (let i = 0; i < samplesPerChannel; i++) {
                            channelData[i] = float32Full[i * channels + ch]
                        }
                        cachedBuffer.copyToChannel(channelData, ch)
                    }
                }
                cacheRef.current.set(messageId, cachedBuffer)

                const remainingDuration = Math.max(
                    0,
                    nextStartTime - ctx.currentTime
                )
                setTimeout(() => {
                    if (isPlayingRef.current) {
                        isPlayingRef.current = false
                        setActiveMessageId(null)
                    }
                }, remainingDuration * 1000)
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError')
                    return
                throw err
            }
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
                    showToast(t('playground.chatSpeechFailed'), TOAST_TYPE.ERROR)
                    return
                }

                await playStreamingAudio(messageId, res)
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    setLoadingMessageId(null)
                    return
                }
                stopPlayback()
                setActiveMessageId(null)
                setLoadingMessageId(null)
                showToast(t('playground.chatSpeechFailed'), TOAST_TYPE.ERROR)
            }
        },
        [stopPlayback, playCachedAudio, playStreamingAudio, showToast]
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