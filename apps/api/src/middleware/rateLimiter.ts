import type { Context, Next } from 'hono'

const store = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key)
    }
}, 300000)

export function rateLimiter(max = 100, windowMs = 60000) {
    return async (c: Context, next: Next) => {
        const key = c.req.header('Authorization')?.slice(0, 20)
            || c.req.header('x-real-ip')
            || c.req.header('x-forwarded-for')
            || 'anon'

        const now = Date.now()
        const entry = store.get(key)

        if (entry && entry.resetAt > now) {
            if (entry.count >= max) {
                return c.json({ success: false, message: 'Too many requests', code: 429 }, 429)
            }
            entry.count++
        } else {
            store.set(key, { count: 1, resetAt: now + windowMs })
        }

        await next()
    }
}
