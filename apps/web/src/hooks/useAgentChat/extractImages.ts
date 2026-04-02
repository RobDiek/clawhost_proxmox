import type { ChatImageSource } from '@/ts/Interfaces'

import { CHAT_CONTENT_BLOCK_TYPE } from '@/lib/constants'

const extractImages = (content: unknown): ChatImageSource[] => {
    if (!Array.isArray(content)) return []

    return content
        .filter(
            (block) =>
                block.type === CHAT_CONTENT_BLOCK_TYPE.IMAGE &&
                (block.source || block.url || block.data)
        )
        .map((block) => {
            if (block.url) {
                return {
                    type: 'url',
                    mediaType:
                        block.media_type ||
                        block.mediaType ||
                        block.mimeType ||
                        'image/png',
                    data: block.url as string
                }
            }
            if (!block.source && block.data) {
                return {
                    type: 'base64',
                    mediaType:
                        block.mimeType ||
                        block.media_type ||
                        block.mediaType ||
                        'image/png',
                    data: block.data as string
                }
            }
            if (block.source?.type === 'url' || block.source?.url) {
                return {
                    type: 'url',
                    mediaType:
                        block.source.media_type ||
                        block.source.mediaType ||
                        'image/png',
                    data: (block.source.url || block.source.data) as string
                }
            }
            return {
                type: block.source.type || 'base64',
                mediaType:
                    block.source.media_type ||
                    block.source.mediaType ||
                    'image/png',
                data: block.source.data || ''
            }
        })
}

export default extractImages