import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    connectAuthMethod,
    disconnectAuthMethod,
    getCurrentUser,
    getBillingHistory,
    getOrderInvoice,
    getCustomerPortal,
    getUserStats,
    purchaseLicense,
    updateUserProfile
} from '@/controllers/users'
import adminOnly from '@/middleware/adminOnly'

const app = new Hono<HonoEnv>()

app.get('/me', getCurrentUser)
app.get('/me/stats', getUserStats)
app.get('/me/billing', getBillingHistory)
app.get('/me/billing/:orderId/invoice', getOrderInvoice)
app.post('/me/billing/portal', getCustomerPortal)
app.put('/me', updateUserProfile)
app.post('/me/license/checkout', adminOnly, purchaseLicense)
app.post('/me/auth/:method', connectAuthMethod)
app.delete('/me/auth/:method', disconnectAuthMethod)

export default app