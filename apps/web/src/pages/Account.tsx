import type { FC, ReactNode } from 'react'

import { Fragment, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api, ROUTES } from '@/lib'
import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    useLinkedProvider,
    PROFILE_QUERY_KEY
} from '@/hooks'
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
    PageHeader,
    AccountProfileSection,
    AccountSettingsSection,
    ConnectedAccountsSection
} from '@/components'
import { CircleNotchIcon } from '@phosphor-icons/react'

const Account: FC = (): ReactNode => {
    const {
        user,
        loading: authLoading,
        updateCachedProfile,
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

    const { data: profile } = useProfile({ enabled: !!user })
    const { data: userStats } = useUserStats()

    const {
        linkingProvider,
        unlinkingProvider,
        providerBusy,
        handleLinkProvider,
        handleUnlinkProvider
    } = useLinkedProvider()

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

    const email = user?.email || profile?.email || ''
    const displayName =
        name || profile?.name || (isLocal ? t('account.noNameSet') : email)

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

                            <AccountProfileSection
                                name={name}
                                profileName={profile?.name ?? null}
                                email={email}
                                isLocal={!!isLocal}
                                joinedDate={joinedDate}
                                clawCount={userStats?.clawCount ?? 0}
                                sshKeyCount={userStats?.sshKeyCount ?? 0}
                                hasChanges={hasChanges}
                                isPending={updateMutation.isPending}
                                onNameChange={handleNameChange}
                                onSave={handleSave}
                            />

                            <AccountSettingsSection
                                showLocal={!!isLocal}
                                showAdmin={false}
                                openLinksWindowed={openLinksWindowed}
                                setOpenLinksWindowed={setOpenLinksWindowed}
                                adminMode={adminMode}
                                setAdminMode={setAdminMode}
                            />

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

                            <ConnectedAccountsSection
                                authMethods={profile?.authMethods}
                                linkingProvider={linkingProvider}
                                unlinkingProvider={unlinkingProvider}
                                providerBusy={providerBusy}
                                onLink={handleLinkProvider}
                                onUnlink={handleUnlinkProvider}
                            />

                            <AccountSettingsSection
                                showLocal={false}
                                showAdmin={
                                    !isLocal && profile?.role === userRole.admin
                                }
                                openLinksWindowed={openLinksWindowed}
                                setOpenLinksWindowed={setOpenLinksWindowed}
                                adminMode={adminMode}
                                setAdminMode={setAdminMode}
                            />
                        </Fragment>
                    )}
                </motion.main>
            </div>

            {!isLocal && <LandingFooter />}
        </div>
    )
}

export default Account