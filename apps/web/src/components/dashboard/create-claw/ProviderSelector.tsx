import type { FC, ReactNode } from 'react'
import type { ProviderSelectorProps, ProviderOptionWithIcon } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { clawProvider } from '@openclaw/shared'
import {
    Label,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider
} from '@/components/ui'
import { usePlans } from '@/hooks'

const ProviderSelector: FC<ProviderSelectorProps> = ({
    provider,
    atCapacity,
    isProviderUnavailable,
    onProviderChange
}): ReactNode => {
    const { plans: hetznerPlans, isLoading: hetznerLoading } = usePlans(
        clawProvider.hetzner
    )

    const hetznerAvailable = !hetznerLoading && !!hetznerPlans?.length

    return (
        <div className='space-y-1'>
            <Label>
                {t('createClaw.provider')}
                <span className='text-red-600 dark:text-red-400'>
                    {' '}
                    *
                </span>
            </Label>
            <TooltipProvider delayDuration={200}>
                <div className='bg-muted flex w-fit rounded-lg p-1'>
                    {(
                        [
                            {
                                key: clawProvider.hetzner,
                                label: t(
                                    'createClaw.providerHetzner'
                                ),
                                icon: (
                                    <svg
                                        className='h-4 w-4'
                                        viewBox='0 0 63 64'
                                        fill='none'
                                    >
                                        <rect
                                            width='63'
                                            height='64'
                                            rx='31.5'
                                            fill='#D50C2D'
                                        />
                                        <path
                                            d='M48.3772 14H43.4235C42.3132 14 41.8434 14.465 41.8434 15.564V27.9493H22.1566V15.564C22.1566 14.465 21.6868 14 20.5765 14H15.5801C14.4697 14 14 14.465 14 15.564V47.436C14 48.535 14.4697 49 15.5801 49H20.5765C21.6868 49 22.1566 48.5773 22.1566 47.436V34.8394H41.8861V47.436C41.8861 48.535 42.3559 49 43.4662 49H48.4199C49.5302 49 50 48.535 50 47.436V15.564C49.9573 14.5072 49.4875 14 48.3772 14Z'
                                            fill='white'
                                        />
                                    </svg>
                                )
                            },
                            {
                                key: clawProvider.digitalocean,
                                label: t(
                                    'createClaw.providerDigitalOcean'
                                ),
                                icon: (
                                    <svg
                                        className='h-4 w-4'
                                        viewBox='0 0 512 512'
                                        fill='none'
                                    >
                                        <path
                                            d='M78 373v-47h47v104h57V300h74v147A191 191 0 1065 256h74a117 117 0 11117 117'
                                            fill='#0080FF'
                                        />
                                    </svg>
                                )
                            },
                            {
                                key: clawProvider.vultr,
                                label: t(
                                    'createClaw.providerVultr'
                                ),
                                icon: (
                                    <svg
                                        className='h-4 w-4'
                                        viewBox='0 0 1024 1024'
                                        fill='none'
                                    >
                                        <circle
                                            cx='512'
                                            cy='512'
                                            r='512'
                                            fill='#007BFC'
                                        />
                                        <path
                                            d='M259.9 357.4c-2.5-3.9-3.9-8.6-3.9-13.6 0-14.1 11.5-25.6 25.6-25.6h131.1c9.1 0 17.1 4.8 21.7 12l181.9 288.5c2.5 4 3.9 8.6 3.9 13.6s-1.5 9.7-3.9 13.6l-65.6 104c-4.5 7.2-12.5 12-21.7 12-9.1 0-17.1-4.8-21.7-12L259.9 357.4zm395.3 158.1c4.5 7.2 12.5 11.9 21.7 11.9 9.1 0 17.1-4.8 21.7-11.9l22.6-35.8 43-68.2c2.5-3.9 3.9-8.6 3.9-13.7 0-5-1.5-9.7-3.9-13.7L730.1 330c-4.5-7.2-12.5-12-21.7-12H577.1c-14.1 0-25.6 11.5-25.6 25.6 0 5 1.4 9.7 3.9 13.6l99.8 158.3z'
                                            fill='white'
                                        />
                                    </svg>
                                )
                            }
                        ] as ProviderOptionWithIcon[]
                    ).map((p) => {
                        const unavailable = isProviderUnavailable(
                            p.key
                        )
                        const btn = (
                            <button
                                type='button'
                                disabled={unavailable}
                                onClick={() =>
                                    onProviderChange(p.key)
                                }
                                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                                    unavailable
                                        ? 'cursor-not-allowed opacity-50'
                                        : provider === p.key
                                          ? 'bg-background text-foreground shadow-sm'
                                          : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {p.icon}
                                {p.label}
                            </button>
                        )

                        if (unavailable) {
                            const isHetznerPreferred =
                                hetznerAvailable &&
                                p.key !== clawProvider.hetzner
                            return (
                                <Tooltip key={p.key}>
                                    <TooltipTrigger asChild>
                                        <div>{btn}</div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t(
                                            isHetznerPreferred
                                                ? 'createClaw.providerDisabledHetznerRecommended'
                                                : 'createClaw.providerUnavailable'
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            )
                        }

                        return <div key={p.key}>{btn}</div>
                    })}
                </div>
            </TooltipProvider>
            {atCapacity && (
                <p className='mt-2 rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400'>
                    {t('createClaw.providerAtCapacity')}
                </p>
            )}
        </div>
    )
}

export default ProviderSelector