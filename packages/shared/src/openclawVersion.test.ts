import { OPENCLAW_VERSION } from '#shared/index'

describe('OPENCLAW_VERSION', () => {
    it('is a non-empty string', () => {
        expect(typeof OPENCLAW_VERSION).toBe('string')
        expect(OPENCLAW_VERSION.length).toBeGreaterThan(0)
    })

    it('matches version format YYYY.M.D', () => {
        expect(OPENCLAW_VERSION).toMatch(/^\d{4}\.\d{1,2}\.\d{1,2}$/)
    })
})