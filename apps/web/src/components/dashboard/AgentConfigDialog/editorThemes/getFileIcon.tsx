import type { ReactNode } from 'react'

import {
    FileIcon,
    FileJsIcon,
    FileTsIcon,
    FileMdIcon,
    FileTextIcon,
    FileHtmlIcon,
    FileCssIcon,
    FilePyIcon,
    FileCodeIcon
} from '@phosphor-icons/react'

const EXT_ICON_MAP: Record<string, typeof FileIcon> = {
    js: FileJsIcon,
    mjs: FileJsIcon,
    cjs: FileJsIcon,
    jsx: FileJsIcon,
    ts: FileTsIcon,
    tsx: FileTsIcon,
    md: FileMdIcon,
    mdx: FileMdIcon,
    html: FileHtmlIcon,
    htm: FileHtmlIcon,
    css: FileCssIcon,
    scss: FileCssIcon,
    py: FilePyIcon,
    sh: FileCodeIcon,
    bash: FileCodeIcon,
    zsh: FileCodeIcon,
    fish: FileCodeIcon,
    json: FileCodeIcon,
    jsonl: FileCodeIcon,
    yaml: FileTextIcon,
    yml: FileTextIcon,
    toml: FileTextIcon,
    txt: FileTextIcon,
    env: FileTextIcon,
    cfg: FileTextIcon,
    ini: FileTextIcon,
    conf: FileTextIcon
}

const getFileIconByName = (filename: string, className: string): ReactNode => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const IconComponent = EXT_ICON_MAP[ext] || FileIcon
    return <IconComponent className={className} />
}

export default getFileIconByName