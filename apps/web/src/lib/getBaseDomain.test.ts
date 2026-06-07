import getBaseDomain from './getBaseDomain'

describe('getBaseDomain', () => {
    afterEach(() => {
        delete (window as unknown as { electronAPI?: unknown }).electronAPI
    })

    it('returns clawhost for desktop (electron)', () => {
        ;(window as unknown as { electronAPI?: unknown }).electronAPI = {}
        expect(getBaseDomain()).toBe('clawhost')
    })

    it('returns clawhost.cloud for localhost', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'localhost' },
            writable: true
        })
        expect(getBaseDomain()).toBe('clawhost.cloud')
    })

    it('returns clawhost.cloud for 127.0.0.1', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: '127.0.0.1' },
            writable: true
        })
        expect(getBaseDomain()).toBe('clawhost.cloud')
    })

    it('returns agents.clawnode.de for clawnode.de', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'clawnode.de' },
            writable: true
        })
        expect(getBaseDomain()).toBe('agents.clawnode.de')
    })

    it('returns agents.clawnode.de for app.clawnode.de', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.clawnode.de' },
            writable: true
        })
        expect(getBaseDomain()).toBe('agents.clawnode.de')
    })

    it('returns actual hostname for production', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.clawhost.cloud' },
            writable: true
        })
        expect(getBaseDomain()).toBe('app.clawhost.cloud')
    })
})