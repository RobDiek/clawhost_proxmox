import type { FC, ReactNode } from 'react'
import type { LicenseCardProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { goLicense } from '@openclaw/shared'
import { Button } from '@/components/ui'
import {
    CheckCircleIcon,
    CheckIcon,
    CircleNotchIcon,
    LightningIcon
} from '@phosphor-icons/react'

const features = [
    () => t('license.featureUnlimitedClaws'),
    () => t('license.featureUnlimitedAgents'),
    () => t('license.featureDevices'),
    () => t('license.featureUpdates'),
    () => t('license.featureSupport'),
    () => t('license.featureCloud')
]

const LicenseCard: FC<LicenseCardProps> = ({
    hasLicense,
    isPurchasing,
    onPurchase
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
                <div className='flex items-center gap-2'>
                    <span className='font-clash text-lg font-bold'>
                        {t('license.planName')}
                    </span>
                    <span className='text-muted-foreground text-sm'>
                        {t('license.price', { price: goLicense.PRICE })}
                    </span>
                </div>
                {!hasLicense && (
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                        {t('license.priceNote')}
                    </p>
                )}
                <div className='mt-3 grid grid-cols-3 gap-x-0 gap-y-0'>
                    {features.map((getFeature) => {
                        const feature = getFeature()
                        return (
                            <div
                                key={feature}
                                className='flex items-center gap-1.5'
                            >
                                <CheckIcon
                                    className='text-primary h-3.5 w-3.5 shrink-0'
                                    weight='bold'
                                />
                                <span className='text-foreground/70 text-xs'>
                                    {feature}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
            {hasLicense ? (
                <div className='flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2'>
                    <CheckCircleIcon
                        className='h-4 w-4 shrink-0 text-green-500'
                        weight='fill'
                    />
                    <span className='text-sm font-medium text-green-600 dark:text-green-400'>
                        {t('license.activated')}
                    </span>
                </div>
            ) : (
                <Button
                    disabled={isPurchasing}
                    onClick={onPurchase}
                    className='h-9 shrink-0 gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-sm text-white hover:opacity-90'
                >
                    {isPurchasing ? (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    ) : (
                        <LightningIcon className='h-4 w-4' weight='fill' />
                    )}
                    {isPurchasing
                        ? t('license.purchasing')
                        : t('license.purchaseLicense')}
                </Button>
            )}
        </div>
    )
}

export default LicenseCard