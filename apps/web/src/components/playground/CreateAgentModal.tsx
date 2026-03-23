import type { FC, ReactNode } from 'react'
import type { ClawAgentsResponse, CreateAgentModalProps } from '@/ts/Interfaces'
import type { TranslationKey } from '@openclaw/i18n'

import { useState, useMemo, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    CheckCircleIcon,
    CheckIcon,
    CircleNotchIcon,
    CopyIcon,
    EyeIcon,
    EyeSlashIcon
} from '@phosphor-icons/react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectGroup,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import { api, copyToClipboard } from '@/lib'
import { useUIStore } from '@/lib/store'
import { aiModels, validateAgentName } from '@/lib/claw-utils'
import { PLAYGROUND_AGENTS_QUERY_KEY } from '@/hooks'

const CreateAgentModal: FC<CreateAgentModalProps> = ({
    clawId: clawIdProp,
    clawName: clawNameProp,
    clawsWithAgents,
    open,
    onOpenChange
}): ReactNode => {
    const [name, setName] = useState('')
    const [nameError, setNameError] = useState<TranslationKey | null>(null)
    const [selectedModel, setSelectedModel] = useState('')
    const [apiKeyValue, setApiKeyValue] = useState('')
    const [showApiKey, setShowApiKey] = useState(false)
    const [copied, setCopied] = useState(false)
    const [pickedClawId, setPickedClawId] = useState('')
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const needsClawPicker = !clawIdProp && !!clawsWithAgents
    const effectiveClawId = clawIdProp || pickedClawId || ''

    const reachableClaws = useMemo(() => {
        if (!clawsWithAgents) return []
        return clawsWithAgents.filter((c) => c.isReachable)
    }, [clawsWithAgents])

    const pickedClawName = useMemo(() => {
        if (clawNameProp) return clawNameProp
        const found = reachableClaws.find((c) => c.claw.id === pickedClawId)
        return found?.claw.name || ''
    }, [clawNameProp, reachableClaws, pickedClawId])

    const { data: envData } = useQuery({
        queryKey: ['claw-env', effectiveClawId],
        queryFn: () => api.getClawEnvVars(effectiveClawId),
        enabled: open && !!effectiveClawId,
        staleTime: 30000
    })

    const existingAgentNames = useMemo(() => {
        const cached = queryClient.getQueryData<ClawAgentsResponse>([
            PLAYGROUND_AGENTS_QUERY_KEY,
            effectiveClawId
        ])
        return cached?.agents.map((a) => a.name) || []
    }, [queryClient, effectiveClawId])

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

    const existingKeyValue = useMemo(() => {
        if (!selectedModelOption || !envData?.envVars) return ''
        return envData.envVars[selectedModelOption.envVar] || ''
    }, [selectedModelOption, envData])

    const resetForm = useCallback(() => {
        setName('')
        setNameError(null)
        setSelectedModel('')
        setApiKeyValue('')
        setShowApiKey(false)
        setCopied(false)
        setPickedClawId('')
    }, [])

    const handleCopyApiKey = useCallback(async () => {
        if (existingKeyValue) {
            await copyToClipboard(existingKeyValue)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [existingKeyValue])

    const createMutation = useMutation({
        mutationFn: (finalName: string) => {
            const envVarsObj: Record<string, string> = {}
            if (selectedModelOption && apiKeyValue) {
                envVarsObj[selectedModelOption.envVar] = apiKeyValue
            }
            return api.createClawAgent(effectiveClawId, {
                name: finalName,
                model: selectedModel || null,
                envVars:
                    Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined
            })
        },
        onSuccess: (response) => {
            showToast(t('playground.addAgentSuccess'), 'success')
            queryClient.setQueryData<ClawAgentsResponse>(
                [PLAYGROUND_AGENTS_QUERY_KEY, effectiveClawId],
                (old) => {
                    if (!old)
                        return { agents: [response.agent], reachable: true }
                    if (old.agents.some((a) => a.id === response.agent.id))
                        return old
                    return {
                        ...old,
                        agents: [...old.agents, response.agent]
                    }
                }
            )
            queryClient.invalidateQueries({
                queryKey: ['claw-env', effectiveClawId]
            })
            resetForm()
            onOpenChange(false)
        },
        onError: () => {
            showToast(t('playground.addAgentFailed'), 'error')
        }
    })

    const handleNameChange = useCallback(
        (value: string) => {
            setName(value)
            if (value.trim()) {
                const error = validateAgentName(value, existingAgentNames)
                setNameError(error)
            } else {
                setNameError(null)
            }
        },
        [existingAgentNames]
    )

    const handleSubmit = useCallback(() => {
        let finalName = name.trim()
        if (finalName) {
            const error = validateAgentName(finalName, existingAgentNames)
            if (error) {
                setNameError(error)
                return
            }
        } else {
            const adjectives = [
                'swift',
                'brave',
                'calm',
                'clever',
                'gentle',
                'mighty',
                'silent',
                'golden',
                'cosmic',
                'nimble',
                'jolly',
                'witty',
                'noble',
                'vivid',
                'crisp'
            ]
            const nouns = [
                'falcon',
                'lynx',
                'raven',
                'owl',
                'fox',
                'wolf',
                'bear',
                'crane',
                'spark',
                'frost',
                'ember',
                'cedar',
                'brook',
                'storm',
                'drift'
            ]
            const adj =
                adjectives[Math.floor(Math.random() * adjectives.length)]
            const noun = nouns[Math.floor(Math.random() * nouns.length)]
            finalName = `${adj}-${noun}`
            while (
                existingAgentNames.some(
                    (n) => n.toLowerCase() === finalName.toLowerCase()
                )
            ) {
                const adj2 =
                    adjectives[Math.floor(Math.random() * adjectives.length)]
                const noun2 = nouns[Math.floor(Math.random() * nouns.length)]
                finalName = `${adj2}-${noun2}`
            }
        }
        createMutation.mutate(finalName)
    }, [name, existingAgentNames, createMutation])

    const handleModelChange = useCallback((model: string) => {
        setSelectedModel(model)
        setApiKeyValue('')
        setShowApiKey(false)
    }, [])

    const handleClawChange = useCallback((id: string) => {
        setPickedClawId(id)
        setSelectedModel('')
        setApiKeyValue('')
        setShowApiKey(false)
    }, [])

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                resetForm()
            }
            onOpenChange(isOpen)
        },
        [onOpenChange, resetForm]
    )

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='flex max-h-[85vh] max-w-lg flex-col gap-0 p-0'>
                <DialogHeader className='p-6 pb-4'>
                    <DialogTitle>{t('playground.addAgentTitle')}</DialogTitle>
                    <DialogDescription>
                        {pickedClawName
                            ? t('playground.addAgentDescription', {
                                  clawName: pickedClawName
                              })
                            : t('playground.addAgentDescriptionNoClaw')}
                    </DialogDescription>
                </DialogHeader>

                <div className='flex-1 space-y-5 overflow-y-auto px-6 pb-6'>
                    {needsClawPicker && (
                        <div>
                            <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                                {t('playground.addAgentSelectClaw')}
                                <span className='ml-0.5 text-red-600 dark:text-red-400'>
                                    *
                                </span>
                            </label>
                            <Select
                                value={pickedClawId}
                                onValueChange={handleClawChange}
                                displayValue={pickedClawName || undefined}
                            >
                                <SelectTrigger
                                    placeholder={t(
                                        'playground.addAgentSelectClawPlaceholder'
                                    )}
                                    className='border-border bg-foreground/5 text-foreground h-9 text-sm'
                                />
                                <SelectContent className='max-h-[300px] overflow-y-auto'>
                                    {reachableClaws.map((c) => (
                                        <SelectItem
                                            key={c.claw.id}
                                            value={c.claw.id}
                                        >
                                            {c.claw.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div>
                        <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                            {t('playground.addAgentName')}
                        </label>
                        <input
                            type='text'
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder={t(
                                'playground.addAgentNamePlaceholder'
                            )}
                            className={`bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-[#ef5350]/50 ${
                                nameError
                                    ? 'border-red-500/50'
                                    : 'border-border'
                            }`}
                            autoFocus={!needsClawPicker}
                        />
                        {nameError ? (
                            <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                                {t(nameError)}
                            </p>
                        ) : (
                            <p className='text-muted-foreground mt-1.5 text-[11px]'>
                                {t('playground.settingsNameDescription')}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className='text-muted-foreground mb-2 block text-xs font-medium'>
                            {t('playground.addAgentModel')}
                        </label>
                        <Select
                            value={selectedModel}
                            onValueChange={handleModelChange}
                            displayValue={selectedModelOption?.name}
                        >
                            <SelectTrigger
                                placeholder={t(
                                    'playground.addAgentModelPlaceholder'
                                )}
                                className='border-border bg-foreground/5 text-foreground h-9 text-sm'
                            />
                            <SelectContent className='max-h-[300px] overflow-y-auto'>
                                {providerKeys.map((provider, index) => (
                                    <SelectGroup
                                        key={provider}
                                        label={provider}
                                        isLast={
                                            index === providerKeys.length - 1
                                        }
                                    >
                                        {modelsByProvider[provider].map(
                                            (model) => (
                                                <SelectItem
                                                    key={model.id}
                                                    value={model.id}
                                                >
                                                    {model.name}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectGroup>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedModelOption && (
                        <div>
                            <div className='mb-2 flex items-center justify-between'>
                                <label className='text-muted-foreground text-xs font-medium'>
                                    {t('playground.addAgentApiKey')}
                                </label>
                                <div className='flex items-center'>
                                    {existingKeyValue && (
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
                                </div>
                            </div>
                            {existingKeyValue ? (
                                <>
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={existingKeyValue}
                                        readOnly
                                        className='border-border bg-foreground/5 text-muted-foreground w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none'
                                    />
                                    <p className='mt-1.5 flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400'>
                                        <CheckCircleIcon
                                            className='h-3 w-3'
                                            weight='fill'
                                        />
                                        {t(
                                            'playground.addAgentApiKeyConfigured',
                                            {
                                                envVar: selectedModelOption.envVar
                                            }
                                        )}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKeyValue}
                                        onChange={(e) =>
                                            setApiKeyValue(e.target.value)
                                        }
                                        placeholder={t(
                                            'playground.addAgentApiKeyPlaceholder'
                                        )}
                                        className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 font-mono text-[11px] outline-none transition-colors focus:border-[#ef5350]/50'
                                    />
                                    <p className='text-muted-foreground mt-1.5 font-mono text-[11px]'>
                                        {selectedModelOption.envVar}
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className='border-border flex justify-end gap-3 border-t px-6 py-4'>
                    <button
                        onClick={() => handleOpenChange(false)}
                        className='text-muted-foreground hover:text-foreground rounded-lg px-4 py-2 text-sm font-medium transition-colors'
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={
                            !!nameError ||
                            createMutation.isPending ||
                            (needsClawPicker && !pickedClawId)
                        }
                        className='flex items-center gap-2 rounded-lg bg-[#ef5350] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#e53935] disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        {createMutation.isPending && (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        )}
                        {t('playground.addAgentSubmit')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default CreateAgentModal