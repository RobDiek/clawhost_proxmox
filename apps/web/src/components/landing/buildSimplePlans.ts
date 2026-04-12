import type { Plan, SimplePlanData, SimplePlanFeature } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

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

export default buildSimplePlans