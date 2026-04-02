import { RequestClient } from '#shared/index'

describe('RequestClient', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('sends GET request with correct headers', async () => {
        const mockResponse = new Response(
            JSON.stringify({
                success: true,
                data: { id: 1 },
                message: 'ok',
                code: 200,
                version: '1.0'
            }),
            {
                headers: { 'content-type': 'application/json' }
            }
        )
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

        const client = new RequestClient({ baseUrl: 'https://api.test.com' })
        const result = await client.get<{ id: number }>('/users')

        expect(fetch).toHaveBeenCalledWith(
            'https://api.test.com/users',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json'
                })
            })
        )
        expect(result).toEqual({ id: 1 })
    })

    it('sends POST request with body', async () => {
        const mockResponse = new Response(
            JSON.stringify({
                success: true,
                data: { id: 2 },
                message: 'created',
                code: 201,
                version: '1.0'
            }),
            {
                headers: { 'content-type': 'application/json' }
            }
        )
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

        const client = new RequestClient({ baseUrl: 'https://api.test.com' })
        await client.post('/users', { name: 'test' })

        expect(fetch).toHaveBeenCalledWith(
            'https://api.test.com/users',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ name: 'test' })
            })
        )
    })

    it('throws on unsuccessful envelope response', async () => {
        const mockResponse = new Response(
            JSON.stringify({
                success: false,
                data: null,
                message: 'Not found',
                code: 404,
                version: '1.0'
            }),
            {
                headers: { 'content-type': 'application/json' }
            }
        )
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

        const client = new RequestClient({ baseUrl: 'https://api.test.com' })
        await expect(client.get('/missing')).rejects.toThrow('Not found')
    })

    it('calls onUnauthorized and retries on 401', async () => {
        const unauthorizedResponse = new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            {
                status: 401,
                headers: { 'content-type': 'application/json' }
            }
        )
        const successResponse = new Response(
            JSON.stringify({
                success: true,
                data: 'ok',
                message: '',
                code: 200,
                version: '1.0'
            }),
            {
                headers: { 'content-type': 'application/json' }
            }
        )

        const onUnauthorized = vi.fn().mockResolvedValue(true)
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(unauthorizedResponse)
            .mockResolvedValueOnce(successResponse)

        const client = new RequestClient({
            baseUrl: 'https://api.test.com',
            onUnauthorized
        })
        const result = await client.get('/protected')

        expect(onUnauthorized).toHaveBeenCalledOnce()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(result).toBe('ok')
    })

    it('includes custom headers from getHeaders', async () => {
        const mockResponse = new Response(
            JSON.stringify({
                success: true,
                data: null,
                message: '',
                code: 200,
                version: '1.0'
            }),
            {
                headers: { 'content-type': 'application/json' }
            }
        )
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

        const client = new RequestClient({
            baseUrl: 'https://api.test.com',
            getHeaders: async () => ({ Authorization: 'Bearer token123' })
        })
        await client.get('/me')

        expect(fetch).toHaveBeenCalledWith(
            'https://api.test.com/me',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer token123'
                })
            })
        )
    })

    it('handles 204 No Content', async () => {
        const mockResponse = new Response(null, { status: 204 })
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

        const client = new RequestClient({ baseUrl: 'https://api.test.com' })
        const result = await client.delete('/resource/1')

        expect(result).toBeNull()
    })
})