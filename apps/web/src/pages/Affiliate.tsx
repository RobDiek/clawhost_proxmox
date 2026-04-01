import type { FC, ReactNode } from 'react'
import type { TranslationKey } from '@openclaw/i18n'
import type { AffiliatePeriod } from '@/ts/Types'
import type { AffiliateReferralEntry } from '@/ts/Interfaces'

import { useState, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import {
    useAffiliate,
    useGenerateReferralCode,
    useUpdateReferralCode,
    useProfile
} from '@/hooks'
import { copyToClipboard, getLocale } from '@/lib'
import { useUIStore } from '@/lib/store'
import STORAGE_KEYS from '@/lib/storageKeys'
import {
    Header,
    LandingFooter,
    PageBackground,
    PageTitle,
    PageHeader,
    EmptyState
} from '@/components'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Skeleton
} from '@/components/ui'
import {
    UsersThreeIcon,
    CopyIcon,
    CheckIcon,
    PencilSimpleIcon,
    CurrencyDollarIcon
} from '@phosphor-icons/react'

const PERIODS: AffiliatePeriod[] = ['today', 'week', 'month', 'year', 'all']

const PERIOD_LABELS: Record<AffiliatePeriod, TranslationKey> = {
    today: 'affiliate.periodToday',
    week: 'affiliate.periodWeek',
    month: 'affiliate.periodMonth',
    year: 'affiliate.periodYear',
    all: 'affiliate.periodAll'
}

const filterByPeriod = (referrals: AffiliateReferralEntry[], period: AffiliatePeriod): AffiliateReferralEntry[] => {
    if (period === 'all') return referrals
    const now = new Date()
    const cutoff = new Date()
    if (period === 'today') cutoff.setHours(0, 0, 0, 0)
    if (period === 'week') cutoff.setDate(now.getDate() - 7)
    if (period === 'month') cutoff.setMonth(now.getMonth() - 1)
    if (period === 'year') cutoff.setFullYear(now.getFullYear() - 1)
    return referrals.filter((r) => new Date(r.createdAt) >= cutoff)
}

