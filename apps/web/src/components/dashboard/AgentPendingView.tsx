import type { FC, ReactNode } from 'react'
import type { AgentPendingViewProps } from '@/ts/Interfaces'
import type { TranslationKey } from '@openclaw/i18n'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { agentStatus } from '@openclaw/shared'
import { CreditCardIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { isSafeRedirectUrl } from '@/lib'

const TIPS: TranslationKey[] = [
    'clawDetail.loadingTip1',
    'clawDetail.loadingTip2',
    'clawDetail.loadingTip3',
    'clawDetail.loadingTip4',
    'clawDetail.loadingTip5',
    'clawDetail.loadingTip6',
    'clawDetail.loadingTip7',
    'clawDetail.loadingTip8',
    'clawDetail.loadingTip9',
    'clawDetail.loadingTip10',
    'clawDetail.loadingTip11',
    'clawDetail.loadingTip12',
    'clawDetail.loadingTip13'
]

const pulseRing = {
    initial: { scale: 0.8, opacity: 0.5 },
    animate: {
        scale: [0.8, 1.6, 0.8],
        opacity: [0.5, 0, 0.5]
    }
}

const AgentPendingView: FC<AgentPendingViewProps> = ({
    status,
    checkoutUrl,
    onCancel,
    cancelPending
}): ReactNode => {
    const isPayment = status === agentStatus.awaitingPayment
    const isConfiguring = status === agentStatus.configuring
    const [tipIndex, setTipIndex] = useState(0)

    useEffect(() => {
        if (isPayment) return
        const interval = setInterval(() => {
            setTipIndex((prev) => (prev + 1) % TIPS.length)
        }, 5000)
        return () => clearInterval(interval)
    }, [isPayment])

    return (
        <div className='flex flex-1 flex-col items-center justify-center gap-6 p-6'>
            <div className='relative flex items-center justify-center'>
                {!isPayment && (
                    <motion.div
                        className='bg-primary/20 absolute h-16 w-16 rounded-full'
                        variants={pulseRing}
                        initial='initial'
                        animate='animate'
                        transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: 'easeInOut'
                        }}
                    />
                )}
                <div
                    className={`relative flex h-14 w-14 items-center justify-center rounded-full ${isPayment ? 'bg-yellow-500/10' : 'bg-primary/10'}`}
                >
                    {isPayment ? (
                        <CreditCardIcon className='h-6 w-6 text-yellow-500' />
                    ) : (
                        <motion.div
                            className='bg-primary h-3 w-3 rounded-full'
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: 'easeInOut'
                            }}
                        />
                    )}
                </div>
            </div>

            <div className='space-y-2 text-center'>
                <h3 className='text-foreground text-base font-semibold'>
                    {isPayment
                        ? t('clawDetail.awaitingPaymentTitle')
                        : isConfiguring
                          ? t('clawDetail.configuringTitle')
                          : t('clawDetail.creatingTitle')}
                </h3>
                <p className='text-muted-foreground max-w-[300px] text-sm leading-relaxed'>
                    {isPayment
                        ? t('clawDetail.awaitingPaymentDescription')
                        : isConfiguring
                          ? t('clawDetail.configuringDescription')
                          : t('clawDetail.creatingDescription')}
                </p>
            </div>

            {isPayment && (
                <div className='flex items-center gap-2'>
                    <Button
                        variant='default'
                        size='sm'
                        onClick={() => {
                            if (checkoutUrl && isSafeRedirectUrl(checkoutUrl))
                                window.open(checkoutUrl, '_blank')
                        }}
                    >
                        {t('clawDetail.awaitingPaymentAction')}
                    </Button>
                    {onCancel && (
                        <Button
                            variant='outline'
                            size='sm'
                            disabled={cancelPending}
                            onClick={onCancel}
                        >
                            {t('dashboard.cancelPurchase')}
                        </Button>
                    )}
                </div>
            )}

            {!isPayment && (
                <div className='mt-4 h-5 text-center'>
                    <AnimatePresence mode='wait'>
                        <motion.p
                            key={tipIndex}
                            className='text-muted-foreground/60 text-xs italic'
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                        >
                            {t(TIPS[tipIndex])}
                        </motion.p>
                    </AnimatePresence>
                </div>
            )}
        </div>
    )
}

export default AgentPendingView