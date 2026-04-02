import type { FC, ReactNode } from 'react'
import type { ChatBubbleProps, ChatImageSource } from '@/ts/Interfaces'

import { Fragment, useState } from 'react'
import { t } from '@openclaw/i18n'
import {
    StopCircleIcon,
    WarningIcon,
    FileTextIcon,
    DownloadSimpleIcon,
    CopyIcon,
    CheckIcon
} from '@phosphor-icons/react'
import { getLocale, copyToClipboard } from '@/lib'
import {
    CHAT_MESSAGE_ROLE,
    CHAT_MESSAGE_STATUS,
    TOAST_TYPE
} from '@/lib/constants'
import { useUIStore } from '@/lib/store'
import ChatMarkdown from '@/components/playground/AgentChat/ChatMarkdown'
import ChatLightbox from '@/components/playground/AgentChat/ChatLightbox'
import ChatSpeechButton from '@/components/playground/AgentChat/ChatSpeechButton'

const IMAGE_MIMES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
]

const FILE_EXT_TO_MIME: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp'
}

const FILENAME_PATTERN = /^(\S+\.\w{1,5})(,\s*\S+\.\w{1,5})*$/

const getImageSrc = (img: ChatImageSource): string => {
    if (img.type === 'url') return img.data
    return `data:${img.mediaType};base64,${img.data}`
}

const isImageAttachment = (img: ChatImageSource): boolean =>
    IMAGE_MIMES.includes(img.mediaType) && !!img.data

