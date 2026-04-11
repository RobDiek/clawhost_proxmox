import type {
    BillingHistoryResponse,
    BillingInvoiceResponse,
    Claw,
    CustomerPortalResponse,
    Location,
    PlanAvailability,
    PlansResponse,
    PurchaseClawData,
    PurchaseClawResponse,
    SSHKey,
    UpdateProfileData,
    UserProfile,
    UserStats,
    VerifyOtpResponse,
    VolumePricing
} from '@/ts/Interfaces'

import { RequestClient, apiPaths } from '@openclaw/shared'
import { getCachedToken, clearTokenCache } from '@/lib/firebase'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.clawhost.com'

const client = new RequestClient({
    baseUrl: BASE_URL,
    getHeaders: async (): Promise<Record<string, string>> => {
        const token = await getCachedToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
    },
    onUnauthorized: async (): Promise<void> => {
        clearTokenCache()
        await getCachedToken(true)
    }
})

const publicClient = new RequestClient({
    baseUrl: BASE_URL
})

const api = {
    sendOtp: (email: string): Promise<void> =>
        publicClient.post<void>(apiPaths.AUTH.SEND_OTP, { email }),
    verifyOtp: (email: string, code: string): Promise<VerifyOtpResponse> =>
        publicClient.post<VerifyOtpResponse>(apiPaths.AUTH.VERIFY_OTP, {
            email,
            code
        }),
    getClaws: (): Promise<Claw[]> => client.get<Claw[]>(apiPaths.CLAWS.BASE),
    getPlans: (provider?: string): Promise<PlansResponse> =>
        client.get<PlansResponse>(
            `${apiPaths.PLANS.BASE}${provider ? `?provider=${provider}` : ''}`
        ),
    getProfile: (): Promise<UserProfile> =>
        client.get<UserProfile>(apiPaths.USERS.ME),
    updateProfile: (data: UpdateProfileData): Promise<UserProfile> =>
        client.put<UserProfile>(apiPaths.USERS.ME, data),
    getUserStats: (): Promise<UserStats> =>
        client.get<UserStats>(apiPaths.USERS.STATS),
    getBillingHistory: (
        page: number = 1,
        limit: number = 10
    ): Promise<BillingHistoryResponse> =>
        client.get<BillingHistoryResponse>(
            `${apiPaths.USERS.BILLING}?page=${page}&limit=${limit}`
        ),
    getOrderInvoice: (orderId: string): Promise<BillingInvoiceResponse> =>
        client.get<BillingInvoiceResponse>(
            apiPaths.USERS.ORDER_INVOICE(orderId)
        ),
    getCustomerPortal: (): Promise<CustomerPortalResponse> =>
        client.post<CustomerPortalResponse>(apiPaths.USERS.BILLING_PORTAL),
    getLocations: (provider?: string): Promise<Location[]> =>
        client.get<Location[]>(
            `${apiPaths.PLANS.LOCATIONS}${provider ? `?provider=${provider}` : ''}`
        ),
    getVolumePricing: (provider?: string): Promise<VolumePricing> =>
        client.get<VolumePricing>(
            `${apiPaths.PLANS.VOLUME_PRICING}${provider ? `?provider=${provider}` : ''}`
        ),
    getPlanAvailability: (provider?: string): Promise<PlanAvailability> =>
        client.get<PlanAvailability>(
            `${apiPaths.PLANS.AVAILABILITY}${provider ? `?provider=${provider}` : ''}`
        ),
    getSSHKeys: (): Promise<SSHKey[]> =>
        client.get<SSHKey[]>(apiPaths.SSH_KEYS.BASE),
    purchaseClaw: (data: PurchaseClawData): Promise<PurchaseClawResponse> =>
        client.post<PurchaseClawResponse>(apiPaths.CLAWS.PURCHASE, data)
}

export default api