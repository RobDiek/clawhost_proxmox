import type { FC, ReactNode } from 'react'
import type { ClawFileExplorerDialogProps } from '@/ts/Interfaces'
import type { ClawFileType } from '@/ts/Types'

import { Fragment, useState, useCallback, useMemo } from 'react'
import { t } from '@openclaw/i18n'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Skeleton
} from '@/components/ui'
import {
    CircleNotchIcon,
    FloppyDiskIcon,
    MagnifyingGlassIcon,
    FileIcon,
    FileJsIcon,
    FileTsIcon,
    FileMdIcon,
    FileTextIcon,
    FolderOpenIcon,
    XIcon
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useClawFiles, useClawFile, useUpdateClawFile } from '@/hooks'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { THEMES } from '@/lib'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { createTheme } from '@uiw/codemirror-themes'
import { tags } from '@lezer/highlight'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'

const darkEditorTheme = createTheme({
    theme: 'dark',
    settings: {
        background: '#000000',
        foreground: '#d4d4d8',
        caret: '#d4d4d8',
        selection: '#264f78',
        selectionMatch: '#264f7844',
        lineHighlight: '#ffffff08',
        gutterBackground: '#000000',
        gutterForeground: '#525252'
    },
    styles: [
        { tag: tags.propertyName, color: '#93c5fd' },
        { tag: tags.string, color: '#86efac' },
        { tag: tags.number, color: '#fde68a' },
        { tag: tags.bool, color: '#f9a8d4' },
        { tag: tags.null, color: '#a78bfa' },
        { tag: tags.punctuation, color: '#a1a1aa' },
        { tag: tags.keyword, color: '#c084fc' },
        { tag: tags.function(tags.variableName), color: '#67e8f9' },
        { tag: tags.comment, color: '#6b7280' },
        { tag: tags.operator, color: '#f9a8d4' },
        { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
        { tag: tags.emphasis, color: '#d4d4d8', fontStyle: 'italic' },
        { tag: tags.strong, color: '#d4d4d8', fontWeight: 'bold' },
        { tag: tags.link, color: '#67e8f9' },
        { tag: tags.url, color: '#86efac' }
    ]
})

const lightEditorTheme = createTheme({
    theme: 'light',
    settings: {
        background: '#fafafa',
        foreground: '#18181b',
        caret: '#18181b',
        selection: '#c7d2fe',
        selectionMatch: '#c7d2fe66',
        lineHighlight: '#00000008',
        gutterBackground: '#fafafa',
        gutterForeground: '#a1a1aa'
    },
    styles: [
        { tag: tags.propertyName, color: '#2563eb' },
        { tag: tags.string, color: '#16a34a' },
        { tag: tags.number, color: '#d97706' },
        { tag: tags.bool, color: '#db2777' },
        { tag: tags.null, color: '#7c3aed' },
        { tag: tags.punctuation, color: '#71717a' },
        { tag: tags.keyword, color: '#7c3aed' },
        { tag: tags.function(tags.variableName), color: '#0891b2' },
        { tag: tags.comment, color: '#9ca3af' },
        { tag: tags.operator, color: '#db2777' },
        { tag: tags.heading, color: '#2563eb', fontWeight: 'bold' },
        { tag: tags.emphasis, color: '#18181b', fontStyle: 'italic' },
        { tag: tags.strong, color: '#18181b', fontWeight: 'bold' },
        { tag: tags.link, color: '#0891b2' },
        { tag: tags.url, color: '#16a34a' }
    ]
})

const editorStyles = EditorView.theme({
    '&': { fontSize: '12px', height: '100%' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': { borderRight: 'none' }
})

const EDITABLE_FILE_TYPES: ClawFileType[] = [
    'json',
    'markdown',
    'javascript',
    'typescript',
    'yaml',
    'text'
]

const getLanguageExtension = (fileType: ClawFileType) => {
    if (fileType === 'json') return json()
    if (fileType === 'javascript') return javascript()
    if (fileType === 'typescript') return javascript({ typescript: true })
    if (fileType === 'markdown') return markdown()
    if (fileType === 'yaml') return yaml()
    return null
}

const getFileIcon = (fileType: ClawFileType, className: string): ReactNode => {
    if (fileType === 'json' || fileType === 'javascript')
        return <FileJsIcon className={className} />
    if (fileType === 'typescript') return <FileTsIcon className={className} />
    if (fileType === 'markdown') return <FileMdIcon className={className} />
    if (fileType === 'yaml' || fileType === 'text')
        return <FileTextIcon className={className} />
    return <FileIcon className={className} />
}

const getFileIconColor = (fileType: ClawFileType): string => {
    if (fileType === 'json') return 'h-3.5 w-3.5 shrink-0 text-yellow-500'
    if (fileType === 'javascript') return 'h-3.5 w-3.5 shrink-0 text-yellow-500'
    if (fileType === 'typescript') return 'h-3.5 w-3.5 shrink-0 text-blue-500'
    if (fileType === 'markdown') return 'h-3.5 w-3.5 shrink-0 text-blue-400'
    if (fileType === 'yaml') return 'h-3.5 w-3.5 shrink-0 text-purple-400'
    if (fileType === 'text') return 'h-3.5 w-3.5 shrink-0 text-zinc-400'
    return 'h-3.5 w-3.5 shrink-0'
}

const ClawConfigDialog: FC<ClawFileExplorerDialogProps> = ({
    clawId,
    open,
    onOpenChange
}): ReactNode => {
    const queryClient = useQueryClient()
    const storeTheme = usePreferencesStore((s) => s.theme)
    const resolvedTheme =
        storeTheme === THEMES.SYSTEM
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? THEMES.DARK
                : THEMES.LIGHT
            : storeTheme
    const files = useClawFiles(clawId, open)
    const updateFile = useUpdateClawFile()
    const showToast = useUIStore((s) => s.showToast)
    const [selectedPath, setSelectedPath] = useState('')
    const [editedContent, setEditedContent] = useState('')
    const [jsonError, setJsonError] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const selectedFile = files.data?.files.find((f) => f.path === selectedPath)
    const fileType = selectedFile?.fileType ?? 'unknown'
    const isEditable = EDITABLE_FILE_TYPES.includes(fileType)
    const isJson = fileType === 'json'

    const fileContent = useClawFile(
        clawId,
        selectedPath,
        open && selectedPath.length > 0
    )

    const handleOpen = (isOpen: boolean) => {
        if (!isOpen) {
            setSelectedPath('')
            setEditedContent('')
            setJsonError(false)
            setSearchQuery('')
            updateFile.reset()
            queryClient.removeQueries({
                queryKey: ['claw-files', clawId]
            })
            queryClient.removeQueries({
                queryKey: ['claw-file', clawId]
            })
        }
        onOpenChange(isOpen)
    }

    const handleSelectFile = (path: string) => {
        if (path === selectedPath) return
        setSelectedPath(path)
        setEditedContent('')
        setJsonError(false)
        updateFile.reset()
        queryClient.removeQueries({
            queryKey: ['claw-file', clawId, selectedPath]
        })
    }

    const handleContentLoaded = useCallback(
        (content: string, type: ClawFileType) => {
            if (type === 'json') {
                try {
                    const parsed = JSON.parse(content)
                    return JSON.stringify(parsed, null, 4)
                } catch {
                    return content
                }
            }
            return content
        },
        []
    )

    const currentContent = fileContent.data?.content
    const formattedOriginal =
        currentContent !== undefined
            ? handleContentLoaded(currentContent, fileType)
            : ''
    const displayContent =
        currentContent !== undefined && editedContent === ''
            ? formattedOriginal
            : editedContent
    const hasUnsavedChanges =
        editedContent !== '' && editedContent !== formattedOriginal

    const handleChange = useCallback((value: string) => {
        setEditedContent(value)
    }, [])

    const handleJsonChange = useCallback((value: string) => {
        setEditedContent(value)
        try {
            JSON.parse(value)
            setJsonError(false)
        } catch {
            setJsonError(true)
        }
    }, [])

    const handleSave = () => {
        if (jsonError || !selectedPath || !isEditable) return

        const rawContent = editedContent || displayContent

        let content = rawContent
        if (isJson) {
            try {
                content = JSON.stringify(JSON.parse(rawContent))
            } catch {
                setJsonError(true)
                return
            }
        }

        updateFile.mutate(
            { id: clawId, data: { path: selectedPath, content } },
            {
                onSuccess: () => {
                    setEditedContent('')
                    queryClient.invalidateQueries({
                        queryKey: ['claw-file', clawId, selectedPath]
                    })
                    showToast(t('dashboard.fileExplorerSaved'), TOAST_TYPE.SUCCESS)
                },
                onError: (err) => {
                    showToast(
                        err.message || t('api.failedToUpdateFile'),
                        TOAST_TYPE.ERROR
                    )
                }
            }
        )
    }

    const editorExtensions = useMemo(() => {
        const langExt = getLanguageExtension(fileType)
        return langExt ? [langExt, editorStyles] : [editorStyles]
    }, [fileType])

    const filteredFiles = files.data?.files.filter((file) =>
        searchQuery === ''
            ? true
            : file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              file.path.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const groupedFiles = filteredFiles?.reduce<
        Record<string, typeof filteredFiles>
    >((acc, file) => {
        const parts = file.path.split('/')
        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
        if (!acc[dir]) acc[dir] = []
        acc[dir].push(file)
        return acc
    }, {})

    const folders = groupedFiles
        ? Object.entries(groupedFiles)
              .filter(([dir]) => dir !== '')
              .sort(([a], [b]) => a.localeCompare(b))
        : []
    const rootFiles = groupedFiles?.[''] ?? []

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className='flex max-h-[85vh] max-w-4xl flex-col'>
                <DialogHeader>
                    <DialogTitle>{t('dashboard.fileExplorer')}</DialogTitle>
                    <DialogDescription>
                        {t('dashboard.fileExplorerDescription')}
                    </DialogDescription>
                </DialogHeader>

                <div className='flex h-[530px] gap-3 overflow-hidden pt-3'>
                    <div className='border-border bg-muted flex w-56 shrink-0 flex-col overflow-hidden rounded-md border'>
                        {files.data && files.data.files.length > 0 && (
                            <div className='shrink-0 p-2'>
                                <div className='relative'>
                                    <MagnifyingGlassIcon className='text-muted-foreground absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2' />
                                    <input
                                        type='text'
                                        value={searchQuery}
                                        onChange={(e) =>
                                            setSearchQuery(e.target.value)
                                        }
                                        placeholder={t(
                                            'dashboard.fileExplorerSearchFiles'
                                        )}
                                        className='border-border bg-background text-foreground placeholder:text-muted-foreground w-full rounded-md border py-1.5 pl-7 pr-2 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                                    />
                                </div>
                            </div>
                        )}
                        <div className='flex flex-1 flex-col overflow-y-auto'>
                            {files.isPending && (
                                <div className='p-3'>
                                    <div className='flex items-center gap-1.5 py-1.5'>
                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                        <Skeleton className='h-3 w-16 rounded' />
                                    </div>
                                    <div className='ml-[19px]'>
                                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                            <div className='flex items-center gap-1.5'>
                                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                <Skeleton className='h-3 w-24 rounded' />
                                            </div>
                                        </div>
                                        <div className='border-muted-foreground/20 border-l'>
                                            <div className='ml-[19px]'>
                                                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-16 rounded' />
                                                    </div>
                                                </div>
                                                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-20 rounded' />
                                                    </div>
                                                </div>
                                                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-14 rounded' />
                                                    </div>
                                                </div>
                                                <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-24 rounded' />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                            <div className='flex items-center gap-1.5'>
                                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                <Skeleton className='h-3 w-14 rounded' />
                                            </div>
                                        </div>
                                        <div className='border-muted-foreground/20 border-l'>
                                            <div className='ml-[19px]'>
                                                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-16 rounded' />
                                                    </div>
                                                </div>
                                                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-20 rounded' />
                                                    </div>
                                                </div>
                                                <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                                                    <div className='flex items-center gap-1.5'>
                                                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                        <Skeleton className='h-3 w-12 rounded' />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                            <div className='flex items-center gap-1.5'>
                                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                <Skeleton className='h-3 w-20 rounded' />
                                            </div>
                                        </div>
                                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                                            <div className='flex items-center gap-1.5'>
                                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                <Skeleton className='h-3 w-16 rounded' />
                                            </div>
                                        </div>
                                        <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                                            <div className='flex items-center gap-1.5'>
                                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                                <Skeleton className='h-3 w-24 rounded' />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {files.isError && (
                                <div className='p-3 text-xs text-red-600 dark:text-red-400'>
                                    {files.error?.message ||
                                        t('api.failedToListFiles')}
                                </div>
                            )}
                            {files.data && files.data.files.length === 0 && (
                                <div className='text-muted-foreground p-3 text-xs'>
                                    {t('dashboard.fileExplorerNoFiles')}
                                </div>
                            )}
                            {groupedFiles &&
                                filteredFiles &&
                                filteredFiles.length > 0 && (
                                    <Fragment>
                                        <div className='text-muted-foreground flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-medium'>
                                            <FolderOpenIcon className='h-3.5 w-3.5 shrink-0' />
                                            {t('dashboard.fileExplorerRoot')}
                                        </div>
                                        <div className='ml-[19px]'>
                                            {folders.map(
                                                ([dir, dirFiles], index) => {
                                                    const isLastRootChild =
                                                        index ===
                                                            folders.length -
                                                                1 &&
                                                        rootFiles.length === 0
                                                    return (
                                                        <div key={dir}>
                                                            <div
                                                                className={`text-muted-foreground relative flex items-center gap-1.5 py-1.5 pl-5 pr-3 text-xs font-medium ${
                                                                    isLastRootChild
                                                                        ? "before:border-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']"
                                                                        : "before:bg-muted-foreground/20 after:bg-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']"
                                                                }`}
                                                            >
                                                                <FolderOpenIcon className='h-3.5 w-3.5 shrink-0' />
                                                                {dir}
                                                            </div>
                                                            <div
                                                                className={
                                                                    !isLastRootChild
                                                                        ? 'border-muted-foreground/20 border-l'
                                                                        : ''
                                                                }
                                                            >
                                                                <div className='ml-[19px]'>
                                                                    {dirFiles.map(
                                                                        (
                                                                            file,
                                                                            fi
                                                                        ) => (
                                                                            <button
                                                                                key={
                                                                                    file.path
                                                                                }
                                                                                onClick={() =>
                                                                                    handleSelectFile(
                                                                                        file.path
                                                                                    )
                                                                                }
                                                                                className={`relative flex w-full items-center gap-2 py-1.5 pl-5 pr-3 text-left text-xs transition-colors ${
                                                                                    fi ===
                                                                                    dirFiles.length -
                                                                                        1
                                                                                        ? "before:border-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']"
                                                                                        : "before:bg-muted-foreground/20 after:bg-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']"
                                                                                } ${
                                                                                    selectedPath ===
                                                                                    file.path
                                                                                        ? 'bg-muted text-foreground'
                                                                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground/80'
                                                                                }`}
                                                                            >
                                                                                {getFileIcon(
                                                                                    file.fileType,
                                                                                    getFileIconColor(
                                                                                        file.fileType
                                                                                    )
                                                                                )}
                                                                                <span className='truncate'>
                                                                                    {
                                                                                        file.name
                                                                                    }
                                                                                </span>
                                                                            </button>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                            )}
                                            {rootFiles.map((file, index) => (
                                                <button
                                                    key={file.path}
                                                    onClick={() =>
                                                        handleSelectFile(
                                                            file.path
                                                        )
                                                    }
                                                    className={`relative flex w-full items-center gap-2 py-1.5 pl-5 pr-3 text-left text-xs transition-colors ${
                                                        index ===
                                                        rootFiles.length - 1
                                                            ? "before:border-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']"
                                                            : "before:bg-muted-foreground/20 after:bg-muted-foreground/20 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']"
                                                    } ${
                                                        selectedPath ===
                                                        file.path
                                                            ? 'bg-muted text-foreground'
                                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground/80'
                                                    }`}
                                                >
                                                    {getFileIcon(
                                                        file.fileType,
                                                        getFileIconColor(
                                                            file.fileType
                                                        )
                                                    )}
                                                    <span className='truncate'>
                                                        {file.name}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </Fragment>
                                )}
                            {searchQuery &&
                                filteredFiles &&
                                filteredFiles.length === 0 && (
                                    <div className='text-muted-foreground flex flex-1 flex-col items-center justify-center gap-1.5 text-xs'>
                                        <FileIcon className='h-6 w-6' />
                                        {t(
                                            'dashboard.fileExplorerNoSearchResults'
                                        )}
                                    </div>
                                )}
                        </div>
                    </div>

                    <div className='flex min-w-0 flex-1 flex-col gap-2'>
                        {!selectedPath && (
                            <div className='border-border bg-muted text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-md border text-sm'>
                                <FileIcon className='text-muted-foreground h-8 w-8' />
                                {t('dashboard.fileExplorerSelectFile')}
                            </div>
                        )}
                        {selectedPath && fileContent.isPending && (
                            <div className='flex flex-col'>
                                <div className='bg-muted/60 h-7 w-28 rounded-b-none rounded-t-md' />
                                <Skeleton className='h-[486px] rounded-b-sm rounded-tl-none rounded-tr-sm' />
                            </div>
                        )}
                        {selectedPath && fileContent.isError && (
                            <div className='border-border bg-muted flex flex-1 items-center justify-center rounded-md border text-sm text-red-600 dark:text-red-400'>
                                {fileContent.error?.message ||
                                    t('api.failedToReadFile')}
                            </div>
                        )}
                        {selectedPath && fileContent.data && (
                            <Fragment>
                                <div className='flex items-center'>
                                    <div className='border-border bg-muted text-foreground/80 flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs'>
                                        {getFileIcon(
                                            fileType,
                                            getFileIconColor(fileType)
                                        )}
                                        {selectedFile?.name}
                                        {hasUnsavedChanges && (
                                            <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-white/80' />
                                        )}
                                        {!isEditable && (
                                            <span className='bg-muted text-muted-foreground ml-0.5 rounded-full px-2 py-px text-[10px] lowercase'>
                                                {t(
                                                    'dashboard.fileExplorerReadOnly'
                                                )}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => handleSelectFile('')}
                                            className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground/80 ml-0.5 rounded p-0.5 transition-colors'
                                        >
                                            <XIcon className='h-3 w-3' />
                                        </button>
                                    </div>
                                </div>
                                <div
                                    className={`bg-muted -mt-2 h-[500px] overflow-hidden rounded-md rounded-tl-none border ${
                                        jsonError
                                            ? 'border-red-500/50'
                                            : 'border-border'
                                    }`}
                                >
                                    <CodeMirror
                                        value={displayContent}
                                        onChange={
                                            isJson
                                                ? handleJsonChange
                                                : isEditable
                                                  ? handleChange
                                                  : undefined
                                        }
                                        readOnly={!isEditable}
                                        extensions={editorExtensions}
                                        theme={
                                            resolvedTheme === THEMES.DARK
                                                ? darkEditorTheme
                                                : lightEditorTheme
                                        }
                                        height='500px'
                                        basicSetup={{
                                            lineNumbers: true,
                                            foldGutter: isEditable,
                                            bracketMatching: isEditable,
                                            closeBrackets: isEditable,
                                            highlightActiveLine: isEditable,
                                            indentOnInput: isEditable
                                        }}
                                    />
                                </div>
                                {jsonError && (
                                    <p className='text-xs text-red-600 dark:text-red-400'>
                                        {t('dashboard.fileExplorerInvalidJson')}
                                    </p>
                                )}
                            </Fragment>
                        )}
                    </div>
                </div>

                <div className='border-border mt-6 flex justify-end border-t pt-3'>
                    <Button
                        onClick={handleSave}
                        className='mt-3'
                        disabled={
                            !isEditable ||
                            !selectedPath ||
                            !fileContent.data ||
                            !hasUnsavedChanges ||
                            jsonError ||
                            updateFile.isPending
                        }
                        size='default'
                    >
                        {updateFile.isPending ? (
                            <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                        ) : (
                            <FloppyDiskIcon className='mr-2 h-4 w-4' />
                        )}
                        {t('dashboard.fileExplorerSave')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default ClawConfigDialog