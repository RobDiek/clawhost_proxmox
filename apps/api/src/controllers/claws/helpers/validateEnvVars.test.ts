import { validateEnvVars } from '@/controllers/claws/helpers'

describe('validateEnvVars', () => {
    it('accepts valid env vars', () => {
        expect(validateEnvVars({ NODE_ENV: 'production', PORT: '3000' })).toBe(
            true
        )
    })

    it('accepts empty object', () => {
        expect(validateEnvVars({})).toBe(true)
    })

    it('accepts keys starting with underscore', () => {
        expect(validateEnvVars({ _PRIVATE: 'value' })).toBe(true)
    })

    it('rejects keys starting with numbers', () => {
        expect(validateEnvVars({ '1BAD': 'value' })).toBe(false)
    })

    it('rejects keys with special characters', () => {
        expect(validateEnvVars({ 'MY-VAR': 'value' })).toBe(false)
        expect(validateEnvVars({ 'MY.VAR': 'value' })).toBe(false)
    })

    it('rejects keys exceeding max length', () => {
        const longKey = 'A'.repeat(257)
        expect(validateEnvVars({ [longKey]: 'value' })).toBe(false)
    })

    it('rejects values exceeding max length', () => {
        const longValue = 'x'.repeat(10001)
        expect(validateEnvVars({ KEY: longValue })).toBe(false)
    })
})