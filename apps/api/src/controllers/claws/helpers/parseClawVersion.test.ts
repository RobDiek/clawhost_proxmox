import { parseClawVersion } from '@/controllers/claws/helpers'

describe('parseClawVersion', () => {
    it('parses a standard version string', () => {
        expect(parseClawVersion('2024.1.15')).toEqual([2024, 1, 15, 0])
    })

    it('parses a version with build number', () => {
        expect(parseClawVersion('2024.12.3-42')).toEqual([2024, 12, 3, 42])
    })

    it('returns zeros for invalid input', () => {
        expect(parseClawVersion('invalid')).toEqual([0, 0, 0, 0])
    })

    it('returns zeros for empty string', () => {
        expect(parseClawVersion('')).toEqual([0, 0, 0, 0])
    })

    it('parses version embedded in other text', () => {
        expect(parseClawVersion('OpenClaw v2025.3.1-5 stable')).toEqual([
            2025, 3, 1, 5
        ])
    })
})