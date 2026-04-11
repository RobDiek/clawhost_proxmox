import type { Claw } from '@/ts/Interfaces'
import type { UseClawSettingsFormReturn } from '@/ts/Interfaces'

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useRenameClaw, useUpdateClawSubdomain } from '@/hooks/useClaws'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'

const SUBDOMAIN_CHECK_DELAY = 500

const useClawSettingsForm = (claw: Claw): UseClawSettingsFormReturn => {
    const [settingsName, setSettingsName] = useState(claw.name)
    const [settingsNameError, setSettingsNameError] = useState('')
    const [settingsSubdomain, setSettingsSubdomain] = useState(
        claw.subdomain || ''
    )
    const [settingsSubdomainError, setSettingsSubdomainError] = useState('')
    const [subdomainChecking, setSubdomainChecking] = useState(false)
    const renameMutation = useRenameClaw()
    const subdomainMutation = useUpdateClawSubdomain()
    const { showToast } = useUIStore()
    const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        setSettingsName(claw.name)
        setSettingsNameError('')
    }, [claw.name])

    useEffect(() => {
        setSettingsSubdomain(claw.subdomain || '')
        setSettingsSubdomainError('')
    }, [claw.subdomain])

    const subdomainRegex = new RegExp(
        `^[a-z0-9]{${inputValidation.SUBDOMAIN.MIN},${inputValidation.SUBDOMAIN.MAX}}$`
    )

    const handleSettingsNameChange = useCallback((value: string) => {
        setSettingsName(value)
        if (value.trim() && !/^[a-zA-Z0-9-]+$/.test(value)) {
            setSettingsNameError(t('dashboard.renameInvalidChars'))
        } else {
            setSettingsNameError('')
        }
    }, [])

    const handleSettingsSubdomainChange = useCallback(
        (value: string) => {
            setSettingsSubdomain(value)

            if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

            if (!value.trim() || !subdomainRegex.test(value)) {
                setSubdomainChecking(false)
                setSettingsSubdomainError(
                    t('clawDetail.subdomainInvalid', {
                        min: inputValidation.SUBDOMAIN.MIN,
                        max: inputValidation.SUBDOMAIN.MAX
                    })
                )
                return
            }

            if (value.trim() === (claw.subdomain || '')) {
                setSubdomainChecking(false)
                setSettingsSubdomainError('')
                return
            }

            setSubdomainChecking(true)
            setSettingsSubdomainError('')

            checkTimerRef.current = setTimeout(async () => {
                try {
                    const result = await api.checkSubdomain(value.trim())
                    if (!result.available) {
                        setSettingsSubdomainError(
                            t('clawDetail.subdomainInUse')
                        )
                    }
                } catch {
                    setSettingsSubdomainError(
                        t('clawDetail.subdomainUpdateFailed')
                    )
                } finally {
                    setSubdomainChecking(false)
                }
            }, SUBDOMAIN_CHECK_DELAY)
        },
        [claw.subdomain, subdomainRegex]
    )

    useEffect(() => {
        return () => {
            if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
        }
    }, [])

    const nameHasChanges = settingsName.trim() !== claw.name
    const subdomainHasChanges =
        settingsSubdomain.trim() !== (claw.subdomain || '')
    const settingsHasChanges = nameHasChanges || subdomainHasChanges

    const handleSettingsSave = useCallback(() => {
        const trimmedName = settingsName.trim()
        const trimmedSubdomain = settingsSubdomain.trim()

        if (nameHasChanges && trimmedName && trimmedName !== claw.name) {
            if (!/^[a-zA-Z0-9-]+$/.test(trimmedName)) {
                setSettingsNameError(t('dashboard.renameInvalidChars'))
                return
            }
            renameMutation.mutate(
                { id: claw.id, name: trimmedName },
                {
                    onSuccess: () => {
                        showToast(
                            t('dashboard.renameSuccess'),
                            TOAST_TYPE.SUCCESS
                        )
                    },
                    onError: () => {
                        showToast(t('dashboard.renameFailed'), TOAST_TYPE.ERROR)
                    }
                }
            )
        }

        if (
            subdomainHasChanges &&
            trimmedSubdomain &&
            trimmedSubdomain !== (claw.subdomain || '')
        ) {
            if (!subdomainRegex.test(trimmedSubdomain)) {
                setSettingsSubdomainError(
                    t('clawDetail.subdomainInvalid', {
                        min: inputValidation.SUBDOMAIN.MIN,
                        max: inputValidation.SUBDOMAIN.MAX
                    })
                )
                return
            }
            subdomainMutation.mutate(
                { id: claw.id, subdomain: trimmedSubdomain },
                {
                    onSuccess: () => {
                        showToast(
                            t('clawDetail.subdomainUpdated'),
                            TOAST_TYPE.SUCCESS
                        )
                    },
                    onError: (err) => {
                        const message =
                            err instanceof Error && err.message
                                ? err.message
                                : t('clawDetail.subdomainUpdateFailed')
                        showToast(message, TOAST_TYPE.ERROR)
                    }
                }
            )
        }
    }, [
        settingsName,
        settingsSubdomain,
        claw.name,
        claw.subdomain,
        claw.id,
        nameHasChanges,
        subdomainHasChanges,
        renameMutation,
        subdomainMutation,
        subdomainRegex,
        showToast
    ])

    return {
        settingsName,
        settingsNameError,
        settingsSubdomain,
        settingsSubdomainError,
        settingsHasChanges,
        renamePending: renameMutation.isPending,
        subdomainPending: subdomainMutation.isPending || subdomainChecking,
        handleSettingsNameChange,
        handleSettingsSubdomainChange,
        handleSettingsSave
    }
}

export default useClawSettingsForm