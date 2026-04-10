import { Hono } from 'hono'
import {
    generateBlogPost,
    sendFeatureEmails,
    cleanupExpiredOtps
} from '@/controllers/cron'
import crypto from 'crypto'
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const app = new Hono()

app.use('*', async (c, next) => {
    const secret = c.req.header('Authorization')?.replace('Bearer ', '')
    const expected = process.env.CRON_SECRET

    if (
        !secret ||
        !expected ||
        Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
        !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
        return fail(c, t('api.unauthorized'), 401)

    return next()
})

app.get('/generate-blog-post', generateBlogPost)
app.get('/send-feature-emails', sendFeatureEmails)
app.get('/cleanup-expired-otps', cleanupExpiredOtps)

export default app