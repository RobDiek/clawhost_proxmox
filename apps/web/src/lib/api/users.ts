import type {
    BillingHistoryResponse,
    BillingInvoiceResponse,
    CustomerPortalResponse,
    LicenseCheckoutResponse,
    UpdateProfileData,
    UserProfile,
    UserStats
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { client } from '@/lib/api/client'
import getReferralHeaders from '@/lib/api/getReferralHeaders'

const users = {
    getProfile: () => client.get<UserProfile>(API_PATHS.USERS.ME),
    updateProfile: (data: UpdateProfileData) =>
        client.put<UserProfile>(API_PATHS.USERS.ME, data),
    connectAuthMethod: (method: string) =>
        client.post<void>(API_PATHS.USERS.AUTH_METHOD(method)),
    disconnectAuthMethod: (method: string) =>
        client.delete<void>(API_PATHS.USERS.AUTH_METHOD(method)),
    getUserStats: () => client.get<UserStats>(API_PATHS.USERS.STATS),
    getBillingHistory: (page: number = 1, limit: number = 10) =>
        client.get<BillingHistoryResponse>(
            `${API_PATHS.USERS.BILLING}?page=${page}&limit=${limit}`
        ),
    getOrderInvoice: (orderId: string) =>
        client.get<BillingInvoiceResponse>(
            API_PATHS.USERS.ORDER_INVOICE(orderId)
        ),
    getCustomerPortal: () =>
        client.post<CustomerPortalResponse>(API_PATHS.USERS.BILLING_PORTAL),
    purchaseLicense: () =>
        client.post<LicenseCheckoutResponse>(
            API_PATHS.USERS.LICENSE_CHECKOUT,
            undefined,
            { headers: getReferralHeaders() }
        )
}

export default users