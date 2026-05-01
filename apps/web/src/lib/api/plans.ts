import type { Location, PlanAvailability, VolumePricing } from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'

const plans = {
    getLocations: () => client.get<Location[]>(API_PATHS.PLANS.LOCATIONS),
    getVolumePricing: () =>
        client.get<VolumePricing>(API_PATHS.PLANS.VOLUME_PRICING),
    getPlanAvailability: () =>
        client.get<PlanAvailability>(API_PATHS.PLANS.AVAILABILITY)
}

export default plans