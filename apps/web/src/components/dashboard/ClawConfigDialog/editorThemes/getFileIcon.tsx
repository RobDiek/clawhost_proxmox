import type { ReactNode } from 'react'
import type { ClawFileType } from '@/ts/Types'

import {
    FileIcon,
    FileJsIcon,
    FileTsIcon,
    FileMdIcon,
    FileTextIcon
} from '@phosphor-icons/react'

const getFileIcon = (fileType: ClawFileType, className: string): ReactNode => {
    if (fileType === 'json' || fileType === 'javascript')
        return <FileJsIcon className={className} />
    if (fileType === 'typescript') return <FileTsIcon className={className} />
    if (fileType === 'markdown') return <FileMdIcon className={className} />
    if (fileType === 'yaml' || fileType === 'text')
        return <FileTextIcon className={className} />
    return <FileIcon className={className} />
}

export default getFileIcon