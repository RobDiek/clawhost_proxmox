import { generateSlug } from '@/controllers/claws/helpers'

describe('generateSlug', () => {
    it('generates an 8-character slug', () => {
        const slug = generateSlug('test-id-123')
        expect(slug).toHaveLength(8)
    })

    it('is deterministic for the same input', () => {
        const a = generateSlug('same-id')
        const b = generateSlug('same-id')
        expect(a).toBe(b)
    })

    it('produces different slugs for different inputs', () => {
        const a = generateSlug('id-one')
        const b = generateSlug('id-two')
        expect(a).not.toBe(b)
    })

    it('only contains lowercase alphanumeric characters', () => {
        const validChars = 'abcdefghjkmnpqrstuvwxyz23456789'
        const slug = generateSlug('any-id')
        for (const char of slug) {
            expect(validChars).toContain(char)
        }
    })
})