import type { Plan, SimplePlanData, SimplePlanFeature } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { YEARLY_PAID_MONTHS } from '@openclaw/shared'

const MONTHS_PER_YEAR = 12

const buildV2Plans = (plans: Plan[]): SimplePlanData[] => {
    const planMap = new Map(plans.map((p) => [p.id, p]))

    const common: SimplePlanFeature[] = [
        { label: t('v2.agentsPreinstalled'), included: true },
        { label: t('landing.featureSsh'), included: true },
        { label: t('landing.featureUptime'), included: true }
    ]

    const specs = (id: string): SimplePlanFeature[] => {
        const p = planMap.get(id)
        if (!p) return []
        return [
            { label: `${p.cpu} vCPU`, included: true },
            { label: `${p.memory} GB RAM`, included: true },
            { label: `${p.disk} GB SSD`, included: true }
        ]
    }

    const result: SimplePlanData[] = [
        {
            planId: 'cpx21',
            name: t('landing.planGrowth'),
            desc: t('v2.planGrowthTagline'),
            price: 40,
            yearlyPerMonth: Math.round(
                (planMap.get('cpx21')?.priceYearly ?? 400) / 12
            ),
            popular: false,
            features: [
                ...specs('cpx21'),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: false },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx23',
            name: t('landing.planPro'),
            desc: t('v2.planProTagline'),
            price: 60,
            yearlyPerMonth: Math.round(
                (planMap.get('ccx23')?.priceYearly ?? 600) / 12
            ),
            popular: true,
            features: [
                ...specs('ccx23'),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        },
        {
            planId: 'ccx33',
            name: t('landing.planBusiness'),
            desc: t('v2.planBusinessTagline'),
            price: 90,
            yearlyPerMonth: Math.round(
                (planMap.get('ccx33')?.priceYearly ?? 900) / 12
            ),
            popular: false,
            features: [
                ...specs('ccx33'),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        }
    ]

    const ccx43 = planMap.get('ccx43')
    if (ccx43) {
        result.push({
            planId: 'ccx43',
            name: t('v2.planPower'),
            desc: t('v2.planPowerTagline'),
            price: ccx43.priceMonthly,
            yearlyPerMonth: Math.round(
                (ccx43.priceYearly ?? ccx43.priceMonthly * YEARLY_PAID_MONTHS) /
                    MONTHS_PER_YEAR
            ),
            popular: false,
            features: [
                ...specs('ccx43'),
                ...common,
                { label: t('landing.featureDedicatedCpu'), included: true },
                { label: t('landing.featureEmailSupport'), included: true }
            ]
        })
    }

    return result
}

export default buildV2Plans