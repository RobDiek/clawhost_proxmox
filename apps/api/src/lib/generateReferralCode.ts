import { inputValidation } from '@openclaw/shared'

const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const generateReferralCode = (): string => {
    const length = inputValidation.REFERRAL_CODE.DEFAULT_LENGTH
    let code = ''
    for (let i = 0; i < length; i++) {
        code += CHARSET[Math.floor(Math.random() * CHARSET.length)]
    }
    return code
}

export default generateReferralCode