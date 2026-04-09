import type {
    AffiliateInfo,
    GenerateReferralCodeResponse,
    UpdateReferralCodeData,
    UpdateReferralCodeResponse
} from '@/ts/Interfaces'
import type { AffiliatePeriod } from '@/ts/Types'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'

const affiliate = {
    getAffiliate: (period: AffiliatePeriod) =>
        client.get<AffiliateInfo>(
            `${API_PATHS.AFFILIATE.BASE}?period=${period}`
        ),
    generateReferralCode: () =>
        client.post<GenerateReferralCodeResponse>(API_PATHS.AFFILIATE.GENERATE),
    updateReferralCode: (data: UpdateReferralCodeData) =>
        client.put<UpdateReferralCodeResponse>(API_PATHS.AFFILIATE.CODE, data)
}

export default affiliate