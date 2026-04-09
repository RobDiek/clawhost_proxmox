import type { FC, ReactNode } from 'react'
import type { VoiceModeOverlayProps } from '@/ts/Interfaces'

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    XIcon,
    WaveformIcon,
    MicrophoneIcon,
    SpeakerHighIcon,
    WarningIcon
} from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { CHAT_TYPING_INDICATOR } from '@/lib/constants'
import VoiceOrb from '@/components/playground/AgentChat/VoiceOrb'
import ChatBubble from '@/components/playground/AgentChat/ChatBubble'
import ChatTypingIndicator from '@/components/playground/AgentChat/ChatTypingIndicator'
import useAudioDevices from '@/components/playground/AgentChat/VoiceModeOverlay/useAudioDevices'
import useVoiceRecorder from '@/components/playground/AgentChat/VoiceModeOverlay/useVoiceRecorder'
import useIdleVoiceAnimation from '@/components/playground/AgentChat/VoiceModeOverlay/useIdleVoiceAnimation'
import useAutoSpeakLastMessage from '@/components/playground/AgentChat/VoiceModeOverlay/useAutoSpeakLastMessage'
import DeviceSelectorDropdown from '@/components/playground/AgentChat/VoiceModeOverlay/DeviceSelectorDropdown'

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
    const sendMessageRef = useRef(sendMessage)
    const sessionStartIndexRef = useRef(messages.length)
    const transcriptRef = useRef<HTMLDivElement>(null)
    const prevTtsActiveRef = useRef<string | null>(ttsActiveMessageId)

    useEffect(() => {
        sendMessageRef.current = sendMessage
    }, [sendMessage])

    const {
        inputDevices,
        outputDevices,
        selectedInputId,
        selectedOutputId,
        setSelectedInputId,
        setSelectedOutputId,
        hasNoInput,
        hasNoOutput
    } = useAudioDevices()

    const {
        isRecording,
        isTranscribing,
        intensity,
        setIntensity,
        startRecording,
        stopAndTranscribe,
        cleanup
    } = useVoiceRecorder({ sendMessageRef, hasNoInput })

    const sessionMessages = messages.slice(sessionStartIndexRef.current)

    useEffect(() => {
        setOutputDeviceId(selectedOutputId || null)
    }, [selectedOutputId, setOutputDeviceId])

    useIdleVoiceAnimation({
        isRecording,
        isTranscribing,
        isStreaming,
        typingIndicator,
        ttsActiveMessageId,
        ttsLoadingMessageId,
        setIntensity
    })

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

    useAutoSpeakLastMessage({ sessionMessages, speak })

    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
    }, [sessionMessages.length, typingIndicator])

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
        cleanup()
        stopSpeech()
        onClose()
    }, [cleanup, stopSpeech, onClose])

    const selectedInputLabel =
        inputDevices.find((d) => d.deviceId === selectedInputId)?.label ||
        t('playground.chatVoiceModeInputDevice')
    const selectedOutputLabel =
        outputDevices.find((d) => d.deviceId === selectedOutputId)?.label ||
        t('playground.chatVoiceModeOutputDevice')

    const statusLabel = (() => {
        if (hasNoInput) return t('playground.chatVoiceModeNoMicrophone')
        if (isRecording) return t('playground.chatVoiceModeListening')
        if (isTranscribing) return t('playground.chatVoiceModeTranscribing')
        if (typingIndicator === CHAT_TYPING_INDICATOR.THINKING)
            return t('playground.chatVoiceModeThinking')
        if (typingIndicator === CHAT_TYPING_INDICATOR.WRITING || isStreaming)
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
                        <DeviceSelectorDropdown
                            icon={
                                <MicrophoneIcon
                                    className='h-3 w-3 shrink-0 text-white/40'
                                    weight='fill'
                                />
                            }
                            label={selectedInputLabel}
                            value={selectedInputId}
                            onValueChange={setSelectedInputId}
                            devices={inputDevices}
                            fallbackLabel={t(
                                'playground.chatVoiceModeInputDevice'
                            )}
                            emptyLabel={t(
                                'playground.chatVoiceModeNoMicrophone'
                            )}
                        />
                        {supportsOutputSelection && (
                            <DeviceSelectorDropdown
                                icon={
                                    <SpeakerHighIcon
                                        className='h-3 w-3 shrink-0 text-white/40'
                                        weight='fill'
                                    />
                                }
                                label={selectedOutputLabel}
                                value={selectedOutputId}
                                onValueChange={setSelectedOutputId}
                                devices={outputDevices}
                                fallbackLabel={t(
                                    'playground.chatVoiceModeOutputDevice'
                                )}
                                emptyLabel={t(
                                    'playground.chatVoiceModeNoSpeaker'
                                )}
                            />
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