import type { FC, ReactNode } from 'react'
import type { CreateClawModalProps, ErrorResponse } from '@/ts/Interfaces'
import type { BillingInterval, ProviderType } from '@/ts/Types'

import { useState, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { billingInterval, clawProvider } from '@openclaw/shared'
import { Link } from 'react-router-dom'
import { useUIStore } from '@/lib/store'
import { ROUTES } from '@/lib'
import {
    usePurchaseClaw,
    usePlans,
    useLocations,
    useVolumePricing,
    usePlanAvailability
} from '@/hooks'
import { generatePassword } from '@/lib/claw-utils'
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Checkbox
} from '@/components/ui'
import { CircleNotchIcon } from '@phosphor-icons/react'
import {
    ProviderSelector,
    LocationSelector,
    BillingIntervalSelector,
    PlanSelector,
    AdvancedOptions,
    OrderSummary
} from '@/components/dashboard/create-claw'

const CreateClawModal: FC<CreateClawModalProps> = ({
    plans: initialPlans,
    locations: initialLocations,
    sshKeys,
    volumePricing: initialVolumePricing,
    planAvailability: initialPlanAvailability,
    preselectedPlanId,
    onClose,
    onNavigateToSSHKeys
}): ReactNode => {
    const [name, setName] = useState('')
    const [nameError, setNameError] = useState('')

    const provider: ProviderType = clawProvider.hetzner

    const {
        plans: providerPlans,
        isLoading: isLoadingPlans,
        atCapacity
    } = usePlans(provider)
    const { data: providerLocations, isLoading: isLoadingLocations } =
        useLocations(provider)
    const { data: providerVolumePricing } = useVolumePricing(provider)
    const { data: providerPlanAvailability } = usePlanAvailability(provider)

    const isProviderLoading = isLoadingPlans || isLoadingLocations
    const plans = providerPlans || initialPlans
    const locations = providerLocations || initialLocations
    const volumePricing = providerVolumePricing || initialVolumePricing
    const planAvailability = providerPlanAvailability || initialPlanAvailability

    const isPlanAvailable = (id: string): boolean => {
        if (!planAvailability) return true
        const available = planAvailability[id]
        if (!available) return true
        return available.length > 0
    }

    const getFirstEnabledPlan = (planList: typeof plans): string => {
        const enabled = planList.find(
            (p) => !p.disabled && isPlanAvailable(p.id)
        )
        return enabled?.id || planList.find((p) => !p.disabled)?.id || ''
    }

    const initialPlanId =
        preselectedPlanId &&
        plans.find((p) => p.id === preselectedPlanId && !p.disabled)
            ? preselectedPlanId
            : getFirstEnabledPlan(plans)
    const [planId, setPlanId] = useState(initialPlanId)

    const isLocationAvailableForPlan = (
        locationId: string,
        selectedPlanId: string
    ): boolean => {
        if (!planAvailability) return true
        const available = planAvailability[selectedPlanId]
        if (!available) return true
        return available.includes(locationId)
    }

    const getFirstAvailableLocation = (selectedPlanId: string): string => {
        const available = locations.find(
            (l) =>
                !l.disabled && isLocationAvailableForPlan(l.id, selectedPlanId)
        )
        return available?.id || locations[0]?.id || ''
    }

    const [location, setLocation] = useState(
        getFirstAvailableLocation(initialPlanId)
    )
    const [password, setPassword] = useState(generatePassword())
    const [showPassword, setShowPassword] = useState(false)
    const [selectedSshKeyId, setSelectedSshKeyId] = useState<string>('')
    const [volumeSize, setVolumeSize] = useState<number>(0)
    const [billingCycle, setBillingCycle] = useState<BillingInterval>(
        billingInterval.YEAR
    )
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [agreedToTerms, setAgreedToTerms] = useState(false)
    const { showToast } = useUIStore()

    useEffect(() => {
        if (!planId && plans.length > 0) {
            const firstPlan = getFirstEnabledPlan(plans)
            if (firstPlan) {
                setPlanId(firstPlan)
                setLocation(getFirstAvailableLocation(firstPlan))
            }
        }
    }, [plans, locations])

    useEffect(() => {
        if (planAvailability && planId) {
            if (!isPlanAvailable(planId)) {
                const betterPlan = getFirstEnabledPlan(plans)
                if (betterPlan) {
                    setPlanId(betterPlan)
                    setLocation(getFirstAvailableLocation(betterPlan))
                    return
                }
            }
            const currentAvailable = isLocationAvailableForPlan(
                location,
                planId
            )
            const currentDisabled = locations.find(
                (l) => l.id === location
            )?.disabled
            if (!currentAvailable || currentDisabled) {
                setLocation(getFirstAvailableLocation(planId))
            }
        }
    }, [planAvailability, planId])

    const purchaseMutation = usePurchaseClaw()

    const handleCreate = () => {
        if (name && !/^[a-zA-Z0-9-]+$/.test(name)) {
            setNameError(t('createClaw.clawNameInvalidChars'))
            return
        }
        if (!location) {
            showToast(t('errors.invalidLocation'), 'error')
            return
        }

        const selectedPlanData = plans.find((p) => p.id === planId)
        if (!selectedPlanData) {
            showToast(t('errors.invalidPlan'), 'error')
            return
        }

        const planPrice =
            billingCycle === billingInterval.YEAR
                ? selectedPlanData.priceYearly
                : selectedPlanData.priceMonthly
        let totalPrice = planPrice
        if (volumeSize > 0 && volumePricing) {
            const volumePrice =
                billingCycle === billingInterval.YEAR
                    ? volumeSize * volumePricing.pricePerGbMonthly * 10
                    : volumeSize * volumePricing.pricePerGbMonthly
            totalPrice += volumePrice
        }

        purchaseMutation.mutate(
            {
                name,
                provider,
                planId,
                location,
                password: password || undefined,
                sshKeyId: selectedSshKeyId || undefined,
                volumeSize: volumeSize > 0 ? volumeSize : undefined,
                priceMonthly: totalPrice,
                billingInterval: billingCycle
            },
            {
                onSuccess: (data) => {
                    if ((data as unknown as ErrorResponse).error) {
                        showToast(
                            (data as unknown as ErrorResponse).error as string,
                            'error'
                        )
                        return
                    }
                    window.location.href = data.checkoutUrl
                },
                onError: (err: Error) => {
                    showToast(
                        err.message || t('errors.failedToCreateClaw'),
                        'error'
                    )
                }
            }
        )
    }

    const selectedPlan = plans.find((p) => p.id === planId && !p.disabled)

    const totalAmount = selectedPlan
        ? (billingCycle === billingInterval.YEAR
              ? selectedPlan.priceYearly +
                (volumeSize > 0 && volumePricing
                    ? volumeSize * volumePricing.pricePerGbMonthly * 10
                    : 0)
              : selectedPlan.priceMonthly +
                (volumeSize > 0 && volumePricing
                    ? volumeSize * volumePricing.pricePerGbMonthly
                    : 0)
          ).toFixed(2)
        : '0.00'

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className='flex max-h-[85vh] max-w-lg flex-col gap-0 p-0'>
                <DialogHeader className='shrink-0 px-6 pb-4 pt-6'>
                    <DialogTitle>{t('createClaw.title')}</DialogTitle>
                    <DialogDescription>
                        {t('createClaw.description')}
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleCreate()
                    }}
                    className='flex-1 space-y-5 overflow-y-auto px-6 pb-6'
                >
                    <div className='space-y-2'>
                        <Label>{t('createClaw.clawName')}</Label>
                        <Input
                            type='text'
                            value={name}
                            onChange={(e) => {
                                const val = e.target.value
                                setName(val)
                                if (val && !/^[a-zA-Z0-9-]+$/.test(val)) {
                                    setNameError(
                                        t('createClaw.clawNameInvalidChars')
                                    )
                                } else {
                                    setNameError('')
                                }
                            }}
                            placeholder={t('createClaw.clawNamePlaceholder')}
                            className={`h-11 ${nameError ? 'border-red-500/50' : ''}`}
                        />
                        {nameError && (
                            <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                                {nameError}
                            </p>
                        )}
                    </div>

                    <ProviderSelector atCapacity={atCapacity} />

                    <LocationSelector
                        locations={locations}
                        location={location}
                        planId={planId}
                        atCapacity={atCapacity}
                        isLoading={isProviderLoading}
                        isLocationAvailableForPlan={isLocationAvailableForPlan}
                        onLocationChange={setLocation}
                        onPlanChange={setPlanId}
                        plans={plans}
                        isPlanAvailable={isPlanAvailable}
                    />

                    <BillingIntervalSelector
                        billingCycle={billingCycle}
                        onBillingCycleChange={setBillingCycle}
                    />

                    <PlanSelector
                        plans={plans}
                        planId={planId}
                        location={location}
                        billingCycle={billingCycle}
                        isLoading={isProviderLoading}
                        preselectedPlanId={preselectedPlanId}
                        isLocationAvailableForPlan={isLocationAvailableForPlan}
                        isPlanAvailable={isPlanAvailable}
                        onPlanChange={setPlanId}
                        onLocationChange={setLocation}
                        getFirstAvailableLocation={getFirstAvailableLocation}
                    />

                    <AdvancedOptions
                        showAdvanced={showAdvanced}
                        onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
                        password={password}
                        onPasswordChange={setPassword}
                        showPassword={showPassword}
                        onToggleShowPassword={() =>
                            setShowPassword(!showPassword)
                        }
                        sshKeys={sshKeys}
                        selectedSshKeyId={selectedSshKeyId}
                        onSshKeyChange={setSelectedSshKeyId}
                        onNavigateToSSHKeys={onNavigateToSSHKeys}
                        volumePricing={volumePricing}
                        volumeSize={volumeSize}
                        onVolumeSizeChange={setVolumeSize}
                    />

                    {selectedPlan && (
                        <OrderSummary
                            selectedPlan={selectedPlan}
                            name={name}
                            location={location}
                            locations={locations}
                            billingCycle={billingCycle}
                            volumeSize={volumeSize}
                            volumePricing={volumePricing}
                        />
                    )}

                    <label className='flex cursor-pointer items-start gap-2'>
                        <Checkbox
                            checked={agreedToTerms}
                            onCheckedChange={(checked) =>
                                setAgreedToTerms(!!checked)
                            }
                            className='mt-0.5'
                        />
                        <span className='text-muted-foreground text-xs'>
                            {t('createClaw.agreementNotice')}{' '}
                            <Link
                                to={ROUTES.TERMS}
                                className='text-muted-foreground hover:text-foreground underline'
                                target='_blank'
                            >
                                {t('auth.termsOfService')}
                            </Link>{' '}
                            {t('auth.andWord')}{' '}
                            <Link
                                to={ROUTES.PRIVACY}
                                className='text-muted-foreground hover:text-foreground underline'
                                target='_blank'
                            >
                                {t('auth.privacyPolicy')}
                            </Link>
                        </span>
                    </label>

                    <div className='flex justify-end gap-3'>
                        <Button type='button' variant='ghost' onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type='submit'
                            disabled={
                                purchaseMutation.isPending ||
                                !selectedPlan ||
                                !location ||
                                !!nameError ||
                                !agreedToTerms
                            }
                        >
                            {purchaseMutation.isPending && (
                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                            )}
                            {!selectedPlan
                                ? t('createClaw.selectServerToContinue')
                                : !location
                                  ? t('createClaw.selectLocationToContinue')
                                  : t('createClaw.proceedToPayment', {
                                        amount: totalAmount
                                    })}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default CreateClawModal