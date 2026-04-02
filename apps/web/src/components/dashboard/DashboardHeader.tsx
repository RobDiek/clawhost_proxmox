import type { FC, ReactNode } from 'react'
import type { DashboardHeaderProps, ElectronWindow } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { DASHBOARD_TABS } from '@/lib'
import {
    BetaBadge,
    ActionButton,
    LanguageSelector,
    Logo,
    ThemeToggle,
    UserDropdown
} from '@/components'
import {
    ChatCircleDotsIcon,
    CircleNotchIcon,
    GraphIcon,
    LightningIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'

const DashboardHeader: FC<DashboardHeaderProps> = ({
    dashboardTab,
    isLocal,
    isLoading,
    displayedClaws,
    displayName,
    dnsSetup,
    dnsLoading,
    openLinksWindowed,
    appVersion,
    dropdownFooterLinks,
    onTabChange,
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
                    <div className='border-border flex items-center rounded-lg border p-0.5'>
                        <button
                            onClick={() => onTabChange(DASHBOARD_TABS.CHAT)}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${dashboardTab === DASHBOARD_TABS.CHAT ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <ChatCircleDotsIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    dashboardTab === DASHBOARD_TABS.CHAT
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span
                                className={
                                    dashboardTab === DASHBOARD_TABS.CHAT
                                        ? 'hidden sm:inline'
                                        : 'hidden md:inline'
                                }
                            >
                                {t('dashboard.chatTab')}
                            </span>
                        </button>
                        <button
                            onClick={() =>
                                onTabChange(DASHBOARD_TABS.PLAYGROUND)
                            }
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${dashboardTab === DASHBOARD_TABS.PLAYGROUND ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <GraphIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    dashboardTab === DASHBOARD_TABS.PLAYGROUND
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span
                                className={
                                    dashboardTab === DASHBOARD_TABS.PLAYGROUND
                                        ? 'hidden sm:inline'
                                        : 'hidden md:inline'
                                }
                            >
                                {t('dashboard.playgroundTab')}
                            </span>
                        </button>
                    </div>
                </div>

                <div className='flex items-center gap-1.5 sm:gap-3'>
                    {!isLoading &&
                        displayedClaws &&
                        displayedClaws.length > 0 && (
                            <Fragment>
                                <div className='sm:hidden'>
                                    <Button
                                        onClick={onCreateClick}
                                        size='icon'
                                        className='border-border bg-foreground text-background hover:bg-foreground/90 h-9 w-9 border'
                                    >
                                        <LightningIcon
                                            className='h-5 w-5'
                                            weight='fill'
                                        />
                                    </Button>
                                </div>
                                <div className='hidden sm:block'>
                                    <ActionButton
                                        onClick={onCreateClick}
                                        icon={
                                            <LightningIcon
                                                className='h-5 w-5'
                                                weight='fill'
                                            />
                                        }
                                        label={t('createClaw.title')}
                                    />
                                </div>
                            </Fragment>
                        )}
                    <div className='flex items-center gap-1.5'>
                        <LanguageSelector />
                        <ThemeToggle />
                    </div>
                    <UserDropdown
                        displayName={displayName}
                        onSignOut={onSignOut}
                        hideBilling={isLocal}
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