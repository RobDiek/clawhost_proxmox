import type {
    Location,
    PlanAvailability,
    PlansResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'

const plans = {
    getPlans: () => client.get<PlansResponse>(API_PATHS.PLANS.BASE),
    getLocations: () => client.get<Location[]>(API_PATHS.PLANS.LOCATIONS),
    getVolumePricing: () =>
        client.get<VolumePricing>(API_PATHS.PLANS.VOLUME_PRICING),
    getPlanAvailability: () =>
        client.get<PlanAvailability>(API_PATHS.PLANS.AVAILABILITY)
}

export default plans