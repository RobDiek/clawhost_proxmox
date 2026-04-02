import { generateServerName } from '@/controllers/claws/helpers'

describe('generateServerName', () => {
    it('starts with the given name', () => {
        const result = generateServerName('my-claw', 'abcdef1234567890')
        expect(result.startsWith('my-claw-')).toBe(true)
    })

    it('includes first 8 chars of id', () => {
        const result = generateServerName('test', 'abcdef1234567890')
        expect(result).toContain('abcdef12')
    })

    it('replaces invalid characters with hyphens', () => {
        const result = generateServerName('my claw!', 'abcdef1234567890')
        expect(result).toMatch(/^[a-zA-Z0-9-]+$/)
    })

    it('produces a non-empty string', () => {
        const result = generateServerName('claw', 'id123456')
        expect(result.length).toBeGreaterThan(0)
    })
})