import type { FC, ReactNode } from 'react'
import type { DashboardHeaderProps, ElectronWindow } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import {
    BetaBadge,
    LanguageSelector,
    Logo,
    SupportButton,
    ThemeToggle,
    UserDropdown
} from '@/components'
import { CircleNotchIcon, LightningIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'

const DashboardHeader: FC<DashboardHeaderProps> = ({
    isLocal,
    isLoading,
    displayedClaws,
    displayName,
    dnsSetup,
    dnsLoading,
    openLinksWindowed,
    appVersion,
    dropdownFooterLinks,
    onCreateClick,
    onDnsSetup,
    onSignOut
}): ReactNode => {
    return (
        <Fragment>
            <div className='border-border bg-background md:bg-background/80 relative z-10 flex items-center justify-between border-b px-6 py-3 md:backdrop-blur-xl'>
                <div className='flex items-center gap-3'>
                    <Logo />
                    {(window as unknown as ElectronWindow).electronAPI
                        ?.isDesktop && <BetaBadge />}
                </div>

                <div className='flex items-center gap-1.5 sm:gap-3'>
                    {!isLoading &&
                        displayedClaws &&
                        displayedClaws.length > 0 && (
                            <Button
                                onClick={onCreateClick}
                                className='border-border bg-foreground text-background hover:bg-foreground/90 gap-2 border'
                            >
                                <LightningIcon
                                    className='h-5 w-5'
                                    weight='fill'
                                />
                                <span className='sm:hidden'>
                                    {t('nav.deploy')}
                                </span>
                                <span className='hidden sm:inline'>
                                    {t('createClaw.title')}
                                </span>
                            </Button>
                        )}
                    <div className='flex items-center gap-1.5'>
                        <SupportButton />
                        <LanguageSelector />
                        <ThemeToggle />
                    </div>
                    <UserDropdown
                        displayName={displayName}
                        onSignOut={onSignOut}
                        hideSSHKeys={isLocal}
                        hideSignOut={isLocal}
                        footerLinks={dropdownFooterLinks}
                        openLinksWindowed={
                            isLocal ? openLinksWindowed : undefined
                        }
                        appVersion={appVersion || undefined}
                    />
                </div>
            </div>

            {isLocal && dnsSetup === false && displayedClaws.length > 0 && (
                <div className='border-border bg-foreground/5 relative z-10 flex items-center justify-between border-b px-6 py-2.5'>
                    <p className='text-foreground text-xs'>
                        {t('dashboard.dnsSetupBanner')}
                    </p>
                    <button
                        onClick={onDnsSetup}
                        disabled={dnsLoading}
                        className='flex items-center gap-1.5 rounded-md bg-[#ef5350] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#e53935] disabled:opacity-50'
                    >
                        {dnsLoading && (
                            <CircleNotchIcon className='h-3 w-3 animate-spin' />
                        )}
                        {t('dashboard.dnsSetupButton')}
                    </button>
                </div>
            )}
        </Fragment>
    )
}

export default DashboardHeader