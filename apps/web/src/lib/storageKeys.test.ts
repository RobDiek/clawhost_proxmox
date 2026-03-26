import STORAGE_KEYS from '@/lib/storageKeys'

describe('STORAGE_KEYS', () => {
    it('has all expected keys', () => {
        expect(STORAGE_KEYS.PREFERENCES).toBe('ch-preferences')
        expect(STORAGE_KEYS.AUTH).toBe('ch-auth')
        expect(STORAGE_KEYS.PROFILE).toBe('ch-profile')
        expect(STORAGE_KEYS.OTP_SENT_AT).toBe('ch-otp-sent-at')
        expect(STORAGE_KEYS.PH_BANNER_DISMISSED).toBe('ch-ph-banner-dismissed')
    })

    it('all keys are prefixed with ch-', () => {
        for (const value of Object.values(STORAGE_KEYS)) {
            expect(value.startsWith('ch-')).toBe(true)
        }
    })
})