import type { FC, ReactNode } from 'react'
import type { AuthMethod, OAuthProvider } from '@/ts/Types'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { authMethod, userRole, inputValidation } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { OAUTH_PROVIDER, TOAST_TYPE } from '@/lib/constants'
import { api, getLocale, ROUTES } from '@/lib'
import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    PROFILE_QUERY_KEY
} from '@/hooks'
import {
    Input,
    Label,
    Avatar,
    AvatarFallback,
    Button,
    Checkbox,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import {
    Header,
    LandingFooter,
    LicenseCard,
    LocalBackground,
    Logo,
    LanguageSelector,
    ThemeToggle,
    UserDropdown,
    PageBackground,
    PageTitle,
    ClawMascotOutline,
    PageHeader
} from '@/components'
import {
    CircleNotchIcon,
    CalendarIcon,
    KeyIcon,
    EnvelopeIcon
} from '@phosphor-icons/react'

const Account: FC = (): ReactNode => {
    const {
        user,
        loading: authLoading,
        updateCachedProfile,
        linkGoogle,
        linkGithub,
        unlinkGoogle,
        unlinkGithub,
        isLocal,
        signOut
    } = useAuth()
    const { showToast } = useUIStore()
    const { adminMode, setAdminMode, openLinksWindowed, setOpenLinksWindowed } =
        usePreferencesStore()
    const queryClient = useQueryClient()

    const [searchParams, setSearchParams] = useSearchParams()
    const [name, setName] = useState('')
    const [hasChanges, setHasChanges] = useState(false)
    const [isPurchasingLicense, setIsPurchasingLicense] = useState(false)
    const [linkingProvider, setLinkingProvider] = useState<AuthMethod | null>(
        null
    )
    const [unlinkingProvider, setUnlinkingProvider] =
        useState<AuthMethod | null>(null)

    const { data: profile } = useProfile({ enabled: !!user })
    const { data: userStats } = useUserStats()

    useEffect(() => {
        if (profile?.name) {
            setName(profile.name)
        }
    }, [profile?.name])

    useEffect(() => {
        if (searchParams.get('payment') !== 'success') return
        showToast(t('license.paymentSuccess'), TOAST_TYPE.SUCCESS)
        queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
        setSearchParams({}, { replace: true })
    }, [])

    const handlePurchaseLicense = async () => {
        setIsPurchasingLicense(true)
        try {
            const { checkoutUrl } = await api.purchaseLicense()
            window.location.href = checkoutUrl
        } catch {
            showToast(t('license.failedToPurchase'), TOAST_TYPE.ERROR)
            setIsPurchasingLicense(false)
        }
    }

    const updateMutation = useUpdateProfile()

    const handleSave = () => {
        updateMutation.mutate(
            { name },
            {
                onSuccess: (data) => {
                    setName(data.name || '')
                    setHasChanges(false)
                    updateCachedProfile({ name: data.name })
                    showToast(
                        t('account.profileUpdatedSuccessfully'),
                        TOAST_TYPE.SUCCESS
                    )
                },
                onError: (err: Error) => {
                    showToast(
                        err.message || t('errors.failedToUpdateProfile'),
                        TOAST_TYPE.ERROR
                    )
                }
            }
        )
    }

    const handleNameChange = (value: string) => {
        setName(value)
        setHasChanges(value !== (profile?.name || ''))
    }

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
                await queryClient.invalidateQueries({ queryKey: ['profile'] })
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
                await queryClient.invalidateQueries({ queryKey: ['profile'] })
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

    const email = user?.email || profile?.email || ''
    const displayName =
        name || profile?.name || (isLocal ? t('account.noNameSet') : email)

    const getInitials = (text: string) => {
        if (!text) return '?'
        const parts = text.split(' ')
        if (parts.length > 1) {
            return (
                parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
            ).toUpperCase()
        }
        return text.charAt(0).toUpperCase()
    }

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return '...'
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    const joinedDate = isLocal
        ? profile?.createdAt
        : user?.metadata?.creationTime

    return (
        <div
            className={`bg-background text-foreground ${isLocal ? 'fixed inset-0 flex flex-col overflow-hidden' : 'relative flex min-h-screen flex-col'}`}
        >
            {isLocal && <LocalBackground />}
            <PageTitle
                title={t('account.title')}
                description={t('account.description')}
                noIndex
            />
            {!isLocal && <PageBackground />}
            {isLocal ? (
                <div className='border-border bg-background md:bg-background/80 relative z-10 flex shrink-0 items-center justify-between border-b px-6 py-3 md:backdrop-blur-xl'>
                    <Logo to={ROUTES.CLAWS} />
                    <div className='flex items-center gap-1.5 sm:gap-3'>
                        <div className='flex items-center gap-1.5'>
                            <LanguageSelector />
                            <ThemeToggle />
                        </div>
                        <UserDropdown
                            displayName={displayName}
                            onSignOut={signOut}
                            hideBilling
                            hideSSHKeys
                        />
                    </div>
                </div>
            ) : (
                <Header />
            )}

            <div
                className={
                    isLocal
                        ? 'relative z-10 flex-1 overflow-y-auto'
                        : 'relative flex-1'
                }
            >
                <motion.main
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className='relative mx-auto w-full max-w-6xl px-6 pb-16 pt-8'
                >
                    {authLoading || !profile ? (
                        <div className='flex min-h-[60vh] items-center justify-center'>
                            <CircleNotchIcon className='text-primary h-8 w-8 animate-spin' />
                        </div>
                    ) : (
                        <Fragment>
                            <PageHeader
                                title={t('account.accountSettings')}
                                description={t('account.manageYourAccount')}
                            />

                            <div className='border-border bg-foreground/5 rounded-xl border p-8 backdrop-blur-sm'>
                                <div className='mb-6'>
                                    <h2 className='text-lg font-medium'>
                                        {t('account.profileInformation')}
                                    </h2>
                                    <p className='text-muted-foreground mt-1 text-sm'>
                                        {t('account.profileDescription')}
                                    </p>
                                </div>

                                <div className='mb-8 flex items-center gap-5'>
                                    <Avatar className='h-16 w-16 shrink-0'>
                                        <AvatarFallback className='bg-gradient-to-br from-[#ef5350] to-[#c62828] text-3xl font-semibold text-white'>
                                            {getInitials(displayName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className='flex-1'>
                                        <p className='text-lg font-medium'>
                                            {name ||
                                                profile?.name ||
                                                t('account.noNameSet')}
                                        </p>
                                        <div className='text-muted-foreground mt-1 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-6'>
                                            <div className='flex items-center gap-1.5'>
                                                <CalendarIcon className='h-4 w-4' />
                                                <span>
                                                    {t('account.joined')}{' '}
                                                    {formatDate(joinedDate)}
                                                </span>
                                            </div>
                                            <div className='flex items-center gap-1.5'>
                                                <ClawMascotOutline className='h-4 w-4' />
                                                <span>
                                                    {userStats?.clawCount ?? 0}{' '}
                                                    {t('account.claws')}
                                                </span>
                                            </div>
                                            {!isLocal && (
                                                <div className='flex items-center gap-1.5'>
                                                    <KeyIcon className='h-4 w-4' />
                                                    <span>
                                                        {userStats?.sshKeyCount ??
                                                            0}{' '}
                                                        {t('account.sshKeys')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className='space-y-6'>
                                    <div className='max-w-xs space-y-2'>
                                        <Label htmlFor='name'>
                                            {t('account.displayName')}
                                        </Label>
                                        <Input
                                            id='name'
                                            type='text'
                                            value={name}
                                            onChange={(e) =>
                                                handleNameChange(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === 'Enter' &&
                                                    hasChanges &&
                                                    !updateMutation.isPending
                                                ) {
                                                    handleSave()
                                                }
                                            }}
                                            placeholder={t(
                                                'account.enterYourName'
                                            )}
                                            maxLength={
                                                inputValidation.USER_NAME.MAX
                                            }
                                        />
                                    </div>

                                    {!isLocal && (
                                        <div className='max-w-xs space-y-2'>
                                            <Label htmlFor='email'>
                                                {t('account.emailAddress')}
                                            </Label>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Input
                                                        id='email'
                                                        type='email'
                                                        value={email}
                                                        readOnly
                                                        className='cursor-not-allowed opacity-50'
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>
                                                        {t(
                                                            'account.emailNotEditable'
                                                        )}
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    )}

                                    <div className='flex justify-end pt-6'>
                                        <Button
                                            onClick={handleSave}
                                            disabled={
                                                !hasChanges ||
                                                updateMutation.isPending
                                            }
                                        >
                                            {updateMutation.isPending && (
                                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                                            )}
                                            {t('common.save')}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {isLocal && (
                                <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
                                    <div className='mb-6'>
                                        <h2 className='text-lg font-medium'>
                                            {t('account.settings')}
                                        </h2>
                                        <p className='text-muted-foreground mt-1 text-sm'>
                                            {t('account.settingsDescription')}
                                        </p>
                                    </div>

                                    <label className='flex cursor-pointer items-center gap-3'>
                                        <Checkbox
                                            checked={openLinksWindowed}
                                            onCheckedChange={(checked) =>
                                                setOpenLinksWindowed(!!checked)
                                            }
                                        />
                                        <div>
                                            <span className='text-sm'>
                                                {t('account.openLinksWindowed')}
                                            </span>
                                            <p className='text-muted-foreground text-xs'>
                                                {t(
                                                    'account.openLinksWindowedDescription'
                                                )}
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {profile?.role === userRole.admin && (
                                <div
                                    id='license'
                                    className='border-border bg-foreground/5 mt-6 scroll-mt-24 rounded-xl border p-4 backdrop-blur-sm sm:p-8'
                                >
                                    <div className='mb-6'>
                                        <h2 className='text-lg font-medium'>
                                            {t('license.pageTitle')}
                                        </h2>
                                        <p className='text-muted-foreground mt-1 text-sm'>
                                            {t('license.pageDescription')}
                                        </p>
                                    </div>

                                    <LicenseCard
                                        hasLicense={
                                            profile?.hasLicense ?? false
                                        }
                                        isPurchasing={isPurchasingLicense}
                                        onPurchase={handlePurchaseLicense}
                                    />

                                    <p className='text-muted-foreground mt-3 text-xs'>
                                        {t('license.permanentNote')}
                                    </p>
                                </div>
                            )}

                            <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
                                <div className='mb-6'>
                                    <h2 className='text-lg font-medium'>
                                        {t('account.connectedAccounts')}
                                    </h2>
                                    <p className='text-muted-foreground mt-1 text-sm'>
                                        {t(
                                            'account.connectedAccountsDescription'
                                        )}
                                    </p>
                                </div>

                                <div className='space-y-3'>
                                    <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-4 py-3'>
                                        <div className='flex items-center gap-3'>
                                            <EnvelopeIcon className='text-foreground/60 h-5 w-5' />
                                            <span className='text-sm font-medium'>
                                                {t('account.authEmail')}
                                            </span>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    disabled
                                                    className='border-border text-foreground/50 flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs opacity-50'
                                                >
                                                    {t(
                                                        'account.authDisconnect'
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t(
                                                    'account.emailCannotBeDisconnected'
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>

                                    <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-4 py-3'>
                                        <div className='flex items-center gap-3'>
                                            <svg
                                                width='20'
                                                height='20'
                                                viewBox='0 0 24 24'
                                            >
                                                <path
                                                    d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'
                                                    fill='#4285F4'
                                                />
                                                <path
                                                    d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                                                    fill='#34A853'
                                                />
                                                <path
                                                    d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
                                                    fill='#FBBC05'
                                                />
                                                <path
                                                    d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                                                    fill='#EA4335'
                                                />
                                            </svg>
                                            <span className='text-sm font-medium'>
                                                {t('account.authGoogle')}
                                            </span>
                                        </div>
                                        {profile?.authMethods?.includes(
                                            authMethod.google
                                        ) ? (
                                            <button
                                                onClick={() =>
                                                    handleUnlinkProvider(
                                                        OAUTH_PROVIDER.GOOGLE
                                                    )
                                                }
                                                disabled={providerBusy}
                                                className='border-border text-foreground/50 flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors hover:border-red-500/50 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400'
                                            >
                                                {unlinkingProvider ===
                                                    OAUTH_PROVIDER.GOOGLE && (
                                                    <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                                )}
                                                {t('account.authDisconnect')}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() =>
                                                    handleLinkProvider(OAUTH_PROVIDER.GOOGLE)
                                                }
                                                disabled={providerBusy}
                                                className='flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs font-medium text-black transition-opacity hover:opacity-80 disabled:opacity-50'
                                            >
                                                {linkingProvider ===
                                                    OAUTH_PROVIDER.GOOGLE && (
                                                    <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                                )}
                                                {t('account.authConnect')}
                                            </button>
                                        )}
                                    </div>

                                    <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-4 py-3'>
                                        <div className='flex items-center gap-3'>
                                            <svg
                                                width='20'
                                                height='20'
                                                viewBox='0 0 24 24'
                                                fill='currentColor'
                                                className='text-foreground'
                                            >
                                                <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z' />
                                            </svg>
                                            <span className='text-sm font-medium'>
                                                {t('account.authGithub')}
                                            </span>
                                        </div>
                                        {profile?.authMethods?.includes(
                                            authMethod.github
                                        ) ? (
                                            <button
                                                onClick={() =>
                                                    handleUnlinkProvider(
                                                        OAUTH_PROVIDER.GITHUB
                                                    )
                                                }
                                                disabled={providerBusy}
                                                className='border-border text-foreground/50 flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors hover:border-red-500/50 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400'
                                            >
                                                {unlinkingProvider ===
                                                    OAUTH_PROVIDER.GITHUB && (
                                                    <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                                )}
                                                {t('account.authDisconnect')}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() =>
                                                    handleLinkProvider(OAUTH_PROVIDER.GITHUB)
                                                }
                                                disabled={providerBusy}
                                                className='flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs font-medium text-black transition-opacity hover:opacity-80 disabled:opacity-50'
                                            >
                                                {linkingProvider ===
                                                    OAUTH_PROVIDER.GITHUB && (
                                                    <CircleNotchIcon className='h-3 w-3 animate-spin' />
                                                )}
                                                {t('account.authConnect')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {!isLocal && profile?.role === userRole.admin && (
                                <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
                                    <div className='mb-6'>
                                        <h2 className='text-lg font-medium'>
                                            {t('account.settings')}
                                        </h2>
                                        <p className='text-muted-foreground mt-1 text-sm'>
                                            {t('account.settingsDescription')}
                                        </p>
                                    </div>

                                    <label className='flex cursor-pointer items-center gap-3'>
                                        <Checkbox
                                            checked={adminMode}
                                            onCheckedChange={(checked) =>
                                                setAdminMode(!!checked)
                                            }
                                        />
                                        <span className='text-sm'>
                                            {t('account.showAllClaws')}
                                        </span>
                                    </label>
                                </div>
                            )}
                        </Fragment>
                    )}
                </motion.main>
            </div>

            {!isLocal && <LandingFooter />}
        </div>
    )
}

export default Account