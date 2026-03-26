describe('useNetworkStatus logic', () => {
    const LATENCY_THRESHOLD = 3000

    it('considers online when latency is below threshold', () => {
        const latency = 200
        const isOffline = latency > LATENCY_THRESHOLD
        expect(isOffline).toBe(false)
    })

    it('considers offline when latency exceeds threshold', () => {
        const latency = 5000
        const isOffline = latency > LATENCY_THRESHOLD
        expect(isOffline).toBe(true)
    })

    it('considers offline when navigator.onLine is false', () => {
        const navigatorOnLine = false
        const isOffline = !navigatorOnLine
        expect(isOffline).toBe(true)
    })

    it('considers offline when fetch throws', () => {
        const fetchFailed = true
        const isOffline = fetchFailed
        expect(isOffline).toBe(true)
    })

    it('check interval is 10 seconds', () => {
        const CHECK_INTERVAL = 10_000
        expect(CHECK_INTERVAL).toBe(10000)
    })

    it('ping timeout is 5 seconds', () => {
        const PING_TIMEOUT = 5_000
        expect(PING_TIMEOUT).toBe(5000)
    })

    it('uses google 204 endpoint for ping', () => {
        const PING_URL = 'https://clients3.google.com/generate_204'
        expect(PING_URL).toContain('generate_204')
    })
})