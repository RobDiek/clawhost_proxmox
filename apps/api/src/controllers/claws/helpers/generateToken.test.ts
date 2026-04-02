import { generateToken } from '@/controllers/claws/helpers'

describe('generateToken', () => {
    it('generates a 64-character hex string', () => {
        const token = generateToken()
        expect(token).toHaveLength(64)
        expect(token).toMatch(/^[0-9a-f]+$/)
    })

    it('generates unique tokens', () => {
        const tokens = new Set(
            Array.from({ length: 20 }, () => generateToken())
        )
        expect(tokens.size).toBe(20)
    })
})