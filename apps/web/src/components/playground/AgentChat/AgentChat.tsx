import type { FC, ReactNode, DragEvent } from 'react'
import type {
    AgentChatProps,
    ChatAttachment,
    ChatImageSource,
    ChatInputHandle,
    ChatMessage
} from '@/ts/Interfaces'

import { useRef, useState, useEffect, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { GearSixIcon, PaperPlaneRightIcon } from '@phosphor-icons/react'
import { useAgentChat, useScrollToBottom, useTextToSpeech } from '@/hooks'
import {
    CHAT_MESSAGE_ROLE,
    CHAT_TYPING_INDICATOR,
    GATEWAY_CONNECTION_STATE,
    PRODUCT
} from '@/lib/constants'
import { ScrollToBottomButton } from '@/components/shared'
import ChatBubble from '@/components/playground/AgentChat/ChatBubble'
import ChatInput from '@/components/playground/AgentChat/ChatInput'
import ChatEmptyState from '@/components/playground/AgentChat/ChatEmptyState'
import ChatSkeleton from '@/components/playground/AgentChat/ChatSkeleton'
import ChatDateSeparator from '@/components/playground/AgentChat/ChatDateSeparator'
import { getLocale } from '@/lib'
import { usePreferencesStore } from '@/lib/store'
import ChatTypingIndicator from '@/components/playground/AgentChat/ChatTypingIndicator'
import VoiceModeOverlay from '@/components/playground/AgentChat/VoiceModeOverlay'

const readOnlyChatStore: Record<
    string,
    { role: 'user' | 'assistant'; text: string; time: string }[]
> = {}

const isDifferentDay = (a: ChatMessage, b: ChatMessage): boolean => {
    if (!a.timestamp || !b.timestamp) return false
    const dateA = new Date(a.timestamp)
    const dateB = new Date(b.timestamp)
    return (
        dateA.getFullYear() !== dateB.getFullYear() ||
        dateA.getMonth() !== dateB.getMonth() ||
        dateA.getDate() !== dateB.getDate()
    )
}

const AgentChat: FC<AgentChatProps> = ({
    agentId,
    agentName,
    subdomain,
    gatewayToken,
    agentModel,
    readOnly,
    onConfigure,
    configureDisabled,
    onConnectionStateChange
}): ReactNode => {
    const product = usePreferencesStore((s) => s.product)
    const isGo = product === PRODUCT.GO
    const {
        scrollRef,
        showButton,
        handleScroll,
        scrollToBottom,
        isAtBottomRef
    } = useScrollToBottom()
    const chatInputRef = useRef<ChatInputHandle>(null)
    const {
        activeMessageId,
        loadingMessageId,
        speak,
        stop,
        setOutputDeviceId
    } = useTextToSpeech()
    const [isDragging, setIsDragging] = useState(false)
    const [voiceModeOpen, setVoiceModeOpen] = useState(false)
    const dragCounterRef = useRef(0)

    const {
        messages,
        connectionState,
        isLoading,
        isStreaming,
        typingIndicator,
        sendMessage,
        abortResponse
    } = useAgentChat({
        subdomain,
        gatewayToken,
        agentId,
        enabled: !readOnly && !!subdomain && !!gatewayToken
    })

    useEffect(() => {
        onConnectionStateChange?.(connectionState)
    }, [connectionState, onConnectionStateChange])

    useEffect(() => {
        if (isAtBottomRef.current && scrollRef.current) {
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }
            })
        }
    }, [messages, typingIndicator])

    const handleSend = useCallback(
        (
            text: string,
            attachments?: ChatAttachment[],
            previews?: ChatImageSource[]
        ) => {
            sendMessage(text, attachments, previews)
            isAtBottomRef.current = true
        },
        [sendMessage]
    )

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault()
        dragCounterRef.current += 1
        if (dragCounterRef.current === 1) setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault()
        dragCounterRef.current -= 1
        if (dragCounterRef.current === 0) setIsDragging(false)
    }, [])

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
    }, [])

    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault()
        dragCounterRef.current = 0
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0 && chatInputRef.current) {
            chatInputRef.current.addFiles(files)
        }
    }, [])

    const getInitialMessages = useCallback(
        (id: string, name?: string) => {
            if (!readOnlyChatStore[id]) {
                const now = new Date().toLocaleTimeString(getLocale(), {
                    hour: '2-digit',
                    minute: '2-digit'
                })
                const isAlt = name && name.toLowerCase().includes('test')
                const userKey = isGo
                    ? isAlt
                        ? 'playground.chatReadOnlyGoUser2'
                        : 'playground.chatReadOnlyGoUser'
                    : isAlt
                      ? 'playground.chatReadOnlyUser2'
                      : 'playground.chatReadOnlyUser'
                const assistantKey = isGo
                    ? isAlt
                        ? 'playground.chatReadOnlyGoAssistant2'
                        : 'playground.chatReadOnlyGoAssistant'
                    : isAlt
                      ? 'playground.chatReadOnlyAssistant2'
                      : 'playground.chatReadOnlyAssistant'
                readOnlyChatStore[id] = [
                    {
                        role: CHAT_MESSAGE_ROLE.USER,
                        text: t(userKey),
                        time: now
                    },
                    {
                        role: CHAT_MESSAGE_ROLE.ASSISTANT,
                        text: t(assistantKey),
                        time: now
                    }
                ]
            }
            return readOnlyChatStore[id]
        },
        [isGo]
    )
    const [readOnlyMessages, setReadOnlyMessages] = useState(() =>
        getInitialMessages(agentId, agentName)
    )
    const [readOnlyInput, setReadOnlyInput] = useState('')
    const [readOnlyTyping, setReadOnlyTyping] = useState(false)
    const readOnlyScrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setReadOnlyMessages(getInitialMessages(agentId, agentName))
        setReadOnlyTyping(false)
        setReadOnlyInput('')
    }, [agentId, agentName, getInitialMessages])

    useEffect(() => {
        readOnlyChatStore[agentId] = readOnlyMessages
    }, [readOnlyMessages, agentId])

    const handleReadOnlySend = useCallback(() => {
        const text = readOnlyInput.trim()
        if (!text || readOnlyTyping) return
        const now = new Date().toLocaleTimeString(getLocale(), {
            hour: '2-digit',
            minute: '2-digit'
        })
        setReadOnlyMessages((prev) => [
            ...prev,
            { role: CHAT_MESSAGE_ROLE.USER, text, time: now }
        ])
        setReadOnlyInput('')
        setReadOnlyTyping(true)
        requestAnimationFrame(() => {
            readOnlyScrollRef.current?.scrollTo({
                top: readOnlyScrollRef.current.scrollHeight,
                behavior: 'smooth'
            })
        })
        setTimeout(() => {
            const replyTime = new Date().toLocaleTimeString(getLocale(), {
                hour: '2-digit',
                minute: '2-digit'
            })
            setReadOnlyMessages((prev) => [
                ...prev,
                {
                    role: CHAT_MESSAGE_ROLE.ASSISTANT,
                    text: t(
                        isGo
                            ? 'playground.chatReadOnlyGoReply'
                            : 'playground.chatReadOnlyReply'
                    ),
                    time: replyTime
                }
            ])
            setReadOnlyTyping(false)
            requestAnimationFrame(() => {
                readOnlyScrollRef.current?.scrollTo({
                    top: readOnlyScrollRef.current.scrollHeight,
                    behavior: 'smooth'
                })
            })
        }, 1200)
    }, [readOnlyInput, readOnlyTyping, isGo])

    if (readOnly) {
        return (
            <div className='flex h-full flex-col'>
                <div
                    ref={readOnlyScrollRef}
                    className='flex-1 space-y-3 overflow-y-auto p-4'
                >
                    {readOnlyMessages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex flex-col ${msg.role === CHAT_MESSAGE_ROLE.USER ? 'items-end' : 'items-start'} gap-1`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                                    msg.role === CHAT_MESSAGE_ROLE.USER
                                        ? 'rounded-br-md bg-[#ef5350]/15'
                                        : 'bg-foreground/5 rounded-bl-md'
                                }`}
                            >
                                <p
                                    className={`text-sm ${
                                        msg.role === CHAT_MESSAGE_ROLE.USER
                                            ? 'text-foreground/90'
                                            : 'text-foreground/80'
                                    }`}
                                >
                                    {msg.text}
                                </p>
                            </div>
                            <span className='text-muted-foreground px-1 text-[10px]'>
                                {msg.time}
                            </span>
                        </div>
                    ))}
                    <ChatTypingIndicator
                        state={
                            readOnlyTyping
                                ? CHAT_TYPING_INDICATOR.WRITING
                                : null
                        }
                    />
                </div>
                <div className='bg-background border-border border-t p-3'>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            handleReadOnlySend()
                        }}
                        className='flex items-end gap-2'
                    >
                        <input
                            value={readOnlyInput}
                            onChange={(e) => setReadOnlyInput(e.target.value)}
                            placeholder={t('playground.chatInputPlaceholder')}
                            className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50'
                        />
                        <button
                            type='submit'
                            disabled={!readOnlyInput.trim() || readOnlyTyping}
                            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ef5350] text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                        >
                            <PaperPlaneRightIcon
                                className='h-4 w-4'
                                weight='bold'
                            />
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    if (!agentModel) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-3 px-14 pb-16'>
                <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                    <GearSixIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                </div>
                <div className='text-center'>
                    <p className='text-foreground/80 text-sm font-medium'>
                        {t('playground.chatNotConfigured')}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        {t('playground.chatNotConfiguredDescription')}
                    </p>
                </div>
                {onConfigure && (
                    <button
                        onClick={onConfigure}
                        disabled={configureDisabled}
                        className='bg-foreground/10 text-foreground hover:bg-foreground/15 mt-2 flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
                    >
                        <GearSixIcon className='h-3.5 w-3.5' weight='bold' />
                        {t('playground.chatConfigureButton')}
                    </button>
                )}
            </div>
        )
    }

    if (!subdomain || !gatewayToken) {
        return (
            <div className='flex h-full flex-col'>
                <div className='flex-1 overflow-y-auto'>
                    <ChatEmptyState isError />
                </div>
            </div>
        )
    }

    const isConnected = connectionState === GATEWAY_CONNECTION_STATE.CONNECTED
    const isError =
        connectionState === GATEWAY_CONNECTION_STATE.ERROR ||
        connectionState === GATEWAY_CONNECTION_STATE.DISCONNECTED

    if (isLoading) {
        return (
            <div className='flex h-full flex-col'>
                <div className='flex-1 overflow-y-auto'>
                    <ChatSkeleton />
                </div>
                <ChatInput
                    isConnected={false}
                    isStreaming={false}
                    isProcessing={false}
                    onSend={handleSend}
                    onAbort={abortResponse}
                    allowAttach
                    onVoiceMode={() => setVoiceModeOpen(true)}
                />
            </div>
        )
    }

    return (
        <div
            className='relative flex h-full flex-col'
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#ef5350]/40 bg-black/60'>
                    <p className='text-foreground/80 text-sm font-medium'>
                        {t('playground.chatDropFiles')}
                    </p>
                    <p className='text-muted-foreground/70 text-xs'>
                        {t('playground.chatDropFilesDescription')}
                    </p>
                </div>
            )}

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className='flex-1 overflow-y-auto'
            >
                {messages.length === 0 ? (
                    <ChatEmptyState isError={isError} />
                ) : (
                    <div className='space-y-3 p-4'>
                        {messages.map((msg, idx) => (
                            <div key={msg.id}>
                                {(idx === 0 ||
                                    isDifferentDay(messages[idx - 1], msg)) &&
                                    msg.timestamp && (
                                        <ChatDateSeparator
                                            date={msg.timestamp}
                                        />
                                    )}
                                <ChatBubble
                                    message={msg}
                                    onSpeak={speak}
                                    onStop={stop}
                                    isSpeaking={activeMessageId === msg.id}
                                    isLoading={loadingMessageId === msg.id}
                                />
                            </div>
                        ))}
                        <ChatTypingIndicator state={typingIndicator} />
                    </div>
                )}
            </div>

            <ScrollToBottomButton
                visible={showButton && messages.length > 0}
                onClick={() => scrollToBottom('smooth')}
                className='bottom-[4.25rem]'
            />

            <ChatInput
                ref={chatInputRef}
                isConnected={isConnected}
                isStreaming={isStreaming}
                isProcessing={
                    typingIndicator === CHAT_TYPING_INDICATOR.THINKING
                }
                onSend={handleSend}
                onAbort={abortResponse}
                allowAttach
                onVoiceMode={() => setVoiceModeOpen(true)}
            />

            {voiceModeOpen && (
                <VoiceModeOverlay
                    onClose={() => setVoiceModeOpen(false)}
                    messages={messages}
                    sendMessage={sendMessage}
                    isStreaming={isStreaming}
                    typingIndicator={typingIndicator}
                    speak={speak}
                    stopSpeech={stop}
                    ttsActiveMessageId={activeMessageId}
                    ttsLoadingMessageId={loadingMessageId}
                    setOutputDeviceId={setOutputDeviceId}
                />
            )}
        </div>
    )
}

export default AgentChat