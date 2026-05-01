import type { FC, ReactNode } from 'react'
import type { AgentType } from '@/ts/Types'
import type { CreateAgentModalProps, ErrorResponse } from '@/ts/Interfaces'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    agentType as agentTypeConst,
    billingInterval,
    PLANS,
    YEARLY_PAID_MONTHS
} from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { api, isSafeRedirectUrl, formatCompactNumber } from '@/lib'
import { calculateTotalAmount } from '@/lib/create-agent'
import {
    usePurchaseAgent,
    useLocations,
    useVolumePricing,
    usePlanAvailability,
    useAgentStars,
    useToast,
    useCreateAgentForm
} from '@/hooks'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui'
import {
    AdvancedOptions,
    AgentNameField,
    AgentTypeSelector,
    BillingIntervalSelector,
    CreateAgentSubmitActions,
    LocationSelector,
    OrderSummary,
    PlanSelector,
    TermsAgreement
} from '@/components/dashboard/create-agent'

const CreateAgentModal: FC<CreateAgentModalProps> = ({
    plans: initialPlans,
    locations: initialLocations,
    sshKeys,
    volumePricing: initialVolumePricing,
    planAvailability: initialPlanAvailability,
    preselectedPlanId,
    onClose,
    onNavigateToSSHKeys
}): ReactNode => {
    const providerPlans = PLANS
    const { data: providerLocations, isLoading: isLoadingLocations } =
        useLocations()
    const { data: providerVolumePricing } = useVolumePricing()
    const { data: providerPlanAvailability } = usePlanAvailability()
    const { data: agentStarsData } = useAgentStars()

    const starsFor = (type: AgentType): string => {
        const entry = agentStarsData?.stars.find((s) => s.agentType === type)
        return entry ? formatCompactNumber(entry.stars) : '—'
    }

    const isProviderLoading = isLoadingLocations
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
        const enabled = planList.find((p) => isPlanAvailable(p.id))
        return enabled?.id || planList[0]?.id || ''
    }

    const initialPlanId =
        preselectedPlanId && plans.find((p) => p.id === preselectedPlanId)
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

    const { values, errors, setField } = useCreateAgentForm(
        initialPlanId,
        getFirstAvailableLocation(initialPlanId)
    )
    const {
        name,
        agentType: selectedAgentType,
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
    const { isLocal } = useAuth()
    const queryClient = useQueryClient()
    const [isCreatingLocal, setIsCreatingLocal] = useState(false)

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

    const purchaseMutation = usePurchaseAgent()

    const handleCreateLocal = async () => {
        if (name && !/^[a-zA-Z0-9-]+$/.test(name)) {
            setField('name', name)
            return
        }
        setIsCreatingLocal(true)
        try {
            await api.createAgent({
                name: name || undefined,
                agentType: selectedAgentType,
                gatewayToken: gatewayToken || undefined,
                password: password || undefined
            })
            await queryClient.invalidateQueries({ queryKey: ['agents'] })
            toast.success(t('createClaw.clawCreated'))
            onClose()
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('errors.failedToCreateClaw')
            toast.error(message)
        } finally {
            setIsCreatingLocal(false)
        }
    }

    const handleCreate = () => {
        if (isLocal) {
            handleCreateLocal()
            return
        }
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
            const monthlyVolumePrice =
                volumeSize * volumePricing.pricePerGbMonthly
            const volumePrice =
                billingCycle === billingInterval.YEAR
                    ? monthlyVolumePrice * YEARLY_PAID_MONTHS
                    : monthlyVolumePrice
            totalPrice += volumePrice
        }

        purchaseMutation.mutate(
            {
                name,
                agentType: selectedAgentType,
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

    const selectedPlan = plans.find((p) => p.id === planId)
    const totalAmount = calculateTotalAmount(
        selectedPlan,
        billingCycle,
        volumeSize,
        volumePricing
    )

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
                    <AgentNameField
                        name={name}
                        nameError={nameError}
                        onChange={(v) => setField('name', v)}
                    />

                    <AgentTypeSelector
                        selectedAgentType={selectedAgentType}
                        onAgentTypeChange={(v) => {
                            setField('agentType', v)
                            if (v === agentTypeConst.HERMES)
                                setField('gatewayToken', '')
                        }}
                        starsFor={starsFor}
                    />

                    {!isLocal && (
                        <LocationSelector
                            locations={locations}
                            location={location}
                            planId={planId}
                            isLoading={isProviderLoading}
                            isLocationAvailableForPlan={
                                isLocationAvailableForPlan
                            }
                            onLocationChange={(v) => setField('location', v)}
                            onPlanChange={(v) => setField('planId', v)}
                            plans={plans}
                            isPlanAvailable={isPlanAvailable}
                        />
                    )}

                    {!isLocal && (
                        <BillingIntervalSelector
                            billingCycle={billingCycle}
                            onBillingCycleChange={(v) =>
                                setField('billingCycle', v)
                            }
                        />
                    )}

                    {!isLocal && (
                        <PlanSelector
                            plans={plans}
                            planId={planId}
                            location={location}
                            billingCycle={billingCycle}
                            isLoading={isProviderLoading}
                            preselectedPlanId={preselectedPlanId}
                            isLocationAvailableForPlan={
                                isLocationAvailableForPlan
                            }
                            isPlanAvailable={isPlanAvailable}
                            onPlanChange={(v) => setField('planId', v)}
                            onLocationChange={(v) => setField('location', v)}
                            getFirstAvailableLocation={
                                getFirstAvailableLocation
                            }
                        />
                    )}

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
                        hideInfrastructureOptions={isLocal}
                        selectedAgentType={selectedAgentType}
                    />

                    {!isLocal && selectedPlan && (
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

                    {!isLocal && (
                        <TermsAgreement
                            agreedToTerms={agreedToTerms}
                            onAgreedChange={(v) => setField('agreedToTerms', v)}
                        />
                    )}

                    <CreateAgentSubmitActions
                        isLocal={!!isLocal}
                        isCreatingLocal={isCreatingLocal}
                        isPurchasing={purchaseMutation.isPending}
                        selectedPlan={selectedPlan}
                        location={location}
                        nameError={nameError}
                        agreedToTerms={agreedToTerms}
                        totalAmount={totalAmount}
                        onCancel={onClose}
                    />
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default CreateAgentModal