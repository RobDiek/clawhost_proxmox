import type { FC, ReactNode } from 'react'
import type { AffiliateStatsGridProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useToast, useCopyWithFeedback } from '@/hooks'
import { Button, Input, Skeleton } from '@/components/ui'
import {
    CopyIcon,
    CheckIcon,
    PencilSimpleIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'

const AffiliateStatsGrid: FC<AffiliateStatsGridProps> = ({
    referralCode,
    referralCodeChanged,
    isLoading,
    referralCount,
    totalEarnings,
    formatCurrency,
    onSave,
    onCopy,
    isPending
}): ReactNode => {
    const toast = useToast()
    const { copied, copy } = useCopyWithFeedback()
    const [editing, setEditing] = useState(false)
    const [newCode, setNewCode] = useState('')

    const handleCopy = () => {
        if (!referralCode) return
        const url = `${window.location.origin}?ref=${referralCode}`
        copy(url)
        onCopy()
    }

    const handleSave = () => {
        const trimmed = newCode.trim().toLowerCase()
        if (
            trimmed.length < inputValidation.REFERRAL_CODE.MIN ||
            trimmed.length > inputValidation.REFERRAL_CODE.MAX
        ) {
            toast.error(
                t('affiliate.invalidCodeLength', {
                    min: String(inputValidation.REFERRAL_CODE.MIN),
                    max: String(inputValidation.REFERRAL_CODE.MAX)
                })
            )
            return
        }
        onSave(trimmed)
    }

    return (
        <div className='border-border bg-foreground/5 mb-6 grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0'>
            <div className='p-5'>
                <p className='text-muted-foreground mb-1 text-sm'>
                    {t('affiliate.referralCode')}
                </p>
                {!referralCode ? (
                    <Skeleton className='bg-foreground/10 h-8 w-24 rounded' />
                ) : editing ? (
                    <div className='flex items-center gap-2'>
                        <Input
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value)}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    newCode.trim() &&
                                    newCode.trim().toLowerCase() !==
                                        referralCode &&
                                    !isPending
                                ) {
                                    e.preventDefault()
                                    handleSave()
                                }
                            }}
                            maxLength={inputValidation.REFERRAL_CODE.MAX}
                            className='bg-foreground/10 !h-7 max-w-[140px] py-0 text-sm'
                        />
                        <Button
                            size='sm'
                            onClick={handleSave}
                            disabled={
                                isPending ||
                                !newCode.trim() ||
                                newCode.trim().toLowerCase() === referralCode
                            }
                            className='h-7 px-2 text-xs'
                        >
                            {isPending && (
                                <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                            )}
                            {t('common.save')}
                        </Button>
                        <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => {
                                setEditing(false)
                                setNewCode('')
                            }}
                            disabled={isPending}
                            className='h-7 bg-white/10 px-2 text-xs hover:bg-white/20'
                        >
                            {t('common.cancel')}
                        </Button>
                    </div>
                ) : (
                    <div className='flex items-center gap-1.5'>
                        <code className='font-mono text-lg font-bold'>
                            {referralCode ?? '—'}
                        </code>
                        <Button
                            size='sm'
                            variant='ghost'
                            onClick={handleCopy}
                            disabled={!referralCode}
                            className='text-muted-foreground hover:text-foreground hover:bg-foreground/10 h-7 w-7 p-0'
                        >
                            {copied ? (
                                <CheckIcon className='h-3.5 w-3.5' />
                            ) : (
                                <CopyIcon className='h-3.5 w-3.5' />
                            )}
                        </Button>
                        {!referralCodeChanged && referralCode && (
                            <Button
                                size='sm'
                                variant='ghost'
                                onClick={() => {
                                    setNewCode(referralCode ?? '')
                                    setEditing(true)
                                }}
                                className='text-muted-foreground hover:text-foreground hover:bg-foreground/10 h-7 w-7 p-0'
                            >
                                <PencilSimpleIcon className='h-3.5 w-3.5' />
                            </Button>
                        )}
                    </div>
                )}
            </div>
            <div className='p-5'>
                <p className='text-muted-foreground mb-1 text-sm'>
                    {t('affiliate.referrals')}
                </p>
                {isLoading ? (
                    <Skeleton className='bg-foreground/10 h-8 w-12 rounded' />
                ) : (
                    <p className='text-2xl font-bold'>{referralCount}</p>
                )}
            </div>
            <div className='p-5'>
                <p className='text-muted-foreground mb-1 text-sm'>
                    {t('affiliate.earnings')}
                </p>
                {isLoading ? (
                    <Skeleton className='bg-foreground/10 h-8 w-20 rounded' />
                ) : (
                    <p className='text-2xl font-bold'>
                        {formatCurrency(totalEarnings)}
                    </p>
                )}
            </div>
        </div>
    )
}

export default AffiliateStatsGrid