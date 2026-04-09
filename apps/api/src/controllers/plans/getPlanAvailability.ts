import type { Context } from 'hono'

import { getProvider } from '@/services/provider'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const serverPrices: Record<string, number> = {
    cx23: 10,
    cx33: 15,
    cx43: 20,
    cx53: 30,
    cpx11: 15,
    cpx21: 20,
    cpx31: 30,
    cpx41: 50,
    cpx51: 75,
    cax11: 10,
    cax21: 15,
    cax31: 25,
    cax41: 50,
    ccx13: 25,
    ccx23: 50,
    ccx33: 100,
    ccx43: 150,
    ccx53: 250,
    ccx63: 350
}

const getPlanAvailability = withErrorHandler(
    'getPlanAvailability',
    'api.failedToFetchPlanAvailability'
)(async (c: Context) => {
    const provider = getProvider()

    const [serverTypes, datacenters] = await Promise.all([
        provider.getRawServerTypes(),
        provider.getDatacenters()
    ])

    const nameToId = new Map<string, number>()
    for (const st of serverTypes) {
        nameToId.set(st.name, st.id)
    }

    const locationsByType = new Map<number, Set<string>>()
    for (const dc of datacenters) {
        for (const typeId of dc.availableServerTypeIds) {
            let locs = locationsByType.get(typeId)
            if (!locs) {
                locs = new Set()
                locationsByType.set(typeId, locs)
            }
            locs.add(dc.locationName)
        }
    }

    const availability: Record<string, string[]> = {}

    for (const planName of Object.keys(serverPrices)) {
        const serverTypeId = nameToId.get(planName)
        if (!serverTypeId) continue
        availability[planName] = Array.from(
            locationsByType.get(serverTypeId) || []
        )
    }

    return ok(c, availability, t('api.planAvailabilityFetched'))
})

export default getPlanAvailability