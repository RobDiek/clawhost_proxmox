import type { Claw } from '@/ts/Interfaces'
import type { UseClawSettingsFormReturn } from '@/ts/Interfaces'

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useRenameClaw, useUpdateClawSubdomain, useUpdateClawEmoji } from '@/hooks/useClaws'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'

const SUBDOMAIN_CHECK_DELAY = 500

const useClawSettingsForm = (claw: Claw): UseClawSettingsFormReturn => {
    const [settingsEmoji, setSettingsEmoji] = useState<string | null>(claw.emoji)
    const [settingsEmojiColor, setSettingsEmojiColor] = useState<string | null>(claw.emojiColor)
    const [settingsName, setSettingsName] = useState(claw.name)
    const [settingsNameError, setSettingsNameError] = useState('')
    const [settingsSubdomain, setSettingsSubdomain] = useState(
        claw.subdomain || ''
    )
    const [settingsSubdomainError, setSettingsSubdomainError] = useState('')
    const [subdomainChecking, setSubdomainChecking] = useState(false)
    const renameMutation = useRenameClaw()
    const subdomainMutation = useUpdateClawSubdomain()
    const emojiMutation = useUpdateClawEmoji()
    const { showToast } = useUIStore()
    const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        setSettingsEmoji(claw.emoji)
        setSettingsEmojiColor(claw.emojiColor)
    }, [claw.emoji, claw.emojiColor])

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

    const emojiHasChanges = settingsEmoji !== claw.emoji || settingsEmojiColor !== claw.emojiColor
    const nameHasChanges = settingsName.trim() !== claw.name
    const subdomainHasChanges =
        settingsSubdomain.trim() !== (claw.subdomain || '')
    const settingsHasChanges = emojiHasChanges || nameHasChanges || subdomainHasChanges

    const handleEmojiChange = useCallback((emoji: string | null, emojiColor: string | null) => {
        setSettingsEmoji(emoji)
        setSettingsEmojiColor(emojiColor)
    }, [])

    const handleSettingsSave = useCallback(() => {
        const trimmedName = settingsName.trim()
        const trimmedSubdomain = settingsSubdomain.trim()

        if (nameHasChanges && trimmedName && !/^[a-zA-Z0-9-]+$/.test(trimmedName)) {
            setSettingsNameError(t('dashboard.renameInvalidChars'))
            return
        }

        if (subdomainHasChanges && trimmedSubdomain && !subdomainRegex.test(trimmedSubdomain)) {
            setSettingsSubdomainError(
                t('clawDetail.subdomainInvalid', {
                    min: inputValidation.SUBDOMAIN.MIN,
                    max: inputValidation.SUBDOMAIN.MAX
                })
            )
            return
        }

        const mutations: Promise<unknown>[] = []

        if (emojiHasChanges)
            mutations.push(emojiMutation.mutateAsync({ id: claw.id, emoji: settingsEmoji, emojiColor: settingsEmojiColor }))

        if (nameHasChanges && trimmedName && trimmedName !== claw.name)
            mutations.push(renameMutation.mutateAsync({ id: claw.id, name: trimmedName }))

        if (subdomainHasChanges && trimmedSubdomain && trimmedSubdomain !== (claw.subdomain || ''))
            mutations.push(subdomainMutation.mutateAsync({ id: claw.id, subdomain: trimmedSubdomain }))

        if (mutations.length === 0) return

        Promise.all(mutations)
            .then(() => showToast(t('clawDetail.settingsUpdated'), TOAST_TYPE.SUCCESS))
            .catch(() => showToast(t('clawDetail.settingsUpdateFailed'), TOAST_TYPE.ERROR))
    }, [
        settingsEmoji,
        settingsEmojiColor,
        settingsName,
        settingsSubdomain,
        claw.emoji,
        claw.emojiColor,
        claw.name,
        claw.subdomain,
        claw.id,
        emojiHasChanges,
        nameHasChanges,
        subdomainHasChanges,
        emojiMutation,
        renameMutation,
        subdomainMutation,
        subdomainRegex,
        showToast
    ])

    return {
        settingsEmoji,
        settingsEmojiColor,
        settingsName,
        settingsNameError,
        settingsSubdomain,
        settingsSubdomainError,
        settingsHasChanges,
        renamePending: renameMutation.isPending,
        subdomainPending: subdomainMutation.isPending || subdomainChecking,
        emojiPending: emojiMutation.isPending,
        handleEmojiChange,
        handleSettingsNameChange,
        handleSettingsSubdomainChange,
        handleSettingsSave
    }
}

export default useClawSettingsForm