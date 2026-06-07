import { checkSubdomainReady } from '@/controllers/agents/helpers'

describe('checkSubdomainReady', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('returns true when fetch succeeds with 200', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('ok', { status: 200 })
        )

        const result = await checkSubdomainReady('test-claw')
        expect(result).toBe(true)
        expect(fetch).toHaveBeenCalledWith(
            'https://test-claw.clawnode.cloud',
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
    })

    it('returns false when fetch returns non-200', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('error', { status: 502 })
        )

        const result = await checkSubdomainReady('bad-claw')
        expect(result).toBe(false)
    })

    it('returns false when fetch throws', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new Error('Network error')
        )

        const result = await checkSubdomainReady('offline-claw')
        expect(result).toBe(false)
    })

    it('deduplicates inflight requests for same subdomain', async () => {
        let resolveFirst: (v: Response) => void
        const firstPromise = new Promise<Response>((r) => {
            resolveFirst = r
        })
        vi.spyOn(globalThis, 'fetch').mockReturnValue(
            firstPromise as Promise<Response>
        )

        const p1 = checkSubdomainReady('dedup-claw')
        const p2 = checkSubdomainReady('dedup-claw')

        resolveFirst!(new Response('ok', { status: 200 }))

        const [r1, r2] = await Promise.all([p1, p2])
        expect(r1).toBe(true)
        expect(r2).toBe(true)
        expect(fetch).toHaveBeenCalledTimes(1)
    })
})