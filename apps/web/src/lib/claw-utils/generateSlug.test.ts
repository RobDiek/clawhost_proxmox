import { generateSlug } from '@/lib/claw-utils'

describe('generateSlug (client)', () => {
    it('generates a 7-character slug', () => {
        expect(generateSlug('test-id')).toHaveLength(7)
    })

    it('is deterministic for the same input', () => {
        expect(generateSlug('my-id')).toBe(generateSlug('my-id'))
    })

    it('produces different slugs for different inputs', () => {
        expect(generateSlug('id-one')).not.toBe(generateSlug('id-two'))
    })

    it('only contains valid characters', () => {
        const validChars = 'abcdefghjkmnpqrstuvwxyz23456789'
        const slug = generateSlug('some-id')
        for (const char of slug) {
            expect(validChars).toContain(char)
        }
    })
})