import type { Plan, SimplePlanData, SimplePlanFeature } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const buildSpecs = (plan: Plan | undefined): SimplePlanFeature[] => [
    { label: t('landing.featureCpu', { count: plan?.cpu ?? 0 }), included: true },
    { label: t('landing.featureRam', { count: plan?.memory ?? 0 }), included: true },
    { label: t('landing.featureDisk', { count: plan?.disk ?? 0 }), included: true }
]

const buildSimplePlans = (plans: Plan[]): SimplePlanData[] => {
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
            price: Math.round(planMap.get('cx23')?.priceMonthly ?? 0),
            yearlyPerMonth: Math.round(
                (planMap.get('cx23')?.priceYearly ?? 0) / 12
            ),
            popular: false,
            features: [
                ...buildSpecs(planMap.get('cx23')),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: false },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'cpx21',
            name: t('landing.planGrowth'),
            desc: t('landing.planGrowthDesc'),
            price: Math.round(planMap.get('cpx21')?.priceMonthly ?? 0),
            yearlyPerMonth: Math.round(
                (planMap.get('cpx21')?.priceYearly ?? 0) / 12
            ),
            popular: true,
            features: [
                ...buildSpecs(planMap.get('cpx21')),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: false },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx23',
            name: t('landing.planPro'),
            desc: t('landing.planProDesc'),
            price: Math.round(planMap.get('ccx23')?.priceMonthly ?? 0),
            yearlyPerMonth: Math.round(
                (planMap.get('ccx23')?.priceYearly ?? 0) / 12
            ),
            popular: false,
            features: [
                ...buildSpecs(planMap.get('ccx23')),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx33',
            name: t('landing.planBusiness'),
            desc: t('landing.planBusinessDesc'),
            price: Math.round(planMap.get('ccx33')?.priceMonthly ?? 0),
            yearlyPerMonth: Math.round(
                (planMap.get('ccx33')?.priceYearly ?? 0) / 12
            ),
            popular: false,
            features: [
                ...buildSpecs(planMap.get('ccx33')),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        }
    ]
}

export default buildSimplePlans