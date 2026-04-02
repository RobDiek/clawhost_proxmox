describe('getEnvironment', () => {
    const originalClient = process.env.CLIENT

    afterEach(() => {
        if (originalClient !== undefined) {
            process.env.CLIENT = originalClient
        } else {
            delete process.env.CLIENT
        }
        vi.resetModules()
    })

    it('returns development for localhost client', async () => {
        process.env.CLIENT = 'localhost:1111'
        const { default: getEnvironment } =
            await import('@/lib/environment/getEnvironment')
        const app = (await import('hono')).Hono
        const hono = new app()
        let result: string = ''
        hono.get('/test', (c) => {
            result = getEnvironment(c)
            return c.text('ok')
        })
        await hono.request('/test')
        expect(result).toBe('development')
    })

    it('returns development for 127.0.0.1 client', async () => {
        process.env.CLIENT = '127.0.0.1:1111'
        const { default: getEnvironment } =
            await import('@/lib/environment/getEnvironment')
        const app = (await import('hono')).Hono
        const hono = new app()
        let result: string = ''
        hono.get('/test', (c) => {
            result = getEnvironment(c)
            return c.text('ok')
        })
        await hono.request('/test')
        expect(result).toBe('development')
    })
})