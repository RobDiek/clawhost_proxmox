import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { apiPaths } from '@openclaw/shared'
import {
    getAdminAnalytics,
    getAdminBilling,
    getAdminClaws,
    getAdminEmails,
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
app.get(apiPaths.CLAWS.BASE, getAdminClaws)
app.get(`/pending${apiPaths.CLAWS.BASE}`, getAdminPendingClaws)
app.get('/ssh-keys', getAdminSSHKeys)
app.get('/volumes', getAdminVolumes)
app.get('/referrals', getAdminReferrals)
app.get('/waitlist', getAdminWaitlist)
app.get('/emails', getAdminEmails)

export default app