const ChatBubble: FC<ChatBubbleProps> = ({
    message,
    onSpeak,
    onStop,
    isSpeaking,
    isLoading
}): ReactNode => {
    const isUser = message.role === CHAT_MESSAGE_ROLE.USER
    const [lightboxImage, setLightboxImage] = useState<ChatImageSource | null>(
        null
    )
    const [lightboxFileName, setLightboxFileName] = useState<
        string | undefined
    >(undefined)
    const [copied, setCopied] = useState(false)
    const { showToast } = useUIStore()

    const copyMessage = async () => {
        await copyToClipboard(message.content)
        showToast(t('common.copied'), TOAST_TYPE.SUCCESS)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const openLightbox = (image: ChatImageSource, fileName?: string) => {
        setLightboxImage(image)
        setLightboxFileName(fileName)
    }

    const hasAttachments = message.images && message.images.length > 0
    const hasNonImageAttachments = message.images?.some(
        (img) => !isImageAttachment(img)
    )
    const contentLooksLikeFileName =
        isUser && FILENAME_PATTERN.test(message.content.trim())
    const showAsFileCard =
        contentLooksLikeFileName && (!hasAttachments || hasNonImageAttachments)

    const renderFileCard = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        const mime = FILE_EXT_TO_MIME[ext] || 'application/octet-stream'
        const fakeSource: ChatImageSource = {
            type: 'base64',
            mediaType: mime,
            data: ''
        }

        return (
            <button
                onClick={() => openLightbox(fakeSource, fileName)}
                className='border-border bg-foreground/5 hover:bg-foreground/10 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors'
            >
                <div className='bg-foreground/10 flex h-8 w-8 items-center justify-center rounded-lg'>
                    <FileTextIcon
                        className='text-muted-foreground h-4 w-4'
                        weight='duotone'
                    />
                </div>
                <div className='flex flex-col items-start'>
                    <span className='text-foreground/90 text-xs font-medium'>
                        {fileName}
                    </span>
                    <span className='text-muted-foreground text-[10px]'>
                        {ext.toUpperCase()}
                    </span>
                </div>
                <DownloadSimpleIcon
                    className='text-muted-foreground h-3.5 w-3.5'
                    weight='bold'
                />
            </button>
        )
    }

    const renderAttachments = (images: ChatImageSource[]) => (
        <div className='mb-2 flex flex-wrap gap-2'>
            {images.map((img, idx) => {
                if (!isImageAttachment(img)) {
                    const ext =
                        img.mediaType.split('/')[1]?.toUpperCase() || 'FILE'
                    const name =
                        img.filename ||
                        (showAsFileCard
                            ? message.content.trim()
                            : `file.${ext.toLowerCase()}`)
                    return (
                        <button
                            key={idx}
                            onClick={() => openLightbox(img, name)}
                            className='border-border bg-foreground/5 hover:bg-foreground/10 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors'
                        >
                            <div className='bg-foreground/10 flex h-8 w-8 items-center justify-center rounded-lg'>
                                <FileTextIcon
                                    className='text-muted-foreground h-4 w-4'
                                    weight='duotone'
                                />
                            </div>
                            <div className='flex flex-col items-start'>
                                <span className='text-foreground/90 text-xs font-medium'>
                                    {name}
                                </span>
                                <span className='text-muted-foreground text-[10px]'>
                                    {ext}
                                </span>
                            </div>
                            <DownloadSimpleIcon
                                className='text-muted-foreground h-3.5 w-3.5'
                                weight='bold'
                            />
                        </button>
                    )
                }

                return (
                    <button
                        key={idx}
                        onClick={() => openLightbox(img)}
                        className='overflow-hidden rounded-lg'
                    >
                        <img
                            src={getImageSrc(img)}
                            alt=''
                            loading='lazy'
                            className='max-h-48 rounded-lg transition-opacity hover:opacity-80'
                        />
                    </button>
                )
            })}
        </div>
    )

    const formattedTime = message.timestamp
        ? new Date(message.timestamp).toLocaleTimeString(getLocale(), {
              hour: '2-digit',
              minute: '2-digit'
          })
        : null

    if (isUser) {
        return (
            <Fragment>
                <div className='flex flex-col items-end gap-1'>
                    <div className='group relative max-w-[85%] rounded-2xl rounded-br-md bg-[#ef5350]/15 px-3.5 py-2.5'>
                        {!showAsFileCard && message.content && (
                            <button
                                onClick={copyMessage}
                                title={t('playground.chatCopyMessage')}
                                className='bg-background/80 absolute right-2.5 top-2.5 rounded-md p-1.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100'
                            >
                                {copied ? (
                                    <CheckIcon
                                        className='text-foreground/70 h-3 w-3'
                                        weight='bold'
                                    />
                                ) : (
                                    <CopyIcon
                                        className='text-foreground/70 hover:text-foreground h-3 w-3 transition-colors'
                                        weight='bold'
                                    />
                                )}
                            </button>
                        )}
                        {hasAttachments && renderAttachments(message.images!)}
                        {showAsFileCard && !hasNonImageAttachments && (
                            <div className='mb-2 flex flex-wrap gap-2'>
                                {message.content
                                    .trim()
                                    .split(/,\s*/)
                                    .map((name, idx) => (
                                        <div key={idx}>
                                            {renderFileCard(name)}
                                        </div>
                                    ))}
                            </div>
                        )}
                        {!showAsFileCard && (
                            <p className='text-foreground/90 whitespace-pre-wrap text-sm'>
                                {message.content}
                            </p>
                        )}
                    </div>
                    <div className='flex items-center gap-1.5 px-1'>
                        {formattedTime && (
                            <span className='text-muted-foreground text-[10px]'>
                                {formattedTime}
                            </span>
                        )}
                        {formattedTime &&
                            !showAsFileCard &&
                            message.content &&
                            onSpeak &&
                            onStop && (
                                <span className='text-muted-foreground text-[10px]'>
                                    ·
                                </span>
                            )}
                        {!showAsFileCard &&
                            message.content &&
                            onSpeak &&
                            onStop && (
                                <ChatSpeechButton
                                    messageId={message.id}
                                    text={message.content}
                                    isSpeaking={!!isSpeaking}
                                    isLoading={!!isLoading}
                                    onSpeak={onSpeak}
                                    onStop={onStop}
                                />
                            )}
                    </div>
                </div>
                {lightboxImage && (
                    <ChatLightbox
                        image={lightboxImage}
                        fileName={lightboxFileName}
                        onClose={() => setLightboxImage(null)}
                    />
                )}
            </Fragment>
        )
    }

    return (
        <Fragment>
            <div className='flex flex-col items-start gap-1'>
                <div className='bg-foreground/5 group relative min-w-0 max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5'>
                    {message.status === CHAT_MESSAGE_STATUS.COMPLETE &&
                        message.content && (
                            <button
                                onClick={copyMessage}
                                title={t('playground.chatCopyMessage')}
                                className='bg-background/80 absolute right-2.5 top-2.5 rounded-md p-1.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100'
                            >
                                {copied ? (
                                    <CheckIcon
                                        className='text-muted-foreground h-3 w-3'
                                        weight='bold'
                                    />
                                ) : (
                                    <CopyIcon
                                        className='text-muted-foreground hover:text-foreground h-3 w-3 transition-colors'
                                        weight='bold'
                                    />
                                )}
                            </button>
                        )}
                    {hasAttachments && renderAttachments(message.images!)}
                    <div className='text-foreground/80 min-w-0 text-sm'>
                        <ChatMarkdown content={message.content} />
                        {message.status === CHAT_MESSAGE_STATUS.STREAMING && (
                            <span className='bg-muted-foreground ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm' />
                        )}
                    </div>
                    {message.status === CHAT_MESSAGE_STATUS.ERROR && (
                        <div className='mt-2 flex items-center gap-1.5'>
                            <WarningIcon className='h-3 w-3 text-red-600 dark:text-red-400' />
                            <span className='text-[11px] text-red-600 dark:text-red-400'>
                                {t('playground.chatErrorMessage')}
                            </span>
                        </div>
                    )}
                    {message.status === CHAT_MESSAGE_STATUS.ABORTED && (
                        <div className='mt-2 flex items-center gap-1.5'>
                            <StopCircleIcon className='h-3 w-3 text-[#ef5350]' />
                            <span className='text-[11px] text-[#ef5350]'>
                                {t('playground.chatAbortedMessage')}
                            </span>
                        </div>
                    )}
                </div>
                <div className='flex items-center gap-1.5 px-1'>
                    {formattedTime && (
                        <span className='text-muted-foreground text-[10px]'>
                            {formattedTime}
                        </span>
                    )}
                    {formattedTime &&
                        message.status === CHAT_MESSAGE_STATUS.COMPLETE &&
                        message.content &&
                        onSpeak &&
                        onStop && (
                            <span className='text-muted-foreground text-[10px]'>
                                ·
                            </span>
                        )}
                    {message.status === CHAT_MESSAGE_STATUS.COMPLETE &&
                        message.content &&
                        onSpeak &&
                        onStop && (
                            <ChatSpeechButton
                                messageId={message.id}
                                text={message.content}
                                isSpeaking={!!isSpeaking}
                                isLoading={!!isLoading}
                                onSpeak={onSpeak}
                                onStop={onStop}
                            />
                        )}
                </div>
            </div>
            {lightboxImage && (
                <ChatLightbox
                    image={lightboxImage}
                    onClose={() => setLightboxImage(null)}
                />
            )}
        </Fragment>
    )
}

export default ChatBubble