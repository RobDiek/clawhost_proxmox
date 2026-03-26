import { Hono } from 'hono'
import { getClientIp } from '@/controllers/auth/rateLimit'

describe('getClientIp', () => {
    const createApp = () => {
        const app = new Hono()
        app.get('/test', (c) => {
            const ip = getClientIp(c)
            return c.json({ ip })
        })
        return app
    }

    it('extracts IP from x-forwarded-for header', async () => {
        const app = createApp()
        const res = await app.request('/test', {
            headers: { 'x-forwarded-for': '1.2.3.4' }
        })
        const body = await res.json()
        expect(body.ip).toBe('1.2.3.4')
    })

    it('extracts first IP from x-forwarded-for chain', async () => {
        const app = createApp()
        const res = await app.request('/test', {
            headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' }
        })
        const body = await res.json()
        expect(body.ip).toBe('1.2.3.4')
    })

    it('trims whitespace from IP', async () => {
        const app = createApp()
        const res = await app.request('/test', {
            headers: { 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' }
        })
        const body = await res.json()
        expect(body.ip).toBe('1.2.3.4')
    })

    it('falls back to x-real-ip header', async () => {
        const app = createApp()
        const res = await app.request('/test', {
            headers: { 'x-real-ip': '10.0.0.1' }
        })
        const body = await res.json()
        expect(body.ip).toBe('10.0.0.1')
    })

    it('prefers x-forwarded-for over x-real-ip', async () => {
        const app = createApp()
        const res = await app.request('/test', {
            headers: {
                'x-forwarded-for': '1.2.3.4',
                'x-real-ip': '10.0.0.1'
            }
        })
        const body = await res.json()
        expect(body.ip).toBe('1.2.3.4')
    })

    it('returns null when no IP headers present', async () => {
        const app = createApp()
        const res = await app.request('/test')
        const body = await res.json()
        expect(body.ip).toBeNull()
    })
})