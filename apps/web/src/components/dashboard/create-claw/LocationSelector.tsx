import type { FC, ReactNode } from 'react'
import type { LocationSelectorProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { locationFlags } from '@/lib/claw-utils'
import {
    Label,
    Skeleton,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider
} from '@/components/ui'

const LocationSelector: FC<LocationSelectorProps> = ({
    locations,
    location,
    planId,
    atCapacity,
    isLoading,
    isLocationAvailableForPlan,
    onLocationChange,
    onPlanChange,
    plans,
    isPlanAvailable
}): ReactNode => {
    return (
        <div className='space-y-2'>
            <Label>
                {t('createClaw.location')}
                <span className='text-red-600 dark:text-red-400'> *</span>
            </Label>
            {isLoading ? (
                <div className='grid grid-cols-2 gap-2'>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className='h-10 rounded-lg' />
                    ))}
                </div>
            ) : (
                <TooltipProvider delayDuration={200}>
                    <div className='grid grid-cols-2 gap-2'>
                        {locations.map((loc) => {
                            const isSelected = location === loc.id
                            const locFlag = locationFlags[loc.id] || ''
                            const unavailableForPlan =
                                !isLocationAvailableForPlan(loc.id, planId)
                            const isDisabled =
                                loc.disabled || unavailableForPlan || atCapacity
                            const locationLabel = loc.country
                                ? `${loc.city}, ${loc.country}`
                                : loc.city

                            const tooltipText = loc.disabled
                                ? t('createClaw.locationUnavailable')
                                : t('createClaw.locationUnavailableForPlan')

                            const card = (
                                <label
                                    className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${
                                        isDisabled
                                            ? 'bg-muted/50 cursor-not-allowed border border-transparent opacity-50'
                                            : isSelected
                                              ? 'cursor-pointer border border-[#ef5350]/50 bg-[#ef5350]/20'
                                              : 'bg-muted hover:bg-muted/80 cursor-pointer border border-transparent'
                                    }`}
                                >
                                    <input
                                        type='radio'
                                        name='location'
                                        value={loc.id}
                                        checked={isSelected}
                                        disabled={isDisabled}
                                        onChange={(e) => {
                                            const newLocation = e.target.value
                                            onLocationChange(newLocation)
                                            if (
                                                !isLocationAvailableForPlan(
                                                    newLocation,
                                                    planId
                                                )
                                            ) {
                                                const firstAvailable =
                                                    plans.find(
                                                        (p) =>
                                                            !p.disabled &&
                                                            isPlanAvailable(
                                                                p.id
                                                            ) &&
                                                            isLocationAvailableForPlan(
                                                                newLocation,
                                                                p.id
                                                            )
                                                    )
                                                if (firstAvailable) {
                                                    onPlanChange(
                                                        firstAvailable.id
                                                    )
                                                }
                                            }
                                        }}
                                        className='sr-only'
                                    />
                                    {locFlag && (
                                        <span className='text-lg'>
                                            {locFlag}
                                        </span>
                                    )}
                                    <p className='text-sm font-medium'>
                                        {locationLabel}
                                    </p>
                                </label>
                            )

                            if (isDisabled) {
                                return (
                                    <Tooltip key={loc.id}>
                                        <TooltipTrigger asChild>
                                            <div>{card}</div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {tooltipText}
                                        </TooltipContent>
                                    </Tooltip>
                                )
                            }

                            return <div key={loc.id}>{card}</div>
                        })}
                    </div>
                </TooltipProvider>
            )}
        </div>
    )
}

export default LocationSelector