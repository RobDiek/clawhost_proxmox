import { generatePassword } from '@/controllers/claws/helpers'

describe('generatePassword', () => {
    it('generates a password of default length 16', () => {
        const pw = generatePassword()
        expect(pw).toHaveLength(16)
    })

    it('generates a password of custom length', () => {
        const pw = generatePassword(32)
        expect(pw).toHaveLength(32)
    })

    it('only contains valid characters', () => {
        const validChars =
            'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
        const pw = generatePassword(100)
        for (const char of pw) {
            expect(validChars).toContain(char)
        }
    })

    it('generates unique passwords', () => {
        const passwords = new Set(
            Array.from({ length: 20 }, () => generatePassword())
        )
        expect(passwords.size).toBe(20)
    })
})