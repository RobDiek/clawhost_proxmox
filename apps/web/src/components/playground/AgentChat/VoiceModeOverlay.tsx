import type { FC, ReactNode } from 'react'
import type { VoiceModeOverlayProps } from '@/ts/Interfaces'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    XIcon,
    WaveformIcon,
    MicrophoneIcon,
    SpeakerHighIcon,
    CaretDownIcon,
    WarningIcon
} from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import VoiceOrb from '@/components/playground/AgentChat/VoiceOrb'
import ChatBubble from '@/components/playground/AgentChat/ChatBubble'
import ChatTypingIndicator from '@/components/playground/AgentChat/ChatTypingIndicator'
import getTranscriber from '@/lib/whisperTranscriber'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from '@/components/ui'

const gridStyle = {
    backgroundImage: [
        'linear-gradient(rgba(239,83,80,0.06) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(239,83,80,0.06) 1px, transparent 1px)'
    ].join(', '),
    backgroundSize: '20px 20px',
    maskImage:
        'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)',
    WebkitMaskImage:
        'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)'
}

const supportsOutputSelection =
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype

const SILENCE_THRESHOLD = 8
const SILENCE_TIMEOUT = 2000

const VoiceModeOverlay: FC<VoiceModeOverlayProps> = ({
    onClose,
    messages,
    sendMessage,
    isStreaming,
    typingIndicator,
    speak,
    stopSpeech,
    ttsActiveMessageId,
    ttsLoadingMessageId,
    setOutputDeviceId
}): ReactNode => {
    const [intensity, setIntensity] = useState(0)
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
    const [selectedInputId, setSelectedInputId] = useState('')
    const [selectedOutputId, setSelectedOutputId] = useState('')

    const rafRef = useRef<number>(0)
    const sendMessageRef = useRef(sendMessage)
    const sessionStartIndexRef = useRef(messages.length)
    const lastSpokenIdRef = useRef<string | null>(null)
    const transcriptRef = useRef<HTMLDivElement>(null)
    const prevTtsActiveRef = useRef<string | null>(ttsActiveMessageId)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const analyserRef = useRef<AnalyserNode | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const silenceStartRef = useRef<number>(0)
    const hadSpeechRef = useRef(false)
    const stoppingRef = useRef(false)

    useEffect(() => {
        sendMessageRef.current = sendMessage
    }, [sendMessage])

    const sessionMessages = messages.slice(sessionStartIndexRef.current)
    const hasNoInput = inputDevices.length === 0
    const hasNoOutput = outputDevices.length === 0

    const refreshDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((stream) => {
                    stream.getTracks().forEach((track) => track.stop())
                })
        } catch {}

        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const inputs = devices.filter((d) => d.kind === 'audioinput')
            const outputs = devices.filter((d) => d.kind === 'audiooutput')
            setInputDevices(inputs)
            setOutputDevices(outputs)

            setSelectedInputId((prev) => {
                if (prev && inputs.find((d) => d.deviceId === prev)) return prev
                return inputs[0]?.deviceId || ''
            })
            setSelectedOutputId((prev) => {
                if (prev && outputs.find((d) => d.deviceId === prev))
                    return prev
                return outputs[0]?.deviceId || ''
            })
        } catch {}
    }, [])

    useEffect(() => {
        refreshDevices()
    }, [refreshDevices])

    useEffect(() => {
        const handler = () => refreshDevices()
        navigator.mediaDevices.addEventListener('devicechange', handler)
        return () =>
            navigator.mediaDevices.removeEventListener('devicechange', handler)
    }, [refreshDevices])

    useEffect(() => {
        setOutputDeviceId(selectedOutputId || null)
    }, [selectedOutputId, setOutputDeviceId])

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
                } catch {
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
    }, [])

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
        } catch {}
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

    useEffect(() => {
        if (!isRecording && !isTranscribing && !isStreaming) {
            const hasActivity =
                typingIndicator === 'thinking' ||
                typingIndicator === 'writing' ||
                !!ttsLoadingMessageId ||
                !!ttsActiveMessageId

            if (!hasActivity) {
                setIntensity(0)
                return
            }

            const tick = () => {
                const now = Date.now()
                let val = 0

                if (typingIndicator === 'thinking') {
                    val = 0.15 + Math.sin(now / 300) * 0.05
                } else if (typingIndicator === 'writing') {
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
        ttsLoadingMessageId
    ])

    useEffect(() => {
        if (
            prevTtsActiveRef.current &&
            !ttsActiveMessageId &&
            !isRecording &&
            !isTranscribing &&
            !isStreaming
        ) {
            startRecording()
        }
        prevTtsActiveRef.current = ttsActiveMessageId
    }, [
        ttsActiveMessageId,
        isRecording,
        isTranscribing,
        isStreaming,
        startRecording
    ])

    useEffect(() => {
        if (sessionMessages.length === 0) return

        const lastMessage = sessionMessages[sessionMessages.length - 1]
        if (
            lastMessage.role === 'assistant' &&
            lastMessage.status === 'complete' &&
            lastMessage.id !== lastSpokenIdRef.current
        ) {
            lastSpokenIdRef.current = lastMessage.id
            speak(lastMessage.id, lastMessage.content)
        }
    }, [sessionMessages, speak])

    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
    }, [sessionMessages.length, typingIndicator])

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

    const handleToggle = useCallback(() => {
        if (isTranscribing || isStreaming || hasNoInput) return
        if (isRecording) {
            stopAndTranscribe()
        } else {
            startRecording()
        }
    }, [
        isRecording,
        isTranscribing,
        isStreaming,
        hasNoInput,
        startRecording,
        stopAndTranscribe
    ])

    const handleClose = useCallback(() => {
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
        stopSpeech()
        onClose()
    }, [stopSpeech, onClose])

    const truncateLabel = (label: string, max: number): string =>
        label.length > max ? label.slice(0, max) + '...' : label

    const selectedInputLabel = truncateLabel(
        inputDevices.find((d) => d.deviceId === selectedInputId)?.label ||
            t('playground.chatVoiceModeInputDevice'),
        12
    )
    const selectedOutputLabel = truncateLabel(
        outputDevices.find((d) => d.deviceId === selectedOutputId)?.label ||
            t('playground.chatVoiceModeOutputDevice'),
        12
    )

    const statusLabel = (() => {
        if (hasNoInput) return t('playground.chatVoiceModeNoMicrophone')
        if (isRecording) return t('playground.chatVoiceModeListening')
        if (isTranscribing) return t('playground.chatVoiceModeTranscribing')
        if (typingIndicator === 'thinking')
            return t('playground.chatVoiceModeThinking')
        if (typingIndicator === 'writing' || isStreaming)
            return t('playground.chatVoiceModeResponding')
        if (ttsLoadingMessageId) return t('playground.chatVoiceModePreparing')
        if (ttsActiveMessageId) return t('playground.chatVoiceModeSpeaking')
        return t('playground.chatVoiceModeTapToSpeak')
    })()

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className='absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#0a0a0f]'
            >
                <div
                    className='pointer-events-none absolute inset-0'
                    style={{
                        background:
                            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(239,83,80,0.12), transparent)'
                    }}
                />
                <div
                    className='pointer-events-none absolute inset-0'
                    style={gridStyle}
                />

                <div className='bg-background border-border z-10 flex w-full items-center justify-between border-b px-5 py-2.5'>
                    <div className='flex items-center gap-2'>
                        <WaveformIcon className='h-4 w-4 text-[#ef5350]' />
                        <span className='text-sm font-semibold text-white'>
                            {t('playground.chatVoiceMode')}
                        </span>
                        <span className='rounded-md bg-[#ef5350]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ef5350]'>
                            {t('common.beta')}
                        </span>
                    </div>

                    <div className='flex items-center gap-2'>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className='flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/60 outline-none transition-colors hover:bg-white/10'>
                                    <MicrophoneIcon
                                        className='h-3 w-3 shrink-0 text-white/40'
                                        weight='fill'
                                    />
                                    <span>{selectedInputLabel}</span>
                                    <CaretDownIcon className='h-3 w-3 shrink-0 opacity-50' />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align='end'
                                className='max-w-[240px]'
                            >
                                <DropdownMenuRadioGroup
                                    value={selectedInputId}
                                    onValueChange={setSelectedInputId}
                                >
                                    {inputDevices.map((d) => (
                                        <DropdownMenuRadioItem
                                            key={d.deviceId}
                                            value={d.deviceId}
                                        >
                                            <span className='truncate'>
                                                {d.label ||
                                                    t(
                                                        'playground.chatVoiceModeInputDevice'
                                                    )}
                                            </span>
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                                {inputDevices.length === 0 && (
                                    <div className='text-muted-foreground flex items-center gap-2 px-2.5 py-2 text-xs'>
                                        <WarningIcon
                                            className='h-3.5 w-3.5 shrink-0 text-[#ef5350]'
                                            weight='fill'
                                        />
                                        {t(
                                            'playground.chatVoiceModeNoMicrophone'
                                        )}
                                    </div>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {supportsOutputSelection && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className='flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/60 outline-none transition-colors hover:bg-white/10'>
                                        <SpeakerHighIcon
                                            className='h-3 w-3 shrink-0 text-white/40'
                                            weight='fill'
                                        />
                                        <span>{selectedOutputLabel}</span>
                                        <CaretDownIcon className='h-3 w-3 shrink-0 opacity-50' />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align='end'
                                    className='max-w-[240px]'
                                >
                                    <DropdownMenuRadioGroup
                                        value={selectedOutputId}
                                        onValueChange={setSelectedOutputId}
                                    >
                                        {outputDevices.map((d) => (
                                            <DropdownMenuRadioItem
                                                key={d.deviceId}
                                                value={d.deviceId}
                                            >
                                                <span className='truncate'>
                                                    {d.label ||
                                                        t(
                                                            'playground.chatVoiceModeOutputDevice'
                                                        )}
                                                </span>
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                    {outputDevices.length === 0 && (
                                        <div className='text-muted-foreground flex items-center gap-2 px-2.5 py-2 text-xs'>
                                            <WarningIcon
                                                className='h-3.5 w-3.5 shrink-0 text-[#ef5350]'
                                                weight='fill'
                                            />
                                            {t(
                                                'playground.chatVoiceModeNoSpeaker'
                                            )}
                                        </div>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <button
                            onClick={handleClose}
                            title={t('playground.chatVoiceModeClose')}
                            className='ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white'
                        >
                            <XIcon className='h-4 w-4' weight='bold' />
                        </button>
                    </div>
                </div>

                {(hasNoInput || hasNoOutput) && (
                    <div className='z-10 flex w-full items-center gap-2 bg-[#ef5350]/10 px-5 py-2'>
                        <WarningIcon
                            className='h-4 w-4 shrink-0 text-[#ef5350]'
                            weight='fill'
                        />
                        <p className='text-xs text-[#ef5350]/80'>
                            {hasNoInput
                                ? t('playground.chatVoiceModeNoMicrophone')
                                : t('playground.chatVoiceModeNoSpeaker')}
                        </p>
                    </div>
                )}

                <div
                    className={`z-10 flex flex-col items-center ${sessionMessages.length > 0 ? 'pb-4 pt-10' : 'flex-1 justify-center'}`}
                >
                    <button
                        onClick={handleToggle}
                        disabled={isTranscribing || isStreaming || hasNoInput}
                        className='relative cursor-pointer transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60'
                        style={{ width: 120, height: 120 }}
                    >
                        <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
                            <VoiceOrb intensity={intensity} size={120} />
                        </div>
                    </button>
                    <p className='mt-6 text-sm text-zinc-400'>{statusLabel}</p>
                </div>

                {sessionMessages.length > 0 && (
                    <div
                        ref={transcriptRef}
                        className='z-10 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-6'
                    >
                        {sessionMessages.map((msg) => (
                            <ChatBubble
                                key={msg.id}
                                message={msg}
                                onSpeak={speak}
                                onStop={stopSpeech}
                                isSpeaking={ttsActiveMessageId === msg.id}
                                isLoading={ttsLoadingMessageId === msg.id}
                            />
                        ))}
                        <ChatTypingIndicator state={typingIndicator} />
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    )
}

export default VoiceModeOverlay