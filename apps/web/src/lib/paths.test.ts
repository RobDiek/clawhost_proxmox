import { PATHS } from '@/lib'

describe('PATHS', () => {
    it('has HOME as /', () => {
        expect(PATHS.HOME).toBe('/')
    })

    it('has all expected path segments', () => {
        expect(PATHS.LOGIN).toBe('login')
        expect(PATHS.CLAWS).toBe('claws')
        expect(PATHS.SSH_KEYS).toBe('ssh-keys')
        expect(PATHS.ACCOUNT).toBe('account')
        expect(PATHS.BILLING).toBe('billing')
        expect(PATHS.BLOG).toBe('blog')
        expect(PATHS.TERMS).toBe('terms')
        expect(PATHS.PRIVACY).toBe('privacy')
        expect(PATHS.CHANGELOG).toBe('changelog')
        expect(PATHS.COMPARE).toBe('full-comparison')
        expect(PATHS.GO).toBe('go')
        expect(PATHS.LICENSE).toBe('license')
    })

    it('does not have leading slashes on non-HOME paths', () => {
        const entries = Object.entries(PATHS).filter(([key]) => key !== 'HOME')
        for (const [, value] of entries) {
            expect(value).not.toMatch(/^\//)
        }
    })
})