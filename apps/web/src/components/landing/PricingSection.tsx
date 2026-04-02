import type { FC, ReactNode } from 'react'
import type {
    Plan,
    PricingSectionProps,
    SimplePlanCardProps,
    SimplePlanFeature
} from '@/ts/Interfaces'

import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { Button, Badge } from '@/components/ui'
import { PlansSkeleton } from '@/components/shared'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import {
    CheckIcon,
    XIcon,
    CaretDownIcon,
    CaretUpIcon
} from '@phosphor-icons/react'

const buildSimplePlans = (
    plans: Plan[]
): Array<{
    planId: string
    name: string
    desc: string
    price: number
    yearlyPerMonth: number
    popular: boolean
    features: SimplePlanFeature[]
}> => {
    const planMap = new Map(plans.map((p) => [p.id, p]))
    const common: SimplePlanFeature[] = [
        { label: t('landing.featurePreinstalled'), included: true },
        { label: t('landing.featureBandwidth'), included: true },
        { label: t('landing.featureSsh'), included: true },
        { label: t('landing.featureUptime'), included: true }
    ]

    return [
        {
            planId: 'cx23',
            name: t('landing.planStarter'),
            desc: t('landing.planStarterDesc'),
            price: 25,
            yearlyPerMonth: Math.round(
                (planMap.get('cx23')?.priceYearly ?? 250) / 12
            ),
            popular: false,
            features: [
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: false },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'cpx21',
            name: t('landing.planGrowth'),
            desc: t('landing.planGrowthDesc'),
            price: 40,
            yearlyPerMonth: Math.round(
                (planMap.get('cpx21')?.priceYearly ?? 400) / 12
            ),
            popular: true,
            features: [
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: false },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx23',
            name: t('landing.planPro'),
            desc: t('landing.planProDesc'),
            price: 60,
            yearlyPerMonth: Math.round(
                (planMap.get('ccx23')?.priceYearly ?? 600) / 12
            ),
            popular: false,
            features: [
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx33',
            name: t('landing.planBusiness'),
            desc: t('landing.planBusinessDesc'),
            price: 90,
            yearlyPerMonth: Math.round(
                (planMap.get('ccx33')?.priceYearly ?? 900) / 12
            ),
            popular: false,
            features: [
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        }
    ]
}

const SimplePlanCard: FC<SimplePlanCardProps> = ({
    name,
    description,
    price,
    yearlyPerMonth,
    planId,
    popular,
    features
}): ReactNode => {
    const { user } = useAuth()

    return (
        <div
            className={`border-border relative flex flex-col rounded-xl border p-6 ${popular ? 'border-[#ef5350]/50 bg-[#ef5350]/5' : 'bg-foreground/[0.02]'}`}
        >
            {popular && (
                <Badge className='absolute -top-2.5 left-1/2 -translate-x-1/2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-xs text-white'>
                    {t('landing.mostPopular')}
                </Badge>
            )}
            <div className='mb-4'>
                <h3 className='font-clash text-foreground text-lg font-semibold'>
                    {name}
                </h3>
                <p className='text-muted-foreground mt-1 text-sm'>
                    {description}
                </p>
            </div>
            <div className='mb-4 flex items-baseline gap-1'>
                <span className='font-clash text-foreground text-4xl font-bold'>
                    ${price}
                </span>
                <span className='text-muted-foreground text-sm'>
                    {t('landing.perMonth')}
                </span>
                <span className='text-muted-foreground/40 text-xs'>
                    (${yearlyPerMonth}
                    {t('landing.perYear')})
                </span>
            </div>
            <div className='mb-6 flex flex-col gap-2'>
                {features.map((feature) => (
                    <div
                        key={feature.label}
                        className='flex items-center gap-2'
                    >
                        {feature.included ? (
                            <CheckIcon
                                size={14}
                                className='shrink-0 text-green-600 dark:text-green-400'
                            />
                        ) : (
                            <XIcon
                                size={14}
                                className='text-muted-foreground/40 shrink-0'
                            />
                        )}
                        <span
                            className={`text-xs ${feature.included ? 'text-foreground/70' : 'text-muted-foreground/40'}`}
                        >
                            {feature.label}
                        </span>
                    </div>
                ))}
            </div>
            <Button
                className={`mt-auto w-full gap-2 ${popular ? 'border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90' : 'bg-foreground/10 text-foreground hover:bg-foreground/20 border-0'}`}
                asChild
            >
                <Link
                    to={
                        user
                            ? `${ROUTES.CLAWS}?plan=${planId}`
                            : `${ROUTES.LOGIN}?plan=${planId}`
                    }
                >
                    {user ? t('landing.deploy') : t('landing.choosePlan')}
                </Link>
            </Button>
        </div>
    )
}

const PricingSection: FC<PricingSectionProps> = ({
    plans,
    plansLoading,
    allDoneLoading
}): ReactNode => {
    const { user } = useAuth()
    const [showAllPlans, setShowAllPlans] = useState(false)

    return (
        <section
            id='pricing'
            className='cv-auto border-border relative scroll-mt-24 border-t px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <div className='mb-16 text-center'>
                    <Badge
                        variant='outline'
                        className='border-border bg-foreground/5 text-foreground/80 mb-4'
                    >
                        {t('landing.pricing')}
                    </Badge>
                    <h2 className='font-clash from-foreground to-muted-foreground mb-4 bg-gradient-to-b bg-clip-text text-4xl font-bold text-transparent md:text-5xl'>
                        {t('landing.simpleTransparentPricing')}
                    </h2>
                    <p className='text-muted-foreground mx-auto max-w-xl text-lg'>
                        {t('landing.pricingDescription')}
                    </p>
                </div>

                {plansLoading || (!allDoneLoading && !plans?.length) ? (
                    <PlansSkeleton />
                ) : plans && plans.length > 0 ? (
                    <Fragment>
                        {!showAllPlans ? (
                            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                                {buildSimplePlans(plans).map((sp) => (
                                    <SimplePlanCard
                                        key={sp.planId}
                                        name={sp.name}
                                        description={sp.desc}
                                        price={sp.price}
                                        yearlyPerMonth={sp.yearlyPerMonth}
                                        planId={sp.planId}
                                        popular={sp.popular}
                                        features={sp.features}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className='overflow-x-auto'>
                                <table className='w-full border-collapse'>
                                    <thead>
                                        <tr className='border-border border-b'>
                                            <th className='font-clash text-foreground px-4 py-4 text-left font-semibold'>
                                                {t('landing.planColumn')}
                                            </th>
                                            <th className='font-clash text-foreground whitespace-nowrap px-4 py-4 text-center font-semibold'>
                                                {t('landing.vCpuColumn')}
                                            </th>
                                            <th className='font-clash text-foreground whitespace-nowrap px-4 py-4 text-center font-semibold'>
                                                {t('landing.ramColumn')}
                                            </th>
                                            <th className='font-clash text-foreground whitespace-nowrap px-4 py-4 text-center font-semibold'>
                                                {t('landing.storageColumn')}
                                            </th>
                                            <th className='font-clash text-foreground whitespace-nowrap px-4 py-4 text-center font-semibold'>
                                                {t('landing.monthlyColumn')}
                                            </th>
                                            <th className='px-4 py-4 text-right'></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {plans.map((plan, index) => {
                                            const totalMonthly = Math.round(
                                                plan.priceMonthly
                                            )
                                            const totalYearly = Math.round(
                                                plan.priceYearly
                                            )
                                            const isRecommended =
                                                plan.id === 'cax41'
                                            const tierStarts: Record<
                                                string,
                                                string
                                            > = {
                                                cx23: t('landing.tierShared'),
                                                cax11: t('landing.tierArm'),
                                                ccx13: t(
                                                    'landing.tierDedicated'
                                                )
                                            }

                                            const providerTiers = tierStarts
                                            const tierLabel =
                                                providerTiers?.[plan.id]
                                            const showTier =
                                                tierLabel && index > 0

                                            return (
                                                <Fragment key={plan.id}>
                                                    {showTier && (
                                                        <tr>
                                                            <td
                                                                colSpan={6}
                                                                className='px-4 pb-2 pt-6'
                                                            >
                                                                <span className='font-clash text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
                                                                    {tierLabel}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr
                                                        className={`border-border border-b ${
                                                            isRecommended
                                                                ? 'bg-[#ef5350]/5'
                                                                : ''
                                                        }`}
                                                    >
                                                        <td className='px-4 py-4'>
                                                            <div className='flex items-center gap-2'>
                                                                <span className='text-foreground font-medium'>
                                                                    {plan.name.replace(
                                                                        /([A-Za-z])(\d)/,
                                                                        '$1 $2'
                                                                    )}
                                                                </span>
                                                                {isRecommended && (
                                                                    <Badge className='border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-xs text-white'>
                                                                        {t(
                                                                            'landing.recommended'
                                                                        )}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className='text-foreground/80 px-4 py-4 text-center'>
                                                            {plan.cpu}
                                                        </td>
                                                        <td className='text-foreground/80 whitespace-nowrap px-4 py-4 text-center'>
                                                            {plan.memory} GB
                                                        </td>
                                                        <td className='text-foreground/80 whitespace-nowrap px-4 py-4 text-center'>
                                                            {plan.disk} GB
                                                        </td>
                                                        <td className='whitespace-nowrap px-4 py-4 text-center'>
                                                            <div className='flex items-baseline justify-center gap-1'>
                                                                <span className='font-clash text-foreground font-bold'>
                                                                    $
                                                                    {
                                                                        totalMonthly
                                                                    }
                                                                </span>
                                                                <span className='text-muted-foreground text-sm'>
                                                                    {t(
                                                                        'landing.perMonth'
                                                                    )}
                                                                </span>
                                                                <span className='text-muted-foreground/40 text-xs'>
                                                                    ($
                                                                    {Math.round(
                                                                        totalYearly /
                                                                            12
                                                                    )}
                                                                    {t(
                                                                        'landing.perYear'
                                                                    )}
                                                                    )
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className='px-4 py-4 text-right'>
                                                            <Button
                                                                size='sm'
                                                                className={`gap-2 px-4 ${
                                                                    isRecommended
                                                                        ? 'border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-white hover:opacity-90'
                                                                        : 'bg-foreground/10 text-foreground hover:bg-foreground/20 border-0'
                                                                }`}
                                                                asChild
                                                            >
                                                                <Link
                                                                    to={
                                                                        user
                                                                            ? `${ROUTES.CLAWS}?plan=${plan.id}`
                                                                            : `${ROUTES.LOGIN}?plan=${plan.id}`
                                                                    }
                                                                    aria-label={
                                                                        user
                                                                            ? t(
                                                                                  'landing.deployPlanLabel',
                                                                                  {
                                                                                      plan: plan.name
                                                                                  }
                                                                              )
                                                                            : t(
                                                                                  'landing.selectPlanLabel',
                                                                                  {
                                                                                      plan: plan.name
                                                                                  }
                                                                              )
                                                                    }
                                                                >
                                                                    {user
                                                                        ? t(
                                                                              'landing.deploy'
                                                                          )
                                                                        : t(
                                                                              'landing.select'
                                                                          )}
                                                                </Link>
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                </Fragment>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {showAllPlans && (
                            <div className='border-border bg-foreground/[0.02] mt-8 rounded-xl border p-4'>
                                <div className='text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-sm'>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>
                                            {t('landing.openClawPreinstalled')}
                                        </span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>
                                            {t('landing.unlimitedBandwidth')}
                                        </span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>
                                            {t('landing.rootSshAccess')}
                                        </span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>{t('landing.onlineAllDay')}</span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>{t('landing.fastInternet')}</span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <CheckIcon className='h-4 w-4 text-green-600 dark:text-green-400' />
                                        <span>{t('landing.emailSupport')}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className='mt-6 flex justify-center'>
                            <Button
                                variant='ghost'
                                className='text-muted-foreground hover:text-foreground gap-2 text-sm'
                                onClick={() => setShowAllPlans(!showAllPlans)}
                            >
                                {showAllPlans
                                    ? t('landing.simplePricing')
                                    : t('landing.showAllPlans')}
                                {showAllPlans ? (
                                    <CaretUpIcon size={14} />
                                ) : (
                                    <CaretDownIcon size={14} />
                                )}
                            </Button>
                        </div>
                    </Fragment>
                ) : (
                    <div className='text-muted-foreground py-12 text-center'>
                        {t('errors.unableToLoadPricing')}
                    </div>
                )}
            </div>
        </section>
    )
}

export default PricingSection