import type {
    EnvVar,
    EnvVarValidationError,
    UseEnvVarsFormParams,
    UseEnvVarsFormReturn
} from '@/ts/Interfaces'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import { useUIStore, useVariablesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import {
    PLAYGROUND_AGENTS_QUERY_KEY,
    CLAW_ENV_QUERY_KEY,
    AGENT_CONFIG_QUERY_KEY
} from '@/hooks'

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/

const useEnvVarsForm = ({
    clawId,
    mockEnvVars
}: UseEnvVarsFormParams): UseEnvVarsFormReturn => {
    const [envVars, setEnvVars] = useState<Array<EnvVar>>([])
    const [hasChanges, setHasChanges] = useState(false)
    const {
        setShowErrors,
        setDeleteIndex,
        setDontAskAgain,
        dontAskAgain,
        deleteIndex,
        skipDeleteConfirmation,
        setSkipDeleteConfirmation
    } = useVariablesStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

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
        [executeDelete, envVars, envData, skipDeleteConfirmation]
    )

    const handleConfirmDelete = useCallback(() => {
        if (dontAskAgain) {
            setSkipDeleteConfirmation(true)
        }
        if (deleteIndex !== null) {
            executeDelete(deleteIndex)
        }
        setDeleteIndex(null)
    }, [dontAskAgain, deleteIndex, executeDelete, setSkipDeleteConfirmation])

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

    const save = useCallback(() => {
        setShowErrors(true)
        if (!hasErrors) saveMutation.mutate()
    }, [hasErrors, saveMutation])

    return {
        envVars,
        errors,
        hasErrors,
        hasChanges,
        isLoading,
        isError,
        isSavePending: saveMutation.isPending,
        isDeletePending: deleteMutation.isPending,
        handleAddVar,
        handleVarChange,
        handleRemoveVar,
        handleConfirmDelete,
        save
    }
}

export default useEnvVarsForm