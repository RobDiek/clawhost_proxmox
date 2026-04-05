import type { FC, ReactNode } from 'react'
import type {
    EnvVar,
    EnvVarValidationError,
    PlaygroundVariablesContentProps
} from '@/ts/Interfaces'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    PlusIcon,
    TrashIcon,
    EyeIcon,
    EyeSlashIcon,
    CopyIcon,
    CheckIcon,
    KeyIcon,
    InfoIcon
} from '@phosphor-icons/react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    Button,
    Skeleton,
    Checkbox,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import { api, copyToClipboard } from '@/lib'
import { useUIStore, useVariablesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { PanelPlaceholder } from '@/components/shared'
import {
    PLAYGROUND_AGENTS_QUERY_KEY,
    CLAW_ENV_QUERY_KEY,
    AGENT_CONFIG_QUERY_KEY
} from '@/hooks'

let skipDeleteConfirmation = false

const PlaygroundVariablesContent: FC<PlaygroundVariablesContentProps> = ({
    clawId,
    mockEnvVars
}): ReactNode => {
    const [envVars, setEnvVars] = useState<Array<EnvVar>>([])
    const [hasChanges, setHasChanges] = useState(false)
    const {
        showValues,
        toggleValue,
        copiedKey,
        setCopiedKey,
        showErrors,
        setShowErrors,
        deleteIndex,
        setDeleteIndex,
        dontAskAgain,
        setDontAskAgain
    } = useVariablesStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/

    const errors = useMemo(() => {
        const result: Array<EnvVarValidationError> = []
        const seenKeys = new Set<string>()
        envVars.forEach((envVar) => {
            const keyTrimmed = envVar.key.trim()
            let keyError: string | null = null
            let valueError: string | null = null

            if (!keyTrimmed || !ENV_KEY_REGEX.test(keyTrimmed)) {
                keyError = t('playground.variablesInvalidKey')
            } else if (seenKeys.has(keyTrimmed)) {
                keyError = t('playground.variablesDuplicateKey')
            }

            if (!envVar.value) {
                valueError = t('playground.variablesEmptyValue')
            }

            if (keyTrimmed) seenKeys.add(keyTrimmed)
            result.push({ key: keyError, value: valueError })
        })
        return result
    }, [envVars])

    const hasErrors = useMemo(
        () => errors.some((e) => e.key || e.value),
        [errors]
    )

    const {
        data: queryEnvData,
        isLoading: queryIsLoading,
        isError: queryIsError
    } = useQuery({
        queryKey: [...CLAW_ENV_QUERY_KEY, clawId],
        queryFn: () => api.getClawEnvVars(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1,
        enabled: !mockEnvVars
    })

    const envData = mockEnvVars ? { envVars: mockEnvVars } : queryEnvData
    const isLoading = mockEnvVars ? false : queryIsLoading
    const isError = mockEnvVars ? false : queryIsError

    useEffect(() => {
        if (envData) {
            const vars = Object.entries(envData.envVars).map(
                ([key, value]) => ({ key, value })
            )
            setEnvVars(vars)
            setHasChanges(false)
            setShowErrors(false)
        }
    }, [envData])

    const invalidateQueries = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: [...CLAW_ENV_QUERY_KEY, clawId]
        })
        queryClient.invalidateQueries({
            queryKey: [PLAYGROUND_AGENTS_QUERY_KEY, clawId]
        })
        queryClient.invalidateQueries({
            queryKey: [...AGENT_CONFIG_QUERY_KEY, clawId]
        })
    }, [queryClient, clawId])

    const saveMutation = useMutation({
        mutationFn: () => {
            const envVarsObj: Record<string, string> = {}
            envVars.forEach(({ key, value }) => {
                if (key.trim()) {
                    envVarsObj[key.trim()] = value
                }
            })
            return api.updateClawEnvVars(clawId, { envVars: envVarsObj })
        },
        onSuccess: () => {
            showToast(t('playground.variablesSaved'), TOAST_TYPE.SUCCESS)
            setHasChanges(false)
            invalidateQueries()
        },
        onError: () => {
            showToast(t('playground.variablesSaveFailed'), TOAST_TYPE.ERROR)
        }
    })

    const deleteMutation = useMutation({
        mutationFn: (remaining: Array<EnvVar>) => {
            const envVarsObj: Record<string, string> = {}
            remaining.forEach(({ key, value }) => {
                if (key.trim()) {
                    envVarsObj[key.trim()] = value
                }
            })
            return api.updateClawEnvVars(clawId, { envVars: envVarsObj })
        },
        onSuccess: () => {
            showToast(t('playground.variablesDeleted'), TOAST_TYPE.SUCCESS)
            invalidateQueries()
        },
        onError: () => {
            showToast(t('playground.variablesSaveFailed'), TOAST_TYPE.ERROR)
            invalidateQueries()
        }
    })

    const executeDelete = useCallback(
        (index: number) => {
            const remaining = envVars.filter((_, i) => i !== index)
            setEnvVars(remaining)
            deleteMutation.mutate(remaining)
        },
        [envVars, deleteMutation]
    )

    const handleRemoveVar = useCallback(
        (index: number) => {
            const key = envVars[index]?.key?.trim()
            const isSaved = key && envData?.envVars && key in envData.envVars

            if (!isSaved) {
                setEnvVars((prev) => prev.filter((_, i) => i !== index))
                return
            }

            if (skipDeleteConfirmation) {
                executeDelete(index)
            } else {
                setDeleteIndex(index)
                setDontAskAgain(false)
            }
        },
        [executeDelete, envVars, envData]
    )

    const handleConfirmDelete = useCallback(() => {
        if (dontAskAgain) {
            skipDeleteConfirmation = true
        }
        if (deleteIndex !== null) {
            executeDelete(deleteIndex)
        }
        setDeleteIndex(null)
    }, [dontAskAgain, deleteIndex, executeDelete])

    const handleAddVar = useCallback(() => {
        setEnvVars((prev) => [...prev, { key: '', value: '' }])
        setHasChanges(true)
        setShowErrors(false)
    }, [])

    const handleVarChange = useCallback(
        (index: number, field: 'key' | 'value', val: string) => {
            setEnvVars((prev) =>
                prev.map((v, i) => (i === index ? { ...v, [field]: val } : v))
            )
            setHasChanges(true)
        },
        []
    )

    const handleToggleVisibility = useCallback(
        (key: string) => {
            toggleValue(key)
        },
        [toggleValue]
    )

    const handleCopyValue = useCallback(async (key: string, value: string) => {
        await copyToClipboard(value)
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 2000)
    }, [])

    if (isLoading) {
        return (
            <div className='space-y-2 p-5'>
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className='border-border bg-foreground/5 rounded-lg border p-3'
                    >
                        <div className='mb-2 flex items-center justify-between'>
                            <Skeleton className='h-4 w-32' />
                            <div className='flex items-center gap-1'>
                                <Skeleton className='h-5 w-5 rounded' />
                                <Skeleton className='h-5 w-5 rounded' />
                                <Skeleton className='h-5 w-5 rounded' />
                            </div>
                        </div>
                        <Skeleton className='h-7 w-full rounded-md' />
                    </div>
                ))}
            </div>
        )
    }

    if (isError) {
        return (
            <PanelPlaceholder
                icon={
                    <KeyIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                }
                title={t('playground.variablesLoadFailed')}
                description={t('playground.variablesLoadFailedDescription')}
            />
        )
    }

    return (
        <div className='flex h-full flex-col overflow-y-auto p-5'>
            <div className='flex min-h-0 flex-1 flex-col space-y-3'>
                <div className='space-y-2'>
                    {envVars.map((envVar, index) => {
                        const keyError =
                            showErrors && errors[index]?.key
                                ? errors[index].key
                                : null
                        const valueError =
                            showErrors && errors[index]?.value
                                ? errors[index].value
                                : null

                        return (
                            <div
                                key={index}
                                className={`bg-foreground/5 rounded-lg border p-3 ${
                                    keyError || valueError
                                        ? 'border-red-500/40'
                                        : 'border-border'
                                }`}
                            >
                                <div className='mb-2 flex items-center justify-between'>
                                    <input
                                        type='text'
                                        value={envVar.key}
                                        onChange={(e) =>
                                            handleVarChange(
                                                index,
                                                'key',
                                                e.target.value
                                            )
                                        }
                                        placeholder={t(
                                            'playground.configurationKeyPlaceholder'
                                        )}
                                        className={`placeholder:text-muted-foreground bg-transparent font-mono text-xs font-medium outline-none ${
                                            keyError
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-foreground/90'
                                        }`}
                                    />
                                    <div className='flex items-center gap-1'>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type='button'
                                                    onClick={() =>
                                                        handleToggleVisibility(
                                                            `${index}-${envVar.key}`
                                                        )
                                                    }
                                                    className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                                >
                                                    {showValues[
                                                        `${index}-${envVar.key}`
                                                    ] ? (
                                                        <EyeSlashIcon className='h-3.5 w-3.5' />
                                                    ) : (
                                                        <EyeIcon className='h-3.5 w-3.5' />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {showValues[
                                                    `${index}-${envVar.key}`
                                                ]
                                                    ? t('common.hide')
                                                    : t('common.show')}
                                            </TooltipContent>
                                        </Tooltip>
                                        {envVar.value && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type='button'
                                                        onClick={() =>
                                                            handleCopyValue(
                                                                `${index}-${envVar.key}`,
                                                                envVar.value
                                                            )
                                                        }
                                                        className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                                    >
                                                        {copiedKey ===
                                                        `${index}-${envVar.key}` ? (
                                                            <CheckIcon className='h-3.5 w-3.5 text-green-600 dark:text-green-400' />
                                                        ) : (
                                                            <CopyIcon className='h-3.5 w-3.5' />
                                                        )}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {t('common.copy')}
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type='button'
                                                    onClick={() =>
                                                        handleRemoveVar(index)
                                                    }
                                                    disabled={
                                                        saveMutation.isPending ||
                                                        deleteMutation.isPending
                                                    }
                                                    className='text-muted-foreground rounded p-1 transition-colors disabled:cursor-default disabled:opacity-50 [&:not(:disabled)]:hover:text-red-600 dark:[&:not(:disabled)]:hover:text-red-400'
                                                >
                                                    <TrashIcon className='h-3.5 w-3.5' />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {saveMutation.isPending ||
                                                deleteMutation.isPending
                                                    ? t(
                                                          'playground.variablesOperationPending'
                                                      )
                                                    : t('common.delete')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                                <input
                                    type={
                                        showValues[`${index}-${envVar.key}`]
                                            ? 'text'
                                            : 'password'
                                    }
                                    value={envVar.value}
                                    onChange={(e) =>
                                        handleVarChange(
                                            index,
                                            'value',
                                            e.target.value
                                        )
                                    }
                                    placeholder={t(
                                        'playground.configurationValuePlaceholder'
                                    )}
                                    className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 font-mono text-xs outline-none transition-colors focus:border-[#ef5350]/50 ${
                                        valueError
                                            ? 'border-red-500/40'
                                            : 'border-border'
                                    }`}
                                />
                                {(keyError || valueError) && (
                                    <p className='mt-1.5 text-[10px] text-red-600 dark:text-red-400'>
                                        {keyError || valueError}
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </div>

                {envVars.length === 0 ? (
                    <div className='flex flex-1 flex-col items-center justify-center gap-3'>
                        <div className='bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-xl'>
                            <KeyIcon
                                className='text-muted-foreground h-5 w-5'
                                weight='duotone'
                            />
                        </div>
                        <p className='text-muted-foreground text-xs'>
                            {t('playground.variablesEmpty')}
                        </p>
                        <button
                            onClick={handleAddVar}
                            className='border-border text-muted-foreground hover:border-border hover:text-muted-foreground rounded-lg border border-dashed px-4 py-2 text-[11px] transition-colors'
                        >
                            {t('playground.variablesAddVariable')}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleAddVar}
                        disabled={
                            saveMutation.isPending || deleteMutation.isPending
                        }
                        className='border-border text-muted-foreground hover:border-border hover:text-muted-foreground flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-[11px] transition-colors disabled:cursor-default disabled:opacity-50'
                    >
                        <PlusIcon className='h-3 w-3' />
                        {t('playground.variablesAddVariable')}
                    </button>
                )}

                {hasChanges && envVars.length > 0 && (
                    <button
                        onClick={() => {
                            setShowErrors(true)
                            if (!hasErrors) saveMutation.mutate()
                        }}
                        disabled={
                            saveMutation.isPending || (showErrors && hasErrors)
                        }
                        className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        {saveMutation.isPending && (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        )}
                        {t('common.save')}
                    </button>
                )}

                {envVars.length > 0 && (
                    <div className='flex items-start gap-2 pt-1'>
                        <InfoIcon className='text-muted-foreground mt-0.5 h-3 w-3 shrink-0' />
                        <p className='text-muted-foreground text-[11px]'>
                            {t('playground.variablesDescription')}
                        </p>
                    </div>
                )}
            </div>

            <Dialog
                open={deleteIndex !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteIndex(null)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('playground.variablesDeleteTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('playground.variablesDeleteDescription', {
                                key:
                                    deleteIndex !== null
                                        ? envVars[deleteIndex]?.key ||
                                          t(
                                              'playground.configurationKeyPlaceholder'
                                          )
                                        : ''
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <label className='mt-3 flex cursor-pointer items-center gap-2.5'>
                        <Checkbox
                            checked={dontAskAgain}
                            onCheckedChange={(checked) =>
                                setDontAskAgain(!!checked)
                            }
                        />
                        <span className='text-muted-foreground text-xs'>
                            {t('playground.variablesDontAskAgain')}
                        </span>
                    </label>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setDeleteIndex(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={handleConfirmDelete}
                            disabled={deleteMutation.isPending}
                        >
                            {t('playground.variablesDeleteConfirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default PlaygroundVariablesContent