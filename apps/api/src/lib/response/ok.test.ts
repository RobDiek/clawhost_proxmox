import { Hono } from 'hono'
import { ok } from '@/lib/response'

describe('ok', () => {
    it('returns success envelope with data', async () => {
        const app = new Hono()
        app.get('/test', (c) => ok(c, { id: 1 }, 'Success'))

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.success).toBe(true)
        expect(body.data).toEqual({ id: 1 })
        expect(body.message).toBe('Success')
        expect(body.code).toBe(200)
        expect(body.version).toBeTruthy()
    })

    it('defaults message to empty string', async () => {
        const app = new Hono()
        app.get('/test', (c) => ok(c, null))

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.message).toBe('')
    })

    it('supports custom status code', async () => {
        const app = new Hono()
        app.get('/test', (c) => ok(c, { created: true }, 'Created', 201))

        const res = await app.request('/test')
        const body = await res.json()

        expect(body.code).toBe(201)
        expect(res.status).toBe(201)
    })
})