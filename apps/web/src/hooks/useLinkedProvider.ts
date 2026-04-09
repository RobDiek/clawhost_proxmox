import type { AuthMethod, OAuthProvider } from '@/ts/Types'
import type { UseLinkedProviderReturn } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import { OAUTH_PROVIDER, TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'
import { PROFILE_QUERY_KEY } from '@/hooks/useUser'

const useLinkedProvider = (): UseLinkedProviderReturn => {
    const { linkGoogle, linkGithub, unlinkGoogle, unlinkGithub } = useAuth()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const [linkingProvider, setLinkingProvider] = useState<AuthMethod | null>(
        null
    )
    const [unlinkingProvider, setUnlinkingProvider] =
        useState<AuthMethod | null>(null)

    const providerBusy = !!linkingProvider || !!unlinkingProvider

    const handleLinkProvider = useCallback(
        async (provider: OAuthProvider) => {
            if (providerBusy) return
            setLinkingProvider(provider)
            try {
                if (provider === OAUTH_PROVIDER.GOOGLE) {
                    await linkGoogle()
                } else {
                    await linkGithub()
                }
                await api.connectAuthMethod(provider)
                await queryClient.invalidateQueries({
                    queryKey: PROFILE_QUERY_KEY
                })
                showToast(
                    t('account.providerConnected', {
                        provider:
                            provider === OAUTH_PROVIDER.GOOGLE
                                ? t('account.authGoogle')
                                : t('account.authGithub')
                    }),
                    TOAST_TYPE.SUCCESS
                )
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : t('errors.somethingWentWrong')
                showToast(message, TOAST_TYPE.ERROR)
            } finally {
                setLinkingProvider(null)
            }
        },
        [providerBusy, linkGoogle, linkGithub, queryClient, showToast]
    )

    const handleUnlinkProvider = useCallback(
        async (provider: OAuthProvider) => {
            if (providerBusy) return
            setUnlinkingProvider(provider)
            try {
                await api.disconnectAuthMethod(provider)
                if (provider === OAUTH_PROVIDER.GOOGLE) {
                    await unlinkGoogle()
                } else {
                    await unlinkGithub()
                }
                await queryClient.invalidateQueries({
                    queryKey: PROFILE_QUERY_KEY
                })
                showToast(
                    t('account.providerDisconnected', {
                        provider:
                            provider === OAUTH_PROVIDER.GOOGLE
                                ? t('account.authGoogle')
                                : t('account.authGithub')
                    }),
                    TOAST_TYPE.SUCCESS
                )
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : t('errors.somethingWentWrong')
                showToast(message, TOAST_TYPE.ERROR)
            } finally {
                setUnlinkingProvider(null)
            }
        },
        [providerBusy, unlinkGoogle, unlinkGithub, queryClient, showToast]
    )

    return {
        linkingProvider,
        unlinkingProvider,
        providerBusy,
        handleLinkProvider,
        handleUnlinkProvider
    }
}

export default useLinkedProvider