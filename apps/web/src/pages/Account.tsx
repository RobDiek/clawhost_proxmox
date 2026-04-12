import type { FC, ReactNode } from 'react'

import { Fragment, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { ROUTES } from '@/lib'
import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    useLinkedProvider,
    useCustomerPortal
} from '@/hooks'
import {
    Header,
    LandingFooter,
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
    AccountBillingSection,
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
    const { openLinksWindowed, setOpenLinksWindowed } = usePreferencesStore()
    const [name, setName] = useState('')
    const [hasChanges, setHasChanges] = useState(false)

    const { data: profile } = useProfile({ enabled: !!user })
    const { data: userStats } = useUserStats()

    const {
        linkingProvider,
        unlinkingProvider,
        providerBusy,
        handleLinkProvider,
        handleUnlinkProvider
    } = useLinkedProvider()

    const { openPortal, isLoading: isPortalLoading } = useCustomerPortal()

    useEffect(() => {
        if (profile?.name) {
            setName(profile.name)
        }
    }, [profile?.name])

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
                            <CircleNotchIcon className='text-foreground/50 h-7 w-7 animate-spin' />
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

                            {isLocal && (
                                <AccountSettingsSection
                                    openLinksWindowed={openLinksWindowed}
                                    setOpenLinksWindowed={setOpenLinksWindowed}
                                />
                            )}

                            {!isLocal && (
                                <AccountBillingSection
                                    isPortalLoading={isPortalLoading}
                                    onManageBilling={() => openPortal()}
                                />
                            )}

                            <ConnectedAccountsSection
                                authMethods={profile?.authMethods}
                                linkingProvider={linkingProvider}
                                unlinkingProvider={unlinkingProvider}
                                providerBusy={providerBusy}
                                onLink={handleLinkProvider}
                                onUnlink={handleUnlinkProvider}
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