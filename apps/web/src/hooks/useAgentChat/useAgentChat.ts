import type {
    ChatAttachment,
    ChatEventPayload,
    ChatHistoryEntry,
    ChatImageSource,
    ChatMessage,
    GatewayHistoryResult,
    GatewaySession,
    GatewaySessionsResult,
    UseAgentChatParams,
    UseAgentChatReturn
} from '@/ts/Interfaces'
import type { ChatTypingIndicator, GatewayConnectionState } from '@/ts/Types'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SharedGateway } from '@/lib/gateway'
import {
    CHAT_MESSAGE_ROLE,
    CHAT_MESSAGE_STATUS,
    CHAT_TYPING_INDICATOR,
    GATEWAY_CONNECTION_STATE
} from '@/lib/constants'
import extractText from '@/hooks/useAgentChat/extractText'
import extractImages from '@/hooks/useAgentChat/extractImages'
import extractTimestamp from '@/hooks/useAgentChat/extractTimestamp'
import stripMetadata from '@/hooks/useAgentChat/stripMetadata'

const useAgentChat = ({
    subdomain,
    gatewayToken,
    agentId,
    enabled
}: UseAgentChatParams): UseAgentChatReturn => {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [connectionState, setConnectionState] =
        useState<GatewayConnectionState>(GATEWAY_CONNECTION_STATE.DISCONNECTED)
    const [isLoading, setIsLoading] = useState(true)
    const [isStreaming, setIsStreaming] = useState(false)
    const [typingIndicator, setTypingIndicator] =
        useState<ChatTypingIndicator>(null)
    const clientRef = useRef<ReturnType<typeof SharedGateway.acquire> | null>(
        null
    )
    const currentRunIdRef = useRef<string | null>(null)
    const streamBufferRef = useRef('')
    const streamImagesRef = useRef<ChatMessage['images']>([])
    const rafRef = useRef<number | null>(null)
    const mountedRef = useRef(true)
    const sessionKeyRef = useRef(`agent:${agentId}:main`)

    const flushStreamBuffer = useCallback(() => {
        rafRef.current = null
        const content = streamBufferRef.current

        if (!content) return

        setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.status === CHAT_MESSAGE_STATUS.STREAMING)
                return [...prev.slice(0, -1), { ...last, content }]
            return prev
        })
    }, [])

    useEffect(() => {
        mountedRef.current = true
        sessionKeyRef.current = `agent:${agentId}:main`

        if (!enabled || !subdomain || !gatewayToken) {
            setConnectionState(GATEWAY_CONNECTION_STATE.DISCONNECTED)
            setIsLoading(false)
            return
        }

        const client = SharedGateway.acquire(subdomain, gatewayToken)
        clientRef.current = client

        const loadHistory = () => {
            client
                .send('sessions.list', {})
                .then((result) => {
                    if (!mountedRef.current) return
                    const raw = result as GatewaySessionsResult
                    const sessions: GatewaySession[] = Array.isArray(raw)
                        ? raw
                        : Array.isArray(raw?.sessions)
                          ? raw.sessions
                          : []
                    const agentPrefix = `agent:${agentId}:`
                    const agentSession = sessions.find((s) => {
                        const key = s.key || s.sessionKey
                        return key?.startsWith(agentPrefix)
                    })
                    if (agentSession) {
                        const resolved =
                            agentSession.key || agentSession.sessionKey
                        if (resolved) {
                            sessionKeyRef.current = resolved
                        }
                    }
                    return client.send('chat.history', {
                        sessionKey: sessionKeyRef.current,
                        limit: 500
                    })
                })
                .then((result) => {
                    if (!mountedRef.current) return
                    const raw = result as GatewayHistoryResult
                    const history: ChatHistoryEntry[] = Array.isArray(raw)
                        ? raw
                        : Array.isArray(raw?.messages)
                          ? raw.messages
                          : Array.isArray(raw?.history)
                            ? raw.history
                            : []
                    if (history.length > 0) {
                        const loaded: ChatMessage[] = []
                        let lastTimestamp = new Date().toISOString()
                        for (let i = 0; i < history.length; i++) {
                            const msg = history[i]
                            if (
                                msg.role === 'toolResult' ||
                                msg.role === 'toolCall'
                            )
                                continue
                            const isUser = msg.role === CHAT_MESSAGE_ROLE.USER
                            const text = extractText(msg.content)
                            if (!text.trim()) continue
                            if (isUser) {
                                const extracted = extractTimestamp(text)
                                if (extracted) lastTimestamp = extracted
                            }
                            const images = extractImages(msg.content)
                            loaded.push({
                                id: `history-${i}`,
                                role: isUser
                                    ? CHAT_MESSAGE_ROLE.USER
                                    : CHAT_MESSAGE_ROLE.ASSISTANT,
                                content: isUser ? stripMetadata(text) : text,
                                status: CHAT_MESSAGE_STATUS.COMPLETE,
                                timestamp: lastTimestamp,
                                images:
                                    images && images.length > 0
                                        ? images
                                        : undefined
                            })
                        }
                        setMessages(loaded)
                    }
                    setIsLoading(false)
                })
                .catch(() => {
                    if (mountedRef.current) setIsLoading(false)
                })
        }

        const handleStateChange = (state: GatewayConnectionState) => {
            if (!mountedRef.current) return
            setConnectionState(state)

            if (
                state === GATEWAY_CONNECTION_STATE.ERROR ||
                state === GATEWAY_CONNECTION_STATE.DISCONNECTED
            ) {
                setIsLoading(false)
            }

            if (state === GATEWAY_CONNECTION_STATE.CONNECTED) {
                loadHistory()
            }
        }

        const handleChatEvent = (payload: unknown) => {
            if (!mountedRef.current) return

            const event = payload as ChatEventPayload
            if (event.sessionKey && event.sessionKey !== sessionKeyRef.current)
                return

            const rawContent =
                (event.message as ChatHistoryEntry)?.content ?? event.message
            const text = extractText(rawContent)
            const images = extractImages(rawContent)

            if (event.state === 'delta' || event.state === 'final') {
                if (text) {
                    if (!currentRunIdRef.current) {
                        currentRunIdRef.current =
                            event.runId || crypto.randomUUID()
                        setIsStreaming(true)
                        setTypingIndicator(CHAT_TYPING_INDICATOR.WRITING)
                        streamBufferRef.current = text
                        streamImagesRef.current =
                            images.length > 0 ? images : undefined
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: currentRunIdRef.current!,
                                role: CHAT_MESSAGE_ROLE.ASSISTANT,
                                content: text,
                                status: CHAT_MESSAGE_STATUS.STREAMING,
                                runId: currentRunIdRef.current!,
                                timestamp: new Date().toISOString(),
                                images: images.length > 0 ? images : undefined
                            }
                        ])
                    } else {
                        streamBufferRef.current = text
                        if (images.length > 0) {
                            streamImagesRef.current = images
                        }
                        if (!rafRef.current) {
                            rafRef.current =
                                requestAnimationFrame(flushStreamBuffer)
                        }
                    }
                }

                if (event.state === 'final') {
                    if (rafRef.current) {
                        cancelAnimationFrame(rafRef.current)
                        rafRef.current = null
                    }
                    const finalContent = streamBufferRef.current
                    const finalImages = streamImagesRef.current
                    setMessages((prev) => {
                        const last = prev[prev.length - 1]
                        if (
                            last &&
                            last.status === CHAT_MESSAGE_STATUS.STREAMING
                        ) {
                            return [
                                ...prev.slice(0, -1),
                                {
                                    ...last,
                                    content: finalContent || last.content,
                                    status: CHAT_MESSAGE_STATUS.COMPLETE,
                                    images:
                                        finalImages && finalImages.length > 0
                                            ? finalImages
                                            : last.images
                                }
                            ]
                        }
                        return prev
                    })
                    currentRunIdRef.current = null
                    streamBufferRef.current = ''
                    streamImagesRef.current = []
                    setIsStreaming(false)
                    setTypingIndicator(null)
                }
            } else if (event.state === 'error') {
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current)
                    rafRef.current = null
                }

                setMessages((prev) => {
                    const last = prev[prev.length - 1]
                    if (last && last.status === CHAT_MESSAGE_STATUS.STREAMING) {
                        return [
                            ...prev.slice(0, -1),
                            { ...last, status: CHAT_MESSAGE_STATUS.ERROR }
                        ]
                    }
                    return prev
                })
                currentRunIdRef.current = null
                streamBufferRef.current = ''
                streamImagesRef.current = []
                setIsStreaming(false)
                setTypingIndicator(null)
            } else if (event.state === 'aborted') {
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current)
                    rafRef.current = null
                }

                const abortedContent = streamBufferRef.current
                setMessages((prev) => {
                    const last = prev[prev.length - 1]
                    if (last && last.runId === event.runId) {
                        return [
                            ...prev.slice(0, -1),
                            {
                                ...last,
                                content: abortedContent || last.content,
                                status: CHAT_MESSAGE_STATUS.ABORTED
                            }
                        ]
                    }
                    return prev
                })
                currentRunIdRef.current = null
                streamBufferRef.current = ''
                streamImagesRef.current = []
                setIsStreaming(false)
                setTypingIndicator(null)
            }
        }

        client.addStateListener(handleStateChange)
        client.on('chat', handleChatEvent)

        if (client.state === GATEWAY_CONNECTION_STATE.CONNECTED) {
            setConnectionState(GATEWAY_CONNECTION_STATE.CONNECTED)
            loadHistory()
        } else if (
            client.state === GATEWAY_CONNECTION_STATE.CONNECTING ||
            client.state === GATEWAY_CONNECTION_STATE.AUTHENTICATING
        ) {
            setConnectionState(client.state)
        }

        return () => {
            mountedRef.current = false
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
            client.off('chat', handleChatEvent)
            client.removeStateListener(handleStateChange)
            SharedGateway.release(subdomain)
            clientRef.current = null
        }
    }, [subdomain, gatewayToken, agentId, enabled, flushStreamBuffer])

    const sendMessage = useCallback(
        (
            text: string,
            attachments?: ChatAttachment[],
            previews?: ChatImageSource[]
        ) => {
            if (!clientRef.current || !text.trim()) return

            const userMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: CHAT_MESSAGE_ROLE.USER,
                content: text.trim(),
                status: CHAT_MESSAGE_STATUS.COMPLETE,
                timestamp: new Date().toISOString(),
                images: previews && previews.length > 0 ? previews : undefined
            }

            setMessages((prev) => [...prev, userMessage])
            setTypingIndicator(CHAT_TYPING_INDICATOR.THINKING)
            streamBufferRef.current = ''
            currentRunIdRef.current = null

            const params: Record<string, unknown> = {
                sessionKey: sessionKeyRef.current,
                message: text.trim(),
                deliver: true,
                timeoutMs: 120000,
                idempotencyKey: crypto.randomUUID()
            }

            if (attachments && attachments.length > 0) {
                params.attachments = attachments.map((att) => ({
                    type: att.type,
                    mimeType: att.source.mediaType,
                    content: att.source.data
                }))
            }

            clientRef.current.send('chat.send', params).catch(() => {})
        },
        []
    )

    const abortResponse = useCallback(() => {
        if (!clientRef.current) return

        const params: Record<string, string> = {
            sessionKey: sessionKeyRef.current
        }
        if (currentRunIdRef.current) {
            params.runId = currentRunIdRef.current
        }

        clientRef.current.send('chat.abort', params).catch(() => {})
        setTypingIndicator(null)
    }, [])

    return {
        messages,
        connectionState,
        isLoading,
        isStreaming,
        typingIndicator,
        sendMessage,
        abortResponse
    }
}

export default useAgentChat