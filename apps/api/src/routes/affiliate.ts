import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    generateCode,
    getAffiliate,
    updateReferralCode
} from '@/controllers/affiliate'

const app = new Hono<HonoEnv>()

app.get('/', getAffiliate)
app.post('/generate', generateCode)
app.put('/code', updateReferralCode)

export default app