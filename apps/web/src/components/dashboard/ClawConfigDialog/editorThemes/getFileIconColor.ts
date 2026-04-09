import type { ClawFileType } from '@/ts/Types'

const getFileIconColor = (fileType: ClawFileType): string => {
    if (fileType === 'json') return 'h-3.5 w-3.5 shrink-0 text-yellow-500'
    if (fileType === 'javascript') return 'h-3.5 w-3.5 shrink-0 text-yellow-500'
    if (fileType === 'typescript') return 'h-3.5 w-3.5 shrink-0 text-blue-500'
    if (fileType === 'markdown') return 'h-3.5 w-3.5 shrink-0 text-blue-400'
    if (fileType === 'yaml') return 'h-3.5 w-3.5 shrink-0 text-purple-400'
    if (fileType === 'text') return 'h-3.5 w-3.5 shrink-0 text-zinc-400'
    return 'h-3.5 w-3.5 shrink-0'
}

export default getFileIconColor