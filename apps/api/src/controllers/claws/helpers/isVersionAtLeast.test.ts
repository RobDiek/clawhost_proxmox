import { isVersionAtLeast } from '@/controllers/claws/helpers'

describe('isVersionAtLeast', () => {
    it('returns true when versions are equal', () => {
        expect(isVersionAtLeast('2024.1.0', '2024.1.0')).toBe(true)
    })

    it('returns true when current is newer (year)', () => {
        expect(isVersionAtLeast('2025.1.0', '2024.1.0')).toBe(true)
    })

    it('returns true when current is newer (month)', () => {
        expect(isVersionAtLeast('2024.6.0', '2024.1.0')).toBe(true)
    })

    it('returns true when current is newer (patch)', () => {
        expect(isVersionAtLeast('2024.1.5', '2024.1.0')).toBe(true)
    })

    it('returns false when current is older', () => {
        expect(isVersionAtLeast('2024.1.0', '2025.1.0')).toBe(false)
    })

    it('returns false when current is older (minor)', () => {
        expect(isVersionAtLeast('2024.1.0', '2024.6.0')).toBe(false)
    })

    it('handles build numbers', () => {
        expect(isVersionAtLeast('2024.1.0-10', '2024.1.0-5')).toBe(true)
        expect(isVersionAtLeast('2024.1.0-3', '2024.1.0-5')).toBe(false)
    })

    it('returns false for invalid current version', () => {
        expect(isVersionAtLeast('invalid', '2024.1.0')).toBe(false)
    })
})