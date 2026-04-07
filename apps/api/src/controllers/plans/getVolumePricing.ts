import type { Context } from 'hono'

import { getProvider } from '@/services/provider'
import { inputValidation } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getVolumePricing = async (c: Context) => {
    try {
        const provider = getProvider()
        const pricing = await provider.getVolumePricing()
        return ok(
            c,
            {
                pricePerGbMonthly:
                    Math.ceil(pricing.pricePerGbMonthly * 3 * 1000) / 1000,
                minSize: inputValidation.VOLUME_SIZE.MIN,
                maxSize: inputValidation.VOLUME_SIZE.MAX
            },
            t('api.volumePricingFetched')
        )
    } catch (error) {
        console.error('getVolumePricing', error)
        return fail(c, t('api.failedToFetchVolumePricing'), 500)
    }
}

export default getVolumePricing