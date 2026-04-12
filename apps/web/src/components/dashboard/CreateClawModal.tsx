import type { FC, ReactNode } from 'react'
import type { CreateClawModalProps, ErrorResponse } from '@/ts/Interfaces'

import { useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { billingInterval } from '@openclaw/shared'
import { Link } from 'react-router-dom'
import { ROUTES, isSafeRedirectUrl } from '@/lib'
import {
    usePurchaseClaw,
    usePlans,
    useLocations,
    useVolumePricing,
    usePlanAvailability,
    useToast,
    useCreateClawForm
} from '@/hooks'
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
    const {
        plans: providerPlans,
        isLoading: isLoadingPlans,
        atCapacity
    } = usePlans()
    const { data: providerLocations, isLoading: isLoadingLocations } =
        useLocations()
    const { data: providerVolumePricing } = useVolumePricing()
    const { data: providerPlanAvailability } = usePlanAvailability()

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

    const { values, errors, setField } = useCreateClawForm(
        initialPlanId,
        getFirstAvailableLocation(initialPlanId)
    )
    const {
        name,
        planId,
        location,
        password,
        showPassword,
        gatewayToken,
        showGatewayToken,
        selectedSshKeyId,
        volumeSize,
        billingCycle,
        showAdvanced,
        agreedToTerms
    } = values
    const nameError = errors.name

    const toast = useToast()

    useEffect(() => {
        if (!planId && plans.length > 0) {
            const firstPlan = getFirstEnabledPlan(plans)
            if (firstPlan) {
                setField('planId', firstPlan)
                setField('location', getFirstAvailableLocation(firstPlan))
            }
        }
    }, [plans, locations])

    useEffect(() => {
        if (planAvailability && planId) {
            if (!isPlanAvailable(planId)) {
                const betterPlan = getFirstEnabledPlan(plans)
                if (betterPlan) {
                    setField('planId', betterPlan)
                    setField('location', getFirstAvailableLocation(betterPlan))
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
                setField('location', getFirstAvailableLocation(planId))
            }
        }
    }, [planAvailability, planId])

    const purchaseMutation = usePurchaseClaw()

    const handleCreate = () => {
        if (name && !/^[a-zA-Z0-9-]+$/.test(name)) {
            setField('name', name)
            return
        }
        if (!location) {
            toast.error(t('errors.invalidLocation'))
            return
        }

        const selectedPlanData = plans.find((p) => p.id === planId)
        if (!selectedPlanData) {
            toast.error(t('errors.invalidPlan'))
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
                planId,
                location,
                password: password || undefined,
                gatewayToken: gatewayToken || undefined,
                sshKeyId: selectedSshKeyId || undefined,
                volumeSize: volumeSize > 0 ? volumeSize : undefined,
                priceMonthly: totalPrice,
                billingInterval: billingCycle
            },
            {
                onSuccess: (data) => {
                    if ((data as unknown as ErrorResponse).error) {
                        toast.error(
                            (data as unknown as ErrorResponse).error as string
                        )
                        return
                    }
                    if (isSafeRedirectUrl(data.checkoutUrl))
                        window.location.href = data.checkoutUrl
                },
                onError: (err: Error) => {
                    toast.error(err.message || t('errors.failedToCreateClaw'))
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
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder={t('createClaw.clawNamePlaceholder')}
                            className={`h-11 ${nameError ? 'border-red-500/50' : ''}`}
                        />
                        {nameError && (
                            <p className='mt-1.5 text-[11px] text-red-600 dark:text-red-400'>
                                {nameError}
                            </p>
                        )}
                    </div>

                    <LocationSelector
                        locations={locations}
                        location={location}
                        planId={planId}
                        atCapacity={atCapacity}
                        isLoading={isProviderLoading}
                        isLocationAvailableForPlan={isLocationAvailableForPlan}
                        onLocationChange={(v) => setField('location', v)}
                        onPlanChange={(v) => setField('planId', v)}
                        plans={plans}
                        isPlanAvailable={isPlanAvailable}
                    />

                    <BillingIntervalSelector
                        billingCycle={billingCycle}
                        onBillingCycleChange={(v) =>
                            setField('billingCycle', v)
                        }
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
                        onPlanChange={(v) => setField('planId', v)}
                        onLocationChange={(v) => setField('location', v)}
                        getFirstAvailableLocation={getFirstAvailableLocation}
                    />

                    <AdvancedOptions
                        showAdvanced={showAdvanced}
                        onToggleAdvanced={() =>
                            setField('showAdvanced', !showAdvanced)
                        }
                        password={password}
                        onPasswordChange={(v) => setField('password', v)}
                        showPassword={showPassword}
                        onToggleShowPassword={() =>
                            setField('showPassword', !showPassword)
                        }
                        gatewayToken={gatewayToken}
                        onGatewayTokenChange={(v) =>
                            setField('gatewayToken', v)
                        }
                        showGatewayToken={showGatewayToken}
                        onToggleShowGatewayToken={() =>
                            setField('showGatewayToken', !showGatewayToken)
                        }
                        sshKeys={sshKeys}
                        selectedSshKeyId={selectedSshKeyId}
                        onSshKeyChange={(v) => setField('selectedSshKeyId', v)}
                        onNavigateToSSHKeys={onNavigateToSSHKeys}
                        volumePricing={volumePricing}
                        volumeSize={volumeSize}
                        onVolumeSizeChange={(v) => setField('volumeSize', v)}
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
                                setField('agreedToTerms', !!checked)
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