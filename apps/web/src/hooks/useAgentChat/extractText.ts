import type { RawChatContentObject } from '@/ts/Interfaces'

import { CHAT_CONTENT_BLOCK_TYPE } from '@/lib/constants'

const extractText = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
        return content
            .filter((c) => c.type === CHAT_CONTENT_BLOCK_TYPE.TEXT)
            .map((c) => c.text)
            .join('\n')
    }
    if (content && typeof content === 'object') {
        const obj = content as RawChatContentObject
        if (typeof obj.content === 'string') return obj.content
        if (Array.isArray(obj.content)) return extractText(obj.content)
        if (typeof obj.text === 'string') return obj.text
        if (Array.isArray(obj.choices)) {
            const choice = obj.choices[0]
            if (choice) {
                const msg = choice.message ?? choice.delta
                if (msg && typeof msg.content === 'string') return msg.content
            }
        }
    }
    return ''
}

export default extractText