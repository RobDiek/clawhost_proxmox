import type { FC, ReactNode } from 'react'
import type { UserDropdownProps, ElectronWindow } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { userRole } from '@openclaw/shared'
import { ROUTES } from '@/lib'
import { useProfile } from '@/hooks'
import {
    Button,
    Avatar,
    AvatarFallback,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui'
import {
    GhostIcon,
    KeyIcon,
    UserIcon,
    SignOutIcon,
    HandshakeIcon,
    ShieldCheckIcon,
    CertificateIcon
} from '@phosphor-icons/react'

const UserDropdown: FC<UserDropdownProps> = ({
    displayName,
    onSignOut,
    onOpen,
    hideSSHKeys,
    hideSignOut
}): ReactNode => {
    const navigate = useNavigate()
    const location = useLocation()
    const { data: profile } = useProfile()
    const isAdmin = profile?.role === userRole.admin
    const isDesktop = !!(window as unknown as ElectronWindow).electronAPI
        ?.isDesktop
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

    const handleOpenChange = (open: boolean) => {
        if (open && onOpen) onOpen()
    }

    return (
        <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant='ghost'
                    size='sm'
                    className='hover:bg-foreground/10 flex w-auto items-center gap-2 px-1.5 py-[18px]'
                >
                    <Avatar className='h-7 w-7'>
                        <AvatarFallback className='bg-gradient-to-br from-[#ef5350] to-[#c62828] text-xs text-white'>
                            {getInitials(displayName)}
                        </AvatarFallback>
                    </Avatar>
                    <span className='text-foreground/80 hidden max-w-[120px] truncate text-sm sm:block'>
                        {displayName}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align='end'
                className='border-border bg-popover w-56'
            >
                <DropdownMenuItem
                    onClick={() => navigate(ROUTES.AGENTS)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.AGENTS ? 'bg-foreground/10' : ''}`}
                >
                    <GhostIcon className='h-4 w-4' />
                    {t('nav.claws')}
                </DropdownMenuItem>
                {!hideSSHKeys && !isDesktop && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.SSH_KEYS)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.SSH_KEYS ? 'bg-foreground/10' : ''}`}
                    >
                        <KeyIcon className='h-4 w-4' />
                        {t('nav.sshKeys')}
                    </DropdownMenuItem>
                )}
                {!isDesktop && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.AFFILIATE)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.AFFILIATE ? 'bg-foreground/10' : ''}`}
                    >
                        <HandshakeIcon className='h-4 w-4' />
                        {t('nav.affiliate')}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onClick={() => navigate(ROUTES.LICENSE)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.LICENSE ? 'bg-foreground/10' : ''}`}
                >
                    <CertificateIcon className='h-4 w-4' />
                    {t('nav.license')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => navigate(ROUTES.ACCOUNT)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.ACCOUNT ? 'bg-foreground/10' : ''}`}
                >
                    <UserIcon className='h-4 w-4' />
                    {t('nav.account')}
                </DropdownMenuItem>

                {isAdmin && !isDesktop && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.ADMIN)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.ADMIN ? 'bg-foreground/10' : ''}`}
                    >
                        <ShieldCheckIcon className='h-4 w-4' />
                        {t('nav.admin')}
                    </DropdownMenuItem>
                )}
                {!hideSignOut && (
                    <Fragment>
                        <DropdownMenuSeparator className='bg-border' />
                        <DropdownMenuItem
                            onClick={onSignOut}
                            className='focus:bg-foreground/10 text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400'
                        >
                            <SignOutIcon className='h-4 w-4' />
                            {t('nav.signOut')}
                        </DropdownMenuItem>
                    </Fragment>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default UserDropdown