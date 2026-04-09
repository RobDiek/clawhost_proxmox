import type { FC, ReactNode } from 'react'
import type { AccountProfileSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { getLocale } from '@/lib'
import {
    Input,
    Label,
    Avatar,
    AvatarFallback,
    Button,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import { ClawMascotOutline } from '@/components'
import { CircleNotchIcon, CalendarIcon, KeyIcon } from '@phosphor-icons/react'

const getInitials = (text: string): string => {
    if (!text) return '?'
    const parts = text.split(' ')
    if (parts.length > 1) {
        return (
            parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
        ).toUpperCase()
    }
    return text.charAt(0).toUpperCase()
}

const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '...'
    return new Date(dateString).toLocaleDateString(getLocale(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

const AccountProfileSection: FC<AccountProfileSectionProps> = ({
    name,
    profileName,
    email,
    isLocal,
    joinedDate,
    clawCount,
    sshKeyCount,
    hasChanges,
    isPending,
    onNameChange,
    onSave
}): ReactNode => {
    const displayName =
        name || profileName || (isLocal ? t('account.noNameSet') : email)

    return (
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
                        {name || profileName || t('account.noNameSet')}
                    </p>
                    <div className='text-muted-foreground mt-1 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-6'>
                        <div className='flex items-center gap-1.5'>
                            <CalendarIcon className='h-4 w-4' />
                            <span>
                                {t('account.joined')} {formatDate(joinedDate)}
                            </span>
                        </div>
                        <div className='flex items-center gap-1.5'>
                            <ClawMascotOutline className='h-4 w-4' />
                            <span>
                                {clawCount} {t('account.claws')}
                            </span>
                        </div>
                        {!isLocal && (
                            <div className='flex items-center gap-1.5'>
                                <KeyIcon className='h-4 w-4' />
                                <span>
                                    {sshKeyCount} {t('account.sshKeys')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className='space-y-6'>
                <div className='max-w-xs space-y-2'>
                    <Label htmlFor='name'>{t('account.displayName')}</Label>
                    <Input
                        id='name'
                        type='text'
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && hasChanges && !isPending) {
                                onSave()
                            }
                        }}
                        placeholder={t('account.enterYourName')}
                        maxLength={inputValidation.USER_NAME.MAX}
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
                                <p>{t('account.emailNotEditable')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}

                <div className='flex justify-end pt-6'>
                    <Button
                        onClick={onSave}
                        disabled={!hasChanges || isPending}
                    >
                        {isPending && (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        )}
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AccountProfileSection