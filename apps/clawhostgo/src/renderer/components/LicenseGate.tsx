import type { FC, ReactNode } from 'react'
import type { LicenseGateProps } from '@/ts/Interfaces'

import { useAuth } from '@/lib/auth'
import { useProfile } from '@/hooks'
import {
    Logo,
    LanguageSelector,
    ThemeToggle,
    UserDropdown,
    LicenseRequired
} from '@/components'
import { CircleNotchIcon } from '@phosphor-icons/react'
import { ROUTES } from '@/lib'

const POLL_INTERVAL = 10_000

const LicenseGate: FC<LicenseGateProps> = ({ children }): ReactNode => {
    const { user, signOut } = useAuth()
    const { data: profile, isLoading } = useProfile({
        staleTime: POLL_INTERVAL,
        refetchInterval: POLL_INTERVAL
    })

    const displayName = profile?.name || user?.email || ''

    if (isLoading) {
        return (
            <div className='bg-background flex min-h-screen items-center justify-center'>
                <CircleNotchIcon className='text-primary h-8 w-8 animate-spin' />
            </div>
        )
    }

    if (!profile?.hasLicense) {
        return (
            <div className='bg-background text-foreground fixed inset-0 flex flex-col'>
                <div className='playground-grid pointer-events-none fixed inset-0 opacity-50' />
                <div className='playground-gradient pointer-events-none fixed inset-0 opacity-30' />

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

                <LicenseRequired />
            </div>
        )
    }

    return <>{children}</>
}

export default LicenseGate