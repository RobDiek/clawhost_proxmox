import { getBaseDomain } from '@/lib'

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

    it('returns actual hostname for production', () => {
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.clawhost.cloud' },
            writable: true
        })
        expect(getBaseDomain()).toBe('app.clawhost.cloud')
    })
})