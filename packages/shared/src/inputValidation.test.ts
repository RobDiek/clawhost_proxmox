import { inputValidation } from '#shared/index'

describe('inputValidation', () => {
    it('has CLAW_NAME max of 50', () => {
        expect(inputValidation.CLAW_NAME.MAX).toBe(50)
    })

    it('has EMAIL max of 320', () => {
        expect(inputValidation.EMAIL.MAX).toBe(320)
    })

    it('has SUBDOMAIN min of 3 and max of 20', () => {
        expect(inputValidation.SUBDOMAIN.MIN).toBe(3)
        expect(inputValidation.SUBDOMAIN.MAX).toBe(20)
    })

    it('has VOLUME_SIZE min of 10 and max of 10240', () => {
        expect(inputValidation.VOLUME_SIZE.MIN).toBe(10)
        expect(inputValidation.VOLUME_SIZE.MAX).toBe(10240)
    })

    it('has OTP_MAX_ATTEMPTS of 5', () => {
        expect(inputValidation.OTP_MAX_ATTEMPTS.MAX).toBe(5)
    })

    it('has SSH_KEY_PUBLIC_KEY max of 10000', () => {
        expect(inputValidation.SSH_KEY_PUBLIC_KEY.MAX).toBe(10000)
    })

    it('has MIN_MEMORY_GB of 4', () => {
        expect(inputValidation.MIN_MEMORY_GB.MIN).toBe(4)
    })

    it('has all expected fields defined', () => {
        const keys = Object.keys(inputValidation)
        expect(keys).toContain('CLAW_NAME')
        expect(keys).toContain('USER_NAME')
        expect(keys).toContain('SSH_KEY_NAME')
        expect(keys).toContain('FILE_CONTENT')
        expect(keys).toContain('ENV_VAR_KEY')
        expect(keys).toContain('ENV_VAR_VALUE')
    })
})