import type { FC, ReactNode } from 'react'
import type { PlaygroundVariablesContentProps } from '@/ts/Interfaces'

import { useCallback } from 'react'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    PlusIcon,
    KeyIcon,
    InfoIcon
} from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui'
import { copyToClipboard } from '@/lib'
import { useVariablesStore } from '@/lib/store'
import { PanelPlaceholder } from '@/components/shared'
import EnvVarRow from '@/components/playground/PlaygroundVariablesContent/EnvVarRow'
import EnvVarsEmptyState from '@/components/playground/PlaygroundVariablesContent/EnvVarsEmptyState'
import DeleteEnvVarDialog from '@/components/playground/PlaygroundVariablesContent/DeleteEnvVarDialog'
import useEnvVarsForm from '@/components/playground/PlaygroundVariablesContent/useEnvVarsForm'

const PlaygroundVariablesContent: FC<PlaygroundVariablesContentProps> = ({
    clawId,
    mockEnvVars
}): ReactNode => {
    const {
        showValues,
        toggleValue,
        copiedKey,
        setCopiedKey,
        showErrors,
        deleteIndex,
        setDeleteIndex,
        dontAskAgain,
        setDontAskAgain
    } = useVariablesStore()

    const {
        envVars,
        errors,
        hasErrors,
        hasChanges,
        isLoading,
        isError,
        isSavePending,
        isDeletePending,
        handleAddVar,
        handleVarChange,
        handleRemoveVar,
        handleConfirmDelete,
        save
    } = useEnvVarsForm({ clawId, mockEnvVars })

    const handleCopyValue = useCallback(
        async (key: string, value: string) => {
            await copyToClipboard(value)
            setCopiedKey(key)
            setTimeout(() => setCopiedKey(null), 2000)
        },
        [setCopiedKey]
    )

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

    const dialogEnvKey =
        deleteIndex !== null
            ? envVars[deleteIndex]?.key ||
              t('playground.configurationKeyPlaceholder')
            : ''

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
                        const idKey = `${index}-${envVar.key}`
                        return (
                            <EnvVarRow
                                key={index}
                                envVar={envVar}
                                index={index}
                                keyError={keyError}
                                valueError={valueError}
                                showValue={!!showValues[idKey]}
                                isCopied={copiedKey === idKey}
                                isPending={isSavePending || isDeletePending}
                                onChange={handleVarChange}
                                onToggleVisibility={toggleValue}
                                onCopyValue={handleCopyValue}
                                onRemove={handleRemoveVar}
                            />
                        )
                    })}
                </div>

                {envVars.length === 0 ? (
                    <EnvVarsEmptyState onAdd={handleAddVar} />
                ) : (
                    <button
                        onClick={handleAddVar}
                        disabled={isSavePending || isDeletePending}
                        className='border-border text-muted-foreground hover:border-border hover:text-muted-foreground flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-[11px] transition-colors disabled:cursor-default disabled:opacity-50'
                    >
                        <PlusIcon className='h-3 w-3' />
                        {t('playground.variablesAddVariable')}
                    </button>
                )}

                {hasChanges && envVars.length > 0 && (
                    <button
                        onClick={save}
                        disabled={isSavePending || (showErrors && hasErrors)}
                        className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        {isSavePending && (
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

            <DeleteEnvVarDialog
                open={deleteIndex !== null}
                envKey={dialogEnvKey}
                dontAskAgain={dontAskAgain}
                isPending={isDeletePending}
                onOpenChange={(open) => {
                    if (!open) setDeleteIndex(null)
                }}
                onDontAskAgainChange={setDontAskAgain}
                onConfirm={handleConfirmDelete}
            />
        </div>
    )
}

export default PlaygroundVariablesContent