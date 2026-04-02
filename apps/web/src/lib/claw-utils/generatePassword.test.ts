import { generatePassword } from '@/lib/claw-utils'

describe('generatePassword (client)', () => {
    it('generates a password of default length 16', () => {
        expect(generatePassword()).toHaveLength(16)
    })

    it('generates a password of custom length', () => {
        expect(generatePassword(32)).toHaveLength(32)
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