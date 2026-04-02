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
        // Extract unique key: user ID from JWT payload, or IP
        let key = 'anon'
        const auth = c.req.header('Authorization') || ''
        if (auth.startsWith('Bearer ') && auth.length > 30) {
            // Extract payload from JWT (middle segment) for unique key
            try {
                const payload = auth.split('.')[1]
                if (payload) key = 'u:' + payload.slice(0, 16)
            } catch { /* fallback to IP */ }
        }
        if (key === 'anon') {
            key = 'ip:' + (c.req.header('x-real-ip') || c.req.header('x-forwarded-for') || 'unknown')
        }

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
