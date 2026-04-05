import type { FC, ReactNode } from 'react'
import type {
    AgentDetailConfigTabProps,
    AgentConfigResponse,
    ClawAgentsResponse
} from '@/ts/Interfaces'
import type { TranslationKey } from '@openclaw/i18n'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    GearSixIcon,
    CircleNotchIcon,
    EyeIcon,
    EyeSlashIcon,
    CopyIcon,
    CheckIcon
} from '@phosphor-icons/react'
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectGroup,
    Skeleton
} from '@/components/ui'
import { PanelPlaceholder } from '@/components/shared'
import { api, copyToClipboard } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { aiModels, validateAgentName } from '@/lib/claw-utils'
import {
    PLAYGROUND_AGENTS_QUERY_KEY,
    AGENT_CONFIG_QUERY_KEY,
    CLAW_ENV_QUERY_KEY
} from '@/hooks'

const AgentDetailConfigTab: FC<AgentDetailConfigTabProps> = ({
    agent,
    clawId,
    configData,
    isConfigLoading,
    isConfigError,
    readOnly
}): ReactNode => {
    const [agentName, setAgentName] = useState('')
    const [nameError, setNameError] = useState<TranslationKey | null>(null)
    const [selectedModel, setSelectedModel] = useState<string>('')
    const [apiKeyValue, setApiKeyValue] = useState('')
    const [hasChanges, setHasChanges] = useState(false)
    const [showApiKey, setShowApiKey] = useState(false)
    const [copied, setCopied] = useState(false)
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const existingAgentNames = useMemo(() => {
        const cached = queryClient.getQueryData<ClawAgentsResponse>([
            PLAYGROUND_AGENTS_QUERY_KEY,
            clawId
        ])
        return cached?.agents.map((a) => a.name) || []
    }, [queryClient, clawId])

    const modelsByProvider = useMemo(() => {
        const grouped: Record<string, typeof aiModels> = {}
        aiModels.forEach((model) => {
            if (!grouped[model.provider]) {
                grouped[model.provider] = []
            }
            grouped[model.provider].push(model)
        })
        return grouped
    }, [])

    const providerKeys = useMemo(
        () => Object.keys(modelsByProvider),
        [modelsByProvider]
    )

    const selectedModelOption = useMemo(
        () => aiModels.find((m) => m.id === selectedModel),
        [selectedModel]
    )

    useEffect(() => {
        if (configData) {
            setAgentName(agent.name)
            setNameError(null)

            const model =
                configData.agent.model || configData.defaultModel || ''
            setSelectedModel(model)

            const modelOption = aiModels.find((m) => m.id === model)
            if (modelOption) {
                setApiKeyValue(configData.envVars[modelOption.envVar] || '')
            } else {
                setApiKeyValue('')
            }

            setHasChanges(false)
        }
    }, [configData, agent.name])

    const saveMutation = useMutation({
        mutationFn: () => {
            const envVarsObj: Record<string, string> = {}
            if (selectedModelOption && apiKeyValue) {
                envVarsObj[selectedModelOption.envVar] = apiKeyValue
            }

            const nameChanged = agentName !== agent.name

            return api.updateClawAgentConfig(clawId, {
                agentId: agent.id,
                name: nameChanged ? agentName : undefined,
                model: selectedModel || null,
                envVars: envVarsObj
            })
        },
        onSuccess: () => {
            showToast(t('playground.configurationSaved'), TOAST_TYPE.SUCCESS)
            setHasChanges(false)

            const newName = agentName
            queryClient.setQueryData<ClawAgentsResponse>(
                [PLAYGROUND_AGENTS_QUERY_KEY, clawId],
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        agents: old.agents.map((a) =>
                            a.id === agent.id
                                ? {
                                      ...a,
                                      name: newName,
                                      model: selectedModel || null
                                  }
                                : a
                        )
                    }
                }
            )

            queryClient.setQueryData<AgentConfigResponse>(
                [...AGENT_CONFIG_QUERY_KEY, clawId, agent.id],
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        agent: {
                            ...old.agent,
                            name: newName,
                            model: selectedModel || null
                        }
                    }
                }
            )
            queryClient.invalidateQueries({
                queryKey: [...CLAW_ENV_QUERY_KEY, clawId]
            })
        },
        onError: () => {
            showToast(t('playground.configurationSaveFailed'), TOAST_TYPE.ERROR)
        }
    })

    const handleNameChange = useCallback(
        (value: string) => {
            setAgentName(value)
            setHasChanges(true)
            const error = validateAgentName(
                value,
                existingAgentNames,
                agent.name
            )
            setNameError(error)
        },
        [existingAgentNames, agent.name]
    )

    const handleSave = useCallback(() => {
        const error = validateAgentName(
            agentName,
            existingAgentNames,
            agent.name
        )
        if (error) {
            setNameError(error)
            return
        }
        saveMutation.mutate()
    }, [agentName, existingAgentNames, agent.name, saveMutation])

    const handleModelChange = useCallback(
        (model: string) => {
            setSelectedModel(model)
            setHasChanges(true)

            const modelOption = aiModels.find((m) => m.id === model)
            if (modelOption && configData) {
                setApiKeyValue(configData.envVars[modelOption.envVar] || '')
            } else {
                setApiKeyValue('')
            }
            setShowApiKey(false)
        },
        [configData]
    )

    const handleCopyApiKey = useCallback(async () => {
        if (apiKeyValue) {
            await copyToClipboard(apiKeyValue)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [apiKeyValue])

    if (isConfigLoading) {
        return (
            <div className='h-full overflow-y-auto p-5'>
                <div className='space-y-5'>
                    <div>
                        <Skeleton className='mb-2 h-4 w-16' />
                        <Skeleton className='h-9 w-full rounded-md' />
                        <Skeleton className='mt-1.5 h-3 w-48' />
                    </div>
                    <div>
                        <Skeleton className='mb-2 h-4 w-14' />
                        <Skeleton className='h-9 w-full rounded-md' />
                        <Skeleton className='mt-1.5 h-3 w-56' />
                    </div>
                    <Skeleton className='h-10 w-full rounded-lg' />
                </div>
            </div>
        )
    }

    if (isConfigError) {
        return (
            <div className='h-full overflow-y-auto p-5'>
                <PanelPlaceholder
                    icon={
                        <GearSixIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('playground.configurationLoadFailed')}
                    description={t(
                        'playground.configurationLoadFailedDescription'
                    )}
                />
            </div>
        )
    }

    return (
        <div className='h-full overflow-y-auto p-5'>
            <div className='space-y-5'>
                <div>
                    <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                        {t('playground.configurationName')}
                    </label>
                    <input
                        type='text'
                        value={agentName}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (
                                e.key === 'Enter' &&
                                !readOnly &&
                                !saveMutation.isPending &&
                                hasChanges &&
                                !nameError
                            ) {
                                handleSave()
                            }
                        }}
                        placeholder={t(
                            'playground.configurationNamePlaceholder'
                        )}
                        className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50 ${
                            nameError ? 'border-red-500/50' : 'border-border'
                        }`}
                    />
                    {nameError ? (
                        <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                            {t(nameError)}
                        </p>
                    ) : (
                        <p className='text-muted-foreground mt-1.5 text-[11px]'>
                            {t('playground.configurationNameDescription')}
                        </p>
                    )}
                </div>

                <div>
                    <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                        {t('playground.configurationModel')}
                    </label>
                    <Select
                        value={selectedModel}
                        onValueChange={handleModelChange}
                        displayValue={selectedModelOption?.name}
                    >
                        <SelectTrigger
                            placeholder={t(
                                'playground.configurationModelPlaceholder'
                            )}
                            className='border-border bg-foreground/5 text-foreground h-9 text-sm'
                        />
                        <SelectContent className='max-h-[300px] overflow-y-auto'>
                            {providerKeys.map((provider, index) => (
                                <SelectGroup
                                    key={provider}
                                    label={provider}
                                    isLast={index === providerKeys.length - 1}
                                >
                                    {modelsByProvider[provider].map((model) => (
                                        <SelectItem
                                            key={model.id}
                                            value={model.id}
                                        >
                                            {model.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className='text-muted-foreground mt-1.5 text-[11px]'>
                        {t('playground.configurationModelDescription')}
                    </p>
                </div>

                {selectedModelOption && (
                    <div>
                        <div className='mb-2 flex items-center justify-between'>
                            <label className='text-muted-foreground text-xs font-medium'>
                                {t('playground.configurationApiKey')}
                            </label>
                            <div className='flex items-center gap-1'>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type='button'
                                            onClick={() =>
                                                setShowApiKey(!showApiKey)
                                            }
                                            className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                        >
                                            {showApiKey ? (
                                                <EyeSlashIcon className='h-3.5 w-3.5' />
                                            ) : (
                                                <EyeIcon className='h-3.5 w-3.5' />
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {showApiKey
                                            ? t('common.hide')
                                            : t('common.show')}
                                    </TooltipContent>
                                </Tooltip>
                                {apiKeyValue && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type='button'
                                                onClick={handleCopyApiKey}
                                                className='text-muted-foreground hover:text-foreground/80 rounded p-1 transition-colors'
                                            >
                                                {copied ? (
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
                            </div>
                        </div>
                        <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKeyValue}
                            onChange={(e) => {
                                setApiKeyValue(e.target.value)
                                setHasChanges(true)
                            }}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !readOnly &&
                                    !saveMutation.isPending &&
                                    hasChanges &&
                                    !nameError
                                ) {
                                    handleSave()
                                }
                            }}
                            placeholder={t(
                                'playground.configurationApiKeyPlaceholder'
                            )}
                            className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                        />
                        <p className='text-muted-foreground mt-1.5 text-[11px]'>
                            <span className='text-muted-foreground font-mono'>
                                {selectedModelOption.envVar}
                            </span>
                            {' — '}
                            {t('playground.configurationApiKeyDescription', {
                                modelName: selectedModelOption.name
                            })}
                        </p>
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={
                        readOnly ||
                        saveMutation.isPending ||
                        !hasChanges ||
                        !!nameError
                    }
                    className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                >
                    {saveMutation.isPending && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {t('playground.configurationSave')}
                </button>
            </div>
        </div>
    )
}

export default AgentDetailConfigTab