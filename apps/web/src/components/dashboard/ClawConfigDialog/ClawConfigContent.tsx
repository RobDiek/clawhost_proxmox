import type { FC, ReactNode } from 'react'
import type { ClawFileExplorerContentProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { Button, Skeleton } from '@/components/ui'
import {
    CircleNotchIcon,
    FloppyDiskIcon,
    MagnifyingGlassIcon,
    FileIcon
} from '@phosphor-icons/react'
import { usePreferencesStore } from '@/lib/store'
import { THEMES } from '@/lib'
import { useClawFiles } from '@/hooks'
import FileTreeSkeleton from '@/components/dashboard/ClawConfigDialog/FileTreeSkeleton'
import FileTree from '@/components/dashboard/ClawConfigDialog/FileTree'
import FileEditor from '@/components/dashboard/ClawConfigDialog/FileEditor'
import useFileEditor from '@/components/dashboard/ClawConfigDialog/useFileEditor'

const ClawConfigContent: FC<ClawFileExplorerContentProps> = ({
    clawId
}): ReactNode => {
    const storeTheme = usePreferencesStore((s) => s.theme)
    const resolvedTheme =
        storeTheme === THEMES.SYSTEM
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? THEMES.DARK
                : THEMES.LIGHT
            : storeTheme
    const files = useClawFiles(clawId, true)
    const [searchQuery, setSearchQuery] = useState('')

    const editor = useFileEditor({ clawId, files: files.data?.files })

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
        <div className='flex h-full flex-col overflow-hidden'>
            <div className='text-muted-foreground px-4 pt-3 text-xs'>
                {t('dashboard.fileExplorerDescription')}
            </div>

            <div className='flex min-h-0 flex-1 gap-3 overflow-hidden p-4'>
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
                        {files.isPending && <FileTreeSkeleton />}
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
                                <FileTree
                                    folders={folders}
                                    rootFiles={rootFiles}
                                    selectedPath={editor.selectedPath}
                                    onSelectFile={editor.handleSelectFile}
                                />
                            )}
                        {searchQuery &&
                            filteredFiles &&
                            filteredFiles.length === 0 && (
                                <div className='text-muted-foreground flex flex-1 flex-col items-center justify-center gap-1.5 text-xs'>
                                    <FileIcon className='h-6 w-6' />
                                    {t('dashboard.fileExplorerNoSearchResults')}
                                </div>
                            )}
                    </div>
                </div>

                <div className='flex min-w-0 flex-1 flex-col gap-2'>
                    {!editor.selectedPath && (
                        <div className='border-border bg-muted text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-md border text-sm'>
                            <FileIcon className='text-muted-foreground h-8 w-8' />
                            {t('dashboard.fileExplorerSelectFile')}
                        </div>
                    )}
                    {editor.selectedPath && editor.fileContentIsPending && (
                        <div className='flex flex-col'>
                            <div className='bg-muted/60 h-7 w-28 rounded-b-none rounded-t-md' />
                            <Skeleton className='h-[486px] rounded-b-sm rounded-tl-none rounded-tr-sm' />
                        </div>
                    )}
                    {editor.selectedPath && editor.fileContentIsError && (
                        <div className='border-border bg-muted flex flex-1 items-center justify-center rounded-md border text-sm text-red-600 dark:text-red-400'>
                            {editor.fileContentError?.message ||
                                t('api.failedToReadFile')}
                        </div>
                    )}
                    {editor.selectedPath && editor.fileContentData && (
                        <FileEditor
                            selectedFile={editor.selectedFile}
                            fileType={editor.fileType}
                            isEditable={editor.isEditable}
                            isJson={editor.isJson}
                            displayContent={editor.displayContent}
                            hasUnsavedChanges={editor.hasUnsavedChanges}
                            jsonError={editor.jsonError}
                            resolvedTheme={resolvedTheme}
                            onChange={editor.handleChange}
                            onJsonChange={editor.handleJsonChange}
                            onClose={() => editor.handleSelectFile('')}
                        />
                    )}
                </div>
            </div>

            <div className='border-border flex justify-end border-t px-4 py-3'>
                <Button
                    onClick={editor.handleSave}
                    disabled={
                        !editor.isEditable ||
                        !editor.selectedPath ||
                        !editor.fileContentData ||
                        !editor.hasUnsavedChanges ||
                        editor.jsonError ||
                        editor.isSaving
                    }
                    size='default'
                >
                    {editor.isSaving ? (
                        <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                    ) : (
                        <FloppyDiskIcon className='mr-2 h-4 w-4' />
                    )}
                    {t('dashboard.fileExplorerSave')}
                </Button>
            </div>
        </div>
    )
}

export default ClawConfigContent