import admin from '@/lib/api/admin'
import affiliate from '@/lib/api/affiliate'
import auth from '@/lib/api/auth'
import agents from '@/lib/api/agents'
import plans from '@/lib/api/plans'
import ssh from '@/lib/api/ssh'
import users from '@/lib/api/users'
import waitlist from '@/lib/api/waitlist'

const api = {
    ...auth,
    ...plans,
    ...agents,
    ...affiliate,
    ...admin,
    ...ssh,
    ...users,
    ...waitlist
}

export default api