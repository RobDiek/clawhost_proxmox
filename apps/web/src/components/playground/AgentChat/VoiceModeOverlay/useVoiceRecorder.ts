import type {
    UseVoiceRecorderParams,
    UseVoiceRecorderReturn
} from '@/ts/Interfaces'

import { useState, useRef, useCallback, useEffect } from 'react'
import getTranscriber from '@/lib/whisperTranscriber'

const SILENCE_THRESHOLD = 8
const SILENCE_TIMEOUT = 2000

const useVoiceRecorder = ({
    sendMessageRef,
    hasNoInput
}: UseVoiceRecorderParams): UseVoiceRecorderReturn => {
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [intensity, setIntensity] = useState(0)

    const rafRef = useRef<number>(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const analyserRef = useRef<AnalyserNode | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const silenceStartRef = useRef<number>(0)
    const hadSpeechRef = useRef(false)
    const stoppingRef = useRef(false)

    const stopAndTranscribe = useCallback(async () => {
        if (stoppingRef.current) return
        stoppingRef.current = true

        cancelAnimationFrame(rafRef.current)
        analyserRef.current = null
        if (audioCtxRef.current) {
            audioCtxRef.current.close()
            audioCtxRef.current = null
        }

        const recorder = mediaRecorderRef.current
        if (!recorder || recorder.state === 'inactive') {
            stoppingRef.current = false
            setIsRecording(false)
            return
        }

        return new Promise<void>((resolve) => {
            recorder.onstop = async () => {
                mediaRecorderRef.current = null
                setIsRecording(false)

                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType
                })
                chunksRef.current = []

                if (blob.size === 0 || !hadSpeechRef.current) {
                    stoppingRef.current = false
                    resolve()
                    return
                }

                setIsTranscribing(true)

                try {
                    const ctx = new AudioContext({ sampleRate: 16000 })
                    const buf = await ctx.decodeAudioData(
                        await blob.arrayBuffer()
                    )
                    const data = buf.getChannelData(0)
                    await ctx.close()

                    const transcriber = await getTranscriber()
                    const result = await transcriber(data)
                    const text = result.text?.trim()
                    if (text) {
                        sendMessageRef.current(text)
                    }
                } catch (error) {
                    console.error('stopAndTranscribe', error)
                } finally {
                    setIsTranscribing(false)
                    stoppingRef.current = false
                    resolve()
                }
            }

            recorder.stop()
            streamRef.current?.getTracks().forEach((track) => track.stop())
            streamRef.current = null
        })
    }, [sendMessageRef])

    const startRecording = useCallback(async () => {
        if (stoppingRef.current || hasNoInput) return

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            })
            streamRef.current = stream

            const recorder = new MediaRecorder(stream)
            chunksRef.current = []
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }
            mediaRecorderRef.current = recorder
            recorder.start()

            const ctx = new AudioContext()
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            audioCtxRef.current = ctx
            analyserRef.current = analyser

            silenceStartRef.current = 0
            hadSpeechRef.current = false
            setIsRecording(true)

            getTranscriber()
        } catch (error) {
            console.error('startRecording', error)
        }
    }, [hasNoInput])

    useEffect(() => {
        if (!isRecording || !analyserRef.current) return

        const analyser = analyserRef.current
        const dataArray = new Uint8Array(analyser.fftSize)

        const tick = () => {
            if (!analyserRef.current) return

            analyser.getByteTimeDomainData(dataArray)
            let max = 0
            for (let i = 0; i < dataArray.length; i++) {
                const v = Math.abs(dataArray[i] - 128)
                if (v > max) max = v
            }

            const normalized = Math.min(max / 80, 1)
            setIntensity(0.1 + normalized * 0.5)

            if (max > SILENCE_THRESHOLD) {
                hadSpeechRef.current = true
                silenceStartRef.current = 0
            } else if (hadSpeechRef.current) {
                if (!silenceStartRef.current) {
                    silenceStartRef.current = Date.now()
                } else if (
                    Date.now() - silenceStartRef.current >
                    SILENCE_TIMEOUT
                ) {
                    stopAndTranscribe()
                    return
                }
            }

            rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafRef.current)
    }, [isRecording, stopAndTranscribe])

    const cleanup = useCallback(() => {
        cancelAnimationFrame(rafRef.current)
        if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== 'inactive'
        ) {
            mediaRecorderRef.current.stop()
            streamRef.current?.getTracks().forEach((track) => track.stop())
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close()
            audioCtxRef.current = null
        }
        analyserRef.current = null
    }, [])

    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current)
            if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state !== 'inactive'
            ) {
                mediaRecorderRef.current.stop()
                streamRef.current?.getTracks().forEach((track) => track.stop())
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close()
            }
        }
    }, [])

    return {
        isRecording,
        isTranscribing,
        intensity,
        setIntensity,
        startRecording,
        stopAndTranscribe,
        cleanup
    }
}

export default useVoiceRecorder