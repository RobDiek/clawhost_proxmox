import type { FC, ReactNode } from 'react'
import type { PlanSelectorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { billingInterval } from '@openclaw/shared'
import {
    Label,
    Skeleton,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider
} from '@/components/ui'

const PlanSelector: FC<PlanSelectorProps> = ({
    plans,
    planId,
    location,
    provider,
    billingCycle,
    isLoading,
    isLocationAvailableForPlan,
    isPlanAvailable,
    onPlanChange,
    onLocationChange,
    getFirstAvailableLocation
}): ReactNode => {
    return (
        <div className='space-y-2'>
            <Label>
                {t('createClaw.plan')}
                <span className='text-red-600 dark:text-red-400'>
                    {' '}
                    *
                </span>
            </Label>
            {isLoading ? (
                <div className='space-y-2'>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton
                            key={i}
                            className='h-14 rounded-lg'
                        />
                    ))}
                </div>
            ) : (
                <TooltipProvider delayDuration={200}>
                    <div className='space-y-2'>
                        {plans.map((plan, index) => {
                            const isSelected = planId === plan.id
                            const unavailableForLocation =
                                location &&
                                !isLocationAvailableForPlan(
                                    location,
                                    plan.id
                                )
                            const isDisabled =
                                plan.disabled ||
                                !isPlanAvailable(plan.id) ||
                                !!unavailableForLocation

                            const tierStarts: Record<
                                string,
                                Record<string, string>
                            > = {
                                hetzner: {
                                    cx23: t('landing.tierShared'),
                                    cax11: t('landing.tierArm'),
                                    ccx13: t(
                                        'landing.tierDedicated'
                                    )
                                },
                                vultr: {
                                    'vc2-2c-4gb': t(
                                        'landing.tierRegular'
                                    ),
                                    'vhp-2c-4gb-amd': t(
                                        'landing.tierHighPerformance'
                                    ),
                                    'vhf-3c-8gb': t(
                                        'landing.tierHighFrequency'
                                    )
                                }
                            }
                            const providerTiers =
                                tierStarts[provider]
                            const tierLabel =
                                providerTiers?.[plan.id]

                            const card = (
                                <label
                                    className={`flex items-center justify-between rounded-lg p-3 transition ${
                                        isDisabled
                                            ? 'bg-muted/50 cursor-not-allowed border border-transparent opacity-50'
                                            : isSelected
                                              ? 'cursor-pointer border border-[#ef5350]/50 bg-[#ef5350]/20'
                                              : 'bg-muted hover:bg-muted/80 cursor-pointer border border-transparent'
                                    }`}
                                >
                                    <div className='flex items-center gap-3'>
                                        <input
                                            type='radio'
                                            name='plan'
                                            value={plan.id}
                                            checked={isSelected}
                                            disabled={isDisabled}
                                            onChange={(e) => {
                                                const newPlanId =
                                                    e.target.value
                                                onPlanChange(newPlanId)
                                                if (
                                                    !isLocationAvailableForPlan(
                                                        location,
                                                        newPlanId
                                                    )
                                                ) {
                                                    onLocationChange(
                                                        getFirstAvailableLocation(
                                                            newPlanId
                                                        )
                                                    )
                                                }
                                            }}
                                            className='sr-only'
                                        />
                                        <div>
                                            <p className='text-sm font-medium'>
                                                {plan.name.replace(
                                                    /([A-Za-z])(\d)/,
                                                    '$1 $2'
                                                )}
                                            </p>
                                            <p className='text-muted-foreground text-xs'>
                                                {t(
                                                    'createClaw.planSpec',
                                                    {
                                                        cpu: String(
                                                            plan.cpu
                                                        ),
                                                        memory: String(
                                                            plan.memory
                                                        ),
                                                        disk: String(
                                                            plan.disk
                                                        )
                                                    }
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <span className='text-sm font-semibold'>
                                        $
                                        {billingCycle === billingInterval.YEAR
                                            ? plan.priceYearly.toFixed(2)
                                            : plan.priceMonthly.toFixed(2)}
                                        {billingCycle === billingInterval.YEAR
                                            ? t('landing.perYear')
                                            : t('landing.perMonth')}
                                    </span>
                                </label>
                            )

                            const separator =
                                tierLabel && index > 0 ? (
                                    <div
                                        key={`tier-${plan.id}`}
                                        className='pb-1 pt-4'
                                    >
                                        <span className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
                                            {tierLabel}
                                        </span>
                                    </div>
                                ) : null

                            if (isDisabled) {
                                const tooltipText =
                                    unavailableForLocation
                                        ? t(
                                              'createClaw.planUnavailableForLocation'
                                          )
                                        : t(
                                              'createClaw.planUnavailable'
                                          )
                                return (
                                    <>
                                        {separator}
                                        <Tooltip key={plan.id}>
                                            <TooltipTrigger asChild>
                                                <div>{card}</div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {tooltipText}
                                            </TooltipContent>
                                        </Tooltip>
                                    </>
                                )
                            }

                            return (
                                <>
                                    {separator}
                                    <div key={plan.id}>{card}</div>
                                </>
                            )
                        })}
                    </div>
                </TooltipProvider>
            )}
        </div>
    )
}

export default PlanSelector