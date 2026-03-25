import type { Context } from 'hono'
import type { PlanOrder } from '@/ts/Interfaces'
import type { ProviderType } from '@/ts/Types'

import { getProvider } from '@/services/provider'
import { inputValidation } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import { getPlanPrices } from '@/lib/polar'

const hetznerPlanOrder = [
    'cx23',
    'cx33',
    'cx43',
    'cx53',
    'cpx11',
    'cpx21',
    'cpx31',
    'cpx41',
    'cpx51',
    'cax11',
    'cax21',
    'cax31',
    'cax41',
    'ccx13',
    'ccx23',
    'ccx33',
    'ccx43',
    'ccx53',
    'ccx63'
]

const serverLimit = Number(process.env.SERVER_LIMIT) || 300

const planOrders: Record<ProviderType, PlanOrder> = {
    hetzner: { order: hetznerPlanOrder }
}

const getPlans = async (c: Context) => {
    try {
        const providerName = (c.req.query('provider') ||
            'hetzner') as ProviderType
        const config = planOrders[providerName]

        if (!config) {
            return fail(c, t('api.invalidProvider'), 400)
        }

        const provider = getProvider(providerName)

        const [serverTypes, servers, priceMap] = await Promise.all([
            provider.getServerTypes(),
            serverLimit
                ? provider.getServers().catch(() => null)
                : Promise.resolve(null),
            getPlanPrices()
        ])

        const atCapacity = servers ? servers.size >= serverLimit : false
        const prices = priceMap[providerName] ?? {}

        const ANNUAL_DISCOUNT_MONTHS = 10

        const plans = serverTypes
            .filter(
                (st) =>
                    prices[st.name] !== undefined &&
                    config.order.includes(st.name) &&
                    st.memory >= inputValidation.MIN_MEMORY_GB.MIN
            )
            .map((st) => ({
                id: st.name,
                name: st.description,
                cpu: st.cores,
                memory: st.memory,
                disk: st.disk,
                priceMonthly: prices[st.name],
                priceYearly: prices[st.name] * ANNUAL_DISCOUNT_MONTHS,
                architecture: st.architecture,
                disabled: atCapacity
            }))
            .sort(
                (a, b) =>
                    config.order.indexOf(a.id) - config.order.indexOf(b.id)
            )

        return ok(c, { plans, atCapacity }, t('api.plansFetched'))
    } catch (err) {
        console.error('Failed to fetch plans:', err)
        return fail(c, t('api.failedToFetchPlans'), 500)
    }
}

export default getPlans