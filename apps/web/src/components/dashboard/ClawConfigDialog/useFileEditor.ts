import type { ClawFileType } from '@/ts/Types'
import type { UseFileEditorParams, UseFileEditorReturn } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { useClawFile, useUpdateClawFile, CLAW_FILE_QUERY_KEY } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { editableFileTypes } from '@/components/dashboard/ClawConfigDialog/editorThemes'

const useFileEditor = ({
    clawId,
    files
}: UseFileEditorParams): UseFileEditorReturn => {
    const queryClient = useQueryClient()
    const updateFile = useUpdateClawFile()
    const showToast = useUIStore((s) => s.showToast)
    const [selectedPath, setSelectedPath] = useState('')
    const [editedContent, setEditedContent] = useState('')
    const [jsonError, setJsonError] = useState(false)

    const selectedFile = files?.find((f) => f.path === selectedPath)
    const fileType: ClawFileType = selectedFile?.fileType ?? 'unknown'
    const isEditable = editableFileTypes.includes(fileType)
    const isJson = fileType === 'json'

    const fileContent = useClawFile(
        clawId,
        selectedPath,
        selectedPath.length > 0
    )

    const handleSelectFile = (path: string) => {
        if (path === selectedPath) return
        const previousPath = selectedPath
        setSelectedPath(path)
        setEditedContent('')
        setJsonError(false)
        updateFile.reset()
        queryClient.removeQueries({
            queryKey: [...CLAW_FILE_QUERY_KEY, clawId, previousPath]
        })
    }

    const formatContent = useCallback(
        (content: string, type: ClawFileType): string => {
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
            ? formatContent(currentContent, fileType)
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
                        queryKey: [...CLAW_FILE_QUERY_KEY, clawId, selectedPath]
                    })
                    showToast(
                        t('dashboard.fileExplorerSaved'),
                        TOAST_TYPE.SUCCESS
                    )
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

    const reset = () => {
        setSelectedPath('')
        setEditedContent('')
        setJsonError(false)
        updateFile.reset()
    }

    return {
        selectedPath,
        editedContent,
        jsonError,
        selectedFile,
        fileType,
        isEditable,
        isJson,
        displayContent,
        hasUnsavedChanges,
        fileContentIsPending: fileContent.isPending,
        fileContentIsError: fileContent.isError,
        fileContentError: fileContent.error,
        fileContentData: fileContent.data,
        isSaving: updateFile.isPending,
        handleSelectFile,
        handleChange,
        handleJsonChange,
        handleSave,
        reset
    }
}

export default useFileEditor