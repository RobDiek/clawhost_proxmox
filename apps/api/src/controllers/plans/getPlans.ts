import type { Context } from 'hono'

import { getProvider } from '@/services/provider'
import { inputValidation } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import { getPlanPrices } from '@/lib/polar'

const planOrder = [
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

const serverLimit = Number(process.env.SERVER_LIMIT)

const getPlans = async (c: Context) => {
    try {
        const provider = getProvider()

        const [serverTypes, servers, prices] = await Promise.all([
            provider.getServerTypes(),
            serverLimit
                ? provider.getServers().catch(() => null)
                : Promise.resolve(null),
            getPlanPrices()
        ])

        const atCapacity = servers ? servers.size >= serverLimit : false

        const ANNUAL_DISCOUNT_MONTHS = 10

        const plans = serverTypes
            .filter(
                (st) =>
                    prices[st.name] !== undefined &&
                    planOrder.includes(st.name) &&
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
            .sort((a, b) => planOrder.indexOf(a.id) - planOrder.indexOf(b.id))

        return ok(c, { plans, atCapacity }, t('api.plansFetched'))
    } catch (err) {
        console.error('Failed to fetch plans:', err)
        return fail(c, t('api.failedToFetchPlans'), 500)
    }
}

export default getPlans