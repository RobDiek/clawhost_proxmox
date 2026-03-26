import type { AuthCacheData, CacheEntry } from '@/ts/Interfaces'
import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { verifyToken } from '@/services/firebase'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import {
    aiRoutes,
    authRoutes,
    clawsRoutes,
    cronRoutes,
    hostingRoutes,
    plansRoutes,
    sshKeysRoutes,
    usersRoutes,
    waitlistRoutes,
    webhooksRoutes
} from '@/routes'
import { browseSkills } from '@/services/clawhub'

const app = new Hono<HonoEnv>()

const isDev = process.env.NODE_ENV !== 'production'

app.use(
    '*',
    cors({
        origin: isDev
            ? [
                  'https://clawhost.cloud',
                  'https://www.clawhost.cloud',
                  'https://openclaw.flowmatic.co.il',
                  'http://localhost:1111',
                  'http://localhost:3333'
              ]
            : [
                  'https://clawhost.cloud',
                  'https://www.clawhost.cloud',
                  'https://openclaw.flowmatic.co.il'
              ],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
        exposeHeaders: ['X-Sample-Rate', 'X-Channels', 'X-Audio-Format'],
        maxAge: 86400
    })
)

app.use('*', logger())
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))

app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})

app.get('/', (c) => ok(c, null, t('api.healthOk')))

app.route('/auth', authRoutes)
app.route('/cron', cronRoutes)
app.route('/plans', plansRoutes)
app.route('/waitlist', waitlistRoutes)
app.route('/webhooks', webhooksRoutes)

// All hosting routes — public (our own JWT auth inside controllers where needed)
app.route('/hosting', hostingRoutes)
app.get('/clawhub/skills', async (c) => {
    try {
        const result = await browseSkills({
            query: c.req.query('query') || undefined,
            limit: c.req.query('limit')
                ? Number(c.req.query('limit'))
                : undefined,
            cursor: c.req.query('cursor') || undefined
        })
        return ok(
            c,
            {
                skills: result.skills,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore
            },
            t('api.clawHubSearchSuccess')
        )
    } catch {
        return fail(c, t('api.clawHubSearchFailed'), 500)
    }
})

const AUTH_CACHE_TTL = 5 * 60 * 1000
const AUTH_CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000
const authCache = new Map<string, CacheEntry<AuthCacheData>>()

setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of authCache) {
        if (now >= entry.expiry) authCache.delete(key)
    }
}, AUTH_CACHE_CLEANUP_INTERVAL)

app.use('/*', async (c, next) => {
    // Skip auth for WebSocket paths
    if (c.req.path.startsWith('/ws/')) return next()

    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return fail(c, t('api.unauthorized'), 401)
        }

        const token = authHeader.slice(7)

        const cachedAuth = authCache.get(token)
        if (cachedAuth && Date.now() < cachedAuth.expiry) {
            c.set('userId', cachedAuth.data.userId)
            c.set('isAdmin', cachedAuth.data.isAdmin)
            return next()
        }

        const decoded = await verifyToken(token)

        if (!decoded) {
            return fail(c, t('api.invalidToken'), 401)
        }

        const signInProvider = decoded.firebase?.sign_in_provider
        const authMethod =
            signInProvider === 'google.com'
                ? 'google'
                : signInProvider === 'github.com'
                  ? 'github'
                  : 'email'

        const existingUser = await db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(eq(users.id, decoded.uid))
            .then((rows) => rows[0])

        if (existingUser) {
            await db
                .update(users)
                .set({
                    ...(decoded.email ? { email: decoded.email } : {}),
                    authMethods: sql`CASE
                        WHEN ${authMethod} = ANY(COALESCE(${users.authMethods}, '{}'))
                        THEN COALESCE(${users.authMethods}, '{}')
                        ELSE array_append(COALESCE(${users.authMethods}, '{}'), ${authMethod})
                    END`
                })
                .where(eq(users.id, decoded.uid))
        } else if (decoded.email) {
            await db
                .insert(users)
                .values({
                    id: decoded.uid,
                    email: decoded.email,
                    authMethods: [authMethod]
                })
                .onConflictDoUpdate({
                    target: users.id,
                    set: {
                        email: decoded.email,
                        authMethods: sql`CASE
                            WHEN ${authMethod} = ANY(COALESCE(${users.authMethods}, '{}'))
                            THEN COALESCE(${users.authMethods}, '{}')
                            ELSE array_append(COALESCE(${users.authMethods}, '{}'), ${authMethod})
                        END`
                    }
                })
        } else {
            return fail(c, t('api.unauthorized'), 401)
        }

        const admin = existingUser?.role === 'admin'

        authCache.set(token, {
            data: { userId: decoded.uid, isAdmin: admin },
            expiry: Date.now() + AUTH_CACHE_TTL
        })

        c.set('userId', decoded.uid)
        c.set('isAdmin', admin)
        return next()
    } catch (err) {
        console.error('Auth middleware error:', err)
        return fail(c, t('api.internalServerError'), 500)
    }
})

app.route('/ai', aiRoutes)
app.route('/claws', clawsRoutes)
app.route('/ssh-keys', sshKeysRoutes)
app.route('/users', usersRoutes)

app.notFound((c) => fail(c, t('api.notFound'), 404))

export default app