const Affiliate: FC = (): ReactNode => {
    const { data: profile } = useProfile({ enabled: true })
    const { data: affiliate, isLoading: isHistoryLoading } = useAffiliate()
    const generateCode = useGenerateReferralCode()
    const updateCode = useUpdateReferralCode()
    const showToast = useUIStore((s) => s.showToast)
    const generatedRef = useRef(false)

    const [editing, setEditing] = useState(false)
    const [newCode, setNewCode] = useState('')
    const [copied, setCopied] = useState(false)
    const [confirmSave, setConfirmSave] = useState(false)
    const [period, setPeriodState] = useState<AffiliatePeriod>(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.AFFILIATE_PERIOD)
        return (PERIODS.includes(saved as AffiliatePeriod) ? saved : 'all') as AffiliatePeriod
    })

    const setPeriod = useCallback((p: AffiliatePeriod) => {
        setPeriodState(p)
        localStorage.setItem(STORAGE_KEYS.AFFILIATE_PERIOD, p)
    }, [])

    const referralCode = profile?.referralCode ?? null
    const referralCodeChanged = profile?.referralCodeChanged ?? false

    if (profile && !profile.referralCode && !generatedRef.current) {
        generatedRef.current = true
        generateCode.mutate()
    }

    const filteredReferrals = useMemo(
        () => filterByPeriod(affiliate?.referrals ?? [], period),
        [affiliate?.referrals, period]
    )

    const totalEarnings = filteredReferrals.reduce(
        (sum, r) => sum + r.earnedAmount,
        0
    )

    const handleCopy = async () => {
        if (!referralCode) return
        const url = `${window.location.origin}?ref=${referralCode}`
        await copyToClipboard(url)
        setCopied(true)
        showToast(t('common.copied'), 'success')
        setTimeout(() => setCopied(false), 2000)
    }

    const handleSave = () => {
        const trimmed = newCode.trim().toLowerCase()
        if (
            trimmed.length < inputValidation.REFERRAL_CODE.MIN ||
            trimmed.length > inputValidation.REFERRAL_CODE.MAX
        ) {
            showToast(
                t('affiliate.invalidCodeLength', {
                    min: String(inputValidation.REFERRAL_CODE.MIN),
                    max: String(inputValidation.REFERRAL_CODE.MAX)
                }),
                'error'
            )
            return
        }
        setConfirmSave(true)
    }

    const confirmAndSave = () => {
        const trimmed = newCode.trim().toLowerCase()
        setConfirmSave(false)
        updateCode.mutate({ code: trimmed }, {
            onSuccess: () => {
                setEditing(false)
                setNewCode('')
            }
        })
    }

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat(getLocale(), {
            style: 'currency',
            currency: 'USD'
        }).format(cents / 100)
    }

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('affiliate.title')}
                description={t('affiliate.description')}
                noIndex
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8'
            >
                <PageHeader
                    title={t('affiliate.title')}
                    description={t('affiliate.subtitle')}
                />

                <div className='border-border bg-foreground/5 rounded-xl border p-8 backdrop-blur-sm'>
                    <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
                        <div className='flex items-center gap-1'>
                            {PERIODS.map((p) => (
                                <button
                                    key={p}
                                    type='button'
                                    onClick={() => setPeriod(p)}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                        period === p
                                            ? 'bg-foreground/10 text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t(PERIOD_LABELS[p])}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className='border-border bg-foreground/5 mb-6 grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 rounded-lg border'>
                        <div className='p-5'>
                            <p className='text-muted-foreground mb-1 text-sm'>
                                {t('affiliate.referralCode')}
                            </p>
                            {!referralCode && generateCode.isPending ? (
                                <Skeleton className='bg-foreground/10 h-8 w-24 rounded' />
                            ) : editing ? (
                                <div>
                                    <div className='flex items-center gap-2'>
                                        <Input
                                            value={newCode}
                                            onChange={(e) =>
                                                setNewCode(e.target.value)
                                            }
                                            placeholder={referralCode ?? ''}
                                            maxLength={
                                                inputValidation.REFERRAL_CODE.MAX
                                            }
                                            className='h-8 max-w-[140px] text-sm'
                                        />
                                        <Button
                                            size='sm'
                                            onClick={handleSave}
                                            disabled={
                                                updateCode.isPending ||
                                                !newCode.trim()
                                            }
                                            className='h-8 px-2 text-xs'
                                        >
                                            {t('common.save')}
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() => {
                                                setEditing(false)
                                                setNewCode('')
                                            }}
                                            className='h-8 px-2 text-xs'
                                        >
                                            {t('common.cancel')}
                                        </Button>
                                    </div>
                                    <p className='text-muted-foreground mt-1 text-[11px]'>
                                        {t('affiliate.codeChangeHint')}
                                    </p>
                                </div>
                            ) : (
                                <div className='flex items-center gap-1.5'>
                                    <code className='text-lg font-bold font-mono'>
                                        {referralCode ?? '—'}
                                    </code>
                                    <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={handleCopy}
                                        disabled={!referralCode}
                                        className='h-7 w-7 p-0'
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
                                            onClick={() => setEditing(true)}
                                            className='h-7 w-7 p-0'
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
                            <p className='text-2xl font-bold'>
                                {filteredReferrals.length}
                            </p>
                        </div>
                        <div className='p-5'>
                            <p className='text-muted-foreground mb-1 text-sm'>
                                {t('affiliate.earnings')}
                            </p>
                            <p className='text-2xl font-bold'>
                                {formatCurrency(totalEarnings)}
                            </p>
                        </div>
                    </div>

                    <div className='border-border bg-foreground/5 rounded-lg border p-5'>
                        <p className='text-muted-foreground mb-3 text-sm font-medium'>
                            {t('affiliate.referralHistory')}
                        </p>
                        {isHistoryLoading ? (
                            <div className='space-y-2'>
                                <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                                <Skeleton className='bg-foreground/10 h-16 w-full rounded-lg' />
                            </div>
                        ) : filteredReferrals.length > 0 ? (
                            <div className='space-y-2'>
                                {filteredReferrals.map((ref) => (
                                    <div
                                        key={ref.id}
                                        className='border-border bg-foreground/5 flex items-center justify-between rounded-lg border px-4 py-3'
                                    >
                                        <div>
                                            <p className='text-sm font-medium'>
                                                {ref.referredEmail}
                                            </p>
                                            <p className='text-muted-foreground text-xs'>
                                                {new Date(
                                                    ref.createdAt
                                                ).toLocaleDateString(
                                                    getLocale(),
                                                    {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    }
                                                )}
                                            </p>
                                        </div>
                                        <div className='flex items-center gap-3'>
                                            <span className='bg-foreground/10 rounded-full px-2.5 py-0.5 text-xs capitalize'>
                                                {ref.status}
                                            </span>
                                            {ref.earnedAmount > 0 && (
                                                <span className='flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400'>
                                                    <CurrencyDollarIcon className='h-3.5 w-3.5' />
                                                    {formatCurrency(
                                                        ref.earnedAmount
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={
                                    <UsersThreeIcon className='text-primary h-10 w-10' />
                                }
                                title={t('affiliate.noReferralsYet')}
                                description={t(
                                    'affiliate.noReferralsDescription'
                                )}
                            />
                        )}
                    </div>
                </div>
            </motion.main>

            <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('affiliate.confirmChangeTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('affiliate.confirmChangeDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant='ghost'
                            onClick={() => setConfirmSave(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            onClick={confirmAndSave}
                            disabled={updateCode.isPending}
                        >
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <LandingFooter />
        </div>
    )
}

export default Affiliate