import { Hono } from 'hono'
import { fail } from '@/lib/response'

describe('fail', () => {
    it('returns failure envelope', async () => {
        const app = new Hono()
        app.get('/test', (c) => fail(c, 'Not found', 404))

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.success).toBe(false)
        expect(body.message).toBe('Not found')
        expect(body.code).toBe(404)
        expect(body.data).toBeNull()
        expect(body.version).toBeTruthy()
        expect(res.status).toBe(404)
    })

    it('defaults to 400 status', async () => {
        const app = new Hono()
        app.get('/test', (c) => fail(c, 'Bad request'))

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.code).toBe(400)
        expect(res.status).toBe(400)
    })

    it('supports custom data in failure', async () => {
        const app = new Hono()
        app.get('/test', (c) =>
            fail(c, 'Validation error', 422, { field: 'email' })
        )

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.success).toBe(false)
        expect(body.data).toEqual({ field: 'email' })
    })
})