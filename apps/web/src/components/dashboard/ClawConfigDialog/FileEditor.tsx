import type { FC, ReactNode } from 'react'
import type { FileEditorProps } from '@/ts/Interfaces'

import { Fragment, useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { XIcon } from '@phosphor-icons/react'
import CodeMirror from '@uiw/react-codemirror'
import { THEMES } from '@/lib'
import {
    darkTheme,
    lightTheme,
    editorStyles,
    getLanguageExtension,
    getFileIcon,
    getFileIconColor
} from '@/components/dashboard/ClawConfigDialog/editorThemes'

const FileEditor: FC<FileEditorProps> = ({
    selectedFile,
    fileType,
    isEditable,
    isJson,
    displayContent,
    hasUnsavedChanges,
    jsonError,
    resolvedTheme,
    onChange,
    onJsonChange,
    onClose
}): ReactNode => {
    const editorExtensions = useMemo(() => {
        const langExt = getLanguageExtension(fileType)
        return langExt ? [langExt, editorStyles] : [editorStyles]
    }, [fileType])

    return (
        <Fragment>
            <div className='flex items-center'>
                <div className='border-border bg-muted text-foreground/80 flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs'>
                    {getFileIcon(fileType, getFileIconColor(fileType))}
                    {selectedFile?.name}
                    {hasUnsavedChanges && (
                        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-white/80' />
                    )}
                    {!isEditable && (
                        <span className='bg-muted text-muted-foreground ml-0.5 rounded-full px-2 py-px text-[10px] lowercase'>
                            {t('dashboard.fileExplorerReadOnly')}
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        className='text-muted-foreground hover:bg-foreground/10 hover:text-foreground/80 ml-0.5 rounded p-0.5 transition-colors'
                    >
                        <XIcon className='h-3 w-3' />
                    </button>
                </div>
            </div>
            <div
                className={`bg-muted -mt-2 h-[500px] overflow-hidden rounded-md rounded-tl-none border ${
                    jsonError ? 'border-red-500/50' : 'border-border'
                }`}
            >
                <CodeMirror
                    value={displayContent}
                    onChange={
                        isJson
                            ? onJsonChange
                            : isEditable
                              ? onChange
                              : undefined
                    }
                    readOnly={!isEditable}
                    extensions={editorExtensions}
                    theme={
                        resolvedTheme === THEMES.DARK ? darkTheme : lightTheme
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
    )
}

export default FileEditor