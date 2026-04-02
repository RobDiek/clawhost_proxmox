import type { FC, ReactNode } from 'react'
import type {
    UserDropdownProps,
    FooterLink,
    ElectronWindow
} from '@/ts/Interfaces'

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
import ClawMascotOutline from '@/components/shared/ClawMascotOutline'
import {
    KeyIcon,
    UserIcon,
    SignOutIcon,
    ReceiptIcon,
    HandshakeIcon,
    ShieldCheckIcon
} from '@phosphor-icons/react'

const UserDropdown: FC<UserDropdownProps> = ({
    displayName,
    onSignOut,
    onOpen,
    hideBilling,
    hideSSHKeys,
    hideSignOut,
    footerLinks,
    openLinksWindowed,
    appVersion
}): ReactNode => {
    const navigate = useNavigate()
    const location = useLocation()
    const { data: profile } = useProfile()
    const isAdmin = profile?.role === userRole.admin
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

    const openLink = (link: FooterLink) => {
        if (link.external) {
            const api = (window as unknown as ElectronWindow).electronAPI
            if (api) {
                if (openLinksWindowed && api.openWindowed) {
                    api.openWindowed(link.href)
                } else {
                    api.openExternal(link.href)
                }
            } else {
                window.open(link.href, '_blank')
            }
        } else {
            navigate(link.href)
        }
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
                    onClick={() => navigate(ROUTES.CLAWS)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.CLAWS ? 'bg-foreground/10' : ''}`}
                >
                    <ClawMascotOutline className='h-4 w-4' />
                    {t('nav.claws')}
                </DropdownMenuItem>
                {!hideSSHKeys && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.SSH_KEYS)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.SSH_KEYS ? 'bg-foreground/10' : ''}`}
                    >
                        <KeyIcon className='h-4 w-4' />
                        {t('nav.sshKeys')}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onClick={() => navigate(ROUTES.AFFILIATE)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.AFFILIATE ? 'bg-foreground/10' : ''}`}
                >
                    <HandshakeIcon className='h-4 w-4' />
                    {t('nav.affiliate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => navigate(ROUTES.ACCOUNT)}
                    className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.ACCOUNT ? 'bg-foreground/10' : ''}`}
                >
                    <UserIcon className='h-4 w-4' />
                    {t('nav.account')}
                </DropdownMenuItem>
                {!hideBilling && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.BILLING)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.BILLING ? 'bg-foreground/10' : ''}`}
                    >
                        <ReceiptIcon className='h-4 w-4' />
                        {t('nav.billing')}
                    </DropdownMenuItem>
                )}

                {isAdmin && (
                    <DropdownMenuItem
                        onClick={() => navigate(ROUTES.ADMIN)}
                        className={`text-foreground/80 focus:bg-foreground/10 focus:text-foreground ${location.pathname === ROUTES.ADMIN ? 'bg-foreground/10' : ''}`}
                    >
                        <ShieldCheckIcon className='h-4 w-4' />
                        {t('nav.admin')}
                    </DropdownMenuItem>
                )}
                {footerLinks && footerLinks.length > 0 && (
                    <Fragment>
                        <DropdownMenuSeparator className='bg-border' />
                        <p className='text-muted-foreground px-2 py-1 text-[10px] font-medium uppercase tracking-wider'>
                            {t('footer.legalAndMore')}
                        </p>
                        {footerLinks.map((link) => (
                            <DropdownMenuItem
                                key={link.href}
                                onClick={() => openLink(link)}
                                className='text-foreground/80 focus:bg-foreground/10 focus:text-foreground text-xs'
                            >
                                {link.label}
                            </DropdownMenuItem>
                        ))}
                        {appVersion && (
                            <Fragment>
                                <DropdownMenuSeparator className='bg-border' />
                                <p className='text-muted-foreground/40 px-2 py-0.5 text-center text-[10px] tracking-wider'>
                                    {t('common.brandNameGoVersion', {
                                        version: appVersion
                                    })}
                                </p>
                            </Fragment>
                        )}
                    </Fragment>
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