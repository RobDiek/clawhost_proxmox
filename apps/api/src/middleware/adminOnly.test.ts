import { Hono } from 'hono'

describe('adminOnly', () => {
    const createApp = (isAdmin: boolean) => {
        const app = new Hono()
        app.use('*', async (c, next) => {
            c.set('isAdmin', isAdmin)
            await next()
        })
        app.get(
            '/admin',
            async (c, next) => {
                if (!c.get('isAdmin')) {
                    return c.json({ success: false, message: 'Forbidden' }, 403)
                }
                return next()
            },
            (c) => c.json({ success: true, data: 'admin content' })
        )
        return app
    }

    it('allows admin access', async () => {
        const app = createApp(true)
        const res = await app.request('/admin')
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.success).toBe(true)
    })

    it('rejects non-admin access with 403', async () => {
        const app = createApp(false)
        const res = await app.request('/admin')
        const body = await res.json()

        expect(res.status).toBe(403)
        expect(body.success).toBe(false)
    })
})