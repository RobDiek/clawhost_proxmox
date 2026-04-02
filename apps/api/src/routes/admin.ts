import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    getAdminAnalytics,
    getAdminBilling,
    getAdminClaws,
    getAdminEmails,
    getAdminExports,
    getAdminPendingClaws,
    getAdminReferrals,
    getAdminSSHKeys,
    getAdminStats,
    getAdminUsers,
    getAdminUserDetail,
    getAdminVolumes,
    getAdminWaitlist,
    updateAdminUser
} from '@/controllers/admin'
import adminOnly from '@/middleware/adminOnly'

const app = new Hono<HonoEnv>()

app.use('/*', adminOnly)
app.get('/stats', getAdminStats)
app.get('/analytics', getAdminAnalytics)
app.get('/billing', getAdminBilling)
app.get('/users', getAdminUsers)
app.get('/users/:id', getAdminUserDetail)
app.put('/users/:id', updateAdminUser)
app.get('/claws', getAdminClaws)
app.get('/pending-claws', getAdminPendingClaws)
app.get('/ssh-keys', getAdminSSHKeys)
app.get('/volumes', getAdminVolumes)
app.get('/referrals', getAdminReferrals)
app.get('/waitlist', getAdminWaitlist)
app.get('/exports', getAdminExports)
app.get('/emails', getAdminEmails)

export default app