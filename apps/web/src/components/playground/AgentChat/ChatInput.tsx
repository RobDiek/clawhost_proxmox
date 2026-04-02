import type {
    ReactNode,
    KeyboardEvent,
    ChangeEvent,
    ForwardRefRenderFunction
} from 'react'
import type {
    ChatAttachment,
    ChatImageSource,
    ChatInputAttachment,
    ChatInputHandle,
    ChatInputProps
} from '@/ts/Interfaces'

import {
    Fragment,
    useState,
    useRef,
    useCallback,
    useEffect,
    forwardRef,
    useImperativeHandle
} from 'react'
import { t } from '@openclaw/i18n'
import {
    PaperPlaneRightIcon,
    StopCircleIcon,
    PaperclipIcon,
    XIcon,
    MicrophoneIcon,
    WaveformIcon
} from '@phosphor-icons/react'
import { useSpeechRecognition } from '@/hooks'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DOCUMENT_TYPES = ['application/pdf', 'text/plain']
const SUPPORTED_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES]

const ChatInputInner: ForwardRefRenderFunction<
    ChatInputHandle,
    ChatInputProps
> = (
    {
        isConnected,
        isStreaming,
        isProcessing,
        onSend,
        onAbort,
        allowAttach,
        onVoiceMode
    },
    ref
): ReactNode => {
    const [input, setInput] = useState('')
    const [attachments, setAttachments] = useState<ChatInputAttachment[]>([])
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const appendTranscript = useCallback((text: string) => {
        if (typewriterRef.current) clearTimeout(typewriterRef.current)
        const chars = [...text]
        let i = 0
        setInput((prev) => (prev ? `${prev} ` : prev))
        const typeNext = () => {
            if (i < chars.length) {
                setInput((prev) => prev + chars[i])
                i++
                typewriterRef.current = setTimeout(typeNext, 30)
            } else {
                typewriterRef.current = null
            }
        }
        typeNext()
    }, [])
    useEffect(() => {
        return () => {
            if (typewriterRef.current) clearTimeout(typewriterRef.current)
        }
    }, [])
    const {
        isRecording,
        isTranscribing,
        toggle: toggleVoice
    } = useSpeechRecognition(appendTranscript)

    const resizeTextarea = useCallback(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        const maxHeight = 4 * 24
        const newHeight = Math.min(el.scrollHeight, maxHeight)
        el.style.height = `${newHeight}px`
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, [])

    useEffect(() => {
        resizeTextarea()
    }, [input, resizeTextarea])

    const addFiles = useCallback((files: File[]) => {
        const valid = files.filter((f) => SUPPORTED_TYPES.includes(f.type))
        if (valid.length === 0) return

        const newAttachments: ChatInputAttachment[] = valid.map((file) => {
            const isImage = IMAGE_TYPES.includes(file.type)
            return {
                file,
                preview: isImage ? URL.createObjectURL(file) : ''
            }
        })

        setAttachments((prev) => [...prev, ...newAttachments])
    }, [])

    useImperativeHandle(ref, () => ({ addFiles }), [addFiles])

    const handleSend = useCallback(() => {
        if (
            !isConnected ||
            (!input.trim() && attachments.length === 0) ||
            isStreaming
        )
            return

        const chatAttachments: ChatAttachment[] = []
        const previews: ChatImageSource[] = []

        const pending = attachments.map(
            (att) =>
                new Promise<void>((resolve) => {
                    const isImage = IMAGE_TYPES.includes(att.file.type)
                    const reader = new FileReader()
                    reader.onload = () => {
                        const base64 = (reader.result as string).split(',')[1]
                        if (base64) {
                            chatAttachments.push({
                                type: isImage ? 'image' : 'document',
                                source: {
                                    type: 'base64',
                                    mediaType: att.file.type,
                                    data: base64,
                                    filename: att.file.name
                                }
                            })
                            previews.push({
                                type: 'base64',
                                mediaType: att.file.type,
                                data: isImage ? base64 : '',
                                filename: att.file.name
                            })
                        }
                        resolve()
                    }
                    reader.onerror = () => resolve()
                    reader.readAsDataURL(att.file)
                })
        )

        Promise.all(pending).then(() => {
            onSend(
                input.trim() ||
                    (attachments.length > 0
                        ? attachments.map((a) => a.file.name).join(', ')
                        : ''),
                chatAttachments.length > 0 ? chatAttachments : undefined,
                previews.length > 0 ? previews : undefined
            )
            setInput('')
            setAttachments([])
            textareaRef.current?.focus()
        })
    }, [isConnected, input, isStreaming, onSend, attachments])

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
            }
        },
        [handleSend]
    )

    const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
    }, [])

    const handleAttachClick = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
        fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files || files.length === 0) return

            addFiles(Array.from(files))

            if (e.target) {
                e.target.value = ''
            }
        },
        [addFiles]
    )

    const handleRemoveAttachment = useCallback((index: number) => {
        setAttachments((prev) => {
            const removed = prev[index]
            if (removed?.preview) {
                URL.revokeObjectURL(removed.preview)
            }
            return prev.filter((_, i) => i !== index)
        })
    }, [])

    return (
        <div className='bg-background border-border border-t p-3'>
            {attachments.length > 0 && (
                <div className='mb-2 flex flex-wrap gap-2'>
                    {attachments.map((att, idx) => (
                        <div key={idx} className='group relative'>
                            {att.preview ? (
                                <img
                                    src={att.preview}
                                    alt={att.file.name}
                                    className='h-10 w-10 rounded object-cover'
                                />
                            ) : (
                                <div className='bg-foreground/10 flex h-10 w-10 items-center justify-center rounded'>
                                    <span className='text-muted-foreground text-[9px]'>
                                        {att.file.name
                                            .split('.')
                                            .pop()
                                            ?.toUpperCase()}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={() => handleRemoveAttachment(idx)}
                                aria-label={t(
                                    'playground.chatRemoveAttachment'
                                )}
                                className='bg-background text-muted-foreground ring-border hover:text-foreground absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full ring-1 transition-colors'
                            >
                                <XIcon className='h-2.5 w-2.5' weight='bold' />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className='flex items-end gap-2'>
                {onVoiceMode && (
                    <Fragment>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={onVoiceMode}
                                    aria-label={t('playground.chatVoiceMode')}
                                    className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white transition-opacity hover:opacity-90'
                                >
                                    <WaveformIcon
                                        className='h-4 w-4'
                                        weight='bold'
                                    />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                                <p>{t('playground.chatVoiceMode')}</p>
                            </TooltipContent>
                        </Tooltip>
                        <div className='bg-border mx-0.5 h-6 w-px shrink-0 self-center' />
                    </Fragment>
                )}
                <button
                    onClick={handleAttachClick}
                    disabled={!allowAttach}
                    aria-label={t('playground.chatAttachFile')}
                    className='border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                >
                    <PaperclipIcon className='h-4 w-4' weight='bold' />
                </button>
                <input
                    ref={fileInputRef}
                    type='file'
                    multiple
                    accept='image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain'
                    onChange={handleFileChange}
                    className='hidden'
                />
                <button
                    onClick={toggleVoice}
                    disabled={!allowAttach || isTranscribing}
                    aria-label={t('playground.chatVoiceInput')}
                    className={`border-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isRecording
                            ? 'animate-pulse bg-[#ef5350] text-white'
                            : isTranscribing
                              ? 'bg-foreground/10 text-foreground'
                              : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                    }`}
                >
                    {isTranscribing ? (
                        <div className='border-foreground/30 border-t-foreground h-4 w-4 animate-spin rounded-full border-2' />
                    ) : (
                        <MicrophoneIcon className='h-4 w-4' weight='bold' />
                    )}
                </button>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder={t('playground.chatInputPlaceholder')}
                    className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50'
                />
                {isStreaming || isProcessing ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={onAbort}
                                aria-label={t('playground.chatStopProcess')}
                                className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ef5350] text-white transition-colors hover:bg-[#e53935]'
                            >
                                <StopCircleIcon
                                    className='h-5 w-5'
                                    weight='bold'
                                />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side='top'>
                            <p>{t('playground.chatStopProcess')}</p>
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={
                            !isConnected ||
                            (!input.trim() && attachments.length === 0)
                        }
                        aria-label={t('playground.chatSend')}
                        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ef5350] text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        <PaperPlaneRightIcon
                            className='h-4 w-4'
                            weight='bold'
                        />
                    </button>
                )}
            </div>
        </div>
    )
}

const ChatInput = forwardRef(ChatInputInner)

export default ChatInput